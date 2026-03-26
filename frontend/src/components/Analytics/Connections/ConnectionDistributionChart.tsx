import { FC, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { type ConnectionDistributionResponse } from '@/services/connectionAnalyticsService';

type ViewMode = 'role' | 'year' | 'location';

const ROLE_COLORS = ['#2563eb', '#0891b2', '#14b8a6', '#0f766e'];
const GENERAL_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#84cc16',
  '#06b6d4',
  '#6366f1',
  '#d946ef',
  '#ec4899',
];

interface ConnectionDistributionChartProps {
  distribution: ConnectionDistributionResponse;
}

const ConnectionDistributionChart: FC<ConnectionDistributionChartProps> = ({
  distribution,
}) => {
  const [activeView, setActiveView] = useState<ViewMode>('role');
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());

  const chartData = useMemo(() => {
    if (activeView === 'role') {
      return distribution.byRole.map((item) => ({
        label: item.role,
        value: item.count,
      }));
    }

    if (activeView === 'year') {
      return distribution.byGraduationYear.map((item) => ({
        label: item.year,
        value: item.count,
      }));
    }

    return distribution.byLocation.slice(0, 7).map((item) => ({
      label: item.location,
      value: item.count,
    }));
  }, [activeView, distribution]);

  const colors = activeView === 'role' ? ROLE_COLORS : GENERAL_COLORS;

  const visibleData = chartData
    .filter((item) => !hiddenLabels.has(item.label))
    .map((item, index) => ({
      ...item,
      fill: colors[index % colors.length],
    }));

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Connection Distribution
          </Typography>

          <ToggleButtonGroup
            value={activeView}
            exclusive
            size="small"
            onChange={(_e, value: ViewMode | null) => {
              if (!value) return;
              setActiveView(value);
              setHiddenLabels(new Set());
            }}
            aria-label="Connection distribution grouping"
            sx={{ '& .MuiToggleButton-root': { minHeight: 44 } }}
          >
            <ToggleButton value="role">Role</ToggleButton>
            <ToggleButton value="year">Year</ToggleButton>
            <ToggleButton value="location">Location</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={visibleData}
              dataKey="value"
              nameKey="label"
              outerRadius={110}
              label={(entry) => {
                const total = visibleData.reduce(
                  (sum, item) => sum + item.value,
                  0
                );
                const pct = total > 0 ? (entry.value / total) * 100 : 0;
                return `${pct.toFixed(1)}%`;
              }}
            />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {chartData.map((item, index) => {
            const isHidden = hiddenLabels.has(item.label);
            return (
              <ToggleButton
                key={item.label}
                value={item.label}
                selected={!isHidden}
                size="small"
                aria-label={`Toggle ${item.label} visibility`}
                sx={{
                  textTransform: 'none',
                  minHeight: 44,
                  borderColor: colors[index % colors.length],
                  color: colors[index % colors.length],
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                }}
                onClick={() => {
                  setHiddenLabels((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.label)) {
                      next.delete(item.label);
                    } else {
                      next.add(item.label);
                    }
                    return next;
                  });
                }}
              >
                {item.label}
              </ToggleButton>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ConnectionDistributionChart;
