import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import GlobalSearchBar from '@/components/Search/GlobalSearchBar';

interface ConnectionsFiltersProps {
  searchTerm: string;
  roleFilter: string;
  onSearchTermChange: (value: string) => void;
  onRoleFilterChange: (event: SelectChangeEvent<string>) => void;
  onSubmit: (event: React.FormEvent) => void;
}

const ConnectionsFilters = ({
  roleFilter,
  onSearchTermChange,
  onRoleFilterChange,
  onSubmit,
}: ConnectionsFiltersProps) => {
  return (
    <Box component="form" onSubmit={onSubmit} sx={{ mb: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', sm: 'center' }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <GlobalSearchBar
            variant="default"
            placeholder="Search connections..."
            onSearch={onSearchTermChange}
          />
        </Box>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 140 } }}>
          <InputLabel>Role</InputLabel>
          <Select value={roleFilter} label="Role" onChange={onRoleFilterChange}>
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value="STUDENT">Student</MenuItem>
            <MenuItem value="ALUM">Alumni</MenuItem>
            <MenuItem value="ADMIN">Admin</MenuItem>
          </Select>
        </FormControl>
        <Button
          type="submit"
          variant="contained"
          sx={{ minWidth: { xs: '100%', sm: 100 } }}
        >
          Search
        </Button>
      </Stack>
    </Box>
  );
};

export default ConnectionsFilters;
