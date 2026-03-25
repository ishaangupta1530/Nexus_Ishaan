import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GamificationService } from 'src/gamification/gamification.service';
import { UpdateConnectionStatusDto } from './dto/connection.dto';
import { NotificationService } from 'src/notification/notification.service';
import { WinstonLoggerService } from 'src/common/logger/winston-logger.service';

type ConnectionAnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

type GrowthBucket = {
  label: string;
  bucketStart: string;
  newConnections: number;
  totalConnections: number;
};

/**
 * Service for managing user connections, including sending/accepting requests, and retrieving connection data.
 */
@Injectable()
export class ConnectionService {
  private static readonly PERIOD_TO_DAYS: Record<ConnectionAnalyticsPeriod, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private gamificationService: GamificationService,
    private logger: WinstonLoggerService,
  ) { }

  /**
   * Sends a connection request from one user to another.
   * Prevents duplicate requests, self-connection, and handles existing connections.
   * @param requesterId - The ID of the user sending the request.
   * @param recipientId - The ID of the user receiving the request.
   * @returns A promise that resolves to a success message and the created/updated connection.
   * @throws {BadRequestException} If trying to connect to self.
   * @throws {NotFoundException} If requester or recipient user is not found.
   * @throws {ConflictException} If a request is already pending or users are already connected.
   * @throws {ForbiddenException} If the connection is blocked.
   */
  async sendRequest(requesterId: string, recipientId: string) {
    if (requesterId === recipientId) {
      throw new BadRequestException('Cannot connect to yourself');
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, name: true, role: true },
    });

    if (!requester) {
      throw new NotFoundException('Requester user not found');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, role: true },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    const existingConnection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          {
            requesterId,
            recipientId,
          },
          {
            requesterId: recipientId,
            recipientId: requesterId,
          },
        ],
      },
    });

    if (existingConnection) {
      if (existingConnection.status === 'PENDING') {
        throw new ConflictException('Connection request already pending');
      } else if (existingConnection.status === 'ACCEPTED') {
        throw new ConflictException('Users are already connected');
      } else if (existingConnection.status === 'BLOCKED') {
        throw new ForbiddenException('Connection is blocked');
      } else if (existingConnection.status === 'REJECTED') {
        await this.prisma.connection.update({
          where: { id: existingConnection.id },
          data: { status: 'PENDING', createdAt: new Date() },
        });

        await this.notificationService.createConnectionRequestNotification(
          recipientId,
          requester.name,
        );

        return {
          message: 'Connection request sent successfully',
          connectionId: existingConnection.id,
        };
      }
    }

    const connection = await this.prisma.connection.create({
      data: {
        requesterId,
        recipientId,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                bio: true,
                avatarUrl: true,
              },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                bio: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    await this.notificationService.createConnectionRequestNotification(
      recipientId,
      requester.name,
    );

    return {
      message: 'Connection request sent successfully',
      connection,
    };
  }

  /**
   * Updates the status of a connection request (e.g., ACCEPTED, REJECTED).
   * Only the recipient of the request can update its status.
   * Uses transaction to ensure data consistency.
   * @param userId - The ID of the user attempting to update the status (must be the recipient).
   * @param dto - Data transfer object containing the connection ID and the new status.
   * @returns A promise that resolves to a success message and the updated connection.
   * @throws {NotFoundException} If the connection request is not found.
   * @throws {ForbiddenException} If the user is not the recipient of the request.
   * @throws {BadRequestException} If the request is not in PENDING status.
   */
  async updateStatus(userId: string, dto: UpdateConnectionStatusDto) {
    // First, fetch and validate the connection
    const connection = await this.prisma.connection.findUnique({
      where: { id: dto.connectionId },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                bio: true,
                avatarUrl: true,
              },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            profile: {
              select: {
                bio: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection request not found');
    }

    if (connection.recipientId !== userId) {
      throw new ForbiddenException(
        'Only the recipient can respond to connection requests',
      );
    }

    if (connection.status !== 'PENDING') {
      throw new BadRequestException(
        `Connection request has already been ${connection.status.toLowerCase()}`,
      );
    }

    // Use transaction to ensure atomicity
    const updatedConnection = await this.prisma.$transaction(async (tx) => {
      const updatedConnection = await tx.connection.update({
        where: { id: dto.connectionId },
        data: {
          status: dto.status,
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  avatarUrl: true,
                },
              },
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      });

      // Award gamification points if accepted
      if (dto.status === 'ACCEPTED') {
        try {
          await this.gamificationService.awardPoints(
            connection.requesterId,
            10,
            'CONNECTION_ACCEPTED',
            'Connection request accepted',
          );
          await this.gamificationService.awardPoints(
            connection.recipientId,
            10,
            'CONNECTION_ACCEPTED',
            'Connection request accepted',
          );
        } catch (error) {
          this.logger.error('Failed to award gamification points', error, 'ConnectionService');
          // Don't fail the transaction for gamification errors
        }
      }

      return updatedConnection;
    });

    // Send notification after successful transaction
    if (dto.status === 'ACCEPTED') {
      await this.notificationService.createConnectionAcceptedNotification(
        connection.requesterId,
        connection.recipient.name,
      );
    }

    // award gamification points when connection is accepted
    if (dto.status === 'ACCEPTED') {
      try {
        // award requester based on recipient role
        const recipientRole = updatedConnection.recipient.role;
        const requesterRole = updatedConnection.requester.role;

        const requesterEvent =
          recipientRole === 'ALUM' ? 'CONNECTION_ALUMNI' : 'CONNECTION_STUDENT';
        const recipientEvent =
          requesterRole === 'ALUM' ? 'CONNECTION_ALUMNI' : 'CONNECTION_STUDENT';

        // fire-and-forget
        this.gamificationService
          .awardForEvent(
            requesterEvent,
            updatedConnection.requesterId,
            updatedConnection.id,
          )
          .catch(() => undefined);
        this.gamificationService
          .awardForEvent(
            recipientEvent,
            updatedConnection.recipientId,
            updatedConnection.id,
          )
          .catch(() => undefined);
      } catch {
        // ignore gamification errors
      }
    }

    return {
      message: `Connection request ${dto.status.toLowerCase()} successfully`,
      connection: updatedConnection,
    };
  }

  /**
   * Retrieves a list of accepted connections for a user.
   * Supports pagination, filtering by connected user's role, and searching by name/email.
   * @param userId - The ID of the user whose connections are to be retrieved.
   * @param page - The page number for pagination.
   * @param limit - The number of connections per page.
   * @param role - Optional. Filters connections by the role of the connected user.
   * @param search - Optional. Searches connected users by name or email.
   * @returns A promise that resolves to an object containing paginated connections and pagination details.
   * @throws {BadRequestException} If pagination parameters are invalid.
   */
  async getConnections(
    userId: string,
    page = 1,
    limit = 20,
    role?: 'STUDENT' | 'ALUM' | 'ADMIN',
    search?: string,
  ) {
    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ requesterId: userId }, { recipientId: userId }],
      status: 'ACCEPTED',
    };

    if (role) {
      where.AND = [
        {
          OR: [
            {
              AND: [{ requesterId: userId }, { recipient: { role } }],
            },
            {
              AND: [{ recipientId: userId }, { requester: { role } }],
            },
          ],
        },
      ];
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          {
            AND: [
              { requesterId: userId },
              {
                recipient: {
                  OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
          {
            AND: [
              { recipientId: userId },
              {
                requester: {
                  OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        ],
      });
    }

    const [connections, total] = await Promise.all([
      this.prisma.connection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  location: true,
                  interests: true,
                  avatarUrl: true,
                  skills: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  location: true,
                  interests: true,
                  avatarUrl: true,
                  skills: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.connection.count({ where }),
    ]);

    // Transform connections to show the other user's profile
    const transformedConnections = connections.map((connection) => {
      const otherUser =
        connection.requesterId === userId
          ? connection.recipient
          : connection.requester;

      return {
        id: connection.id,
        connectedAt: connection.createdAt,
        user: {
          ...otherUser,
          skills: otherUser.profile?.skills?.map((skill) => skill.name) || [],
        },
      };
    });

    return {
      connections: transformedConnections,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Retrieves a list of pending connection requests received by a user.
   * @param userId - The ID of the user to retrieve pending requests for.
   * @param page - The page number for pagination.
   * @param limit - The number of requests per page.
   * @returns A promise that resolves to an object containing paginated pending requests and pagination details.
   * @throws {BadRequestException} If pagination parameters are invalid.
   */
  async getPendingRequests(userId: string, page = 1, limit = 20) {
    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.prisma.connection.findMany({
        where: {
          recipientId: userId,
          status: 'PENDING',
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  location: true,
                  interests: true,
                  avatarUrl: true,
                  skills: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.connection.count({
        where: {
          recipientId: userId,
          status: 'PENDING',
        },
      }),
    ]);

    const transformedRequests = requests.map((request) => ({
      id: request.id,
      requestedAt: request.createdAt,
      requester: {
        ...request.requester,
        skills:
          request.requester.profile?.skills?.map((skill) => skill.name) || [],
      },
    }));

    return {
      requests: transformedRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getSentRequests(userId: string, page = 1, limit = 20) {
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid pagination parameters');
    }

    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.prisma.connection.findMany({
        where: {
          requesterId: userId,
          status: 'PENDING',
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: {
                select: {
                  bio: true,
                  location: true,
                  interests: true,
                  avatarUrl: true,
                  skills: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.connection.count({
        where: {
          requesterId: userId,
          status: 'PENDING',
        },
      }),
    ]);

    const transformedRequests = requests.map((request) => ({
      id: request.id,
      sentAt: request.createdAt,
      recipient: {
        ...request.recipient,
        skills:
          request.recipient.profile?.skills?.map((skill) => skill.name) || [],
      },
    }));

    return {
      requests: transformedRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async cancelRequest(userId: string, connectionId: string) {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        requesterId: true,
        status: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection request not found');
    }

    if (connection.requesterId !== userId) {
      throw new ForbiddenException(
        'You can only cancel your own connection requests',
      );
    }

    if (connection.status !== 'PENDING') {
      throw new BadRequestException(
        'Can only cancel pending connection requests',
      );
    }

    await this.prisma.connection.delete({
      where: { id: connectionId },
    });

    return { message: 'Connection request cancelled successfully' };
  }

  async removeConnection(userId: string, connectionId: string) {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        status: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (
      connection.requesterId !== userId &&
      connection.recipientId !== userId
    ) {
      throw new ForbiddenException('You can only remove your own connections');
    }

    if (connection.status !== 'ACCEPTED') {
      throw new BadRequestException('Can only remove accepted connections');
    }

    await this.prisma.connection.delete({
      where: { id: connectionId },
    });

    return { message: 'Connection removed successfully' };
  }

  async getConnectionStatus(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      return { status: 'SELF', connection: null };
    }

    const connection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          {
            requesterId: userId,
            recipientId: otherUserId,
          },
          {
            requesterId: otherUserId,
            recipientId: userId,
          },
        ],
      },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        status: true,
        createdAt: true,
      },
    });

    if (!connection) {
      return { status: 'NOT_CONNECTED', connection: null };
    }

    let userRole = 'NONE';
    if (connection.requesterId === userId) {
      userRole = 'REQUESTER';
    } else if (connection.recipientId === userId) {
      userRole = 'RECIPIENT';
    }

    return {
      status: connection.status,
      userRole,
      connection: {
        id: connection.id,
        createdAt: connection.createdAt,
      },
    };
  }

  async getConnectionStats(userId: string) {
    const [
      totalConnections,
      pendingReceived,
      pendingSent,
      studentConnections,
      alumniConnections,
      recentConnections,
    ] = await Promise.all([
      // Total accepted connections
      this.prisma.connection.count({
        where: {
          OR: [{ requesterId: userId }, { recipientId: userId }],
          status: 'ACCEPTED',
        },
      }),
      this.prisma.connection.count({
        where: {
          recipientId: userId,
          status: 'PENDING',
        },
      }),
      this.prisma.connection.count({
        where: {
          requesterId: userId,
          status: 'PENDING',
        },
      }),
      this.prisma.connection.count({
        where: {
          OR: [
            {
              AND: [
                { requesterId: userId },
                { recipient: { role: 'STUDENT' } },
              ],
            },
            {
              AND: [
                { recipientId: userId },
                { requester: { role: 'STUDENT' } },
              ],
            },
          ],
          status: 'ACCEPTED',
        },
      }),
      this.prisma.connection.count({
        where: {
          OR: [
            {
              AND: [{ requesterId: userId }, { recipient: { role: 'ALUM' } }],
            },
            {
              AND: [{ recipientId: userId }, { requester: { role: 'ALUM' } }],
            },
          ],
          status: 'ACCEPTED',
        },
      }),
      // Recent connections (last 30 days)
      this.prisma.connection.count({
        where: {
          OR: [{ requesterId: userId }, { recipientId: userId }],
          status: 'ACCEPTED',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total: totalConnections,
      pendingReceived,
      pendingSent,
      byRole: {
        students: studentConnections,
        alumni: alumniConnections,
      },
      recent30Days: recentConnections,
    };
  }

  async getConnectionGrowthAnalytics(
    userId: string,
    period: ConnectionAnalyticsPeriod = '30d',
  ) {
    const normalizedPeriod = this.normalizePeriod(period);
    const days = ConnectionService.PERIOD_TO_DAYS[normalizedPeriod];

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const previousEnd = new Date(startDate);
    previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - (days - 1));
    previousStart.setHours(0, 0, 0, 0);

    const [totalConnections, periodConnections, previousPeriodCount] =
      await Promise.all([
        this.prisma.connection.count({
          where: {
            OR: [{ requesterId: userId }, { recipientId: userId }],
            status: 'ACCEPTED',
          },
        }),
        this.prisma.connection.findMany({
          where: {
            OR: [{ requesterId: userId }, { recipientId: userId }],
            status: 'ACCEPTED',
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.connection.count({
          where: {
            OR: [{ requesterId: userId }, { recipientId: userId }],
            status: 'ACCEPTED',
            createdAt: {
              gte: previousStart,
              lte: previousEnd,
            },
          },
        }),
      ]);

    const buckets = this.buildGrowthBuckets(
      periodConnections.map((item) => item.createdAt),
      startDate,
      normalizedPeriod,
      totalConnections,
    );

    const newConnections = periodConnections.length;
    const growthRate =
      previousPeriodCount === 0
        ? newConnections > 0
          ? 100
          : 0
        : ((newConnections - previousPeriodCount) / previousPeriodCount) * 100;

    return {
      userId,
      period: normalizedPeriod,
      granularity: this.getGranularity(normalizedPeriod),
      metrics: {
        totalConnections,
        newConnections,
        previousPeriodConnections: previousPeriodCount,
        growthRate: Math.round(growthRate * 100) / 100,
        velocity:
          buckets.length > 0
            ? Math.round((newConnections / buckets.length) * 100) / 100
            : 0,
      },
      data: buckets,
    };
  }

  async getConnectionDistributionAnalytics(userId: string) {
    const connections = await this.prisma.connection.findMany({
      where: {
        OR: [{ requesterId: userId }, { recipientId: userId }],
        status: 'ACCEPTED',
      },
      select: {
        requesterId: true,
        recipientId: true,
        requester: {
          select: {
            role: true,
            graduationYear: true,
            profile: {
              select: {
                year: true,
                location: true,
              },
            },
          },
        },
        recipient: {
          select: {
            role: true,
            graduationYear: true,
            profile: {
              select: {
                year: true,
                location: true,
              },
            },
          },
        },
      },
    });

    const byRole: Record<string, number> = {};
    const byGraduationYear: Record<string, number> = {};
    const byLocation: Record<string, number> = {};

    connections.forEach((connection) => {
      const otherUser =
        connection.requesterId === userId
          ? connection.recipient
          : connection.requester;

      const role = otherUser.role || 'UNKNOWN';
      byRole[role] = (byRole[role] || 0) + 1;

      const graduationYear =
        otherUser.graduationYear?.toString() ||
        otherUser.profile?.year ||
        'Not Specified';
      byGraduationYear[graduationYear] =
        (byGraduationYear[graduationYear] || 0) + 1;

      const location = otherUser.profile?.location || 'Not Specified';
      byLocation[location] = (byLocation[location] || 0) + 1;
    });

    const totalConnections = connections.length;

    return {
      userId,
      totalConnections,
      byRole: Object.entries(byRole)
        .map(([role, count]) => ({
          role,
          count,
          percentage:
            totalConnections > 0
              ? Math.round((count / totalConnections) * 10000) / 100
              : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byGraduationYear: Object.entries(byGraduationYear)
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => b.count - a.count),
      byLocation: Object.entries(byLocation)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async getNetworkStrengthScore(userId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [distribution, activeUserCount, recentConnections, prevConnections, pendingReceived] =
      await Promise.all([
        this.getConnectionDistributionAnalytics(userId),
        this.prisma.user.count({ where: { isAccountActive: true } }),
        this.prisma.connection.count({
          where: {
            OR: [{ requesterId: userId }, { recipientId: userId }],
            status: 'ACCEPTED',
            createdAt: { gte: thirtyDaysAgo, lte: now },
          },
        }),
        this.prisma.connection.count({
          where: {
            OR: [{ requesterId: userId }, { recipientId: userId }],
            status: 'ACCEPTED',
            createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          },
        }),
        this.prisma.connection.findMany({
          where: {
            recipientId: userId,
            status: 'PENDING',
          },
          select: { createdAt: true },
        }),
      ]);

    const totalConnections = distribution.totalConnections;
    const velocity = Math.round((recentConnections / 30) * 100) / 100;

    const growthRate =
      prevConnections === 0
        ? recentConnections > 0
          ? 100
          : 0
        : ((recentConnections - prevConnections) / prevConnections) * 100;

    const roleCategories = distribution.byRole.filter((item) => item.count > 0)
      .length;
    const roleDiversity = Math.min((roleCategories / 4) * 100, 100);

    const knownLocations = distribution.byLocation.filter(
      (item) => item.location !== 'Not Specified',
    ).length;
    const locationDiversity = Math.min((knownLocations / 10) * 100, 100);

    const networkDensity =
      activeUserCount > 1
        ? Math.min((totalConnections / (activeUserCount - 1)) * 100, 100)
        : 0;

    const avgResponseHours =
      pendingReceived.length > 0
        ? pendingReceived.reduce((sum, request) => {
            const ageInHours =
              (now.getTime() - new Date(request.createdAt).getTime()) /
              (1000 * 60 * 60);
            return sum + ageInHours;
          }, 0) / pendingReceived.length
        : 0;

    const sizeScore = Math.min((totalConnections / 100) * 100, 100);
    const diversityScore = (roleDiversity + locationDiversity) / 2;
    const velocityScore = Math.min((velocity / 3) * 100, 100);
    const growthScore = Math.max(0, Math.min(100, (growthRate + 100) / 2));

    const score = Math.round(
      sizeScore * 0.35 +
        diversityScore * 0.25 +
        velocityScore * 0.2 +
        growthScore * 0.1 +
        networkDensity * 0.1,
    );

    return {
      userId,
      score,
      metrics: {
        totalConnections,
        growthRate: Math.round(growthRate * 100) / 100,
        velocity,
        networkDensity: Math.round(networkDensity * 100) / 100,
        roleDiversity: Math.round(roleDiversity * 100) / 100,
        locationDiversity: Math.round(locationDiversity * 100) / 100,
        averageResponseTimeHours: Math.round(avgResponseHours * 100) / 100,
      },
      interpretation:
        score >= 75
          ? 'Strong network with healthy growth and good diversity.'
          : score >= 50
            ? 'Moderate network strength with room to improve growth or diversity.'
            : 'Early-stage network. Increase consistent connections and diversify your network.',
    };
  }

  private normalizePeriod(period?: string): ConnectionAnalyticsPeriod {
    if (!period) {
      return '30d';
    }

    return (['7d', '30d', '90d', '1y'] as ConnectionAnalyticsPeriod[]).includes(
      period as ConnectionAnalyticsPeriod,
    )
      ? (period as ConnectionAnalyticsPeriod)
      : '30d';
  }

  private getGranularity(period: ConnectionAnalyticsPeriod) {
    if (period === '7d' || period === '30d') {
      return 'daily';
    }
    if (period === '90d') {
      return 'weekly';
    }
    return 'monthly';
  }

  private buildGrowthBuckets(
    createdAtDates: Date[],
    startDate: Date,
    period: ConnectionAnalyticsPeriod,
    totalConnections: number,
  ): GrowthBucket[] {
    const granularity = this.getGranularity(period);
    const bucketCounts = new Map<string, number>();

    createdAtDates.forEach((date) => {
      const key = this.toBucketKey(date, granularity);
      bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
    });

    const bucketStarts = this.generateBucketStarts(startDate, period, granularity);
    const periodConnectionCount = createdAtDates.length;
    let runningTotal = totalConnections - periodConnectionCount;

    return bucketStarts.map((bucketStart) => {
      const key = this.toBucketKey(bucketStart, granularity);
      const newConnections = bucketCounts.get(key) || 0;
      runningTotal += newConnections;

      return {
        label: this.formatBucketLabel(bucketStart, granularity),
        bucketStart: bucketStart.toISOString(),
        newConnections,
        totalConnections: runningTotal,
      };
    });
  }

  private generateBucketStarts(
    startDate: Date,
    period: ConnectionAnalyticsPeriod,
    granularity: 'daily' | 'weekly' | 'monthly',
  ) {
    const starts: Date[] = [];

    if (granularity === 'daily') {
      const totalDays = ConnectionService.PERIOD_TO_DAYS[period];
      for (let i = 0; i < totalDays; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        date.setHours(0, 0, 0, 0);
        starts.push(date);
      }
      return starts;
    }

    if (granularity === 'weekly') {
      const weeklyBuckets = Math.ceil(
        ConnectionService.PERIOD_TO_DAYS[period] / 7,
      );
      for (let i = 0; i < weeklyBuckets; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i * 7);
        date.setHours(0, 0, 0, 0);
        starts.push(date);
      }
      return starts;
    }

    const currentMonthStart = new Date(startDate);
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < 12; i++) {
      const month = new Date(currentMonthStart);
      month.setMonth(currentMonthStart.getMonth() + i);
      starts.push(month);
    }

    return starts;
  }

  private toBucketKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly') {
    const normalized = new Date(date);

    if (granularity === 'daily') {
      normalized.setHours(0, 0, 0, 0);
      return normalized.toISOString().split('T')[0];
    }

    if (granularity === 'weekly') {
      normalized.setHours(0, 0, 0, 0);
      const day = normalized.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      normalized.setDate(normalized.getDate() + diff);
      return normalized.toISOString().split('T')[0];
    }

    normalized.setHours(0, 0, 0, 0);
    normalized.setDate(1);
    return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
  }

  private formatBucketLabel(
    date: Date,
    granularity: 'daily' | 'weekly' | 'monthly',
  ) {
    if (granularity === 'daily') {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    if (granularity === 'weekly') {
      return `Wk ${Math.ceil(date.getDate() / 7)} ${date.toLocaleString('en-US', {
        month: 'short',
      })}`;
    }

    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }

  /**
   * Suggests potential connections for a user based on shared skills, interests, and location.
   * Excludes already connected users and the user themselves.
   * @param userId - The ID of the user for whom to suggest connections.
   * @param limit - The maximum number of suggestions to return.
   * @returns A promise that resolves to an object containing suggested user profiles with match scores and reasons.
   */
  async suggestConnections(userId: string, limit = 10) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: {
            skills: true,
          },
        },
      },
    });

    if (!user || !user.profile) {
      return { suggestions: [] };
    }

    const existingConnections = await this.prisma.connection.findMany({
      where: {
        OR: [{ requesterId: userId }, { recipientId: userId }],
      },
      select: {
        requesterId: true,
        recipientId: true,
      },
    });

    const connectedUserIds = new Set([
      ...existingConnections.map((c) => c.requesterId),
      ...existingConnections.map((c) => c.recipientId),
      userId,
    ]);

    const userSkills = user.profile.skills.map((skill) => skill.name);

    const suggestions = await this.prisma.user.findMany({
      where: {
        AND: [
          {
            id: {
              notIn: Array.from(connectedUserIds),
            },
          },
          {
            OR: [
              userSkills.length > 0
                ? {
                  profile: {
                    skills: {
                      some: {
                        name: {
                          in: userSkills,
                        },
                      },
                    },
                  },
                }
                : {},
              user.profile.interests
                ? {
                  profile: {
                    interests: {
                      contains: user.profile.interests,
                      mode: 'insensitive',
                    },
                  },
                }
                : {},
              user.profile.location
                ? {
                  profile: {
                    location: {
                      contains: user.profile.location,
                      mode: 'insensitive',
                    },
                  },
                }
                : {},
            ],
          },
        ],
      },
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        profile: {
          select: {
            bio: true,
            location: true,
            interests: true,
            avatarUrl: true,
            skills: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Transform and calculate match score
    const suggestionsWithScore = suggestions.map((suggestion) => {
      let score = 0;
      const reasons = [];

      const suggestionSkills =
        suggestion.profile?.skills?.map((s) => s.name) || [];
      const commonSkills = userSkills.filter((skill) =>
        suggestionSkills.includes(skill),
      );
      if (commonSkills.length > 0) {
        score += commonSkills.length * 3;
        reasons.push(`${commonSkills.length} common skills`);
      }

      // Calculate interest match
      if (
        user.profile.interests &&
        suggestion.profile?.interests &&
        suggestion.profile.interests
          .toLowerCase()
          .includes(user.profile.interests.toLowerCase())
      ) {
        score += 2;
        reasons.push('Similar interests');
      }

      // Calculate location match
      if (
        user.profile.location &&
        suggestion.profile?.location &&
        suggestion.profile.location
          .toLowerCase()
          .includes(user.profile.location.toLowerCase())
      ) {
        score += 1;
        reasons.push('Same location');
      }

      if (user.role !== suggestion.role) {
        score += 1;
        reasons.push('Different role perspective');
      }

      return {
        user: {
          ...suggestion,
          skills: suggestionSkills,
        },
        matchScore: score,
        reasons,
      };
    });

    // Sort by match score and return
    const sortedSuggestions = suggestionsWithScore
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return {
      suggestions: sortedSuggestions,
      basedOn: {
        skills: userSkills,
        interests: user.profile.interests,
        location: user.profile.location,
        role: user.role,
      },
    };
  }
}
