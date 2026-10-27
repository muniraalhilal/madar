import type { CityNetwork, NetworkLink, NetworkNode } from './types.js';

/**
 * Directed road graph with indexed adjacency and shortest-path search.
 *
 * Nodes and links are addressed by dense integer indices internally so the
 * simulation's hot loops use typed arrays instead of string maps.
 */

export interface PathResult {
  /** Link indices from origin to destination. Empty when origin === destination. */
  links: number[];
  cost: number;
  /** Nodes expanded — used by tests to show A* explores less than Dijkstra. */
  expanded: number;
}

export type CostFn = (linkIndex: number) => number;

export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.vals.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      // Ties broken by value so pops are fully deterministic.
      if (this.less(i, p)) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }

  pop(): { key: number; value: number } | undefined {
    const n = this.keys.length;
    if (n === 0) return undefined;
    const key = this.keys[0] as number;
    const value = this.vals[0] as number;
    const lastK = this.keys.pop() as number;
    const lastV = this.vals.pop() as number;
    if (n > 1) {
      this.keys[0] = lastK;
      this.vals[0] = lastV;
      let i = 0;
      const len = this.keys.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < len && this.less(l, m)) m = l;
        if (r < len && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return { key, value };
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a] as number;
    const kb = this.keys[b] as number;
    return ka < kb || (ka === kb && (this.vals[a] as number) < (this.vals[b] as number));
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b] as number, this.keys[a] as number];
    [this.vals[a], this.vals[b]] = [this.vals[b] as number, this.vals[a] as number];
  }
}

export class GraphValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid road network: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? '…' : ''}`);
    this.name = 'GraphValidationError';
  }
}

export class RoadGraph {
  readonly nodes: readonly NetworkNode[];
  readonly links: readonly NetworkLink[];
  readonly nodeIndex = new Map<string, number>();
  readonly linkIndex = new Map<string, number>();
  readonly linkFrom: Int32Array;
  readonly linkTo: Int32Array;
  /** Outgoing link indices per node, sorted by link id for determinism. */
  readonly outgoing: number[][];
  readonly incoming: number[][];
  readonly maxSpeed: number;

  constructor(network: Pick<CityNetwork, 'nodes' | 'links'>) {
    const issues = RoadGraph.validate(network);
    if (issues.length) throw new GraphValidationError(issues);
    this.nodes = network.nodes;
    this.links = network.links;
    network.nodes.forEach((n, i) => this.nodeIndex.set(n.id, i));
    network.links.forEach((l, i) => this.linkIndex.set(l.id, i));
    this.linkFrom = new Int32Array(network.links.length);
    this.linkTo = new Int32Array(network.links.length);
    this.outgoing = network.nodes.map(() => []);
    this.incoming = network.nodes.map(() => []);
    let maxSpeed = 0;
    network.links.forEach((l, i) => {
      const f = this.nodeIndex.get(l.from) as number;
      const t = this.nodeIndex.get(l.to) as number;
      this.linkFrom[i] = f;
      this.linkTo[i] = t;
      (this.outgoing[f] as number[]).push(i);
      (this.incoming[t] as number[]).push(i);
      maxSpeed = Math.max(maxSpeed, l.speedLimit);
    });
    const byId = (a: number, b: number) =>
      (network.links[a] as NetworkLink).id < (network.links[b] as NetworkLink).id ? -1 : 1;
    this.outgoing.forEach((list) => list.sort(byId));
    this.incoming.forEach((list) => list.sort(byId));
    this.maxSpeed = maxSpeed;
  }

  static validate(network: Pick<CityNetwork, 'nodes' | 'links'>): string[] {
    const issues: string[] = [];
    const nodeIds = new Set<string>();
    for (const n of network.nodes) {
      if (nodeIds.has(n.id)) issues.push(`duplicate node id ${n.id}`);
      nodeIds.add(n.id);
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) issues.push(`node ${n.id} has invalid coordinates`);
    }
    const linkIds = new Set<string>();
    const pos = new Map(network.nodes.map((n) => [n.id, n] as const));
    for (const l of network.links) {
      const a = pos.get(l.from);
      const b = pos.get(l.to);
      // A link can never be shorter than the straight line between its ends;
      // the A* heuristic's admissibility depends on this.
      if (a && b && l.length + 1e-6 < Math.hypot(a.x - b.x, a.y - b.y)) {
        issues.push(`link ${l.id} is shorter than the distance between its endpoints`);
      }
      if (linkIds.has(l.id)) issues.push(`duplicate link id ${l.id}`);
      linkIds.add(l.id);
      if (!nodeIds.has(l.from)) issues.push(`link ${l.id} starts at unknown node ${l.from}`);
      if (!nodeIds.has(l.to)) issues.push(`link ${l.id} ends at unknown node ${l.to}`);
      if (l.from === l.to) issues.push(`link ${l.id} is a self-loop`);
      if (!(l.length > 0)) issues.push(`link ${l.id} must have positive length`);
      if (!(l.lanes >= 1) || !Number.isInteger(l.lanes)) issues.push(`link ${l.id} must have ≥1 whole lanes`);
      if (!(l.speedLimit > 0)) issues.push(`link ${l.id} must have positive speed`);
      if (!(l.saturationFlow > 0)) issues.push(`link ${l.id} must have positive saturation flow`);
    }
    return issues;
  }

  node(index: number): NetworkNode {
    return this.nodes[index] as NetworkNode;
  }

  link(index: number): NetworkLink {
    return this.links[index] as NetworkLink;
  }

  freeFlowTime(linkIndex: number): number {
    const l = this.link(linkIndex);
    return l.length / l.speedLimit;
  }

  /** Straight-line distance between two nodes, metres. */
  distance(a: number, b: number): number {
    const na = this.node(a);
    const nb = this.node(b);
    return Math.hypot(na.x - nb.x, na.y - nb.y);
  }

  /**
   * A* search. The heuristic (euclidean distance / fastest speed in the network)
   * never overestimates travel time as long as `cost(link) ≥ length / speedLimit`,
   * which holds for every cost function the simulation uses — so results are optimal.
   * Links with non-finite cost are treated as impassable.
   */
  aStar(origin: number, destination: number, cost: CostFn, useHeuristic = true): PathResult | null {
    const n = this.nodes.length;
    if (origin < 0 || origin >= n || destination < 0 || destination >= n) {
      throw new RangeError('Node index out of range');
    }
    if (origin === destination) return { links: [], cost: 0, expanded: 0 };
    const g = new Float64Array(n).fill(Infinity);
    const via = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i: number) => (useHeuristic ? this.distance(i, destination) / this.maxSpeed : 0);
    g[origin] = 0;
    heap.push(h(origin), origin);
    let expanded = 0;
    while (heap.size) {
      const { value: u } = heap.pop() as { key: number; value: number };
      if (closed[u]) continue;
      closed[u] = 1;
      expanded++;
      if (u === destination) break;
      for (const li of this.outgoing[u] as number[]) {
        const c = cost(li);
        if (!Number.isFinite(c) || c < 0) continue;
        const v = this.linkTo[li] as number;
        const alt = (g[u] as number) + c;
        if (alt < (g[v] as number)) {
          g[v] = alt;
          via[v] = li;
          heap.push(alt + h(v), v);
        }
      }
    }
    if (!Number.isFinite(g[destination] as number)) return null;
    const path: number[] = [];
    let cur = destination;
    while (cur !== origin) {
      const li = via[cur] as number;
      path.push(li);
      cur = this.linkFrom[li] as number;
    }
    path.reverse();
    return { links: path, cost: g[destination] as number, expanded };
  }

  dijkstra(origin: number, destination: number, cost: CostFn): PathResult | null {
    return this.aStar(origin, destination, cost, false);
  }

  /** Nodes reachable from `origin` following link direction (ignores closures). */
  reachableFrom(origin: number, passable: (li: number) => boolean = () => true): Set<number> {
    const seen = new Set<number>([origin]);
    const stack = [origin];
    while (stack.length) {
      const u = stack.pop() as number;
      for (const li of this.outgoing[u] as number[]) {
        if (!passable(li)) continue;
        const v = this.linkTo[li] as number;
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return seen;
  }

  /** True when every node can reach every other node (strong connectivity). */
  isStronglyConnected(): boolean {
    if (this.nodes.length === 0) return true;
    if (this.reachableFrom(0).size !== this.nodes.length) return false;
    // Reverse reachability.
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const u = stack.pop() as number;
      for (const li of this.incoming[u] as number[]) {
        const v = this.linkFrom[li] as number;
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return seen.size === this.nodes.length;
  }

  /** Polyline for a link including endpoints. */
  linkPolyline(linkIndex: number): { x: number; y: number }[] {
    const l = this.link(linkIndex);
    const a = this.node(this.linkFrom[linkIndex] as number);
    const b = this.node(this.linkTo[linkIndex] as number);
    return [{ x: a.x, y: a.y }, ...(l.shape ?? []), { x: b.x, y: b.y }];
  }
}
