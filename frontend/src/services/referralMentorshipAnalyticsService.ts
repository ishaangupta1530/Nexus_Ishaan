import api from './api';

export interface ReferralConversionResponse {
  userId: string;
  perspective: 'admin' | 'alumni' | 'student';
  metrics: {
    referralsPosted: number;
    referralsApplied: number;
    successfulApplications: number;
    conversionRate: number;
  };
  applicationStatusDistribution: Record<string, number>;
  successByIndustry: Array<{
    industry: string;
    total: number;
    successful: number;
    successRate: number;
  }>;
  successByRole: Array<{
    role: string;
    total: number;
    successful: number;
    successRate: number;
  }>;
  computedAt: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  dropOffRate: number;
  conversionRate: number;
}

export interface ReferralFunnelResponse {
  userId: string;
  perspective: 'admin' | 'alumni' | 'student';
  funnel: FunnelStage[];
  computedAt: string;
}

export interface MentorshipSummaryResponse {
  userId: string;
  perspective: 'admin' | 'mentor' | 'mentee';
  summary: {
    totalMentorships: number;
    totalMeetings: number;
    completedMeetings: number;
    completionRate: number;
    mentorshipHoursLogged: number;
    mentorSatisfactionScore: number;
    menteeSatisfactionScore: number;
    completedGoals: number;
    totalGoals: number;
  };
  computedAt: string;
}

export interface MentorshipImpactResponse {
  userId: string;
  impact: {
    impactScore: number;
    milestonesAchieved: number;
    totalMilestones: number;
    recentSessions: Array<{
      id: string;
      title: string;
      status: string;
      startTime: string;
      endTime: string;
      mentorName: string | null;
      menteeName: string | null;
    }>;
  };
  computedAt: string;
}

const referralMentorshipAnalyticsService = {
  getReferralConversion: (userId: string) =>
    api.get<ReferralConversionResponse>('/analytics/referrals/conversion', {
      params: { userId },
    }),

  getReferralFunnel: (userId: string) =>
    api.get<ReferralFunnelResponse>('/analytics/referrals/funnel', {
      params: { userId },
    }),

  getMentorshipSummary: (userId: string) =>
    api.get<MentorshipSummaryResponse>('/analytics/mentorship/summary', {
      params: { userId },
    }),

  getMentorshipImpact: (userId: string) =>
    api.get<MentorshipImpactResponse>('/analytics/mentorship/impact', {
      params: { userId },
    }),
};

export default referralMentorshipAnalyticsService;
