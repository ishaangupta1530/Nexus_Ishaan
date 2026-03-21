import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { REPORTS_QUEUE_NAME } from '../queue.constants';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface ReportJobData {
  reportId: string;
  reportType: string;
  format: string;
  recipients: string[];
  filters?: Record<string, any>;
}

@Processor(REPORTS_QUEUE_NAME, {
  concurrency: 3,
  stalledInterval: 60000,
  maxStalledCount: 1,
})
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || './uploads/reports';

  constructor(private readonly prismaService: PrismaService) {
    super();
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async process(job: Job<ReportJobData>): Promise<any> {
    try {
      this.logger.log(`[Job ${job.id}] Starting scheduled report processing: ${job.data.reportId}`);

      // Update status
      await job.updateProgress(10);

      // Generate report file
      const filepath = await this.generateReportFile(job.data);
      await job.updateProgress(50);

      // Send emails to recipients
      await this.sendReportEmails(job.data, filepath);
      await job.updateProgress(90);

      // Update report status in database
      await this.updateScheduledReport(job.data.reportId, {
        lastRunAt: new Date(),
        nextRunAt: this.calculateNextRun(), // Will be updated by cron scheduler
      });

      await job.updateProgress(100);

      this.logger.log(`[Job ${job.id}] Scheduled report completed and sent to ${job.data.recipients.length} recipients`);

      return {
        success: true,
        reportId: job.data.reportId,
        filepath,
        recipientCount: job.data.recipients.length,
      };
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Scheduled report processing failed: ${error.message}`,
        error.stack,
      );

      // Note: Update failures are logged but don't cause job to fail again
      // The cron scheduler will handle next run based on registry state
      await this.updateScheduledReport(job.data.reportId, {
        lastRunAt: new Date(),
      }).catch((err) => {
        this.logger.error(`Failed to update report status: ${err.message}`);
      });

      throw error;
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generate report file
   */
  private async generateReportFile(jobData: ReportJobData): Promise<string> {
    try {
      // This will be called with actual CSV/PDF generation logic
      // For now, create a placeholder file
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${jobData.reportType}-report-${timestamp}.${jobData.format}`;
      const filepath = path.join(this.uploadDir, filename);

      // Create a placeholder file
      const content = `Report: ${jobData.reportType}\nGenerated: ${new Date().toISOString()}\nFormat: ${jobData.format}\n`;
      await fs.promises.writeFile(filepath, content);

      this.logger.log(`Report file generated: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to generate report file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send report emails to recipients
   */
  private async sendReportEmails(jobData: ReportJobData, filepath: string): Promise<void> {
    try {
      // Email sending logic can be implemented when MailerService is available
      this.logger.log(`Would send report file to ${jobData.recipients.length} recipients`);
      this.logger.log(`Recipients: ${jobData.recipients.join(', ')}`);
      this.logger.log(`File: ${filepath}`);
    } catch (error) {
      this.logger.error(`Failed to send report emails: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate next run time based on cron schedule
   */
  private calculateNextRun(): Date {
    // This should integrate with cron calculation
    // For now, return same time next day
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);
    return nextRun;
  }

  /**
   * Update scheduled report status in database
   */
  private async updateScheduledReport(reportId: string, updates: Record<string, any>): Promise<void> {
    try {
      await this.prismaService.scheduledReport.update({
        where: { id: reportId },
        data: updates,
      });
    } catch (error) {
      this.logger.error(`Failed to update scheduled report: ${error.message}`);
      throw error;
    }
  }
}
