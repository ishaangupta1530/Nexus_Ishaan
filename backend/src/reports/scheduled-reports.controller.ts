import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { ScheduledReportsService } from './scheduled-reports.service';
import { CreateScheduledReportDTO, UpdateScheduledReportDTO } from './dto';

@ApiTags('Scheduled Reports')
@ApiBearerAuth()
@Controller('scheduled-reports')
@UseGuards(JwtAuthGuard)
export class ScheduledReportsController {
  constructor(private readonly scheduledReportsService: ScheduledReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new scheduled report' })
  @ApiResponse({
    status: 201,
    description: 'Report created successfully',
    schema: {
      example: {
        id: 'report-id',
        name: 'Weekly Referrals Report',
        reportType: 'REFERRALS',
        format: 'pdf',
        schedule: '0 0 * * 1', // Monday at midnight
        recipients: ['user@example.com'],
        enabled: true,
        nextRunAt: '2024-01-08T00:00:00Z',
      },
    },
  })
  async createScheduledReport(
    @GetCurrentUser('userId') userId: string,
    @Body() dto: CreateScheduledReportDTO,
  ) {
    return this.scheduledReportsService.createScheduledReport(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all scheduled reports for the user' })
  @ApiResponse({
    status: 200,
    description: 'List of scheduled reports',
    schema: {
      example: {
        reports: [
          {
            id: 'report-id',
            name: 'Weekly Referrals',
            reportType: 'REFERRALS',
            format: 'pdf',
            schedule: '0 0 * * 1',
            enabled: true,
            lastRunAt: '2024-01-01T00:00:00Z',
            nextRunAt: '2024-01-08T00:00:00Z',
          },
        ],
        pagination: {
          skip: 0,
          take: 10,
          total: 1,
          pages: 1,
        },
      },
    },
  })
  async listScheduledReports(
    @GetCurrentUser('userId') userId: string,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10,
  ) {
    return this.scheduledReportsService.listScheduledReports(userId, skip, take);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific scheduled report' })
  @ApiResponse({
    status: 200,
    description: 'Scheduled report details',
  })
  async getScheduledReport(
    @GetCurrentUser('userId') userId: string,
    @Param('id') reportId: string,
  ) {
    return this.scheduledReportsService.getScheduledReport(reportId, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a scheduled report' })
  @ApiResponse({
    status: 200,
    description: 'Report updated successfully',
  })
  async updateScheduledReport(
    @GetCurrentUser('userId') userId: string,
    @Param('id') reportId: string,
    @Body() dto: UpdateScheduledReportDTO,
  ) {
    return this.scheduledReportsService.updateScheduledReport(reportId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a scheduled report' })
  @ApiResponse({
    status: 204,
    description: 'Report deleted successfully',
  })
  async deleteScheduledReport(
    @GetCurrentUser('userId') userId: string,
    @Param('id') reportId: string,
  ) {
    return this.scheduledReportsService.deleteScheduledReport(reportId, userId);
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Trigger a scheduled report immediately' })
  @ApiResponse({
    status: 200,
    description: 'Report triggered successfully',
    schema: {
      example: {
        jobId: 'job-id',
      },
    },
  })
  async triggerReportNow(
    @GetCurrentUser('userId') userId: string,
    @Param('id') reportId: string,
  ) {
    return this.scheduledReportsService.triggerReportNow(reportId, userId);
  }
}
