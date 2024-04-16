import { WebhookService } from '@app/shared_modules/webhook/webhook.service';
import { Injectable } from '@nestjs/common';
import { MonitorService } from '../monitor/monitor.service';
import { User } from '../users/schemas/user.schema';
import {
  DeliveryAttemptResponseDto,
  GetMonitorDeliveryDto,
  MonitorDeliveryResponseDto,
} from './dto/delivery.dto';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly monitorService: MonitorService,
  ) {}

  async getMonitorDeliveries(
    user: User,
    request: GetMonitorDeliveryDto,
  ): Promise<MonitorDeliveryResponseDto[]> {
    const monitor = await this.monitorService.findAndAuthMonitor(
      user,
      request.monitorId,
    );

    return this.webhookService
      .getDeliveries(
        monitor.webhookId,
        request.limit,
        request.offset,
        request.status,
      )
      .then((response) => {
        return response.deliveries.map((delivery) =>
          MonitorDeliveryResponseDto.from(delivery),
        );
      });
  }

  async getDeliveryAttempt(
    user: User,
    deliveryId: string,
  ): Promise<DeliveryAttemptResponseDto[]> {
    return this.webhookService
      .getDeliveryAttempts(deliveryId)
      .then((response) => {
        return response.delivery_attempts.map((attempt) =>
          DeliveryAttemptResponseDto.from(attempt),
        );
      });
  }
}