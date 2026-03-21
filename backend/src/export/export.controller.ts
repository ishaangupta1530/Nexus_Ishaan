import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Param,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { CsvGenerator } from './generators/csv.generator';
import { JsonGenerator } from './generators/json.generator';
import { ExcelGenerator } from './generators/excel.generator';
import { PdfGenerator } from './generators/pdf.generator';

export class ExportRequestDto {
  @IsEnum(['ANALYTICS', 'REFERRALS', 'CONNECTIONS', 'CUSTOM'])
  type: 'ANALYTICS' | 'REFERRALS' | 'CONNECTIONS' | 'CUSTOM';

  @IsEnum(['CSV', 'PDF', 'EXCEL', 'JSON'])
  format: 'CSV' | 'PDF' | 'EXCEL' | 'JSON';

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

interface ExportJob {
  id: string;
  format: string;
  filename: string;
  data: Buffer;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  error?: string;
  createdAt: Date;
}

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  private readonly logger = new Logger(ExportController.name);
  private readonly jobs = new Map<string, ExportJob>();

  constructor(
    private readonly csvGenerator: CsvGenerator,
    private readonly jsonGenerator: JsonGenerator,
    private readonly excelGenerator: ExcelGenerator,
    private readonly pdfGenerator: PdfGenerator,
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async exportData(
    @Body() dto: ExportRequestDto,
    @GetCurrentUser('userId') userId: string,
  ) {
    try {
      if (!dto.type || !dto.format) {
        throw new BadRequestException('Missing required fields: type and format');
      }

      // Generate job ID
      const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Create job entry
      const job: ExportJob = {
        id: jobId,
        format: dto.format,
        filename: `${dto.type.toLowerCase()}-export`,
        data: Buffer.alloc(0),
        status: 'PROCESSING',
        progress: 0,
        createdAt: new Date(),
      };

      this.jobs.set(jobId, job);

      // Process export asynchronously
      setImmediate(async () => {
        try {
          job.progress = 25;

          const mockData = this._getMockDataForType(dto.type);
          job.progress = 50;

          const formatLower = dto.format.toLowerCase();
          let buffer: Buffer;

          switch (formatLower) {
            case 'csv':
              buffer = this.csvGenerator.generate(mockData);
              break;

            case 'json':
              buffer = this.jsonGenerator.generate(mockData, job.filename, userId);
              break;

            case 'excel':
              buffer = this.excelGenerator.generate(mockData);
              break;

            case 'pdf': {
              const pdfContent = [
                {
                  heading: `${dto.type} Export`,
                  content: mockData,
                },
              ];
              buffer = await this.pdfGenerator.generate(
                dto.type.toLowerCase(),
                pdfContent,
              );
              break;
            }

            default:
              throw new Error(`Invalid format: ${dto.format}`);
          }

          job.progress = 75;
          job.data = buffer;
          job.progress = 100;
          job.status = 'COMPLETED';

          // Clean up old jobs after 5 minutes
          setTimeout(() => this.jobs.delete(jobId), 5 * 60 * 1000);
        } catch (error) {
          job.status = 'FAILED';
          job.error = error instanceof Error ? error.message : 'Unknown error';
        }
      });

      return {
        jobId,
        status: 'PENDING',
        message: 'Export processing started',
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Export request failed',
      );
    }
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return {
        status: 'FAILED',
        error: 'Job not found',
        progress: 0,
      };
    }

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
    };
  }

  @Get('download/:jobId')
  async download(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'FAILED') {
      return res.status(400).json({ error: job.error });
    }

    if (job.status !== 'COMPLETED') {
      return res.status(202).json({ error: 'Export not yet completed' });
    }

    try {
      // Determine content type
      const contentTypeMap: Record<string, string> = {
        csv: 'text/csv',
        json: 'application/json',
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      };

      const contentType = contentTypeMap[job.format.toLowerCase()] || 'application/octet-stream';
      const timestamp = Date.now();
      const extension = this._getFileExtension(job.format);
      const finalFilename = `${job.filename}-${timestamp}.${extension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${finalFilename}"`,
      );
      res.setHeader('Content-Length', job.data.length);

      return res.send(job.data);
    } catch (error) {
      this.logError('Download error:', error);
      return res.status(500).json({
        error: 'Download failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private logError(message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    this.logger.error(`${message} ${errorMessage}`);
  }

  private _getFileExtension(format: string): string {
    const extensionMap: Record<string, string> = {
      CSV: 'csv',
      PDF: 'pdf',
      EXCEL: 'xlsx',
      JSON: 'json',
    };
    return extensionMap[format] || format.toLowerCase();
  }

  private _getMockDataForType(type: string): any[] {
    switch (type) {
      case 'ANALYTICS':
        return [
          {
            metric: 'Profile Views',
            value: 1250,
            date: '2026-03-18',
            change: '+5.2%',
          },
          {
            metric: 'Engagement Rate',
            value: '42%',
            date: '2026-03-18',
            change: '+2.1%',
          },
          {
            metric: 'Connections',
            value: 328,
            date: '2026-03-18',
            change: '+12',
          },
        ];

      case 'REFERRALS':
        return [
          {
            id: '1',
            name: 'John Doe',
            email: 'john@example.com',
            status: 'Completed',
            reward: '$50',
            date: '2026-03-10',
          },
          {
            id: '2',
            name: 'Jane Smith',
            email: 'jane@example.com',
            status: 'Pending',
            reward: '$50',
            date: '2026-03-15',
          },
        ];

      case 'CONNECTIONS':
        return [
          {
            id: '1',
            name: 'Alice Johnson',
            email: 'alice@example.com',
            role: 'Student',
            connectedDate: '2026-01-15',
            lastActive: '2026-03-17',
          },
          {
            id: '2',
            name: 'Bob Williams',
            email: 'bob@example.com',
            role: 'Alumni',
            connectedDate: '2026-02-20',
            lastActive: '2026-03-18',
          },
        ];

      case 'CUSTOM':
      default:
        return [
          {
            id: '1',
            name: 'Sample Entry 1',
            value: 100,
            status: 'Active',
          },
          {
            id: '2',
            name: 'Sample Entry 2',
            value: 200,
            status: 'Inactive',
          },
        ];
    }
  }
}
