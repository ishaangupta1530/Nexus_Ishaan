import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EXPORT_QUEUE_NAME, REPORTS_QUEUE_NAME } from './queue.constants';
import { ExportProcessor } from './processors/export.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { QueueService } from './services/queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportModule } from '../export/export.module';

const disableRedis = process.env.DISABLE_REDIS === 'true';

// Only include BullModule if Redis is enabled
const bullModuleImports = disableRedis
  ? []
  : [
      BullModule.registerQueue(
        {
          name: EXPORT_QUEUE_NAME,
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
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
        },
        {
          name: REPORTS_QUEUE_NAME,
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
          },
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 3000,
            },
          },
        },
      ),
    ];

@Module({
  imports: [PrismaModule, ExportModule, ...bullModuleImports],
  providers: [
    ExportProcessor,
    ReportsProcessor,
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
