import { FC } from 'react';
import { Card, CardContent, Grid, Typography } from '@mui/material';

interface MetricItem {
  label: string;
  value: string | number;
}

interface ConnectionMetricsCardProps {
  metrics: MetricItem[];
}

const ConnectionMetricsCard: FC<ConnectionMetricsCardProps> = ({ metrics }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
          Connection Metrics
        </Typography>
        <Grid container spacing={2}>
          {metrics.map((metric) => (
            <Grid item xs={12} sm={6} md={3} key={metric.label}>
              <Typography variant="body2" color="text.secondary">
                {metric.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {metric.value}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default ConnectionMetricsCard;
