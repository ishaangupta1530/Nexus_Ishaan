import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { DiscoveryService } from './discovery.service';

@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('feed')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get personalized feed for a user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT, Role.ALUM)
  async getFeed(
    @GetCurrentUser('userId') currentUserId: string,
    @Query('userId') userId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const resolvedUserId = userId || currentUserId;
    if (!resolvedUserId) {
      throw new BadRequestException('userId is required');
    }

    if (resolvedUserId !== currentUserId) {
      throw new ForbiddenException('You can only access your own feed');
    }

    return this.discoveryService.getFeed(resolvedUserId, page ?? 1, limit ?? 20);
  }

  @Post('feed/refresh')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Refresh personalized feed cache for a user' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT, Role.ALUM)
  async refreshFeed(
    @GetCurrentUser('userId') currentUserId: string,
    @Query('userId') userId?: string,
  ) {
    const resolvedUserId = userId || currentUserId;
    if (!resolvedUserId) {
      throw new BadRequestException('userId is required');
    }

    if (resolvedUserId !== currentUserId) {
      throw new ForbiddenException('You can only refresh your own feed');
    }

    await this.discoveryService.refreshFeed(resolvedUserId);
    return this.discoveryService.getFeed(resolvedUserId, 1, 20);
  }

  @Get('feed/preview')
  @ApiOperation({ summary: 'Preview personalized feed (top 5) without auth' })
  async getFeedPreview(@Query('userId') userId?: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.discoveryService.getFeed(userId, 1, 5);
  }
}
