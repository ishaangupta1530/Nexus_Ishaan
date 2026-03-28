import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetTrendingTopicsDto } from './dto/get-trending-topics.dto';
import { TrendingTopicsService } from './trending-topics.service';

@ApiTags('trending')
@ApiBearerAuth()
@Controller('trending')
@UseGuards(JwtAuthGuard)
export class TrendingTopicsController {
  constructor(private readonly trendingTopicsService: TrendingTopicsService) {}

  @Get('topics')
  async getTopics(@Query() query: GetTrendingTopicsDto) {
    return this.trendingTopicsService.getTrendingTopics(query);
  }

  @Get('topics/rising')
  async getRisingTopics(
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trendingTopicsService.getRisingTopics(period, Number(limit) || 10);
  }

  @Get('topics/:topic/posts')
  async getTopicPosts(
    @Param('topic') topic: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trendingTopicsService.getTopicPostsByTopic(
      decodeURIComponent(topic),
      period,
      Number(limit) || 20,
    );
  }
}
