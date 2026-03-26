import api from './api';

export type EngagementAnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

export interface TimelineData {
  label: string;
  bucketStart: string;
  bucketEnd: string;
  posts: number;
  comments: number;
  votes: number;
}

export interface EngagementSummaryData {
  period: EngagementAnalyticsPeriod;
  postsCreated: number;
  commentsMade: number;
  votesGiven: number;
  votesReceived: number;
  averageEngagementRate: number;
  contentPerformanceScore: number;
  timeline: TimelineData[];
}

export interface EngagementSummaryResponse {
  userId: string;
  period: EngagementAnalyticsPeriod;
  summary: Omit<EngagementSummaryData, 'period' | 'timeline'>;
  timeline: TimelineData[];
  computedAt: string;
}

export interface HeatmapDay {
  date: string;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface ActivityHeatmapResponse {
  userId: string;
  year: number;
  days: HeatmapDay[];
  totalContributions: number;
  totalActiveDays: number;
  maxDailyCount: number;
}

export interface TrendingPost {
  id: string;
  subject: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  votes: number;
  comments: number;
  score: number;
  velocity: number;
  recencyWeight: number;
}

export interface TrendingContentResponse {
  limit: number;
  items: TrendingPost[];
  generatedAt: string;
}

export interface ContentPerformancePost {
  id: string;
  subject: string;
  content: string;
  createdAt: string;
  votes: number;
  comments: number;
  votesReceived: number;
  votesGiven: number;
  performanceScore: number;
}

export interface ContentPerformanceResponse {
  userId: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  items: ContentPerformancePost[];
}

const engagementAnalyticsService = {
  getSummary: (
    userId: string,
    period: EngagementAnalyticsPeriod = '30d',
  ) =>
    api.get<EngagementSummaryResponse>('/analytics/engagement/summary', {
      params: { userId, period },
    }),

  getHeatmap: (userId: string, year?: number) =>
    api.get<ActivityHeatmapResponse>('/analytics/engagement/heatmap', {
      params: { userId, year: year || new Date().getFullYear() },
    }),

  getTrending: (limit: number = 10) =>
    api.get<TrendingContentResponse>('/analytics/engagement/trending', {
      params: { limit },
    }),

  getContentPerformance: (
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) =>
    api.get<ContentPerformanceResponse>(
      '/analytics/engagement/content-performance',
      {
        params: { userId, page, limit },
      },
    ),
};

export default engagementAnalyticsService;
