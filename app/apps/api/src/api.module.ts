import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { ConfigModule } from '@nestjs/config';
import { MonitorApiModule } from './modules/monitor/monitor.api.module';
import { MonitorAddressApiModule } from './modules/address/address.module';
import { EventHistoryApiModule } from './modules/event_history/event_history.module';
import { DeliveryApiModule } from './modules/delivery/delivery.api.module';
import { GlobalModule } from 'libs';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`${process.env.NODE_ENV}.env`, '.env'],
      expandVariables: true,
    }),
    GlobalModule,
    MonitorApiModule,
    MonitorAddressApiModule,
    EventHistoryApiModule,
    DeliveryApiModule,
  ],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
