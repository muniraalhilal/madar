import { describe, expect, it } from 'vitest';
import {
  applySignalOverride,
  cycleLength,
  effectiveGreenRatio,
  signalStateAt,
  validateSignalPlan,
  websterTiming,
  type SignalPlan,
} from '../src/index.js';

const plan: SignalPlan = {
  nodeId: 'S',
  offset: 0,
  phases: [
    { name: 'NS', approaches: ['n', 's'], green: 30, yellow: 3, allRed: 2 },
    { name: 'EW', approaches: ['e', 'w'], green: 20, yellow: 3, allRed: 2 },
  ],
};

describe('signal timing', () => {
  it('computes the cycle length', () => {
    expect(cycleLength(plan)).toBe(60);
  });

  it('walks through green → yellow → all-red for each phase', () => {
    expect(signalStateAt(plan, 0)).toMatchObject({ phaseIndex: 0, aspect: 'green', discharging: false });
    expect(signalStateAt(plan, 2)).toMatchObject({ phaseIndex: 0, aspect: 'green', discharging: true });
    expect(signalStateAt(plan, 31)).toMatchObject({ phaseIndex: 0, aspect: 'yellow', discharging: true });
    expect(signalStateAt(plan, 34)).toMatchObject({ phaseIndex: 0, aspect: 'allRed', discharging: false });
    expect(signalStateAt(plan, 35)).toMatchObject({ phaseIndex: 1, aspect: 'green' });
    expect(signalStateAt(plan, 60)).toMatchObject({ phaseIndex: 0, aspect: 'green' });
  });

  it('applies offsets (including negative time) cyclically', () => {
    const shifted = { ...plan, offset: 35 };
    expect(signalStateAt(shifted, 35).phaseIndex).toBe(0);
    expect(signalStateAt(shifted, 10).phaseIndex).toBe(1); // local time 35 s
    expect(signalStateAt(plan, -25).phaseIndex).toBe(1);
  });

  it('effective green ratio = (green + yellow − lost time) / cycle', () => {
    expect(effectiveGreenRatio(plan, 'n')).toBeCloseTo(31 / 60);
    expect(effectiveGreenRatio(plan, 'e')).toBeCloseTo(21 / 60);
    expect(effectiveGreenRatio(plan, 'unknown')).toBe(0);
  });

  it('validates bounds and coverage of approaches', () => {
    expect(validateSignalPlan(plan, new Set(['n', 's', 'e', 'w']))).toEqual([]);
    const bad: SignalPlan = { ...plan, phases: [{ ...plan.phases[0]!, green: 2, yellow: 9 }] };
    const issues = validateSignalPlan(bad, new Set(['n', 's', 'e', 'w']));
    expect(issues.join()).toMatch(/at least two phases/);
    expect(issues.join()).toMatch(/green must be/);
    expect(issues.join()).toMatch(/yellow must be/);
    expect(issues.join()).toMatch(/never receives green/);
  });

  it('overrides replace greens and reject mismatched phase counts', () => {
    const o = applySignalOverride(plan, { nodeId: 'S', greens: [40, 15], offset: 7 });
    expect(o.phases.map((p) => p.green)).toEqual([40, 15]);
    expect(o.offset).toBe(7);
    expect(plan.phases[0]!.green).toBe(30); // original untouched
    expect(() => applySignalOverride(plan, { nodeId: 'S', greens: [40] })).toThrow(/2 phases/);
  });
});

describe('Webster optimisation', () => {
  const sat = { n: 3600, s: 3600, e: 3600, w: 3600 };

  it('gives more green to the phase with the higher critical flow ratio', () => {
    const w = websterTiming(plan, { n: 1400, s: 900, e: 500, w: 450 }, sat);
    expect(w.greens[0]!).toBeGreaterThan(w.greens[1]!);
    expect(w.criticalRatios[0]).toBeCloseTo(1400 / 3600);
    expect(w.oversaturated).toBe(false);
    // Resulting cycle stays consistent with the formula after rounding.
    const displayed = w.greens.reduce((s, g, i) => s + g + plan.phases[i]!.yellow + plan.phases[i]!.allRed, 0);
    expect(Math.abs(displayed - w.cycle)).toBeLessThanOrEqual(2);
  });

  it('uses the maximum cycle when the junction is oversaturated', () => {
    const w = websterTiming(plan, { n: 2400, e: 1800 }, sat, { maxCycle: 150 });
    expect(w.oversaturated).toBe(true);
    expect(w.cycle).toBe(150);
  });

  it('respects the minimum cycle for light traffic', () => {
    const w = websterTiming(plan, { n: 10, e: 10 }, sat, { minCycle: 40 });
    expect(w.cycle).toBe(40);
    w.greens.forEach((g) => expect(g).toBeGreaterThanOrEqual(7));
  });
});
