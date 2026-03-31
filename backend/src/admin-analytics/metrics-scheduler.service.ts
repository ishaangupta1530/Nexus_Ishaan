import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminAnalyticsService } from './admin-analytics.service';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class MetricsSchedulerService {
  private readonly logger = new Logger(MetricsSchedulerService.name);

  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly monitoringService: MonitoringService,
  ) {}

  /**
   * Collect algorithm performance metrics every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async collectHourlyMetrics() {
    this.logger.debug('Starting hourly metrics collection...');
    try {
      const metrics = await this.adminAnalyticsService.getTrendingPerformance('hour');
      await this.monitoringService.recordAlgorithmPerformance({
        metricType: 'trending',
        executionTimeMs: metrics.algorithmExecutionTimeMs || 0,
        cacheHitRate: metrics.cacheHitRate || 0,
        cacheMissRate: metrics.cacheMissRate || 0,
        clickThroughRate: metrics.clickThroughRate || 0,
        engagementRate: metrics.engagementRate || 0,
        timeSpentSeconds: metrics.avgTimeSpentSeconds || 0,
        period: 'hour',
      });

      this.logger.log('Hourly metrics collected successfully');
    } catch (error) {
      this.logger.error('Failed to collect hourly metrics', error);
    }
  }

  /**
   * Collect daily aggregated metrics every day at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async collectDailyMetrics() {
    this.logger.debug('Starting daily metrics collection...');
    try {
      const [
        trendingPerf,
        discoveryRecs,
        discoverySearch,
        discoveryFeed,
      ] = await Promise.all([
        this.adminAnalyticsService.getTrendingPerformance('day'),
        this.adminAnalyticsService.getDiscoveryRecommendationsStats(1),
        this.adminAnalyticsService.getDiscoverySearchTrends(1),
        this.adminAnalyticsService.getDiscoveryFeedEngagement(1),
      ]);

      // Record algorithm performance
      await this.monitoringService.recordAlgorithmPerformance({
        metricType: 'trending',
        executionTimeMs: trendingPerf.algorithmExecutionTimeMs || 0,
        cacheHitRate: trendingPerf.cacheHitRate || 0,
        cacheMissRate: trendingPerf.cacheMissRate || 0,
        clickThroughRate: trendingPerf.clickThroughRate || 0,
        engagementRate: trendingPerf.engagementRate || 0,
        timeSpentSeconds: trendingPerf.avgTimeSpentSeconds || 0,
        period: 'day',
      });

      // Record discovery metrics
      await this.monitoringService.recordDiscoveryMetrics({
        recommendationsSent: discoveryRecs.totalRecommendationsServed || 0,
        recommendationsAccepted: discoveryRecs.acceptedRecommendations || 0,
        acceptanceRate: discoveryRecs.acceptanceRate || 0,
        searchQueries: discoverySearch.totalSearches || 0,
        searchSuccessRate: discoverySearch.successRate || 0,
        feedEngagementRate: discoveryFeed.feedClickThroughRate || 0,
        scrollDepthPercent: discoveryFeed.avgScrollDepthPercent || 0,
        returningVisitorRate: discoveryFeed.returnVisitRate || 0,
        period: 'day',
      });

      this.logger.log('Daily metrics collected successfully');
    } catch (error) {
      this.logger.error('Failed to collect daily metrics', error);
    }
  }

  /**
   * Monitor queue health every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorQueueHealth() {
    this.logger.debug('Checking queue health...');
    try {
      await this.monitoringService.monitorQueueHealth();
      this.logger.log('Queue health check completed');
    } catch (error) {
      this.logger.error('Failed to monitor queue health', error);
    }
  }

  /**
   * Clean up old metrics records weekly
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldMetrics() {
    this.logger.debug('Starting old metrics cleanup...');
    try {
      await this.monitoringService.cleanupOldMetrics(90); // Keep 90 days
      this.logger.log('Old metrics cleaned up successfully');
    } catch (error) {
      this.logger.error('Failed to cleanup old metrics', error);
    }
  }

  /**
   * Generate weekly digest of alerts every Monday at 8 AM
   */
  @Cron('0 8 * * 1')
  async generateWeeklyAlertDigest() {
    this.logger.debug('Generating alert digest...');
    try {
      const alerts = await this.monitoringService.getRecentAlerts(1000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyAlerts = alerts.filter((a) => a.createdAt >= weekAgo);

      if (weeklyAlerts.length > 0) {
        const summary = {
          period: 'Last 7 days',
          totalAlerts: weeklyAlerts.length,
          criticalCount: weeklyAlerts.filter((a) => a.severity === 'critical').length,
          warningCount: weeklyAlerts.filter((a) => a.severity === 'warning').length,
          infoCount: weeklyAlerts.filter((a) => a.severity === 'info').length,
          topAlertTypes: this.getTopAlertTypes(weeklyAlerts),
        };

        this.logger.log(`Alert digest: ${JSON.stringify(summary)}`);
        // TODO: Send email digest to admins
      } else {
        this.logger.log('No alerts to report');
      }
    } catch (error) {
      this.logger.error('Failed to generate alert digest', error);
    }
  }

  private getTopAlertTypes(
    alerts: any[],
  ): Record<string, number> {
    return alerts.reduce(
      (acc, alert) => {
        acc[alert.alertType] = (acc[alert.alertType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
