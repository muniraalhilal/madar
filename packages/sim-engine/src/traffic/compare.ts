import type { LinkResult, SimulationSummary } from '../core/types.js';

export type Better = 'lower' | 'higher';

export interface MetricDelta {
  key: string;
  label: string;
  unit: string;
  baseline: number;
  variant: number;
  delta: number;
  /** Relative change, null when baseline is 0. */
  percent: number | null;
  better: Better;
  /** 'improved' | 'worse' | 'unchanged' relative to `better`, with a 1 % dead-band. */
  verdict: 'improved' | 'worse' | 'unchanged';
  /** Direct simulation output vs model estimate. */
  kind: 'simulated' | 'estimate';
}

const METRICS: { key: string; label: string; unit: string; better: Better; kind: 'simulated' | 'estimate'; get: (s: SimulationSummary) => number }[] = [
  { key: 'meanTravelTime', label: 'Average travel time', unit: 's', better: 'lower', kind: 'simulated', get: (s) => s.meanTravelTime },
  { key: 'meanWaitTime', label: 'Average waiting time', unit: 's', better: 'lower', kind: 'simulated', get: (s) => s.meanWaitTime },
  { key: 'meanDelay', label: 'Average delay vs free flow', unit: 's', better: 'lower', kind: 'simulated', get: (s) => s.meanDelay },
  { key: 'p95TravelTime', label: '95th percentile travel time', unit: 's', better: 'lower', kind: 'simulated', get: (s) => s.p95TravelTime },
  { key: 'throughputPerHour', label: 'Trips completed per hour', unit: 'veh/h', better: 'higher', kind: 'simulated', get: (s) => s.throughputPerHour },
  { key: 'tripsCompleted', label: 'Trips completed', unit: 'trips', better: 'higher', kind: 'simulated', get: (s) => s.tripsCompleted },
  { key: 'meanStops', label: 'Stops per trip', unit: 'stops', better: 'lower', kind: 'simulated', get: (s) => s.meanStops },
  { key: 'maxQueue', label: 'Longest queue', unit: 'veh', better: 'lower', kind: 'simulated', get: (s) => s.maxQueue },
  { key: 'meanNetworkSpeed', label: 'Mean network speed', unit: 'm/s', better: 'higher', kind: 'simulated', get: (s) => s.meanNetworkSpeed },
  { key: 'vehiclesRemaining', label: 'Vehicles still in network at end', unit: 'veh', better: 'lower', kind: 'simulated', get: (s) => s.vehiclesRemaining },
  { key: 'fuelLitres', label: 'Fuel use (estimate)', unit: 'L', better: 'lower', kind: 'estimate', get: (s) => s.energy.fuelLitres },
  { key: 'co2Kg', label: 'CO₂ (estimate)', unit: 'kg', better: 'lower', kind: 'estimate', get: (s) => s.energy.co2Kg },
  { key: 'idleHours', label: 'Idling time (estimate)', unit: 'veh·h', better: 'lower', kind: 'estimate', get: (s) => s.energy.idleHours },
];

export function compareSummaries(baseline: SimulationSummary, variant: SimulationSummary): MetricDelta[] {
  return METRICS.map((m) => {
    const b = m.get(baseline);
    const v = m.get(variant);
    const delta = v - b;
    const percent = b !== 0 ? (delta / Math.abs(b)) * 100 : null;
    const magnitude = percent === null ? (delta === 0 ? 0 : 100) : Math.abs(percent);
    const good = m.better === 'lower' ? delta < 0 : delta > 0;
    const verdict = magnitude < 1 ? 'unchanged' : good ? 'improved' : 'worse';
    return { key: m.key, label: m.label, unit: m.unit, baseline: b, variant: v, delta, percent, better: m.better, verdict, kind: m.kind };
  });
}

export interface LinkDelta {
  linkId: string;
  baselineCongestion: number;
  variantCongestion: number;
  congestionDelta: number;
  baselineExited: number;
  variantExited: number;
  baselineMeanQueue: number;
  variantMeanQueue: number;
}

export function compareLinks(baseline: LinkResult[], variant: LinkResult[], top = 12): LinkDelta[] {
  const v = new Map(variant.map((l) => [l.linkId, l]));
  const rows: LinkDelta[] = [];
  for (const b of baseline) {
    const o = v.get(b.linkId);
    if (!o) continue;
    rows.push({
      linkId: b.linkId,
      baselineCongestion: b.congestion,
      variantCongestion: o.congestion,
      congestionDelta: o.congestion - b.congestion,
      baselineExited: b.exited,
      variantExited: o.exited,
      baselineMeanQueue: b.meanQueue,
      variantMeanQueue: o.meanQueue,
    });
  }
  return rows
    .sort((a, b) => Math.abs(b.congestionDelta) - Math.abs(a.congestionDelta) || (a.linkId < b.linkId ? -1 : 1))
    .slice(0, top);
}
