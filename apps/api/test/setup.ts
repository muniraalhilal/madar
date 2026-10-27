import 'reflect-metadata';
import { createDb, runMigrations, seedDemo, type DbHandle } from '@madar/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import pino from 'pino';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://madar:madar@localhost:5432/madar_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/5';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';

export const DEMO_PASSWORD = 'demo-password-2026';

export interface Harness {
  app: INestApplication;
  url: string;
  db: DbHandle;
  redis: Redis;
  log: pino.Logger;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const db = createDb(process.env.DATABASE_URL, { max: 5 });
  await db.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(db.db);
  await seedDemo(db.db, { demoPassword: DEMO_PASSWORD });
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  await redis.flushdb();

  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { docs: true });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return {
    app,
    url: url.replace('[::1]', '127.0.0.1'),
    db,
    redis,
    log: pino({ level: 'silent' }),
    close: async () => {
      await app.close();
      await redis.quit();
      await db.close();
    },
  };
}
