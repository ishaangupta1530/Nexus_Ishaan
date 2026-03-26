import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationStatus, Role } from '@prisma/client';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * Service for computing referral analytics.
 * Provides alumni-specific, student-specific, and platform-wide analytics
 * including application funnel data and monthly trend aggregation.
 */
@Injectable()
export class ReferralAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReferralConversionAnalytics(
    targetUserId: string,
    requesterRole: Role,
    requesterId: string,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (requesterRole !== Role.ADMIN && requesterId !== targetUserId) {
      throw new NotFoundException('Target user not found');
    }

    const perspective =
      targetUser.role === Role.ADMIN
        ? 'admin'
        : targetUser.role === Role.ALUM || targetUser.role === Role.MENTOR
          ? 'alumni'
          : 'student';

    const referralWhere =
      perspective === 'alumni' ? { alumniId: targetUserId } : {};
    const applicationWhere =
      perspective === 'alumni'
        ? { referral: { alumniId: targetUserId } }
        : perspective === 'student'
          ? { applicantId: targetUserId }
          : {};

    const [referralsPosted, referralsApplied, statusRows, appRows] =
      await Promise.all([
        this.prisma.referral.count({ where: referralWhere }),
        this.prisma.referralApplication.count({ where: applicationWhere }),
        this.prisma.referralApplication.groupBy({
          by: ['status'],
          where: applicationWhere,
          _count: { _all: true },
        }),
        this.prisma.referralApplication.findMany({
          where: applicationWhere,
          select: {
            status: true,
            referral: {
              select: {
                company: true,
                jobTitle: true,
              },
            },
          },
        }),
      ]);

    const successfulApplications = statusRows.find(
      (row) => row.status === ApplicationStatus.ACCEPTED,
    )?._count._all || 0;

    const conversionRate =
      referralsApplied > 0
        ? Math.round((successfulApplications / referralsApplied) * 10000) / 100
        : 0;

    const applicationStatusDistribution = this.mapStatusCounts(statusRows);

    const successByIndustryMap = new Map<
      string,
      { industry: string; total: number; successful: number }
    >();
    const successByRoleMap = new Map<
      string,
      { role: string; total: number; successful: number }
    >();

    appRows.forEach((row) => {
      const industry = row.referral.company || 'Unknown';
      const role = row.referral.jobTitle || 'Unknown';
      const isSuccess = row.status === ApplicationStatus.ACCEPTED;

      const industryEntry = successByIndustryMap.get(industry) || {
        industry,
        total: 0,
        successful: 0,
      };
      industryEntry.total += 1;
      industryEntry.successful += isSuccess ? 1 : 0;
      successByIndustryMap.set(industry, industryEntry);

      const roleEntry = successByRoleMap.get(role) || {
        role,
        total: 0,
        successful: 0,
      };
      roleEntry.total += 1;
      roleEntry.successful += isSuccess ? 1 : 0;
      successByRoleMap.set(role, roleEntry);
    });

    const successByIndustry = Array.from(successByIndustryMap.values())
      .map((entry) => ({
        ...entry,
        successRate:
          entry.total > 0
            ? Math.round((entry.successful / entry.total) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const successByRole = Array.from(successByRoleMap.values())
      .map((entry) => ({
        ...entry,
        successRate:
          entry.total > 0
            ? Math.round((entry.successful / entry.total) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      userId: targetUserId,
      perspective,
      metrics: {
        referralsPosted,
        referralsApplied,
        successfulApplications,
        conversionRate,
      },
      applicationStatusDistribution,
      successByIndustry,
      successByRole,
      computedAt: new Date().toISOString(),
    };
  }

  async getReferralFunnelAnalytics(
    targetUserId: string,
    requesterRole: Role,
    requesterId: string,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (requesterRole !== Role.ADMIN && requesterId !== targetUserId) {
      throw new NotFoundException('Target user not found');
    }

    const perspective =
      targetUser.role === Role.ADMIN
        ? 'admin'
        : targetUser.role === Role.ALUM || targetUser.role === Role.MENTOR
          ? 'alumni'
          : 'student';

    const referralWhere =
      perspective === 'alumni' ? { alumniId: targetUserId } : {};
    const applicationWhere =
      perspective === 'alumni'
        ? { referral: { alumniId: targetUserId } }
        : perspective === 'student'
          ? { applicantId: targetUserId }
          : {};

    const [totalViews, totalApplications, statusRows] = await Promise.all([
      this.prisma.referral.aggregate({
        where: referralWhere,
        _sum: { viewCount: true },
      }),
      this.prisma.referralApplication.count({ where: applicationWhere }),
      this.prisma.referralApplication.groupBy({
        by: ['status'],
        where: applicationWhere,
        _count: { _all: true },
      }),
    ]);

    const statusCounts = this.mapStatusCounts(statusRows);

    const reviewed =
      (statusCounts[ApplicationStatus.REVIEWED] || 0) +
      (statusCounts[ApplicationStatus.SHORTLISTED] || 0) +
      (statusCounts[ApplicationStatus.OFFERED] || 0) +
      (statusCounts[ApplicationStatus.ACCEPTED] || 0);
    const shortlisted =
      (statusCounts[ApplicationStatus.SHORTLISTED] || 0) +
      (statusCounts[ApplicationStatus.OFFERED] || 0) +
      (statusCounts[ApplicationStatus.ACCEPTED] || 0);
    const offered =
      (statusCounts[ApplicationStatus.OFFERED] || 0) +
      (statusCounts[ApplicationStatus.ACCEPTED] || 0);
    const accepted = statusCounts[ApplicationStatus.ACCEPTED] || 0;
    const viewed = totalViews._sum.viewCount || 0;

    const stages = [
      { stage: 'Viewed', count: viewed },
      { stage: 'Applied', count: totalApplications },
      { stage: 'Reviewed', count: reviewed },
      { stage: 'Shortlisted', count: shortlisted },
      { stage: 'Offered', count: offered },
      { stage: 'Accepted', count: accepted },
    ];

    const firstStage = stages[0]?.count || 0;
    const funnel = stages.map((stage, idx) => {
      const prev = idx > 0 ? stages[idx - 1].count : stage.count;
      const dropOffRate =
        idx === 0 || prev === 0
          ? 0
          : Math.round(((prev - stage.count) / prev) * 10000) / 100;
      const conversionRate =
        firstStage > 0
          ? Math.round((stage.count / firstStage) * 10000) / 100
          : 0;

      return {
        ...stage,
        dropOffRate,
        conversionRate,
      };
    });

    return {
      userId: targetUserId,
      perspective,
      funnel,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Computes analytics for a specific alumni user.
   * Includes total referrals posted, applications received, conversion rates,
   * status breakdown, and top-performing referrals by application count.
   */
  async getAlumniAnalytics(alumniId: string, query: AnalyticsQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: alumniId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dateFilter = this.buildDateFilter(query);

    const [
      totalReferrals,
      totalApplications,
      applicationsByStatus,
      topReferrals,
      referralsByStatus,
    ] = await Promise.all([
      this.prisma.referral.count({
        where: { alumniId, ...dateFilter.referral },
      }),
      this.prisma.referralApplication.count({
        where: {
          referral: { alumniId },
          ...dateFilter.application,
        },
      }),
      this.prisma.referralApplication.groupBy({
        by: ['status'],
        where: {
          referral: { alumniId },
          ...dateFilter.application,
        },
        _count: { _all: true },
      }),
      this.prisma.referral.findMany({
        where: { alumniId, ...dateFilter.referral },
        select: {
          id: true,
          jobTitle: true,
          company: true,
          viewCount: true,
          _count: { select: { applications: true } },
        },
        orderBy: { applications: { _count: 'desc' } },
        take: 5,
      }),
      this.prisma.referral.groupBy({
        by: ['status'],
        where: { alumniId, ...dateFilter.referral },
        _count: { _all: true },
      }),
    ]);

    const statusBreakdown = this.mapStatusCounts(applicationsByStatus);
    const referralStatusBreakdown = Object.fromEntries(
      referralsByStatus.map((row) => [row.status, row._count._all]),
    );

    const accepted = statusBreakdown[ApplicationStatus.ACCEPTED] || 0;
    const conversionRate =
      totalApplications > 0
        ? Math.round((accepted / totalApplications) * 10000) / 100
        : 0;

    return {
      overview: {
        totalReferrals,
        totalApplications,
        conversionRate,
      },
      referralsByStatus: referralStatusBreakdown,
      applicationsByStatus: statusBreakdown,
      topReferrals: topReferrals.map((r) => ({
        id: r.id,
        jobTitle: r.jobTitle,
        company: r.company,
        viewCount: r.viewCount,
        applicationCount: r._count.applications,
      })),
    };
  }

  /**
   * Computes analytics for a specific student user.
   * Includes total applications submitted, acceptance rate, and status breakdown.
   */
  async getStudentAnalytics(studentId: string, query: AnalyticsQueryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dateFilter = this.buildDateFilter(query);

    const [totalApplications, applicationsByStatus, recentApplications] =
      await Promise.all([
        this.prisma.referralApplication.count({
          where: { applicantId: studentId, ...dateFilter.application },
        }),
        this.prisma.referralApplication.groupBy({
          by: ['status'],
          where: { applicantId: studentId, ...dateFilter.application },
          _count: { _all: true },
        }),
        this.prisma.referralApplication.findMany({
          where: { applicantId: studentId, ...dateFilter.application },
          select: {
            id: true,
            status: true,
            createdAt: true,
            referral: {
              select: {
                jobTitle: true,
                company: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const statusBreakdown = this.mapStatusCounts(applicationsByStatus);
    const accepted = statusBreakdown[ApplicationStatus.ACCEPTED] || 0;
    const successRate =
      totalApplications > 0
        ? Math.round((accepted / totalApplications) * 10000) / 100
        : 0;

    return {
      overview: {
        totalApplications,
        successRate,
      },
      applicationsByStatus: statusBreakdown,
      recentApplications: recentApplications.map((app) => ({
        id: app.id,
        status: app.status,
        createdAt: app.createdAt,
        jobTitle: app.referral.jobTitle,
        company: app.referral.company,
      })),
    };
  }

  /**
   * Computes platform-wide analytics for admin users.
   * Includes total referrals, total applications, conversion rates,
   * top companies, referrals by status, and applications by status.
   */
  async getPlatformAnalytics(query: AnalyticsQueryDto) {
    const dateFilter = this.buildDateFilter(query);

    const [
      totalReferrals,
      totalApplications,
      referralsByStatus,
      applicationsByStatus,
      topCompanies,
      totalViews,
    ] = await Promise.all([
      this.prisma.referral.count({ where: dateFilter.referral }),
      this.prisma.referralApplication.count({
        where: dateFilter.application,
      }),
      this.prisma.referral.groupBy({
        by: ['status'],
        where: dateFilter.referral,
        _count: { _all: true },
      }),
      this.prisma.referralApplication.groupBy({
        by: ['status'],
        where: dateFilter.application,
        _count: { _all: true },
      }),
      this.prisma.referral.groupBy({
        by: ['company'],
        where: dateFilter.referral,
        _count: { company: true },
        orderBy: { _count: { company: 'desc' } },
        take: 10,
      }),
      this.prisma.referral.aggregate({
        where: dateFilter.referral,
        _sum: { viewCount: true },
      }),
    ]);

    const refStatusBreakdown = Object.fromEntries(
      referralsByStatus.map((row) => [row.status, row._count._all]),
    );
    const appStatusBreakdown = this.mapStatusCounts(applicationsByStatus);
    const accepted = appStatusBreakdown[ApplicationStatus.ACCEPTED] || 0;
    const conversionRate =
      totalApplications > 0
        ? Math.round((accepted / totalApplications) * 10000) / 100
        : 0;

    return {
      overview: {
        totalReferrals,
        totalApplications,
        totalViews: totalViews._sum.viewCount || 0,
        conversionRate,
      },
      referralsByStatus: refStatusBreakdown,
      applicationsByStatus: appStatusBreakdown,
      topCompanies: topCompanies.map((c) => ({
        company: c.company,
        count: c._count.company,
      })),
    };
  }

  /**
   * Computes the application funnel data.
   * Maps the stages: Viewed -> Applied -> Shortlisted -> Offered -> Accepted.
   */
  async getApplicationFunnel(query: AnalyticsQueryDto) {
    const dateFilter = this.buildDateFilter(query);

    const [totalViews, totalApplications, applicationsByStatus] =
      await Promise.all([
        this.prisma.referral.aggregate({
          where: dateFilter.referral,
          _sum: { viewCount: true },
        }),
        this.prisma.referralApplication.count({
          where: dateFilter.application,
        }),
        this.prisma.referralApplication.groupBy({
          by: ['status'],
          where: dateFilter.application,
          _count: { _all: true },
        }),
      ]);

    const statusCounts = this.mapStatusCounts(applicationsByStatus);

    const shortlisted = statusCounts[ApplicationStatus.SHORTLISTED] || 0;
    const offered = statusCounts[ApplicationStatus.OFFERED] || 0;
    const accepted = statusCounts[ApplicationStatus.ACCEPTED] || 0;

    const funnel = [
      {
        stage: 'Viewed',
        count: totalViews._sum.viewCount || 0,
      },
      {
        stage: 'Applied',
        count: totalApplications,
      },
      {
        stage: 'Shortlisted',
        count: shortlisted,
      },
      {
        stage: 'Offered',
        count: offered,
      },
      {
        stage: 'Accepted',
        count: accepted,
      },
    ];

    return { funnel };
  }

  /**
   * Computes monthly trend data for referrals and applications.
   * Returns counts aggregated by month for the specified number of past months,
   * or for the explicit date range when dateFrom/dateTo are provided.
   */
  async getMonthlyTrends(query: AnalyticsQueryDto) {
    // Determine the effective end date (inclusive)
    const endDate = query.dateTo ? new Date(query.dateTo) : new Date();
    endDate.setHours(23, 59, 59, 999);

    let months: number;
    let startDate: Date;

    if (query.dateFrom) {
      // Use the provided date range and derive the number of months from it
      startDate = new Date(query.dateFrom);
      startDate.setHours(0, 0, 0, 0);

      const yearDiff = endDate.getFullYear() - startDate.getFullYear();
      const monthDiff = endDate.getMonth() - startDate.getMonth();
      // +1 to make the range inclusive of both start and end months
      months = yearDiff * 12 + monthDiff + 1;

      if (months < 1) {
        months = 1;
      }
    } else {
      // Fallback to the original "last N months" behavior
      months = query.months || 6;
      startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - (months - 1));
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    const [referrals, applications] = await Promise.all([
      this.prisma.referral.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: { createdAt: true },
      }),
      this.prisma.referralApplication.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: { createdAt: true, status: true },
      }),
    ]);

    const trends = this.aggregateByMonth(
      referrals,
      applications,
      months,
      startDate,
    );

    return { trends };
  }

  /**
   * Increments the view counter for a referral.
   * Used when a referral is viewed by a user.
   */
  async incrementViewCount(referralId: string): Promise<void> {
    await this.prisma.referral.update({
      where: { id: referralId },
      data: { viewCount: { increment: 1 } },
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Maps groupBy results into a record of status -> count.
   */
  private mapStatusCounts(
    rows: Array<{ status: ApplicationStatus; _count: { _all: number } }>,
  ): Record<string, number> {
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  }

  /**
   * Builds Prisma date filters from the analytics query DTO.
   */
  private buildDateFilter(query: AnalyticsQueryDto): {
    referral: Record<string, any>;
    application: Record<string, any>;
  } {
    const referral: Record<string, any> = {};
    const application: Record<string, any> = {};

    if (query.dateFrom || query.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) createdAt.lte = new Date(query.dateTo);
      referral.createdAt = createdAt;
      application.createdAt = createdAt;
    }

    return { referral, application };
  }

  /**
   * Aggregates referral and application data into monthly buckets.
   */
  private aggregateByMonth(
    referrals: Array<{ createdAt: Date }>,
    applications: Array<{ createdAt: Date; status: ApplicationStatus }>,
    months: number,
    startDate: Date,
  ) {
    const buckets: Array<{
      month: string;
      referrals: number;
      applications: number;
      accepted: number;
    }> = [];

    for (let i = 0; i < months; i++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + i);
      const year = date.getFullYear();
      const month = date.getMonth();

      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

      const refCount = referrals.filter((r) => {
        const d = new Date(r.createdAt);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;

      const appCount = applications.filter((a) => {
        const d = new Date(a.createdAt);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;

      const acceptedCount = applications.filter((a) => {
        const d = new Date(a.createdAt);
        return (
          d.getFullYear() === year &&
          d.getMonth() === month &&
          a.status === ApplicationStatus.ACCEPTED
        );
      }).length;

      buckets.push({
        month: monthKey,
        referrals: refCount,
        applications: appCount,
        accepted: acceptedCount,
      });
    }

    return buckets;
  }
}
