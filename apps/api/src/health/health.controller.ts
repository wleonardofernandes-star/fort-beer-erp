import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    const redis = await this.redis.ping();

    const ok = db;
    return {
      status: ok ? 'ok' : 'degraded',
      db,
      redis,
      redisConfigured: this.redis.enabled,
      ts: new Date().toISOString(),
    };
  }
}
