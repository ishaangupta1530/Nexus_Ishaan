import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsMonitoringController } from './analytics-monitoring.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { MonitoringService } from './monitoring.service';
import { MetricsSchedulerService } from './metrics-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule, ScheduleModule],
  controllers: [AdminAnalyticsController, AnalyticsMonitoringController],
  providers: [AdminAnalyticsService, MonitoringService, MetricsSchedulerService],
  exports: [MonitoringService, AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
