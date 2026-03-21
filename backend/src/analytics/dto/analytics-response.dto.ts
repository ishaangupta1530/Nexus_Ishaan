/**
 * Data Transfer Objects for analytics endpoints
 */

import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsUserOverviewResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User role' })
  role: string;

  @ApiProperty({
    description: 'User profile information',
    example: {
      name: 'John Doe',
      email: 'john@example.com',
      joinedAt: '2023-01-15T00:00:00Z',
    },
  })
  profile: {
    name: string;
    email: string;
    joinedAt: Date;
  };

  @ApiProperty({
    description: 'Connection metrics',
    example: {
      totalConnections: 45,
      acceptedConnections: 40,
      pendingConnections: 3,
      rejectedConnections: 2,
      blockedConnections: 0,
      connectionGrowthRate: 12.5,
      monthlyConnectionsAdded: 5,
    },
  })
  connections: {
    totalConnections: number;
    acceptedConnections: number;
    pendingConnections: number;
    rejectedConnections: number;
    blockedConnections: number;
    connectionGrowthRate: number;
    monthlyConnectionsAdded: number;
  };

  @ApiProperty({
    description: 'Engagement metrics',
    example: {
      postsCount: 25,
      commentsCount: 150,
      votesCount: 320,
      avgEngagementScore: 8.5,
      lastActiveAt: '2024-03-19T10:30:00Z',
      engagementTrend: 15.3,
    },
  })
  engagement: {
    postsCount: number;
    commentsCount: number;
    votesCount: number;
    avgEngagementScore: number;
    lastActiveAt: Date | null;
    engagementTrend: number;
  };

  @ApiProperty({
    description: 'Message metrics',
    example: {
      totalMessagesSent: 250,
      totalMessagesReceived: 280,
      uniqueConversations: 35,
      avgMessagesPerConversation: 15,
      avgResponseTime: 2.5,
    },
  })
  messages: {
    totalMessagesSent: number;
    totalMessagesReceived: number;
    uniqueConversations: number;
    avgMessagesPerConversation: number;
    avgResponseTime: number;
  };

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdatedAt: Date;

  @ApiProperty({
    description: 'Indicates if data is cached',
    default: true,
  })
  isCached: boolean;

  @ApiProperty({
    description: 'Cache expiration time',
    required: false,
  })
  expiresAt?: Date;
}

export class AnalyticsConnectionsResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({
    description: 'Connection statistics',
    example: {
      totalConnections: 45,
      acceptedConnections: 40,
      pendingConnections: 3,
      rejectedConnections: 2,
      blockedConnections: 0,
      connectionGrowthRate: 12.5,
      monthlyConnectionsAdded: 5,
    },
  })
  metrics: {
    totalConnections: number;
    acceptedConnections: number;
    pendingConnections: number;
    rejectedConnections: number;
    blockedConnections: number;
    connectionGrowthRate: number;
    monthlyConnectionsAdded: number;
  };

  @ApiProperty({
    description: 'Connection breakdown by status',
  })
  breakdown: {
    status: string;
    count: number;
    percentage: number;
  }[];

  @ApiProperty()
  lastUpdatedAt: Date;

  @ApiProperty({ default: true })
  isCached: boolean;
}

export class AnalyticsEngagementResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({
    description: 'Engagement metrics',
  })
  metrics: {
    postsCount: number;
    commentsCount: number;
    votesCount: number;
    avgEngagementScore: number;
    lastActiveAt: Date | null;
    engagementTrend: number;
  };

  @ApiProperty({
    description: 'Engagement breakdown by type',
  })
  breakdown: {
    type: string;
    count: number;
    percentage: number;
  }[];

  @ApiProperty({
    description: 'Monthly engagement trend',
  })
  monthlyTrend: {
    month: string;
    posts: number;
    comments: number;
    votes: number;
  }[];

  @ApiProperty()
  lastUpdatedAt: Date;

  @ApiProperty({ default: true })
  isCached: boolean;
}

export class AnalyticsNetworkGrowthResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({
    description: 'Network growth metrics',
  })
  growthMetrics: {
    connectionsByMonth: Array<{
      month: string;
      count: number;
      change: number;
    }>;
    engagementByMonth: Array<{
      month: string;
      posts: number;
      comments: number;
      votes: number;
      totalEngagement: number;
    }>;
    growthRate: number;
    peakMonths: string[];
  };

  @ApiProperty({
    description: 'Overall statistics',
  })
  overallStats: {
    totalConnectionsGained: number;
    totalEngagementGenerated: number;
    averageMonthlyGrowth: number;
    projectedNextMonthConnections: number;
  };

  @ApiProperty()
  lastUpdatedAt: Date;

  @ApiProperty({ default: true })
  isCached: boolean;
}

export class AnalyticsCacheStatsDto {
  @ApiProperty({ description: 'Total cached metrics' })
  totalCached: number;

  @ApiProperty({ description: 'Expired cache entries' })
  expiredEntries: number;

  @ApiProperty({ description: 'Active cache entries' })
  activeEntries: number;

  @ApiProperty({ description: 'Cache hit rate percentage' })
  hitRate: number;

  @ApiProperty({ description: 'Average response time (ms)' })
  avgResponseTime: number;

  @ApiProperty()
  lastUpdatedAt: Date;
}
