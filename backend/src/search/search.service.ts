import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { CacheService } from '../common/services/cache.service';
import { PrismaService } from '../prisma/prisma.service';

const SUGGEST_CACHE_TTL = 5 * 60;
const TRENDING_CACHE_TTL = 10 * 60;

const suggestCacheKey = (q: string) => `search:suggest:${q.toLowerCase().trim()}`;
const TRENDING_CACHE_KEY = 'search:trending-queries';

export type SearchType = 'posts' | 'users' | 'communities' | 'all';

interface SearchOptions {
  dateFrom?: string;
  dateTo?: string;
  communityId?: string;
}

interface SearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PostResult {
  id: string;
  subject: string;
  content: string;
  createdAt: Date;
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

export interface SearchResult {
  posts: PostResult[];
  users: UserResult[];
  communities: CommunityResult[];
  pagination: SearchPagination;
  query: string;
  type: SearchType;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async search(
    query: string,
    type: SearchType = 'all',
    page = 1,
    limit = 10,
    options: SearchOptions = {},
    userId?: string,
  ): Promise<SearchResult> {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }
    if (page < 1 || limit < 1 || limit > 50) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    const startedAt = Date.now();

    const [posts, users, communities] = await Promise.all([
      type === 'users' || type === 'communities'
        ? { items: [] as PostResult[], total: 0 }
        : this.searchPosts(trimmed, page, limit, options),
      type === 'posts' || type === 'communities'
        ? { items: [] as UserResult[], total: 0 }
        : this.searchUsers(trimmed, page, limit),
      type === 'posts' || type === 'users'
        ? { items: [] as CommunityResult[], total: 0 }
        : this.searchCommunities(trimmed, page, limit),
    ]);

    let primaryTotal = posts.total;
    if (type === 'users') {
      primaryTotal = users.total;
    } else if (type === 'communities') {
      primaryTotal = communities.total;
    }

    this.logger.debug(
      `Search "${trimmed}" (${type}) in ${Date.now() - startedAt}ms - ${primaryTotal} results`,
    );

    this.trackSearch(trimmed, primaryTotal, userId).catch(() => {
      // ignore analytics tracking failures
    });

    return {
      posts: posts.items,
      users: users.items,
      communities: communities.items,
      pagination: {
        page,
        limit,
        total: primaryTotal,
        totalPages: Math.ceil(primaryTotal / limit),
        hasNext: page < Math.ceil(primaryTotal / limit),
        hasPrev: page > 1,
      },
      query: trimmed,
      type,
    };
  }

  async getSuggestions(query: string, userId?: string) {
    const trimmed = (query || '').trim().toLowerCase();

    if (!trimmed) {
      return {
        suggestions: [] as string[],
        trendingTopics: await this.getTrendingTopics(),
        recentQueries: userId ? await this.getRecentQueries(userId) : [],
      };
    }

    const key = suggestCacheKey(trimmed);
    const cached = await this.cacheService.get<string[]>(key);

    let suggestions = cached;
    if (!suggestions) {
      suggestions = await this.buildSuggestions(trimmed);
      await this.cacheService.set(key, suggestions, SUGGEST_CACHE_TTL);
    }

    return {
      suggestions: suggestions.slice(0, 8),
      trendingTopics: await this.getTrendingTopics(),
      recentQueries: userId ? await this.getRecentQueries(userId) : [],
    };
  }

  async getTrendingQueries(): Promise<Array<{ query: string; count: number }>> {
    const cached = await this.cacheService.get<Array<{ query: string; count: number }>>(
      TRENDING_CACHE_KEY,
    );
    if (cached) return cached;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.searchQuery.groupBy({
      by: ['query'],
      _count: { query: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { query: 'desc' } },
      take: 10,
    });

    const result = grouped.map((row) => ({
      query: row.query,
      count: row._count.query,
    }));

    await this.cacheService.set(TRENDING_CACHE_KEY, result, TRENDING_CACHE_TTL);
    return result;
  }

  async trackClick(query: string, resultId: string, userId?: string): Promise<void> {
    const trimmed = (query || '').trim();
    if (!trimmed || !resultId) return;

    const record = await this.prisma.searchQuery.findFirst({
      where: {
        query: trimmed,
        ...(userId ? { userId } : { userId: null }),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return;

    await this.prisma.searchQuery.update({
      where: { id: record.id },
      data: { clickedResults: { push: resultId } },
    });
  }

  private async searchPosts(query: string, page: number, limit: number, options: SearchOptions) {
    const where: Record<string, unknown> = {
      status: PostStatus.APPROVED,
      isDeleted: false,
      OR: [
        { subject: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (options.communityId) {
      where.subCommunityId = options.communityId;
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {
        ...(options.dateFrom ? { gte: new Date(options.dateFrom) } : {}),
        ...(options.dateTo ? { lte: new Date(options.dateTo) } : {}),
      };
    }

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
              profile: { select: { avatarUrl: true } },
            },
          },
          _count: { select: { Vote: true, Comment: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    const lowered = query.toLowerCase();

    const items = posts.map((post) => {
      const subjectHit = post.subject.toLowerCase().includes(lowered) ? 1 : 0;
      const contentHit = post.content.toLowerCase().includes(lowered) ? 0.5 : 0;
      const freshness = Math.max(0, 1 - (Date.now() - post.createdAt.getTime()) / (7 * 86400000));
      const popularity = Math.min(1, Math.log1p(post._count.Vote + post._count.Comment) / 10);
      const relevanceScore = subjectHit * 0.5 + contentHit * 0.3 + freshness * 0.1 + popularity * 0.1;

      return {
        id: post.id,
        subject: post.subject,
        content: post.content,
        createdAt: post.createdAt,
        author: {
          id: post.author.id,
          name: post.author.name || 'Unknown',
          role: post.author.role,
          avatarUrl: post.author.profile?.avatarUrl || undefined,
        },
        voteCount: post._count.Vote,
        commentCount: post._count.Comment,
        subCommunityId: post.subCommunityId || undefined,
        type: post.type || undefined,
        relevanceScore: Number(relevanceScore.toFixed(2)),
      };
    });

    items.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { items, total };
  }

  private async searchUsers(query: string, page: number, limit: number) {
    const where = {
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { email: { contains: query, mode: 'insensitive' as const } },
        {
          profile: {
            OR: [
              { bio: { contains: query, mode: 'insensitive' as const } },
              { location: { contains: query, mode: 'insensitive' as const } },
            ],
          },
        },
      ],
    };

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profile: { select: { avatarUrl: true, bio: true, location: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const lowered = query.toLowerCase();

    const items = users.map((user) => {
      const nameHit = (user.name || '').toLowerCase().includes(lowered) ? 1 : 0;
      const emailHit = user.email.toLowerCase().includes(lowered) ? 0.5 : 0;
      const bioHit = (user.profile?.bio || '').toLowerCase().includes(lowered) ? 0.3 : 0;
      const relevanceScore = Math.min(1, nameHit + emailHit + bioHit);

      return {
        id: user.id,
        name: user.name || 'Unknown',
        email: user.email,
        role: user.role,
        avatarUrl: user.profile?.avatarUrl || undefined,
        bio: user.profile?.bio || undefined,
        location: user.profile?.location || undefined,
        relevanceScore: Number(relevanceScore.toFixed(2)),
      };
    });

    items.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { items, total };
  }

  private async searchCommunities(query: string, page: number, limit: number) {
    const where = {
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const skip = (page - 1) * limit;

    const [communities, total] = await Promise.all([
      this.prisma.subCommunity.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.subCommunity.count({ where }),
    ]);

    const lowered = query.toLowerCase();

    const items = communities.map((community) => {
      const nameHit = community.name.toLowerCase().includes(lowered) ? 1 : 0;
      const descHit = (community.description || '').toLowerCase().includes(lowered) ? 0.5 : 0;
      const relevanceScore = Math.min(1, nameHit + descHit);

      return {
        id: community.id,
        name: community.name,
        description: community.description || undefined,
        memberCount: community._count.members,
        isPrivate: community.isPrivate,
        relevanceScore: Number(relevanceScore.toFixed(2)),
      };
    });

    items.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { items, total };
  }

  private async trackSearch(query: string, resultCount: number, userId?: string) {
    await this.prisma.searchQuery.create({
      data: {
        query,
        resultCount,
        clickedResults: [],
        ...(userId ? { userId } : {}),
      },
    });
  }

  private async buildSuggestions(query: string): Promise<string[]> {
    const [queryRows, communities, users] = await Promise.all([
      this.prisma.searchQuery.groupBy({
        by: ['query'],
        _count: { query: true },
        where: { query: { startsWith: query, mode: 'insensitive' } },
        orderBy: { _count: { query: 'desc' } },
        take: 5,
      }),
      this.prisma.subCommunity.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { name: true },
        take: 3,
      }),
      this.prisma.user.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { name: true },
        take: 3,
      }),
    ]);

    const suggestions = [
      ...queryRows.map((r) => r.query),
      ...communities.map((c) => c.name),
      ...users.map((u) => u.name || '').filter(Boolean),
    ];

    const seen = new Set<string>();
    return suggestions.filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async getTrendingTopics(): Promise<string[]> {
    const trending = await this.getTrendingQueries();
    return trending.slice(0, 5).map((t) => t.query);
  }

  private async getRecentQueries(userId: string): Promise<string[]> {
    const rows = await this.prisma.searchQuery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['query'],
      take: 5,
      select: { query: true },
    });

    return rows.map((row) => row.query);
  }
}
