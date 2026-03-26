import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  CircularProgress,
  Typography,
  Button,
  Stack,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { EngagementSummaryData } from '../../../services/engagementAnalyticsService';

interface EngagementAreaChartProps {
  data?: EngagementSummaryData;
  isLoading?: boolean;
}

const EngagementAreaChart: React.FC<EngagementAreaChartProps> = ({
  data,
  isLoading = false,
}) => {
  const [visibleSeries, setVisibleSeries] = useState({
    posts: true,
    comments: true,
    votes: true,
  });

  const handleToggleSeries = useCallback(
    (series: keyof typeof visibleSeries) => {
      setVisibleSeries((prev) => ({
        ...prev,
        [series]: !prev[series],
      }));
    },
    [],
  );

  const handleExportData = useCallback(() => {
    if (!data?.timeline?.length) {
      return;
    }

    const header = ['label', 'bucketStart', 'bucketEnd', 'posts', 'comments', 'votes'];
    const rows = data.timeline.map((point) => [
      point.label,
      point.bucketStart,
      point.bucketEnd,
      String(point.posts),
      String(point.comments),
      String(point.votes),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `engagement-data-${data.period}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [data]);

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (!data?.timeline) {
    return (
      <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No engagement data available</Typography>
      </Paper>
    );
  }

  const chartData = data.timeline.map((point) => ({
    label: point.label,
    posts: point.posts,
    comments: point.comments,
    votes: point.votes,
    total: point.posts + point.comments + point.votes,
  }));

  const totalPosts = data.timeline.reduce((sum, p) => sum + p.posts, 0);
  const totalComments = data.timeline.reduce((sum, p) => sum + p.comments, 0);
  const totalVotes = data.timeline.reduce((sum, p) => sum + p.votes, 0);
  const summary = `Engagement timeline with ${chartData.length} points. Total posts ${totalPosts}, comments ${totalComments}, votes ${totalVotes}.`;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Engagement Timeline - {data.period}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleExportData}
            startIcon={<DownloadIcon fontSize="small" />}
            aria-label="Export engagement timeline data as CSV"
            sx={{ minHeight: 44 }}
          >
            Export Data
          </Button>
        </Box>

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Total Posts
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {totalPosts}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Total Comments
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {totalComments}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Total Votes
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {totalVotes}
            </Typography>
          </Box>
        </Box>

        {/* Legend toggles */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={visibleSeries.posts}
                onChange={() => handleToggleSeries('posts')}
                size="small"
              />
            }
            label={
              <Typography variant="caption">
                Posts
              </Typography>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={visibleSeries.comments}
                onChange={() => handleToggleSeries('comments')}
                size="small"
              />
            }
            label={
              <Typography variant="caption">
                Comments
              </Typography>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={visibleSeries.votes}
                onChange={() => handleToggleSeries('votes')}
                size="small"
              />
            }
            label={
              <Typography variant="caption">
                Votes
              </Typography>
            }
          />
        </Box>

        {/* Chart */}
        <Box
          id="engagement-area-chart"
          role="img"
          aria-label={summary}
          sx={{ width: '100%', height: 300 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient
                  id="colorComments"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorVotes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ffc658" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
              <Legend />
              {visibleSeries.posts && (
                <Area
                  type="monotone"
                  dataKey="posts"
                  stroke="#8884d8"
                  fillOpacity={1}
                  fill="url(#colorPosts)"
                  isAnimationActive={true}
                  animationDuration={800}
                />
              )}
              {visibleSeries.comments && (
                <Area
                  type="monotone"
                  dataKey="comments"
                  stroke="#82ca9d"
                  fillOpacity={1}
                  fill="url(#colorComments)"
                  isAnimationActive={true}
                  animationDuration={800}
                />
              )}
              {visibleSeries.votes && (
                <Area
                  type="monotone"
                  dataKey="votes"
                  stroke="#ffc658"
                  fillOpacity={1}
                  fill="url(#colorVotes)"
                  isAnimationActive={true}
                  animationDuration={800}
                />
              )}
            </AreaChart>
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
    </Paper>
  );
};

export default EngagementAreaChart;
