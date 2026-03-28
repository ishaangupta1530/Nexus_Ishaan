-- CreateTable
CREATE TABLE "trending_cache" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trending_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trending_cache_contentType_contentId_period_key"
ON "trending_cache"("contentType", "contentId", "period");

-- CreateIndex
CREATE INDEX "trending_cache_contentType_period_score_idx"
ON "trending_cache"("contentType", "period", "score");
