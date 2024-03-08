import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Log, ethers } from 'ethers';
import { BlockSyncService } from 'src/modules/blocksync/blocksync.service';
import { ERC721Service } from 'src/modules/erc721/erc721.service';
import { EthWebhookService } from '../eth.webhook.service';

// @todo define webhook dto interface for ethereum
interface WebhookDto extends ReadableStream {
  contract: {
    address: string;
    name: string;
    symbol: string;
  };
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  tokenId: string;
  type: 'in' | 'out';
  action: 'detected' | 'confirmed';
}

interface ScanInfo {
  flag: boolean;
  blockNumber: number;
}

@Injectable()
export class EthereumWorker {
  private readonly logger = new Logger(EthereumWorker.name);
  private readonly confirmBlock = 12;
  private detectInfo: ScanInfo = { flag: false, blockNumber: 0 };
  private confirmInfo: ScanInfo = { flag: false, blockNumber: 0 };
  rpcUrl: string;
  provider: ethers.Provider;
  blockSyncService: BlockSyncService;
  ethWebhookService: EthWebhookService;
  erc721Service: ERC721Service;

  constructor(
    blockSyncService: BlockSyncService,
    ethWebhookService: EthWebhookService,
    erc721Service: ERC721Service,
  ) {
    if (process.env.EVM_DISABLE === 'true') {
      return;
    }
    this.rpcUrl = process.env.ETH_PROVIDER_URL;
    this.provider = new ethers.JsonRpcProvider(process.env.ETH_PROVIDER_URL);
    this.blockSyncService = blockSyncService;
    this.ethWebhookService = ethWebhookService;
    this.erc721Service = erc721Service;
    this.initWorker();
  }

  async initWorker() {
    this.detectInfo.flag = true;
    this.confirmInfo.flag = true;
    let blockSync = await this.blockSyncService.findOne(this.rpcUrl);
    if (!blockSync) {
      blockSync = await this.blockSyncService.create({
        rpcUrl: this.rpcUrl,
        lastSync: parseInt(process.env.EVM_START_BLOCK),
      });
    }
    // checking force latest block config
    const startBlockConfig = process.env.EVM_START_BLOCK_CONFIG;
    if (startBlockConfig === 'latest') {
      const latestBlockNumber = await this.provider.getBlockNumber();
      this.logger.warn(
        'force running latest block from network ' + latestBlockNumber,
      );
      this.blockSyncService.updateLastSync(this.rpcUrl, latestBlockNumber);
      this.detectInfo.blockNumber = latestBlockNumber;
      this.confirmInfo.blockNumber = latestBlockNumber;
    } else if (startBlockConfig === 'config') {
      this.logger.warn(
        'force running start block from config ' + process.env.EVM_START_BLOCK,
      );
      this.updateLastSyncBlock(parseInt(process.env.EVM_START_BLOCK));
      this.detectInfo.blockNumber = parseInt(process.env.EVM_START_BLOCK);
      this.confirmInfo.blockNumber = parseInt(process.env.EVM_START_BLOCK);
    } else {
      this.logger.warn('running start block from db ' + blockSync.lastSync);
      this.detectInfo.blockNumber = blockSync.lastSync;
      this.confirmInfo.blockNumber = blockSync.lastSync;
    }
    this.detectInfo.flag = false;
    this.confirmInfo.flag = false;
  }

  @Cron(CronExpression.EVERY_10_SECONDS, {
    disabled: process.env.EVM_DISABLE === 'true',
  })
  async detect() {
    if (this.detectInfo.flag) {
      return;
    }
    this.detectInfo.flag = true;

    const lastDetectedBlock = this.detectInfo.blockNumber + 1;

    // Get the latest block number
    const latestDetectedBlockNumber = await this.getBlockNumber();

    // Scan each block
    for (
      let blockNumber = lastDetectedBlock;
      blockNumber <= latestDetectedBlockNumber;
      blockNumber++
    ) {
      try {
        this.logger.debug(['DETECT', `Scanning block ${blockNumber}`]);
        // Retrieve the block
        // const block = await this.provider.getBlock(blockNumber);

        // Retrieve transfer event the block's logs
        const logs = await this.provider.getLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        });

        // handle extracted event for erc20 and nft
        logs.forEach((event) => {
          if (event.topics.length === 3) {
            this.handleErc20Transfer(event, 'detected');
          } else if (event.topics.length === 4) {
            this.handleNftTransfer(event, 'detected');
          }
        });
        this.detectInfo.blockNumber = blockNumber;
        //only update last sync for confirm
        // await this.updateLastSyncBlock(blockNumber);
      } catch (error) {
        this.logger.error([
          'DETECT',
          `Error scanning block ${blockNumber}:`,
          error,
        ]);
        break;
      }
    }

    this.detectInfo.flag = false;
    return;
  }

  @Cron(CronExpression.EVERY_10_SECONDS, {
    disabled: process.env.EVM_DISABLE === 'true',
  })
  async confirm() {
    if (this.confirmInfo.flag) {
      return;
    }
    this.confirmInfo.flag = true;

    const lastConfirmedBlock = this.confirmInfo.blockNumber + 1;

    // Get the latest block number
    const latestConfirmedBlockNumber =
      (await this.getBlockNumber()) - this.confirmBlock;

    // Scan each block
    for (
      let blockNumber = lastConfirmedBlock;
      blockNumber <= latestConfirmedBlockNumber;
      blockNumber++
    ) {
      try {
        this.logger.debug(['CONFIRM', `Scanning block ${blockNumber}`]);

        // Retrieve transfer event the block's logs
        const logs = await this.provider.getLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        });

        // handle extracted event for erc20 and nft
        logs.forEach((event) => {
          if (event.topics.length === 3) {
            this.handleErc20Transfer(event, 'confirmed');
          } else if (event.topics.length === 4) {
            this.handleNftTransfer(event, 'confirmed');
          }
        });
        this.confirmInfo.blockNumber = blockNumber;
        await this.updateLastSyncBlock(blockNumber);
      } catch (error) {
        this.logger.error([
          'CONFIRM',
          `Error scanning block ${blockNumber}:`,
          error,
        ]);
        break;
      }
    }

    this.confirmInfo.flag = false;
    return;
  }

  async handleNftTransfer(event: Log, action: 'detected' | 'confirmed') {
    // Extract relevant information from the event
    const contractAddress = ethers.getAddress(event.address).toLowerCase();
    const fromAddress = ethers
      .getAddress(event.topics[1].substring(26))
      .toLowerCase();
    const toAddress = ethers
      .getAddress(event.topics[2].substring(26))
      .toLowerCase();
    const tokenId = ethers.toBigInt(event.topics[3]).toString();

    // handle from wallet
    const fromWallet = await this.ethWebhookService.findOne(fromAddress);
    if (fromWallet) {
      // @todo change webhookDTO to general dto
      const body = {
        contract: {
          address: contractAddress,
        },
        transactionHash: event.transactionHash,
        fromAddress: fromAddress,
        toAddress: toAddress,
        tokenId: tokenId,
        type: 'out',
        action: action,
      } as WebhookDto;

      // @todo send message to webhook module to deliver for user
      await this.sendMessage(fromWallet.notificationMethods[0].url, body);

      this.logger.debug(
        action + ' nft transfer OUT with database: ' + JSON.stringify(body),
      );
    }

    // @todo handle multiple webhook connected with 1 address
    const toWallet = await this.ethWebhookService.findOne(toAddress);
    if (toWallet) {
      // @todo change webhookDTO to general dto
      const body = {
        contract: {
          address: contractAddress,
        },
        transactionHash: event.transactionHash,
        fromAddress: fromAddress,
        toAddress: toAddress,
        tokenId: tokenId,
        type: 'in',
        action: action,
      } as WebhookDto;

      // @todo send message to webhook module to deliver for user
      await this.sendMessage(toWallet.notificationMethods[0].url, body);

      this.logger.debug(
        action + ' nft transfer OUT with database: ' + JSON.stringify(body),
      );
    }
  }

  async handleErc20Transfer(event: Log, action: 'detected' | 'confirmed') {
    // Extract relevant information from the event
    const contractAddress = ethers.getAddress(event.address).toLowerCase();
    const fromAddress = ethers
      .getAddress(event.topics[1].substring(26))
      .toLowerCase();
    const toAddress = ethers
      .getAddress(event.topics[2].substring(26))
      .toLowerCase();
    const value = ethers.toBigInt(event.data).toString();

    // handle from wallet
    const fromWallet = await this.ethWebhookService.findOne(fromAddress);
    if (fromWallet) {
      // @todo change webhookDTO to general dto
      const body = {
        contract: {
          address: contractAddress,
        },
        transactionHash: event.transactionHash,
        fromAddress: fromAddress,
        toAddress: toAddress,
        tokenId: value,
        type: 'out',
        action: action,
      } as WebhookDto;

      // @todo send message to webhook module to deliver for user
      await this.sendMessage(fromWallet.notificationMethods[0].url, body);

      this.logger.debug(
        action + ' ERC20 transfer OUT: ' + JSON.stringify(body),
      );
    }

    // handle to wallet
    const toWallet = await this.ethWebhookService.findOne(toAddress);
    if (toWallet) {
      // @todo change webhookDTO to general dto
      const body = {
        contract: {
          address: contractAddress,
        },
        transactionHash: event.transactionHash,
        fromAddress: fromAddress,
        toAddress: toAddress,
        tokenId: value,
        type: 'in',
        action: action,
      } as WebhookDto;

      // @todo send message to webhook module to deliver for user
      await this.sendMessage(toWallet.notificationMethods[0].url, body);

      this.logger.debug(
        action + ' nft transfer OUT with database: ' + JSON.stringify(body),
      );
    }
  }

  async updateLastSyncBlock(blockNumber: number): Promise<void> {
    // Update the last sync block in MongoDB
    await this.blockSyncService.updateLastSync(this.rpcUrl, blockNumber);
  }

  async getLastSyncBlock(): Promise<number> {
    // Get the last sync block from MongoDB
    const lastSyncBlock = await this.blockSyncService.findOne(this.rpcUrl);
    return lastSyncBlock?.lastSync;
  }

  async getBlockNumber(): Promise<number> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      return blockNumber;
    } catch (error) {
      this.logger.error('error while getting block number', error);
    }
    return 0;
  }

  async sendMessage(url: string, message: WebhookDto): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      this.logger.error('error while sending webhook request', error);
    }
  }
}
