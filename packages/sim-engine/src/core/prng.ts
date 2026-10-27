/**
 * Seeded pseudo-random number generation.
 *
 * The engine never calls Math.random(). Every stochastic decision draws from a
 * `Rng` created from the scenario seed, so a (network, scenario, seed, engine
 * version) tuple always produces the same output.
 *
 * Algorithm: sfc32 (Small Fast Counter, Chris Doty-Humphrey), seeded through
 * splitmix32 so that nearby seeds (1, 2, 3…) give uncorrelated streams.
 */

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new RangeError('Seed must be a finite number');
    const mix = splitmix32(Math.floor(seed));
    this.a = mix();
    this.b = mix();
    this.c = mix();
    this.d = mix();
    // Discard the first outputs; sfc32 needs a few rounds to diffuse the state.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError('max < min');
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Poisson-distributed count (Knuth for small λ, normal approximation above 30). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      // Box–Muller normal approximation, rounded and clamped.
      const u1 = Math.max(this.next(), 1e-12);
      const u2 = this.next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
    }
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  /** Index chosen with probability proportional to weights[i]. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) throw new RangeError('All weights are zero');
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i] ?? 0);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Independent child stream; lets subsystems draw without disturbing each other. */
  fork(label: number): Rng {
    return new Rng((this.nextUint32() ^ Math.imul(label + 1, 0x27d4eb2d)) >>> 0);
  }
}
