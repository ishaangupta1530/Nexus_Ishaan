import { FC } from 'react';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

interface Props {
  onRefresh: () => void;
  isLoading: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium';
}

const RefreshButton: FC<Props> = ({ onRefresh, isLoading, disabled = false, size = 'small' }) => (
  <Tooltip title={isLoading ? 'Refreshing…' : 'Refresh data'} arrow>
    {/* span wrapper lets Tooltip work even when button is disabled */}
    <span>
      <IconButton
        onClick={onRefresh}
        disabled={isLoading || disabled}
        size={size}
        aria-label="Refresh analytics data"
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 0.75,
          transition: 'border-color 0.2s',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        {isLoading ? (
          <CircularProgress size={18} thickness={4} color="inherit" />
        ) : (
          <RefreshIcon
            sx={{
              fontSize: 18,
              transition: 'transform 0.3s ease',
              '@keyframes spinOnce': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
            }}
          />
        )}
      </IconButton>
    </span>
  </Tooltip>
);

export default RefreshButton;
