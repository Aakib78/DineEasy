import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin wrapper around ioredis. Redis is never the source of truth (docs/architecture.md §1)
 * — it backs rate limiting, idempotency-key short-term caching, and (once the WebSocket
 * gateway is multi-instance) Socket.IO's Redis adapter for cross-replica fan-out. A Redis
 * outage must degrade, not break, order/menu/billing correctness — callers should treat
 * every method here as best-effort and fail open (never block a core operation on Redis
 * being reachable).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('redis.url')!, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      lazyConnect: false,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection issue (degrading gracefully): ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  /** Best-effort SET with TTL; swallows errors so a Redis outage never throws into a request. */
  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis SET failed for ${key}: ${(err as Error).message}`);
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`Redis GET failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }
}
