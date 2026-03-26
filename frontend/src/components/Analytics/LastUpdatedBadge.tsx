import { FC, useEffect, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

interface Props {
  lastUpdated: Date | null;
}

const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5)  return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

const formatAbsolute = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Displays a relative "Updated Xs ago" timestamp that re-evaluates every
 * second.  Falls back to an absolute time shown in the tooltip.
 */
const LastUpdatedBadge: FC<Props> = ({ lastUpdated }) => {
  // Force a re-render every second while a timestamp is set
  const [, tick] = useState(0);

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (!lastUpdated) return null;

  return (
    <Tooltip title={`Last refreshed at ${formatAbsolute(lastUpdated)}`} arrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        <AccessTimeIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
        <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
          Updated {formatTimeAgo(lastUpdated)}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default LastUpdatedBadge;
