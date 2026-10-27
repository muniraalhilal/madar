import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';

const handle = createDb(process.env.DATABASE_URL, { max: 1 });
await runMigrations(handle.db);
console.log('✓ migrations applied');
await handle.close();
