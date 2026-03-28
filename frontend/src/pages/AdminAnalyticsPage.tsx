import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Paper,
  useMediaQuery,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Tabs,
  Tab,
  useTheme,
} from '@mui/material';
import Divider from '@mui/material/Divider';
import ShareIcon from '@mui/icons-material/Share';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme as useAppTheme } from '@/contexts/ThemeContext';
import { useAppToast } from '@/hooks/useAppToast';
import { apiService } from '@/services/api';
import connectionAnalyticsService, {
  type ConnectionAnalyticsPeriod,
  type ConnectionDistributionResponse,
  type ConnectionGrowthResponse,
  type ConnectionStrengthResponse,
} from '@/services/connectionAnalyticsService';
import engagementAnalyticsService, {
  type EngagementAnalyticsPeriod,
  type EngagementSummaryData,
  type EngagementSummaryResponse,
  type ActivityHeatmapResponse,
  type ContentPerformanceResponse,
} from '@/services/engagementAnalyticsService';
import referralMentorshipAnalyticsService, {
  type MentorshipImpactResponse,
  type MentorshipSummaryResponse,
  type ReferralConversionResponse,
  type ReferralFunnelResponse,
} from '@/services/referralMentorshipAnalyticsService';
import adminAnalyticsService, {
  type PlatformStatsResponse,
  type UserGrowthResponse,
  type ContentStatsResponse,
  type ModerationQueueResponse,
  type TrendingPostsResponse,
  type TrendingPeriod,
} from '@/services/adminAnalyticsService';
import ConnectionGrowthChart from '@/components/Analytics/Connections/ConnectionGrowthChart';
import ConnectionDistributionChart from '@/components/Analytics/Connections/ConnectionDistributionChart';
import NetworkStrengthGauge from '@/components/Analytics/Connections/NetworkStrengthGauge';
import ConnectionMetricsCard from '@/components/Analytics/Connections/ConnectionMetricsCard';
import ActivityHeatmap from '@/components/Analytics/Engagement/ActivityHeatmap';
import EngagementAreaChart from '@/components/Analytics/Engagement/EngagementAreaChart';
import ContentPerformanceChart from '@/components/Analytics/Engagement/ContentPerformanceChart';
import EngagementMetricsCard from '@/components/Analytics/Engagement/EngagementMetricsCard';
import ReferralMetricsCard from '@/components/Analytics/Referrals/ReferralMetricsCard';
import ApplicationFunnelChart from '@/components/Analytics/Referrals/ApplicationFunnelChart';
import ReferralSuccessChart from '@/components/Analytics/Referrals/ReferralSuccessChart';
import MentorshipDashboard from '@/components/Analytics/Referrals/MentorshipDashboard';
import RealtimeIndicator from '@/components/Analytics/RealtimeIndicator';
import RefreshButton from '@/components/Analytics/RefreshButton';
import LastUpdatedBadge from '@/components/Analytics/LastUpdatedBadge';
import UpdateAnimation from '@/components/Analytics/UpdateAnimation';
import TimePeriodSelector, {
  type TimePeriodValue,
} from '@/components/Analytics/Filters/TimePeriodSelector';
import DateRangePicker from '@/components/Analytics/Filters/DateRangePicker';
import MetricToggle, {
  type MetricOption,
} from '@/components/Analytics/Filters/MetricToggle';
import ExportButton from '@/components/Analytics/Filters/ExportButton';

type AdminUserOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type TabType =
  | 'connections'
  | 'engagement'
  | 'referrals'
  | 'platform'
  | 'trending';
type ThemePreference = 'light' | 'dark' | 'auto';
type ConnectionChartType = 'area' | 'line';
type ReferralChartType = 'line' | 'bar';

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
] as const;

const METRIC_OPTIONS_BY_TAB: Record<
  TabType,
  Array<{ key: string; label: string }>
> = {
  connections: [
    { key: 'connections.summary', label: 'Animated Summary' },
    { key: 'connections.metrics', label: 'Metrics Card' },
    { key: 'connections.growth', label: 'Growth Chart' },
    { key: 'connections.strength', label: 'Strength Gauge' },
    { key: 'connections.distribution', label: 'Distribution Chart' },
  ],
  engagement: [
    { key: 'engagement.summary', label: 'Summary Metrics' },
    { key: 'engagement.heatmap', label: 'Activity Heatmap' },
    { key: 'engagement.timeline', label: 'Engagement Timeline' },
    { key: 'engagement.content', label: 'Content Performance' },
  ],
  referrals: [
    { key: 'referrals.metrics', label: 'Referral Metrics' },
    { key: 'referrals.funnel', label: 'Application Funnel' },
    { key: 'referrals.success', label: 'Success Rate Chart' },
    { key: 'referrals.mentorship', label: 'Mentorship Dashboard' },
  ],
  platform: [
    { key: 'platform.overview', label: 'Platform Overview' },
    { key: 'platform.activity', label: 'User Activity' },
    { key: 'platform.content', label: 'Content Statistics' },
    { key: 'platform.moderation', label: 'Moderation Queue' },
  ],
  trending: [
    { key: 'trending.summary', label: 'Trending Summary' },
    { key: 'trending.list', label: 'Trending Leaderboard' },
  ],
};

const DEFAULT_METRIC_VISIBILITY = Object.values(METRIC_OPTIONS_BY_TAB)
  .flat()
  .reduce<Record<string, boolean>>((acc, metric) => {
    acc[metric.key] = true;
    return acc;
  }, {});

const MOBILE_PRIORITIZED_METRICS: Record<TabType, string[]> = {
  connections: ['connections.metrics', 'connections.growth'],
  engagement: ['engagement.summary', 'engagement.timeline'],
  referrals: ['referrals.metrics', 'referrals.success'],
  platform: ['platform.overview', 'platform.moderation'],
  trending: ['trending.summary', 'trending.list'],
};

const resolveDaysFromTimePeriod = (period: TimePeriodValue): number => {
  if (period === '7d') return 7;
  if (period === '30d') return 30;
  if (period === '90d') return 90;
  return 365;
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const resolveApiPeriodFromCustomRange = (
  startDate: string,
  endDate: string
): ConnectionAnalyticsPeriod => {
  if (!startDate || !endDate) return '30d';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
  );

  if (diffDays <= 7) return '7d';
  if (diffDays <= 30) return '30d';
  if (diffDays <= 90) return '90d';
  return '1y';
};

const inDateRange = (
  dateString: string,
  startDate: string,
  endDate: string
): boolean => {
  if (!startDate || !endDate) return true;
  const d = new Date(dateString);
  const s = new Date(startDate);
  const e = new Date(endDate);
  return d >= s && d <= e;
};

const buildDashboardShareUrl = (
  baseUrl: string,
  params: Record<string, string>
) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

const AdminAnalyticsPage: FC = () => {
  const { user, token } = useAuth();
  const { mode, toggleTheme } = useAppTheme();
  const { toast } = useAppToast();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>(
    (searchParams.get('tab') as TabType) || 'connections'
  );

  // Filter and customization state
  const [timePeriod, setTimePeriod] = useState<TimePeriodValue>(
    (searchParams.get('period') as TimePeriodValue) || '30d'
  );
  const [customStartDate, setCustomStartDate] = useState(
    searchParams.get('start') ||
      toIsoDate(new Date(Date.now() - 29 * 86_400_000))
  );
  const [customEndDate, setCustomEndDate] = useState(
    searchParams.get('end') || toIsoDate(new Date())
  );
  const [metricVisibility, setMetricVisibility] = useState<
    Record<string, boolean>
  >(() => {
    const metricsParam = searchParams.get('metrics');
    if (!metricsParam) return DEFAULT_METRIC_VISIBILITY;

    const enabled = new Set(metricsParam.split(',').filter(Boolean));
    return Object.keys(DEFAULT_METRIC_VISIBILITY).reduce<
      Record<string, boolean>
    >((acc, key) => {
      acc[key] = enabled.has(key);
      return acc;
    }, {});
  });
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    (searchParams.get('theme') as ThemePreference) || 'auto'
  );
  const [connectionChartType, setConnectionChartType] =
    useState<ConnectionChartType>(
      (searchParams.get('connChart') as ConnectionChartType) || 'area'
    );
  const [referralChartType, setReferralChartType] = useState<ReferralChartType>(
    (searchParams.get('refChart') as ReferralChartType) || 'line'
  );

  // Connection analytics state
  const [targetUserId, setTargetUserId] = useState(
    searchParams.get('userId') || ''
  );
  const [growth, setGrowth] = useState<ConnectionGrowthResponse | null>(null);
  const [distribution, setDistribution] =
    useState<ConnectionDistributionResponse | null>(null);
  const [strength, setStrength] = useState<ConnectionStrengthResponse | null>(
    null
  );

  // Engagement analytics state
  const [engagementSummary, setEngagementSummary] =
    useState<EngagementSummaryResponse | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapResponse | null>(null);
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const [contentPerformance, setContentPerformance] =
    useState<ContentPerformanceResponse | null>(null);
  const [contentPerfPage, setContentPerfPage] = useState(1);

  // Referral and mentorship analytics state
  const [referralConversion, setReferralConversion] =
    useState<ReferralConversionResponse | null>(null);
  const [referralFunnel, setReferralFunnel] =
    useState<ReferralFunnelResponse | null>(null);
  const [mentorshipSummary, setMentorshipSummary] =
    useState<MentorshipSummaryResponse | null>(null);
  const [mentorshipImpact, setMentorshipImpact] =
    useState<MentorshipImpactResponse | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState(
    searchParams.get('industry') || 'ALL'
  );

  // Platform analytics state
  const [platformStats, setPlatformStats] =
    useState<PlatformStatsResponse | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowthResponse | null>(null);
  const [contentStats, setContentStats] = useState<ContentStatsResponse | null>(
    null
  );
  const [moderationQueue, setModerationQueue] =
    useState<ModerationQueueResponse | null>(null);

  // Trending analytics state
  const [trendingPeriod, setTrendingPeriod] = useState<TrendingPeriod>(
    (searchParams.get('trendPeriod') as TrendingPeriod) || 'day'
  );
  const [trendingData, setTrendingData] =
    useState<TrendingPostsResponse | null>(null);
  const [recalculatingTrending, setRecalculatingTrending] = useState(false);

  // General state
  const [userOptions, setUserOptions] = useState<AdminUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time / refresh state
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(
    Number(searchParams.get('auto') || '0')
  );
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const chartExportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user?.id && !targetUserId) {
      setTargetUserId(user.id);
    }
  }, [user?.id, targetUserId]);

  useEffect(() => {
    const loadUsers = async () => {
      if (user?.role !== 'ADMIN') {
        return;
      }

      setLoadingUsers(true);
      try {
        const response = await apiService.users.getAll();
        const raw = response.data as unknown;
        const users = Array.isArray(raw)
          ? (raw as AdminUserOption[])
          : (raw as { users?: AdminUserOption[] })?.users || [];
        setUserOptions(users);
      } catch (err) {
        console.error('Failed to load users for analytics selector', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadUsers();
  }, [user?.role]);

  const activeMetricOptions = useMemo<MetricOption[]>(
    () =>
      METRIC_OPTIONS_BY_TAB[activeTab].map((option) => ({
        ...option,
        enabled: metricVisibility[option.key] ?? true,
      })),
    [activeTab, metricVisibility]
  );

  const toggleMetricVisibility = useCallback((key: string) => {
    setMetricVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isMetricEnabled = useCallback(
    (key: string) => {
      const desktopEnabled = metricVisibility[key] ?? true;
      if (!desktopEnabled) return false;
      if (!isMobile) return true;
      return MOBILE_PRIORITIZED_METRICS[activeTab].includes(key);
    },
    [activeTab, isMobile, metricVisibility]
  );

  const resolvedApiPeriod = useMemo<ConnectionAnalyticsPeriod>(() => {
    if (timePeriod !== 'custom') {
      return timePeriod;
    }

    return resolveApiPeriodFromCustomRange(customStartDate, customEndDate);
  }, [timePeriod, customStartDate, customEndDate]);

  const adminAnalyticsParams = useMemo(
    () =>
      timePeriod === 'custom'
        ? {
            startDate: customStartDate,
            endDate: customEndDate,
          }
        : {
            days: resolveDaysFromTimePeriod(timePeriod),
          },
    [timePeriod, customStartDate, customEndDate]
  );

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `analytics-filters:${user.id}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        timePeriod?: TimePeriodValue;
        customStartDate?: string;
        customEndDate?: string;
        metricVisibility?: Record<string, boolean>;
        autoRefreshInterval?: number;
        connectionChartType?: ConnectionChartType;
        referralChartType?: ReferralChartType;
        themePreference?: ThemePreference;
        trendingPeriod?: TrendingPeriod;
      };

      if (!searchParams.get('period') && parsed.timePeriod)
        setTimePeriod(parsed.timePeriod);
      if (!searchParams.get('start') && parsed.customStartDate)
        setCustomStartDate(parsed.customStartDate);
      if (!searchParams.get('end') && parsed.customEndDate)
        setCustomEndDate(parsed.customEndDate);
      if (parsed.metricVisibility)
        setMetricVisibility((prev) => ({
          ...prev,
          ...parsed.metricVisibility,
        }));
      if (
        !searchParams.get('auto') &&
        typeof parsed.autoRefreshInterval === 'number'
      )
        setAutoRefreshInterval(parsed.autoRefreshInterval);
      if (!searchParams.get('connChart') && parsed.connectionChartType)
        setConnectionChartType(parsed.connectionChartType);
      if (!searchParams.get('refChart') && parsed.referralChartType)
        setReferralChartType(parsed.referralChartType);
      if (!searchParams.get('theme') && parsed.themePreference)
        setThemePreference(parsed.themePreference);
      if (!searchParams.get('trendPeriod') && parsed.trendingPeriod)
        setTrendingPeriod(parsed.trendingPeriod);
    } catch (err) {
      console.error('Failed to parse analytics filter preferences', err);
    }
  }, [user?.id, searchParams]);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `analytics-filters:${user.id}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        timePeriod,
        customStartDate,
        customEndDate,
        metricVisibility,
        autoRefreshInterval,
        connectionChartType,
        referralChartType,
        themePreference,
        trendingPeriod,
      })
    );
  }, [
    user?.id,
    timePeriod,
    customStartDate,
    customEndDate,
    metricVisibility,
    autoRefreshInterval,
    connectionChartType,
    referralChartType,
    themePreference,
    trendingPeriod,
  ]);

  useEffect(() => {
    const enabledMetricKeys = Object.entries(metricVisibility)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(',');

    setSearchParams(
      {
        tab: activeTab,
        userId: targetUserId,
        period: timePeriod,
        start: customStartDate,
        end: customEndDate,
        auto: String(autoRefreshInterval),
        connChart: connectionChartType,
        refChart: referralChartType,
        theme: themePreference,
        trendPeriod: trendingPeriod,
        industry: selectedIndustry,
        metrics: enabledMetricKeys,
      },
      { replace: true }
    );
  }, [
    setSearchParams,
    activeTab,
    targetUserId,
    timePeriod,
    customStartDate,
    customEndDate,
    autoRefreshInterval,
    connectionChartType,
    referralChartType,
    themePreference,
    trendingPeriod,
    selectedIndustry,
    metricVisibility,
  ]);

  useEffect(() => {
    const targetMode =
      themePreference === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : themePreference;

    if (mode !== targetMode) {
      toggleTheme();
    }
  }, [mode, themePreference, toggleTheme]);

  const handleShareLink = useCallback(async () => {
    const enabledMetricKeys = Object.entries(metricVisibility)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(',');

    const url = buildDashboardShareUrl(window.location.href, {
      tab: activeTab,
      userId: targetUserId,
      period: timePeriod,
      start: customStartDate,
      end: customEndDate,
      auto: String(autoRefreshInterval),
      connChart: connectionChartType,
      refChart: referralChartType,
      theme: themePreference,
      trendPeriod: trendingPeriod,
      industry: selectedIndustry,
      metrics: enabledMetricKeys,
    });

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Admin Analytics Dashboard',
          text: 'Shared analytics dashboard view',
          url,
        });
        toast('Dashboard link shared.', 'success');
        return;
      }

      await navigator.clipboard.writeText(url);
      toast('Dashboard link copied to clipboard.', 'success');
    } catch {
      let copied = false;
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      copied = document.execCommand('copy');
      input.remove();

      if (copied) {
        toast('Dashboard link copied to clipboard.', 'success');
        return;
      }

      window.prompt('Copy this dashboard link:', url);
      toast(
        'Clipboard access was blocked. Copy the link from the prompt.',
        'warning'
      );
    }
  }, [
    activeTab,
    autoRefreshInterval,
    connectionChartType,
    customEndDate,
    customStartDate,
    metricVisibility,
    referralChartType,
    selectedIndustry,
    targetUserId,
    themePreference,
    trendingPeriod,
    timePeriod,
    toast,
  ]);

  // Load connection analytics
  const loadConnectionAnalytics = useCallback(
    async (silent = false) => {
      if (!targetUserId) {
        setError('Target user ID is required to fetch analytics.');
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const [growthRes, distributionRes, strengthRes] = await Promise.all([
          connectionAnalyticsService.getGrowth(targetUserId, resolvedApiPeriod),
          connectionAnalyticsService.getDistribution(targetUserId),
          connectionAnalyticsService.getStrengthScore(targetUserId),
        ]);

        setGrowth(growthRes.data);
        setDistribution(distributionRes.data);
        setStrength(strengthRes.data);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load connection analytics', err);
        setError(
          'Failed to load analytics. Ensure your admin token is valid and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [resolvedApiPeriod, targetUserId]
  );

  // Load engagement analytics
  const loadEngagementAnalytics = useCallback(
    async (silent = false) => {
      if (!targetUserId) {
        setError('Target user ID is required to fetch analytics.');
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const [summaryRes, heatmapRes, perfRes] = await Promise.allSettled([
          engagementAnalyticsService.getSummary(
            targetUserId,
            resolvedApiPeriod as EngagementAnalyticsPeriod
          ),
          engagementAnalyticsService.getHeatmap(targetUserId, heatmapYear),
          engagementAnalyticsService.getContentPerformance(
            targetUserId,
            contentPerfPage,
            10
          ),
        ]);

        if (summaryRes.status === 'fulfilled') {
          setEngagementSummary(summaryRes.value.data);
        }
        if (heatmapRes.status === 'fulfilled') {
          setHeatmap(heatmapRes.value.data);
        }
        if (perfRes.status === 'fulfilled') {
          setContentPerformance(perfRes.value.data);
        }

        if (
          summaryRes.status === 'rejected' &&
          heatmapRes.status === 'rejected' &&
          perfRes.status === 'rejected'
        ) {
          throw new Error('All engagement analytics requests failed');
        }
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load engagement analytics', err);
        setError(
          'Failed to load engagement analytics. Ensure your admin token is valid and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [targetUserId, resolvedApiPeriod, heatmapYear, contentPerfPage]
  );

  const loadReferralMentorshipAnalytics = useCallback(
    async (silent = false) => {
      if (!targetUserId) {
        setError('Target user ID is required to fetch analytics.');
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const [
          conversionRes,
          funnelRes,
          mentorshipSummaryRes,
          mentorshipImpactRes,
        ] = await Promise.allSettled([
          referralMentorshipAnalyticsService.getReferralConversion(
            targetUserId
          ),
          referralMentorshipAnalyticsService.getReferralFunnel(targetUserId),
          referralMentorshipAnalyticsService.getMentorshipSummary(targetUserId),
          referralMentorshipAnalyticsService.getMentorshipImpact(targetUserId),
        ]);

        if (conversionRes.status === 'fulfilled') {
          setReferralConversion(conversionRes.value.data);
        }
        if (funnelRes.status === 'fulfilled') {
          setReferralFunnel(funnelRes.value.data);
        }
        if (mentorshipSummaryRes.status === 'fulfilled') {
          setMentorshipSummary(mentorshipSummaryRes.value.data);
        }
        if (mentorshipImpactRes.status === 'fulfilled') {
          setMentorshipImpact(mentorshipImpactRes.value.data);
        }

        if (
          conversionRes.status === 'rejected' &&
          funnelRes.status === 'rejected' &&
          mentorshipSummaryRes.status === 'rejected' &&
          mentorshipImpactRes.status === 'rejected'
        ) {
          throw new Error(
            'All referral and mentorship analytics requests failed'
          );
        }
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load referral and mentorship analytics', err);
        setError(
          'Failed to load referral and mentorship analytics. Ensure your admin token is valid and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [targetUserId]
  );

  const loadPlatformAnalytics = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);

      try {
        const [platformRes, growthRes, contentRes, moderationRes] =
          await Promise.all([
            adminAnalyticsService.getPlatformStats(adminAnalyticsParams),
            adminAnalyticsService.getUserGrowth(adminAnalyticsParams),
            adminAnalyticsService.getContentStats(adminAnalyticsParams),
            adminAnalyticsService.getModerationQueue(adminAnalyticsParams),
          ]);

        setPlatformStats(platformRes.data);
        setUserGrowth(growthRes.data);
        setContentStats(contentRes.data);
        setModerationQueue(moderationRes.data);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load platform analytics', err);
        setError(
          'Failed to load platform analytics. Ensure your admin token is valid and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [adminAnalyticsParams]
  );

  const loadTrendingAnalytics = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);

      try {
        const response = await adminAnalyticsService.getTrendingPosts(
          trendingPeriod,
          20
        );
        setTrendingData(response.data);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load trending analytics', err);
        setError(
          'Failed to load trending analytics. Ensure your admin token is valid and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [trendingPeriod]
  );

  useEffect(() => {
    if (targetUserId && activeTab === 'connections') {
      void loadConnectionAnalytics();
    }
  }, [targetUserId, resolvedApiPeriod, activeTab, loadConnectionAnalytics]);

  useEffect(() => {
    if (targetUserId && activeTab === 'engagement') {
      void loadEngagementAnalytics();
    }
  }, [targetUserId, activeTab, loadEngagementAnalytics]);

  useEffect(() => {
    if (targetUserId && activeTab === 'referrals') {
      void loadReferralMentorshipAnalytics();
    }
  }, [targetUserId, activeTab, loadReferralMentorshipAnalytics]);

  useEffect(() => {
    if (activeTab === 'platform') {
      void loadPlatformAnalytics();
    }
  }, [activeTab, loadPlatformAnalytics]);

  useEffect(() => {
    if (activeTab === 'trending') {
      void loadTrendingAnalytics();
    }
  }, [activeTab, loadTrendingAnalytics]);

  // Silent (non-blocking) refresh for auto-refresh and WS-triggered updates
  const silentRefreshCurrentTab = useCallback(async () => {
    if (activeTab !== 'platform' && activeTab !== 'trending' && !targetUserId)
      return;
    if (activeTab === 'connections') await loadConnectionAnalytics(true);
    else if (activeTab === 'engagement') await loadEngagementAnalytics(true);
    else if (activeTab === 'referrals')
      await loadReferralMentorshipAnalytics(true);
    else if (activeTab === 'platform') await loadPlatformAnalytics(true);
    else await loadTrendingAnalytics(true);
  }, [
    activeTab,
    targetUserId,
    loadConnectionAnalytics,
    loadEngagementAnalytics,
    loadReferralMentorshipAnalytics,
    loadPlatformAnalytics,
    loadTrendingAnalytics,
  ]);

  // Manual refresh handler — shows button spinner, NOT the page overlay
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await silentRefreshCurrentTab();
    setIsRefreshing(false);
  }, [silentRefreshCurrentTab]);

  const handleRecalculateTrending = useCallback(async () => {
    setRecalculatingTrending(true);
    try {
      await adminAnalyticsService.recalculateTrending();
      await loadTrendingAnalytics(true);
      toast('Trending scores recalculated successfully.', 'success');
    } catch (err) {
      console.error('Failed to recalculate trending scores', err);
      toast('Failed to recalculate trending scores.', 'error');
    } finally {
      setRecalculatingTrending(false);
    }
  }, [loadTrendingAnalytics, toast]);

  // Auto-refresh interval effect
  useEffect(() => {
    if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    if (autoRefreshInterval > 0) {
      autoRefreshTimerRef.current = setInterval(() => {
        void silentRefreshCurrentTab();
      }, autoRefreshInterval * 1_000);
    }
    return () => {
      if (autoRefreshTimerRef.current)
        clearInterval(autoRefreshTimerRef.current);
    };
  }, [autoRefreshInterval, silentRefreshCurrentTab]);

  const connectionMetrics = useMemo(() => {
    if (!growth || !strength || !distribution) {
      return [];
    }

    return [
      { label: 'Total Connections', value: growth.metrics.totalConnections },
      { label: 'Growth Rate', value: `${growth.metrics.growthRate}%` },
      { label: 'Velocity', value: `${growth.metrics.velocity}/bucket` },
      {
        label: 'Avg Response Time',
        value: `${strength.metrics.averageResponseTimeHours}h`,
      },
      {
        label: 'Network Density',
        value: `${strength.metrics.networkDensity.toFixed(2)}%`,
      },
      { label: 'Top Role', value: distribution.byRole[0]?.role || 'N/A' },
      { label: 'Strength Score', value: strength.score },
      {
        label: 'Period',
        value: timePeriod === 'custom' ? 'CUSTOM' : timePeriod.toUpperCase(),
      },
    ];
  }, [distribution, growth, strength, timePeriod]);

  const selectedUserExists = useMemo(
    () => userOptions.some((option) => option.id === targetUserId),
    [targetUserId, userOptions]
  );

  const engagementData = useMemo<EngagementSummaryData | null>(() => {
    if (!engagementSummary) {
      return null;
    }

    return {
      period: engagementSummary.period,
      timeline: engagementSummary.timeline,
      ...engagementSummary.summary,
    };
  }, [engagementSummary]);

  const filteredGrowth = useMemo<ConnectionGrowthResponse | null>(() => {
    if (!growth || timePeriod !== 'custom') return growth;

    const points = growth.data.filter((item) =>
      inDateRange(item.bucketStart, customStartDate, customEndDate)
    );

    if (points.length === 0) {
      return {
        ...growth,
        data: [],
        metrics: {
          ...growth.metrics,
          totalConnections: 0,
          newConnections: 0,
        },
      };
    }

    return {
      ...growth,
      data: points,
      metrics: {
        ...growth.metrics,
        totalConnections: points[points.length - 1]?.totalConnections || 0,
        newConnections: points.reduce(
          (sum, item) => sum + item.newConnections,
          0
        ),
      },
    };
  }, [growth, timePeriod, customStartDate, customEndDate]);

  const filteredEngagementData = useMemo<EngagementSummaryData | null>(() => {
    if (!engagementData || timePeriod !== 'custom') return engagementData;

    const timeline = engagementData.timeline.filter((item) =>
      inDateRange(item.bucketStart, customStartDate, customEndDate)
    );

    return {
      ...engagementData,
      timeline,
    };
  }, [engagementData, timePeriod, customStartDate, customEndDate]);

  const filteredHeatmap = useMemo<ActivityHeatmapResponse | null>(() => {
    if (!heatmap || timePeriod !== 'custom') return heatmap;

    const days = heatmap.days.filter((day) =>
      inDateRange(day.date, customStartDate, customEndDate)
    );

    return {
      ...heatmap,
      days,
      totalContributions: days.reduce((sum, day) => sum + day.count, 0),
      totalActiveDays: days.filter((day) => day.count > 0).length,
      maxDailyCount: days.reduce((max, day) => Math.max(max, day.count), 0),
    };
  }, [heatmap, timePeriod, customStartDate, customEndDate]);

  const latestNewUsers = useMemo(
    () => userGrowth?.trend.slice(-7).reverse() || [],
    [userGrowth]
  );

  const latestContentTrend = useMemo(
    () => contentStats?.trend.slice(-7).reverse() || [],
    [contentStats]
  );

  const latestModerationTrend = useMemo(
    () =>
      moderationQueue?.trends.reportsCreatedPerDay.slice(-7).reverse() || [],
    [moderationQueue]
  );

  return (
    <Container
      maxWidth="xl"
      sx={{
        py: 4,
        '& .MuiButtonBase-root:focus-visible, & .MuiInputBase-input:focus-visible':
          {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
      }}
    >
      {/* ── Page header ─────────────────────────────── */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Admin Analytics Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Comprehensive analytics for connections, engagement, and
              performance metrics.
            </Typography>
            {isMobile ? (
              <Typography variant="caption" color="text.secondary">
                Mobile view shows prioritized charts for readability. Rotate
                device or use desktop for full detail.
              </Typography>
            ) : null}
          </Box>

          {/* Real-time toolbar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              mt: { xs: 1, md: 0 },
            }}
          >
            {user?.id && token ? (
              <RealtimeIndicator
                userId={user.id}
                token={token}
                onAnalyticsUpdate={() => {
                  void silentRefreshCurrentTab();
                }}
              />
            ) : null}

            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: 'none', sm: 'block' } }}
            />

            <TextField
              select
              size="small"
              label="Auto-refresh"
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              sx={{ width: 110 }}
              inputProps={{ 'aria-label': 'Auto-refresh interval' }}
            >
              {AUTO_REFRESH_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <RefreshButton
              onRefresh={() => {
                void handleManualRefresh();
              }}
              isLoading={isRefreshing}
              disabled={
                activeTab !== 'platform' &&
                activeTab !== 'trending' &&
                !targetUserId
              }
            />

            <LastUpdatedBadge lastUpdated={lastUpdated} />
          </Box>
        </Box>
      </Stack>

      {/* Tab navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value as TabType)}
          aria-label="Analytics dashboard tabs"
          sx={{ '& .MuiTab-root': { minHeight: 44 } }}
        >
          <Tab label="Connection Analytics" value="connections" />
          <Tab label="Engagement Analytics" value="engagement" />
          <Tab label="Referrals & Mentorship" value="referrals" />
          <Tab label="Platform Insights" value="platform" />
          <Tab label="Trending Score" value="trending" />
        </Tabs>
      </Box>

      {/* Shared controls */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          {activeTab !== 'trending' && (
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Target User"
                select
                inputProps={{ 'aria-label': 'Select target user for analytics' }}
                value={selectedUserExists ? targetUserId : ''}
                onChange={(event) => setTargetUserId(event.target.value)}
                helperText="Select a user account to inspect analytics"
                disabled={loadingUsers || userOptions.length === 0}
                sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
              >
                {userOptions.length === 0 ? (
                  <MenuItem value="" disabled>
                    No users available
                  </MenuItem>
                ) : null}
                {userOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {`${option.name || 'Unnamed User'} (${option.email}) - ${option.role}`}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          <Grid item xs={12} md={4}>
            <TimePeriodSelector value={timePeriod} onChange={setTimePeriod} />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              select
              label="Color Scheme"
              inputProps={{ 'aria-label': 'Select color scheme' }}
              value={themePreference}
              onChange={(event) =>
                setThemePreference(event.target.value as ThemePreference)
              }
              sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
            >
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
              <MenuItem value="auto">Auto</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        {timePeriod === 'custom' ? (
          <DateRangePicker
            startDate={customStartDate}
            endDate={customEndDate}
            onStartDateChange={setCustomStartDate}
            onEndDateChange={setCustomEndDate}
          />
        ) : null}

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <MetricToggle
            options={activeMetricOptions}
            onToggle={toggleMetricVisibility}
          />

          {activeTab === 'connections' ? (
            <TextField
              select
              size="small"
              label="Connection Chart"
              inputProps={{ 'aria-label': 'Select connection chart type' }}
              value={connectionChartType}
              onChange={(event) =>
                setConnectionChartType(
                  event.target.value as ConnectionChartType
                )
              }
              sx={{ minWidth: 180, '& .MuiInputBase-root': { minHeight: 44 } }}
            >
              <MenuItem value="area">Area</MenuItem>
              <MenuItem value="line">Line</MenuItem>
            </TextField>
          ) : null}

          {activeTab === 'referrals' ? (
            <TextField
              select
              size="small"
              label="Referral Chart"
              inputProps={{ 'aria-label': 'Select referral chart type' }}
              value={referralChartType}
              onChange={(event) =>
                setReferralChartType(event.target.value as ReferralChartType)
              }
              sx={{ minWidth: 180, '& .MuiInputBase-root': { minHeight: 44 } }}
            >
              <MenuItem value="line">Line</MenuItem>
              <MenuItem value="bar">Bar</MenuItem>
            </TextField>
          ) : null}

          {activeTab === 'trending' ? (
            <TextField
              select
              size="small"
              label="Trending Period"
              inputProps={{ 'aria-label': 'Select trending period' }}
              value={trendingPeriod}
              onChange={(event) =>
                setTrendingPeriod(event.target.value as TrendingPeriod)
              }
              sx={{ minWidth: 190, '& .MuiInputBase-root': { minHeight: 44 } }}
            >
              <MenuItem value="hour">Hour</MenuItem>
              <MenuItem value="day">Day</MenuItem>
              <MenuItem value="week">Week</MenuItem>
            </TextField>
          ) : null}

          {activeTab === 'trending' ? (
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                void handleRecalculateTrending();
              }}
              disabled={recalculatingTrending}
              sx={{ minHeight: 44 }}
            >
              {recalculatingTrending ? 'Recalculating...' : 'Recalculate Scores'}
            </Button>
          ) : null}

          <ExportButton
            containerRef={chartExportRef}
            fileName={`analytics-${activeTab}-${new Date().toISOString().slice(0, 10)}`}
          />

          <Button
            variant="outlined"
            size="small"
            startIcon={<ShareIcon fontSize="small" />}
            onClick={() => {
              void handleShareLink();
            }}
            aria-label="Share analytics dashboard link"
            sx={{ minHeight: 44 }}
          >
            Share Link
          </Button>
        </Box>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {/* Connection Analytics Tab */}
      {!loading &&
      activeTab === 'connections' &&
      filteredGrowth &&
      distribution &&
      strength ? (
        <Stack spacing={3} ref={chartExportRef}>
          {/* Animated summary row */}
          {isMetricEnabled('connections.summary') ? (
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', pb: 0.5 }}>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                >
                  Total Connections
                </Typography>
                <UpdateAnimation
                  value={filteredGrowth.metrics.totalConnections}
                  variant="h5"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                >
                  Growth Rate
                </Typography>
                <UpdateAnimation
                  value={filteredGrowth.metrics.growthRate}
                  decimals={1}
                  suffix="%"
                  variant="h5"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                >
                  Strength Score
                </Typography>
                <UpdateAnimation
                  value={
                    typeof strength.score === 'number'
                      ? strength.score
                      : Number.parseFloat(String(strength.score))
                  }
                  decimals={1}
                  variant="h5"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
            </Box>
          ) : null}

          {isMetricEnabled('connections.metrics') ? (
            <ConnectionMetricsCard metrics={connectionMetrics} />
          ) : null}

          <Grid container spacing={3}>
            {isMetricEnabled('connections.growth') ? (
              <Grid
                item
                xs={12}
                lg={isMetricEnabled('connections.strength') ? 8 : 12}
              >
                <ConnectionGrowthChart
                  growth={filteredGrowth}
                  chartType={connectionChartType}
                />
              </Grid>
            ) : null}

            {isMetricEnabled('connections.strength') ? (
              <Grid
                item
                xs={12}
                lg={isMetricEnabled('connections.growth') ? 4 : 12}
              >
                <NetworkStrengthGauge strength={strength} />
              </Grid>
            ) : null}
          </Grid>

          {isMetricEnabled('connections.distribution') ? (
            <ConnectionDistributionChart distribution={distribution} />
          ) : null}
        </Stack>
      ) : null}

      {/* Engagement Analytics Tab */}
      {activeTab === 'engagement' ? (
        !loading &&
        filteredEngagementData &&
        filteredHeatmap &&
        contentPerformance ? (
          <Stack spacing={3} ref={chartExportRef}>
            {isMetricEnabled('engagement.summary') ? (
              <EngagementMetricsCard data={filteredEngagementData} />
            ) : null}

            {isMetricEnabled('engagement.heatmap') ? (
              <ActivityHeatmap
                data={filteredHeatmap}
                onYearChange={setHeatmapYear}
                isLoading={loading}
              />
            ) : null}

            {isMetricEnabled('engagement.timeline') ? (
              <EngagementAreaChart
                data={filteredEngagementData}
                isLoading={loading}
              />
            ) : null}

            {isMetricEnabled('engagement.content') ? (
              <ContentPerformanceChart
                data={contentPerformance}
                onPageChange={setContentPerfPage}
                isLoading={loading}
              />
            ) : null}
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">
              Loading engagement analytics...
            </Typography>
          </Box>
        )
      ) : null}

      {activeTab === 'referrals' ? (
        !loading &&
        referralConversion &&
        referralFunnel &&
        mentorshipSummary &&
        mentorshipImpact ? (
          <Stack spacing={3} ref={chartExportRef}>
            {isMetricEnabled('referrals.metrics') ? (
              <ReferralMetricsCard conversion={referralConversion} />
            ) : null}

            {isMetricEnabled('referrals.funnel') ? (
              <ApplicationFunnelChart funnelData={referralFunnel} />
            ) : null}

            {isMetricEnabled('referrals.success') ? (
              <ReferralSuccessChart
                conversion={referralConversion}
                selectedIndustry={selectedIndustry}
                onIndustryChange={setSelectedIndustry}
                chartType={referralChartType}
              />
            ) : null}

            {isMetricEnabled('referrals.mentorship') ? (
              <MentorshipDashboard
                summary={mentorshipSummary}
                impact={mentorshipImpact}
              />
            ) : null}
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">
              Loading referral and mentorship analytics...
            </Typography>
          </Box>
        )
      ) : null}

      {activeTab === 'platform' ? (
        !loading &&
        platformStats &&
        userGrowth &&
        contentStats &&
        moderationQueue ? (
          <Stack spacing={3} ref={chartExportRef}>
            {isMetricEnabled('platform.overview') ? (
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} lg={3}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Total Users
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {platformStats.userStatistics.totalUsers}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {platformStats.userStatistics.totalActiveAccounts} active
                      accounts
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Active Users
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {platformStats.userStatistics.activeUsers.mau}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      DAU {platformStats.userStatistics.activeUsers.dau} | WAU{' '}
                      {platformStats.userStatistics.activeUsers.wau}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Health Score
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {platformStats.systemHealth.healthScore}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {platformStats.systemHealth.failedLoginsLast24h} failed
                      logins in 24h
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Moderation Queue
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {moderationQueue.queue.pendingTotal}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {moderationQueue.throughput.processedInPeriod} processed
                      this period
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}

            {isMetricEnabled('platform.activity') ? (
              <Grid container spacing={3}>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      User Growth Snapshot
                    </Typography>
                    <Stack spacing={1.5}>
                      <Typography variant="body2" color="text.secondary">
                        New users: {userGrowth.summary.newUsers} | Previous
                        period: {userGrowth.summary.previousPeriodNewUsers}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Growth rate: {userGrowth.summary.growthRatePercent}% |
                        Avg/day: {userGrowth.summary.averageNewUsersPerDay}
                      </Typography>
                      <Divider />
                      {latestNewUsers.map((item) => (
                        <Box
                          key={item.date}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.date}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      User Mix
                    </Typography>
                    <Stack spacing={1.5}>
                      {platformStats.userStatistics.byRole.map((item) => (
                        <Box
                          key={item.role}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.role}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                      <Divider />
                      {platformStats.userStatistics.byStatus.map((item) => (
                        <Box
                          key={item.status}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.status}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}

            {isMetricEnabled('platform.content') ? (
              <Grid container spacing={3}>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      Content Creation Rates
                    </Typography>
                    <Stack spacing={1.25}>
                      <Typography variant="body2" color="text.secondary">
                        Average content created per day:{' '}
                        {contentStats.creationRates.averagePerDay}
                      </Typography>
                      {Object.entries(
                        contentStats.creationRates.byTypePerDay
                      ).map(([key, value]) => (
                        <Box
                          key={key}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ textTransform: 'capitalize' }}
                          >
                            {key}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {value}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      Recent Content Trend
                    </Typography>
                    <Stack spacing={1.25}>
                      {latestContentTrend.map((item) => (
                        <Box
                          key={item.date}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.date}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.total} total
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}

            {isMetricEnabled('platform.moderation') ? (
              <Grid container spacing={3}>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      Moderation Queue Details
                    </Typography>
                    <Stack spacing={1.5}>
                      <Typography variant="body2" color="text.secondary">
                        Pending: {moderationQueue.queue.pendingTotal} | Avg
                        resolution:{' '}
                        {moderationQueue.throughput.averageResolutionHours}h
                      </Typography>
                      <Typography variant="body2">
                        &lt;24h:{' '}
                        {moderationQueue.queue.pendingAging.lessThan24h}
                      </Typography>
                      <Typography variant="body2">
                        24-72h:{' '}
                        {moderationQueue.queue.pendingAging.between24hAnd72h}
                      </Typography>
                      <Typography variant="body2">
                        &gt;72h:{' '}
                        {moderationQueue.queue.pendingAging.greaterThan72h}
                      </Typography>
                      <Divider />
                      {moderationQueue.queue.pendingByType.map((item) => (
                        <Box
                          key={item.type}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.type}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      Reports and Reasons
                    </Typography>
                    <Stack spacing={1.25}>
                      {latestModerationTrend.map((item) => (
                        <Box
                          key={item.date}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2">{item.date}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                      <Divider />
                      {moderationQueue.queue.topPendingReasons.map((item) => (
                        <Box
                          key={item.reason}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                          }}
                        >
                          <Typography variant="body2" sx={{ maxWidth: '75%' }}>
                            {item.reason}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.count}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">
              Loading platform insights...
            </Typography>
          </Box>
        )
      ) : null}

      {activeTab === 'trending' ? (
        !loading && trendingData ? (
          <Stack spacing={3} ref={chartExportRef}>
            {isMetricEnabled('trending.summary') ? (
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Trending Period
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {trendingData.period}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Source: {trendingData.source}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Top Score
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {trendingData.posts[0]?.score?.toFixed(2) || '0.00'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Highest ranked trending post
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Typography variant="overline" color="text.secondary">
                      Last Calculated
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {new Date(trendingData.calculatedAt).toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Updated hourly with smoothing
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}

            {isMetricEnabled('trending.list') ? (
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  Trending Posts Leaderboard
                </Typography>
                <Stack spacing={1.5}>
                  {trendingData.posts.length === 0 ? (
                    <Typography color="text.secondary">
                      No trending posts found for this period.
                    </Typography>
                  ) : (
                    trendingData.posts.map((item) => (
                      <Box
                        key={item.postId}
                        sx={{
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          p: 1.75,
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            #{item.rank} {item.subject}
                          </Typography>
                          <Typography variant="subtitle2" color="primary.main">
                            Score {item.score.toFixed(2)}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.75 }}
                        >
                          {item.contentPreview}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 2,
                            flexWrap: 'wrap',
                            mt: 1,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Upvotes: {item.upvotes}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Comments: {item.comments}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Author: {item.creator.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created: {new Date(item.createdAt).toLocaleString()}
                          </Typography>
                        </Box>
                      </Box>
                    ))
                  )}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">
              Loading trending scores...
            </Typography>
          </Box>
        )
      ) : null}
    </Container>
  );
};

export default AdminAnalyticsPage;
