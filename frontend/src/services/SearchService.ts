import api, { isAxiosError } from './api';

export type SearchType = 'posts' | 'users' | 'communities' | 'all';

export interface PostResult {
  id: string;
  subject: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: string; avatarUrl?: string };
  voteCount: number;
  commentCount: number;
  subCommunityId?: string;
  type?: string;
  relevanceScore: number;
}

export interface UserResult {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  relevanceScore: number;
}

export interface CommunityResult {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  isPrivate: boolean;
  relevanceScore: number;
}

export interface SearchResponse {
  posts: PostResult[];
  users: UserResult[];
  communities: CommunityResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  query: string;
  type: SearchType;
}

export interface SuggestResponse {
  suggestions: string[];
  trendingTopics: string[];
  recentQueries: string[];
}

export interface TrendingQuery {
  query: string;
  count: number;
}

export async function searchService(
  query: string,
  type: SearchType = 'all',
  page = 1,
  limit = 10,
  filters: { dateFrom?: string; dateTo?: string; communityId?: string } = {}
): Promise<SearchResponse> {
  try {
    const { data } = await api.get('/search', {
      params: { q: query, type, page, limit, ...filters },
    });
    return data;
  } catch (err) {
    if (isAxiosError(err)) {
      throw new Error(err.response?.data?.message || 'Search failed');
    }
    throw new Error('Search failed');
  }
}

export async function searchSuggestService(
  query: string
): Promise<SuggestResponse> {
  try {
    const { data } = await api.get('/search/suggest', {
      params: { q: query },
    });
    return data;
  } catch (err) {
    if (isAxiosError(err)) {
      throw new Error(
        err.response?.data?.message || 'Failed to fetch suggestions'
      );
    }
    throw new Error('Failed to fetch suggestions');
  }
}

export async function searchTrendingQueriesService(): Promise<TrendingQuery[]> {
  try {
    const { data } = await api.get('/search/trending-queries');
    return data;
  } catch (err) {
    if (isAxiosError(err)) {
      throw new Error(
        err.response?.data?.message || 'Failed to fetch trending queries'
      );
    }
    throw new Error('Failed to fetch trending queries');
  }
}

export async function trackSearchClickService(
  query: string,
  resultId: string
): Promise<void> {
  try {
    await api.patch('/search/track-click', { query, resultId });
  } catch {
    // Swallow click-tracking errors — they are non-critical
  }
}
