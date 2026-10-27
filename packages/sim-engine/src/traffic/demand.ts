import type { RoadGraph } from '../core/graph.js';
import type { Rng } from '../core/prng.js';
import type { CityNetwork } from '../core/types.js';

/**
 * Travel demand: a doubly-weighted gravity model.
 *
 *   T_ij ∝ P_i · A_j · exp(−d_ij / D)
 *
 * P = zone production weight, A = attraction weight, d = centroid distance,
 * D = deterrence distance. The matrix is normalised to probabilities; total
 * volume comes from the network base demand × scenario multiplier × time-of-day
 * profile. Weights are synthetic modelling inputs for the fictional city.
 */

export const DETERRENCE_DISTANCE = 3500; // m
export const INTRA_ZONE_FACTOR = 0.25;

/** Relative demand by hour of day (0–23); 1.0 = morning peak. Synthetic profile. */
export const HOURLY_PROFILE = [
  0.12, 0.08, 0.06, 0.06, 0.1, 0.25, 0.55, 0.95, 1.0, 0.78, 0.62, 0.62, 0.68, 0.66, 0.62, 0.7, 0.86, 0.96,
  0.92, 0.76, 0.6, 0.45, 0.32, 0.2,
];

export function demandProfile(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const f = h - i;
  const a = HOURLY_PROFILE[i] as number;
  const b = HOURLY_PROFILE[(i + 1) % 24] as number;
  return a + (b - a) * f;
}

export interface OdPair {
  origin: string;
  destination: string;
  share: number;
  originNodes: number[];
  destinationNodes: number[];
}

export interface DemandModel {
  pairs: OdPair[];
  samplePair(rng: Rng): OdPair;
}

export function buildDemand(network: CityNetwork, graph: RoadGraph): DemandModel {
  const zones = network.zones
    .map((z) => ({
      ...z,
      idx: z.nodes.map((id) => graph.nodeIndex.get(id)).filter((i): i is number => i !== undefined),
    }))
    .filter((z) => z.idx.length > 0);
  const centroid = (idx: number[]) => {
    let x = 0;
    let y = 0;
    for (const i of idx) {
      x += graph.node(i).x;
      y += graph.node(i).y;
    }
    return { x: x / idx.length, y: y / idx.length };
  };
  const cents = zones.map((z) => centroid(z.idx));
  const raw: OdPair[] = [];
  let total = 0;
  zones.forEach((zi, i) => {
    zones.forEach((zj, j) => {
      if (i === j && zi.idx.length < 2) return;
      const ci = cents[i] as { x: number; y: number };
      const cj = cents[j] as { x: number; y: number };
      const d = Math.hypot(ci.x - cj.x, ci.y - cj.y);
      // External-to-external trips are through traffic and are kept light.
      const through = zi.id.startsWith('region') && zj.id.startsWith('region') ? 0.35 : 1;
      const w = zi.production * zj.attraction * Math.exp(-d / DETERRENCE_DISTANCE) * (i === j ? INTRA_ZONE_FACTOR : 1) * through;
      if (w <= 0) return;
      total += w;
      raw.push({ origin: zi.id, destination: zj.id, share: w, originNodes: zi.idx, destinationNodes: zj.idx });
    });
  });
  if (total <= 0) throw new Error('Demand model has no valid OD pairs');
  const pairs = raw.map((p) => ({ ...p, share: p.share / total }));
  const cumulative = new Float64Array(pairs.length);
  let acc = 0;
  pairs.forEach((p, i) => {
    acc += p.share;
    cumulative[i] = acc;
  });
  return {
    pairs,
    samplePair(rng: Rng): OdPair {
      const r = rng.next() * acc;
      let lo = 0;
      let hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((cumulative[mid] as number) > r) hi = mid;
        else lo = mid + 1;
      }
      return pairs[lo] as OdPair;
    },
  };
}
