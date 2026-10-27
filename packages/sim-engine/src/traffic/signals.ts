import type { SignalOverride, SignalPhase, SignalPlan } from '../core/types.js';

/** Seconds of green lost at the start of each phase while queues accelerate. */
export const STARTUP_LOST_TIME = 2;
export const MIN_GREEN = 5;
export const MAX_GREEN = 120;
export const MAX_CYCLE = 240;

export function cycleLength(plan: SignalPlan): number {
  return plan.phases.reduce((s, p) => s + p.green + p.yellow + p.allRed, 0);
}

export interface SignalState {
  phaseIndex: number;
  /** 'green' | 'yellow' | 'red' (all-red clearance). */
  aspect: 'green' | 'yellow' | 'allRed';
  /** Seconds since this phase's green began. */
  elapsed: number;
  /** True when vehicles in this phase are actually discharging (effective green). */
  discharging: boolean;
}

/**
 * Signal state at absolute simulation time t.
 * Effective green = actual green − start-up lost time + yellow, the textbook
 * (HCM-style) approximation of when a queue actually moves.
 */
export function signalStateAt(plan: SignalPlan, t: number): SignalState {
  const cycle = cycleLength(plan);
  if (cycle <= 0) throw new RangeError(`Signal ${plan.nodeId} has zero cycle length`);
  let local = (((t - plan.offset) % cycle) + cycle) % cycle;
  for (let i = 0; i < plan.phases.length; i++) {
    const p = plan.phases[i] as SignalPhase;
    const span = p.green + p.yellow + p.allRed;
    if (local < span) {
      const aspect = local < p.green ? 'green' : local < p.green + p.yellow ? 'yellow' : 'allRed';
      const discharging = aspect !== 'allRed' && local >= STARTUP_LOST_TIME;
      return { phaseIndex: i, aspect, elapsed: local, discharging };
    }
    local -= span;
  }
  // Floating point edge: treat as the end of the last phase.
  return { phaseIndex: plan.phases.length - 1, aspect: 'allRed', elapsed: 0, discharging: false };
}

/** Fraction of the cycle during which an approach discharges. */
export function effectiveGreenRatio(plan: SignalPlan, approachLinkId: string): number {
  const cycle = cycleLength(plan);
  let eff = 0;
  for (const p of plan.phases) {
    if (p.approaches.includes(approachLinkId)) eff += Math.max(0, p.green + p.yellow - STARTUP_LOST_TIME);
  }
  return cycle > 0 ? eff / cycle : 0;
}

export function validateSignalPlan(plan: SignalPlan, incomingLinkIds?: Set<string>): string[] {
  const issues: string[] = [];
  if (plan.phases.length < 2) issues.push(`signal ${plan.nodeId}: needs at least two phases`);
  plan.phases.forEach((p, i) => {
    if (!(p.green >= MIN_GREEN && p.green <= MAX_GREEN))
      issues.push(`signal ${plan.nodeId} phase ${i}: green must be ${MIN_GREEN}–${MAX_GREEN}s`);
    if (!(p.yellow >= 3 && p.yellow <= 6)) issues.push(`signal ${plan.nodeId} phase ${i}: yellow must be 3–6s`);
    if (!(p.allRed >= 0 && p.allRed <= 5)) issues.push(`signal ${plan.nodeId} phase ${i}: all-red must be 0–5s`);
    if (p.approaches.length === 0) issues.push(`signal ${plan.nodeId} phase ${i}: serves no approach`);
    if (incomingLinkIds) {
      for (const a of p.approaches) {
        if (!incomingLinkIds.has(a)) issues.push(`signal ${plan.nodeId} phase ${i}: ${a} is not an approach`);
      }
    }
  });
  const cycle = cycleLength(plan);
  if (cycle > MAX_CYCLE) issues.push(`signal ${plan.nodeId}: cycle ${cycle}s exceeds ${MAX_CYCLE}s`);
  if (incomingLinkIds) {
    const served = new Set(plan.phases.flatMap((p) => p.approaches));
    for (const id of incomingLinkIds) {
      if (!served.has(id)) issues.push(`signal ${plan.nodeId}: approach ${id} never receives green`);
    }
  }
  return issues;
}

export function applySignalOverride(plan: SignalPlan, override: SignalOverride): SignalPlan {
  if (override.greens.length !== plan.phases.length) {
    throw new RangeError(
      `Override for ${plan.nodeId} has ${override.greens.length} greens; plan has ${plan.phases.length} phases`,
    );
  }
  return {
    ...plan,
    offset: override.offset ?? plan.offset,
    phases: plan.phases.map((p, i) => ({ ...p, green: override.greens[i] as number })),
  };
}

export interface WebsterResult {
  nodeId: string;
  cycle: number;
  greens: number[];
  criticalRatios: number[];
  /** Sum of critical flow ratios; ≥ 0.9 means the junction is oversaturated. */
  flowRatioSum: number;
  oversaturated: boolean;
}

/**
 * Webster's (1958) fixed-time optimisation.
 *   C₀ = (1.5·L + 5) / (1 − Y)
 *   gᵢ = (yᵢ / Y) · (C₀ − L)
 * where yᵢ is the critical flow ratio q/s of phase i, Y = Σyᵢ and L the total lost time.
 *
 * @param flows  observed arrival flow per approach link id, veh/h
 * @param saturation saturation flow per approach link id (all lanes), veh/h
 */
export function websterTiming(
  plan: SignalPlan,
  flows: Record<string, number>,
  saturation: Record<string, number>,
  opts: { minCycle?: number; maxCycle?: number } = {},
): WebsterResult {
  const minCycle = opts.minCycle ?? 40;
  const maxCycle = opts.maxCycle ?? 150;
  const ratios = plan.phases.map((p) =>
    Math.max(
      0.01,
      ...p.approaches.map((a) => (flows[a] ?? 0) / Math.max(1, saturation[a] ?? 1800)),
    ),
  );
  const Y = ratios.reduce((s, y) => s + y, 0);
  // In this model a phase's effective green is green + yellow − start-up lost
  // time, so the time lost per phase is start-up lost time + all-red.
  const L = plan.phases.reduce((s, p) => s + STARTUP_LOST_TIME + p.allRed, 0);
  const oversaturated = Y >= 0.9;
  let cycle = oversaturated ? maxCycle : (1.5 * L + 5) / (1 - Y);
  cycle = Math.min(maxCycle, Math.max(minCycle, Math.round(cycle)));
  const usable = cycle - L;
  const greens = plan.phases.map((p, i) => {
    const effective = ((ratios[i] as number) / Y) * usable;
    // Convert effective green back to displayed green.
    const display = effective - p.yellow + STARTUP_LOST_TIME;
    return Math.min(MAX_GREEN, Math.max(MIN_GREEN + 2, Math.round(display)));
  });
  return { nodeId: plan.nodeId, cycle, greens, criticalRatios: ratios, flowRatioSum: Y, oversaturated };
}
