import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { EXPORT_QUEUE_NAME, REPORTS_QUEUE_NAME } from '../queue.constants';

export interface ExportJobOptions {
  userId: string;
  exportType: string;
  format: string;
  filters?: Record<string, any>;
  filename: string;
}

export interface ReportJobOptions {
  reportType: string;
  format: string;
  recipients: string[];
  filters?: Record<string, any>;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisDisabled = process.env.DISABLE_REDIS === 'true';

  constructor(
    @Optional() @InjectQueue(EXPORT_QUEUE_NAME) private readonly exportQueue?: Queue,
    @Optional() @InjectQueue(REPORTS_QUEUE_NAME) private readonly reportsQueue?: Queue,
  ) {
    if (this.redisDisabled) {
      this.logger.warn('⚠️  Redis disabled - job queuing disabled (DISABLE_REDIS=true)');
    }
  }

  /**
   * Add an export job to the queue
   */
  async addExportJob(jobId: string, options: ExportJobOptions): Promise<Job | null> {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Export job queuing disabled (Redis disabled)');
      return null;
    }
    
    try {
      const job = await this.exportQueue.add(
        'export',
        {
          jobId,
          ...options,
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            age: 3600, // Remove after 1 hour
          },
          removeOnFail: false, // Keep failed jobs for debugging
        },
      );

      this.logger.log(`Export job added to queue: ${job.id}`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to add export job to queue: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Add a scheduled report job to the queue
   */
  async addReportJob(reportId: string, options: ReportJobOptions): Promise<Job | null> {
    if (this.redisDisabled || !this.reportsQueue) {
      this.logger.debug('Report job queuing disabled (Redis disabled)');
      return null;
    }
    
    try {
      const job = await this.reportsQueue.add(
        'report',
        {
          reportId,
          ...options,
        },
        {
          jobId: reportId,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
        },
      );

      this.logger.log(`Scheduled report job added to queue: ${job.id}`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to add report job to queue: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get job status from export queue
   */
  async getExportJobStatus(jobId: string) {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Job status lookup disabled (Redis disabled)');
      return null;
    }

    try {
      const job = await this.exportQueue.getJob(jobId);

      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progressValue = (job.progress as number) || 0;

      return {
        jobId: job.id,
        state,
        progress: progressValue,
        data: job.data,
        result: job.returnvalue,
        failedReason: job.failedReason,
        timestamp: {
          started: job.processedOn,
          completed: job.finishedOn,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get export job status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get job stats from export queue
   */
  async getExportQueueStats() {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Export queue stats lookup disabled (Redis disabled)');
      return {
        queue: EXPORT_QUEUE_NAME,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      };
    }

    try {
      const counts = await this.exportQueue.getJobCounts(
        'wait',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      return {
        queue: EXPORT_QUEUE_NAME,
        waiting: counts.wait || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        total:
          (counts.wait || 0) +
          (counts.active || 0) +
          (counts.completed || 0) +
          (counts.failed || 0) +
          (counts.delayed || 0),
      };
    } catch (error) {
      this.logger.error(`Failed to get export queue stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get job stats from reports queue
   */
  async getReportsQueueStats() {
    if (this.redisDisabled || !this.reportsQueue) {
      this.logger.debug('Reports queue stats lookup disabled (Redis disabled)');
      return {
        queue: REPORTS_QUEUE_NAME,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      };
    }

    try {
      const counts = await this.reportsQueue.getJobCounts(
        'wait',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      return {
        queue: REPORTS_QUEUE_NAME,
        waiting: counts.wait || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        total:
          (counts.wait || 0) +
          (counts.active || 0) +
          (counts.completed || 0) +
          (counts.failed || 0) +
          (counts.delayed || 0),
      };
    } catch (error) {
      this.logger.error(`Failed to get reports queue stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel an export job
   */
  async cancelExportJob(jobId: string): Promise<boolean> {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Job cancellation disabled (Redis disabled)');
      return false;
    }

    try {
      const job = await this.exportQueue.getJob(jobId);

      if (!job) {
        this.logger.warn(`Job not found for cancellation: ${jobId}`);
        return false;
      }

      await job.remove();
      this.logger.log(`Export job cancelled: ${jobId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel export job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retry a failed job
   */
  async retryExportJob(jobId: string): Promise<Job | null> {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Job retry disabled (Redis disabled)');
      return null;
    }

    try {
      const job = await this.exportQueue.getJob(jobId);

      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const state = await job.getState();

      if (state !== 'failed') {
        throw new Error(`Cannot retry job in state: ${state}`);
      }

      await job.retry();
      this.logger.log(`Export job retried: ${jobId}`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to retry export job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up old completed/failed jobs
   */
  async cleanupOldJobs(olderThanDays: number = 7): Promise<{ cleaned: number }> {
    if (this.redisDisabled || !this.exportQueue || !this.reportsQueue) {
      this.logger.debug('Job cleanup disabled (Redis disabled)');
      return { cleaned: 0 };
    }

    try {
      const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;

      const cleanedExport = await this.exportQueue.clean(olderThanMs, 1000, 'completed');
      const cleanedReports = await this.reportsQueue.clean(olderThanMs, 1000, 'completed');

      const totalCleaned = cleanedExport.length + cleanedReports.length;

      this.logger.log(`Cleaned up ${totalCleaned} old jobs (>${olderThanDays} days old)`);

      return { cleaned: totalCleaned };
    } catch (error) {
      this.logger.error(`Failed to cleanup old jobs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all jobs in a queue with pagination
   */
  async getExportQueueJobs(
    status: 'completed' | 'failed' | 'active' | 'wait' | 'delayed' = 'completed',
    start: number = 0,
    end: number = 10,
  ) {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Queue jobs lookup disabled (Redis disabled)');
      return {
        jobs: [],
        count: 0,
      };
    }

    try {
      const jobs = await this.exportQueue.getJobs([status], start, end);

      // Fetch states for all jobs
      const jobsWithState = await Promise.all(
        jobs.map(async (job) => ({
          id: job.id,
          state: await job.getState(),
          data: job.data,
          result: job.returnvalue,
          progress: (job.progress as number) || 0,
          timestamp: {
            started: job.processedOn,
            completed: job.finishedOn,
          },
        })),
      );

      return {
        jobs: jobsWithState,
        count: jobsWithState.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get export queue jobs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pause/Resume export queue
   */
  async toggleExportQueuePause(pause: boolean): Promise<void> {
    if (this.redisDisabled || !this.exportQueue) {
      this.logger.debug('Queue pause/resume disabled (Redis disabled)');
      return;
    }

    try {
      if (pause) {
        await this.exportQueue.pause();
        this.logger.log('Export queue paused');
      } else {
        await this.exportQueue.resume();
        this.logger.log('Export queue resumed');
      }
    } catch (error) {
      this.logger.error(`Failed to toggle export queue pause: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if queues are healthy
   */
  async healthCheck(): Promise<{
    status: string;
    exportQueue: any;
    reportsQueue: any;
  }> {
    try {
      const exportStats = await this.getExportQueueStats();
      const reportsStats = await this.getReportsQueueStats();

      const status =
        exportStats.failed === 0 && reportsStats.failed === 0 ? 'healthy' : 'degraded';

      return {
        status,
        exportQueue: exportStats,
        reportsQueue: reportsStats,
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        exportQueue: { error: error.message },
        reportsQueue: { error: error.message },
      };
    }
  }
}
