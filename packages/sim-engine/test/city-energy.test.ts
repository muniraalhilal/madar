import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENERGY_SCENARIO,
  RoadGraph,
  compareSummaries,
  fingerprint,
  generateCity,
  simulateCityEnergy,
  validateSignalPlan,
  type SimulationSummary,
} from '../src/index.js';

describe('city generator', () => {
  const city = generateCity();

  it('is deterministic', () => {
    expect(fingerprint(generateCity())).toBe(fingerprint(city));
  });

  it('produces a valid, coherent network', () => {
    expect(RoadGraph.validate(city)).toEqual([]);
    expect(city.districts).toHaveLength(5);
    expect(city.nodes.length).toBeGreaterThan(40);
    expect(city.signals.length).toBeGreaterThan(10);
    for (const z of city.zones) expect(z.nodes.length).toBeGreaterThan(0);
  });

  it('every generated signal plan is valid for its junction', () => {
    for (const plan of city.signals) {
      const incoming = new Set(city.links.filter((l) => l.to === plan.nodeId).map((l) => l.id));
      expect(validateSignalPlan(plan, incoming)).toEqual([]);
    }
  });

  it('places buildings with positive dimensions inside known districts', () => {
    const ids = new Set(city.districts.map((d) => d.id));
    for (const b of city.buildings) {
      expect(ids.has(b.districtId)).toBe(true);
      expect(b.height).toBeGreaterThan(0);
      expect(b.floorArea).toBeGreaterThan(0);
    }
  });
});

describe('building energy model', () => {
  const city = generateCity();
  const base = simulateCityEnergy(city);

  it('is deterministic and sums districts to the city total', () => {
    expect(fingerprint(simulateCityEnergy(city))).toBe(fingerprint(base));
    const sum = base.districts.reduce((s, d) => s + d.dailyKwh, 0);
    expect(sum).toBeCloseTo(base.dailyKwh, 3);
  });

  it('a warmer cooling setpoint and lighting upgrades reduce consumption', () => {
    expect(simulateCityEnergy(city, { ...DEFAULT_ENERGY_SCENARIO, setpointDelta: 2 }).dailyKwh).toBeLessThan(base.dailyKwh);
    expect(simulateCityEnergy(city, { ...DEFAULT_ENERGY_SCENARIO, lightingSaving: 0.4 }).dailyKwh).toBeLessThan(base.dailyKwh);
  });

  it('peaks during the hot afternoon for this office-heavy city', () => {
    expect(base.peakHour).toBeGreaterThanOrEqual(11);
    expect(base.peakHour).toBeLessThanOrEqual(17);
  });

  it('rejects out-of-range scenarios', () => {
    expect(() => simulateCityEnergy(city, { setpointDelta: 9, lightingSaving: 0, occupancyScale: 1 })).toThrow(/setpointDelta/);
  });
});

describe('comparison', () => {
  const s = (p: Partial<SimulationSummary>): SimulationSummary => ({
    engineVersion: '1', seed: 1, duration: 3600, tripsGenerated: 100, tripsCompleted: 100, tripsStranded: 0,
    vehiclesRemaining: 0, meanTravelTime: 200, meanWaitTime: 50, meanDelay: 60, p95TravelTime: 400, meanStops: 2,
    throughputPerHour: 100, vehicleKm: 100, maxQueue: 10, meanNetworkSpeed: 10, reroutes: 0,
    energy: { fuelLitres: 10, evKwh: 1, co2Kg: 23, idleHours: 1, assumptions: {} },
    ...p,
  });

  it('labels direction-aware verdicts with a 1 % dead-band', () => {
    const d = compareSummaries(s({}), s({ meanTravelTime: 180, throughputPerHour: 90, meanWaitTime: 50.2 }));
    expect(d.find((x) => x.key === 'meanTravelTime')!.verdict).toBe('improved');
    expect(d.find((x) => x.key === 'throughputPerHour')!.verdict).toBe('worse');
    expect(d.find((x) => x.key === 'meanWaitTime')!.verdict).toBe('unchanged');
    expect(d.find((x) => x.key === 'co2Kg')!.kind).toBe('estimate');
  });
});
