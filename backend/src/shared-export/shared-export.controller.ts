import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { SharedExportService } from './shared-export.service';

@ApiTags('Shared Exports')
@Controller('shared-exports')
export class SharedExportController {
  constructor(private readonly sharedExportService: SharedExportService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a shareable link for an export' })
  @ApiResponse({
    status: 201,
    description: 'Shared export created',
    schema: {
      example: {
        shareToken: 'd41d8cd98f00b204e9800998ecf8427e',
        shareUrl: 'http://localhost:3001/shared-export/d41d8cd98f00b204e9800998ecf8427e',
        expiresAt: '2024-02-01T00:00:00Z',
        maxViews: 10,
      },
    },
  })
  async createSharedExport(
    @GetCurrentUser('userId') userId: string,
    @Body() dto: any,
  ) {
    return this.sharedExportService.createSharedExport(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all shared exports' })
  @ApiResponse({
    status: 200,
    description: 'List of shared exports',
  })
  async listSharedExports(
    @GetCurrentUser('userId') userId: string,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10,
  ) {
    return this.sharedExportService.listSharedExports(userId, skip, take);
  }

  @Post(':token/access')
  @ApiOperation({ summary: 'Access a shared export (with optional password)' })
  @ApiResponse({
    status: 200,
    description: 'Get access to shared export',
    schema: {
      example: {
        exportJobId: 'export-id',
        filename: 'REFERRALS.pdf',
        format: 'PDF',
        viewsRemaining: 5,
      },
    },
  })
  async accessSharedExport(
    @Param('token') shareToken: string,
    @Body('password') password?: string,
  ) {
    return this.sharedExportService.accessSharedExport(shareToken, { password });
  }

  @Get(':token')
  @ApiOperation({ summary: 'Get shared export link details (public, no password - returns basic info only)' })
  @ApiResponse({
    status: 200,
    description: 'Shared export metadata (requires POST :token/access for full access)',
  })
  async getSharedExportMetadata(
    @Param('token') shareToken: string,
  ) {
    return this.sharedExportService.getSharedExportMetadata(shareToken);
  }

  @Get(':token/details')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shared export details (creator only)' })
  @ApiResponse({
    status: 200,
    description: 'Detailed shared export info',
    schema: {
      example: {
        shareToken: 'd41d8cd98f00b204e9800998ecf8427e',
        exportJobId: 'export-id',
        expiresAt: '2024-02-01T00:00:00Z',
        maxViews: 10,
        viewCount: 3,
        hasPassword: true,
        accessLog: [
          {
            accessedAt: '2024-01-25T10:00:00Z',
            ip: '192.168.1.1',
            userAgent: 'Mozilla/5.0...',
          },
        ],
      },
    },
  })
  async getSharedExportDetails(
    @GetCurrentUser('userId') userId: string,
    @Param('token') shareToken: string,
  ) {
    return this.sharedExportService.getSharedExportDetails(shareToken, userId);
  }

  @Patch(':token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update shared export settings' })
  @ApiResponse({
    status: 200,
    description: 'Shared export updated',
  })
  async updateSharedExport(
    @GetCurrentUser('userId') userId: string,
    @Param('token') shareToken: string,
    @Body() dto: any,
  ) {
    return this.sharedExportService.updateSharedExport(shareToken, userId, dto);
  }

  @Delete(':token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a shared export' })
  @ApiResponse({
    status: 204,
    description: 'Shared export revoked',
  })
  async revokeSharedExport(
    @GetCurrentUser('userId') userId: string,
    @Param('token') shareToken: string,
  ) {
    return this.sharedExportService.revokeSharedExport(shareToken, userId);
  }
}
