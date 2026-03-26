import { FC } from 'react';
import { MenuItem, TextField } from '@mui/material';

export type TimePeriodValue = '7d' | '30d' | '90d' | '1y' | 'custom';

interface TimePeriodSelectorProps {
  value: TimePeriodValue;
  onChange: (value: TimePeriodValue) => void;
  label?: string;
}

const OPTIONS: Array<{ label: string; value: TimePeriodValue }> = [
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'Last 1 Year', value: '1y' },
  { label: 'Custom Range', value: 'custom' },
];

const TimePeriodSelector: FC<TimePeriodSelectorProps> = ({
  value,
  onChange,
  label = 'Period',
}) => (
  <TextField
    fullWidth
    select
    label={label}
    value={value}
    onChange={(event) => onChange(event.target.value as TimePeriodValue)}
    SelectProps={{
      MenuProps: {
        PaperProps: {
          sx: {
            '& .MuiMenuItem-root': { minHeight: 44 },
          },
        },
      },
    }}
    sx={{
      '& .MuiInputBase-root': { minHeight: 44 },
      '& .MuiOutlinedInput-root.Mui-focused': {
        outline: '2px solid',
        outlineColor: 'primary.main',
        outlineOffset: 2,
      },
    }}
  >
    {OPTIONS.map((option) => (
      <MenuItem key={option.value} value={option.value}>
        {option.label}
      </MenuItem>
    ))}
  </TextField>
);

export default TimePeriodSelector;
