import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { TenantContextStore } from '../../common/context/tenant-context';

/**
 * Backs the in-app System Status screen (spec §59/§60) and the version-compatibility check
 * (spec §61). Deliberately unauthenticated (`@Public()`) — a staff member needs to see "is
 * the server even reachable/healthy" before they've necessarily got a valid session, and it
 * exposes no tenant data, only process-level health.
 */
@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const healthy = database.ok && redis.ok;

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    };
  }

  @Public()
  @Get('version')
  version() {
    return {
      appVersion: this.config.get<string>('app.version'),
      apiVersion: 'v1',
      // Reported so a Flutter client can warn "please update" rather than silently
      // misbehaving against an incompatible server (spec §61).
      minCompatibleClientVersion: '0.1.0',
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await TenantContextStore.runUnscoped(() => this.prisma.$queryRaw`SELECT 1`);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.redis.client.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
