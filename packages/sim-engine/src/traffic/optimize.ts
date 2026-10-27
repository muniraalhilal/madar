import type { CityNetwork, LinkResult, SignalOverride } from '../core/types.js';
import { websterTiming, type WebsterResult } from './signals.js';

/**
 * Derives Webster fixed-time plans for every signal from the flows observed in a
 * completed run. The proposal is a starting point the planner can edit; it is
 * applied as SignalOverrides, so the original plans stay untouched.
 */
export function proposeSignalTimings(
  network: CityNetwork,
  links: LinkResult[],
  durationSeconds: number,
  nodeIds?: string[],
): { overrides: SignalOverride[]; details: WebsterResult[] } {
  const byId = new Map(network.links.map((l) => [l.id, l]));
  const flows: Record<string, number> = {};
  const sat: Record<string, number> = {};
  for (const r of links) {
    const l = byId.get(r.linkId);
    if (!l) continue;
    // Arrival flow ≈ discharged flow + growth of the standing queue; using
    // `entered` captures demand that could not discharge.
    flows[r.linkId] = (Math.max(r.entered, r.exited) * 3600) / Math.max(1, durationSeconds);
    sat[r.linkId] = l.lanes * l.saturationFlow;
  }
  const wanted = nodeIds ? new Set(nodeIds) : null;
  const details: WebsterResult[] = [];
  const overrides: SignalOverride[] = [];
  for (const plan of network.signals) {
    if (wanted && !wanted.has(plan.nodeId)) continue;
    const w = websterTiming(plan, flows, sat);
    details.push(w);
    overrides.push({ nodeId: plan.nodeId, greens: w.greens });
  }
  return { overrides, details };
}
