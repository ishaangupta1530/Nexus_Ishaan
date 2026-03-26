import { FC } from 'react';
import { Box, Card, CardContent, Tooltip, Typography } from '@mui/material';
import { type ConnectionStrengthResponse } from '@/services/connectionAnalyticsService';

interface NetworkStrengthGaugeProps {
  strength: ConnectionStrengthResponse;
}

const getGaugeColor = (score: number) => {
  if (score < 40) return '#dc2626';
  if (score < 70) return '#d97706';
  return '#16a34a';
};

const NetworkStrengthGauge: FC<NetworkStrengthGaugeProps> = ({ strength }) => {
  const score = Math.max(0, Math.min(100, strength.score));
  const radius = 88;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = getGaugeColor(score);
  const summary = `Network strength score ${score} out of 100. ${strength.interpretation}`;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Network Strength Score
          </Typography>
          <Tooltip title={strength.interpretation}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
              How this is computed?
            </Typography>
          </Tooltip>
        </Box>

        <Box
          sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}
          role="img"
          aria-label={summary}
        >
          <svg height={radius * 2} width={radius * 2}>
            <circle
              stroke="#e2e8f0"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke={color}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${circumference} ${circumference}`}
              style={{ strokeDashoffset, transition: 'stroke-dashoffset 700ms ease-out' }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              transform={`rotate(-90 ${radius} ${radius})`}
            />
            <text
              x="50%"
              y="48%"
              dominantBaseline="middle"
              textAnchor="middle"
              fill="#0f172a"
              fontSize="32"
              fontWeight="700"
            >
              {score}
            </text>
            <text
              x="50%"
              y="64%"
              dominantBaseline="middle"
              textAnchor="middle"
              fill="#64748b"
              fontSize="12"
            >
              out of 100
            </text>
          </svg>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {strength.interpretation}
        </Typography>
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
      </CardContent>
    </Card>
  );
};

export default NetworkStrengthGauge;
