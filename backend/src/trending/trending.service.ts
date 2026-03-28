import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostStatus, VoteTargetType, VoteType } from '@prisma/client';
import { RedisService } from '../common/services/redis.service';
import { PrismaService } from '../prisma/prisma.service';

type TrendingPeriod = 'HOUR' | 'DAY' | 'WEEK';

type TrendingPostResponse = {
  postId: string;
  rank: number;
  score: number;
  subject: string;
  contentPreview: string;
  createdAt: string;
  upvotes: number;
  comments: number;
  creator: {
    id: string;
    name: string;
    role: string;
  };
};

@Injectable()
export class TrendingService implements OnModuleInit {
  private readonly logger = new Logger(TrendingService.name);

  private readonly periodWindowsHours: Record<TrendingPeriod, number> = {
    HOUR: 48,
    DAY: 24 * 7,
    WEEK: 24 * 30,
  };

  private readonly listCacheTtlSeconds = 55 * 60;
  private readonly smoothingWeight = 0.35;
  private readonly recalculationLocks = new Set<TrendingPeriod>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  private get trendingCache() {
    return this.prisma.trendingCache;
  }

  async onModuleInit() {
    try {
      const hasDayCache = await this.trendingCache.count({
        where: {
          contentType: 'POST',
          period: 'DAY',
        },
      });

      if (hasDayCache === 0) {
        this.warmPeriodInBackground('DAY');
      }
    } catch (error) {
      this.logger.warn(
        `Trending warmup skipped: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyRecalculation() {
    await this.recalculateAllPeriods();
  }

  async getTrendingPosts(periodInput = 'day', limit = 20) {
    const period = this.normalizePeriod(periodInput);
    const cacheKey = this.getListCacheKey(period);

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        period: TrendingPeriod;
        calculatedAt: string;
        posts: TrendingPostResponse[];
      };

      return {
        period: parsed.period,
        calculatedAt: parsed.calculatedAt,
        posts: parsed.posts.slice(0, limit),
        source: 'redis',
      };
    }

    const dbRowsRaw = await this.trendingCache.findMany({
      where: {
        contentType: 'POST',
        period,
      },
      orderBy: [{ rank: 'asc' }],
      take: Math.max(limit, 100),
    });
    const dbRows = dbRowsRaw as Array<{
      contentId: string;
      rank: number;
      score: number;
      calculatedAt: Date;
    }>;

    if (dbRows.length === 0) {
      this.warmPeriodInBackground(period);
      return {
        period,
        calculatedAt: new Date().toISOString(),
        posts: [],
        source: 'warming',
      };
    }

    const postIds = dbRows.map((row) => row.contentId);

    const [posts, upvoteCounts, commentCounts] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          id: { in: postIds },
          isDeleted: false,
          status: PostStatus.APPROVED,
        },
        select: {
          id: true,
          subject: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.vote.groupBy({
        by: ['postId'],
        where: {
          postId: { in: postIds },
          targetType: VoteTargetType.POST,
          type: VoteType.UPVOTE,
        },
        _count: { postId: true },
      }),
      this.prisma.comment.groupBy({
        by: ['postId'],
        where: {
          postId: { in: postIds },
          isDeleted: false,
        },
        _count: { postId: true },
      }),
    ]);

    const upvoteMap = new Map(
      upvoteCounts.map((row) => [row.postId || '', row._count.postId]),
    );
    const commentMap = new Map(
      commentCounts.map((row) => [row.postId || '', row._count.postId]),
    );
    const postMap = new Map(posts.map((post) => [post.id, post]));

    const responsePosts = dbRows
      .map((row) => {
        const post = postMap.get(row.contentId);
        if (!post) return null;

        return {
          postId: post.id,
          rank: row.rank,
          score: Number(row.score.toFixed(4)),
          subject: post.subject,
          contentPreview: post.content.slice(0, 180),
          createdAt: post.createdAt.toISOString(),
          upvotes: upvoteMap.get(post.id) || 0,
          comments: commentMap.get(post.id) || 0,
          creator: {
            id: post.author.id,
            name: post.author.name || 'Unknown',
            role: post.author.role,
          },
        } as TrendingPostResponse;
      })
      .filter((post): post is TrendingPostResponse => Boolean(post));

    const calculatedAt = dbRows[0]?.calculatedAt.toISOString() || new Date().toISOString();
    await this.redisService.set(
      cacheKey,
      JSON.stringify({
        period,
        calculatedAt,
        posts: responsePosts,
      }),
      this.listCacheTtlSeconds,
    );

    return {
      period,
      calculatedAt,
      posts: responsePosts.slice(0, limit),
      source: 'database',
    };
  }

  async getPostScore(postId: string, periodInput = 'day') {
    const period = this.normalizePeriod(periodInput);
    const cacheKey = this.getScoreCacheKey(period, postId);

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        postId: string;
        period: TrendingPeriod;
        score: number;
        rank: number | null;
      };
    }

    const rowRaw = await this.trendingCache.findUnique({
      where: {
        contentType_contentId_period: {
          contentType: 'POST',
          contentId: postId,
          period,
        },
      },
    });
    const row = rowRaw as { score: number; rank: number } | null;

    if (!row) {
      this.warmPeriodInBackground(period);
      return {
        postId,
        period,
        score: 0,
        rank: null,
      };
    }

    const payload = {
      postId,
      period,
      score: Number(row.score.toFixed(4)),
      rank: row.rank,
    };

    await this.redisService.set(
      cacheKey,
      JSON.stringify(payload),
      this.listCacheTtlSeconds,
    );

    return payload;
  }

  async recalculateAllPeriods() {
    const startedAt = Date.now();
    const periods: TrendingPeriod[] = ['HOUR', 'DAY', 'WEEK'];

    const results: Array<{ period: TrendingPeriod; updated: number }> = [];
    for (const period of periods) {
      const updated = await this.recalculatePeriod(period);
      results.push({ period, updated });
    }

    return {
      periods: results,
      durationMs: Date.now() - startedAt,
      calculatedAt: new Date().toISOString(),
    };
  }

  private async recalculatePeriod(period: TrendingPeriod): Promise<number> {
    const now = new Date();
    const since = new Date(now.getTime() - this.periodWindowsHours[period] * 3600 * 1000);

    const posts = await this.prisma.post.findMany({
      where: {
        createdAt: { gte: since },
        isDeleted: false,
        status: PostStatus.APPROVED,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 1200,
      select: {
        id: true,
        subject: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            userPoints: {
              select: {
                points: true,
              },
            },
            _count: {
              select: {
                badges: true,
                Post: true,
              },
            },
          },
        },
      },
    });

    if (posts.length === 0) {
      await this.trendingCache.deleteMany({
        where: { contentType: 'POST', period },
      });
      await this.redisService.delByPattern(`trending:posts:${period}:*`);
      await this.redisService.del(this.getListCacheKey(period));
      return 0;
    }

    const postIds = posts.map((post) => post.id);

    const [
      upvotes,
      downvotes,
      totalComments,
      recentComments,
      previousScoresRaw,
    ] =
      await Promise.all([
        this.prisma.vote.groupBy({
          by: ['postId'],
          where: {
            postId: { in: postIds },
            targetType: VoteTargetType.POST,
            type: VoteType.UPVOTE,
          },
          _count: { postId: true },
        }),
        this.prisma.vote.groupBy({
          by: ['postId'],
          where: {
            postId: { in: postIds },
            targetType: VoteTargetType.POST,
            type: VoteType.DOWNVOTE,
          },
          _count: { postId: true },
        }),
        this.prisma.comment.groupBy({
          by: ['postId'],
          where: {
            postId: { in: postIds },
            isDeleted: false,
          },
          _count: { postId: true },
        }),
        this.prisma.comment.findMany({
          where: {
            postId: { in: postIds },
            isDeleted: false,
            createdAt: {
              gte: new Date(now.getTime() - 12 * 3600 * 1000),
            },
          },
          select: {
            postId: true,
            createdAt: true,
          },
        }),
        this.trendingCache.findMany({
          where: {
            contentType: 'POST',
            period,
            contentId: { in: postIds },
          },
          select: {
            contentId: true,
            score: true,
          },
        }),
      ]);
    const previousScores = previousScoresRaw as Array<{
      contentId: string;
      score: number;
    }>;

    const upvoteMap = new Map(
      upvotes.map((row) => [row.postId || '', row._count.postId]),
    );
    const downvoteMap = new Map(
      downvotes.map((row) => [row.postId || '', row._count.postId]),
    );
    const totalCommentMap = new Map(
      totalComments.map((row) => [row.postId || '', row._count.postId]),
    );
    const previousScoreMap = new Map(
      previousScores.map((row) => [row.contentId, row.score]),
    );

    const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);
    const recentCommentMap = new Map<string, number>();
    const previousWindowCommentMap = new Map<string, number>();

    recentComments.forEach((comment) => {
      const key = comment.postId;
      if (comment.createdAt >= sixHoursAgo) {
        recentCommentMap.set(key, (recentCommentMap.get(key) || 0) + 1);
      } else {
        previousWindowCommentMap.set(
          key,
          (previousWindowCommentMap.get(key) || 0) + 1,
        );
      }
    });

    const scored = posts.map((post) => {
      const upvoteCount = Number(upvoteMap.get(post.id) || 0);
      const downvoteCount = Number(downvoteMap.get(post.id) || 0);
      const commentCount = Number(totalCommentMap.get(post.id) || 0);
      const commentsRecent = recentCommentMap.get(post.id) || 0;
      const commentsPreviousWindow = previousWindowCommentMap.get(post.id) || 0;

      const hoursSinceCreated = Math.max(
        0.25,
        (now.getTime() - post.createdAt.getTime()) / 3_600_000,
      );

      const creatorReputationMultiplier = this.getCreatorReputationMultiplier({
        points: post.author.userPoints?.points || 0,
        badges: post.author._count.badges,
        authoredPosts: post.author._count.Post,
      });

      const viewsEstimate = Math.max(
        0,
        upvoteCount * 11 + commentCount * 16 + commentsRecent * 6,
      );
      const engagementVelocity =
        (upvoteCount * 2 + commentsRecent * 3) / Math.max(hoursSinceCreated, 1);
      const accelerationRatio =
        commentsRecent / Math.max(commentsPreviousWindow, 1);
      const viewAccelerationProxy = Math.max(0, accelerationRatio - 1);

      const weightedSignals =
        upvoteCount * 2 +
        commentCount * 3 +
        viewsEstimate * 0.1 +
        engagementVelocity * 4 +
        viewAccelerationProxy * 2 -
        downvoteCount * 1.5;

      const rawScore =
        (Math.max(0.1, weightedSignals) /
          Math.pow(hoursSinceCreated + 2, 1.5)) *
        creatorReputationMultiplier;

      const previous = previousScoreMap.get(post.id);
      const score =
        typeof previous === 'number'
          ? previous * (1 - this.smoothingWeight) + rawScore * this.smoothingWeight
          : rawScore;

      return {
        post,
        score,
        upvoteCount,
        commentCount,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const ranked = scored.slice(0, 500).map((entry, index) => ({
      postId: entry.post.id,
      score: entry.score,
      rank: index + 1,
      upvotes: entry.upvoteCount,
      comments: entry.commentCount,
      subject: entry.post.subject,
      contentPreview: entry.post.content.slice(0, 180),
      createdAt: entry.post.createdAt.toISOString(),
      creator: {
        id: entry.post.author.id,
        name: entry.post.author.name || 'Unknown',
        role: entry.post.author.role,
      },
    }));

    await this.trendingCache.deleteMany({
      where: {
        contentType: 'POST',
        period,
        contentId: {
          notIn: ranked.map((item) => item.postId),
        },
      },
    });

    await Promise.all(
      ranked.map((item) =>
        this.trendingCache.upsert({
          where: {
            contentType_contentId_period: {
              contentType: 'POST',
              contentId: item.postId,
              period,
            },
          },
          create: {
            contentType: 'POST',
            contentId: item.postId,
            period,
            score: item.score,
            rank: item.rank,
            calculatedAt: now,
          },
          update: {
            score: item.score,
            rank: item.rank,
            calculatedAt: now,
          },
        }),
      ),
    );

    await this.redisService.set(
      this.getListCacheKey(period),
      JSON.stringify({
        period,
        calculatedAt: now.toISOString(),
        posts: ranked,
      }),
      this.listCacheTtlSeconds,
    );

    await Promise.all(
      ranked.slice(0, 200).map((item) =>
        this.redisService.set(
          this.getScoreCacheKey(period, item.postId),
          JSON.stringify({
            postId: item.postId,
            period,
            score: Number(item.score.toFixed(4)),
            rank: item.rank,
          }),
          this.listCacheTtlSeconds,
        ),
      ),
    );

    this.logger.log(
      `Recalculated ${period} trending scores for ${ranked.length} posts`,
    );

    return ranked.length;
  }

  private normalizePeriod(periodInput: string): TrendingPeriod {
    const value = periodInput.trim().toUpperCase();

    if (value === 'HOUR' || value === 'DAY' || value === 'WEEK') {
      return value;
    }

    throw new BadRequestException('period must be one of: hour, day, week');
  }

  private getCreatorReputationMultiplier(input: {
    points: number;
    badges: number;
    authoredPosts: number;
  }): number {
    const pointsFactor = Math.min(0.12, Math.max(0, input.points / 20000));
    const badgesFactor = Math.min(0.08, input.badges * 0.01);
    const consistencyFactor = Math.min(0.06, input.authoredPosts * 0.0025);

    const multiplier = 1 + pointsFactor + badgesFactor + consistencyFactor;
    return Math.min(1.26, Math.max(0.9, multiplier));
  }

  private getListCacheKey(period: TrendingPeriod): string {
    return `trending:posts:${period}:v1`;
  }

  private getScoreCacheKey(period: TrendingPeriod, postId: string): string {
    return `trending:score:${period}:${postId}`;
  }

  private warmPeriodInBackground(period: TrendingPeriod): void {
    if (this.recalculationLocks.has(period)) {
      return;
    }

    this.recalculationLocks.add(period);

    setImmediate(async () => {
      try {
        await this.recalculatePeriod(period);
      } catch (error) {
        this.logger.error(
          `Failed background recalculation for ${period}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      } finally {
        this.recalculationLocks.delete(period);
      }
    });
  }
}
