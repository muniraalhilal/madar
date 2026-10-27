import { createDb, type Database, type DbHandle } from '@madar/db';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

export const DB = Symbol('DB');
export const DB_HANDLE = Symbol('DB_HANDLE');

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}
  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({
  providers: [
    { provide: DB_HANDLE, inject: [ENV], useFactory: (env: Env) => createDb(env.DATABASE_URL, { max: 10 }) },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Database => h.db },
    DbLifecycle,
  ],
  exports: [DB, DB_HANDLE],
})
export class DatabaseModule {}
