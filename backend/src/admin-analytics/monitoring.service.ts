import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/services/queue.service';

export interface AlgorithmMetrics {
  metricType: string;
  executionTimeMs: number;
  cacheHitRate: number;
  cacheMissRate: number;
  clickThroughRate: number;
  engagementRate: number;
  timeSpentSeconds: number;
  conversionRate?: number;
  period: 'hour' | 'day' | 'week' | 'month';
}

export interface DiscoveryMetricsData {
  recommendationsSent: number;
  recommendationsAccepted: number;
  acceptanceRate: number;
  searchQueries: number;
  searchSuccessRate: number;
  feedEngagementRate: number;
  scrollDepthPercent: number;
  returningVisitorRate: number;
  period: 'hour' | 'day' | 'week' | 'month';
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly CACHE_MISS_THRESHOLD = 0.2; // 20%
  private readonly ANOMALY_SCORE_THRESHOLD = 2.5; // Standard deviations

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Track algorithm performance metrics
   */
  async recordAlgorithmPerformance(metrics: AlgorithmMetrics): Promise<void> {
    try {
      const { anomalyDetected, anomalyScore, anomalyType } =
        this.detectAnomalies(metrics);

      await this.prisma.algorithmPerformance.create({
        data: {
          metricType: metrics.metricType,
          executionTimeMs: metrics.executionTimeMs,
          cacheHitRate: metrics.cacheHitRate,
          cacheMissRate: metrics.cacheMissRate,
          clickThroughRate: metrics.clickThroughRate,
          engagementRate: metrics.engagementRate,
          conversionRate: metrics.conversionRate || 0,
          timeSpentSeconds: metrics.timeSpentSeconds,
          anomalyDetected,
          anomalyType,
          anomalyScore,
          period: metrics.period,
        },
      });

      // Alert on cache misses
      if (metrics.cacheMissRate > this.CACHE_MISS_THRESHOLD) {
        await this.createAlert(
          'cache_miss',
          'warning',
          `Cache miss rate exceeded threshold: ${(metrics.cacheMissRate * 100).toFixed(1)}%`,
          metrics.cacheMissRate,
        );
      }

      // Alert on anomalies
      if (anomalyDetected) {
        await this.createAlert(
          'anomaly',
          'warning',
          `${anomalyType} anomaly detected in ${metrics.metricType} algorithm`,
          anomalyScore,
        );
      }
    } catch (error) {
      this.logger.error('Failed to record algorithm performance', error);
    }
  }

  /**
   * Track discovery metrics
   */
  async recordDiscoveryMetrics(metrics: DiscoveryMetricsData): Promise<void> {
    try {
      await this.prisma.discoveryMetrics.create({
        data: {
          recommendationsSent: metrics.recommendationsSent,
          recommendationsAccepted: metrics.recommendationsAccepted,
          acceptanceRate: metrics.acceptanceRate,
          searchQueries: metrics.searchQueries,
          searchSuccessRate: metrics.searchSuccessRate,
          feedEngagementRate: metrics.feedEngagementRate,
          scrollDepthPercent: metrics.scrollDepthPercent,
          returningVisitorRate: metrics.returningVisitorRate,
          period: metrics.period,
        },
      });
    } catch (error) {
      this.logger.error('Failed to record discovery metrics', error);
    }
  }

  /**
   * Log trending scores for anomaly detection
   */
  async logTrendingScore(
    contentId: string,
    contentType: string,
    score: number,
    position: number,
    userEngagements: number,
    impressions: number,
    period: 'hour' | 'day' | 'week',
  ): Promise<void> {
    try {
      // Calculate anomaly score
      const anomalyData = await this.calculateTrendingAnomalyScore(score);

      await this.prisma.trendingScoreLog.create({
        data: {
          contentId,
          contentType,
          score,
          position,
          userEngagements,
          impressions,
          period,
          anomalyScore: anomalyData.anomalyScore,
          isAnomaly: anomalyData.isAnomaly,
        },
      });

      if (anomalyData.isAnomaly) {
        this.logger.warn(
          `Anomaly detected in trending score for ${contentType} ${contentId}`,
        );
        await this.createAlert(
          'anomaly',
          'warning',
          `Trending score anomaly detected for ${contentType}: ${contentId}`,
          anomalyData.anomalyScore,
        );
      }
    } catch (error) {
      this.logger.error('Failed to log trending score', error);
    }
  }

  /**
   * Monitor queue health and create alerts
   */
  async monitorQueueHealth(): Promise<void> {
    try {
      const health = await this.queueService.healthCheck();

      const exportQueueBacklog =
        health.exportQueue.waiting + health.exportQueue.delayed;
      const reportsQueueBacklog =
        health.reportsQueue.waiting + health.reportsQueue.delayed;

      // Record metrics
      await this.prisma.queueMetrics.create({
        data: {
          queueName: 'exportQueue',
          waitingCount: health.exportQueue.waiting,
          delayedCount: health.exportQueue.delayed,
          completedCount: health.exportQueue.completed || 0,
          failedCount: health.exportQueue.failed || 0,
          backlogHealth: this.assessQueueHealth(exportQueueBacklog),
          period: 'monitoring',
        },
      });

      await this.prisma.queueMetrics.create({
        data: {
          queueName: 'reportsQueue',
          waitingCount: health.reportsQueue.waiting,
          delayedCount: health.reportsQueue.delayed,
          completedCount: health.reportsQueue.completed || 0,
          failedCount: health.reportsQueue.failed || 0,
          backlogHealth: this.assessQueueHealth(reportsQueueBacklog),
          period: 'monitoring',
        },
      });

      // Alert on critical backlog
      if (exportQueueBacklog > 1000) {
        await this.createAlert(
          'queue_backlog',
          'critical',
          `Export queue backlog critical: ${exportQueueBacklog} items`,
          exportQueueBacklog,
        );
      }

      if (reportsQueueBacklog > 500) {
        await this.createAlert(
          'queue_backlog',
          'warning',
          `Reports queue backlog high: ${reportsQueueBacklog} items`,
          reportsQueueBacklog,
        );
      }
    } catch (error) {
      this.logger.error('Failed to monitor queue health', error);
    }
  }

  /**
   * Get recent alerts for dashboard
   */
  async getRecentAlerts(limit = 50) {
    return this.prisma.systemHealthAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get unacknowledged critical alerts
   */
  async getCriticalAlerts() {
    return this.prisma.systemHealthAlert.findMany({
      where: {
        severity: 'critical',
        acknowledged: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    await this.prisma.systemHealthAlert.update({
      where: { id: alertId },
      data: {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });
  }

  /**
   * Get aggregated metrics for a period
   */
  async getAggregatedMetrics(
    aggregationType: 'hourly' | 'daily' | 'weekly' | 'monthly',
    startDate: Date,
    endDate: Date,
  ) {
    const algorithmMetrics = await this.prisma.algorithmPerformance.findMany({
      where: {
        recordedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const discoveryMetrics = await this.prisma.discoveryMetrics.findMany({
      where: {
        recordedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const alerts = await this.prisma.systemHealthAlert.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculate aggregations
    const avgExecutionTime =
      algorithmMetrics.length > 0
        ? algorithmMetrics.reduce((sum, m) => sum + m.executionTimeMs, 0) /
          algorithmMetrics.length
        : 0;

    const avgCacheHitRate =
      algorithmMetrics.length > 0
        ? algorithmMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) /
          algorithmMetrics.length
        : 0;

    const avgEngagementRate =
      algorithmMetrics.length > 0
        ? algorithmMetrics.reduce((sum, m) => sum + m.engagementRate, 0) /
          algorithmMetrics.length
        : 0;

    return {
      period: { aggregationType, startDate, endDate },
      algorithmMetrics: {
        count: algorithmMetrics.length,
        avgExecutionTimeMs: Number(avgExecutionTime.toFixed(2)),
        avgCacheHitRate: Number(avgCacheHitRate.toFixed(4)),
        avgEngagementRate: Number(avgEngagementRate.toFixed(4)),
        anomaliesDetected: algorithmMetrics.filter((m) => m.anomalyDetected).length,
      },
      discoveryMetrics: {
        count: discoveryMetrics.length,
        avgAcceptanceRate:
          discoveryMetrics.length > 0
            ? Number(
                (
                  discoveryMetrics.reduce((sum, m) => sum + m.acceptanceRate, 0) /
                  discoveryMetrics.length
                ).toFixed(4),
              )
            : 0,
        avgSearchSuccessRate:
          discoveryMetrics.length > 0
            ? Number(
                (
                  discoveryMetrics.reduce((sum, m) => sum + m.searchSuccessRate, 0) /
                  discoveryMetrics.length
                ).toFixed(4),
              )
            : 0,
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        warning: alerts.filter((a) => a.severity === 'warning').length,
      },
    };
  }

  /**
   * Clean up old metrics records (retention policy)
   */
  async cleanupOldMetrics(retentionDays = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const [algorithmDeleted, discoveryDeleted, trendingDeleted, queueDeleted] =
        await Promise.all([
          this.prisma.algorithmPerformance.deleteMany({
            where: { recordedAt: { lt: cutoffDate } },
          }),
          this.prisma.discoveryMetrics.deleteMany({
            where: { recordedAt: { lt: cutoffDate } },
          }),
          this.prisma.trendingScoreLog.deleteMany({
            where: { calculatedAt: { lt: cutoffDate } },
          }),
          this.prisma.queueMetrics.deleteMany({
            where: { recordedAt: { lt: cutoffDate } },
          }),
        ]);

      this.logger.log(
        `Cleaned up old metrics: Algorithm=${algorithmDeleted.count}, Discovery=${discoveryDeleted.count}, Trending=${trendingDeleted.count}, Queue=${queueDeleted.count}`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup old metrics', error);
    }
  }

  // ==================== Private Helpers ====================

  private detectAnomalies(metrics: AlgorithmMetrics): {
    anomalyDetected: boolean;
    anomalyType?: string;
    anomalyScore: number;
  } {
    const anomalies: string[] = [];
    let anomalyScore = 0;

    // Check for extremely high execution time
    if (metrics.executionTimeMs > 10000) {
      anomalies.push('excessive_execution_time');
      anomalyScore += 1.5;
    }

    // Check for low engagement
    if (metrics.engagementRate < 0.01 && metrics.metricType === 'trending') {
      anomalies.push('low_engagement');
      anomalyScore += 1.0;
    }

    // Check for zero cache hits
    if (metrics.cacheHitRate === 0) {
      anomalies.push('cache_disabled');
      anomalyScore += 0.8;
    }

    // Check for CTR anomaly
    if (metrics.clickThroughRate > 0.8) {
      anomalies.push('unusually_high_ctr');
      anomalyScore += 0.5;
    }

    return {
      anomalyDetected: anomalies.length > 0 && anomalyScore >= this.ANOMALY_SCORE_THRESHOLD,
      anomalyType: anomalies.length > 0 ? anomalies.join(',') : undefined,
      anomalyScore,
    };
  }

  private async calculateTrendingAnomalyScore(
    score: number,
  ): Promise<{ anomalyScore: number; isAnomaly: boolean }> {
    try {
      const recentScores = await this.prisma.trendingScoreLog.findMany({
        where: {
          calculatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        select: { score: true },
        take: 100,
      });

      if (recentScores.length < 3) {
        return { anomalyScore: 0, isAnomaly: false };
      }

      const scores = recentScores.map((r) => r.score);
      const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const variance =
        scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) {
        return { anomalyScore: 0, isAnomaly: false };
      }

      const zScore = Math.abs((score - mean) / stdDev);
      return {
        anomalyScore: zScore,
        isAnomaly: zScore > this.ANOMALY_SCORE_THRESHOLD,
      };
    } catch (error) {
      this.logger.error('Failed to calculate trending anomaly score', error);
      return { anomalyScore: 0, isAnomaly: false };
    }
  }

  private assessQueueHealth(backlogCount: number): string {
    if (backlogCount === 0) return 'healthy';
    if (backlogCount <= 100) return 'healthy';
    if (backlogCount <= 500) return 'warning';
    return 'critical';
  }

  private async createAlert(
    alertType: string,
    severity: 'info' | 'warning' | 'critical',
    message: string,
    currentValue?: number,
  ): Promise<void> {
    try {
      // Check if a similar unacknowledged alert exists from the last hour
      const lastHour = new Date(Date.now() - 60 * 60 * 1000);
      const existingAlert = await this.prisma.systemHealthAlert.findFirst({
        where: {
          alertType,
          severity,
          createdAt: { gte: lastHour },
          acknowledged: false,
        },
      });

      if (!existingAlert) {
        await this.prisma.systemHealthAlert.create({
          data: {
            alertType,
            severity,
            message,
            currentValue,
          },
        });

        this.logger.log(`Alert created: [${severity.toUpperCase()}] ${message}`);
      }
    } catch (error) {
      this.logger.error('Failed to create alert', error);
    }
  }
}
