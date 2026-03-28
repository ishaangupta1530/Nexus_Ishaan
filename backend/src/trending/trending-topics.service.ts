import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostStatus, Prisma } from '@prisma/client';
import * as keywordExtractor from 'keyword-extractor';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GetTrendingTopicsDto,
  TrendingPeriod,
} from './dto/get-trending-topics.dto';

type TopicDirection = 'UP' | 'DOWN' | 'STABLE';

interface TopicAccumulator {
  topic: string;
  keywords: Set<string>;
  postIds: Set<string>;
  engagementCount: number;
}

export interface TopicRecord {
  topic: string;
  relatedKeywords: string[];
  postCount: number;
  engagementCount: number;
  velocity: number;
  trendDirection: TopicDirection;
}

@Injectable()
export class TrendingTopicsService {
  private readonly logger = new Logger(TrendingTopicsService.name);

  private readonly stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'your',
    'have',
    'what',
    'will',
    'would',
    'should',
    'could',
    'about',
    'into',
    'when',
    'where',
    'which',
    'while',
    'been',
    'being',
    'post',
    'posts',
    'help',
    'need',
    'just',
    'like',
    'using',
    'used',
    'user',
    'users',
    'project',
    'projects',
    'today',
    'tomorrow',
    'check',
    'share',
    'thanks',
    'thank',
    'please',
    'http',
    'https',
    'www',
    'com',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async refreshWeeklyTopicsSnapshot() {
    try {
      await this.computeAndPersistTopics('week', 40);
    } catch (error) {
      const message =
        error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
      this.logger.error('Failed to refresh weekly trending topics snapshot', message);
    }
  }

  async getTrendingTopics(query: GetTrendingTopicsDto) {
    const period = this.normalizePeriod(query.period);
    const limit = Number.isFinite(query.limit) ? Math.max(1, Math.min(50, query.limit)) : 10;

    const computed = await this.computeAndPersistTopics(period, Math.max(limit, 40));
    const filtered = this.applyQueryFilter(computed, query.q).slice(0, limit);

    return {
      period,
      count: filtered.length,
      topics: filtered,
      generatedAt: new Date(),
    };
  }

  async getRisingTopics(periodRaw?: string, limit = 10) {
    const period = this.normalizePeriod(periodRaw);
    const normalizedLimit = Math.max(1, Math.min(50, limit));

    await this.computeAndPersistTopics(period, Math.max(normalizedLimit, 40));

    const topics = await this.prisma.trendingTopic.findMany({
      where: {
        period,
        trendDirection: 'UP',
      },
      orderBy: [
        { velocity: 'desc' },
        { postCount: 'desc' },
        { engagementCount: 'desc' },
      ],
      take: normalizedLimit,
    });

    return {
      period,
      count: topics.length,
      topics,
      generatedAt: new Date(),
    };
  }

  async getTopicPostsByTopic(topicParam: string, periodRaw?: string, limit = 20) {
    const period = this.normalizePeriod(periodRaw);
    const normalizedLimit = Math.max(1, Math.min(50, limit));

    const topic = await this.prisma.trendingTopic.findFirst({
      where: {
        topic: {
          equals: topicParam,
          mode: 'insensitive',
        },
        period,
      },
    });

    if (!topic) {
      await this.computeAndPersistTopics(period, 50);
    }

    const existing =
      topic ||
      (await this.prisma.trendingTopic.findFirst({
        where: {
          topic: {
            equals: topicParam,
            mode: 'insensitive',
          },
          period,
        },
      }));

    if (!existing) {
      return {
        period,
        topic: topicParam,
        posts: [],
      };
    }

    const keywords = [existing.topic, ...existing.relatedKeywords]
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 12);

    const { currentStart } = this.getWindowBoundaries(period);
    const keywordPredicates: Prisma.PostWhereInput[] = [];

    for (const keyword of keywords) {
      keywordPredicates.push(
        {
          subject: { contains: keyword, mode: 'insensitive' },
        },
        {
          content: { contains: keyword, mode: 'insensitive' },
        },
      );
    }

    const posts = await this.prisma.post.findMany({
      where: {
        status: PostStatus.APPROVED,
        isDeleted: false,
        createdAt: {
          gte: currentStart,
        },
        OR: keywordPredicates,
      },
      include: {
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
            Comment: true,
            Vote: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: normalizedLimit,
    });

    return {
      period,
      topic: existing.topic,
      relatedKeywords: existing.relatedKeywords,
      posts,
    };
  }

  private normalizePeriod(raw?: string): TrendingPeriod {
    const value = (raw || 'week').toLowerCase();
    if (value === 'hour' || value === 'day' || value === 'week') {
      return value;
    }
    return 'week';
  }

  private getWindowBoundaries(period: TrendingPeriod) {
    const now = Date.now();
    let periodMs = 7 * 24 * 60 * 60 * 1000;

    if (period === 'hour') {
      periodMs = 60 * 60 * 1000;
    } else if (period === 'day') {
      periodMs = 24 * 60 * 60 * 1000;
    }

    const currentStart = new Date(now - periodMs);
    const previousStart = new Date(now - periodMs * 2);
    return {
      currentStart,
      previousStart,
      now: new Date(now),
    };
  }

  private async computeAndPersistTopics(period: TrendingPeriod, limit: number) {
    const { currentStart, previousStart, now } = this.getWindowBoundaries(period);

    const [currentPosts, previousPosts] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          status: PostStatus.APPROVED,
          isDeleted: false,
          createdAt: {
            gte: currentStart,
          },
        },
        select: {
          id: true,
          subject: true,
          content: true,
          type: true,
          createdAt: true,
          _count: {
            select: {
              Comment: true,
              Vote: true,
            },
          },
        },
      }),
      this.prisma.post.findMany({
        where: {
          status: PostStatus.APPROVED,
          isDeleted: false,
          createdAt: {
            gte: previousStart,
            lt: currentStart,
          },
        },
        select: {
          id: true,
          subject: true,
          content: true,
          type: true,
          _count: {
            select: {
              Comment: true,
              Vote: true,
            },
          },
        },
      }),
    ]);

    const currentTopics = this.aggregateTopics(currentPosts);
    const previousTopics = this.aggregateTopics(previousPosts);

    const computed: TopicRecord[] = Array.from(currentTopics.values())
      .map((entry) => {
        const previous = previousTopics.get(entry.topic);
        const prevCount = previous?.postIds.size ?? 0;
        const currentCount = entry.postIds.size;
        const velocity = prevCount > 0 ? (currentCount - prevCount) / prevCount : currentCount;

        return {
          topic: entry.topic,
          relatedKeywords: Array.from(entry.keywords).slice(0, 12),
          postCount: currentCount,
          engagementCount: entry.engagementCount,
          velocity,
          trendDirection: this.getDirection(velocity, currentCount, prevCount),
        };
      })
      .filter((topic) => this.isRelevantTopic(topic))
      .sort((a, b) => {
        if (b.postCount !== a.postCount) {
          return b.postCount - a.postCount;
        }
        if (b.engagementCount !== a.engagementCount) {
          return b.engagementCount - a.engagementCount;
        }
        return b.velocity - a.velocity;
      })
      .slice(0, limit);

    await this.persistTopics(computed, period, now);

    return computed;
  }

  private aggregateTopics(posts: Array<{
    id: string;
    subject: string;
    content: string;
    type: string | null;
    _count: { Comment: number; Vote: number };
  }>) {
    const map = new Map<string, TopicAccumulator>();

    for (const post of posts) {
      const source = `${post.subject || ''} ${post.content || ''}`.trim();
      const candidates = this.extractTopicCandidates(source, post.type || undefined);
      const seenInPost = new Set<string>();

      for (const candidate of candidates) {
        const normalized = this.toTopicKey(candidate);
        if (!normalized || seenInPost.has(normalized)) {
          continue;
        }
        seenInPost.add(normalized);

        const existing = map.get(normalized);
        const engagement = post._count.Comment * 2 + post._count.Vote;

        if (existing) {
          existing.postIds.add(post.id);
          existing.keywords.add(candidate);
          existing.engagementCount += engagement;
          continue;
        }

        map.set(normalized, {
          topic: normalized,
          keywords: new Set([candidate]),
          postIds: new Set([post.id]),
          engagementCount: engagement,
        });
      }
    }

    return map;
  }

  private extractTopicCandidates(text: string, type?: string): string[] {
    const hashtags = Array.from(text.matchAll(/#(\w{2,40})/g)).map(
      (match) => `#${match[1].toLowerCase()}`,
    );
    const mentions = Array.from(text.matchAll(/@(\w{2,40})/g)).map(
      (match) => `@${match[1].toLowerCase()}`,
    );

    const words = keywordExtractor.default.extract(text, {
      language: 'english',
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: true,
    });

    const cleanedWords = words
      .map((word) => this.sanitizeWord(word))
      .filter((word): word is string => !!word);

    const phrases: string[] = [];
    for (let i = 0; i < cleanedWords.length - 1; i++) {
      const first = cleanedWords[i];
      const second = cleanedWords[i + 1];
      if (first.length >= 3 && second.length >= 3) {
        phrases.push(`${first} ${second}`);
      }
    }

    const candidates = [...hashtags, ...mentions, ...cleanedWords, ...phrases];

    if (type) {
      candidates.push(this.sanitizeWord(type) || '');
    }

    return candidates.filter(Boolean);
  }

  private sanitizeWord(word: string): string | null {
    const normalized = word
      .toLowerCase()
      .replaceAll(/[^a-z0-9\s#@_]/g, '')
      .trim();

    if (!normalized || normalized.length < 3) {
      return null;
    }

    if (this.stopWords.has(normalized)) {
      return null;
    }

    if (/^\d+$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private toTopicKey(candidate: string): string {
    const normalized = this.sanitizeWord(candidate);
    if (!normalized) {
      return '';
    }

    if (normalized.startsWith('#') || normalized.startsWith('@')) {
      return normalized;
    }

    const singular = normalized
      .replace(/ing$/, '')
      .replace(/ed$/, '')
      .replace(/es$/, '')
      .replace(/s$/, '');

    return singular.length >= 3 ? singular : normalized;
  }

  private getDirection(velocity: number, current: number, previous: number): TopicDirection {
    if (previous === 0 && current >= 2) {
      return 'UP';
    }

    if (velocity > 0.15) {
      return 'UP';
    }

    if (velocity < -0.15) {
      return 'DOWN';
    }

    return 'STABLE';
  }

  private isRelevantTopic(topic: TopicRecord): boolean {
    if (topic.topic.length < 3) {
      return false;
    }

    if (topic.postCount < 2) {
      return false;
    }

    if (!/^[#@]?[a-z0-9_\s]+$/.test(topic.topic)) {
      return false;
    }

    return true;
  }

  private applyQueryFilter(topics: TopicRecord[], query?: string) {
    if (!query?.trim()) {
      return topics;
    }

    const q = query.trim().toLowerCase();
    return topics.filter((topic) => {
      if (topic.topic.includes(q)) {
        return true;
      }

      return topic.relatedKeywords.some((keyword) => keyword.includes(q));
    });
  }

  private async persistTopics(topics: TopicRecord[], period: TrendingPeriod, now: Date) {
    if (topics.length === 0) {
      return;
    }

    const topicNames = topics.map((topic) => topic.topic);
    const existing = await this.prisma.trendingTopic.findMany({
      where: {
        period,
        topic: { in: topicNames },
      },
      select: {
        topic: true,
        firstSeenAt: true,
      },
    });

    const firstSeenByTopic = new Map(existing.map((item) => [item.topic, item.firstSeenAt]));

    for (const topic of topics) {
      await this.prisma.trendingTopic.upsert({
        where: {
          topic_period: {
            topic: topic.topic,
            period,
          },
        },
        create: {
          topic: topic.topic,
          period,
          relatedKeywords: topic.relatedKeywords,
          postCount: topic.postCount,
          engagementCount: topic.engagementCount,
          velocity: topic.velocity,
          trendDirection: topic.trendDirection,
          firstSeenAt: firstSeenByTopic.get(topic.topic) || now,
          lastSeenAt: now,
        },
        update: {
          relatedKeywords: topic.relatedKeywords,
          postCount: topic.postCount,
          engagementCount: topic.engagementCount,
          velocity: topic.velocity,
          trendDirection: topic.trendDirection,
          lastSeenAt: now,
        },
      });
    }
  }
}
