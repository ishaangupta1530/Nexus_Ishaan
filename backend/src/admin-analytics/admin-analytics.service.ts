import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DateRange = {
  startDate: Date;
  endDate: Date;
  days: number;
};

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformStats(days: number, startDate?: string, endDate?: string) {
    const range = this.resolveDateRange(days, startDate, endDate);

    const [
      totalUsers,
      activeAccounts,
      usersByRole,
      usersByStatus,
      newUsersInRange,
      dau,
      wau,
      mau,
      activeSessions,
      sessionsInRange,
      failedLogins24h,
      lockedAccounts,
      securityEvents24h,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isAccountActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
      this.prisma.user.groupBy({
        by: ['accountStatus'],
        _count: { accountStatus: true },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: range.startDate,
            lte: range.endDate,
          },
        },
      }),
      this.getDistinctActiveUsers(1, range.endDate),
      this.getDistinctActiveUsers(7, range.endDate),
      this.getDistinctActiveUsers(30, range.endDate),
      this.prisma.userSession.count({ where: { isActive: true } }),
      this.prisma.userSession.count({
        where: {
          createdAt: {
            gte: range.startDate,
            lte: range.endDate,
          },
        },
      }),
      this.prisma.loginAttempt.count({
        where: {
          success: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.user.count({
        where: {
          lockedUntil: { gt: new Date() },
        },
      }),
      this.prisma.securityEvent.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const newUsersTrendRaw = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: range.startDate,
          lte: range.endDate,
        },
      },
      select: {
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const newUsersTrend = this.bucketByDay(newUsersTrendRaw, range);

    return {
      period: {
        days: range.days,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      userStatistics: {
        totalUsers,
        totalActiveAccounts: activeAccounts,
        newUsersInPeriod: newUsersInRange,
        byRole: usersByRole.map((item) => ({
          role: item.role,
          count: item._count.role,
        })),
        byStatus: usersByStatus.map((item) => ({
          status: item.accountStatus,
          count: item._count.accountStatus,
        })),
        activeUsers: {
          dau,
          wau,
          mau,
        },
      },
      usageAnalytics: {
        sessionsInPeriod: sessionsInRange,
        activeSessionsNow: activeSessions,
        averageSessionsPerMau: mau > 0 ? Number((sessionsInRange / mau).toFixed(2)) : 0,
        trends: {
          newUsersPerDay: newUsersTrend,
        },
      },
      systemHealth: {
        failedLoginsLast24h: failedLogins24h,
        lockedAccounts,
        securityEventsLast24h: securityEvents24h,
        healthScore: this.calculateHealthScore({
          failedLogins24h,
          lockedAccounts,
          securityEvents24h,
        }),
      },
      generatedAt: new Date(),
    };
  }

  async getUserGrowth(days: number, startDate?: string, endDate?: string) {
    const range = this.resolveDateRange(days, startDate, endDate);
    const previousRange = this.getPreviousRange(range);

    const [currentUsers, previousUsers, usersByRole] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          createdAt: {
            gte: range.startDate,
            lte: range.endDate,
          },
        },
        select: {
          createdAt: true,
          role: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: previousRange.startDate,
            lte: previousRange.endDate,
          },
        },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: {
          createdAt: {
            gte: range.startDate,
            lte: range.endDate,
          },
        },
        _count: { role: true },
      }),
    ]);

    const totalCurrent = currentUsers.length;
    const growthRate =
      previousUsers > 0
        ? Number((((totalCurrent - previousUsers) / previousUsers) * 100).toFixed(2))
        : totalCurrent > 0
          ? 100
          : 0;

    const trend = this.bucketByDay(currentUsers, range);

    return {
      period: {
        days: range.days,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      summary: {
        newUsers: totalCurrent,
        previousPeriodNewUsers: previousUsers,
        growthRatePercent: growthRate,
        averageNewUsersPerDay:
          range.days > 0 ? Number((totalCurrent / range.days).toFixed(2)) : 0,
      },
      byRole: usersByRole.map((item) => ({
        role: item.role,
        count: item._count.role,
      })),
      trend,
      generatedAt: new Date(),
    };
  }

  async getContentStats(days: number, startDate?: string, endDate?: string) {
    const range = this.resolveDateRange(days, startDate, endDate);

    const [
      totalPosts,
      totalComments,
      totalReferrals,
      totalProjects,
      totalMentorships,
      postsInRange,
      commentsInRange,
      referralsInRange,
      projectsInRange,
      mentorshipsInRange,
      postStatusBreakdown,
    ] = await Promise.all([
      this.prisma.post.count({ where: { isDeleted: false } }),
      this.prisma.comment.count({ where: { isDeleted: false } }),
      this.prisma.referral.count(),
      this.prisma.project.count(),
      this.prisma.mentorship.count(),
      this.prisma.post.findMany({
        where: {
          createdAt: { gte: range.startDate, lte: range.endDate },
          isDeleted: false,
        },
        select: { createdAt: true },
      }),
      this.prisma.comment.findMany({
        where: {
          createdAt: { gte: range.startDate, lte: range.endDate },
          isDeleted: false,
        },
        select: { createdAt: true },
      }),
      this.prisma.referral.findMany({
        where: { createdAt: { gte: range.startDate, lte: range.endDate } },
        select: { createdAt: true },
      }),
      this.prisma.project.findMany({
        where: { createdAt: { gte: range.startDate, lte: range.endDate } },
        select: { createdAt: true },
      }),
      this.prisma.mentorship.findMany({
        where: { createdAt: { gte: range.startDate, lte: range.endDate } },
        select: { createdAt: true },
      }),
      this.prisma.post.groupBy({
        by: ['status'],
        where: { isDeleted: false },
        _count: { status: true },
      }),
    ]);

    const trend = this.bucketByDayMulti(
      {
        posts: postsInRange,
        comments: commentsInRange,
        referrals: referralsInRange,
        projects: projectsInRange,
        mentorships: mentorshipsInRange,
      },
      range,
    );

    const totalContentInPeriod =
      postsInRange.length +
      commentsInRange.length +
      referralsInRange.length +
      projectsInRange.length +
      mentorshipsInRange.length;

    return {
      period: {
        days: range.days,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      totals: {
        posts: totalPosts,
        comments: totalComments,
        referrals: totalReferrals,
        projects: totalProjects,
        mentorships: totalMentorships,
      },
      createdInPeriod: {
        posts: postsInRange.length,
        comments: commentsInRange.length,
        referrals: referralsInRange.length,
        projects: projectsInRange.length,
        mentorships: mentorshipsInRange.length,
        total: totalContentInPeriod,
      },
      creationRates: {
        averagePerDay:
          range.days > 0
            ? Number((totalContentInPeriod / range.days).toFixed(2))
            : 0,
        byTypePerDay: {
          posts: Number((postsInRange.length / range.days).toFixed(2)),
          comments: Number((commentsInRange.length / range.days).toFixed(2)),
          referrals: Number((referralsInRange.length / range.days).toFixed(2)),
          projects: Number((projectsInRange.length / range.days).toFixed(2)),
          mentorships: Number((mentorshipsInRange.length / range.days).toFixed(2)),
        },
      },
      postModerationStatus: postStatusBreakdown.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      trend,
      generatedAt: new Date(),
    };
  }

  async getModerationQueue(days: number, startDate?: string, endDate?: string) {
    const range = this.resolveDateRange(days, startDate, endDate);

    const [
      pendingTotal,
      pendingByType,
      topPendingReasons,
      pendingReports,
      resolvedInRange,
      dismissedInRange,
      recentlyProcessed,
    ] = await Promise.all([
      this.prisma.contentReport.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.contentReport.groupBy({
        by: ['type'],
        where: { status: ReportStatus.PENDING },
        _count: { type: true },
      }),
      this.prisma.contentReport.groupBy({
        by: ['reason'],
        where: { status: ReportStatus.PENDING },
        _count: { reason: true },
        orderBy: { _count: { reason: 'desc' } },
        take: 5,
      }),
      this.prisma.contentReport.findMany({
        where: { status: ReportStatus.PENDING },
        select: { createdAt: true, type: true },
      }),
      this.prisma.contentReport.count({
        where: {
          status: ReportStatus.ADDRESSED,
          updatedAt: { gte: range.startDate, lte: range.endDate },
        },
      }),
      this.prisma.contentReport.count({
        where: {
          status: ReportStatus.DISMISSED,
          updatedAt: { gte: range.startDate, lte: range.endDate },
        },
      }),
      this.prisma.contentReport.findMany({
        where: {
          status: { in: [ReportStatus.ADDRESSED, ReportStatus.DISMISSED] },
          updatedAt: { gte: range.startDate, lte: range.endDate },
        },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    const now = Date.now();
    let lt24h = 0;
    let h24to72 = 0;
    let gt72h = 0;

    pendingReports.forEach((report) => {
      const ageHours = (now - report.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) {
        lt24h += 1;
      } else if (ageHours <= 72) {
        h24to72 += 1;
      } else {
        gt72h += 1;
      }
    });

    const avgResolutionHours =
      recentlyProcessed.length > 0
        ? Number(
            (
              recentlyProcessed.reduce((acc, item) => {
                const hours =
                  (item.updatedAt.getTime() - item.createdAt.getTime()) /
                  (1000 * 60 * 60);
                return acc + Math.max(hours, 0);
              }, 0) / recentlyProcessed.length
            ).toFixed(2),
          )
        : 0;

    const reportsCreatedInRange = await this.prisma.contentReport.findMany({
      where: { createdAt: { gte: range.startDate, lte: range.endDate } },
      select: { createdAt: true },
    });

    const createdTrend = this.bucketByDay(reportsCreatedInRange, range);

    return {
      period: {
        days: range.days,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      queue: {
        pendingTotal,
        pendingByType: pendingByType.map((item) => ({
          type: item.type,
          count: item._count.type,
        })),
        pendingAging: {
          lessThan24h: lt24h,
          between24hAnd72h: h24to72,
          greaterThan72h: gt72h,
        },
        topPendingReasons: topPendingReasons.map((item) => ({
          reason: item.reason,
          count: item._count.reason,
        })),
      },
      throughput: {
        resolvedInPeriod: resolvedInRange,
        dismissedInPeriod: dismissedInRange,
        processedInPeriod: resolvedInRange + dismissedInRange,
        averageResolutionHours: avgResolutionHours,
      },
      trends: {
        reportsCreatedPerDay: createdTrend,
      },
      generatedAt: new Date(),
    };
  }

  private resolveDateRange(
    days: number,
    startDate?: string,
    endDate?: string,
  ): DateRange {
    const hasStart = Boolean(startDate);
    const hasEnd = Boolean(endDate);

    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'startDate and endDate must be provided together',
      );
    }

    if (hasStart && hasEnd) {
      const parsedStart = new Date(startDate as string);
      const parsedEnd = new Date(endDate as string);

      if (
        Number.isNaN(parsedStart.getTime()) ||
        Number.isNaN(parsedEnd.getTime())
      ) {
        throw new BadRequestException('Invalid startDate or endDate');
      }

      if (parsedStart > parsedEnd) {
        throw new BadRequestException('startDate must be before endDate');
      }

      const diffDays =
        Math.floor(
          (parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;

      return {
        startDate: parsedStart,
        endDate: parsedEnd,
        days: Math.max(diffDays, 1),
      };
    }

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    return {
      startDate: start,
      endDate: end,
      days,
    };
  }

  private getPreviousRange(range: DateRange): DateRange {
    const durationMs = range.endDate.getTime() - range.startDate.getTime();
    const previousEnd = new Date(range.startDate.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    return {
      startDate: previousStart,
      endDate: previousEnd,
      days: range.days,
    };
  }

  private async getDistinctActiveUsers(
    windowDays: number,
    endDate: Date,
  ): Promise<number> {
    const start = new Date(endDate);
    start.setDate(start.getDate() - (windowDays - 1));

    const active = await this.prisma.userSession.findMany({
      where: {
        lastActivity: {
          gte: start,
          lte: endDate,
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return active.length;
  }

  private bucketByDay(
    items: Array<{ createdAt: Date }>,
    range: DateRange,
  ): Array<{ date: string; count: number }> {
    const map = new Map<string, number>();

    items.forEach((item) => {
      const key = item.createdAt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    });

    const result: Array<{ date: string; count: number }> = [];
    const cursor = new Date(range.startDate);

    while (cursor <= range.endDate) {
      const key = cursor.toISOString().slice(0, 10);
      result.push({ date: key, count: map.get(key) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private bucketByDayMulti(
    datasets: {
      posts: Array<{ createdAt: Date }>;
      comments: Array<{ createdAt: Date }>;
      referrals: Array<{ createdAt: Date }>;
      projects: Array<{ createdAt: Date }>;
      mentorships: Array<{ createdAt: Date }>;
    },
    range: DateRange,
  ): Array<{
    date: string;
    posts: number;
    comments: number;
    referrals: number;
    projects: number;
    mentorships: number;
    total: number;
  }> {
    const postMap = this.toDailyMap(datasets.posts);
    const commentMap = this.toDailyMap(datasets.comments);
    const referralMap = this.toDailyMap(datasets.referrals);
    const projectMap = this.toDailyMap(datasets.projects);
    const mentorshipMap = this.toDailyMap(datasets.mentorships);

    const result: Array<{
      date: string;
      posts: number;
      comments: number;
      referrals: number;
      projects: number;
      mentorships: number;
      total: number;
    }> = [];

    const cursor = new Date(range.startDate);
    while (cursor <= range.endDate) {
      const key = cursor.toISOString().slice(0, 10);
      const posts = postMap.get(key) || 0;
      const comments = commentMap.get(key) || 0;
      const referrals = referralMap.get(key) || 0;
      const projects = projectMap.get(key) || 0;
      const mentorships = mentorshipMap.get(key) || 0;

      result.push({
        date: key,
        posts,
        comments,
        referrals,
        projects,
        mentorships,
        total: posts + comments + referrals + projects + mentorships,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private toDailyMap(items: Array<{ createdAt: Date }>): Map<string, number> {
    const map = new Map<string, number>();

    items.forEach((item) => {
      const key = item.createdAt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    });

    return map;
  }

  private calculateHealthScore(metrics: {
    failedLogins24h: number;
    lockedAccounts: number;
    securityEvents24h: number;
  }): number {
    // Simple bounded scoring model (0-100) for quick health visibility.
    const penalty =
      metrics.failedLogins24h * 0.5 +
      metrics.lockedAccounts * 2 +
      metrics.securityEvents24h * 0.25;

    return Math.max(0, Number((100 - penalty).toFixed(2)));
  }
}
