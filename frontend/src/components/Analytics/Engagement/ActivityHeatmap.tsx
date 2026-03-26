import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Tooltip,
  Button,
  CircularProgress,
  Typography,
  Stack,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ActivityHeatmapResponse, HeatmapDay } from '../../../services/engagementAnalyticsService';

interface ActivityHeatmapProps {
  data: ActivityHeatmapResponse;
  onYearChange: (year: number) => void;
  isLoading?: boolean;
}

const INTENSITY_COLORS: Record<number, string> = {
  0: '#ebedf0',
  1: '#c6e48b',
  2: '#7bc96f',
  3: '#239a3b',
  4: '#196127',
};

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  data,
  onYearChange,
  isLoading = false,
}) => {
  const summary = `Activity heatmap for ${data.year}. ${data.totalContributions} contributions across ${data.totalActiveDays} active days, max daily count ${data.maxDailyCount}.`;

  // Create a map for quick lookup
  const dayMap = useMemo(() => {
    const map: Record<string, HeatmapDay> = {};
    data.days.forEach((day) => {
      map[day.date] = day;
    });
    return map;
  }, [data.days]);

  // Generate calendar grid
  const calendarWeeks = useMemo(() => {
    const weeks: Array<Array<{ date: string | null; day: HeatmapDay | null }>> =
      [];
    const startDate = new Date(`${data.year}-01-01`);
    const endDate = new Date(`${data.year}-12-31`);

    // Get the day of the week for Jan 1st (0-6)
    const firstDayOfWeek = startDate.getDay();

    // Add empty days at the start
    const firstWeek: Array<{
      date: string | null;
      day: HeatmapDay | null;
    }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      firstWeek.push({ date: null, day: null });
    }

    // Add all days of the year
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (currentDate.getDay() === 0 && firstWeek.length > 0) {
        weeks.push(firstWeek);
        firstWeek.length = 0;
      }

      firstWeek.push({
        date: dateStr,
        day: dayMap[dateStr] || null,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (firstWeek.length > 0) {
      weeks.push(firstWeek);
    }

    return weeks;
  }, [data.year, dayMap]);

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack spacing={2}>
        {/* Header with year navigation */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography variant="h6" sx={{ flex: 1 }}>
            Activity Heatmap - {data.year}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onYearChange(data.year - 1)}
              startIcon={<ChevronLeft size={18} />}
              aria-label={`Show activity heatmap for ${data.year - 1}`}
              sx={{ minHeight: 44 }}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onYearChange(data.year + 1)}
              endIcon={<ChevronRight size={18} />}
              aria-label={`Show activity heatmap for ${data.year + 1}`}
              sx={{ minHeight: 44 }}
            >
              Next
            </Button>
          </Box>
        </Box>

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Total Contributions
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {data.totalContributions}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Active Days
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {data.totalActiveDays}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Max Daily
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {data.maxDailyCount}
            </Typography>
          </Box>
        </Box>

        {/* Calendar grid */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            overflow: 'auto',
            pb: 1,
          }}
          role="img"
          aria-label={summary}
        >
          {calendarWeeks.map((week, weekIdx) => (
            <Box
              key={weekIdx}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {week.map((cell, dayIdx) => (
                <Tooltip
                  key={`${weekIdx}-${dayIdx}`}
                  title={
                    cell.day
                      ? `${cell.day.count} contribution${cell.day.count !== 1 ? 's' : ''}`
                      : ''
                  }
                  arrow
                >
                  <Box
                    tabIndex={cell.day !== null ? 0 : -1}
                    aria-label={
                      cell.day && cell.date
                        ? `${cell.date}: ${cell.day.count} contributions`
                        : 'No data'
                    }
                    sx={{
                      width: 12,
                      height: 12,
                      backgroundColor:
                        cell.day !== null
                          ? INTENSITY_COLORS[cell.day.intensity]
                          : '#f6f8fa',
                      border: '1px solid #d0d7de',
                      borderRadius: '2px',
                      cursor: cell.day !== null ? 'pointer' : 'default',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform:
                          cell.day !== null ? 'scale(1.3)' : 'scale(1)',
                        boxShadow:
                          cell.day !== null
                            ? '0 2px 8px rgba(0,0,0,0.15)'
                            : 'none',
                      },
                      '&:focus-visible': {
                        outline: cell.day !== null ? '2px solid #0f172a' : 'none',
                        outlineOffset: 2,
                      },
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          ))}
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

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Less
          </Typography>
          <Box sx={{ display: 'flex', gap: '2px' }}>
            {[0, 1, 2, 3, 4].map((intensity) => (
              <Box
                key={intensity}
                sx={{
                  width: 12,
                  height: 12,
                  backgroundColor: INTENSITY_COLORS[intensity],
                  border: '1px solid #d0d7de',
                  borderRadius: '2px',
                }}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            More
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
};

export default ActivityHeatmap;
