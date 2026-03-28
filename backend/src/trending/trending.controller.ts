import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TrendingService } from './trending.service';

@ApiTags('trending')
@ApiBearerAuth('JWT')
@Controller('trending')
@UseGuards(JwtAuthGuard)
export class TrendingController {
  constructor(private readonly trendingService: TrendingService) {}

  @Get('posts')
  async getTrendingPosts(
    @Query('period', new DefaultValuePipe('day')) period: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    return this.trendingService.getTrendingPosts(period, limit);
  }

  @Get('posts/:postId/score')
  getPostScore(
    @Param('postId') postId: string,
    @Query('period', new DefaultValuePipe('day')) period: string,
  ) {
    if (!postId) {
      throw new BadRequestException('postId is required');
    }

    return this.trendingService.getPostScore(postId, period);
  }

  @Post('recalculate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async recalculate() {
    const result = await this.trendingService.recalculateAllPeriods();
    return {
      message: 'Trending recalculation completed',
      ...result,
    };
  }
}
