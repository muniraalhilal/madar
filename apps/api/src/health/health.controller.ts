import { type Database } from '@madar/db';
import { ENGINE_VERSION } from '@madar/sim-engine';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';
import { Public } from '../common/auth.decorators';
import { DB } from '../database/database.module';
import { REDIS } from '../database/redis.module';

@ApiTags('health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.db.execute(sql`select 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    try {
      checks.redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      checks.redis = 'down';
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    const body = { status: healthy ? 'ok' : 'degraded', engineVersion: ENGINE_VERSION, checks };
    if (!healthy) throw new ServiceUnavailableException(body);
    return body;
  }
}
