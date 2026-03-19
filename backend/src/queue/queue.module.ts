import { Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EXPORT_QUEUE_NAME, REPORTS_QUEUE_NAME } from './queue.constants';
import { ExportProcessor } from './processors/export.processor';
import { ReportsProcessor } from './processors/reports.processor';
import { QueueService } from './services/queue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportModule } from '../export/export.module';

const disableRedis = process.env.DISABLE_REDIS === 'true';

// Conditionally include processors only if Redis is enabled
const processorProviders: Provider[] = disableRedis ? [] : [ExportProcessor, ReportsProcessor];

// Build imports array
const moduleImports: any[] = [PrismaModule, ExportModule];

if (!disableRedis) {
  moduleImports.push(
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
  );
}

@Module({
  imports: moduleImports,
  providers: [
    ...processorProviders,
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
