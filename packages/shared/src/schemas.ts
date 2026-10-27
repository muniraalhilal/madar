import { z } from 'zod';

/**
 * Request validation shared by the API (server-side enforcement) and the web
 * client (instant form feedback). The server never trusts the client copy.
 */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  displayName: trimmed(2, 60),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({ displayName: trimmed(2, 60) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

export const createProjectSchema = z.object({
  name: trimmed(2, 80),
  description: z.string().trim().max(500).default(''),
  cityId: z.string().trim().min(1).max(64).default('madar-city'),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['editor', 'viewer']),
});

export const scenarioParamsSchema = z.object({
  durationS: z.number().int().min(60).max(14400).default(3600),
  seed: z.number().int().min(0).max(2_147_483_647).default(42),
  demandMultiplier: z.number().min(0).max(4).default(1),
  startHour: z.number().int().min(0).max(23).default(7),
  rerouting: z.boolean().default(true),
  sampleIntervalS: z.number().int().min(10).max(600).default(60),
  frameIntervalS: z.number().int().min(0).max(60).default(4),
  energySetpointDelta: z.number().min(-3).max(4).default(0),
  energyLightingSaving: z.number().min(0).max(0.6).default(0),
  energyOccupancyScale: z.number().min(0.5).max(1.5).default(1),
});
export type ScenarioParamsInput = z.infer<typeof scenarioParamsSchema>;

export const signalOverrideSchema = z.object({
  intersectionCode: z.string().min(1).max(64),
  offsetS: z.number().int().min(0).max(240).nullable().optional(),
  greens: z.array(z.number().int().min(5).max(120)).min(2).max(8),
});

export const closureSchema = z
  .object({
    roadCode: z.string().min(1).max(64),
    startS: z.number().int().min(0).max(14400).default(0),
    endS: z.number().int().min(1).max(14400).nullable().optional(),
    reason: z.string().trim().max(200).default(''),
  })
  .refine((c) => c.endS == null || c.endS > c.startS, { message: 'endS must be after startS', path: ['endS'] });

export const incidentSchema = z.object({
  roadCode: z.string().min(1).max(64),
  kind: z.enum(['collision', 'breakdown', 'roadwork', 'event']),
  severity: z.number().gt(0).max(1),
  startS: z.number().int().min(0).max(14400),
  durationS: z.number().int().min(30).max(14400),
  description: z.string().trim().max(300).default(''),
});

export const createScenarioSchema = z.object({
  name: trimmed(2, 80),
  description: z.string().trim().max(500).default(''),
  kind: z.enum(['baseline', 'variant']).default('variant'),
  /** Copy parameters, overrides, closures and incidents from this scenario. */
  baseScenarioId: z.string().uuid().optional(),
});
export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;

export const updateScenarioSchema = z.object({
  name: trimmed(2, 80).optional(),
  description: z.string().trim().max(500).optional(),
  isSaved: z.boolean().optional(),
  params: scenarioParamsSchema.partial().optional(),
  signalOverrides: z.array(signalOverrideSchema).max(64).optional(),
  closures: z.array(closureSchema).max(64).optional(),
  incidents: z.array(incidentSchema).max(32).optional(),
});
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

export const startRunSchema = z.object({
  /** Simulated seconds per wall-clock second (0 = as fast as possible). */
  pace: z.number().int().min(0).max(600).default(0),
});

export const runControlSchema = z.object({ action: z.enum(['pause', 'resume', 'cancel']) });

export const createReportSchema = z.object({
  title: trimmed(3, 120),
  baselineRunId: z.string().uuid(),
  variantRunId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).default(''),
});

export const proposeSignalsSchema = z.object({
  runId: z.string().uuid(),
  intersectionCodes: z.array(z.string()).max(64).optional(),
});

export const energyQuerySchema = z.object({
  setpointDelta: z.coerce.number().min(-3).max(4).default(0),
  lightingSaving: z.coerce.number().min(0).max(0.6).default(0),
  occupancyScale: z.coerce.number().min(0.5).max(1.5).default(1),
});

export const nearQuerySchema = z.object({
  x: z.coerce.number().min(-20000).max(20000),
  y: z.coerce.number().min(-20000).max(20000),
  radius: z.coerce.number().min(1).max(3000).default(300),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
