import { FC, useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api';
import connectionAnalyticsService, {
  type ConnectionAnalyticsPeriod,
  type ConnectionDistributionResponse,
  type ConnectionGrowthResponse,
  type ConnectionStrengthResponse,
} from '@/services/connectionAnalyticsService';
import ConnectionGrowthChart from '@/components/Analytics/Connections/ConnectionGrowthChart';
import ConnectionDistributionChart from '@/components/Analytics/Connections/ConnectionDistributionChart';
import NetworkStrengthGauge from '@/components/Analytics/Connections/NetworkStrengthGauge';
import ConnectionMetricsCard from '@/components/Analytics/Connections/ConnectionMetricsCard';

const PERIOD_OPTIONS: Array<{ label: string; value: ConnectionAnalyticsPeriod }> = [
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

const AdminAnalyticsPage: FC = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<ConnectionAnalyticsPeriod>('30d');
  const [targetUserId, setTargetUserId] = useState('');
  const [growth, setGrowth] = useState<ConnectionGrowthResponse | null>(null);
  const [distribution, setDistribution] = useState<ConnectionDistributionResponse | null>(null);
  const [strength, setStrength] = useState<ConnectionStrengthResponse | null>(null);
  const [userOptions, setUserOptions] = useState<AdminUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const users = (response.data || []) as AdminUserOption[];
        setUserOptions(users);
      } catch (err) {
        console.error('Failed to load users for analytics selector', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadUsers();
  }, [user?.role]);

  const loadAnalytics = useCallback(async () => {
    if (!targetUserId) {
      setError('Target user ID is required to fetch analytics.');
      return;
    }

    setLoading(true);
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
    } catch (err) {
      console.error('Failed to load connection analytics', err);
      setError('Failed to load analytics. Ensure your admin token is valid and try again.');
    } finally {
      setLoading(false);
    }
  }, [period, targetUserId]);

  useEffect(() => {
    if (targetUserId) {
      void loadAnalytics();
    }
  }, [targetUserId, loadAnalytics]);

  const metrics = useMemo(() => {
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

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Admin Connection Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Connection growth, distribution, network strength, and velocity analytics.
        </Typography>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            label="Period"
            select
            value={period}
            onChange={(event) => setPeriod(event.target.value as ConnectionAnalyticsPeriod)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            label="Target User"
            select
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            helperText="Select a user account to inspect connection analytics"
            disabled={loadingUsers}
          >
            {userOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {`${option.name || 'Unnamed User'} (${option.email}) - ${option.role}`}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {!loading && growth && distribution && strength ? (
        <Stack spacing={3}>
          <ConnectionMetricsCard metrics={metrics} />

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
    </Container>
  );
};

export default AdminAnalyticsPage;
