import { FC, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import DownloadIcon from '@mui/icons-material/Download';
import { ReferralConversionResponse } from '@/services/referralMentorshipAnalyticsService';

interface ReferralSuccessChartProps {
  conversion: ReferralConversionResponse;
  selectedIndustry: string;
  onIndustryChange: (industry: string) => void;
  chartType?: 'line' | 'bar';
}

const ReferralSuccessChart: FC<ReferralSuccessChartProps> = ({
  conversion,
  selectedIndustry,
  onIndustryChange,
  chartType = 'line',
}) => {
  const industries = useMemo(
    () => conversion.successByIndustry.map((item) => item.industry),
    [conversion.successByIndustry],
  );

  const lineData = useMemo(() => {
    const source =
      selectedIndustry === 'ALL'
        ? conversion.successByIndustry
        : conversion.successByIndustry.filter(
            (item) => item.industry === selectedIndustry,
          );

    return source.map((item) => ({
      industry: item.industry,
      posted: item.total,
      successful: item.successful,
      successRate: item.successRate,
    }));
  }, [conversion.successByIndustry, selectedIndustry]);

  const summary = `Referral success chart for ${selectedIndustry === 'ALL' ? 'all industries' : selectedIndustry}. ${lineData.length} categories displayed.`;

  const exportData = () => {
    const header = ['industry', 'posted', 'successful', 'successRate'];
    const csv = [
      header.join(','),
      ...lineData.map((row) =>
        [row.industry, row.posted, row.successful, row.successRate].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `referral-success-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Referral Success Rate
            </Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Industry"
                select
                value={selectedIndustry}
                onChange={(event) => onIndustryChange(event.target.value)}
                sx={{ minWidth: 200, '& .MuiInputBase-root': { minHeight: 44 } }}
                inputProps={{ 'aria-label': 'Select industry for referral success chart' }}
              >
                <MenuItem value="ALL">All Industries</MenuItem>
                {industries.map((industry) => (
                  <MenuItem key={industry} value={industry}>
                    {industry}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon fontSize="small" />}
                onClick={exportData}
                aria-label="Export referral success data as CSV"
                sx={{ minHeight: 44 }}
              >
                Export Data
              </Button>
            </Stack>
          </Stack>

          <Box sx={{ height: 340 }} role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="industry" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="posted" fill="#1976d2" name="Posted" />
                  <Bar dataKey="successful" fill="#2e7d32" name="Successful" />
                  <Bar dataKey="successRate" fill="#ed6c02" name="Success Rate %" />
                </BarChart>
              ) : (
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="industry" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="posted" stroke="#1976d2" name="Posted" />
                  <Line
                    type="monotone"
                    dataKey="successful"
                    stroke="#2e7d32"
                    name="Successful"
                  />
                  <Line
                    type="monotone"
                    dataKey="successRate"
                    stroke="#ed6c02"
                    name="Success Rate %"
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </Box>

          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              width: 1,
              height: 1,
              p: 0,
              m: -1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {summary}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ReferralSuccessChart;
