import { describe, expect, it } from 'vitest';
import { GraphValidationError, MinHeap, Rng, RoadGraph, generateCity } from '../src/index.js';
import { tinyNetwork } from './helpers.js';

const diamond = tinyNetwork(
  [
    ['A', 0, 0],
    ['B', 100, 100],
    ['C', 100, -100],
    ['D', 200, 0],
  ],
  [
    ['A', 'B', 150],
    ['B', 'D', 150],
    ['A', 'C', 145],
    ['C', 'D', 145],
    ['B', 'C', 200],
  ],
);

describe('MinHeap', () => {
  it('pops keys in ascending order with deterministic ties', () => {
    const h = new MinHeap();
    [5, 1, 4, 1, 3].forEach((k, i) => h.push(k, i));
    const out: [number, number][] = [];
    while (h.size) {
      const { key, value } = h.pop()!;
      out.push([key, value]);
    }
    expect(out).toEqual([
      [1, 1],
      [1, 3],
      [3, 4],
      [4, 2],
      [5, 0],
    ]);
  });
});

describe('RoadGraph validation', () => {
  it('rejects unknown endpoints, self-loops, bad lengths and duplicates', () => {
    const bad = tinyNetwork(
      [
        ['A', 0, 0],
        ['B', 100, 0],
      ],
      [
        ['A', 'Z', 100],
        ['A', 'A', 10],
        ['A', 'B', 50],
        ['A', 'B', 100],
      ],
    );
    try {
      new RoadGraph(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GraphValidationError);
      const issues = (e as GraphValidationError).issues.join('\n');
      expect(issues).toMatch(/unknown node Z/);
      expect(issues).toMatch(/self-loop/);
      expect(issues).toMatch(/shorter than the distance/);
      expect(issues).toMatch(/duplicate link id/);
    }
  });
});

describe('shortest paths', () => {
  const g = new RoadGraph(diamond);
  const len = (li: number) => g.link(li).length;
  const idx = (id: string) => g.nodeIndex.get(id)!;

  it('finds the cheapest route', () => {
    const p = g.dijkstra(idx('A'), idx('D'), len)!;
    expect(p.links.map((i) => g.link(i).id)).toEqual(['A>C', 'C>D']);
    expect(p.cost).toBe(290);
  });

  it('follows link direction', () => {
    expect(g.dijkstra(idx('D'), idx('A'), len)).toBeNull();
  });

  it('treats infinite cost as impassable and re-routes', () => {
    const blocked = (li: number) => (g.link(li).id === 'C>D' ? Infinity : len(li));
    const p = g.aStar(idx('A'), idx('D'), blocked)!;
    expect(p.links.map((i) => g.link(i).id)).toEqual(['A>B', 'B>D']);
  });

  it('returns an empty path from a node to itself', () => {
    expect(g.aStar(idx('A'), idx('A'), len)).toEqual({ links: [], cost: 0, expanded: 0 });
  });

  it('A* matches Dijkstra on the city network and expands fewer nodes', () => {
    const city = generateCity();
    const cg = new RoadGraph(city);
    const tff = (li: number) => cg.freeFlowTime(li);
    const rng = new Rng(3);
    let aExpanded = 0;
    let dExpanded = 0;
    for (let i = 0; i < 200; i++) {
      const o = rng.int(0, cg.nodes.length - 1);
      const d = rng.int(0, cg.nodes.length - 1);
      const a = cg.aStar(o, d, tff)!;
      const dj = cg.dijkstra(o, d, tff)!;
      expect(a.cost).toBeCloseTo(dj.cost, 9);
      aExpanded += a.expanded;
      dExpanded += dj.expanded;
    }
    expect(aExpanded).toBeLessThan(dExpanded);
  });

  it('city network is strongly connected', () => {
    expect(new RoadGraph(generateCity()).isStronglyConnected()).toBe(true);
    expect(new RoadGraph(diamond).isStronglyConnected()).toBe(false);
  });
});
