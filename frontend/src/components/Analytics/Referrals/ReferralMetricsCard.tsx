import { FC } from 'react';
import { Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { ReferralConversionResponse } from '@/services/referralMentorshipAnalyticsService';

interface ReferralMetricsCardProps {
  conversion: ReferralConversionResponse;
}

const ReferralMetricsCard: FC<ReferralMetricsCardProps> = ({ conversion }) => {
  const items = [
    { label: 'Referrals Posted', value: conversion.metrics.referralsPosted },
    { label: 'Referrals Applied', value: conversion.metrics.referralsApplied },
    {
      label: 'Successful Applications',
      value: conversion.metrics.successfulApplications,
    },
    {
      label: 'Conversion Rate',
      value: `${conversion.metrics.conversionRate.toFixed(2)}%`,
    },
    { label: 'Perspective', value: conversion.perspective.toUpperCase() },
  ];

  return (
    <Grid container spacing={2}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} lg={2.4} key={item.label}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {item.value}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default ReferralMetricsCard;
