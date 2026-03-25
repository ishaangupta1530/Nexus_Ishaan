import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ConnectionService } from './connection.service';

@ApiTags('analytics-connections')
@ApiBearerAuth('JWT')
@Controller('analytics/connections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ConnectionAnalyticsController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Get('growth')
  getGrowth(
    @Query('userId') userId?: string,
    @Query('period') period: '7d' | '30d' | '90d' | '1y' = '30d',
  ) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    return this.connectionService.getConnectionGrowthAnalytics(userId, period);
  }

  @Get('distribution')
  getDistribution(@Query('userId') userId?: string) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    return this.connectionService.getConnectionDistributionAnalytics(userId);
  }

  @Get('strength-score')
  getStrengthScore(@Query('userId') userId?: string) {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }

    return this.connectionService.getNetworkStrengthScore(userId);
  }
}
