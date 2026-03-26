import { FC, useEffect, useRef, useState } from 'react';
import { Typography } from '@mui/material';
import type { TypographyProps } from '@mui/material';

export interface UpdateAnimationProps extends Omit<TypographyProps, 'children'> {
  /** The numeric value to display and animate toward. */
  value: number;
  /** Animation duration in milliseconds. Defaults to 800. */
  duration?: number;
  /** Optional text prepended to the formatted number. */
  prefix?: string;
  /** Optional text appended to the formatted number. */
  suffix?: string;
  /** Decimal places to show. Defaults to 0 (integer). */
  decimals?: number;
}

/** Ease-out cubic — fast start, gentle finish. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Renders a number that smoothly animates (counts up or down) whenever
 * the `value` prop changes. Uses `requestAnimationFrame` so it respects
 * the browser's vsync and never blocks the main thread.
 *
 * @example
 * <UpdateAnimation value={totalConnections} suffix=" users" variant="h4" />
 */
const UpdateAnimation: FC<UpdateAnimationProps> = ({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  decimals = 0,
  ...typographyProps
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValueRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = previousValueRef.current;
    const end = value;

    if (start === end) return;

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = start + (end - start) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        previousValueRef.current = end;
        setDisplayValue(end);
      }
    };

    // Cancel any in-flight animation before starting a new one
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toLocaleString();

  return (
    <Typography {...typographyProps}>
      {prefix}
      {formatted}
      {suffix}
    </Typography>
  );
};

export default UpdateAnimation;
