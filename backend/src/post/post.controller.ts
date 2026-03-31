import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { LegacyFilesService } from 'src/files/legacy-files.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { randomUUID } from 'crypto';

/**
 * Controller for handling post-related operations.
 * Provides endpoints for creating, retrieving, updating, and deleting posts.
 * Also includes functionalities for post moderation (approve/reject) by admins.
 */
@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostController {
  private readonly logger = new Logger(PostController.name);

  constructor(
    private readonly postService: PostService,
    private readonly legacyFilesService: LegacyFilesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Creates a new post for the current authenticated user.
   * Post can be created only by Alumini user
   * An optional image can be uploaded with the post.
   * @param userId - The ID of the current user (extracted from JWT).
   * @param dto - The data for creating the post.
   * @param image - The uploaded image file (optional).
   * @returns A promise that resolves to the created post.
   */
  @Post()
  @ApiOperation({ summary: 'Create a post for the current user' })
  @ApiBody({ type: CreatePostDto })
  @ApiResponse({ status: 201, description: 'Post created successfully.' })
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @GetCurrentUser('userId') userId: string,
    @Body() dto: CreatePostDto,
    // @UploadedFile() image: Express.Multer.File,
  ) {
    // removed image upload for now , just using imageUrl in dto
    // let imageUrl: string | undefined;
    // if (image) {
    //   imageUrl = await this.legacyFilesService.saveFile(image, userId);
    // }

    return this.postService.create(userId, {
      ...dto,
    });
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent posts' })
  @ApiResponse({ status: 200, description: 'List of recent posts.' })
  getRecentPosts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @GetCurrentUser('userId') userId?: string,
  ) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNum = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limitNum =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    return this.postService.getRecentPosts(userId, pageNum, limitNum);
  }

  /**
   * Retrieves the personalized feed for the current authenticated user.
   * @param userId - The ID of the current user (extracted from JWT).
   * @param page - The page number for pagination (defaults to 1).
   * @param limit - The number of posts per page (defaults to 10).
   * @param subCommunityId - Optional. The ID of the sub-community to filter posts by.
   * @returns A promise that resolves to an array of posts for the user's feed.
   */
  @Get('feed')
  @ApiOperation({ summary: "Get the user's feed" })
  @ApiResponse({ status: 200, description: "The user's feed." })
  getFeed(
    @GetCurrentUser('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: 'all' | 'following',
  ) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNum = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limitNum =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    const normalizedScope = scope === 'following' ? 'following' : 'all';
    return this.postService.getFeed(
      userId,
      pageNum,
      limitNum,
      undefined,
      normalizedScope,
    );
  }

  @Get('subcommunity/:subCommunityId/feed')
  @ApiOperation({ summary: "Get the sub-community's feed" })
  @ApiParam({
    name: 'subCommunityId',
    type: String,
    description: 'ID of the sub-community',
  })
  @ApiResponse({ status: 200, description: "The sub-community's feed." })
  getSubCommunityFeed(
    @Param('subCommunityId') subCommunityId: string,
    @GetCurrentUser('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNum = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limitNum =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    return this.postService.getSubCommunityFeed(
      subCommunityId,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get('community-feed')
  @ApiOperation({ summary: "Get the user's joined communities feed" })
  @ApiResponse({ status: 200, description: "The user's community feed." })
  getCommunityFeed(
    @GetCurrentUser('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: 'all' | 'member' | 'managed',
  ) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const pageNum = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limitNum =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    const normalizedScope =
      scope === 'member' || scope === 'managed' ? scope : 'all';
    return this.postService.getMyCommunitiesFeed(
      userId,
      pageNum,
      limitNum,
      normalizedScope,
    );
  }

  /**
   * Retrieves all posts that are pending approval. Only accessible by ADMINs.
   * @param page - The page number for pagination (defaults to 1).
   * @param limit - The number of posts per page (defaults to 10).
   */
  @Get('pending')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all pending posts (for admins)' })
  @ApiResponse({ status: 200, description: 'List of all pending posts.' })
  getPendingPosts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const pageNum = page ?? 1;
    const limitNum = limit ?? 10;
    return this.postService.getPendingPosts(pageNum, limitNum);
  }

  /**
   * Retrieves all posts created by a specific user.
   * @param userId - The ID of the user whose posts are to be retrieved.
   */
  @Get('user/:userId')
  @ApiOperation({ summary: 'Get posts by user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'List of posts by user.' })
  findByUser(
    @GetCurrentUser('userId') currentUserId: string,
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const pageNum = page ?? 1;
    const limitNum = limit ?? 10;
    return this.postService.findByUser(
      userId,
      currentUserId,
      pageNum,
      limitNum,
    );
  }

  /**
   * Retrieves a single post by its ID.
   * @param id - The ID of the post to retrieve.
   * @param userId - The ID of the current user (for authorization checks).
   * @returns A promise that resolves to the post object.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single post by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Post found.' })
  findOne(@Param('id') id: string, @GetCurrentUser('userId') userId: string) {
    return this.postService.findOne(id, userId);
  }

  /**
   * Updates an existing post. Only the author of the post can update it.
   * An optional new image can be uploaded.
   * @param id - The ID of the post to update.
   * @param userId - The ID of the current user (extracted from JWT).
   * @param dto - The data to update the post with.
   * @param image - The new image file (optional).
   * @returns A promise that resolves to the updated post.
   */
  @Patch(':id')
  @Roles(Role.ALUM, Role.ADMIN)
  @ApiOperation({ summary: 'Update a post by id (only by author)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdatePostDto })
  @ApiResponse({ status: 200, description: 'Post updated successfully.' })
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @GetCurrentUser('userId') userId: string,
    @Body() dto: UpdatePostDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    let imageUrl: string | undefined;
    if (image) {
      imageUrl = await this.legacyFilesService.saveFile(image, userId);
    }

    return this.postService.update(id, userId, {
      ...dto,
      imageUrl: imageUrl,
    });
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get post engagement statistics' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiResponse({
    status: 200,
    description: 'Post statistics retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getPostStats(@Param('id') id: string) {
    return this.postService.getPostStats(id);
  }

  /**
   * Approves a pending post. Only accessible by ADMINs.
   * @param id - The ID of the post to approve.
   * @returns A promise that resolves when the post has been approved.
   */
  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Approve a post by id (for admins)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Post approved successfully.' })
  approvePost(@Param('id') id: string) {
    return this.postService.approvePost(id);
  }

  /**
   * Rejects a pending post. Only accessible by ADMINs.
   * @param id - The ID of the post to reject.
   * @returns A promise that resolves when the post has been rejected.
   */
  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject a post by id (for admins)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Post rejected successfully.' })
  rejectPost(@Param('id') id: string) {
    return this.postService.rejectPost(id);
  }

  /**
   * Deletes a post. Only the author of the post can delete it.
   * @param id - The ID of the post to delete.
   * @param userId - The ID of the current user (extracted from JWT).
   * @returns A promise that resolves when the post has been deleted.
   */
  @Delete(':id')
  @Roles(Role.ALUM, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a post by id (only by author)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Post deleted successfully.' })
  remove(@Param('id') id: string, @GetCurrentUser('userId') userId: string) {
    return this.postService.remove(id, userId);
  }

  /**
   * Searches for approved posts based on a query string with pagination.
   * @param query - The search query string.
   * @param page - The page number for pagination.
   * @param limit - The number of posts per page.
   * @param subCommunityId - Optional. The ID of the sub-community to filter search results by.
   * @returns A promise that resolves to an object containing paginated posts, the query, and pagination details.
   */
  @Get('search')
  @ApiOperation({ summary: 'Search for posts' })
  @ApiResponse({
    status: 200,
    description: 'List of posts matching the search query.',
  })
  searchPosts(
    @Query('query') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('subCommunityId') subCommunityId?: string,
    @GetCurrentUser('userId') userId?: string,
  ) {
    const pageNum = page ?? 1;
    const limitNum = limit ?? 10;
    const trimmed = query?.trim();

    const result = this.postService.searchPosts(
      query,
      pageNum,
      limitNum,
      subCommunityId,
    );

    if (trimmed && trimmed.length >= 2) {
      result
        .then((payload) =>
          this.prisma.searchQuery.create({
            data: {
              query: trimmed,
              resultCount: payload.pagination?.total || payload.posts?.length || 0,
              clickedResults: [],
              ...(userId ? { userId } : {}),
            },
          }),
        )
        .catch(() => undefined);
    }

    return result;
  }

  /**
   * Tracks feed session activity for analytics.
   * Creates or updates a UserSession to record feed view time.
   * This is called when users load/view the feed.
   * @param userId - The ID of the current user (extracted from JWT).
   * @returns HTTP 204 No Content (fire-and-forget).
   */
  @Post('feed-session/track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track feed session for analytics' })
  @ApiResponse({ status: 204, description: 'Session tracked.' })
  async trackFeedSession(
    @GetCurrentUser('userId') userId: string,
  ) {
    // Record session asynchronously without blocking the response
    setImmediate(async () => {
      try {
        const existingSession = await this.prisma.userSession.findFirst({
          where: {
            userId,
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000),
            },
          },
          orderBy: { lastActivity: 'desc' },
        });

        if (existingSession) {
          await this.prisma.userSession.update({
            where: { id: existingSession.id },
            data: {
              lastActivity: new Date(),
              isActive: true,
            },
          });
        } else {
          await this.prisma.userSession.create({
            data: {
              userId,
              sessionToken: randomUUID(),
              ipAddress: 'unknown',
              isActive: true,
              lastActivity: new Date(),
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to track feed session for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    });

    return;
  }

  /**
   * Tracks a feed post interaction (click, like, etc.) for analytics.
   * Records the interaction in SearchQuery for feed engagement metrics.
   * @param postId - The ID of the post being interacted with.
   * @param userId - The ID of the current user (extracted from JWT).
   * @returns HTTP 204 No Content (fire-and-forget).
   */
  @Post(':postId/track-interaction')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track a feed post interaction for analytics' })
  @ApiParam({ name: 'postId', type: String })
  @ApiResponse({ status: 204, description: 'Interaction tracked.' })
  async trackFeedInteraction(
    @Param('postId') postId: string,
    @GetCurrentUser('userId') userId: string,
  ) {
    setImmediate(async () => {
      try {
        const existingRecord = await this.prisma.searchQuery.findFirst({
          where: {
            query: 'feed',
            userId,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingRecord) {
          const updatedClicks = Array.from(
            new Set([...existingRecord.clickedResults, postId]),
          );
          await this.prisma.searchQuery.update({
            where: { id: existingRecord.id },
            data: { clickedResults: updatedClicks },
          });
        } else {
          await this.prisma.searchQuery.create({
            data: {
              query: 'feed',
              resultCount: 1,
              clickedResults: [postId],
              userId,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to track feed interaction for post ${postId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    });

    return;
  }
}
