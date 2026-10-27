import { createDb } from '../client.js';
import { seedDemo } from '../seed.js';

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) {
  console.error('Set DEMO_PASSWORD (≥ 10 characters) to seed demo accounts.');
  process.exit(1);
}
const handle = createDb(process.env.DATABASE_URL, { max: 2 });
await seedDemo(handle.db, { demoPassword: password });
console.log('✓ city, roles, demo accounts and sample project seeded');
await handle.close();
