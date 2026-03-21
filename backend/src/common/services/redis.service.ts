import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { WinstonLoggerService } from '../logger/winston-logger.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor(private readonly logger: WinstonLoggerService) {}

  async onModuleInit() {
    // Always use mock Redis clients - Redis is completely bypassed
    this.logger.log('🔇 Redis bypassed - using in-memory mock clients', 'RedisService');
    
    this.client = this.createMockRedisClient();
    this.subscriber = this.createMockRedisClient();
    this.publisher = this.createMockRedisClient();
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
    this.logger.log('Redis connections closed', 'RedisService');
  }

  /**
   * Get Redis client for general operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get subscriber client for pub/sub
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get publisher client for pub/sub
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  /**
   * Set a key-value pair with optional TTL
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Delete multiple keys by pattern
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set expiry on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Decrement a counter
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  /**
   * Delete hash field
   */
  async hdel(key: string, field: string): Promise<number> {
    return this.client.hdel(key, field);
  }

  /**
   * Add to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  /**
   * Remove from set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  /**
   * Check if member is in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  /**
   * Add to sorted set
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zadd(key, score, member);
  }

  /**
   * Remove from sorted set
   */
  async zrem(key: string, member: string): Promise<number> {
    return this.client.zrem(key, member);
  }

  /**
   * Get sorted set range by score
   */
  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<string[]> {
    return this.client.zrangebyscore(key, min, max);
  }

  /**
   * Remove sorted set members by score
   */
  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    return this.client.zremrangebyscore(key, min, max);
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.publisher.publish(channel, message);
  }

  /**
   * Subscribe to channel
   */
  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  /**
   * Cache with JSON serialization
   */
  async cacheJSON(key: string, data: any, ttl?: number): Promise<void> {
    const value = JSON.stringify(data);
    await this.set(key, value, ttl);
  }

  /**
   * Get cached JSON
   */
  async getCachedJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(
        `Failed to parse cached JSON for key ${key}`,
        error.stack,
        'RedisService',
      );
      return null;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateCache(pattern: string): Promise<number> {
    return this.delByPattern(pattern);
  }

  /**
   * Create a mock Redis client for development when Redis is not available
   */
  private createMockRedisClient(): any {
    return {
      on: () => {},
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
      quit: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      set: () => Promise.resolve('OK'),
      setex: () => Promise.resolve('OK'),
      del: () => Promise.resolve(1),
      exists: () => Promise.resolve(0),
      expire: () => Promise.resolve(1),
      ttl: () => Promise.resolve(-1),
      incr: () => Promise.resolve(1),
      decr: () => Promise.resolve(0),
      keys: () => Promise.resolve([]),
      publish: () => Promise.resolve(1),
      subscribe: () => {},
      unsubscribe: () => {},
      hset: () => Promise.resolve(1),
      hget: () => Promise.resolve(null),
      hgetall: () => Promise.resolve({}),
      hdel: () => Promise.resolve(1),
      sadd: () => Promise.resolve(1),
      srem: () => Promise.resolve(1),
      sismember: () => Promise.resolve(0),
      smembers: () => Promise.resolve([]),
      zadd: () => Promise.resolve(1),
      zrem: () => Promise.resolve(1),
      zrangebyscore: () => Promise.resolve([]),
      zremrangebyscore: () => Promise.resolve(0),
    };
  }
}
