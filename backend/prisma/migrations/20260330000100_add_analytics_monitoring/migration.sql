-- CreateTable algorithm_performance
CREATE TABLE "algorithm_performance" (
    "id" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "executionTimeMs" INTEGER NOT NULL,
    "cacheHitRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cacheMissRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickThroughRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeSpentSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "anomalyDetected" BOOLEAN NOT NULL DEFAULT false,
    "anomalyType" TEXT,
    "anomalyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "algorithm_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable discovery_metrics
CREATE TABLE "discovery_metrics" (
    "id" TEXT NOT NULL,
    "recommendationsSent" INTEGER NOT NULL DEFAULT 0,
    "recommendationsAccepted" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "searchQueries" INTEGER NOT NULL DEFAULT 0,
    "searchSuccessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedEngagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scrollDepthPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returningVisitorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "discovery_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable system_health_alerts
CREATE TABLE "system_health_alerts" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "metadata" JSONB,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "system_health_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable queue_metrics
CREATE TABLE "queue_metrics" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "waitingCount" INTEGER NOT NULL DEFAULT 0,
    "delayedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "avgProcessTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "backlogHealth" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "queue_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable trending_score_logs
CREATE TABLE "trending_score_logs" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "userEngagements" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "timeSpentSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anomalyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "trending_score_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable analytics_aggregations
CREATE TABLE "analytics_aggregations" (
    "id" TEXT NOT NULL,
    "aggregationType" TEXT NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "anomaliesCount" INTEGER NOT NULL DEFAULT 0,
    "alertsTriggered" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_aggregations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "algorithm_performance_metricType_recordedAt_idx" ON "algorithm_performance"("metricType", "recordedAt");

-- CreateIndex
CREATE INDEX "algorithm_performance_period_recordedAt_idx" ON "algorithm_performance"("period", "recordedAt");

-- CreateIndex
CREATE INDEX "algorithm_performance_anomalyDetected_recordedAt_idx" ON "algorithm_performance"("anomalyDetected", "recordedAt");

-- CreateIndex
CREATE INDEX "discovery_metrics_period_recordedAt_idx" ON "discovery_metrics"("period", "recordedAt");

-- CreateIndex
CREATE INDEX "system_health_alerts_alertType_severity_createdAt_idx" ON "system_health_alerts"("alertType", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "system_health_alerts_acknowledged_createdAt_idx" ON "system_health_alerts"("acknowledged", "createdAt");

-- CreateIndex
CREATE INDEX "queue_metrics_queueName_recordedAt_idx" ON "queue_metrics"("queueName", "recordedAt");

-- CreateIndex
CREATE INDEX "queue_metrics_backlogHealth_recordedAt_idx" ON "queue_metrics"("backlogHealth", "recordedAt");

-- CreateIndex
CREATE INDEX "trending_score_logs_contentType_period_calculatedAt_idx" ON "trending_score_logs"("contentType", "period", "calculatedAt");

-- CreateIndex
CREATE INDEX "trending_score_logs_isAnomaly_calculatedAt_idx" ON "trending_score_logs"("isAnomaly", "calculatedAt");

-- CreateIndex
CREATE INDEX "analytics_aggregations_aggregationType_startDate_endDate_idx" ON "analytics_aggregations"("aggregationType", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "analytics_aggregations_createdAt_idx" ON "analytics_aggregations"("createdAt");
