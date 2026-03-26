import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { EngagementService } from './engagement.service';

@Controller('analytics/engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class EngagementAnalyticsController {
  constructor(private readonly engagementService: EngagementService) {}

  /**
   * Get engagement summary for a user across a time period
   * Returns posts created, comments made, votes given/received, engagement rate, content performance score
   */
  @Get('summary')
  async getEngagementSummary(
    @Query('userId') userId: string,
    @Query('period') period?: '7d' | '30d' | '90d' | '1y',
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    const validPeriods = ['7d', '30d', '90d', '1y'];
    const normalizedPeriod = (period || '30d') as '7d' | '30d' | '90d' | '1y';
    if (!validPeriods.includes(normalizedPeriod)) {
      throw new BadRequestException(
        `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
      );
    }

    return this.engagementService.getEngagementSummary(
      userId,
      normalizedPeriod,
    );
  }

  /**
   * Get activity heatmap for a user for a specific year
   * Returns daily activity data with intensity levels (0-4) for calendar visualization
   */
  @Get('heatmap')
  async getActivityHeatmap(
    @Query('userId') userId: string,
    @Query('year') yearStr?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    let year = new Date().getFullYear();
    if (yearStr) {
      const parsedYear = parseInt(yearStr, 10);
      if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        throw new BadRequestException(
          'Invalid year. Must be a valid year between 2000 and 2100',
        );
      }
      year = parsedYear;
    }

    return this.engagementService.getActivityHeatmap(userId, year);
  }

  /**
   * Get trending content across the platform
   * Returns top posts ranked by recency and velocity
   */
  @Get('trending')
  async getTrendingContent(@Query('limit') limitStr?: string) {
    let limit = 10;
    if (limitStr) {
      const parsedLimit = parseInt(limitStr, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        throw new BadRequestException(
          'Invalid limit. Must be between 1 and 100',
        );
      }
      limit = parsedLimit;
    }

    return this.engagementService.getTrendingContent(limit);
  }

  /**
   * Get content performance metrics for a user
   * Returns paginated list of user's posts with engagement metrics (votes, comments, performance score)
   */
  @Get('content-performance')
  async getContentPerformance(
    @Query('userId') userId: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    let page = 1;
    if (pageStr) {
      const parsedPage = parseInt(pageStr, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new BadRequestException('Invalid page. Must be >= 1');
      }
      page = parsedPage;
    }

    let limit = 10;
    if (limitStr) {
      const parsedLimit = parseInt(limitStr, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        throw new BadRequestException(
          'Invalid limit. Must be between 1 and 100',
        );
      }
      limit = parsedLimit;
    }

    return this.engagementService.getContentPerformance(userId, page, limit);
  }
}
