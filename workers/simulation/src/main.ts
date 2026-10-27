import { createDb } from '@madar/db';
import { SIMULATION_QUEUE } from '@madar/shared';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { processRun } from './processor.js';

const log = pino({ name: 'madar-worker', level: process.env.LOG_LEVEL ?? 'info' });
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const handle = createDb(process.env.DATABASE_URL, { max: concurrency + 2 });
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<{ runId: string }>(
  SIMULATION_QUEUE,
  async (job) => processRun(job.data.runId, { db: handle.db, redis, log: log.child({ runId: job.data.runId }) }),
  { connection: { url: redisUrl, maxRetriesPerRequest: null }, concurrency, lockDuration: 60_000 },
);

worker.on('ready', () => log.info({ concurrency }, 'simulation worker ready'));
worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'job failed'));

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  await worker.close();
  await redis.quit();
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
