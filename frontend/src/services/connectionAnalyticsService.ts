import api from './api';

export type ConnectionAnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

export interface ConnectionGrowthPoint {
  label: string;
  bucketStart: string;
  newConnections: number;
  totalConnections: number;
}

export interface ConnectionGrowthResponse {
  userId: string;
  period: ConnectionAnalyticsPeriod;
  granularity: 'daily' | 'weekly' | 'monthly';
  metrics: {
    totalConnections: number;
    newConnections: number;
    previousPeriodConnections: number;
    growthRate: number;
    velocity: number;
  };
  data: ConnectionGrowthPoint[];
}

export interface ConnectionDistributionResponse {
  userId: string;
  totalConnections: number;
  byRole: Array<{ role: string; count: number; percentage: number }>;
  byGraduationYear: Array<{ year: string; count: number }>;
  byLocation: Array<{ location: string; count: number }>;
}

export interface ConnectionStrengthResponse {
  userId: string;
  score: number;
  metrics: {
    totalConnections: number;
    growthRate: number;
    velocity: number;
    networkDensity: number;
    roleDiversity: number;
    locationDiversity: number;
    averageResponseTimeHours: number;
  };
  interpretation: string;
}

const connectionAnalyticsService = {
  getGrowth: (userId: string, period: ConnectionAnalyticsPeriod = '30d') =>
    api.get<ConnectionGrowthResponse>('/analytics/connections/growth', {
      params: { userId, period },
    }),

  getDistribution: (userId: string) =>
    api.get<ConnectionDistributionResponse>(
      '/analytics/connections/distribution',
      {
        params: { userId },
      }
    ),

  getStrengthScore: (userId: string) =>
    api.get<ConnectionStrengthResponse>('/analytics/connections/strength-score', {
      params: { userId },
    }),
};

export default connectionAnalyticsService;
