import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';

export interface CreateSharedExportDTO {
  exportJobId: string;
  password?: string;
  expiresAt?: Date;
  maxViews?: number;
}

export interface AccessSharedExportDTO {
  password?: string;
}

@Injectable()
export class SharedExportService {
  private readonly logger = new Logger(SharedExportService.name);
  private readonly TOKEN_LENGTH = 32; // Secure token length
  private readonly BCRYPT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a shareable link for an export
   */
  async createSharedExport(
    userId: string,
    dto: CreateSharedExportDTO,
  ): Promise<{
    shareToken: string;
    shareUrl: string;
    expiresAt?: Date;
    maxViews?: number;
  }> {
    try {
      // Verify export exists and belongs to user
      const exportJob = await this.prisma.exportJob.findUnique({
        where: { id: dto.exportJobId },
      });

      if (!exportJob) {
        throw new NotFoundException('Export not found');
      }

      if (exportJob.userId !== userId) {
        throw new UnauthorizedException('Cannot share another user\'s export');
      }

      if (exportJob.status !== 'COMPLETED') {
        throw new BadRequestException('Export is not ready for sharing');
      }

      // Generate unique share token
      const shareToken = nanoid(this.TOKEN_LENGTH);

      // Hash password if provided
      let hashedPassword = null;
      if (dto.password) {
        this.validatePassword(dto.password);
        hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
      }

      // Create shared export record
      const sharedExport = await this.prisma.sharedExport.create({
        data: {
          exportJobId: dto.exportJobId,
          shareToken,
          password: hashedPassword,
          expiresAt: dto.expiresAt,
          maxViews: dto.maxViews,
          accessLog: [],
        },
      });

      this.logger.log(
        `Shared export created: ${sharedExport.id} for user ${userId}`,
      );

      return {
        shareToken,
        shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/shared-export/${shareToken}`,
        expiresAt: sharedExport.expiresAt,
        maxViews: sharedExport.maxViews,
      };
    } catch (error) {
      this.logger.error(`Failed to create shared export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Access a shared export with password verification
   */
  async accessSharedExport(
    shareToken: string,
    dto: AccessSharedExportDTO,
  ): Promise<{
    exportJobId: string;
    filename: string;
    format: string;
    expiresAt?: Date;
    viewsRemaining?: number;
  }> {
    try {
      const sharedExport = await this.prisma.sharedExport.findUnique({
        where: { shareToken },
      });

      if (!sharedExport) {
        throw new NotFoundException('Shared export not found');
      }

      // Check expiration
      if (sharedExport.expiresAt && new Date() > sharedExport.expiresAt) {
        await this.prisma.sharedExport.delete({ where: { shareToken } });
        throw new NotFoundException('This shared export has expired');
      }

      // Check view limit
      if (
        sharedExport.maxViews &&
        sharedExport.viewCount >= sharedExport.maxViews
      ) {
        throw new BadRequestException(
          'This shared export has reached its view limit',
        );
      }

      // Verify password if set
      if (sharedExport.password) {
        if (!dto.password) {
          throw new UnauthorizedException('Password required for this shared export');
        }

        const passwordMatch = await bcrypt.compare(dto.password, sharedExport.password);
        if (!passwordMatch) {
          throw new UnauthorizedException('Invalid password');
        }
      }

      // Update access log and view count
      const accessLog = Array.isArray(sharedExport.accessLog)
        ? sharedExport.accessLog
        : [];

      const newAccessEntry = {
        accessedAt: new Date().toISOString(),
        ip: process.env.NODE_ENV === 'development' ? '127.0.0.1' : 'unknown',
        userAgent: 'api-access',
      };

      await this.prisma.sharedExport.update({
        where: { shareToken },
        data: {
          viewCount: sharedExport.viewCount + 1,
          accessLog: [...accessLog, newAccessEntry],
        },
      });

      // Get export details
      const exportJob = await this.prisma.exportJob.findUnique({
        where: { id: sharedExport.exportJobId },
      });

      if (!exportJob) {
        throw new NotFoundException('Associated export not found');
      }

      const viewsRemaining = sharedExport.maxViews
        ? sharedExport.maxViews - sharedExport.viewCount - 1
        : undefined;

      this.logger.log(`Shared export accessed: ${shareToken}`);

      return {
        exportJobId: sharedExport.exportJobId,
        filename: `${exportJob.exportType}.${exportJob.format.toLowerCase()}`,
        format: exportJob.format,
        expiresAt: sharedExport.expiresAt,
        viewsRemaining,
      };
    } catch (error) {
      this.logger.error(`Failed to access shared export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get shared export details (only for creator)
   */
  async getSharedExportDetails(
    shareToken: string,
    userId: string,
  ): Promise<any> {
    try {
      const sharedExport = await this.prisma.sharedExport.findUnique({
        where: { shareToken },
        include: {
          exportJob: true,
        },
      });

      if (!sharedExport) {
        throw new NotFoundException('Shared export not found');
      }

      // Verify ownership
      if (sharedExport.exportJob.userId !== userId) {
        throw new UnauthorizedException('Cannot view another user\'s shared export details');
      }

      return {
        shareToken,
        exportJobId: sharedExport.exportJobId,
        expiresAt: sharedExport.expiresAt,
        maxViews: sharedExport.maxViews,
        viewCount: sharedExport.viewCount,
        hasPassword: !!sharedExport.password,
        accessLog: sharedExport.accessLog,
        createdAt: sharedExport.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get shared export details: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all shared exports for a user
   */
  async listSharedExports(userId: string, skip = 0, take = 10): Promise<any> {
    try {
      const [sharedExports, total] = await Promise.all([
        this.prisma.sharedExport.findMany({
          where: {
            exportJob: { userId },
          },
          include: {
            exportJob: {
              select: {
                id: true,
                exportType: true,
                format: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.sharedExport.count({
          where: {
            exportJob: { userId },
          },
        }),
      ]);

      return {
        shared: sharedExports.map((se) => ({
          shareToken: se.shareToken,
          exportType: se.exportJob.exportType,
          format: se.exportJob.format,
          expiresAt: se.expiresAt,
          viewCount: se.viewCount,
          maxViews: se.maxViews,
          hasPassword: !!se.password,
          createdAt: se.createdAt,
        })),
        pagination: {
          skip,
          take,
          total,
          pages: Math.ceil(total / take),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to list shared exports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revoke a shared export
   */
  async revokeSharedExport(shareToken: string, userId: string): Promise<void> {
    try {
      const sharedExport = await this.prisma.sharedExport.findUnique({
        where: { shareToken },
        include: {
          exportJob: { select: { userId: true } },
        },
      });

      if (!sharedExport) {
        throw new NotFoundException('Shared export not found');
      }

      if (sharedExport.exportJob.userId !== userId) {
        throw new UnauthorizedException('Cannot revoke another user\'s shared export');
      }

      await this.prisma.sharedExport.delete({
        where: { shareToken },
      });

      this.logger.log(`Shared export revoked: ${shareToken}`);
    } catch (error) {
      this.logger.error(`Failed to revoke shared export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update shared export settings
   */
  async updateSharedExport(
    shareToken: string,
    userId: string,
    updates: {
      password?: string;
      expiresAt?: Date;
      maxViews?: number;
    },
  ): Promise<any> {
    try {
      const sharedExport = await this.prisma.sharedExport.findUnique({
        where: { shareToken },
        include: {
          exportJob: { select: { userId: true } },
        },
      });

      if (!sharedExport) {
        throw new NotFoundException('Shared export not found');
      }

      if (sharedExport.exportJob.userId !== userId) {
        throw new UnauthorizedException('Cannot update another user\'s shared export');
      }

      const updateData: any = {};

      if (updates.expiresAt !== undefined) {
        updateData.expiresAt = updates.expiresAt;
      }

      if (updates.maxViews !== undefined) {
        updateData.maxViews = updates.maxViews;
      }

      if (updates.password !== undefined) {
        if (updates.password) {
          this.validatePassword(updates.password);
          updateData.password = await bcrypt.hash(updates.password, this.BCRYPT_ROUNDS);
        } else {
          updateData.password = null;
        }
      }

      const updated = await this.prisma.sharedExport.update({
        where: { shareToken },
        data: updateData,
      });

      this.logger.log(`Shared export updated: ${shareToken}`);

      return {
        shareToken: updated.shareToken,
        expiresAt: updated.expiresAt,
        maxViews: updated.maxViews,
        hasPassword: !!updated.password,
      };
    } catch (error) {
      this.logger.error(`Failed to update shared export: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup expired shared exports
   */
  async cleanupExpiredShares(): Promise<number> {
    try {
      const result = await this.prisma.sharedExport.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      this.logger.log(`Cleaned up ${result.count} expired shared exports`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup expired shares: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get public shared export metadata (no authentication required)
   */
  async getSharedExportMetadata(shareToken: string): Promise<{
    shareToken: string;
    isPasswordProtected: boolean;
    expiresAt?: Date;
    maxViews?: number;
    viewsRemaining?: number;
    createdAt: Date;
  }> {
    try {
      const sharedExport = await this.prisma.sharedExport.findUnique({
        where: { shareToken },
      });

      if (!sharedExport) {
        throw new NotFoundException('Shared export not found');
      }

      const viewsRemaining = sharedExport.maxViews
        ? sharedExport.maxViews - sharedExport.viewCount
        : undefined;

      return {
        shareToken: sharedExport.shareToken,
        isPasswordProtected: !!sharedExport.password,
        expiresAt: sharedExport.expiresAt,
        maxViews: sharedExport.maxViews,
        viewsRemaining,
        createdAt: sharedExport.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get shared export metadata: ${error.message}`);
      throw error;
    }
  }

  private validatePassword(password: string): void {
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    if (password.length > 128) {
      throw new BadRequestException('Password must be at most 128 characters long');
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(expiresAt?: Date): boolean {
    if (!expiresAt) return false;
    return new Date() > expiresAt;
  }

  /**
   * Check if view limit reached
   */
  private isViewLimitReached(viewCount: number, maxViews?: number): boolean {
    if (!maxViews) return false;
    return viewCount >= maxViews;
  }
}
