import { SIMULATION_QUEUE } from '@madar/shared';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env';

export const SIM_QUEUE = Symbol('SIM_QUEUE');

@Injectable()
class QueueLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SIM_QUEUE) private readonly queue: Queue) {}
  async onApplicationShutdown() {
    await this.queue.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SIM_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) => new Queue(SIMULATION_QUEUE, { connection: { url: env.REDIS_URL, maxRetriesPerRequest: null } }),
    },
    QueueLifecycle,
  ],
  exports: [SIM_QUEUE],
})
export class QueueModule {}
