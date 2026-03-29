import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SearchService, SearchType } from './search.service';

interface SearchQueryDto {
  q: string;
  type?: SearchType;
  page?: string;
  limit?: string;
  dateFrom?: string;
  dateTo?: string;
  communityId?: string;
}

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT, Role.ALUM, Role.ADMIN)
@ApiBearerAuth('JWT')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query() params: SearchQueryDto,
    @GetCurrentUser('sub') userId?: string,
  ) {
    const page = Number.parseInt(params.page || '1', 10);
    const limit = Number.parseInt(params.limit || '10', 10);

    return this.searchService.search(
      params.q,
      params.type || 'all',
      page,
      limit,
      {
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        communityId: params.communityId,
      },
      userId,
    );
  }

  @Get('suggest')
  suggest(@Query('q') query: string, @GetCurrentUser('sub') userId?: string) {
    return this.searchService.getSuggestions(query, userId);
  }

  @Get('trending-queries')
  trendingQueries() {
    return this.searchService.getTrendingQueries();
  }

  @Patch('track-click')
  trackClick(
    @Body('query') query: string,
    @Body('resultId') resultId: string,
    @GetCurrentUser('sub') userId?: string,
  ) {
    return this.searchService.trackClick(query, resultId, userId);
  }
}
