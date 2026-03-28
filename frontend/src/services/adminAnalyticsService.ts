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
};

export default adminAnalyticsService;
