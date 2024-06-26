import { NestFactory } from '@nestjs/core';
import { MonitorServiceModule } from './monitor-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LogLevel } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MonitorServiceModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'monitor-server',
          brokers: process.env.KAFKA_BROKERS.split(','),
          ssl: process.env.KAFKA_SSL === 'true',
          sasl:
            process.env.KAFKA_AUTH_ENABLE === 'true'
              ? {
                  mechanism: 'plain',
                  username: process.env.KAFKA_USERNAME || '',
                  password: process.env.KAFKA_PASSWORD || '',
                }
              : null,

          retry: {
            restartOnFailure: async (e) => {
              console.log('RESTART ON FAILURE monitor server');
              console.log(e);
              return true;
            },
          },
        },
        consumer: {
          groupId: 'monitor-consumer',
          maxBytes: 1048576, // 1MB
        },
      },
      logger:
        process.env.LOGS !== undefined
          ? (process.env.LOGS.split(',') as LogLevel[])
          : ['error', 'warn', 'log', 'fatal', 'debug', 'verbose'],
    },
  );
  app.listen();
}
bootstrap();
