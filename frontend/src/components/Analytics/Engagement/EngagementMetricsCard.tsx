import React from 'react';
import {
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Typography,
  Stack,
  LinearProgress,
} from '@mui/material';
import {
  FileText,
  MessageCircle,
  ThumbsUp,
  BarChart3,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { EngagementSummaryData } from '../../../services/engagementAnalyticsService';

interface EngagementMetricsCardProps {
  data?: EngagementSummaryData;
}

interface MetricItem {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  trend?: number;
  progress?: number;
  color: string;
}

const EngagementMetricsCard: React.FC<EngagementMetricsCardProps> = ({
  data,
}) => {
  if (!data) {
    return (
      <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No engagement data available</Typography>
      </Paper>
    );
  }

  const metrics: MetricItem[] = [
    {
      icon: <FileText size={24} />,
      label: 'Posts Created',
      value: data.postsCreated,
      color: '#1976d2',
    },
    {
      icon: <MessageCircle size={24} />,
      label: 'Comments Made',
      value: data.commentsMade,
      color: '#43a047',
    },
    {
      icon: <ThumbsUp size={24} />,
      label: 'Votes Sent',
      value: data.votesGiven,
      color: '#fb8c00',
    },
    {
      icon: <ThumbsUp size={24} />,
      label: 'Votes Received',
      value: data.votesReceived,
      color: '#e53935',
    },
    {
      icon: <BarChart3 size={24} />,
      label: 'Engagement Rate',
      value: data.averageEngagementRate.toFixed(2),
      unit: '%',
      color: '#7b1fa2',
    },
    {
      icon: <Zap size={24} />,
      label: 'Performance Score',
      value: data.contentPerformanceScore.toFixed(1),
      color: '#fbc02d',
      progress: Math.min((data.contentPerformanceScore / 200) * 100, 100),
    },
  ];

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp size={20} />
            Engagement Metrics - {data.period}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {metrics.map((metric, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Card
                sx={{
                  height: '100%',
                  background: `linear-gradient(135deg, ${metric.color}15 0%, ${metric.color}08 100%)`,
                  border: `1px solid ${metric.color}30`,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 24px ${metric.color}20`,
                    border: `1px solid ${metric.color}60`,
                  },
                }}
              >
                <CardContent>
                  <Stack spacing={2}>
                    {/* Icon and Header */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box
                        sx={{
                          p: 1.5,
                          backgroundColor: `${metric.color}15`,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: metric.color,
                        }}
                      >
                        {metric.icon}
                      </Box>
                    </Box>

                    {/* Value */}
                    <Box>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          color: metric.color,
                          lineHeight: 1.2,
                        }}
                      >
                        {metric.value}
                        {metric.unit && (
                          <Typography
                            component="span"
                            variant="h6"
                            sx={{ ml: 0.5, color: 'text.secondary' }}
                          >
                            {metric.unit}
                          </Typography>
                        )}
                      </Typography>
                    </Box>

                    {/* Label */}
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        fontWeight: 500,
                      }}
                    >
                      {metric.label}
                    </Typography>

                    {/* Progress Bar (for score) */}
                    {metric.progress !== undefined && (
                      <Box>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 1,
                          }}
                        >
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Performance
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color: metric.color,
                            }}
                          >
                            {metric.progress.toFixed(0)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={metric.progress}
                          sx={{
                            height: 6,
                            backgroundColor: `${metric.color}20`,
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: metric.color,
                              borderRadius: 3,
                            },
                          }}
                        />
                      </Box>
                    )}

                    {/* Trend Indicator */}
                    {metric.trend !== undefined && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: metric.trend >= 0 ? '#43a047' : '#e53935',
                        }}
                      >
                        <TrendingUp size={16} />
                        <Typography variant="caption">
                          {metric.trend > 0 ? '+' : ''}
                          {metric.trend}%
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Summary Section */}
        <Paper
          sx={{
            p: 2,
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            borderLeft: `4px solid #1976d2`,
          }}
        >
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Summary
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Total Engagement Activity: <strong>{data.postsCreated + data.commentsMade + data.votesReceived}</strong> items
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Average Engagement Rate: <strong>{data.averageEngagementRate.toFixed(2)}%</strong>
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Content Performance: <strong>{data.contentPerformanceScore.toFixed(1)}</strong> points
            </Typography>
            {data.averageEngagementRate > 50 && (
              <Typography variant="caption" sx={{ color: '#43a047', fontWeight: 600, mt: 1 }}>
                ✓ Excellent engagement performance
              </Typography>
            )}
            {data.averageEngagementRate > 20 && data.averageEngagementRate <= 50 && (
              <Typography variant="caption" sx={{ color: '#fb8c00', fontWeight: 600, mt: 1 }}>
                → Good engagement, room for growth
              </Typography>
            )}
            {data.averageEngagementRate <= 20 && (
              <Typography variant="caption" sx={{ color: '#e53935', fontWeight: 600, mt: 1 }}>
                ⚠ Consider creating more engaging content
              </Typography>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Paper>
  );
};

export default EngagementMetricsCard;
