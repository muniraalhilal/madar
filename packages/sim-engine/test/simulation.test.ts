import { describe, expect, it } from 'vitest';
import {
  ScenarioValidationError,
  TrafficSimulation,
  compareSummaries,
  decodeFrames,
  encodeFrames,
  generateCity,
  proposeSignalTimings,
  simulate,
  validateScenario,
  type CityNetwork,
  type Frame,
} from '../src/index.js';
import { tinyNetwork } from './helpers.js';

const city = generateCity();
const SHORT = { duration: 900, frameInterval: 0 };

/** Two crossing corridors through one signal S; all ends are gateways. */
function crossroads(greens: [number, number], demand = 1800): CityNetwork {
  const net = tinyNetwork(
    [
      ['S', 0, 0, 'signal'],
      ['W', -400, 0, 'gateway'],
      ['E', 400, 0, 'gateway'],
      ['N', 0, 400, 'gateway'],
      ['So', 0, -400, 'gateway'],
    ],
    [
      ['W', 'S', 400],
      ['S', 'E', 400],
      ['E', 'S', 400],
      ['S', 'W', 400],
      ['N', 'S', 400],
      ['S', 'So', 400],
      ['So', 'S', 400],
      ['S', 'N', 400],
    ],
    {
      baseDemandVehPerHour: demand,
      zones: [
        { id: 'w', name: 'w', nodes: ['W'], production: 1, attraction: 0 },
        { id: 'e', name: 'e', nodes: ['E'], production: 0, attraction: 1 },
        { id: 'n', name: 'n', nodes: ['N'], production: 1, attraction: 0 },
        { id: 's', name: 's', nodes: ['So'], production: 0, attraction: 1 },
      ],
    },
  );
  net.signals = [
    {
      nodeId: 'S',
      offset: 0,
      phases: [
        { name: 'EW', approaches: ['W>S', 'E>S'], green: greens[0], yellow: 3, allRed: 2 },
        { name: 'NS', approaches: ['N>S', 'So>S'], green: greens[1], yellow: 3, allRed: 2 },
      ],
    },
  ];
  return net;
}

describe('scenario validation', () => {
  it('accepts the defaults', () => {
    expect(validateScenario(city, { ...new TrafficSimulation(city, SHORT).params })).toEqual([]);
  });

  it('reports every invalid field', () => {
    expect(() =>
      new TrafficSimulation(city, {
        duration: 10,
        demandMultiplier: 9,
        closures: [{ linkId: 'nope', start: 5 }],
        incidents: [{ id: 'x', linkId: 'c3r2>c3r3', start: 0, duration: 60, severity: 1.5, kind: 'collision' }],
        signalOverrides: [{ nodeId: 'c3r3', greens: [30] }, { nodeId: 'g-west', greens: [30, 30] }],
      }),
    ).toThrowError(ScenarioValidationError);
    try {
      new TrafficSimulation(city, { duration: 10, closures: [{ linkId: 'nope', start: 5 }] });
    } catch (e) {
      const msg = (e as ScenarioValidationError).issues.join('|');
      expect(msg).toMatch(/duration/);
      expect(msg).toMatch(/unknown link nope/);
    }
  });
});

describe('determinism', () => {
  it('produces identical fingerprints for identical inputs', () => {
    const a = simulate(city, { ...SHORT, seed: 11 });
    const b = simulate(city, { ...SHORT, seed: 11 });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
    expect(a.summary).toEqual(b.summary);
  });

  it('changes when the seed changes', () => {
    const a = simulate(city, { ...SHORT, seed: 11 });
    const b = simulate(city, { ...SHORT, seed: 12 });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.inputFingerprint).not.toBe(b.inputFingerprint);
  });

  it('is independent of chunk size used to advance the clock', () => {
    const a = new TrafficSimulation(city, { ...SHORT, seed: 4 }).run({}, 1);
    const b = new TrafficSimulation(city, { ...SHORT, seed: 4 }).run({}, 300);
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('conservation and invariants', () => {
  it('every generated trip is completed, stranded or still in the network', () => {
    for (const p of [{}, { closures: [{ linkId: 'c3r2>c3r3', start: 120 }] }, { demandMultiplier: 1.6 }]) {
      const s = simulate(city, { ...SHORT, ...p }).summary;
      expect(s.tripsCompleted + s.tripsStranded + s.vehiclesRemaining).toBe(s.tripsGenerated);
    }
  });

  it('never exceeds link storage capacity', () => {
    const sim = new TrafficSimulation(city, { ...SHORT, demandMultiplier: 2.5 });
    const storage = city.links.map((l) => Math.max(2, Math.floor((l.lanes * l.length) / 7.5)));
    while (!sim.done) {
      sim.advance(sim.t + 30);
      const state = sim.linkState();
      for (let i = 0; i < city.links.length; i++) expect(state[i * 3]!).toBeLessThanOrEqual(storage[i]!);
    }
  });

  it('generates no trips at zero demand', () => {
    const s = simulate(city, { ...SHORT, demandMultiplier: 0 }).summary;
    expect(s.tripsGenerated).toBe(0);
    expect(s.meanTravelTime).toBe(0);
  });

  it('mean travel time is never below free-flow time', () => {
    const r = simulate(city, SHORT);
    expect(r.summary.meanDelay).toBeGreaterThanOrEqual(0);
    for (const l of r.links) {
      const link = city.links.find((x) => x.id === l.linkId)!;
      if (l.meanTravelTime !== null) expect(l.meanTravelTime).toBeGreaterThanOrEqual(Math.floor(link.length / link.speedLimit) - 1);
    }
  });
});

describe('signals in the simulation', () => {
  it('an approach that gets more green carries more traffic with less delay', () => {
    const favourEW = simulate(crossroads([50, 10]), { ...SHORT, seed: 1 });
    const favourNS = simulate(crossroads([10, 50]), { ...SHORT, seed: 1 });
    const ew = (r: typeof favourEW) => r.links.find((l) => l.linkId === 'W>S')!;
    expect(ew(favourEW).meanQueue).toBeLessThan(ew(favourNS).meanQueue);
    expect(ew(favourEW).meanTravelTime!).toBeLessThan(ew(favourNS).meanTravelTime!);
  });

  it('queues discharge no faster than saturation flow during green', () => {
    const net = crossroads([30, 30], 3600);
    const r = simulate(net, { duration: 1800, frameInterval: 0, seed: 2 });
    const ew = r.links.find((l) => l.linkId === 'W>S')!;
    // Max possible: 1 lane × 1800 veh/h × effective-green share (31/70) × 0.5 h.
    expect(ew.exited).toBeLessThanOrEqual(Math.ceil(1800 * (31 / 70) * 0.5) + 2);
  });

  it('Webster timings derived from a baseline reduce delay in the city', () => {
    const base = simulate(city, { duration: 1800, frameInterval: 0 });
    const { overrides } = proposeSignalTimings(city, base.links, 1800);
    const tuned = simulate(city, { duration: 1800, frameInterval: 0, signalOverrides: overrides });
    const delta = compareSummaries(base.summary, tuned.summary).find((d) => d.key === 'meanDelay')!;
    expect(delta.verdict).toBe('improved');
  });
});

describe('closures, incidents and re-routing', () => {
  const closure = [
    { linkId: 'c3r2>c3r3', start: 0 },
    { linkId: 'c3r3>c3r2', start: 0 },
  ];

  it('a closed link admits no vehicles', () => {
    const r = simulate(city, { ...SHORT, closures: closure });
    expect(r.links.find((l) => l.linkId === 'c3r2>c3r3')!.entered).toBe(0);
    expect(r.events.some((e) => e.type === 'closure_started')).toBe(true);
  });

  it('vehicles already en route re-plan around a mid-run closure', () => {
    const late = closure.map((c) => ({ ...c, start: 300 }));
    const withRerouting = simulate(city, { ...SHORT, closures: late, rerouting: true });
    const without = simulate(city, { ...SHORT, closures: late, rerouting: false });
    expect(withRerouting.summary.reroutes).toBeGreaterThan(0);
    expect(without.summary.reroutes).toBe(0);
    expect(withRerouting.summary.tripsCompleted).toBeGreaterThan(without.summary.tripsCompleted);
  });

  it('a severe incident lowers the affected link throughput, then clears', () => {
    const base = simulate(city, SHORT);
    const inc = simulate(city, {
      ...SHORT,
      incidents: [{ id: 'i1', linkId: 'c2r2>c3r2', start: 60, duration: 600, severity: 0.8, kind: 'collision' }],
    });
    const link = (r: typeof base) => r.links.find((l) => l.linkId === 'c2r2>c3r2')!;
    expect(link(inc).exited).toBeLessThan(link(base).exited);
    expect(inc.events.map((e) => e.type)).toEqual(expect.arrayContaining(['incident_started', 'incident_cleared']));
  });

  it('closures can end and the link reopens', () => {
    const r = simulate(city, { ...SHORT, closures: [{ linkId: 'c3r2>c3r3', start: 0, end: 300 }] });
    expect(r.events.some((e) => e.type === 'closure_ended')).toBe(true);
    expect(r.links.find((l) => l.linkId === 'c3r2>c3r3')!.entered).toBeGreaterThan(0);
  });
});

describe('playback frames', () => {
  it('captures bounded frames that survive a binary round-trip', () => {
    const frames: Frame[] = [];
    simulate(city, { duration: 300, frameInterval: 10, maxFrameVehicles: 200 }, { onFrame: (f) => frames.push(f) });
    expect(frames).toHaveLength(30);
    for (const f of frames) expect(f.count).toBeLessThanOrEqual(400); // stride sampling keeps it near the cap
    const decoded = decodeFrames(encodeFrames(frames, city.links.length));
    expect(decoded.linkCount).toBe(city.links.length);
    expect(decoded.frames.map((f) => f.t)).toEqual(frames.map((f) => f.t));
    expect(Array.from(decoded.frames[20]!.data)).toEqual(Array.from(frames[20]!.data));
  });

  it('rejects corrupt playback buffers', () => {
    expect(() => decodeFrames(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
