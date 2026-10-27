import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

/** Locates the SQL migrations whether running from src (tsx) or dist (built). */
export function migrationsFolder(): string {
  if (process.env.MADAR_MIGRATIONS_DIR) return resolve(process.env.MADAR_MIGRATIONS_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, '..', 'migrations'), join(here, '..', '..', 'migrations')]) {
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
  }
  throw new Error('Could not locate @madar/db migrations; set MADAR_MIGRATIONS_DIR');
}

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
