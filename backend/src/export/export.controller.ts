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
import { ConnectionStatus, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly csvGenerator: CsvGenerator,
    private readonly jsonGenerator: JsonGenerator,
    private readonly excelGenerator: ExcelGenerator,
    private readonly pdfGenerator: PdfGenerator,
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  async exportData(
    @Body() dto: ExportRequestDto,
    @GetCurrentUser() currentUser: { sub?: string; userId?: string },
  ) {
    try {
      if (!dto.type || !dto.format) {
        throw new BadRequestException('Missing required fields: type and format');
      }

      const userId = currentUser?.sub || currentUser?.userId;
      if (!userId) {
        throw new BadRequestException('Unable to resolve current user ID');
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

          const exportData = await this._getDataForType(dto.type, userId, dto.filters);
          job.progress = 50;

          const formatLower = dto.format.toLowerCase();
          let buffer: Buffer;

          switch (formatLower) {
            case 'csv':
              buffer = this.csvGenerator.generate(exportData);
              break;

            case 'json':
              buffer = this.jsonGenerator.generate(exportData, job.filename, userId);
              break;

            case 'excel':
              buffer = this.excelGenerator.generate(exportData);
              break;

            case 'pdf': {
              const pdfContent = [
                {
                  heading: `${dto.type} Export`,
                  content: exportData,
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

  private async _getDataForType(
    type: string,
    userId: string,
    filters?: Record<string, unknown>,
  ): Promise<any[]> {
    const normalizedType = type.toUpperCase();

    switch (normalizedType) {
      case 'REFERRALS':
        return this._getReferralExportData(userId, filters);
      case 'CONNECTIONS':
        return this._getConnectionExportData(userId, filters);
      default:
        return [];
    }
  }

  private async _getReferralExportData(
    userId: string,
    filters?: Record<string, unknown>,
  ): Promise<any[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAdmin = user?.role === Role.ADMIN;
    const statusFilter = typeof filters?.status === 'string' ? filters.status : undefined;

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    const dateRangeRaw = filters?.dateRange as { start?: string; end?: string } | undefined;
    if (dateRangeRaw?.start) {
      createdAtFilter.gte = new Date(dateRangeRaw.start);
    }
    if (dateRangeRaw?.end) {
      createdAtFilter.lte = new Date(dateRangeRaw.end);
    }

    const andConditions: Record<string, unknown>[] = [];

    if (!isAdmin) {
      andConditions.push({
        OR: [{ status: 'APPROVED' }, { alumniId: userId }],
      });
    }

    if (statusFilter) {
      andConditions.push({ status: statusFilter });
    }

    if (Object.keys(createdAtFilter).length > 0) {
      andConditions.push({ createdAt: createdAtFilter });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const referrals = await this.prisma.referral.findMany({
      where,
      select: {
        id: true,
        company: true,
        jobTitle: true,
        location: true,
        status: true,
        createdAt: true,
        deadline: true,
        postedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    return referrals.map((referral) => ({
      id: referral.id,
      company: referral.company,
      jobTitle: referral.jobTitle,
      location: referral.location,
      status: referral.status,
      createdAt: referral.createdAt,
      deadline: referral.deadline,
      postedByName: referral.postedBy.name,
      postedByEmail: referral.postedBy.email,
      applicationsCount: referral._count.applications,
    }));
  }

  private async _getConnectionExportData(
    userId: string,
    filters?: Record<string, unknown>,
  ): Promise<any[]> {
    const rawStatus =
      typeof filters?.status === 'string' && filters.status.trim().length > 0
        ? filters.status.toUpperCase()
        : ConnectionStatus.ACCEPTED;

    const statusFilter = (Object.values(ConnectionStatus) as string[]).includes(rawStatus)
      ? (rawStatus as ConnectionStatus)
      : ConnectionStatus.ACCEPTED;

    const connections = await this.prisma.connection.findMany({
      where: {
        OR: [{ requesterId: userId }, { recipientId: userId }],
        status: statusFilter,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        requesterId: true,
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                location: true,
              },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                location: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    return connections.map((connection) => {
      const otherUser =
        connection.requesterId === userId ? connection.recipient : connection.requester;

      return {
        id: connection.id,
        connectedAt: connection.createdAt,
        status: connection.status,
        userId: otherUser.id,
        name: otherUser.name,
        email: otherUser.email,
        role: otherUser.role,
        location: otherUser.profile?.location || '',
      };
    });
  }

}
