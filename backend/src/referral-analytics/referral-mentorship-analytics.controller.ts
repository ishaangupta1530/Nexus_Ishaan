import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { ReferralAnalyticsService } from './referral-analytics.service';

@Controller('analytics/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ALUM, Role.STUDENT, Role.MENTOR)
export class ReferralMentorshipAnalyticsController {
  constructor(private readonly referralAnalyticsService: ReferralAnalyticsService) {}

  @Get('conversion')
  async getConversionAnalytics(
    @Query('userId') userId: string | undefined,
    @GetCurrentUser('sub') currentUserId: string,
    @GetCurrentUser('role') currentUserRole: Role,
  ) {
    const targetUserId = this.resolveTargetUserId(userId, currentUserId, currentUserRole);
    return this.referralAnalyticsService.getReferralConversionAnalytics(
      targetUserId,
      currentUserRole,
      currentUserId,
    );
  }

  @Get('funnel')
  async getFunnelAnalytics(
    @Query('userId') userId: string | undefined,
    @GetCurrentUser('sub') currentUserId: string,
    @GetCurrentUser('role') currentUserRole: Role,
  ) {
    const targetUserId = this.resolveTargetUserId(userId, currentUserId, currentUserRole);
    return this.referralAnalyticsService.getReferralFunnelAnalytics(
      targetUserId,
      currentUserRole,
      currentUserId,
    );
  }

  private resolveTargetUserId(
    requestedUserId: string | undefined,
    currentUserId: string,
    currentUserRole: Role,
  ) {
    if (currentUserRole === Role.ADMIN) {
      if (!requestedUserId) {
        throw new BadRequestException('userId query parameter is required for admin requests');
      }
      return requestedUserId;
    }

    return currentUserId;
  }
}
