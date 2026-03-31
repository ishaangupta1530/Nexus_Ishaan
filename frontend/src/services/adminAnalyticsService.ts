import api from './api';

export type AdminAnalyticsQuery = {
  days?: number;
  startDate?: string;
  endDate?: string;
};

export interface PlatformStatsResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  userStatistics: {
    totalUsers: number;
    totalActiveAccounts: number;
    newUsersInPeriod: number;
    byRole: Array<{ role: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    activeUsers: {
      dau: number;
      wau: number;
      mau: number;
    };
  };
  usageAnalytics: {
    sessionsInPeriod: number;
    activeSessionsNow: number;
    averageSessionsPerMau: number;
    trends: {
      newUsersPerDay: Array<{ date: string; count: number }>;
    };
  };
  systemHealth: {
    failedLoginsLast24h: number;
    lockedAccounts: number;
    securityEventsLast24h: number;
    healthScore: number;
  };
  generatedAt: string;
}

export interface UserGrowthResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    newUsers: number;
    previousPeriodNewUsers: number;
    growthRatePercent: number;
    averageNewUsersPerDay: number;
  };
  byRole: Array<{ role: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  generatedAt: string;
}

export interface ContentStatsResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totals: {
    posts: number;
    comments: number;
    referrals: number;
    projects: number;
    mentorships: number;
  };
  createdInPeriod: {
    posts: number;
    comments: number;
    referrals: number;
    projects: number;
    mentorships: number;
    total: number;
  };
  creationRates: {
    averagePerDay: number;
    byTypePerDay: {
      posts: number;
      comments: number;
      referrals: number;
      projects: number;
      mentorships: number;
    };
  };
  postModerationStatus: Array<{ status: string; count: number }>;
  trend: Array<{
    date: string;
    posts: number;
    comments: number;
    referrals: number;
    projects: number;
    mentorships: number;
    total: number;
  }>;
  generatedAt: string;
}

export interface ModerationQueueResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  queue: {
    pendingTotal: number;
    pendingByType: Array<{ type: string; count: number }>;
    pendingAging: {
      lessThan24h: number;
      between24hAnd72h: number;
      greaterThan72h: number;
    };
    topPendingReasons: Array<{ reason: string; count: number }>;
  };
  throughput: {
    resolvedInPeriod: number;
    dismissedInPeriod: number;
    processedInPeriod: number;
    averageResolutionHours: number;
  };
  trends: {
    reportsCreatedPerDay: Array<{ date: string; count: number }>;
  };
  generatedAt: string;
}

export type TrendingPeriod = 'hour' | 'day' | 'week';

export interface TrendingPostItem {
  postId: string;
  rank: number;
  score: number;
  subject: string;
  contentPreview: string;
  createdAt: string;
  upvotes: number;
  comments: number;
  creator: {
    id: string;
    name: string;
    role: string;
  };
}

export interface TrendingPostsResponse {
  period: 'HOUR' | 'DAY' | 'WEEK';
  calculatedAt: string;
  posts: TrendingPostItem[];
  source: 'redis' | 'database' | 'warming';
}

export interface TrendingScoreResponse {
  postId: string;
  period: 'HOUR' | 'DAY' | 'WEEK';
  score: number;
  rank: number | null;
}

export interface TrendingPerformanceResponse {
  period: string;
  generatedAt: string;
  clickThroughRate: number;
  avgTimeSpentSeconds: number;
  engagementRate: number;
  totalImpressions: number;
  totalClicks: number;
  algorithmExecutionTimeMs: number;
  cacheHitRate: number;
  cacheMissRate: number;
}

export interface RecommendationsStatsResponse {
  generatedAt: string;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totalRecommendationsServed: number;
  acceptedRecommendations: number;
  acceptanceRate: number;
  trend: Array<{ date: string; accepted: number }>;
  notes?: {
    source?: string;
    telemetryMode?: string;
  };
}

export interface SearchTrendsResponse {
  generatedAt: string;
  totalSearches: number;
  successfulSearches: number;
  successRate: number;
  topQueries: Array<{ query: string; count: number; successRate: number }>;
  trend: Array<{ date: string; searches: number; successfulSearches: number }>;
}

export interface FeedEngagementResponse {
  generatedAt: string;
  period: string;
  avgScrollDepthPercent: number;
  avgTimeOnFeedSeconds: number;
  feedClickThroughRate: number;
  totalFeedSessions: number;
  returnVisitRate: number;
  jobQueueBacklog: number;
  anomaliesDetected: number;
}

export interface QueueStats {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total?: number;
  error?: string;
}

export interface JobsHealthResponse {
  status: string;
  exportQueue: QueueStats;
  reportsQueue: QueueStats;
}

const adminAnalyticsService = {
  getPlatformStats: (params: AdminAnalyticsQuery) =>
    api.get<PlatformStatsResponse>('/analytics/admin/platform-stats', {
      params,
    }),

  getUserGrowth: (params: AdminAnalyticsQuery) =>
    api.get<UserGrowthResponse>('/analytics/admin/user-growth', { params }),

  getContentStats: (params: AdminAnalyticsQuery) =>
    api.get<ContentStatsResponse>('/analytics/admin/content-stats', { params }),

  getModerationQueue: (params: AdminAnalyticsQuery) =>
    api.get<ModerationQueueResponse>('/analytics/admin/moderation-queue', {
      params,
    }),

  getTrendingPosts: (period: TrendingPeriod = 'day', limit = 20) =>
    api.get<TrendingPostsResponse>('/trending/posts', {
      params: { period, limit },
    }),

  getTrendingPostScore: (postId: string, period: TrendingPeriod = 'day') =>
    api.get<TrendingScoreResponse>(`/trending/posts/${postId}/score`, {
      params: { period },
    }),

  recalculateTrending: () => api.post('/trending/recalculate'),

  getTrendingPerformance: (period: TrendingPeriod = 'day') =>
    api.get<TrendingPerformanceResponse>('/analytics/trending/performance', {
      params: { period },
    }),

  getRecommendationsStats: (params: AdminAnalyticsQuery) =>
    api.get<RecommendationsStatsResponse>(
      '/analytics/discovery/recommendations-stats',
      { params },
    ),

  getSearchTrends: (params: AdminAnalyticsQuery) =>
    api.get<SearchTrendsResponse>('/analytics/discovery/search-trends', {
      params,
    }),

  getFeedEngagement: (params: AdminAnalyticsQuery) =>
    api.get<FeedEngagementResponse>('/analytics/discovery/feed-engagement', {
      params,
    }),

  getJobsHealth: () => api.get<JobsHealthResponse>('/analytics/jobs/health'),
};

export default adminAnalyticsService;
