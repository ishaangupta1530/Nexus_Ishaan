import { FC, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Rating,
  Stack,
  Typography,
} from '@mui/material';
import {
  MentorshipImpactResponse,
  MentorshipSummaryResponse,
} from '@/services/referralMentorshipAnalyticsService';

interface MentorshipDashboardProps {
  summary: MentorshipSummaryResponse;
  impact: MentorshipImpactResponse;
}

const MentorshipDashboard: FC<MentorshipDashboardProps> = ({ summary, impact }) => {
  const hoursProgress = useMemo(
    () => Math.min(100, (summary.summary.mentorshipHoursLogged / 100) * 100),
    [summary.summary.mentorshipHoursLogged],
  );

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Session Hours Logged
              </Typography>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress
                  variant="determinate"
                  value={hoursProgress}
                  size={100}
                  thickness={5}
                />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {summary.summary.mentorshipHoursLogged}h
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Completion Rate: {summary.summary.completionRate.toFixed(1)}%
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Satisfaction Scores
              </Typography>
              <Stack spacing={1}>
                <Typography variant="body2">Mentor Satisfaction</Typography>
                <Rating
                  precision={0.1}
                  value={summary.summary.mentorSatisfactionScore}
                  readOnly
                  max={5}
                />
              </Stack>
              <Stack spacing={1}>
                <Typography variant="body2">Mentee Satisfaction</Typography>
                <Rating
                  precision={0.1}
                  value={summary.summary.menteeSatisfactionScore}
                  readOnly
                  max={5}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Milestones Achieved
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {impact.impact.milestonesAchieved}/{impact.impact.totalMilestones}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={
                  impact.impact.totalMilestones > 0
                    ? (impact.impact.milestonesAchieved / impact.impact.totalMilestones) * 100
                    : 0
                }
              />
              <Typography variant="body2" color="text.secondary">
                Impact Score: {impact.impact.impactScore}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Recent Sessions
              </Typography>
              <List dense>
                {impact.impact.recentSessions.map((session) => (
                  <ListItem key={session.id} divider>
                    <ListItemText
                      primary={session.title}
                      secondary={`${new Date(session.startTime).toLocaleString()} • ${session.status} • Mentor: ${session.mentorName || 'N/A'} • Mentee: ${session.menteeName || 'N/A'}`}
                    />
                  </ListItem>
                ))}
                {impact.impact.recentSessions.length === 0 ? (
                  <ListItem>
                    <ListItemText primary="No sessions logged yet" />
                  </ListItem>
                ) : null}
              </List>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default MentorshipDashboard;
