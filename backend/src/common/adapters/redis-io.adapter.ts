import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Redis-based Socket.IO Adapter for Horizontal Scalability
 *
 * This adapter enables multi-server WebSocket communication by using Redis Pub/Sub.
 * All server instances connect to the same Redis instance, allowing messages to be
 * broadcast across all servers.
 *
 * Benefits:
 * - Horizontal scaling: Run multiple server instances behind a load balancer
 * - Cross-server messaging: Users connected to different servers can communicate
 * - High availability: If one server goes down, users can reconnect to another
 * - Session persistence: Redis stores connection state across servers
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private readonly configService: ConfigService;

  constructor(app: INestApplicationContext) {
    super(app);
    this.configService = app.get(ConfigService);
  }

  async connectToRedis(): Promise<void> {
    const disableRedis = this.configService.get('DISABLE_REDIS', 'false');
    const redisUrl = this.configService.get('REDIS_URL');

    // Skip Redis initialization if explicitly disabled
    if (disableRedis === 'true') {
      this.logger.warn('⚠️ Redis disabled - using in-memory Socket.IO adapter');
      return;
    }

    // Skip Redis initialization if not configured
    if (!redisUrl || redisUrl.trim() === '') {
      this.logger.warn('⚠️ Redis not configured - using in-memory Socket.IO adapter');
      return;
    }

    this.logger.log('🔌 Connecting to Redis for Socket.IO adapter...');

    try {
      // Create Redis clients for pub/sub with connection options that prevent auto-retry
      const pubClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: () => false, // Don't retry
        },
      } as any);
      const subClient = pubClient.duplicate();

      // Handle connection events
      pubClient.on('error', (err) => {
        this.logger.error('❌ Redis Pub Client Error - using in-memory adapter:', err);
        // Fallback to in-memory adapter
      });

      subClient.on('error', (err) => {
        this.logger.error('❌ Redis Sub Client Error - using in-memory adapter:', err);
        // Fallback to in-memory adapter
      });

      pubClient.on('connect', () => {
        this.logger.log('✅ Redis Pub Client connected');
      });

      subClient.on('connect', () => {
        this.logger.log('✅ Redis Sub Client connected');
      });

      // Try to connect to Redis with timeout and graceful fallback
      try {
        // Set a 5-second timeout for connection attempt
        const connectPromise = Promise.all([pubClient.connect(), subClient.connect()]);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000),
        );
        await Promise.race([connectPromise, timeoutPromise]);

        this.logger.log('🚀 Redis adapter configured successfully');

        // Create the adapter
        this.adapterConstructor = createAdapter(pubClient, subClient);
      } catch (connectError: any) {
        this.logger.warn('⚠️ Redis connection failed, using in-memory WebSocket adapter:', connectError.message);
        // Fallback to in-memory adapter - don't set adapterConstructor
        return;
      }
    } catch (error) {
      this.logger.error('❌ Failed to connect to Redis:', error);
      this.logger.warn(
        '⚠️ Falling back to in-memory adapter (single-server mode)',
      );
      // If Redis connection fails, the adapter will fall back to default in-memory adapter
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    // Apply Redis adapter if available
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log(
        '✅ Socket.IO server using Redis adapter (multi-server mode)',
      );
    } else {
      this.logger.warn(
        '⚠️ Socket.IO server using default adapter (single-server mode)',
      );
    }

    return server;
  }
}
