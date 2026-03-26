import { FC, useMemo } from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { FunnelChart, Funnel, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { ReferralFunnelResponse } from '@/services/referralMentorshipAnalyticsService';

interface ApplicationFunnelChartProps {
  funnelData: ReferralFunnelResponse;
}

const ApplicationFunnelChart: FC<ApplicationFunnelChartProps> = ({ funnelData }) => {
  const chartData = useMemo(
    () => funnelData.funnel.map((stage) => ({
      name: stage.stage,
      value: stage.count,
      dropOffRate: stage.dropOffRate,
      conversionRate: stage.conversionRate,
    })),
    [funnelData],
  );

  const summary = `Application funnel with ${chartData.length} stages. First stage ${chartData[0]?.name || 'N/A'} has ${chartData[0]?.value || 0} records.`;

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Application Funnel
          </Typography>

          <Box sx={{ height: 340 }} role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="value" data={chartData} isAnimationActive>
                  <LabelList position="right" fill="#111" stroke="none" dataKey="name" />
                </Funnel>
              </FunnelChart>
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

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {chartData.map((stage) => (
              <Chip
                key={stage.name}
                label={`${stage.name}: ${stage.conversionRate.toFixed(1)}% conv`}
                size="small"
                variant="outlined"
              />
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ApplicationFunnelChart;
