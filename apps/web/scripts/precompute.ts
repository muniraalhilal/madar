/**
 * Runs the real MADAR engine and freezes the results the landing page shows.
 * Nothing on the landing page is a hand-typed metric: every number comes from
 * this script (engine version, seed and fingerprints are included).
 *   pnpm --filter @madar/web precompute
 */
import { writeFileSync } from 'node:fs';
import {
  ENGINE_VERSION,
  RoadGraph,
  compareSummaries,
  generateCity,
  proposeSignalTimings,
  simulate,
  simulateCityEnergy,
} from '../../../packages/sim-engine/src/index';

const city = generateCity();
const graph = new RoadGraph(city);
const SEED = 42;
const base = { duration: 3600, seed: SEED, frameInterval: 0 };

const baseline = simulate(city, base);
const { overrides } = proposeSignalTimings(city, baseline.links, 3600);
const optimised = simulate(city, { ...base, signalOverrides: overrides });
const closureLinks = ['c3r2>c3r3', 'c3r3>c3r2'];
const closed = simulate(city, { ...base, closures: closureLinks.map((linkId) => ({ linkId, start: 300 })) });

const tff = (li: number) => graph.freeFlowTime(li);
const blocked = (li: number) => (closureLinks.includes(graph.link(li).id) ? Infinity : tff(li));
const o = graph.nodeIndex.get('c3r1')!;
const d = graph.nodeIndex.get('c3r4')!;
const routeBefore = graph.aStar(o, d, tff)!;
const routeAfter = graph.aStar(o, d, blocked)!;
const ids = (p: { links: number[] }) => p.links.map((li) => graph.link(li).id);

const congestion = (r: typeof baseline) => Object.fromEntries(r.links.map((l) => [l.linkId, Math.round(l.congestion * 1000) / 1000]));
const pick = (r: typeof baseline) => ({
  fingerprint: r.fingerprint,
  tripsCompleted: r.summary.tripsCompleted,
  meanTravelTime: r.summary.meanTravelTime,
  meanWaitTime: r.summary.meanWaitTime,
  meanDelay: r.summary.meanDelay,
  p95TravelTime: r.summary.p95TravelTime,
  throughputPerHour: r.summary.throughputPerHour,
  maxQueue: r.summary.maxQueue,
  reroutes: r.summary.reroutes,
  co2Kg: r.summary.energy.co2Kg,
  congestion: congestion(r),
  samples: r.samples.map((s) => ({ t: s.t, v: s.vehiclesInNetwork, q: s.queuedVehicles, tt: s.windowMeanTravelTime })),
});

const energy = simulateCityEnergy(city);
const energySaving = simulateCityEnergy(city, { setpointDelta: 1, lightingSaving: 0.3, occupancyScale: 1 });
const nodePos = new Map(city.nodes.map((n) => [n.id, n]));

const data = {
  engineVersion: ENGINE_VERSION,
  cityVersion: city.version,
  seed: SEED,
  generatedAt: new Date().toISOString().slice(0, 10),
  city: {
    nodes: city.nodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind, x: n.x, y: n.y, district: n.districtId })),
    links: city.links
      .filter((l) => l.from < l.to) // one geometry per two-way road
      .map((l) => {
        const a = nodePos.get(l.from)!;
        const b = nodePos.get(l.to)!;
        return { id: l.id, rev: `${l.to}>${l.from}`, name: l.name, cls: l.roadClass, lanes: l.lanes, pts: [[a.x, a.y], ...(l.shape ?? []).map((p) => [p.x, p.y]), [b.x, b.y]] };
      }),
    districts: city.districts.map((dd) => ({
      id: dd.id,
      name: dd.name,
      nameAr: dd.nameAr,
      color: dd.color,
      character: dd.character,
      boundary: dd.boundary.map((p) => [p.x, p.y]),
      buildings: city.buildings.filter((b) => b.districtId === dd.id).length,
      floorArea: Math.round(city.buildings.filter((b) => b.districtId === dd.id).reduce((s, b) => s + b.floorArea, 0)),
      signals: city.signals.filter((s) => nodePos.get(s.nodeId)?.districtId === dd.id).length,
    })),
    buildings: city.buildings.map((b) => ({ id: b.id, name: b.name, use: b.use, h: b.height, d: b.districtId, fp: b.footprint.map((p) => [p.x, p.y]) })),
    signals: city.signals.map((s) => s.nodeId),
    counts: { roads: city.links.length, intersections: city.nodes.filter((n) => n.kind !== 'gateway').length, signals: city.signals.length, buildings: city.buildings.length, districts: city.districts.length },
  },
  baseline: pick(baseline),
  optimised: { ...pick(optimised), signalsRetimed: overrides.length },
  optimisedDeltas: compareSummaries(baseline.summary, optimised.summary),
  closure: { ...pick(closed), links: closureLinks, deltas: compareSummaries(baseline.summary, closed.summary) },
  route: {
    from: 'Harbor Gate',
    to: 'Souq Gate',
    before: { links: ids(routeBefore), seconds: routeBefore.cost },
    after: { links: ids(routeAfter), seconds: routeAfter.cost },
  },
  energy: {
    hourlyKwh: energy.hourlyKwh.map((v) => Math.round(v)),
    savingHourlyKwh: energySaving.hourlyKwh.map((v) => Math.round(v)),
    dailyKwh: Math.round(energy.dailyKwh),
    savingDailyKwh: Math.round(energySaving.dailyKwh),
    peakKw: Math.round(energy.peakKw),
    peakHour: energy.peakHour,
    temperatureC: energy.temperatureC.map((t) => Math.round(t * 10) / 10),
    districts: energy.districts.map((x) => ({ id: x.districtId, dailyKwh: Math.round(x.dailyKwh), peakKw: Math.round(x.peakKw) })),
  },
};
writeFileSync(new URL('../src/data/landing.json', import.meta.url), JSON.stringify(data));
console.log('baseline', baseline.summary.meanTravelTime.toFixed(1), 'optimised', optimised.summary.meanTravelTime.toFixed(1), 'closure', closed.summary.meanTravelTime.toFixed(1));
console.log('route', routeBefore.cost.toFixed(0), '→', routeAfter.cost.toFixed(0), 's');
