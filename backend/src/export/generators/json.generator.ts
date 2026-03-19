import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class JsonGenerator {
  private readonly logger = new Logger(JsonGenerator.name);

  generate(data: any[], filename: string, userId: string): Buffer {
    try {
      const jsonData = {
        metadata: {
          filename,
          userId,
          timestamp: new Date().toISOString(),
          recordCount: data.length,
        },
        data,
      };

      this.logger.log(`Generated JSON with ${data.length} records`);
      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate JSON: ${error.message}`);
      throw error;
    }
  }

  generateAnalyticsJson(data: any[], userId: string): Buffer {
    try {
      const jsonData = {
        type: 'ANALYTICS',
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
          recordCount: data.length,
        },
        data,
      };

      this.logger.log(`Generated Analytics JSON with ${data.length} records`);
      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate Analytics JSON: ${error.message}`);
      throw error;
    }
  }

  generateReferralsJson(data: any[], userId: string): Buffer {
    try {
      const jsonData = {
        type: 'REFERRALS',
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
          recordCount: data.length,
        },
        data,
      };

      this.logger.log(`Generated Referrals JSON with ${data.length} records`);
      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate Referrals JSON: ${error.message}`);
      throw error;
    }
  }

  generateConnectionsJson(data: any[], userId: string): Buffer {
    try {
      const jsonData = {
        type: 'CONNECTIONS',
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
          recordCount: data.length,
        },
        data,
      };

      this.logger.log(`Generated Connections JSON with ${data.length} records`);
      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate Connections JSON: ${error.message}`);
      throw error;
    }
  }

  generatePostsJson(data: any[], userId: string): Buffer {
    try {
      const jsonData = {
        type: 'POSTS',
        metadata: {
          userId,
          timestamp: new Date().toISOString(),
          recordCount: data.length,
        },
        data,
      };

      this.logger.log(`Generated Posts JSON with ${data.length} records`);
      return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to generate Posts JSON: ${error.message}`);
      throw error;
    }
  }
}
