/**
 * Queue Names and Constants
 */

export const EXPORT_QUEUE_NAME = 'export-queue';
export const REPORTS_QUEUE_NAME = 'reports-queue';

/**
 * Export Job Types
 */
export enum ExportJobType {
  REFERRALS = 'REFERRALS',
  ANALYTICS = 'ANALYTICS',
  CONNECTIONS = 'CONNECTIONS',
  POSTS = 'POSTS',
  CUSTOM = 'CUSTOM',
}

/**
 * Export Formats
 */
export enum ExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
  EXCEL = 'excel',
  JSON = 'json',
}

/**
 * Export Job Status
 */
export enum ExportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Report Status
 */
export enum ReportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
