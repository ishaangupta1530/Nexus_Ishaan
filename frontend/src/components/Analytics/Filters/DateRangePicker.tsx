import { FC } from 'react';
import { Grid, TextField } from '@mui/material';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  disabled?: boolean;
}

const DateRangePicker: FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  disabled = false,
}) => {
  const maxStart = endDate || undefined;
  const minEnd = startDate || undefined;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Start Date"
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          disabled={disabled}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: maxStart }}
          sx={{
            '& .MuiInputBase-root': { minHeight: 44 },
            '& .MuiOutlinedInput-root.Mui-focused': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="End Date"
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          disabled={disabled}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: minEnd }}
          sx={{
            '& .MuiInputBase-root': { minHeight: 44 },
            '& .MuiOutlinedInput-root.Mui-focused': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        />
      </Grid>
    </Grid>
  );
};

export default DateRangePicker;
