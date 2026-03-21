import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/services/queue.service';
import { CreateScheduledReportDTO, UpdateScheduledReportDTO } from './dto';
import * as cron from 'cron';

@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);
  private readonly cronJobs: Map<string, cron.CronJob> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Initialize scheduled reports on module load
   * Load all enabled reports and schedule them
   */
  async onModuleInit() {
    try {
      this.logger.log('Initializing scheduled reports...');
      const reports = await this.prisma.scheduledReport.findMany({
        where: { enabled: true },
      });

      for (const report of reports) {
        this.scheduleReport(report);
      }

      this.logger.log(`Scheduled ${reports.length} reports`);
    } catch (error) {
      this.logger.error(`Failed to initialize scheduled reports: ${error.message}`);
    }
  }

  /**
   * Create a new scheduled report
   */
  async createScheduledReport(
    userId: string,
    dto: CreateScheduledReportDTO,
  ): Promise<any> {
    try {
      // Validate cron expression
      this.validateCronExpression(dto.schedule);

      // Validate email recipients
      this.validateEmails(dto.recipients);

      const report = await this.prisma.scheduledReport.create({
        data: {
          userId,
          name: dto.name,
          reportType: dto.reportType,
          format: dto.format,
          schedule: dto.schedule,
          recipients: dto.recipients,
          filters: dto.filters || {},
          enabled: dto.enabled,
          nextRunAt: this.calculateNextRun(dto.schedule),
        },
      });

      // Schedule the report if enabled
      if (dto.enabled) {
        this.scheduleReport(report);
      }

      this.logger.log(`Scheduled report created: ${report.id} for user ${userId}`);
      return report;
    } catch (error) {
      this.logger.error(`Failed to create scheduled report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a scheduled report
   */
  async updateScheduledReport(
    reportId: string,
    userId: string,
    dto: UpdateScheduledReportDTO,
  ): Promise<any> {
    try {
      const report = await this.prisma.scheduledReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new NotFoundException('Scheduled report not found');
      }

      if (report.userId !== userId) {
        throw new NotFoundException('Unauthorized');
      }

      // Validate new cron expression if provided
      if (dto.schedule) {
        this.validateCronExpression(dto.schedule);
      }

      // Validate new emails if provided
      if (dto.recipients) {
        this.validateEmails(dto.recipients);
      }

      const nextRunAt = dto.schedule ? this.calculateNextRun(dto.schedule) : undefined;

      const updated = await this.prisma.scheduledReport.update({
        where: { id: reportId },
        data: {
          ...dto,
          nextRunAt,
        },
      });

      // Update cron job if enabled
      if (updated.enabled) {
        this.unscheduleReport(reportId);
        this.scheduleReport(updated);
      } else {
        this.unscheduleReport(reportId);
      }

      this.logger.log(`Scheduled report updated: ${reportId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Failed to update scheduled report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a scheduled report
   */
  async getScheduledReport(reportId: string, userId: string): Promise<any> {
    try {
      const report = await this.prisma.scheduledReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new NotFoundException('Scheduled report not found');
      }

      if (report.userId !== userId) {
        throw new NotFoundException('Unauthorized');
      }

      return report;
    } catch (error) {
      this.logger.error(`Failed to get scheduled report: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all scheduled reports for a user
   */
  async listScheduledReports(userId: string, skip = 0, take = 10): Promise<any> {
    try {
      const [reports, total] = await Promise.all([
        this.prisma.scheduledReport.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.scheduledReport.count({ where: { userId } }),
      ]);

      return {
        reports,
        pagination: {
          skip,
          take,
          total,
          pages: Math.ceil(total / take),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to list scheduled reports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a scheduled report
   */
  async deleteScheduledReport(reportId: string, userId: string): Promise<void> {
    try {
      const report = await this.prisma.scheduledReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new NotFoundException('Scheduled report not found');
      }

      if (report.userId !== userId) {
        throw new NotFoundException('Unauthorized');
      }

      // Unschedule the cron job
      this.unscheduleReport(reportId);

      // Delete from database
      await this.prisma.scheduledReport.delete({
        where: { id: reportId },
      });

      this.logger.log(`Scheduled report deleted: ${reportId}`);
    } catch (error) {
      this.logger.error(`Failed to delete scheduled report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Trigger a report manually
   */
  async triggerReportNow(reportId: string, userId: string): Promise<{ jobId: string }> {
    try {
      const report = await this.prisma.scheduledReport.findUnique({
        where: { id: reportId },
      });

      if (!report) {
        throw new NotFoundException('Scheduled report not found');
      }

      if (report.userId !== userId) {
        throw new NotFoundException('Unauthorized');
      }

      // Queue the report job
      const job = await this.queueService.addReportJob(reportId, {
        reportType: report.reportType,
        format: report.format,
        recipients: report.recipients,
        filters: report.filters as Record<string, any>,
      });

      this.logger.log(`Report triggered manually: ${reportId}`);
      return { jobId: job.id };
    } catch (error) {
      this.logger.error(`Failed to trigger report: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Schedule a report using cron expression
   */
  private scheduleReport(report: any): void {
    try {
      // Validate cron expression
      if (!this.isValidCron(report.schedule)) {
        this.logger.warn(`Invalid cron expression for report ${report.id}: ${report.schedule}`);
        return;
      }

      // Create cron job
      const job = new cron.CronJob(
        report.schedule,
        async () => {
          await this.executeScheduledReport(report);
        },
        null,
        true, // autoStart
        'UTC',
      );

      this.cronJobs.set(report.id, job);
      this.logger.log(`Report scheduled: ${report.id} (${report.schedule})`);
    } catch (error) {
      this.logger.error(`Failed to schedule report ${report.id}: ${error.message}`);
    }
  }

  /**
   * Unschedule a report
   */
  private unscheduleReport(reportId: string): void {
    try {
      const job = this.cronJobs.get(reportId);
      if (job) {
        job.stop();
        this.cronJobs.delete(reportId);
        this.logger.log(`Report unscheduled: ${reportId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to unschedule report ${reportId}: ${error.message}`);
    }
  }

  /**
   * Execute a scheduled report
   */
  private async executeScheduledReport(report: any): Promise<void> {
    try {
      this.logger.log(`Executing scheduled report: ${report.id}`);

      // Queue the report job
      await this.queueService.addReportJob(report.id, {
        reportType: report.reportType,
        format: report.format,
        recipients: report.recipients,
        filters: report.filters as Record<string, any>,
      });

      // Update next run time
      const nextRunAt = this.calculateNextRun(report.schedule);
      await this.prisma.scheduledReport.update({
        where: { id: report.id },
        data: {
          nextRunAt,
          lastRunAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to execute scheduled report ${report.id}: ${error.message}`);
    }
  }

  /**
   * Validate cron expression
   */
  private validateCronExpression(expression: string): void {
    try {
      if (!this.isValidCron(expression)) {
        throw new BadRequestException(`Invalid cron expression: ${expression}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Invalid cron expression: ${expression}`);
    }
  }

  /**
   * Check if cron expression is valid
   */
  private isValidCron(expression: string): boolean {
    try {
      const parts = expression.trim().split(/\s+/);
      // Should be 5 or 6 parts (minute hour day month weekday [year])
      if (parts.length < 5 || parts.length > 6) {
        return false;
      }

      // All parts should be numeric or contain valid cron characters
      const cronCharacters = /^[\d,*/-]+$/;
      for (const part of parts) {
        if (!cronCharacters.test(part)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate email addresses
   */
  private validateEmails(emails: string[]): void {
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new BadRequestException('At least one recipient email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const email of emails) {
      if (!emailRegex.test(email)) {
        throw new BadRequestException(`Invalid email address: ${email}`);
      }
    }
  }

  /**
   * Calculate next run time from cron expression
   */
  private calculateNextRun(expression: string): Date {
    try {
      // Create a temporary cron job just to calculate next date
      // The callback is never executed since we immediately call nextDate()
      const job = new cron.CronJob(
        expression,
        () => {}, // dummy callback
        null,     // onComplete
        false,    // start flag
      );
      const nextDate = job.nextDate();
      
      // nextDate is typically a Luxon DateTime object from cron library
      if (nextDate instanceof Date) {
        return nextDate;
      }
      
      // Try various conversion methods for different date-time libraries
      const dateObj = nextDate as any;
      if (typeof dateObj.toJSDate === 'function') {
        return dateObj.toJSDate();
      }
      if (typeof dateObj.toDate === 'function') {
        return dateObj.toDate();
      }
      if (typeof dateObj.unix === 'function') {
        return new Date(dateObj.unix() * 1000);
      }
      
      // Fallback: return 1 hour from now
      return new Date(Date.now() + 60 * 60 * 1000);
    } catch (error) {
      this.logger.warn(`Failed to calculate next run: ${error.message}`);
      // Return 1 hour from now as a fallback
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  /**
   * Cleanup old scheduled reports
   */
  async cleanupOldReports(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.scheduledReport.deleteMany({
        where: {
          enabled: false,
          updatedAt: { lt: cutoffDate },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old scheduled reports`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup old reports: ${error.message}`);
      throw error;
    }
  }
}
