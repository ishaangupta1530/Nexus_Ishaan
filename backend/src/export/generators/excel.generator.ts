import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

@Injectable()
export class ExcelGenerator {
  private readonly logger = new Logger(ExcelGenerator.name);

  generate(data: any[]): Buffer {
    try {
      if (!data || data.length === 0) {
        return Buffer.from('');
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      this.logger.log(`Generated Excel with ${data.length} records`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate Excel: ${error.message}`);
      throw error;
    }
  }

  async generateAnalyticsExcel(data: any[]): Promise<Buffer> {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Analytics');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      this.logger.log(`Generated Analytics Excel with ${data.length} records`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate Analytics Excel: ${error.message}`);
      throw error;
    }
  }

  async generateReferralsExcel(data: any[]): Promise<Buffer> {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Referrals');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      this.logger.log(`Generated Referrals Excel with ${data.length} records`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate Referrals Excel: ${error.message}`);
      throw error;
    }
  }

  async generateConnectionsExcel(data: any[]): Promise<Buffer> {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Connections');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      this.logger.log(`Generated Connections Excel with ${data.length} records`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate Connections Excel: ${error.message}`);
      throw error;
    }
  }

  async generatePostsExcel(data: any[]): Promise<Buffer> {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Posts');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      this.logger.log(`Generated Posts Excel with ${data.length} records`);
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to generate Posts Excel: ${error.message}`);
      throw error;
    }
  }
}
