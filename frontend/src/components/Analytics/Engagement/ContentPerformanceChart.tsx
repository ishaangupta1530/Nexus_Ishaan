import React, { useCallback, useState } from 'react';
import {
  Box,
  Paper,
  CircularProgress,
  Typography,
  Stack,
  Pagination,
  Chip,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ContentPerformanceResponse } from '../../../services/engagementAnalyticsService';

interface ContentPerformanceChartProps {
  data: ContentPerformanceResponse;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

const ContentPerformanceChart: React.FC<ContentPerformanceChartProps> = ({
  data,
  onPageChange,
  isLoading = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handlePageChange = useCallback(
    (_event: React.ChangeEvent<unknown>, page: number) => {
      onPageChange(page);
    },
    [onPageChange],
  );

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  // Prepare chart data
  const chartData = data.items.map((post, idx) => ({
    id: post.id,
    title: post.subject.substring(0, 30) + (post.subject.length > 30 ? '...' : ''),
    performance: post.performanceScore,
    votes: post.votes,
    comments: post.comments,
    index: idx,
  }));

  // Color scheme based on performance
  const getBarColor = (score: number) => {
    if (score >= 100) return '#1976d2';
    if (score >= 50) return '#43a047';
    if (score >= 20) return '#fb8c00';
    return '#e53935';
  };

  const totalPerformance = data.items.reduce(
    (sum, post) => sum + post.performanceScore,
    0,
  );
  const avgPerformance =
    data.items.length > 0 ? totalPerformance / data.items.length : 0;
  const chartSummary = `Content performance chart showing ${data.items.length} posts on this page with average score ${avgPerformance.toFixed(1)} and total posts ${data.pagination.total}.`;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        {/* Header */}
        <Typography variant="h6">
          Content Performance - Top Posts
        </Typography>

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Total Posts
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {data.pagination.total}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Avg Performance
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {avgPerformance.toFixed(1)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Top Score
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {data.items.length > 0
                ? Math.max(...data.items.map((p) => p.performanceScore)).toFixed(1)
                : 0}
            </Typography>
          </Box>
        </Box>

        {/* Chart */}
        {data.items.length > 0 ? (
          <Box sx={{ width: '100%', height: 400 }} role="img" aria-label={chartSummary}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 10, right: 30, left: 200, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  dataKey="title"
                  type="category"
                  tick={{ fontSize: 11 }}
                  width={190}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                  formatter={(value) => [
                    typeof value === 'number' ? value.toFixed(1) : value,
                  ]}
                />
                <Legend />
                <Bar
                  dataKey="performance"
                  fill="#8884d8"
                  name="Performance Score"
                  radius={[0, 8, 8, 0]}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.id}`}
                      fill={getBarColor(entry.performance)}
                      opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
            No posts yet
          </Typography>
        )}

        {/* Post details */}
        {data.items.length > 0 && (
          <Stack spacing={2}>
            <Box sx={{ borderTop: '1px solid #e0e0e0', pt: 2 }}>
              {data.items.map((post, idx) => (
                <Box
                  key={post.id}
                  tabIndex={0}
                  aria-label={`${post.subject}, score ${post.performanceScore.toFixed(1)}, ${post.votes} votes, ${post.comments} comments`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 1,
                    borderRadius: 1,
                    backgroundColor:
                      hoveredIndex === idx ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      cursor: 'pointer',
                    },
                  }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(idx)}
                  onBlur={() => setHoveredIndex(null)}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {post.subject}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        display: 'block',
                        mt: 0.5,
                      }}
                    >
                      {new Date(post.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                      label={`Score: ${post.performanceScore.toFixed(1)}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        backgroundColor: `${getBarColor(post.performanceScore)}20`,
                        borderColor: getBarColor(post.performanceScore),
                      }}
                    />
                    <Chip
                      label={`👍 ${post.votes}`}
                      size="small"
                      variant="filled"
                    />
                    <Chip
                      label={`💬 ${post.comments}`}
                      size="small"
                      variant="filled"
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          </Stack>
        )}

        {/* Pagination */}
        {data.pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination
              count={data.pagination.totalPages}
              page={data.pagination.page}
              onChange={handlePageChange}
              color="primary"
              aria-label="Content performance page navigation"
              sx={{ '& .MuiPaginationItem-root': { minWidth: 44, minHeight: 44 } }}
            />
          </Box>
        )}

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
          {chartSummary}
        </Typography>
      </Stack>
    </Paper>
  );
};

export default ContentPerformanceChart;
