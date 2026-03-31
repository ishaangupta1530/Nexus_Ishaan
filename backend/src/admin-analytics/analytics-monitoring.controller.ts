import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminAnalyticsService } from './admin-analytics.service';
import { MonitoringService } from './monitoring.service';

@ApiTags('analytics-monitoring')
@ApiBearerAuth('JWT')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AnalyticsMonitoringController {
  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly monitoringService: MonitoringService,
  ) {}

  @Get('trending/performance')
  getTrendingPerformance(
    @Query('period', new DefaultValuePipe('day')) period: string,
  ) {
    return this.adminAnalyticsService.getTrendingPerformance(period);
  }

  @Get('discovery/recommendations-stats')
  getDiscoveryRecommendationsStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getDiscoveryRecommendationsStats(
      days,
      startDate,
      endDate,
    );
  }

  @Get('discovery/search-trends')
  getDiscoverySearchTrends(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getDiscoverySearchTrends(
      days,
      startDate,
      endDate,
    );
  }

  @Get('discovery/feed-engagement')
  getDiscoveryFeedEngagement(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getDiscoveryFeedEngagement(
      days,
      startDate,
      endDate,
    );
  }

  @Get('jobs/health')
  getJobsHealth() {
    return this.adminAnalyticsService.getJobsHealth();
  }

  // ==================== Monitoring Endpoints ====================

  @Get('monitoring/alerts')
  getRecentAlerts(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.monitoringService.getRecentAlerts(limit);
  }

  @Get('monitoring/alerts/critical')
  getCriticalAlerts() {
    return this.monitoringService.getCriticalAlerts();
  }

  @Patch('monitoring/alerts/:id/acknowledge')
  acknowledgeAlert(
    @Param('id') alertId: string,
    @GetCurrentUser('sub') userId: string,
  ) {
    return this.monitoringService.acknowledgeAlert(alertId, userId);
  }

  @Get('monitoring/performance/aggregated')
  getAggregatedMetrics(
    @Query('type', new DefaultValuePipe('daily')) type: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    this.validateDays(days);
    const aggregationType =
      type === 'hourly'
        ? 'hourly'
        : type === 'weekly'
          ? 'weekly'
          : type === 'monthly'
            ? 'monthly'
            : 'daily';

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    return this.monitoringService.getAggregatedMetrics(aggregationType, startDate, endDate);
  }

  @Get('monitoring/queue-health')
  async getQueueHealth() {
    await this.monitoringService.monitorQueueHealth();
    return this.adminAnalyticsService.getJobsHealth();
  }

  @Get('monitoring/performance/anomalies')
  getPerformanceAnomalies(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
    @Query('type') metricType?: string,
  ) {
    this.validateDays(days);
    return this.adminAnalyticsService.getPerformanceAnomalies(days, metricType);
  }

  @Get('monitoring/trending-scores')
  getTrendingScoreLog(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
    @Query('minAnomalyScore', new DefaultValuePipe(0)) minAnomalyScore?: string,
  ) {
    this.validateDays(days);
    const anomalyThreshold = minAnomalyScore
      ? parseFloat(minAnomalyScore)
      : 0;
    return this.adminAnalyticsService.getTrendingScoreLog(days, anomalyThreshold);
  }

  @Get('monitoring/dashboard/summary')
  getDashboardSummary(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number) {
    this.validateDays(days);
    return this.adminAnalyticsService.getMonitoringDashboardSummary(days);
  }

  private validateDays(days: number): void {
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException('days must be between 1 and 365');
    }
  }
}
