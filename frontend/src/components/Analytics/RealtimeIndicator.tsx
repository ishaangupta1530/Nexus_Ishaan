import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { io, Socket } from 'socket.io-client';

type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface Props {
  userId: string;
  token: string;
  onAnalyticsUpdate?: () => void;
}

const STATUS_CONFIG: Record<
  Status,
  { color: string; label: string; pulse: boolean }
> = {
  connected: { color: '#4caf50', label: 'Live', pulse: true },
  connecting: { color: '#ff9800', label: 'Connecting…', pulse: false },
  reconnecting: { color: '#ff9800', label: 'Reconnecting…', pulse: false },
  disconnected: { color: '#f44336', label: 'Disconnected', pulse: false },
};

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
const MAX_RECONNECT = 5;

const RealtimeIndicator: FC<Props> = ({ userId, token, onAnalyticsUpdate }) => {
  const [status, setStatus] = useState<Status>('disconnected');
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  // Stable reference for the callback so the effect doesn't re-run on each render
  const onUpdateRef = useRef(onAnalyticsUpdate);
  useEffect(() => {
    onUpdateRef.current = onAnalyticsUpdate;
  }, [onAnalyticsUpdate]);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    setStatus('connecting');

    const socket = io(`${BACKEND_URL}/dashboard`, {
      query: { userId, token },
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 10_000,
      forceNew: true,
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (unmountedRef.current) return;
      attemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setStatus('connected');
      socket.emit('subscribe', { channels: ['analytics'], userId });
    });

    const scheduleReconnect = () => {
      if (unmountedRef.current) return;
      if (attemptsRef.current >= MAX_RECONNECT) {
        setStatus('disconnected');
        return;
      }
      if (reconnectTimerRef.current) return;

      attemptsRef.current += 1;
      setStatus('reconnecting');
      const delay = Math.min(1_000 * attemptsRef.current, 10_000);
      reconnectTimerRef.current = setTimeout(() => {
        // Avoid stacking timers when both disconnect and connect_error fire.
        reconnectTimerRef.current = null;
        socketRef.current?.removeAllListeners();
        socketRef.current?.disconnect();
        connect();
      }, delay);
    };

    socket.on('disconnect', () => {
      if (unmountedRef.current) return;
      scheduleReconnect();
    });

    socket.on('connect_error', () => {
      if (unmountedRef.current) return;
      scheduleReconnect();
    });

    // Backend can push this event to notify the dashboard to refresh data
    socket.on('analytics:update', () => {
      onUpdateRef.current?.();
    });
  }, [userId, token]);

  useEffect(() => {
    if (!userId || !token) return;
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [userId, token, connect]);

  const cfg = STATUS_CONFIG[status];

  return (
    <Tooltip title={`WebSocket: ${cfg.label}`} arrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: cfg.color,
            flexShrink: 0,
            '@keyframes rtPulse': {
              '0%': { boxShadow: `0 0 0 0 ${cfg.color}80` },
              '70%': { boxShadow: `0 0 0 7px transparent` },
              '100%': { boxShadow: `0 0 0 0 transparent` },
            },
            animation: cfg.pulse ? 'rtPulse 2s ease-out infinite' : 'none',
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: 'nowrap' }}
        >
          {cfg.label}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default RealtimeIndicator;
