import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EXPORT_QUEUE_NAME, REPORTS_QUEUE_NAME } from './queue.constants';
import { ExportProcessor } from './processors/export.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { QueueService } from './services/queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportModule } from '../export/export.module';

const logger = new Logger('QueueModule');

/**
 * Check if Redis is available
 */
function isRedisAvailable(configService: ConfigService): boolean {
  const redisUrl = configService.get('REDIS_URL', '');
  const redisHost = configService.get('REDIS_HOST', '');
  const disableRedis = configService.get('DISABLE_REDIS', 'false');
  
  // If explicitly disabled, don't try to connect
  if (disableRedis === 'true' || disableRedis === true) {
    logger.warn('⚠️ Redis is disabled - queue operations will be skipped');
    return false;
  }
  
  // If no Redis config provided, don't try to connect
  if (!redisUrl && !redisHost) {
    logger.warn('⚠️ No Redis configuration found - queue operations will be skipped');
    return false;
  }
  
  return true;
}

@Module({
  imports: [
    PrismaModule,
    ExportModule,
    BullModule.registerQueueAsync(
      {
        name: EXPORT_QUEUE_NAME,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          // Only create queue config if Redis is available
          if (!isRedisAvailable(configService)) {
            return { connection: { host: 'localhost', port: 6379, lazyConnect: true, retryStrategy: () => false } };
          }
          return {
            connection: {
              host: configService.get('REDIS_HOST', 'localhost'),
              port: Number.parseInt(configService.get('REDIS_PORT', '6379'), 10),
              password: configService.get('REDIS_PASSWORD'),
              lazyConnect: true,
              retryStrategy: () => false,
            },
            defaultJobOptions: {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: {
                age: 3600,
              },
              removeOnFail: false,
            },
          };
        },
      },
      {
        name: REPORTS_QUEUE_NAME,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          // Only create queue config if Redis is available
          if (!isRedisAvailable(configService)) {
            return { connection: { host: 'localhost', port: 6379, lazyConnect: true, retryStrategy: () => false } };
          }
          return {
            connection: {
              host: configService.get('REDIS_HOST', 'localhost'),
              port: Number.parseInt(configService.get('REDIS_PORT', '6379'), 10),
              password: configService.get('REDIS_PASSWORD'),
              lazyConnect: true,
              retryStrategy: () => false,
            },
            defaultJobOptions: {
              attempts: 2,
              backoff: {
                type: 'exponential',
                delay: 3000,
              },
            },
          };
        },
      },
    ),
  ],
  providers: [ExportProcessor, ReportsProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
