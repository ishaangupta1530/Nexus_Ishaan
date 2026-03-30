-- CreateTable algorithm_performance
CREATE TABLE "algorithm_performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricType" TEXT NOT NULL,
    "executionTimeMs" INTEGER NOT NULL,
    "cacheHitRate" REAL NOT NULL DEFAULT 0,
    "cacheMissRate" REAL NOT NULL DEFAULT 0,
    "clickThroughRate" REAL NOT NULL DEFAULT 0,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "conversionRate" REAL NOT NULL DEFAULT 0,
    "timeSpentSeconds" REAL NOT NULL DEFAULT 0,
    "anomalyDetected" BOOLEAN NOT NULL DEFAULT false,
    "anomalyType" TEXT,
    "anomalyScore" REAL NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateTable discovery_metrics
CREATE TABLE "discovery_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recommendationsSent" INTEGER NOT NULL DEFAULT 0,
    "recommendationsAccepted" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" REAL NOT NULL DEFAULT 0,
    "searchQueries" INTEGER NOT NULL DEFAULT 0,
    "searchSuccessRate" REAL NOT NULL DEFAULT 0,
    "feedEngagementRate" REAL NOT NULL DEFAULT 0,
    "scrollDepthPercent" REAL NOT NULL DEFAULT 0,
    "returningVisitorRate" REAL NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateTable system_health_alerts
CREATE TABLE "system_health_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "threshold" REAL,
    "currentValue" REAL,
    "metadata" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable queue_metrics
CREATE TABLE "queue_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueName" TEXT NOT NULL,
    "waitingCount" INTEGER NOT NULL DEFAULT 0,
    "delayedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "avgProcessTime" REAL NOT NULL DEFAULT 0,
    "backlogHealth" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateTable trending_score_logs
CREATE TABLE "trending_score_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "position" INTEGER NOT NULL,
    "userEngagements" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "timeSpentSeconds" REAL NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anomalyScore" REAL NOT NULL DEFAULT 0,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable analytics_aggregations
CREATE TABLE "analytics_aggregations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aggregationType" TEXT NOT NULL,
    "metricsSnapshot" TEXT NOT NULL,
    "anomaliesCount" INTEGER NOT NULL DEFAULT 0,
    "alertsTriggered" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
