import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminAnalyticsService } from './admin-analytics.service';

@ApiTags('analytics-admin')
@ApiBearerAuth('JWT')
@Controller('analytics/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('platform-stats')
  getPlatformStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getPlatformStats(days, startDate, endDate);
  }

  @Get('user-growth')
  getUserGrowth(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getUserGrowth(days, startDate, endDate);
  }

  @Get('content-stats')
  getContentStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getContentStats(days, startDate, endDate);
  }

  @Get('moderation-queue')
  getModerationQueue(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getModerationQueue(days, startDate, endDate);
  }

  private validateDays(days: number): void {
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException('days must be between 1 and 365');
    }
  }
}
