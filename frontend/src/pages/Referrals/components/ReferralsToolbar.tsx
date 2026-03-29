import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { Add, Refresh, RestartAlt } from '@mui/icons-material';
import ExportButton from '@/components/Export/ExportButton';
import GlobalSearchBar from '@/components/Search/GlobalSearchBar';

interface ReferralsToolbarProps {
  userRole?: string;
  analytics: {
    totals: { referrals: number; applications: number };
    referralsByStatus: Record<string, number>;
  } | null;
  referralStats: {
    total: number;
    approved: number;
    pending: number;
    myPosts: number;
    myApplications: number;
  };
  loading: boolean;
  searchQuery: string;
  filterStatus: string;
  lastRefreshedAt: string | null;
  error: string | null;
  successMessage: string | null;
  onCloseError: () => void;
  onCloseSuccess: () => void;
  onForceRefresh: () => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
  onResetFilters: () => void;
  onOpenCreate: () => void;
}

export const ReferralsToolbar = ({
  userRole,
  analytics,
  referralStats,
  loading,
  filterStatus,
  lastRefreshedAt,
  error,
  successMessage,
  onCloseError,
  onCloseSuccess,
  onForceRefresh,
  onSearchChange,
  onFilterChange,
  onResetFilters,
  onOpenCreate,
}: ReferralsToolbarProps) => {
  return (
    <>
      {userRole === 'ADMIN' && analytics && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={2}>
              <Chip
                label={`Total Referrals: ${analytics.totals.referrals}`}
                color="primary"
              />
              <Chip
                label={`Total Applications: ${analytics.totals.applications}`}
                color="secondary"
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Chip
                label={`Approved: ${analytics.referralsByStatus.APPROVED || 0}`}
              />
              <Chip
                label={`Pending: ${analytics.referralsByStatus.PENDING || 0}`}
              />
              <Chip
                label={`Rejected: ${analytics.referralsByStatus.REJECTED || 0}`}
              />
            </Stack>
          </Stack>
        </Box>
      )}

      <Box
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 p-4"
        sx={{
          mb: 3,
          p: { xs: 2, md: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
        }}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 700, mb: 0.5 }}
          >
            Job Referrals
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Discover curated roles from alumni and track your referral journey
            in one place
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              label={`Total: ${referralStats.total}`}
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`Approved: ${referralStats.approved}`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`Pending: ${referralStats.pending}`}
              color="warning"
              variant="outlined"
            />
            <Chip
              label={`My Posts: ${referralStats.myPosts}`}
              variant="outlined"
            />
            <Chip
              label={`My Applications: ${referralStats.myApplications}`}
              variant="outlined"
            />
          </Stack>
        </Box>
        <ExportButton
          exportType="REFERRALS"
          pageTitle="Referrals"
          filters={{
            status: filterStatus === 'ALL' ? undefined : filterStatus,
          }}
          isCompact
        />
        <Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={onForceRefresh}
            disabled={loading}
            sx={{ textTransform: 'none', width: { xs: '100%', sm: 'auto' } }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={onCloseError}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={onCloseSuccess}>
          {successMessage}
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{
          mb: 3,
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ width: '100%' }}
        >
          <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: 420 } }}>
            <GlobalSearchBar
              variant="default"
              placeholder="Search referrals... (company, title, location)"
              onSearch={onSearchChange}
            />
          </Box>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filterStatus}
              onChange={(e) => onFilterChange(e.target.value)}
              label="Status"
            >
              <MenuItem value="ALL">All Status</MenuItem>
              {userRole === 'ADMIN' && (
                <MenuItem value="PENDING">Pending</MenuItem>
              )}
              <MenuItem value="APPROVED">Approved</MenuItem>
              {userRole === 'ADMIN' && (
                <MenuItem value="REJECTED">Rejected</MenuItem>
              )}
            </Select>
          </FormControl>
          <Button
            variant="text"
            size="small"
            startIcon={<RestartAlt />}
            onClick={onResetFilters}
            sx={{ textTransform: 'none', width: { xs: '100%', sm: 'auto' } }}
          >
            Clear filters
          </Button>
        </Stack>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.2}
          alignItems={{ xs: 'stretch', md: 'center' }}
        >
          {lastRefreshedAt && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {lastRefreshedAt}
            </Typography>
          )}

          {(userRole === 'ALUM' || userRole === 'ADMIN') && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={onOpenCreate}
              sx={{ borderRadius: 2, width: { xs: '100%', md: 'auto' } }}
            >
              Post Referral
            </Button>
          )}
        </Stack>
      </Stack>
    </>
  );
};
