import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, VoteTargetType } from '@prisma/client';
import { CacheService } from 'src/common/services/cache.service';
import { PrismaService } from 'src/prisma/prisma.service';

type FeedPost = {
  id: string;
  authorId: string;
  subject: string;
  content: string;
  imageUrl: string | null;
  type: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: PostStatus;
  subCommunityId: string | null;
  subCommunity: {
    id: string;
    name: string;
    description: string;
  } | null;
  author: {
    id: string;
    name: string | null;
    role: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
  _count: {
    Vote: number;
    Comment: number;
  };
  hasVoted: boolean;
  score: number;
};

type RankedCandidate = FeedPost & {
  relevanceScore: number;
  freshnessScore: number;
  popularityScore: number;
  diversityBonus: number;
  feedScore: number;
};

type FeedCachePayload = {
  generatedAt: string;
  posts: FeedPost[];
};

@Injectable()
export class DiscoveryService {
  private readonly feedCacheTtlSeconds = 5 * 60;
  private readonly defaultLimit = 20;
  private readonly maxLimit = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getFeed(userId: string, page = 1, limit = this.defaultLimit) {
    this.validatePagination(page, limit);

    const cacheKey = this.getFeedCacheKey(userId);
    const cached = await this.cacheService.get<FeedCachePayload>(cacheKey);
    const rankedPosts = cached?.posts ?? (await this.buildAndCacheFeed(userId, cacheKey));

    return this.paginateFeed(rankedPosts, page, limit);
  }

  async refreshFeed(userId: string) {
    await this.cacheService.del(this.getFeedCacheKey(userId));
  }

  private getFeedCacheKey(userId: string) {
    return `feed:discovery:v1:${userId}`;
  }

  private validatePagination(page: number, limit: number) {
    if (!Number.isFinite(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > this.maxLimit) {
      throw new BadRequestException(`limit must be between 1 and ${this.maxLimit}`);
    }
  }

  private async buildAndCacheFeed(userId: string, cacheKey: string): Promise<FeedPost[]> {
    const rankedPosts = await this.generateRankedFeed(userId);
    const payload: FeedCachePayload = {
      generatedAt: new Date().toISOString(),
      posts: rankedPosts,
    };

    await this.cacheService.set(cacheKey, payload, this.feedCacheTtlSeconds);
    return rankedPosts;
  }

  private async generateRankedFeed(userId: string): Promise<FeedPost[]> {
    const userSignals = await this.getUserSignals(userId);

    const postBatches = await Promise.all([
      this.fetchPostsFromSignals(userId, userSignals.joinedCommunityIds, userSignals.followedUserIds),
      this.fetchPostsByEngagement(userId, userSignals.engagedPostIds, userSignals.engagedAuthorIds),
      this.fetchTrendingPosts(userId, userSignals.trendingPostIds),
      this.fetchExplorationPosts(userId),
    ]);

    const merged = new Map<string, FeedPost>();
    for (const batch of postBatches) {
      for (const post of batch) {
        if (!merged.has(post.id)) {
          merged.set(post.id, post);
        }
      }
    }

    const candidates = Array.from(merged.values());
    if (candidates.length === 0) {
      return [];
    }

    const ranked = this.scoreCandidates(candidates, userSignals);
    return this.rerankForDiversity(ranked);
  }

  private async getUserSignals(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subCommunityMemberships: {
          select: { subCommunityId: true },
        },
        communityFollowing: {
          select: { followedId: true },
        },
        requestedConnections: {
          where: { status: 'ACCEPTED' },
          select: { recipientId: true },
        },
        receivedConnections: {
          where: { status: 'ACCEPTED' },
          select: { requesterId: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const engagementWindowStart = new Date();
    engagementWindowStart.setDate(engagementWindowStart.getDate() - 90);

    const [votes, comments, trendingEntries] = await Promise.all([
      this.prisma.vote.findMany({
        where: {
          userId,
          targetType: VoteTargetType.POST,
          postId: { not: null },
        },
        select: { postId: true },
        take: 200,
      }),
      this.prisma.comment.findMany({
        where: {
          userId,
          createdAt: { gte: engagementWindowStart },
        },
        select: { postId: true },
        take: 200,
      }),
      this.prisma.trendingCache.findMany({
        where: {
          contentType: 'POST',
          period: 'DAY',
        },
        orderBy: { score: 'desc' },
        select: { contentId: true },
        take: 120,
      }),
    ]);

    const engagedPostIds = new Set<string>();
    for (const vote of votes) {
      if (vote.postId) {
        engagedPostIds.add(vote.postId);
      }
    }
    for (const comment of comments) {
      if (comment.postId) {
        engagedPostIds.add(comment.postId);
      }
    }

    const engagedPosts = engagedPostIds.size
      ? await this.prisma.post.findMany({
          where: { id: { in: Array.from(engagedPostIds) } },
          select: {
            id: true,
            authorId: true,
          },
          take: 200,
        })
      : [];

    const followedUserIds = new Set<string>();
    for (const follow of user.communityFollowing) {
      followedUserIds.add(follow.followedId);
    }
    for (const connection of user.requestedConnections) {
      followedUserIds.add(connection.recipientId);
    }
    for (const connection of user.receivedConnections) {
      followedUserIds.add(connection.requesterId);
    }

    const engagedAuthorIds = new Set<string>();
    for (const post of engagedPosts) {
      engagedAuthorIds.add(post.authorId);
    }

    return {
      joinedCommunityIds: Array.from(
        new Set(user.subCommunityMemberships.map((membership) => membership.subCommunityId)),
      ),
      followedUserIds: Array.from(followedUserIds),
      engagedPostIds: Array.from(engagedPostIds),
      engagedAuthorIds: Array.from(engagedAuthorIds),
      trendingPostIds: Array.from(
        new Set(trendingEntries.map((entry) => entry.contentId)),
      ),
    };
  }

  private async fetchPostsFromSignals(
    userId: string,
    joinedCommunityIds: string[],
    followedUserIds: string[],
  ): Promise<FeedPost[]> {
    const tasks: Array<Promise<FeedPost[]>> = [];

    if (joinedCommunityIds.length > 0) {
      tasks.push(
        this.fetchPosts(userId, {
          subCommunityId: { in: joinedCommunityIds },
        }, 140),
      );
    }

    if (followedUserIds.length > 0) {
      tasks.push(
        this.fetchPosts(userId, {
          authorId: { in: followedUserIds },
        }, 140),
      );
    }

    if (tasks.length === 0) {
      return [];
    }

    const batches = await Promise.all(tasks);
    return batches.flat();
  }

  private async fetchPostsByEngagement(
    userId: string,
    engagedPostIds: string[],
    engagedAuthorIds: string[],
  ): Promise<FeedPost[]> {
    if (engagedPostIds.length === 0 && engagedAuthorIds.length === 0) {
      return [];
    }

    const filters: Array<Record<string, unknown>> = [];
    if (engagedPostIds.length > 0) {
      filters.push({ id: { in: engagedPostIds } });
    }
    if (engagedAuthorIds.length > 0) {
      filters.push({ authorId: { in: engagedAuthorIds } });
    }

    return this.fetchPosts(
      userId,
      {
        OR: filters,
      },
      120,
    );
  }

  private async fetchTrendingPosts(
    userId: string,
    trendingPostIds: string[],
  ): Promise<FeedPost[]> {
    if (trendingPostIds.length === 0) {
      return [];
    }

    return this.fetchPosts(
      userId,
      {
        id: { in: trendingPostIds },
      },
      120,
    );
  }

  private async fetchExplorationPosts(userId: string): Promise<FeedPost[]> {
    return this.fetchPosts(userId, {}, 120);
  }

  private async fetchPosts(userId: string, where: Record<string, unknown>, take: number): Promise<FeedPost[]> {
    const rows = await this.prisma.post.findMany({
      where: {
        status: PostStatus.APPROVED,
        isDeleted: false,
        authorId: { not: userId },
        ...where,
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        authorId: true,
        subject: true,
        content: true,
        imageUrl: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        subCommunityId: true,
        subCommunity: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            profile: {
              select: {
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            Vote: true,
            Comment: true,
          },
        },
        Vote: {
          where: {
            userId,
            targetType: VoteTargetType.POST,
          },
          select: {
            type: true,
          },
          take: 1,
        },
      },
    });

    return rows.map((row) => {
      const hasVoted = row.Vote.length > 0;
      return {
        id: row.id,
        authorId: row.authorId,
        subject: row.subject,
        content: row.content,
        imageUrl: row.imageUrl,
        type: row.type,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status,
        subCommunityId: row.subCommunityId,
        subCommunity: row.subCommunity,
        author: row.author,
        _count: row._count,
        hasVoted,
        score: 0,
      };
    });
  }

  private scoreCandidates(
    candidates: FeedPost[],
    signals: {
      joinedCommunityIds: string[];
      followedUserIds: string[];
      engagedPostIds: string[];
      engagedAuthorIds: string[];
      trendingPostIds: string[];
    },
  ): RankedCandidate[] {
    const authorFrequency = new Map<string, number>();
    const communityFrequency = new Map<string, number>();
    const typeFrequency = new Map<string, number>();

    for (const post of candidates) {
      authorFrequency.set(post.authorId, (authorFrequency.get(post.authorId) ?? 0) + 1);
      if (post.subCommunityId) {
        communityFrequency.set(
          post.subCommunityId,
          (communityFrequency.get(post.subCommunityId) ?? 0) + 1,
        );
      }
      if (post.type) {
        typeFrequency.set(post.type, (typeFrequency.get(post.type) ?? 0) + 1);
      }
    }

    const maxPopularityRaw = Math.max(
      ...candidates.map((post) => this.getPopularityRaw(post._count.Vote, post._count.Comment)),
      1,
    );

    const joinedSet = new Set(signals.joinedCommunityIds);
    const followedSet = new Set(signals.followedUserIds);
    const engagedPostsSet = new Set(signals.engagedPostIds);
    const engagedAuthorsSet = new Set(signals.engagedAuthorIds);
    const trendingSet = new Set(signals.trendingPostIds);

    return candidates.map((post) => {
      const relevanceScore = this.getRelevanceScore(post, {
        joinedSet,
        followedSet,
        engagedPostsSet,
        engagedAuthorsSet,
        trendingSet,
      });

      const freshnessScore = this.getFreshnessScore(post.createdAt);
      const popularityScore = Math.min(
        1,
        this.getPopularityRaw(post._count.Vote, post._count.Comment) / maxPopularityRaw,
      );
      const diversityBonus = this.getStaticDiversityBonus(
        post,
        authorFrequency,
        communityFrequency,
        typeFrequency,
      );

      const feedScore =
        relevanceScore * 0.4 +
        freshnessScore * 0.3 +
        popularityScore * 0.2 +
        diversityBonus * 0.1;

      return {
        ...post,
        relevanceScore,
        freshnessScore,
        popularityScore,
        diversityBonus,
        feedScore,
      };
    });
  }

  private getRelevanceScore(
    post: FeedPost,
    sets: {
      joinedSet: Set<string>;
      followedSet: Set<string>;
      engagedPostsSet: Set<string>;
      engagedAuthorsSet: Set<string>;
      trendingSet: Set<string>;
    },
  ) {
    let relevance = 0;

    if (post.subCommunityId && sets.joinedSet.has(post.subCommunityId)) {
      relevance += 0.35;
    }

    if (sets.followedSet.has(post.authorId)) {
      relevance += 0.35;
    }

    if (sets.engagedPostsSet.has(post.id) || sets.engagedAuthorsSet.has(post.authorId)) {
      relevance += 0.2;
    }

    if (sets.trendingSet.has(post.id)) {
      relevance += 0.1;
    }

    return Math.min(1, relevance);
  }

  private getFreshnessScore(createdAt: Date) {
    const nowMs = Date.now();
    const ageHours = Math.max(0, (nowMs - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    const windowHours = 24 * 7;
    return Math.max(0, 1 - ageHours / windowHours);
  }

  private getPopularityRaw(votes: number, comments: number) {
    return Math.log1p(votes * 2 + comments * 3);
  }

  private getStaticDiversityBonus(
    post: FeedPost,
    authorFrequency: Map<string, number>,
    communityFrequency: Map<string, number>,
    typeFrequency: Map<string, number>,
  ) {
    const authorBonus = 1 / Math.max(authorFrequency.get(post.authorId) ?? 1, 1);
    const communityBonus = post.subCommunityId
      ? 1 / Math.max(communityFrequency.get(post.subCommunityId) ?? 1, 1)
      : 1;
    const typeKey = post.type ?? 'UNKNOWN';
    const typeBonus = 1 / Math.max(typeFrequency.get(typeKey) ?? 1, 1);

    return Math.min(1, (authorBonus + communityBonus + typeBonus) / 3);
  }

  private rerankForDiversity(ranked: RankedCandidate[]): FeedPost[] {
    const remaining = [...ranked].sort((a, b) => b.feedScore - a.feedScore);
    const selected: RankedCandidate[] = [];

    const authorSeen = new Map<string, number>();
    const communitySeen = new Map<string, number>();
    const typeSeen = new Map<string, number>();

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i];
        const dynamicBonus = this.getDynamicDiversityAdjustment(
          candidate,
          authorSeen,
          communitySeen,
          typeSeen,
        );
        const adjusted = candidate.feedScore + dynamicBonus;
        if (adjusted > bestScore) {
          bestScore = adjusted;
          bestIndex = i;
        }
      }

      const next = remaining.splice(bestIndex, 1)[0];
      selected.push({
        ...next,
        score: Number(next.feedScore.toFixed(4)),
      });

      authorSeen.set(next.authorId, (authorSeen.get(next.authorId) ?? 0) + 1);

      const communityKey = next.subCommunityId ?? 'GLOBAL';
      communitySeen.set(communityKey, (communitySeen.get(communityKey) ?? 0) + 1);

      const typeKey = next.type ?? 'UNKNOWN';
      typeSeen.set(typeKey, (typeSeen.get(typeKey) ?? 0) + 1);
    }

    return selected.map((post) => ({
      id: post.id,
      authorId: post.authorId,
      subject: post.subject,
      content: post.content,
      imageUrl: post.imageUrl,
      type: post.type,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      status: post.status,
      subCommunityId: post.subCommunityId,
      subCommunity: post.subCommunity,
      author: post.author,
      _count: post._count,
      hasVoted: post.hasVoted,
      score: post.score,
    }));
  }

  private getDynamicDiversityAdjustment(
    candidate: RankedCandidate,
    authorSeen: Map<string, number>,
    communitySeen: Map<string, number>,
    typeSeen: Map<string, number>,
  ) {
    const authorCount = authorSeen.get(candidate.authorId) ?? 0;
    const communityKey = candidate.subCommunityId ?? 'GLOBAL';
    const communityCount = communitySeen.get(communityKey) ?? 0;
    const typeKey = candidate.type ?? 'UNKNOWN';
    const typeCount = typeSeen.get(typeKey) ?? 0;

    const authorBoost = authorCount === 0 ? 0.05 : -0.015 * authorCount;
    const communityBoost = communityCount === 0 ? 0.03 : -0.01 * communityCount;
    const typeBoost = typeCount === 0 ? 0.02 : -0.01 * typeCount;

    return authorBoost + communityBoost + typeBoost;
  }

  private paginateFeed(posts: FeedPost[], page: number, limit: number) {
    const total = posts.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      posts: posts.slice(start, end),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: end < total,
        hasPrev: page > 1,
      },
    };
  }
}
