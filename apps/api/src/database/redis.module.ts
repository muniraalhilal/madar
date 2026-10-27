import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

export const REDIS = Symbol('REDIS');
export const REDIS_SUB = Symbol('REDIS_SUB');

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUB) private readonly sub: Redis,
  ) {}
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.redis.quit(), this.sub.quit()]);
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) },
    // A dedicated connection: a subscribed Redis client cannot issue other commands.
    { provide: REDIS_SUB, inject: [ENV], useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) },
    RedisLifecycle,
  ],
  exports: [REDIS, REDIS_SUB],
})
export class RedisModule {}
