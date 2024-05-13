import { PolygonBlockHistoryRepository } from '@app/shared_modules/block_history/repositories/block_history.repository';
import { MonitorNetwork } from '@app/shared_modules/monitor/schemas/monitor.schema';
import { TopicName } from '@app/utils/topicUtils';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { Block, ethers, Log } from 'ethers';

@Injectable()
export class PolygonWorker {
  private readonly logger = new Logger(PolygonWorker.name);
  rpcUrl: string;
  provider: ethers.Provider;
  @Inject('MONITOR_CLIENT_SERVICE')
  private readonly monitorClient: ClientKafka;

  @Inject('WORKER_CLIENT_SERVICE')
  private readonly workerClient: ClientKafka;

  @Inject()
  private readonly blockHistoryRepository: PolygonBlockHistoryRepository;

  constructor() {
    if (process.env.POLYGON_PROVIDER_URL) {
      this.rpcUrl = process.env.POLYGON_PROVIDER_URL;
      this.provider = new ethers.JsonRpcProvider(
        process.env.POLYGON_PROVIDER_URL,
        null,
        { staticNetwork: true },
      );
    }
  }

  async ethHandleDetectedBlock(data: { blockNumber: number; retry: number }) {
    const start = Date.now();
    const blockNumber = data.blockNumber;
    if (!blockNumber) {
      this.logger.error(
        'receive invalid message with block number is undefined',
      );
      return;
    }
    try {
      // Retrieve all transaction in block
      const startGetBlock = Date.now();
      const block = await this.provider.getBlock(blockNumber, true);
      const endGetBlock = Date.now();

      // Retrieve transfer event the block's logs
      const startGetLogs = Date.now();
      const logs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        ],
      });
      const endGetLogs = Date.now();

      const emitStart = Date.now();
      // handle native transfer
      await this.emitNativeTransaction(block, false);
      // handle extracted event for erc20 and nft
      await this.emitLog(logs, false);
      const emitEnd = Date.now();
      //only update last sync for confirm
      await this.saveBlockHistory(blockNumber, false);
      this.logger.log(
        `DETECT  Scanning block ${blockNumber} in ${
          Date.now() - start
        }ms with emit ${emitEnd - emitStart}ms and getBlock ${
          endGetBlock - startGetBlock
        }ms and getLogs ${endGetLogs - startGetLogs}ms`,
      );
    } catch (error) {
      this.logger.error([
        'DETECT',
        `Error scanning block ${blockNumber}:`,
        error,
      ]);
      await this.saveBlockHistory(
        blockNumber,
        false,
        true,
        error,
        data.retry + 1 || 1,
      );
    }

    return;
  }

  async ethHandleConfirmedBlock(data: { blockNumber: number; retry: number }) {
    const start = Date.now();
    const blockNumber = data.blockNumber;
    if (!blockNumber) {
      this.logger.error(
        'receive invalid message with block number is undefined',
      );
      return;
    }
    try {
      // Retrieve all transaction in block
      const startGetBlock = Date.now();
      const block = await this.provider.getBlock(blockNumber, true);
      const endGetBlock = Date.now();

      // Retrieve transfer event the block's logs
      const startGetLogs = Date.now();
      const logs = await this.provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        ],
      });
      const endGetLogs = Date.now();

      const emitStart = Date.now();
      // handle native transfer
      await this.emitNativeTransaction(block, true);
      // handle extracted event for erc20 and nft
      await this.emitLog(logs, true);
      const emitEnd = Date.now();
      await this.saveBlockHistory(blockNumber, true);
      this.logger.log(
        `CONFIRM Scanning block ${blockNumber} in ${
          Date.now() - start
        }ms with emit ${emitEnd - emitStart}ms and getBlock ${
          endGetBlock - startGetBlock
        }ms and getLogs ${endGetLogs - startGetLogs}ms`,
      );
    } catch (error) {
      this.logger.error([
        'CONFIRM',
        `Error scanning block ${blockNumber}:`,
        error,
      ]);
      await this.saveBlockHistory(
        blockNumber,
        true,
        true,
        error,
        data.retry + 1 || 1,
      );
    }
    return;
  }

  private async emitLog(logs: Log[], confirm: boolean): Promise<void> {
    // handle extracted event for erc20 and nft
    logs.forEach((event) => {
      if (event.topics.length === 3) {
        this.logger.debug(`emit event on ERC20 ${JSON.stringify(event)}`);
        this.monitorClient.emit(TopicName.POLYGON_ERC20_TRANSFER, {
          event: event,
          confirm: confirm,
        });
      } else if (event.topics.length === 4) {
        this.logger.debug(`emit event on ERC721 ${JSON.stringify(event)}`);
        this.monitorClient.emit(TopicName.POLYGON_ERC721_TRANSFER, {
          event: event,
          confirm: confirm,
        });
      }
    });
  }

  private async emitNativeTransaction(
    block: Block,
    confirm: boolean,
  ): Promise<void> {
    if (block === null) {
      this.logger.error('get block from network return null');
      throw new Error('get block from network return null');
    }
    // handle extracted event for native
    block.prefetchedTransactions.forEach((transaction) => {
      this.logger.debug(`emit event on NATIVE ${JSON.stringify(transaction)}`);
      this.monitorClient.emit(TopicName.POLYGON_NATIVE_TRANSFER, {
        transaction: transaction,
        confirm: confirm,
      });
    });
  }

  private async saveBlockHistory(
    blockNumber: number,
    confirm: boolean,
    isError?: boolean,
    error?: any,
    retry?: number,
  ): Promise<void> {
    if (isError && retry < 3) {
      this.logger.warn(
        `emit error block ${blockNumber} to kafka with retry ${retry}`,
      );
      if (confirm) {
        this.workerClient.emit(TopicName.POLYGON_CONFIRMED_BLOCK, {
          key: 'error',
          value: {
            blockNumber: blockNumber,
            retry: retry,
            error: error,
          },
        });
      } else {
        this.workerClient.emit(TopicName.POLYGON_DETECTED_BLOCK, {
          key: 'error',
          value: {
            blockNumber: blockNumber,
            retry: retry,
            error: error,
          },
        });
      }
    }
    this.logger.debug(`save block history ${blockNumber}`);
    await this.blockHistoryRepository.saveBlockHistory({
      blockNumber: blockNumber,
      chain: MonitorNetwork.Ethereum,
      confirmed: confirm,
      isError: isError || false,
      errorDetail: error !== undefined ? JSON.stringify(error) : '',
      retry: retry || 0,
      dateCreated: new Date(),
    });
  }
}
