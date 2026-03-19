import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CsvGenerator {
  private readonly logger = new Logger(CsvGenerator.name);

  generate(data: any[]): Buffer {
    try {
      if (!data || data.length === 0) {
        return Buffer.from('');
      }

      // Get headers from first record
      const headers = Object.keys(data[0]);
      
      // Build CSV rows
      const rows = data.map((record) => {
        return headers.map((header) => {
          const value = record[header];
          // Escape quotes and wrap in quotes if needed
          if (value === null || value === undefined) {
            return '';
          }
          const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      });

      // Combine headers and rows
      const csv = [headers.join(','), ...rows].join('\n');
      
      this.logger.log(`Generated CSV with ${data.length} records and ${headers.length} columns`);
      return Buffer.from(csv, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate CSV: ${error.message}`);
      throw error;
    }
  }
}
