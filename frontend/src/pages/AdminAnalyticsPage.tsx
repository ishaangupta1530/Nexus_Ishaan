import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import Divider from '@mui/material/Divider';
import { useAuth } from '@/contexts/AuthContext';
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

const PERIOD_OPTIONS: Array<{ label: string; value: ConnectionAnalyticsPeriod }> = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Last 1 Year', value: '1y' },
];

const ENGAGEMENT_PERIOD_OPTIONS: Array<{ label: string; value: EngagementAnalyticsPeriod }> = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Last 1 Year', value: '1y' },
];

type AdminUserOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type TabType = 'connections' | 'engagement' | 'referrals';

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off',     value: 0   },
  { label: '30 sec',  value: 30  },
  { label: '1 min',   value: 60  },
  { label: '5 min',   value: 300 },
] as const;

const AdminAnalyticsPage: FC = () => {
  const { user, token } = useAuth();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('connections');
  
  // Connection analytics state
  const [period, setPeriod] = useState<ConnectionAnalyticsPeriod>('30d');
  const [targetUserId, setTargetUserId] = useState('');
  const [growth, setGrowth] = useState<ConnectionGrowthResponse | null>(null);
  const [distribution, setDistribution] = useState<ConnectionDistributionResponse | null>(null);
  const [strength, setStrength] = useState<ConnectionStrengthResponse | null>(null);
  
  // Engagement analytics state
  const [engagementPeriod, setEngagementPeriod] = useState<EngagementAnalyticsPeriod>('30d');
  const [engagementSummary, setEngagementSummary] = useState<EngagementSummaryResponse | null>(null);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapResponse | null>(null);
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const [contentPerformance, setContentPerformance] = useState<ContentPerformanceResponse | null>(null);
  const [contentPerfPage, setContentPerfPage] = useState(1);

  // Referral and mentorship analytics state
  const [referralConversion, setReferralConversion] = useState<ReferralConversionResponse | null>(null);
  const [referralFunnel, setReferralFunnel] = useState<ReferralFunnelResponse | null>(null);
  const [mentorshipSummary, setMentorshipSummary] = useState<MentorshipSummaryResponse | null>(null);
  const [mentorshipImpact, setMentorshipImpact] = useState<MentorshipImpactResponse | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState('ALL');
  
  // General state
  const [userOptions, setUserOptions] = useState<AdminUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time / refresh state
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user?.id) {
      setTargetUserId(user.id);
    }
  }, [user?.id]);

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
          : ((raw as { users?: AdminUserOption[] })?.users || []);
        setUserOptions(users);
      } catch (err) {
        console.error('Failed to load users for analytics selector', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadUsers();
  }, [user?.role]);

  // Load connection analytics
  const loadConnectionAnalytics = useCallback(async (silent = false) => {
    if (!targetUserId) {
      setError('Target user ID is required to fetch analytics.');
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const [growthRes, distributionRes, strengthRes] = await Promise.all([
        connectionAnalyticsService.getGrowth(targetUserId, period),
        connectionAnalyticsService.getDistribution(targetUserId),
        connectionAnalyticsService.getStrengthScore(targetUserId),
      ]);

      setGrowth(growthRes.data);
      setDistribution(distributionRes.data);
      setStrength(strengthRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load connection analytics', err);
      setError('Failed to load analytics. Ensure your admin token is valid and try again.');
    } finally {
      setLoading(false);
    }
  }, [period, targetUserId]);

  // Load engagement analytics
  const loadEngagementAnalytics = useCallback(async (silent = false) => {
    if (!targetUserId) {
      setError('Target user ID is required to fetch analytics.');
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const [summaryRes, heatmapRes, perfRes] = await Promise.allSettled([
        engagementAnalyticsService.getSummary(targetUserId, engagementPeriod),
        engagementAnalyticsService.getHeatmap(targetUserId, heatmapYear),
        engagementAnalyticsService.getContentPerformance(targetUserId, contentPerfPage, 10),
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
      setError('Failed to load engagement analytics. Ensure your admin token is valid and try again.');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, engagementPeriod, heatmapYear, contentPerfPage]);

  const loadReferralMentorshipAnalytics = useCallback(async (silent = false) => {
    if (!targetUserId) {
      setError('Target user ID is required to fetch analytics.');
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const [conversionRes, funnelRes, mentorshipSummaryRes, mentorshipImpactRes] =
        await Promise.allSettled([
          referralMentorshipAnalyticsService.getReferralConversion(targetUserId),
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
        throw new Error('All referral and mentorship analytics requests failed');
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load referral and mentorship analytics', err);
      setError('Failed to load referral and mentorship analytics. Ensure your admin token is valid and try again.');
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    if (targetUserId && activeTab === 'connections') {
      void loadConnectionAnalytics();
    }
  }, [targetUserId, period, activeTab, loadConnectionAnalytics]);

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

  // Silent (non-blocking) refresh for auto-refresh and WS-triggered updates
  const silentRefreshCurrentTab = useCallback(async () => {
    if (!targetUserId) return;
    if (activeTab === 'connections') await loadConnectionAnalytics(true);
    else if (activeTab === 'engagement') await loadEngagementAnalytics(true);
    else await loadReferralMentorshipAnalytics(true);
  }, [activeTab, targetUserId, loadConnectionAnalytics, loadEngagementAnalytics, loadReferralMentorshipAnalytics]);

  // Manual refresh handler — shows button spinner, NOT the page overlay
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await silentRefreshCurrentTab();
    setIsRefreshing(false);
  }, [silentRefreshCurrentTab]);

  // Auto-refresh interval effect
  useEffect(() => {
    if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    if (autoRefreshInterval > 0) {
      autoRefreshTimerRef.current = setInterval(() => {
        void silentRefreshCurrentTab();
      }, autoRefreshInterval * 1_000);
    }
    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
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
      { label: 'Avg Response Time', value: `${strength.metrics.averageResponseTimeHours}h` },
      { label: 'Network Density', value: `${strength.metrics.networkDensity.toFixed(2)}%` },
      { label: 'Top Role', value: distribution.byRole[0]?.role || 'N/A' },
      { label: 'Strength Score', value: strength.score },
      { label: 'Period', value: period.toUpperCase() },
    ];
  }, [distribution, growth, strength, period]);

  const selectedUserExists = useMemo(
    () => userOptions.some((option) => option.id === targetUserId),
    [targetUserId, userOptions],
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

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* ── Page header ─────────────────────────────── */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Admin Analytics Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Comprehensive analytics for connections, engagement, and performance metrics.
            </Typography>
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
                onAnalyticsUpdate={() => { void silentRefreshCurrentTab(); }}
              />
            ) : null}

            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />

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
              onRefresh={() => { void handleManualRefresh(); }}
              isLoading={isRefreshing}
              disabled={!targetUserId}
            />

            <LastUpdatedBadge lastUpdated={lastUpdated} />
          </Box>
        </Box>
      </Stack>

      {/* Tab navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as TabType)}>
          <Tab label="Connection Analytics" value="connections" />
          <Tab label="Engagement Analytics" value="engagement" />
          <Tab label="Referrals & Mentorship" value="referrals" />
        </Tabs>
      </Box>

      {/* Shared controls */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Target User"
            select
            value={selectedUserExists ? targetUserId : ''}
            onChange={(event) => setTargetUserId(event.target.value)}
            helperText="Select a user account to inspect analytics"
            disabled={loadingUsers || userOptions.length === 0}
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

        <Grid item xs={12} md={6}>
          {activeTab === 'referrals' ? (
            <TextField
              fullWidth
              label="Range"
              value="All Available Data"
              disabled
            />
          ) : (
            <TextField
              fullWidth
              label="Period"
              select
              value={activeTab === 'connections' ? period : engagementPeriod}
              onChange={(event) => {
                if (activeTab === 'connections') {
                  setPeriod(event.target.value as ConnectionAnalyticsPeriod);
                } else {
                  setEngagementPeriod(event.target.value as EngagementAnalyticsPeriod);
                }
              }}
            >
              {(activeTab === 'connections' ? PERIOD_OPTIONS : ENGAGEMENT_PERIOD_OPTIONS).map(
                (option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                )
              )}
            </TextField>
          )}
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {/* Connection Analytics Tab */}
      {!loading && activeTab === 'connections' && growth && distribution && strength ? (
        <Stack spacing={3}>
          {/* Animated summary row */}
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', pb: 0.5 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Total Connections
              </Typography>
              <UpdateAnimation
                value={growth.metrics.totalConnections}
                variant="h5"
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Growth Rate
              </Typography>
              <UpdateAnimation
                value={growth.metrics.growthRate}
                decimals={1}
                suffix="%"
                variant="h5"
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Strength Score
              </Typography>
              <UpdateAnimation
                value={typeof strength.score === 'number' ? strength.score : parseFloat(String(strength.score))}
                decimals={1}
                variant="h5"
                sx={{ fontWeight: 700 }}
              />
            </Box>
          </Box>

          <ConnectionMetricsCard metrics={connectionMetrics} />

          <Grid container spacing={3}>
            <Grid item xs={12} lg={8}>
              <ConnectionGrowthChart growth={growth} />
            </Grid>
            <Grid item xs={12} lg={4}>
              <NetworkStrengthGauge strength={strength} />
            </Grid>
          </Grid>

          <ConnectionDistributionChart distribution={distribution} />
        </Stack>
      ) : null}

      {/* Engagement Analytics Tab */}
      {activeTab === 'engagement' ? (
        !loading && engagementData && heatmap && contentPerformance ? (
          <Stack spacing={3}>
            <EngagementMetricsCard data={engagementData} />

            <ActivityHeatmap
              data={heatmap}
              onYearChange={setHeatmapYear}
              isLoading={loading}
            />

            <EngagementAreaChart
              data={engagementData}
              isLoading={loading}
            />

            <ContentPerformanceChart
              data={contentPerformance}
              onPageChange={setContentPerfPage}
              isLoading={loading}
            />
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">Loading engagement analytics...</Typography>
          </Box>
        )
      ) : null}

      {activeTab === 'referrals' ? (
        !loading && referralConversion && referralFunnel && mentorshipSummary && mentorshipImpact ? (
          <Stack spacing={3}>
            <ReferralMetricsCard conversion={referralConversion} />

            <ApplicationFunnelChart funnelData={referralFunnel} />

            <ReferralSuccessChart
              conversion={referralConversion}
              selectedIndustry={selectedIndustry}
              onIndustryChange={setSelectedIndustry}
            />

            <MentorshipDashboard
              summary={mentorshipSummary}
              impact={mentorshipImpact}
            />
          </Stack>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography color="text.secondary">Loading referral and mentorship analytics...</Typography>
          </Box>
        )
      ) : null}
    </Container>
  );
};

export default AdminAnalyticsPage;
