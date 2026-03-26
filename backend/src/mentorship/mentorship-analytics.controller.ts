import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { MentorshipService } from './mentorship.service';

@Controller('analytics/mentorship')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ALUM, Role.STUDENT, Role.MENTOR)
export class MentorshipAnalyticsController {
  constructor(private readonly mentorshipService: MentorshipService) {}

  @Get('summary')
  async getMentorshipSummary(
    @Query('userId') userId: string | undefined,
    @GetCurrentUser('sub') currentUserId: string,
    @GetCurrentUser('role') currentUserRole: Role,
  ) {
    const targetUserId = this.resolveTargetUserId(userId, currentUserId, currentUserRole);
    return this.mentorshipService.getMentorshipSummaryAnalytics(
      targetUserId,
      currentUserRole,
      currentUserId,
    );
  }

  @Get('impact')
  async getMentorshipImpact(
    @Query('userId') userId: string | undefined,
    @GetCurrentUser('sub') currentUserId: string,
    @GetCurrentUser('role') currentUserRole: Role,
  ) {
    const targetUserId = this.resolveTargetUserId(userId, currentUserId, currentUserRole);
    return this.mentorshipService.getMentorshipImpactAnalytics(
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
