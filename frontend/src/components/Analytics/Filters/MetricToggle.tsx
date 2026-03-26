import { FC, MouseEvent, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Menu,
  Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';

export interface MetricOption {
  key: string;
  label: string;
  enabled: boolean;
}

interface MetricToggleProps {
  options: MetricOption[];
  onToggle: (key: string) => void;
}

const MetricToggle: FC<MetricToggleProps> = ({ options, onToggle }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const enabledCount = useMemo(
    () => options.filter((item) => item.enabled).length,
    [options],
  );

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<TuneIcon fontSize="small" />}
        onClick={handleOpen}
        aria-label="Show or hide metric sections"
        sx={{
          minHeight: 44,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        Metrics ({enabledCount}/{options.length})
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <List dense sx={{ width: 280 }}>
          <ListItem>
            <Typography variant="caption" color="text.secondary">
              Show or hide dashboard metric blocks
            </Typography>
          </ListItem>
          {options.map((option) => (
            <ListItem key={option.key} dense sx={{ minHeight: 44 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={option.enabled}
                    onChange={() => onToggle(option.key)}
                    inputProps={{ 'aria-label': `Toggle ${option.label}` }}
                  />
                }
                label={option.label}
              />
            </ListItem>
          ))}
        </List>
      </Menu>
    </>
  );
};

export default MetricToggle;
