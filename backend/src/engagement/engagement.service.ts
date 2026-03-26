import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { VoteTargetType, VoteType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { GamificationService } from 'src/gamification/gamification.service';

import { NotificationService } from '../notification/notification.service';

type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

type TimelineBucket = {
  label: string;
  startDate: string;
  posts: number;
  comments: number;
  votes: number;
  total: number;
};

/**
 * Service for managing user engagement with posts, including likes and comments.
 */
@Injectable()
export class EngagementService {
  private static readonly PERIOD_TO_DAYS: Record<AnalyticsPeriod, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private gamificationService: GamificationService,
  ) {}

  async getEngagementSummary(userId: string, period: AnalyticsPeriod = '30d') {
    const normalizedPeriod = this.normalizePeriod(period);
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - (EngagementService.PERIOD_TO_DAYS[normalizedPeriod] - 1));
    periodStart.setHours(0, 0, 0, 0);

    const [
      postsCreated,
      commentsMade,
      votesGiven,
      votesReceived,
      userPosts,
      timeline,
    ] = await Promise.all([
      this.prisma.post.count({
        where: {
          authorId: userId,
          createdAt: { gte: periodStart, lte: now },
          isDeleted: false,
        },
      }),
      this.prisma.comment.count({
        where: {
          userId,
          createdAt: { gte: periodStart, lte: now },
          isDeleted: false,
        },
      }),
      this.prisma.vote.count({
        where: {
          userId,
        },
      }),
      this.prisma.vote.count({
        where: {
          OR: [
            {
              post: {
                authorId: userId,
              },
            },
            {
              comment: {
                userId,
              },
            },
          ],
        },
      }),
      this.prisma.post.findMany({
        where: {
          authorId: userId,
          isDeleted: false,
        },
        select: {
          id: true,
          createdAt: true,
          _count: {
            select: {
              Vote: true,
              Comment: true,
            },
          },
        },
      }),
      this.getEngagementTimeline(userId, normalizedPeriod),
    ]);

    const totalPostEngagement = userPosts.reduce(
      (sum, post) => sum + post._count.Vote + post._count.Comment,
      0,
    );

    const averageEngagementRate =
      userPosts.length > 0
        ? Math.round((totalPostEngagement / userPosts.length) * 100) / 100
        : 0;

    const contentPerformanceScore = Math.round(
      postsCreated * 2 + commentsMade * 1.5 + votesReceived * 1.2 + votesGiven * 0.8,
    );

    return {
      userId,
      period: normalizedPeriod,
      summary: {
        postsCreated,
        commentsMade,
        votesGiven,
        votesReceived,
        averageEngagementRate,
        contentPerformanceScore,
      },
      timeline,
      computedAt: now.toISOString(),
    };
  }

  async getActivityHeatmap(userId: string, year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    const [postsByDay, commentsByDay] = await Promise.all([
      this.prisma.post.groupBy({
        by: ['createdAt'],
        where: {
          authorId: userId,
          createdAt: { gte: start, lte: end },
          isDeleted: false,
        },
        _count: { _all: true },
      }),
      this.prisma.comment.groupBy({
        by: ['createdAt'],
        where: {
          userId,
          createdAt: { gte: start, lte: end },
          isDeleted: false,
        },
        _count: { _all: true },
      }),
    ]);

    const dayMap = new Map<string, number>();

    postsByDay.forEach((entry) => {
      const key = this.toDateKey(entry.createdAt);
      dayMap.set(key, (dayMap.get(key) || 0) + entry._count._all);
    });

    commentsByDay.forEach((entry) => {
      const key = this.toDateKey(entry.createdAt);
      dayMap.set(key, (dayMap.get(key) || 0) + entry._count._all);
    });

    const days: Array<{ date: string; count: number; intensity: number }> = [];
    let maxDailyCount = 0;

    const cursor = new Date(start);
    while (cursor <= end) {
      const key = this.toDateKey(cursor);
      const count = dayMap.get(key) || 0;
      maxDailyCount = Math.max(maxDailyCount, count);

      days.push({
        date: key,
        count,
        intensity: 0,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const denominator = maxDailyCount > 0 ? maxDailyCount : 1;
    const withIntensity = days.map((day) => ({
      ...day,
      intensity: day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / denominator) * 4)),
    }));

    return {
      userId,
      year,
      totalContributions: withIntensity.reduce((sum, day) => sum + day.count, 0),
      totalActiveDays: withIntensity.filter((day) => day.count > 0).length,
      maxDailyCount,
      days: withIntensity,
      note: 'Votes are excluded from daily heatmap because vote timestamps are not currently stored in schema.',
    };
  }

  async getTrendingContent(limit = 10) {
    const cappedLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const posts = await this.prisma.post.findMany({
      where: {
        status: 'APPROVED',
        createdAt: { gte: fourteenDaysAgo },
        isDeleted: false,
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
            email: true,
          },
        },
        _count: {
          select: {
            Vote: true,
            Comment: true,
          },
        },
      },
    });

    const scored = posts.map((post) => {
      const ageHours = Math.max(1, (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60));
      const velocity = (post._count.Vote + post._count.Comment) / ageHours;
      const recencyWeight = Math.exp(-ageHours / 72);
      const score =
        (post._count.Vote * 2 + post._count.Comment * 1.5) *
        (1 + velocity * 0.25) *
        (1 + recencyWeight);

      return {
        id: post.id,
        subject: post.subject,
        excerpt: post.content.slice(0, 160),
        createdAt: post.createdAt,
        author: post.author,
        votes: post._count.Vote,
        comments: post._count.Comment,
        velocity: Math.round(velocity * 100) / 100,
        score: Math.round(score * 100) / 100,
      };
    });

    return {
      limit: cappedLimit,
      generatedAt: new Date().toISOString(),
      items: scored.sort((a, b) => b.score - a.score).slice(0, cappedLimit),
    };
  }

  async getContentPerformance(userId: string, page = 1, limit = 10) {
    const pageNum = Number(page) || 1;
    const limitNum = Math.max(1, Math.min(50, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          authorId: userId,
          isDeleted: false,
        },
        skip,
        take: limitNum,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          subject: true,
          content: true,
          createdAt: true,
          _count: {
            select: {
              Vote: true,
              Comment: true,
            },
          },
        },
      }),
      this.prisma.post.count({
        where: {
          authorId: userId,
          isDeleted: false,
        },
      }),
    ]);

    const items = posts
      .map((post) => {
        const score = post._count.Vote * 2 + post._count.Comment * 1.5;
        const engagementRate = post._count.Comment + post._count.Vote;

        return {
          id: post.id,
          subject: post.subject,
          excerpt: post.content.slice(0, 140),
          createdAt: post.createdAt,
          votes: post._count.Vote,
          comments: post._count.Comment,
          views: 0,
          engagementRate: Math.round(engagementRate * 100) / 100,
          performanceScore: Math.round(score * 100) / 100,
        };
      })
      .sort((a, b) => b.performanceScore - a.performanceScore);

    return {
      userId,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      items,
    };
  }

  private normalizePeriod(period?: string): AnalyticsPeriod {
    if (!period) {
      return '30d';
    }

    return (['7d', '30d', '90d', '1y'] as AnalyticsPeriod[]).includes(
      period as AnalyticsPeriod,
    )
      ? (period as AnalyticsPeriod)
      : '30d';
  }

  private async getEngagementTimeline(
    userId: string,
    period: AnalyticsPeriod,
  ): Promise<TimelineBucket[]> {
    const days = EngagementService.PERIOD_TO_DAYS[period];
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const granularity: 'daily' | 'weekly' | 'monthly' =
      period === '90d' ? 'weekly' : period === '1y' ? 'monthly' : 'daily';

    const [posts, comments] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          authorId: userId,
          createdAt: { gte: startDate, lte: endDate },
          isDeleted: false,
        },
        select: { createdAt: true },
      }),
      this.prisma.comment.findMany({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
          isDeleted: false,
        },
        select: { createdAt: true },
      }),
    ]);

    const starts = this.generateBucketStarts(startDate, period, granularity);
    const bucketMap = new Map<string, TimelineBucket>();

    starts.forEach((start) => {
      const key = this.toBucketKey(start, granularity);
      bucketMap.set(key, {
        label: this.formatBucketLabel(start, granularity),
        startDate: start.toISOString(),
        posts: 0,
        comments: 0,
        votes: 0,
        total: 0,
      });
    });

    posts.forEach((entry) => {
      const key = this.toBucketKey(entry.createdAt, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.posts += 1;
    });

    comments.forEach((entry) => {
      const key = this.toBucketKey(entry.createdAt, granularity);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.comments += 1;
    });

    return Array.from(bucketMap.values()).map((bucket) => ({
      ...bucket,
      total: bucket.posts + bucket.comments + bucket.votes,
    }));
  }

  private generateBucketStarts(
    startDate: Date,
    period: AnalyticsPeriod,
    granularity: 'daily' | 'weekly' | 'monthly',
  ) {
    const starts: Date[] = [];

    if (granularity === 'daily') {
      const totalDays = EngagementService.PERIOD_TO_DAYS[period];
      for (let i = 0; i < totalDays; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        date.setHours(0, 0, 0, 0);
        starts.push(date);
      }
      return starts;
    }

    if (granularity === 'weekly') {
      const weeklyBuckets = Math.ceil(
        EngagementService.PERIOD_TO_DAYS[period] / 7,
      );
      for (let i = 0; i < weeklyBuckets; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i * 7);
        date.setHours(0, 0, 0, 0);
        starts.push(date);
      }
      return starts;
    }

    const currentMonthStart = new Date(startDate);
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < 12; i++) {
      const month = new Date(currentMonthStart);
      month.setMonth(currentMonthStart.getMonth() + i);
      starts.push(month);
    }

    return starts;
  }

  private toDateKey(date: Date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.toISOString().split('T')[0];
  }

  private toBucketKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly') {
    const normalized = new Date(date);

    if (granularity === 'daily') {
      return this.toDateKey(normalized);
    }

    if (granularity === 'weekly') {
      normalized.setHours(0, 0, 0, 0);
      const day = normalized.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      normalized.setDate(normalized.getDate() + diff);
      return this.toDateKey(normalized);
    }

    normalized.setDate(1);
    normalized.setHours(0, 0, 0, 0);
    return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
  }

  private formatBucketLabel(
    date: Date,
    granularity: 'daily' | 'weekly' | 'monthly',
  ) {
    if (granularity === 'daily') {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    if (granularity === 'weekly') {
      return `Wk ${Math.ceil(date.getDate() / 7)} ${date.toLocaleString('en-US', {
        month: 'short',
      })}`;
    }

    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }

  /**
   * Allows a user to vote on a specific post.
   * If a vote already exists, it updates the vote or removes it if the same vote type is provided.
   * @param userId - The ID of the user voting.
   * @param postId - The ID of the post to vote on.
   * @param voteType - The type of vote (UPVOTE or DOWNVOTE).
   * @returns A promise that resolves to the created or updated vote record.
   * @throws {NotFoundException} If the post is not found.
   */
  async voteOnPost(userId: string, postId: string, voteType: VoteType) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, subject: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Use findFirst to find existing vote for this post
    const existingVote = await this.prisma.vote.findFirst({
      where: {
        userId,
        postId,
        commentId: null,
      },
    });

    if (existingVote) {
      if (existingVote.type === voteType) {
        // If the existing vote is being toggled off and it was an upvote,
        // revoke the previously awarded points for that vote.
        try {
          if (existingVote.type === VoteType.UPVOTE) {
            const postAuthor = post.authorId;
            if (postAuthor && postAuthor !== userId) {
              this.gamificationService
                .revokeForEvent('LIKE_RECEIVED', postAuthor, existingVote.id)
                .catch(() => undefined);
            }
          }
        } catch {}

        return this.prisma.vote.delete({ where: { id: existingVote.id } });
      } else {
        const updated = await this.prisma.vote.update({
          where: { id: existingVote.id },
          data: { type: voteType },
        });

        // If the vote was changed to an upvote, award points to the post author
        try {
          if (voteType === VoteType.UPVOTE && post.authorId !== userId) {
            const message = `Upvoted on post: ${post.subject}`;
            this.gamificationService
              .awardForEvent(
                'LIKE_RECEIVED',
                post.authorId,
                updated.id,
                message,
              )
              .catch(() => undefined);
          }

          // If the vote was changed from upvote -> downvote, revoke previous award
          if (
            voteType !== VoteType.UPVOTE &&
            existingVote.type === VoteType.UPVOTE &&
            post.authorId !== userId
          ) {
            this.gamificationService
              .revokeForEvent('LIKE_RECEIVED', post.authorId, existingVote.id)
              .catch(() => undefined);
          }
        } catch {}

        return updated;
      }
    } else {
      const created = await this.prisma.vote.create({
        data: {
          userId,
          postId,
          type: voteType,
          targetType: VoteTargetType.POST,
          commentId: null,
        },
      });

      // Award points when someone upvotes another user's post
      try {
        const message = `Upvoted on post: ${post.subject}`;
        if (voteType === VoteType.UPVOTE && post.authorId !== userId) {
          // Use the vote id as the entityId so revokes can target the exact award
          this.gamificationService
            .awardForEvent('LIKE_RECEIVED', post.authorId, created.id, message)
            .catch(() => undefined);
        }
      } catch {}

      return created;
    }
  }

  /**
   * Allows a user to vote on a specific comment.
   * If a vote already exists, it updates the vote or removes it if the same vote type is provided.
   * @param userId - The ID of the user voting.
   * @param commentId - The ID of the comment to vote on.
   * @param voteType - The type of vote (UPVOTE or DOWNVOTE).
   * @returns A promise that resolves to the created or updated vote record.
   * @throws {NotFoundException} If the comment is not found.
   */
  async voteOnComment(userId: string, commentId: string, voteType: VoteType) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, content: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Use findFirst to find existing vote for this comment
    const existingVote = await this.prisma.vote.findFirst({
      where: {
        userId,
        commentId,
        postId: null,
      },
    });

    if (existingVote) {
      if (existingVote.type === voteType) {
        return this.prisma.vote.delete({
          where: { id: existingVote.id },
        });
      } else {
        const updated = await this.prisma.vote.update({
          where: { id: existingVote.id },
          data: { type: voteType },
        });

        // If changed to upvote, award the comment owner
        try {
          const message = `Upvoted on comment: ${comment.content.substring(0, 30)}`;
          if (voteType === VoteType.UPVOTE && comment.userId !== userId) {
            this.gamificationService
              .awardForEvent(
                'LIKE_RECEIVED',
                comment.userId,
                updated.id,
                message,
              )
              .catch(() => undefined);
          }

          // If changing from upvote -> downvote, revoke previous award
          if (
            voteType !== VoteType.UPVOTE &&
            existingVote.type === VoteType.UPVOTE &&
            comment.userId !== userId
          ) {
            this.gamificationService
              .revokeForEvent('LIKE_RECEIVED', comment.userId, existingVote.id)
              .catch(() => undefined);
          }
        } catch {}

        return updated;
      }
    } else {
      const created = await this.prisma.vote.create({
        data: {
          userId,
          commentId,
          type: voteType,
          targetType: VoteTargetType.COMMENT,
          postId: null,
        },
      });

      // Award points when someone upvotes another user's comment
      try {
        const message = `Upvoted on comment: ${comment.content.substring(0, 30)}`;
        if (voteType === VoteType.UPVOTE && comment.userId !== userId) {
          this.gamificationService
            .awardForEvent('LIKE_RECEIVED', comment.userId, created.id, message)
            .catch(() => undefined);
        }
      } catch {}

      return created;
    }
  }

  /**
   * Allows a user to remove their vote from a specific post or comment.
   * @param userId - The ID of the user removing the vote.
   * @param voteId - The ID of the vote to remove.
   * @returns A promise that resolves to the deleted vote record.
   * @throws {NotFoundException} If the vote is not found.
   * @throws {ForbiddenException} If the user is not the author of the vote.
   */
  async removeVote(userId: string, voteId: string) {
    const existingVote = await this.prisma.vote.findUnique({
      where: { id: voteId },
    });

    if (!existingVote) {
      throw new NotFoundException('Vote not found');
    }

    if (existingVote.userId !== userId) {
      throw new ForbiddenException('You can only remove your own votes');
    }

    // If this vote was an upvote, revoke the awarded points first
    try {
      if (existingVote.type === VoteType.UPVOTE) {
        if (existingVote.postId) {
          const post = await this.prisma.post.findUnique({
            where: { id: existingVote.postId },
          });
          if (post && post.authorId !== existingVote.userId) {
            this.gamificationService
              .revokeForEvent('LIKE_RECEIVED', post.authorId, existingVote.id)
              .catch(() => undefined);
          }
        }

        if (existingVote.commentId) {
          const comment = await this.prisma.comment.findUnique({
            where: { id: existingVote.commentId },
          });
          if (comment && comment.userId !== existingVote.userId) {
            this.gamificationService
              .revokeForEvent('LIKE_RECEIVED', comment.userId, existingVote.id)
              .catch(() => undefined);
          }
        }
      }
    } catch {}

    return this.prisma.vote.delete({ where: { id: voteId } });
  }

  /**
   * Allows a user to add a comment to a specific post, optionally as a reply to another comment.
   * @param userId - The ID of the user making the comment.
   * @param postId - The ID of the post to comment on.
   * @param content - The content of the comment.
   * @param parentId - Optional. The ID of the parent comment if this is a reply.
   * @returns A promise that resolves to the created comment record.
   * @throws {NotFoundException} If the post or parent comment is not found.
   * @throws {BadRequestException} If the comment content is empty or too long, or if parentId is invalid.
   */
  async commentOnPost(
    userId: string,
    postId: string,
    content: string,
    parentId?: string,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, subject: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    if (content.length > 500) {
      throw new BadRequestException(
        'Comment content too long (max 500 characters)',
      );
    }

    if (parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parentComment.postId !== postId) {
        throw new BadRequestException(
          'Parent comment does not belong to the same post',
        );
      }
    }

    const mentionedUsernames =
      content.match(/@(\w+)/g)?.map((mention) => mention.substring(1)) || [];
    const mentionedUsers = await this.prisma.user.findMany({
      where: { name: { in: mentionedUsernames } },
    });

    const newComment = await this.prisma.comment.create({
      data: {
        userId,
        postId,
        content: content.trim(),
        parentId,
        mentionedUsers: {
          connect: mentionedUsers.map((user) => ({ id: user.id })),
        },
      },
    });

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    for (const user of mentionedUsers) {
      await this.notificationService.createMentionNotification(
        user.id,
        currentUser.name,
        post.id,
      );
    }

    // award points: if this was a reply (parentId) give reply points, else comment points
    try {
      const message = parentId
        ? `Replied to comment: ${newComment.content.substring(0, 30)}`
        : `Commented on post: ${post.subject}`;
      const eventKey = parentId ? 'COMMENT_REPLY' : 'COMMENT_CREATED';
      this.gamificationService
        .awardForEvent(eventKey, userId, newComment.id, message)
        .catch(() => undefined);
    } catch {
      // ignore gamification errors
    }

    return newComment;
  }

  /**
   * Retrieves all top-level comments for a specific post with pagination, and their nested replies.
   * @param postId - The ID of the post to retrieve comments for.
   * @param page - The page number for pagination.
   * @param limit - The number of comments per page.
   * @returns A promise that resolves to an object containing paginated comments and pagination details.
   * @throws {NotFoundException} If the post is not found.
   * @throws {BadRequestException} If pagination parameters are invalid.
   */
  async getCommentsForPost(postId: string, page = 1, limit = 10) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (page < 1 || limit < 1 || limit > 50) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId, parentId: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true, // Make sure to include name
              role: true, // Include role to show role badge
              profile: {
                select: { avatarUrl: true },
              },
            },
          },
          votes: true, // Add this line to include votes
          replies: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true, // Make sure to include name
                  role: true,
                  profile: {
                    select: { avatarUrl: true },
                  },
                },
              },
              votes: true, // Add this for replies too
              // Include nested replies up to a certain depth (e.g., 3 levels)
              replies: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      name: true, // Make sure to include name
                      role: true,
                      profile: {
                        select: { avatarUrl: true },
                      },
                    },
                  },
                  votes: true, // Add this for nested replies
                  replies: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          email: true,
                          name: true, // Make sure to include name
                          role: true,
                          profile: {
                            select: { avatarUrl: true },
                          },
                        },
                      },
                      votes: true, // Add this for deeply nested replies
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.comment.count({ where: { postId, parentId: null } }),
    ]);

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Updates an existing comment.
   * Only the author of the comment can update it.
   * @param commentId - The ID of the comment to update.
   * @param userId - The ID of the user attempting to update the comment.
   * @param content - The new content for the comment.
   * @returns A promise that resolves to the updated comment record.
   * @throws {NotFoundException} If the comment is not found.
   * @throws {ForbiddenException} If the user is not the author of the comment.
   * @throws {BadRequestException} If the comment content is empty or too long.
   */
  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only update your own comments');
    }

    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    if (content.length > 500) {
      throw new BadRequestException(
        'Comment content too long (max 500 characters)',
      );
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
    });
  }

  /**
   * Deletes an existing comment.
   * Only the author of the comment can delete it.
   * @param commentId - The ID of the comment to delete.
   * @param userId - The ID of the user attempting to delete the comment.
   * @returns A promise that resolves to a success message.
   * @throws {NotFoundException} If the comment is not found.
   * @throws {ForbiddenException} If the user is not the author of the comment.
   */
  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
    return { message: 'Comment deleted successfully' };
  }

  /**
   * Retrieves a recommended feed of posts, ordered by creation date and then by like count.
   * This is a basic recommendation logic and can be expanded.
   * @returns A promise that resolves to an array of recommended posts.
   */
  async getRecommendedFeed() {
    return this.prisma.post.findMany({
      orderBy: [{ createdAt: 'desc' }, { Vote: { _count: 'desc' } }],
      include: {
        author: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { bio: true, avatarUrl: true },
            },
          },
        },
        _count: {
          select: { Vote: true, Comment: true },
        },
      },
    });
  }
}
