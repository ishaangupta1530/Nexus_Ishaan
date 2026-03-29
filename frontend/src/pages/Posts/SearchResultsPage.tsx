import { FC, useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  Avatar,
  Card,
  CardContent,
  Grid,
  Badge,
  Tooltip,
  Collapse,
  Button,
  TextField,
  InputAdornment,
  Divider,
  Stack,
  Paper,
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList,
  TrendingUp,
  Person,
  Group,
  Article,
  Lock,
  LockOpen,
  Close,
  Tag,
  CalendarToday,
} from '@mui/icons-material';
import {
  searchService,
  searchTrendingQueriesService,
  trackSearchClickService,
  PostResult,
  UserResult,
  CommunityResult,
  SearchType,
} from '../../services/SearchService';
import GlobalSearchBar from '../../components/Search/GlobalSearchBar';

// ──────────────────────────────────────────────────────────────
// Highlight helper
// ──────────────────────────────────────────────────────────────
const Highlight: FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query || !text) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <Box
            key={i}
            component="mark"
            sx={{ bgcolor: 'warning.light', color: 'inherit', borderRadius: 0.5, px: 0.25 }}
          >
            {part}
          </Box>
        ) : (
          part
        )
      )}
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// SearchResultsPage
// ──────────────────────────────────────────────────────────────
const SearchResultsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const [query, setQuery] = useState(params.get('q') || '');
  const [activeType, setActiveType] = useState<SearchType>(
    (params.get('type') as SearchType) || 'all'
  );
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(params.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(params.get('dateTo') || '');
  const [communityId] = useState(params.get('communityId') || '');
  const [showFilters, setShowFilters] = useState(false);

  const [posts, setPosts] = useState<PostResult[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [communities, setCommunities] = useState<CommunityResult[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(false);
  const [trendingQueries, setTrendingQueries] = useState<{ query: string; count: number }[]>([]);

  const latestRef = useRef(0);

  const runSearch = useCallback(
    async (q: string, type: SearchType, pg: number, df?: string, dt?: string) => {
      if (!q.trim() || q.trim().length < 2) return;
      setLoading(true);
      const ticket = ++latestRef.current;
      try {
        const res = await searchService(q, type, pg, 10, {
          dateFrom: df || undefined,
          dateTo: dt || undefined,
          communityId: communityId || undefined,
        });
        if (ticket !== latestRef.current) return;
        if (pg === 1) {
          setPosts(res.posts);
          setUsers(res.users);
          setCommunities(res.communities);
        } else {
          setPosts((prev) => [...prev, ...res.posts]);
          setUsers((prev) => [...prev, ...res.users]);
          setCommunities((prev) => [...prev, ...res.communities]);
        }
        setPagination(res.pagination);
      } catch {
        // silently handle search errors
      } finally {
        if (ticket === latestRef.current) setLoading(false);
      }
    },
    [communityId]
  );

  useEffect(() => {
    const urlQ = new URLSearchParams(location.search).get('q') || '';
    const urlType = (new URLSearchParams(location.search).get('type') as SearchType) || 'all';
    const urlDf = new URLSearchParams(location.search).get('dateFrom') || '';
    const urlDt = new URLSearchParams(location.search).get('dateTo') || '';
    setQuery(urlQ);
    setActiveType(urlType);
    setDateFrom(urlDf);
    setDateTo(urlDt);
    setPage(1);
    runSearch(urlQ, urlType, 1, urlDf, urlDt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    searchTrendingQueriesService()
      .then(setTrendingQueries)
      .catch(() => {});
  }, []);

  const pushUrl = (q: string, type: SearchType, df?: string, dt?: string) => {
    const p = new URLSearchParams({ q, type });
    if (df) p.set('dateFrom', df);
    if (dt) p.set('dateTo', dt);
    navigate(`/search?${p.toString()}`);
  };

  const handleSearch = (q: string) => pushUrl(q, activeType, dateFrom, dateTo);

  const handleTypeChange = (_: React.SyntheticEvent, val: SearchType) => {
    setActiveType(val);
    pushUrl(query, val, dateFrom, dateTo);
  };

  const handleApplyFilters = () => {
    pushUrl(query, activeType, dateFrom, dateTo);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    pushUrl(query, activeType, '', '');
    setShowFilters(false);
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    runSearch(query, activeType, next, dateFrom, dateTo);
  };

  const handleResultClick = (id: string) => {
    trackSearchClickService(query, id).catch(() => {});
  };

  const hasFilters = !!(dateFrom || dateTo);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 1, sm: 2, md: 3 } }}>
      {/* Search bar */}
      <Box sx={{ mb: 2 }}>
        <GlobalSearchBar
          placeholder="Search posts, people, communities…"
          variant="default"
          onSearch={handleSearch}
        />
      </Box>

      {query && (
        <Typography variant="body2" color="text.secondary" mb={1}>
          Results for{' '}
          <Box component="span" fontWeight={700} color="text.primary">
            &ldquo;{query}&rdquo;
          </Box>
          {pagination.total > 0 && (
            <Box component="span" ml={1}>
              — {pagination.total.toLocaleString()} result
              {pagination.total !== 1 ? 's' : ''}
            </Box>
          )}
        </Typography>
      )}

      {/* Filters toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Button
          size="small"
          startIcon={<FilterList />}
          variant={hasFilters ? 'contained' : 'outlined'}
          onClick={() => setShowFilters((s) => !s)}
          sx={{ borderRadius: 5, textTransform: 'none' }}
        >
          Filters {hasFilters && `(active)`}
        </Button>
        {hasFilters && (
          <IconButton size="small" onClick={handleClearFilters}>
            <Close fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Filter panel */}
      <Collapse in={showFilters}>
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                type="date"
                label="From"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: <InputAdornment position="start"><CalendarToday fontSize="small" /></InputAdornment> }}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                type="date"
                label="To"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: <InputAdornment position="start"><CalendarToday fontSize="small" /></InputAdornment> }}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button variant="contained" size="small" fullWidth onClick={handleApplyFilters} sx={{ textTransform: 'none' }}>
                Apply
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Collapse>

      {/* Type tabs */}
      <Tabs
        value={activeType}
        onChange={handleTypeChange}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="All" value="all" icon={<SearchIcon fontSize="small" />} iconPosition="start" />
        <Tab
          label={<Badge badgeContent={posts.length || undefined} color="primary" max={99}>Posts</Badge>}
          value="posts"
          icon={<Article fontSize="small" />}
          iconPosition="start"
        />
        <Tab
          label={<Badge badgeContent={users.length || undefined} color="primary" max={99}>People</Badge>}
          value="users"
          icon={<Person fontSize="small" />}
          iconPosition="start"
        />
        <Tab
          label={<Badge badgeContent={communities.length || undefined} color="primary" max={99}>Communities</Badge>}
          value="communities"
          icon={<Group fontSize="small" />}
          iconPosition="start"
        />
      </Tabs>

      {/* Loading */}
      {loading && page === 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Empty */}
      {!loading && query && posts.length === 0 && users.length === 0 && communities.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <SearchIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary" mt={1}>
            No results for &ldquo;{query}&rdquo;
          </Typography>
          <Typography variant="body2" color="text.disabled" mt={0.5}>
            Try different keywords or remove filters
          </Typography>
        </Box>
      )}

      {/* Results */}
      {(!loading || page > 1) && (
        <Stack spacing={2}>
          {(activeType === 'all' || activeType === 'posts') && posts.length > 0 && (
            <Box>
              {activeType === 'all' && (
                <Typography variant="subtitle2" color="text.secondary" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Article fontSize="small" /> Posts
                </Typography>
              )}
              <Stack spacing={1}>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} query={query} onClick={handleResultClick} />
                ))}
              </Stack>
            </Box>
          )}

          {(activeType === 'all' || activeType === 'users') && users.length > 0 && (
            <Box>
              {activeType === 'all' && <Divider sx={{ my: 1 }} />}
              {activeType === 'all' && (
                <Typography variant="subtitle2" color="text.secondary" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Person fontSize="small" /> People
                </Typography>
              )}
              <Grid container spacing={1}>
                {users.map((u) => (
                  <Grid item xs={12} sm={6} key={u.id}>
                    <UserCard user={u} query={query} onClick={handleResultClick} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {(activeType === 'all' || activeType === 'communities') && communities.length > 0 && (
            <Box>
              {activeType === 'all' && <Divider sx={{ my: 1 }} />}
              {activeType === 'all' && (
                <Typography variant="subtitle2" color="text.secondary" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Group fontSize="small" /> Communities
                </Typography>
              )}
              <Grid container spacing={1}>
                {communities.map((c) => (
                  <Grid item xs={12} sm={6} key={c.id}>
                    <CommunityCard community={c} query={query} onClick={handleResultClick} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {pagination.hasNext && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button variant="outlined" onClick={handleLoadMore} disabled={loading} sx={{ textTransform: 'none' }}>
                {loading ? <CircularProgress size={20} /> : 'Load More'}
              </Button>
            </Box>
          )}
        </Stack>
      )}

      {/* People also searched */}
      {trendingQueries.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TrendingUp fontSize="small" color="primary" /> People also searched for
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {trendingQueries.map(({ query: tq }) => (
              <Chip
                key={tq}
                label={tq}
                size="small"
                variant="outlined"
                icon={<Tag sx={{ fontSize: 14 }} />}
                onClick={() => navigate(`/search?q=${encodeURIComponent(tq)}`)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ──────────────────────────────────────────────────────────────
// Post Card
// ──────────────────────────────────────────────────────────────
const PostCard: FC<{ post: PostResult; query: string; onClick: (id: string) => void }> = ({
  post,
  query,
  onClick,
}) => {
  const navigate = useNavigate();
  const handleClick = () => {
    onClick(post.id);
    navigate(`/posts/${post.id}`);
  };
  const snippet = post.content.length > 200 ? post.content.slice(0, 200) + '…' : post.content;

  return (
    <Card
      variant="outlined"
      sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s', borderRadius: 2 }}
      onClick={handleClick}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, mr: 1 }}>
            <Highlight text={post.subject} query={query} />
          </Typography>
          <Tooltip title={`Relevance: ${(post.relevanceScore * 100).toFixed(0)}%`}>
            <Chip label={`${(post.relevanceScore * 100).toFixed(0)}%`} size="small" color="primary" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" mb={0.75}>
          <Highlight text={snippet} query={query} />
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Avatar sx={{ width: 18, height: 18, fontSize: 10 }}>{post.author.name?.charAt(0)}</Avatar>
            <Typography variant="caption" color="text.secondary">{post.author.name}</Typography>
          </Box>
          <Typography variant="caption" color="text.disabled">{new Date(post.createdAt).toLocaleDateString()}</Typography>
          <Typography variant="caption" color="text.disabled">{post.voteCount} votes · {post.commentCount} comments</Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────
// User Card
// ──────────────────────────────────────────────────────────────
const UserCard: FC<{ user: UserResult; query: string; onClick: (id: string) => void }> = ({
  user,
  query,
  onClick,
}) => {
  const navigate = useNavigate();
  const handleClick = () => {
    onClick(user.id);
    navigate(`/profile/${user.id}`);
  };
  return (
    <Card
      variant="outlined"
      sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s', borderRadius: 2 }}
      onClick={handleClick}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Avatar src={user.avatarUrl} sx={{ width: 40, height: 40 }}>{user.name?.charAt(0)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              <Highlight text={user.name} query={query} />
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {user.role}{user.location ? ` · ${user.location}` : ''}
            </Typography>
            {user.bio && (
              <Typography variant="caption" color="text.disabled" display="block" noWrap>
                <Highlight text={user.bio} query={query} />
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ──────────────────────────────────────────────────────────────
// Community Card
// ──────────────────────────────────────────────────────────────
const CommunityCard: FC<{ community: CommunityResult; query: string; onClick: (id: string) => void }> = ({
  community,
  query,
  onClick,
}) => {
  const navigate = useNavigate();
  const handleClick = () => {
    onClick(community.id);
    navigate(`/subcommunities/${community.id}`);
  };
  return (
    <Card
      variant="outlined"
      sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s', borderRadius: 2 }}
      onClick={handleClick}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            <Highlight text={community.name} query={query} />
          </Typography>
          <Tooltip title={community.isPrivate ? 'Private' : 'Public'}>
            {community.isPrivate ? <Lock fontSize="small" color="action" /> : <LockOpen fontSize="small" color="action" />}
          </Tooltip>
        </Box>
        {community.description && (
          <Typography variant="body2" color="text.secondary" mb={0.5} sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            <Highlight text={community.description} query={query} />
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled">
          {community.memberCount.toLocaleString()} member{community.memberCount !== 1 ? 's' : ''}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default SearchResultsPage;
