import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EXPORT_QUEUE_NAME } from '../queue.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvGenerator } from '../../export/generators/csv.generator';
import { JsonGenerator } from '../../export/generators/json.generator';
import { ExcelGenerator } from '../../export/generators/excel.generator';
import { PdfGenerator } from '../../export/generators/pdf.generator';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface ExportJobData {
  jobId: string;
  userId: string;
  exportType: string;
  format: string;
  filters?: Record<string, any>;
  filename: string;
}

@Processor(EXPORT_QUEUE_NAME, {
  concurrency: 5,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || './uploads/exports';

  constructor(
    private readonly prismaService: PrismaService,
    private readonly csvGenerator: CsvGenerator,
    private readonly jsonGenerator: JsonGenerator,
    private readonly excelGenerator: ExcelGenerator,
    private readonly pdfGenerator: PdfGenerator,
  ) {
    super();
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async process(job: Job<ExportJobData>): Promise<any> {
    try {
      this.logger.log(`[Job ${job.id}] Starting export processing for user ${job.data.userId}`);
      const startTime = Date.now();

      // Update job status to PROCESSING
      await job.updateProgress(2);

      // Fetch data with streaming/pagination for better performance
      const data = await this.fetchDataForExportOptimized(job.data, job);
      const fetchTime = Date.now() - startTime;
      this.logger.log(`[Job ${job.id}] Data fetch completed in ${fetchTime}ms (${data.length} records)`);
      await job.updateProgress(35); // Data fetching is heaviest part

      // Generate file based on format
      const genStart = Date.now();
      const buffer = await this.generateExportFile(job.data, data);
      const genTime = Date.now() - genStart;
      this.logger.log(`[Job ${job.id}] File generated in ${genTime}ms (${(buffer.byteLength / 1024).toFixed(2)}KB)`);
      await job.updateProgress(70);

      // Save file to disk
      const filepath = await this.saveExportFile(job.data, buffer);
      const filename = path.basename(filepath);
      await job.updateProgress(85);

      // Update database with file path
      await this.updateExportJob(job.data.jobId, {
        status: 'COMPLETED',
        fileUrl: filename,
        fileSize: buffer.byteLength,
      });

      await job.updateProgress(100);

      const totalTime = Date.now() - startTime;
      this.logger.log(
        `[Job ${job.id}] Export completed in ${totalTime}ms. File: ${filepath}, Size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB`,
      );

      return {
        success: true,
        jobId: job.data.jobId,
        filepath,
        fileSize: buffer.byteLength,
        processingTimeMs: totalTime,
      };
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Export processing failed: ${error.message}`, error.stack);

      // Mark job as failed in database
      await this.updateExportJob(job.data.jobId, {
        status: 'FAILED',
        error: error.message,
      }).catch((err) => {
        this.logger.error(`[Job ${job.id}] Failed to update job status: ${err.message}`);
      });

      throw error;
    }
  }


  // ==================== PRIVATE METHODS ====================

  /**
   * Fetch data based on export type with optimized pagination
   */
  private async fetchDataForExportOptimized(
    jobData: ExportJobData,
    job: Job<ExportJobData>,
  ): Promise<any[]> {
    try {
      const { exportType, filters = {}, userId } = jobData;

      switch (exportType.toUpperCase()) {
        case 'REFERRALS':
          return this.fetchReferralsDataOptimized(userId, filters, job);

        case 'ANALYTICS':
          return this.fetchAnalyticsDataOptimized(userId, filters, job);

        case 'CONNECTIONS':
          return this.fetchConnectionsDataOptimized(userId, filters, job);

        case 'POSTS':
          return this.fetchPostsDataOptimized(userId, filters, job);

        default:
          throw new Error(`Unknown export type: ${exportType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch data for export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch data based on export type (legacy - for backwards compatibility)
   */
  private async fetchDataForExport(jobData: ExportJobData): Promise<any[]> {
    try {
      const { exportType, filters = {}, userId } = jobData;

      switch (exportType.toUpperCase()) {
        case 'REFERRALS':
          return this.fetchReferralsData(userId, filters);

        case 'ANALYTICS':
          return this.fetchAnalyticsData(userId, filters);

        case 'CONNECTIONS':
          return this.fetchConnectionsData(userId, filters);

        case 'POSTS':
          return this.fetchPostsData(userId, filters);

        default:
          throw new Error(`Unknown export type: ${exportType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch data for export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch referrals data with pagination for better performance
   */
  private async fetchReferralsDataOptimized(
    userId: string,
    filters: Record<string, any>,
    job: Job<ExportJobData>,
  ): Promise<any[]> {
    try {
      const BATCH_SIZE = 100; // Fetch 100 at a time instead of 10,000
      const allReferrals: any[] = [];

      // Determine access scope based on user role
      const currentUser = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      let accessFilter: any = {};
      if (!currentUser?.role || currentUser.role !== 'ADMIN') {
        // Non-admins can only see APPROVED referrals or referrals they posted
        accessFilter = {
          OR: [{ status: 'APPROVED' }, { postedById: userId }],
        };
      }

      // Build filter conditions from provided filters
      const filterFilter: any = {};
      if (filters.status) {
        filterFilter.status = filters.status;
      }
      if (filters.dateRange?.start || filters.dateRange?.end) {
        filterFilter.createdAt = {};
        if (filters.dateRange.start) {
          filterFilter.createdAt.gte = new Date(filters.dateRange.start);
        }
        if (filters.dateRange.end) {
          filterFilter.createdAt.lte = new Date(filters.dateRange.end);
        }
      }

      // Combine access filter and user-provided filters
      let whereClause: any = {};
      const hasAccessFilter = Object.keys(accessFilter).length > 0;
      const hasFilterFilter = Object.keys(filterFilter).length > 0;

      if (hasAccessFilter && hasFilterFilter) {
        whereClause = { AND: [accessFilter, filterFilter] };
      } else if (hasAccessFilter) {
        whereClause = accessFilter;
      } else {
        whereClause = filterFilter;
      }

      const total = await this.prismaService.referral.count({ where: whereClause });
      this.logger.log(`Fetching ${total} referrals in batches of ${BATCH_SIZE}`);

      // Fetch in batches
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = await this.prismaService.referral.findMany({
          where: whereClause,
          select: {
            id: true,
            company: true,
            jobTitle: true,
            description: true,
            location: true,
            status: true,
            createdAt: true,
            deadline: true,
            postedBy: {
              select: { id: true, name: true, email: true, role: true },
            },
            _count: { select: { applications: true } },
          },
          skip: i,
          take: BATCH_SIZE,
          orderBy: { createdAt: 'desc' },
        });

        allReferrals.push(
          ...batch.map((r) => ({
            ...r,
            applicationsCount: r._count.applications,
          })),
        );

        // Update progress
        const progress = 5 + Math.round(((i + BATCH_SIZE) / total) * 30);
        await job.updateProgress(Math.min(progress, 33));

        this.logger.log(`Fetched batch ${Math.ceil((i + BATCH_SIZE) / BATCH_SIZE)} of ${Math.ceil(total / BATCH_SIZE)}`);
      }

      return allReferrals;
    } catch (error) {
      this.logger.error(`Failed to fetch referrals data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch analytics data with pagination
   */
  private async fetchAnalyticsDataOptimized(
    userId: string,
    filters: Record<string, any>,
    job: Job<ExportJobData>,
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        authorId: userId,
      };

      if (filters.dateRange?.start || filters.dateRange?.end) {
        whereClause.createdAt = {};
        if (filters.dateRange.start) {
          whereClause.createdAt.gte = new Date(filters.dateRange.start);
        }
        if (filters.dateRange.end) {
          whereClause.createdAt.lte = new Date(filters.dateRange.end);
        }
      }

      const total = await this.prismaService.post.count({ where: whereClause });
      const BATCH_SIZE = 100;

      const posts: any[] = [];
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = await this.prismaService.post.findMany({
          where: whereClause,
          select: {
            id: true,
            subject: true,
            content: true,
            createdAt: true,
            _count: { select: { Comment: true, Vote: true } },
          },
          skip: i,
          take: BATCH_SIZE,
          orderBy: { createdAt: 'desc' },
        });

        posts.push(
          ...batch.map((p) => ({
            ...p,
            comments: p._count.Comment,
            votes: p._count.Vote,
          })),
        );

        const progress = 5 + Math.round(((i + BATCH_SIZE) / total) * 30);
        await job.updateProgress(Math.min(progress, 33));
      }

      return posts;
    } catch (error) {
      this.logger.error(`Failed to fetch analytics data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch connections data with pagination
   */
  private async fetchConnectionsDataOptimized(
    userId: string,
    filters: Record<string, any>,
    job: Job<ExportJobData>,
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        OR: [{ requesterId: userId }, { recipientId: userId }],
      };

      if (filters.status) {
        whereClause.status = filters.status;
      }

      const total = await this.prismaService.connection.count({ where: whereClause });
      const BATCH_SIZE = 100;

      const connections: any[] = [];
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = await this.prismaService.connection.findMany({
          where: whereClause,
          select: {
            id: true,
            status: true,
            createdAt: true,
            requester: { select: { id: true, name: true, email: true, role: true } },
            recipient: { select: { id: true, name: true, email: true, role: true } },
          },
          skip: i,
          take: BATCH_SIZE,
          orderBy: { createdAt: 'desc' },
        });

        connections.push(...batch);

        const progress = 5 + Math.round(((i + BATCH_SIZE) / total) * 30);
        await job.updateProgress(Math.min(progress, 33));
      }

      return connections;
    } catch (error) {
      this.logger.error(`Failed to fetch connections data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch posts data with pagination
   */
  private async fetchPostsDataOptimized(
    userId: string,
    filters: Record<string, any>,
    job: Job<ExportJobData>,
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        authorId: userId,
      };

      const total = await this.prismaService.post.count({ where: whereClause });
      const BATCH_SIZE = 100;

      const posts: any[] = [];
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = await this.prismaService.post.findMany({
          where: whereClause,
          select: {
            id: true,
            subject: true,
            content: true,
            createdAt: true,
          },
          skip: i,
          take: BATCH_SIZE,
          orderBy: { createdAt: 'desc' },
        });

        posts.push(...batch);

        const progress = 5 + Math.round(((i + BATCH_SIZE) / total) * 30);
        await job.updateProgress(Math.min(progress, 33));
      }

      return posts;
    } catch (error) {
      this.logger.error(`Failed to fetch posts data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch referrals data from database (legacy)
   */
  private async fetchReferralsData(userId: string, filters: Record<string, any>): Promise<any[]> {
    try {
      const whereClause: any = {};

      if (filters.status) {
        whereClause.status = filters.status;
      }

      if (filters.dateRange?.start || filters.dateRange?.end) {
        whereClause.createdAt = {};
        if (filters.dateRange.start) {
          whereClause.createdAt.gte = new Date(filters.dateRange.start);
        }
        if (filters.dateRange.end) {
          whereClause.createdAt.lte = new Date(filters.dateRange.end);
        }
      }

      const referrals = await this.prismaService.referral.findMany({
        where: whereClause,
        select: {
          id: true,
          company: true,
          jobTitle: true,
          description: true,
          location: true,
          status: true,
          createdAt: true,
          postedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          _count: { select: { applications: true } },
        },
        take: filters.limit || 1000,
        orderBy: { createdAt: 'desc' },
      });

      return referrals.map((r) => ({
        ...r,
        applicationsCount: r._count.applications,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch referrals data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch analytics data
   */
  private async fetchAnalyticsData(userId: string, filters: Record<string, any>): Promise<any[]> {
    try {
      // Implement analytics data fetching based on your analytics model
      // This is a placeholder - adjust based on your actual analytics implementation

      const whereClause: any = {
        authorId: userId,
      };

      if (filters.dateRange?.start || filters.dateRange?.end) {
        whereClause.createdAt = {};
        if (filters.dateRange.start) {
          whereClause.createdAt.gte = new Date(filters.dateRange.start);
        }
        if (filters.dateRange.end) {
          whereClause.createdAt.lte = new Date(filters.dateRange.end);
        }
      }

      const posts = await this.prismaService.post.findMany({
        where: whereClause,
        take: filters.limit || 5000,
        orderBy: { createdAt: 'desc' },
      });

      return posts;
    } catch (error) {
      this.logger.error(`Failed to fetch analytics data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch connections data
   */
  private async fetchConnectionsData(userId: string, filters: Record<string, any>): Promise<any[]> {
    try {
      const whereClause: any = {
        OR: [{ requesterId: userId }, { recipientId: userId }],
      };

      if (filters.status) {
        whereClause.status = filters.status;
      }

      const connections = await this.prismaService.connection.findMany({
        where: whereClause,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true } },
          recipient: { select: { id: true, name: true, email: true, role: true } },
        },
        take: filters.limit || 10000,
        orderBy: { createdAt: 'desc' },
      });

      return connections;
    } catch (error) {
      this.logger.error(`Failed to fetch connections data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch posts data
   */
  private async fetchPostsData(userId: string, filters: Record<string, any>): Promise<any[]> {
    try {
      const whereClause: any = {
        userId,
      };

      const posts = await this.prismaService.comment.findMany({
        where: whereClause,
        include: {
          post: {
            select: { id: true, subject: true },
          },
        },
        take: filters.limit || 5000,
        orderBy: { createdAt: 'desc' },
      });

      return posts;
    } catch (error) {
      this.logger.error(`Failed to fetch posts data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate export file based on format
   */
 private async generateExportFile(jobData: ExportJobData, data: any[]): Promise<Buffer> {
  try {
    const { format, exportType } = jobData;

    switch (format.toLowerCase()) {
      case 'csv':
        return this.csvGenerator.generate(data);
      case 'json':
        return this.generateJsonBuffer(data, exportType, jobData);
      case 'excel':
        return this.generateExcelBuffer(data, exportType);

      case 'pdf': {
        const flattenedData = this.prepareDataForPdf(data);

        this.logger.log(
          `📊 PDF Export - Raw data: ${data.length} items, Flattened: ${
            flattenedData.length
          } rows`
        );

        const pdfBuffer = await this.pdfGenerator.generate(
          jobData.exportType,
          [
            {
              heading: jobData.exportType,
              content: flattenedData,
            },
          ]
        );

        return Buffer.isBuffer(pdfBuffer)
          ? pdfBuffer
          : Buffer.from(pdfBuffer);
      }

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  } catch (error) {
    this.logger.error(`Failed to generate export file: ${error.message}`);
    throw error;
  }
}
  /**
   * Flatten nested data for PDF table rendering
   */
  private prepareDataForPdf(data: any[]): any[] {
    return data.map((item) => {
      const flattened: any = {};
      const processed = new Set<string>();

      const flattenValue = (obj: any, prefix = '') => {
        if (obj === null || obj === undefined) return;

        if (Array.isArray(obj)) {
          flattened[`${prefix}count`] = obj.length;
        } else if (typeof obj === 'object') {
          Object.entries(obj).forEach(([key, value]) => {
            const newKey = prefix ? `${prefix}_${key}` : key;
            if (processed.has(newKey)) return;
            processed.add(newKey);

            if (value === null || value === undefined) {
              flattened[newKey] = '';
            } else if (Array.isArray(value)) {
              flattened[`${newKey}_count`] = value.length;
            } else if (typeof value === 'object') {
              const objValue = value as any;
              if (objValue.name !== undefined) {
                flattened[newKey] = objValue.name;
              } else if (objValue.id) {
                flattened[newKey] = objValue.id;
              } else {
                flattened[newKey] = this.findStringProperty(objValue);
              }
            } else {
              flattened[newKey] = this.serializeValue(value);
            }
          });
        } else {
          flattened[prefix] = String(obj);
        }
      };

      Object.entries(item).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          flattened[key] = '';
        } else if (Array.isArray(value)) {
          flattened[`${key}_count`] = value.length;
        } else if (typeof value === 'object') {
          flattenValue(value, key);
        } else {
          flattened[key] = this.serializeValue(value);
        }
      });

      return flattened;
    });
  }

  /**
   * Save export file to disk
   */
  private async saveExportFile(jobData: ExportJobData, buffer: Buffer): Promise<string> {
    try {
      const timestamp = Date.now();
      // Map format to proper file extension
      let extension = '';
      const format = jobData.format.toLowerCase();
      
      if (format === 'excel') {
        extension = 'xlsx';
      } else if (format === 'csv') {
        extension = 'csv';
      } else if (format === 'json') {
        extension = 'json';
      } else if (format === 'pdf') {
        extension = 'pdf';
      } else {
        extension = format;
      }
      
      const filename = `${jobData.jobId}-${timestamp}.${extension}`;
      const filepath = path.join(this.uploadDir, filename);

      this.logger.log(`Saving export: format=${format}, extension=${extension}, filename=${filename}`);
      await fs.promises.writeFile(filepath, buffer);

      this.logger.log(`File saved to: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to save export file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update export job status in database
   */
  private async updateExportJob(jobId: string, updates: Record<string, any>): Promise<void> {
    try {
      await this.prismaService.exportJob.update({
        where: { id: jobId },
        data: updates,
      });
    } catch (error) {
      this.logger.error(`Failed to update export job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JSON buffer based on export type
   */
  private generateJsonBuffer(data: any[], exportType: string, jobData: ExportJobData): Buffer {
    const type = exportType.toUpperCase();
    switch (type) {
      case 'ANALYTICS':
        return this.jsonGenerator.generateAnalyticsJson(data, jobData.userId);
      case 'REFERRALS':
        return this.jsonGenerator.generateReferralsJson(data, jobData.userId);
      case 'CONNECTIONS':
        return this.jsonGenerator.generateConnectionsJson(data, jobData.userId);
      case 'POSTS':
        return this.jsonGenerator.generatePostsJson(data, jobData.userId);
      default:
        return this.jsonGenerator.generate(data, jobData.filename, jobData.userId);
    }
  }

  /**
   * Generate Excel buffer based on export type
   */
  private async generateExcelBuffer(data: any[], exportType: string): Promise<Buffer> {
    const type = exportType.toUpperCase();
    let excelBuffer: Buffer;

    switch (type) {
      case 'ANALYTICS':
        excelBuffer = await this.excelGenerator.generateAnalyticsExcel(data);
        break;
      case 'REFERRALS':
        excelBuffer = await this.excelGenerator.generateReferralsExcel(data);
        break;
      case 'CONNECTIONS':
        excelBuffer = await this.excelGenerator.generateConnectionsExcel(data);
        break;
      case 'POSTS':
        excelBuffer = await this.excelGenerator.generatePostsExcel(data);
        break;
      default:
        excelBuffer = this.excelGenerator.generate(data);
    }

    return Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer);
  }

  /**
   * Find a string property in an object
   */
  private findStringProperty(obj: any): string {
    const entries = Object.entries(obj);
    const stringEntry = entries.find(([, v]) => typeof v === 'string');
    return stringEntry ? String(stringEntry[1]) : '';
  }

  /**
   * Serialize a value to string
   */
  private serializeValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
