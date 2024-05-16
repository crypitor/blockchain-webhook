import { TopicName } from '@app/utils/topicUtils';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ethers } from 'ethers';
import { BlockSyncService } from '../modules/blocksync/blocksync.service';
import { SupportedChain } from '@app/utils/supportedChain.util';
import { BlockTransportDto } from '@app/utils/dto/transport.dto';

@Injectable()
export class AvaxPollingBlockService {
  private detectInfo = { flag: false, blockNumber: 0 };

  private readonly logger = new Logger(AvaxPollingBlockService.name);

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly blockSyncService: BlockSyncService,
    @Inject('WORKER_CLIENT_SERVICE')
    private readonly workerClient: ClientKafka,
  ) {}

  rpcUrl: string;
  provider: ethers.Provider;

  onModuleInit() {
    this.logger.log(`The module has been initialized.`);
    if (process.env.AVAX_DISABLE === 'true') {
      this.detectInfo.flag = true;
      return;
    }
    this.rpcUrl = process.env.AVAX_PROVIDER_URL;
    this.provider = new ethers.JsonRpcProvider(
      process.env.AVAX_PROVIDER_URL,
      null,
      { staticNetwork: true },
    );
    this.init();
  }

  async init() {
    this.detectInfo.flag = true;
    let blockSync = await this.blockSyncService.findOne(this.rpcUrl);
    if (!blockSync) {
      blockSync = await this.blockSyncService.create({
        rpcUrl: this.rpcUrl,
        chain: SupportedChain.AVALANCHE.name,
        lastSync: await this.getBlockNumber(),
      });
    }
    // checking force latest block config
    const startBlockConfig = process.env.AVAX_START_BLOCK_CONFIG;
    if (startBlockConfig === 'latest') {
      const latestBlockNumber = await this.provider.getBlockNumber();
      this.logger.warn(
        'force running latest block from network ' + latestBlockNumber,
      );
      this.updateLastSyncBlock(latestBlockNumber);
      // if start at latest block, we need to minus 1
      // we suppose that we already scan at (latest block - 1)
      this.detectInfo.blockNumber = latestBlockNumber - 1;
    } else if (startBlockConfig === 'config') {
      this.logger.warn(
        'force running start block from config ' + process.env.AVAX_START_BLOCK,
      );
      this.updateLastSyncBlock(parseInt(process.env.AVAX_START_BLOCK));
      // if we start at config block, we suppose that we already scan at (config block - 1)
      this.detectInfo.blockNumber = parseInt(process.env.AVAX_START_BLOCK) - 1;
    } else {
      this.logger.warn('running start block from db ' + blockSync.lastSync);
      // if we start at db block, we suppose that we already scan at db block
      this.detectInfo.blockNumber =
        blockSync.lastSync + SupportedChain.AVALANCHE.confirmationBlock;
    }
    this.detectInfo.flag = false;
    this.addCronJob('AvaxPollingBlock', CronExpression.EVERY_5_SECONDS);
  }

  addCronJob(name: string, seconds: string) {
    const job = new CronJob(seconds, () => this.pollingBlock());

    this.schedulerRegistry.addCronJob(name, job);
    job.start();

    this.logger.warn(`job ${name} added for each ${seconds} seconds!`);
  }

  private async updateLastSyncBlock(blockNumber: number): Promise<void> {
    // Update the last sync block in MongoDB
    await this.blockSyncService.updateLastSync(this.rpcUrl, blockNumber);
  }

  async pollingBlock() {
    this.logger.debug('Start polling block number');
    if (this.detectInfo.flag) {
      this.logger.error('conflict with last job. quit current job');
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
        this.logger.log(`last emitted block ${blockNumber}`);

        // emit event detect block with blocknumber
        this.workerClient.emit(
          TopicName.AVAX_DETECTED_BLOCK,
          new BlockTransportDto(blockNumber, false),
        );
        // emit event confirm block with block number - confirm block
        this.workerClient.emit(
          TopicName.AVAX_DETECTED_BLOCK,
          new BlockTransportDto(
            blockNumber - SupportedChain.AVALANCHE.confirmationBlock,
            true,
          ),
        );

        this.detectInfo.blockNumber = blockNumber;

        //only update last sync for confirm
        await this.updateLastSyncBlock(
          blockNumber - SupportedChain.AVALANCHE.confirmationBlock,
        );
      } catch (error) {
        this.logger.error([`Error polling block ${blockNumber}:`, error]);
        break;
      }
    }

    this.detectInfo.flag = false;
    return;
  }

  private async getBlockNumber(): Promise<number> {
    try {
      // Perform an asynchronous operation (e.g., fetching data)
      const blockNumber = await Promise.race([
        this.provider.getBlockNumber(), // Your asynchronous operation
        delay(5000).then(() => {
          throw new Error('Get block number Timeout');
        }), // Timeout promise
      ]);
      this.logger.log('got latest block from network: ' + blockNumber);
      return blockNumber;
    } catch (error) {
      this.logger.error('error while getting block number', error);
    }
    return 0;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}