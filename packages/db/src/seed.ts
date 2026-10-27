import { ROLE_DESCRIPTIONS, ROLE_PERMISSIONS, type UserRole } from '@madar/shared';
import argon2 from 'argon2';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { seedCity } from './city.js';
import * as s from './schema.js';

export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function seedRoles(db: Database): Promise<void> {
  for (const id of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
    await db
      .insert(s.roles)
      .values({ id, description: ROLE_DESCRIPTIONS[id], permissions: [...ROLE_PERMISSIONS[id]] })
      .onConflictDoUpdate({ target: s.roles.id, set: { description: ROLE_DESCRIPTIONS[id], permissions: [...ROLE_PERMISSIONS[id]] } });
  }
}

export interface DemoSeedOptions {
  /** Password for the demo accounts. Must come from configuration, never hard-coded in production. */
  demoPassword: string;
}

/**
 * Demo data for local development and portfolio walkthroughs:
 *   admin@madar.dev  (admin)  · planner@madar.dev (planner) · viewer@madar.dev (viewer)
 * plus one project with a baseline and an example variant.
 */
export async function seedDemo(db: Database, opts: DemoSeedOptions): Promise<void> {
  await seedRoles(db);
  await seedCity(db);
  const hash = await argon2.hash(opts.demoPassword, ARGON2_OPTIONS);
  const accounts: { email: string; displayName: string; role: UserRole }[] = [
    { email: 'admin@madar.dev', displayName: 'Admin', role: 'admin' },
    { email: 'planner@madar.dev', displayName: 'Munira (Planner)', role: 'planner' },
    { email: 'viewer@madar.dev', displayName: 'Guest Viewer', role: 'viewer' },
  ];
  const ids: Record<string, string> = {};
  for (const a of accounts) {
    const [found] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`lower(${s.users.email}) = ${a.email}`);
    if (found) {
      await db.update(s.users).set({ role: a.role }).where(eq(s.users.id, found.id));
      ids[a.role] = found.id;
    } else {
      const [row] = await db.insert(s.users).values({ ...a, passwordHash: hash }).returning({ id: s.users.id });
      ids[a.role] = row!.id;
    }
  }

  const plannerId = ids.planner as string;
  const existing = await db
    .select({ id: s.projects.id })
    .from(s.projects)
    .where(and(eq(s.projects.ownerId, plannerId), eq(s.projects.name, 'Morning Peak Study')));
  if (existing.length) return;

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(s.projects)
      .values({
        name: 'Morning Peak Study',
        description: 'How signal timing and the Orbit Boulevard corridor shape the 07:00–08:00 peak.',
        cityId: 'madar-city',
        ownerId: plannerId,
      })
      .returning({ id: s.projects.id });
    await tx.insert(s.projectMembers).values([
      { projectId: project!.id, userId: plannerId, role: 'owner' },
      { projectId: project!.id, userId: ids.viewer as string, role: 'viewer' },
    ]);
    const [baseline] = await tx
      .insert(s.scenarios)
      .values({
        projectId: project!.id,
        name: 'Baseline — fixed 35/35 s signals',
        description: 'Default uncoordinated two-phase plans at every signalised junction.',
        kind: 'baseline',
        isSaved: true,
        createdBy: plannerId,
      })
      .returning({ id: s.scenarios.id });
    await tx.insert(s.scenarioParameters).values({ scenarioId: baseline!.id });

    const [closure] = await tx
      .insert(s.scenarios)
      .values({
        projectId: project!.id,
        name: 'Orbit Boulevard works (northbound closed)',
        description: 'Northbound closure between Noor Square and Orbit Circle from 07:05.',
        kind: 'variant',
        baseScenarioId: baseline!.id,
        createdBy: plannerId,
      })
      .returning({ id: s.scenarios.id });
    await tx.insert(s.scenarioParameters).values({ scenarioId: closure!.id });
    const [road] = await tx
      .select({ id: s.roads.id })
      .from(s.roads)
      .where(and(eq(s.roads.cityId, 'madar-city'), eq(s.roads.code, 'c3r2>c3r3')));
    await tx.insert(s.scenarioClosures).values({ scenarioId: closure!.id, roadId: road!.id, startS: 300, reason: 'Utility works' });
  });
}
