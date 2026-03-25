import { FC } from 'react';
import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { type ConnectionGrowthResponse } from '@/services/connectionAnalyticsService';

interface ConnectionGrowthChartProps {
  growth: ConnectionGrowthResponse;
}

const ConnectionGrowthChart: FC<ConnectionGrowthChartProps> = ({ growth }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{ mb: 2 }}
            spacing={1}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Connection Growth
            </Typography>
            <Stack direction="row" spacing={1}>
              <Chip
                label={`Growth ${growth.metrics.growthRate}%`}
                color={growth.metrics.growthRate >= 0 ? 'success' : 'error'}
                size="small"
              />
              <Chip
                label={`Velocity ${growth.metrics.velocity}/bucket`}
                color="primary"
                size="small"
              />
            </Stack>
          </Stack>

          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={growth.data}>
              <defs>
                <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value, key) => {
                  if (key === 'newConnections') return [value, 'New Connections'];
                  if (key === 'totalConnections') return [value, 'Total Connections'];
                  return [value, String(key)];
                }}
              />
              <Area
                type="monotone"
                dataKey="newConnections"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#growthFill)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="totalConnections"
                stroke="#0f172a"
                strokeWidth={2.5}
                dot={{ r: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ConnectionGrowthChart;
