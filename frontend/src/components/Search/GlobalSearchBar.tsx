import {
  FC,
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import {
  Box,
  InputBase,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Typography,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  TrendingUp,
  History,
  Tag,
  Person,
  Group,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchSuggestService } from '../../services/SearchService';
import { useTheme } from '@mui/material/styles';
import { useDebounce } from '../../hooks/useDebounce';

interface GlobalSearchBarProps {
  placeholder?: string;
  /** Color theme for the bar ('light' = white on dark bg, 'default' = theme default) */
  variant?: 'light' | 'default';
  onSearch?: (query: string) => void;
}

const GlobalSearchBar: FC<GlobalSearchBarProps> = ({
  placeholder = 'Search posts, people, communities…',
  variant = 'light',
  onSearch,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    const urlQuery = new URLSearchParams(location.search).get('q') || '';
    setQuery(urlQuery);
  }, [location.search]);

  // Fetch suggestions when query changes (debounced)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    searchSuggestService(debouncedQuery)
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.suggestions);
        setTrending(res.trendingTopics);
        setRecent(res.recentQueries);
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleFocus = () => {
    setOpen(true);
    setHighlighted(-1);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHighlighted(-1);
    if (!open) setOpen(true);
  };

  const navigateToSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setOpen(false);
      setQuery(trimmed);
      if (onSearch) {
        onSearch(trimmed);
      } else {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [navigate, onSearch],
  );

  const allItems = [
    ...suggestions,
    ...(debouncedQuery
      ? []
      : [
          ...recent.map((r) => `__recent__${r}`),
          ...trending.map((t) => `__trending__${t}`),
        ]),
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && allItems[highlighted]) {
        const raw = allItems[highlighted];
        const clean = raw.replace(/^__(recent|trending)__/, '');
        navigateToSearch(clean);
      } else {
        navigateToSearch(query);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const isLight = variant === 'light';

  const inputBg = isLight
    ? 'rgba(255,255,255,0.15)'
    : theme.palette.action.hover;
  const inputColor = isLight ? '#fff' : theme.palette.text.primary;
  const inputPlaceholderColor = isLight
    ? 'rgba(255,255,255,0.6)'
    : theme.palette.text.secondary;

  const hasDropdown =
    open &&
    (loading ||
      suggestions.length > 0 ||
      (debouncedQuery === '' && (recent.length > 0 || trending.length > 0)));

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%' }}>
      {/* Input */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: inputBg,
          borderRadius: 3,
          px: 1.5,
          py: 0.5,
          transition: 'background 0.2s',
          '&:hover': {
            bgcolor: isLight ? 'rgba(255,255,255,0.22)' : theme.palette.action.selected,
          },
          ...(open && {
            bgcolor: isLight ? 'rgba(255,255,255,0.25)' : theme.palette.action.selected,
          }),
        }}
      >
        <SearchIcon sx={{ color: inputPlaceholderColor, mr: 1, fontSize: 20 }} />
        <InputBase
          inputRef={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          inputProps={{ 'aria-label': 'global search', role: 'combobox', 'aria-expanded': open, 'aria-autocomplete': 'list' }}
          sx={{
            color: inputColor,
            flex: 1,
            fontSize: 14,
            '& ::placeholder': { color: inputPlaceholderColor },
            '& input': { p: 0 },
          }}
        />
        {loading && (
          <CircularProgress size={16} sx={{ color: inputPlaceholderColor, ml: 1 }} />
        )}
      </Box>

      {/* Dropdown */}
      {hasDropdown && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 0.5,
            zIndex: 1400,
            maxHeight: 440,
            overflowY: 'auto',
            borderRadius: 2,
          }}
          role="listbox"
        >
          <List disablePadding dense>
            {/* Suggestions from query */}
            {suggestions.length > 0 && (
              <>
                <ListItem sx={{ py: 0.5, px: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    SUGGESTIONS
                  </Typography>
                </ListItem>
                {suggestions.map((s, i) => (
                  <ListItem key={`suggest-${i}`} disablePadding>
                    <ListItemButton
                      selected={highlighted === i}
                      onClick={() => navigateToSearch(s)}
                      sx={{ py: 0.75, px: 2 }}
                      role="option"
                      aria-selected={highlighted === i}
                    >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <SearchIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <HighlightedText text={s} highlight={query} />
                      }
                    />
                    </ListItemButton>
                  </ListItem>
                ))}
              </>
            )}

            {/* When no typed query: show recent + trending */}
            {debouncedQuery === '' && (
              <>
                {recent.length > 0 && (
                  <>
                    <Divider />
                    <ListItem sx={{ py: 0.5, px: 2 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        RECENT
                      </Typography>
                    </ListItem>
                    {recent.map((r, i) => {
                      const idx = suggestions.length + i;
                      return (
                        <ListItem key={`recent-${i}`} disablePadding>
                          <ListItemButton
                            selected={highlighted === idx}
                            onClick={() => navigateToSearch(r)}
                            sx={{ py: 0.75, px: 2 }}
                          >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <History fontSize="small" color="action" />
                          </ListItemIcon>
                          <ListItemText primary={r} />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </>
                )}

                {trending.length > 0 && (
                  <>
                    <Divider />
                    <ListItem sx={{ py: 0.5, px: 2 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <TrendingUp fontSize="small" color="primary" />
                      </ListItemIcon>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        TRENDING
                      </Typography>
                    </ListItem>
                    <Box sx={{ px: 2, pb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {trending.map((t) => (
                        <Chip
                          key={t}
                          label={t}
                          size="small"
                          icon={<Tag sx={{ fontSize: 14 }} />}
                          onClick={() => navigateToSearch(t)}
                          sx={{ cursor: 'pointer' }}
                          variant="outlined"
                          color="primary"
                        />
                      ))}
                    </Box>
                  </>
                )}
              </>
            )}

            {/* Quick type badges when typing */}
            {debouncedQuery.length > 0 && suggestions.length === 0 && !loading && (
              <ListItem sx={{ py: 1, px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Press Enter to search for &ldquo;{query}&rdquo;
                </Typography>
              </ListItem>
            )}

            {/* Type shortcuts */}
            {debouncedQuery.length > 1 && (
              <>
                <Divider />
                <ListItem sx={{ py: 0.5, px: 2, gap: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="caption" color="text.secondary" mr={0.5}>
                    Search in:
                  </Typography>
                  {[
                    { type: 'posts', icon: <Tag sx={{ fontSize: 12 }} />, label: 'Posts' },
                    { type: 'users', icon: <Person sx={{ fontSize: 12 }} />, label: 'People' },
                    { type: 'communities', icon: <Group sx={{ fontSize: 12 }} />, label: 'Communities' },
                  ].map(({ type, icon, label }) => (
                    <Chip
                      key={type}
                      size="small"
                      icon={icon}
                      label={label}
                      variant="outlined"
                      onClick={() =>
                        navigate(
                          `/search?q=${encodeURIComponent(query)}&type=${type}`
                        )
                      }
                      sx={{ cursor: 'pointer', fontSize: 11 }}
                    />
                  ))}
                </ListItem>
              </>
            )}
          </List>
        </Paper>
      )}
    </Box>
  );
};

/** Highlights `highlight` inside `text` */
const HighlightedText: FC<{ text: string; highlight: string }> = ({
  text,
  highlight,
}) => {
  if (!highlight) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <Box component="span" sx={{ fontWeight: 700 }}>
        {text.slice(idx, idx + highlight.length)}
      </Box>
      {text.slice(idx + highlight.length)}
    </>
  );
};

export default GlobalSearchBar;
