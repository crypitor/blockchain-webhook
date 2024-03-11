import { Inject, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { CreateEthMonitorDto } from './dto/eth.create-monitor.dto';
import { EthMonitor, MonitoringType } from './schemas/eth.monitor.schema';
import { v4 as uuidv4 } from 'uuid';
import { Log, ethers } from 'ethers';
import {
  WebhookDeliveryDto,
  WebhookType,
} from './dto/eth.webhook-delivery.dto';
import { chainName } from 'src/utils/chainNameUtils';

@Injectable()
export class EthMonitorService {
  private readonly logger = new Logger(EthMonitorService.name);
  constructor(
    @Inject('ETH_MONITOR_MODEL')
    private readonly ethMonitorModel: Model<EthMonitor>,
  ) {}

  async create(
    user: any,
    createEthMonitorDto: CreateEthMonitorDto,
  ): Promise<EthMonitor> {
    const createdEthMonitor = new this.ethMonitorModel({
      ...createEthMonitorDto,
      userId: user.userId,
      monitorId: uuidv4(),
    });
    try {
      return await createdEthMonitor.save();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all EthMonitor.
   *
   * @returns {EthMonitor[]}
   */
  async findAll(): Promise<EthMonitor[]> {
    return this.ethMonitorModel.find().exec();
  }

  /**
   * Get all EthMonitor.
   *
   * @returns {EthMonitor[]}
   */
  async findAllByAddress(address: string): Promise<EthMonitor[]> {
    return this.ethMonitorModel.find({ address: address }).exec();
  }

  /**
   * Find a single EthMonitor by their address.
   *
   * @param address The EthMonitor address to filter by.
   * @returns {EthMonitor}
   */
  async findOne(address: string): Promise<EthMonitor | undefined> {
    return this.ethMonitorModel.findOne({ address: address });
  }

  async deleteOne(monitorId: string): Promise<void> {
    try {
      await this.ethMonitorModel.deleteOne({ monitorId: monitorId });
    } catch (error) {
      throw error;
    }
  }

  async handleErc20Transfer(event: Log, confirm: boolean) {
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
    const fromWallet = await this.findAllByAddress(fromAddress);
    if (fromWallet) {
      this.handleMatchConditionERC20(
        fromWallet,
        confirm,
        event,
        value,
        WebhookType.out,
      );
    }

    // handle to wallet
    const toWallet = await this.findAllByAddress(toAddress);
    if (toWallet) {
      this.handleMatchConditionERC20(
        toWallet,
        confirm,
        event,
        value,
        WebhookType.in,
      );
    }
  }

  async handleErc721Transfer(event: Log, confirm: boolean) {
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
    const fromWallet = await this.findAllByAddress(fromAddress);
    if (fromWallet) {
      this.handleMatchConditionERC721(
        fromWallet,
        confirm,
        event,
        tokenId,
        WebhookType.out,
      );
    }

    // handle to wallet
    const toWallet = await this.findAllByAddress(toAddress);
    if (toWallet) {
      this.handleMatchConditionERC721(
        toWallet,
        confirm,
        event,
        tokenId,
        WebhookType.in,
      );
    }
  }

  private async handleMatchConditionERC721(
    monitors: EthMonitor[],
    confirm: boolean,
    event: Log,
    tokenId: string,
    type: WebhookType,
  ) {
    // @todo check condition of monitor and event log if it match
    for (const monitor of monitors) {
      // ignore monitor condition on erc721
      if (!monitor.condition.erc721) {
        continue;
      }
      if (
        monitor.type !== MonitoringType.ALL ||
        monitor.type.toString() !== type.toString()
      ) {
        continue;
      }
      // @todo check condition on specific cryptos
      const body = WebhookDeliveryDto.fromLogToERC721(
        event,
        chainName.ETH,
        monitor.monitorId,
        type,
        confirm,
        tokenId,
      );

      await this.sendMessage(monitor, body);

      this.logger.debug(
        `Confirmed: ${confirm} ERC721 transfer ${type.toUpperCase()}:\n${JSON.stringify(
          body,
        )}`,
      );
    }
  }

  private async handleMatchConditionERC20(
    monitors: EthMonitor[],
    confirm: boolean,
    event: Log,
    value: string,
    type: WebhookType,
  ) {
    // @todo check condition of monitor and event log if it match
    for (const monitor of monitors) {
      // ignore monitor condition on erc20
      if (!monitor.condition.erc20) {
        continue;
      }
      if (
        monitor.type !== MonitoringType.ALL ||
        monitor.type.toString() !== type.toString()
      ) {
        continue;
      }
      // @todo check condition on specific cryptos
      const body = WebhookDeliveryDto.fromLogToERC20(
        event,
        chainName.ETH,
        monitor.monitorId,
        type,
        confirm,
        value,
      );

      await this.sendMessage(monitor, body);

      this.logger.debug(
        `Confirmed: ${confirm} ERC20 transfer ${type.toUpperCase()}:\n${JSON.stringify(
          body,
        )}`,
      );
    }
  }

  private async sendMessage(wallet: EthMonitor, body: WebhookDeliveryDto) {
    // @todo handle calling failed and retry for user
    for (const notificationMethod of wallet.notificationMethods) {
      try {
        const response = await fetch(notificationMethod.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          this.logger.error(
            `Error while sending webhook request to: ${notificationMethod.url}`,
            response,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error while sending webhook request to: ${notificationMethod.url}`,
          error,
        );
      }
    }
  }
}
