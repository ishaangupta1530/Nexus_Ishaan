import { FC, useEffect, useState } from 'react';
import {
  FilterProjectInterface,
  status,
  sortBy,
  TrendingTopicSuggestion,
} from '@/types/ShowcaseType';
import { ShowcaseService } from '@/services/ShowcaseService';
import {
  Box,
  TextField,
  MenuItem,
  Chip,
  Typography,
  Button,
  Stack,
  Paper,
  Grid,
  Badge,
  List,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import { Close, FilterList } from '@mui/icons-material';
import { AnimatePresence, motion } from 'framer-motion';
import GlobalSearchBar from '../Search/GlobalSearchBar';

interface ProjectFilterProps {
  filters: FilterProjectInterface;
  onFilterChange: (filters: FilterProjectInterface) => void;
  showTopicSuggestions?: boolean;
}

const ProjectFilter: FC<ProjectFilterProps> = ({
  filters,
  onFilterChange,
  showTopicSuggestions = false,
}) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [expanded, setExpanded] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<
    TrendingTopicSuggestion[]
  >([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Keep localFilters in sync when parent `filters` prop changes
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Centralized apply handler: use current localFilters (including search)
  const handleApplyFilters = () => {
    onFilterChange({ ...localFilters, cursor: undefined });
    setExpanded(false);
  };

  const handleGlobalSearch = (value: string) => {
    const nextFilters = { ...localFilters, search: value, cursor: undefined };
    setLocalFilters(nextFilters);
    onFilterChange(nextFilters);
  };

  const handleClearSearch = () => {
    setLocalFilters((prev) => ({ ...prev, search: '', cursor: undefined }));
    setTopicSuggestions([]);
  };

  useEffect(() => {
    if (!showTopicSuggestions) {
      setTopicSuggestions([]);
      return;
    }

    const searchValue = localFilters.search?.trim() || '';
    if (searchValue.length < 2) {
      setTopicSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await ShowcaseService.getTrendingTopics({
          period: 'week',
          limit: 6,
          q: searchValue,
        });

        if (!cancelled) {
          setTopicSuggestions(response.topics || []);
        }
      } catch (error) {
        console.warn('Failed to load topic suggestions', error);
        if (!cancelled) {
          setTopicSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localFilters.search, showTopicSuggestions]);

  const applyTopicSuggestion = (topic: string) => {
    const nextFilters = {
      ...localFilters,
      search: topic,
      cursor: undefined,
    };
    setLocalFilters(nextFilters);
    onFilterChange(nextFilters);
    setTopicSuggestions([]);
  };

  const updateLocalFilter = (
    key: keyof FilterProjectInterface,
    value: FilterProjectInterface[typeof key]
  ) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value, cursor: undefined }));
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const newTag = e.currentTarget.value.trim();
      updateLocalFilter('tags', [...(localFilters.tags || []), newTag]);
      e.currentTarget.value = '';
      e.preventDefault();
    }
  };

  const removeTag = (tagToRemove: string) => {
    updateLocalFilter(
      'tags',
      localFilters.tags?.filter((tag) => tag !== tagToRemove) || []
    );
  };

  const clearAllFilters = () => {
    setLocalFilters((prev) => {
      const next: FilterProjectInterface = {
        pageSize: 12,
        personalize: prev.personalize,
      };
      onFilterChange(next);
      return next;
    });
  };

  // Removed unused hasActiveFilters

  return (
    <Paper sx={{ mb: 3, p: 2, borderRadius: 3, boxShadow: 2 }} elevation={1}>
      {/* Personalize Toggle + Search + Filters */}
      <Grid container spacing={2} alignItems="center" sx={{ mb: 1 }}>
        <Grid item>
          <Button
            variant={localFilters.personalize ? 'contained' : 'outlined'}
            color={localFilters.personalize ? 'primary' : 'info'}
            onClick={() => {
              setLocalFilters((prev) => ({
                ...prev,
                personalize: !prev.personalize,
              }));
              onFilterChange({
                ...localFilters,
                personalize: !localFilters.personalize,
              });
            }}
            sx={{
              borderRadius: 3,
              fontWeight: 700,
              px: 2,
              py: 1,
              boxShadow: localFilters.personalize ? 2 : 0,
              transition: 'all 0.3s',
            }}
          >
            {localFilters.personalize ? 'Show All' : 'Personalize'}
          </Button>
        </Grid>

        <Grid item xs>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <GlobalSearchBar
              variant="default"
              placeholder="Search projects..."
              onSearch={handleGlobalSearch}
            />
            <Button variant="outlined" onClick={handleClearSearch} sx={{ whiteSpace: 'nowrap' }}>
              Clear
            </Button>
          </Box>

          {showTopicSuggestions &&
            (loadingSuggestions || topicSuggestions.length > 0) && (
              <Paper
                elevation={1}
                sx={{
                  mt: 1,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  overflow: 'hidden',
                }}
              >
                <List dense disablePadding>
                  {loadingSuggestions && (
                    <Box sx={{ px: 2, py: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Loading topic suggestions...
                      </Typography>
                    </Box>
                  )}

                  {!loadingSuggestions &&
                    topicSuggestions.map((item, index) => (
                      <Box key={item.topic}>
                        <ListItemButton
                          onClick={() => applyTopicSuggestion(item.topic)}
                        >
                          <ListItemText
                            primary={item.topic}
                            secondary={`${item.postCount} posts • ${item.trendDirection} trend`}
                          />
                        </ListItemButton>
                        {index < topicSuggestions.length - 1 && <Divider />}
                      </Box>
                    ))}
                </List>
              </Paper>
            )}
        </Grid>

        <Grid item>
          <Badge
            badgeContent={
              Number(!!localFilters.search) +
              Number(!!localFilters.status) +
              Number(!!localFilters.sortBy) +
              (localFilters.tags?.length || 0)
            }
            color="primary"
          >
            <Button
              variant={expanded ? 'contained' : 'outlined'}
              startIcon={<FilterList />}
              onClick={() => setExpanded(!expanded)}
              sx={{ borderRadius: 2 }}
            >
              Filters
            </Button>
          </Badge>
        </Grid>

        {(localFilters.status ||
          localFilters.sortBy ||
          localFilters.tags?.length) && (
          <Grid item>
            <Button
              variant="text"
              onClick={clearAllFilters}
              sx={{ color: 'text.secondary' }}
            >
              Clear All
            </Button>
          </Grid>
        )}
      </Grid>

      {/* Expanded Filters */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Box
              sx={{
                p: 3,
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                bgcolor: 'background.paper',
                mb: 2,
              }}
            >
              <Stack spacing={3}>
                {/* Status and Sort */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    select
                    label="Status"
                    value={localFilters.status || ''}
                    onChange={(e) =>
                      updateLocalFilter('status', e.target.value || undefined)
                    }
                    sx={{ minWidth: 140 }}
                    size="small"
                  >
                    <MenuItem value="">All Status</MenuItem>
                    {Object.values(status).map((s) => (
                      <MenuItem key={s} value={s}>
                        {s.replace('_', ' ')}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Sort By"
                    value={localFilters.sortBy || ''}
                    onChange={(e) =>
                      updateLocalFilter(
                        'sortBy',
                        (e.target.value as sortBy) || undefined
                      )
                    }
                    sx={{ minWidth: 140 }}
                    size="small"
                  >
                    <MenuItem value="">Most Recent</MenuItem>
                    <MenuItem value={sortBy.SUPPORTERS}>
                      Most Supported
                    </MenuItem>
                    <MenuItem value={sortBy.FOLLOWERS}>Most Followed</MenuItem>
                    <MenuItem value={sortBy.CREATED_AT}>Date Created</MenuItem>
                    <MenuItem value={sortBy.UPDATED_AT}>Last Updated</MenuItem>
                  </TextField>
                </Box>

                {/* Tags */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Tags
                  </Typography>
                  <TextField
                    label="Add tags (press Enter)"
                    onKeyDown={handleTagInput}
                    fullWidth
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {localFilters.tags?.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        onDelete={() => removeTag(tag)}
                        deleteIcon={<Close />}
                        variant="outlined"
                        size="small"
                        color="primary"
                      />
                    ))}
                  </Box>
                </Box>

                {/* Apply Filters Button */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleApplyFilters}
                    sx={{ borderRadius: 2, px: 4, py: 1.2, fontWeight: 600 }}
                  >
                    Apply Filters
                  </Button>
                </Box>
              </Stack>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Filters Display */}
      {(localFilters.search ||
        localFilters.status ||
        localFilters.sortBy ||
        localFilters.tags?.length) && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Active filters:
          </Typography>
          {localFilters.search && (
            <Chip
              label={`Search: "${localFilters.search}"`}
              size="small"
              onDelete={handleClearSearch}
            />
          )}
          {localFilters.status && (
            <Chip
              label={`Status: ${localFilters.status.replace('_', ' ')}`}
              size="small"
              onDelete={() => updateLocalFilter('status', undefined)}
            />
          )}
          {localFilters.tags?.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => removeTag(tag)}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default ProjectFilter;
