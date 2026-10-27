import { describe, expect, it } from 'vitest';
import { Rng, checksum, fingerprint, stableStringify } from '../src/index.js';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const xs = Array.from({ length: 50 }, () => a.next());
    const ys = Array.from({ length: 50 }, () => b.next());
    expect(xs).toEqual(ys);
  });

  it('produces different streams for neighbouring seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBe(0);
  });

  it('stays in [0, 1) with a plausible mean', () => {
    const r = new Rng(9);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeGreaterThan(0.49);
    expect(sum / 20000).toBeLessThan(0.51);
  });

  it('samples Poisson counts with the requested mean (small and large λ)', () => {
    const r = new Rng(77);
    for (const lambda of [0.4, 3, 45]) {
      let s = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) s += r.poisson(lambda);
      expect(Math.abs(s / n - lambda) / lambda).toBeLessThan(0.03);
    }
    expect(r.poisson(0)).toBe(0);
  });

  it('respects weights and rejects all-zero weights', () => {
    const r = new Rng(5);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[r.weightedIndex([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.7);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.3);
    expect(() => r.weightedIndex([0, 0])).toThrow();
  });

  it('rejects invalid seeds and ranges', () => {
    expect(() => new Rng(Number.NaN)).toThrow();
    expect(() => new Rng(1).int(5, 1)).toThrow();
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

describe('stable hashing', () => {
  it('ignores key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(fingerprint({ x: 1, y: 2 })).toBe(fingerprint({ y: 2, x: 1 }));
  });

  it('absorbs float noise below 12 significant digits', () => {
    expect(fingerprint({ v: 0.1 + 0.2 })).toBe(fingerprint({ v: 0.3 }));
  });

  it('is a fixed 64-bit digest', () => {
    expect(checksum('')).toBe('cbf29ce484222325');
    expect(checksum('madar')).toMatch(/^[0-9a-f]{16}$/);
    expect(checksum('madar')).not.toBe(checksum('Madar'));
  });
});
