import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

export interface BullConfigOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number | null;
}

const logger = new Logger('BullConfig');

/**
 * Create Redis client for Bull Queue
 */
export function createRedisConnection(options: BullConfigOptions = {}) {
  return {
    host: options.host || process.env.REDIS_HOST || 'localhost',
    port: options.port || Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: options.password || process.env.REDIS_PASSWORD || undefined,
    db: options.db || 0,
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
  };
}

/**
 * Create and configure a Bull Queue
 */
export function createQueue(
  queueName: string,
  options: BullConfigOptions = {},
): Queue {
  try {
    const connection = createRedisConnection(options);

    const queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // keep completed jobs for 1 hour
        },
        removeOnFail: false,
      },
    });

    logger.log(`Queue ${queueName} created successfully`);
    return queue;
  } catch (error) {
    logger.error(
      `Failed to create queue ${queueName}: ${error.message}`,
      error.stack,
    );
    throw error;
  }
}
/**
 * Get queue stats with error handling
 */
export async function getQueueStats(queue: Queue) {
  try {
    const counts = await queue.getJobCounts();
    return {
      name: queue.name,
      waiting: counts.wait || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  } catch (error) {
    logger.error(`Failed to get queue stats: ${error.message}`);
    throw error;
  }
}

/**
 * Create a worker to process jobs
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: any) => Promise<any>,
  options: BullConfigOptions & { concurrency?: number } = {},
) {
  try {
    const connection = createRedisConnection(options);

    const worker = new Worker<T>(queueName, processor, {
      connection,
      concurrency: options.concurrency || 5,
      maxStalledCount: 2,
      stalledInterval: 30000, // Check every 30 seconds
      lockDuration: 30000,
      lockRenewTime: 15000,
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in ${queueName}: ${err.message}`, err.stack);
    });

    worker.on('failed', (job, err) => {
      logger.warn(`Worker job ${job.id} failed: ${err.message}`);
    });

    logger.log(`Worker created for queue ${queueName} with concurrency ${options.concurrency || 5}`);
    return worker;
  } catch (error) {
    logger.error(`Failed to create worker for queue ${queueName}: ${error.message}`);
    throw error;
  }
}

/**
 * Utility: Add job to queue with retry logic
 */
export async function addJobToQueue(
  queue: Queue,
  jobName: string,
  data: any,
  options: any = {},
): Promise<{ jobId: string }> {
  try {
    const job = await queue.add(jobName, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      ...options,
    });

    logger.log(`Job ${job.id} added to queue ${queue.name}`);
    return { jobId: job.id };
  } catch (error) {
    logger.error(`Failed to add job to queue: ${error.message}`);
    throw error;
  }
}

/**
 * Utility: Get job status and progress
 */
export async function getJobStatus(queue: Queue, jobId: string) {
  try {
    const job = await queue.getJob(jobId);

    if (!job) {
      return {
        status: 'NOT_FOUND',
        progress: 0,
        data: null,
        error: 'Job not found',
      };
    }

    const state = await job.getState();
    const progressValue = (job.progress as number) || 0;

    return {
      status: state,
      progress: progressValue,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  } catch (error) {
    logger.error(`Failed to get job status: ${error.message}`);
    throw error;
  }
}

/**
 * Utility: Clean up old jobs
 */
export async function cleanupQueue(queue: Queue, olderThanMs: number = 3600000) {
  try {
    const cleanedCompleted = await queue.clean(olderThanMs, 1000, 'completed');
    const cleanedFailed = await queue.clean(olderThanMs, 1000, 'failed');

    logger.log(
      `Cleaned queue ${queue.name}: ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`,
    );

    return {
      completed: cleanedCompleted.length,
      failed: cleanedFailed.length,
    };
  } catch (error) {
    logger.error(`Failed to cleanup queue: ${error.message}`);
    throw error;
  }
}
