import { RoadGraph, type CostFn } from '../core/graph.js';
import { fingerprint } from '../core/hash.js';
import { Rng } from '../core/prng.js';
import type {
  CityNetwork,
  EnergyEstimate,
  Frame,
  IntersectionResult,
  LinkResult,
  MetricSample,
  ProgressInfo,
  ScenarioParams,
  SignalPlan,
  SimulationEvent,
  SimulationResult,
  SimulationSummary,
} from '../core/types.js';
import { ENGINE_VERSION } from '../version.js';
import { buildDemand, demandProfile, type DemandModel } from './demand.js';
import { applySignalOverride, effectiveGreenRatio, signalStateAt, validateSignalPlan } from './signals.js';

/**
 * MADAR traffic model — a mesoscopic link-queue simulation.
 *
 *  • The network is a directed graph. Each link has a running section and a
 *    FIFO queue at its downstream stop line. Storage is finite
 *    (lanes × length / 7.5 m), so full links block upstream discharge (spillback).
 *  • Running vehicles travel at a density-dependent speed (Greenshields:
 *    v = v_f · (1 − k / k_jam)), bounded below to avoid numerical standstill.
 *  • Queues discharge at the saturation flow (veh/h/lane) only while the node
 *    serves that approach: effective green at signals, a reduced gap-acceptance
 *    rate at priority junctions, unlimited at gateways.
 *  • Trips come from a gravity-model OD matrix with Poisson arrivals. Routes are
 *    chosen with A* on current, congestion-aware link costs at departure, and
 *    re-planned at the next junction if a link ahead is closed or blocked by an
 *    incident.
 *  • Time advances in fixed 1-second steps. All randomness comes from a seeded
 *    PRNG and every loop iterates in index order, so runs are reproducible.
 *
 * Simplifications are deliberate and documented in docs/simulation-model.md:
 * no lane changing, no turning-movement conflicts inside a junction, no
 * pedestrians, uniform vehicle class.
 */

export const DEFAULT_PARAMS: ScenarioParams = {
  duration: 3600,
  seed: 42,
  demandMultiplier: 1,
  startHour: 7,
  signalOverrides: [],
  closures: [],
  incidents: [],
  rerouting: true,
  sampleInterval: 60,
  frameInterval: 4,
  maxFrameVehicles: 1000,
};

const VEHICLE_SPACING = 7.5; // m per queued vehicle per lane (jam spacing)
const MIN_SPEED_FRACTION = 0.08;
const PRIORITY_CAPACITY_FACTOR = 0.55;
const STOPPED_SPEED = 1; // m/s
const ROUTE_ABANDON_FACTOR = 0.85; // accept a new route if ≥15 % faster

interface Vehicle {
  id: number;
  origin: number;
  destination: number;
  route: number[];
  routePos: number;
  link: number; // -1 while waiting to depart
  pos: number;
  queued: boolean;
  queuedAt: number;
  speed: number;
  requestedAt: number;
  enteredAt: number;
  linkEnteredAt: number;
  waitTime: number;
  stops: number;
  distance: number;
  freeFlowTime: number;
  idleSeconds: number;
  reroutes: number;
  /** Route position at which the incident-avoidance check last ran. */
  checkedAt: number;
}

interface CompletedTrip {
  travelTime: number;
  waitTime: number;
  delay: number;
  stops: number;
  distance: number;
}

/** Double-ended FIFO over an array with a moving head — O(1) shift without reallocation. */
class Fifo<T> {
  private items: T[] = [];
  private head = 0;
  get length(): number {
    return this.items.length - this.head;
  }
  push(v: T): void {
    this.items.push(v);
  }
  peek(): T | undefined {
    return this.items[this.head];
  }
  at(i: number): T | undefined {
    return this.items[this.head + i];
  }
  shift(): T | undefined {
    const v = this.items[this.head];
    if (v === undefined) return undefined;
    this.head++;
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return v;
  }
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = this.head; i < this.items.length; i++) yield this.items[i] as T;
  }
  toArray(): T[] {
    return this.items.slice(this.head);
  }
}

export class ScenarioValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid scenario: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? '…' : ''}`);
    this.name = 'ScenarioValidationError';
  }
}

export function validateScenario(network: CityNetwork, params: ScenarioParams): string[] {
  const issues: string[] = [];
  const linkIds = new Set(network.links.map((l) => l.id));
  const signalNodes = new Map(network.signals.map((s) => [s.nodeId, s]));
  if (!(params.duration >= 60 && params.duration <= 4 * 3600)) issues.push('duration must be 60–14400 s');
  if (!Number.isInteger(params.seed) || params.seed < 0) issues.push('seed must be a non-negative integer');
  if (!(params.demandMultiplier >= 0 && params.demandMultiplier <= 4)) issues.push('demandMultiplier must be 0–4');
  if (!(params.startHour >= 0 && params.startHour < 24)) issues.push('startHour must be 0–23');
  if (!(params.sampleInterval >= 10)) issues.push('sampleInterval must be ≥ 10 s');
  if (params.frameInterval < 0) issues.push('frameInterval must be ≥ 0');
  for (const c of params.closures) {
    if (!linkIds.has(c.linkId)) issues.push(`closure references unknown link ${c.linkId}`);
    if (c.start < 0 || (c.end !== undefined && c.end <= c.start)) issues.push(`closure on ${c.linkId} has invalid time window`);
  }
  const incidentIds = new Set<string>();
  for (const i of params.incidents) {
    if (incidentIds.has(i.id)) issues.push(`duplicate incident id ${i.id}`);
    incidentIds.add(i.id);
    if (!linkIds.has(i.linkId)) issues.push(`incident ${i.id} references unknown link ${i.linkId}`);
    if (!(i.severity > 0 && i.severity <= 1)) issues.push(`incident ${i.id} severity must be in (0, 1]`);
    if (!(i.duration > 0) || i.start < 0) issues.push(`incident ${i.id} has invalid timing`);
  }
  const incoming = new Map<string, Set<string>>();
  for (const l of network.links) {
    const s = incoming.get(l.to) ?? new Set<string>();
    s.add(l.id);
    incoming.set(l.to, s);
  }
  for (const o of params.signalOverrides) {
    const plan = signalNodes.get(o.nodeId);
    if (!plan) {
      issues.push(`signal override references ${o.nodeId}, which is not signalised`);
      continue;
    }
    try {
      issues.push(...validateSignalPlan(applySignalOverride(plan, o), incoming.get(o.nodeId)));
    } catch (e) {
      issues.push((e as Error).message);
    }
  }
  return issues;
}

export interface RunHooks {
  onProgress?: (p: ProgressInfo) => void;
  onFrame?: (f: Frame) => void;
  onSample?: (s: MetricSample) => void;
  onEvent?: (e: SimulationEvent) => void;
}

export class TrafficSimulation {
  readonly graph: RoadGraph;
  readonly params: ScenarioParams;
  private readonly network: CityNetwork;
  private readonly rng: Rng;
  private readonly demandRng: Rng;
  private readonly demand: DemandModel;

  t = 0;
  private nextVehicleId = 1;
  private readonly signalByNode: (SignalPlan | null)[];
  private readonly storage: Int32Array;
  private readonly occupancy: Int32Array;
  private readonly entriesThisStep: Int32Array;
  private running: Vehicle[][];
  private readonly queues: Fifo<Vehicle>[];
  private readonly credit: Float64Array;
  private readonly closed: Uint8Array;
  private readonly capacityFactor: Float64Array;
  private readonly speedFactor: Float64Array;
  private readonly greenRatio: Float64Array;
  private readonly pending: Fifo<Vehicle>[];
  private readonly rotate: Int32Array;

  // statistics
  private readonly linkEntered: Int32Array;
  private readonly linkExited: Int32Array;
  private readonly linkTravelSum: Float64Array;
  private readonly linkSpeedSum: Float64Array;
  private readonly linkSpeedN: Float64Array;
  private readonly linkQueueSum: Float64Array;
  private readonly linkQueueMax: Int32Array;
  private readonly nodeThroughput: Int32Array;
  private readonly nodeDelaySum: Float64Array;
  private readonly nodeQueueMax: Int32Array;
  private readonly spillbackActive: Uint8Array;
  private readonly completed: CompletedTrip[] = [];
  private windowCompleted: number[] = [];
  private tripsGenerated = 0;
  private tripsStranded = 0;
  private reroutes = 0;
  private idleVehicleSeconds = 0;
  private vehicleMetres = 0;
  private readonly samples: MetricSample[] = [];
  private readonly events: SimulationEvent[] = [];
  private finished = false;
  private hooks: RunHooks = {};

  constructor(network: CityNetwork, params: Partial<ScenarioParams> = {}) {
    this.network = network;
    this.params = { ...DEFAULT_PARAMS, ...params };
    const issues = validateScenario(network, this.params);
    if (issues.length) throw new ScenarioValidationError(issues);

    this.graph = new RoadGraph(network);
    const nL = network.links.length;
    const nN = network.nodes.length;
    this.rng = new Rng(this.params.seed);
    this.demandRng = this.rng.fork(1);
    this.demand = buildDemand(network, this.graph);

    const overrides = new Map(this.params.signalOverrides.map((o) => [o.nodeId, o]));
    this.signalByNode = network.nodes.map(() => null);
    for (const plan of network.signals) {
      const idx = this.graph.nodeIndex.get(plan.nodeId);
      if (idx === undefined) continue;
      const o = overrides.get(plan.nodeId);
      this.signalByNode[idx] = o ? applySignalOverride(plan, o) : plan;
    }

    this.storage = new Int32Array(nL);
    this.greenRatio = new Float64Array(nL);
    for (let i = 0; i < nL; i++) {
      const l = this.graph.link(i);
      this.storage[i] = Math.max(2, Math.floor((l.lanes * l.length) / VEHICLE_SPACING));
      const node = this.graph.linkTo[i] as number;
      const plan = this.signalByNode[node];
      const kind = this.graph.node(node).kind;
      this.greenRatio[i] = plan ? effectiveGreenRatio(plan, l.id) : kind === 'gateway' ? 1 : PRIORITY_CAPACITY_FACTOR;
    }
    this.occupancy = new Int32Array(nL);
    this.entriesThisStep = new Int32Array(nL);
    this.running = Array.from({ length: nL }, () => []);
    this.queues = Array.from({ length: nL }, () => new Fifo<Vehicle>());
    this.credit = new Float64Array(nL);
    this.closed = new Uint8Array(nL);
    this.capacityFactor = new Float64Array(nL).fill(1);
    this.speedFactor = new Float64Array(nL).fill(1);
    this.pending = Array.from({ length: nN }, () => new Fifo<Vehicle>());
    this.rotate = new Int32Array(nN);
    this.linkEntered = new Int32Array(nL);
    this.linkExited = new Int32Array(nL);
    this.linkTravelSum = new Float64Array(nL);
    this.linkSpeedSum = new Float64Array(nL);
    this.linkSpeedN = new Float64Array(nL);
    this.linkQueueSum = new Float64Array(nL);
    this.linkQueueMax = new Int32Array(nL);
    this.spillbackActive = new Uint8Array(nL);
    this.nodeThroughput = new Int32Array(nN);
    this.nodeDelaySum = new Float64Array(nN);
    this.nodeQueueMax = new Int32Array(nN);
  }

  get done(): boolean {
    return this.finished;
  }

  setHooks(hooks: RunHooks): void {
    this.hooks = hooks;
  }

  /* ─────────────── cost model used for routing ─────────────── */

  /**
   * Expected traversal time of a link right now: running time at the current
   * speed plus the time to clear the queue ahead at the effective discharge rate.
   * Always ≥ free-flow time, which keeps the A* heuristic admissible.
   */
  readonly liveCost: CostFn = (li) => {
    if (this.closed[li]) return Infinity;
    const l = this.graph.link(li);
    const vf = l.speedLimit * (this.speedFactor[li] as number);
    const runTime = l.length / Math.max(0.5, Math.min(l.speedLimit, this.currentSpeed(li, vf)));
    const dischargePerSec =
      (l.lanes * l.saturationFlow * (this.capacityFactor[li] as number) * (this.greenRatio[li] as number)) / 3600;
    const queueTime = dischargePerSec > 0 ? (this.queues[li] as Fifo<Vehicle>).length / dischargePerSec : Infinity;
    return Math.max(l.length / l.speedLimit, runTime + queueTime);
  };

  private currentSpeed(li: number, vf: number): number {
    const l = this.graph.link(li);
    const queueExtent = Math.ceil((this.queues[li] as Fifo<Vehicle>).length / l.lanes) * VEHICLE_SPACING;
    const freeLength = Math.max(VEHICLE_SPACING, l.length - queueExtent);
    const k = (this.running[li] as Vehicle[]).length / (freeLength * l.lanes);
    const kJam = 1 / VEHICLE_SPACING;
    return vf * Math.max(MIN_SPEED_FRACTION, 1 - k / kJam);
  }

  /* ─────────────── events: closures & incidents ─────────────── */

  private applySchedule(): void {
    const t = this.t;
    for (const c of this.params.closures) {
      const li = this.graph.linkIndex.get(c.linkId) as number;
      if (c.start === t) {
        this.closed[li] = 1;
        this.log({ t, type: 'closure_started', linkId: c.linkId, message: `${this.graph.link(li).name} closed` });
      }
      if (c.end !== undefined && c.end === t) {
        this.closed[li] = 0;
        this.log({ t, type: 'closure_ended', linkId: c.linkId, message: `${this.graph.link(li).name} reopened` });
      }
    }
    for (const inc of this.params.incidents) {
      const li = this.graph.linkIndex.get(inc.linkId) as number;
      if (inc.start === t) {
        this.capacityFactor[li] = Math.max(0, 1 - inc.severity);
        this.speedFactor[li] = Math.max(0.2, 1 - inc.severity * 0.7);
        if (inc.severity >= 1) this.closed[li] = 1;
        this.log({
          t,
          type: 'incident_started',
          linkId: inc.linkId,
          message: `${inc.kind} on ${this.graph.link(li).name} — ${Math.round(inc.severity * 100)}% capacity lost`,
        });
      }
      if (inc.start + inc.duration === t) {
        this.capacityFactor[li] = 1;
        this.speedFactor[li] = 1;
        if (inc.severity >= 1 && !this.isScheduledClosed(li, t)) this.closed[li] = 0;
        this.log({ t, type: 'incident_cleared', linkId: inc.linkId, message: `${inc.kind} on ${this.graph.link(li).name} cleared` });
      }
    }
  }

  private isScheduledClosed(li: number, t: number): boolean {
    const id = this.graph.link(li).id;
    return this.params.closures.some((c) => c.linkId === id && c.start <= t && (c.end === undefined || c.end > t));
  }

  private log(e: SimulationEvent): void {
    this.events.push(e);
    this.hooks.onEvent?.(e);
  }

  /* ─────────────── demand ─────────────── */

  private generateTrips(): void {
    const hour = this.params.startHour + this.t / 3600;
    const rate =
      (this.network.baseDemandVehPerHour * this.params.demandMultiplier * demandProfile(hour)) / 3600;
    const n = this.demandRng.poisson(rate);
    for (let k = 0; k < n; k++) {
      const pair = this.demand.samplePair(this.demandRng);
      const origin = this.demandRng.pick(pair.originNodes);
      let destination = this.demandRng.pick(pair.destinationNodes);
      if (destination === origin) {
        destination = this.demandRng.pick(pair.destinationNodes);
        if (destination === origin) continue; // intra-node trip: no network use
      }
      this.tripsGenerated++;
      const path = this.graph.aStar(origin, destination, this.liveCost);
      const v: Vehicle = {
        id: this.nextVehicleId++,
        origin,
        destination,
        route: path ? path.links : [],
        routePos: 0,
        link: -1,
        pos: 0,
        queued: false,
        queuedAt: 0,
        speed: 0,
        requestedAt: this.t,
        enteredAt: -1,
        linkEnteredAt: 0,
        waitTime: 0,
        stops: 0,
        distance: 0,
        freeFlowTime: 0,
        idleSeconds: 0,
        reroutes: 0,
        checkedAt: -1,
      };
      if (!path || path.links.length === 0) {
        this.tripsStranded++;
        continue;
      }
      (this.pending[origin] as Fifo<Vehicle>).push(v);
    }
  }

  private releaseDepartures(): void {
    for (let n = 0; n < this.pending.length; n++) {
      const q = this.pending[n] as Fifo<Vehicle>;
      while (q.length) {
        const v = q.peek() as Vehicle;
        const first = v.route[0] as number;
        if (this.closed[first]) {
          if (!this.replan(v, n, 0, true)) {
            q.shift();
            this.strand(v);
            continue;
          }
        }
        const li = v.route[0] as number;
        if (!this.canEnter(li)) break;
        q.shift();
        v.enteredAt = this.t;
        this.enterLink(v, li, 0);
      }
    }
  }

  /* ─────────────── link mechanics ─────────────── */

  private canEnter(li: number): boolean {
    const l = this.graph.link(li);
    return (
      !this.closed[li] &&
      (this.occupancy[li] as number) < (this.storage[li] as number) &&
      (this.entriesThisStep[li] as number) < l.lanes
    );
  }

  private enterLink(v: Vehicle, li: number, routePos: number): void {
    v.link = li;
    v.routePos = routePos;
    v.pos = 0;
    v.queued = false;
    v.linkEnteredAt = this.t;
    v.freeFlowTime += this.graph.freeFlowTime(li);
    (this.running[li] as Vehicle[]).push(v);
    this.occupancy[li] = (this.occupancy[li] as number) + 1;
    this.entriesThisStep[li] = (this.entriesThisStep[li] as number) + 1;
    this.linkEntered[li] = (this.linkEntered[li] as number) + 1;
  }

  private leaveLink(v: Vehicle, li: number): void {
    this.occupancy[li] = (this.occupancy[li] as number) - 1;
    this.linkExited[li] = (this.linkExited[li] as number) + 1;
    this.linkTravelSum[li] = (this.linkTravelSum[li] as number) + (this.t - v.linkEnteredAt);
    this.vehicleMetres += this.graph.link(li).length;
    v.distance += this.graph.link(li).length;
  }

  private moveVehicles(dt: number): void {
    for (let li = 0; li < this.running.length; li++) {
      const list = this.running[li] as Vehicle[];
      if (list.length === 0) continue;
      const l = this.graph.link(li);
      const q = this.queues[li] as Fifo<Vehicle>;
      const vf = l.speedLimit * (this.speedFactor[li] as number);
      const speed = this.currentSpeed(li, vf);
      let stopLine = l.length - Math.ceil(q.length / l.lanes) * VEHICLE_SPACING;
      // Vehicles are stored in entry order: index 0 entered first and, with no
      // overtaking, is furthest downstream.
      let joined = 0;
      for (let i = 0; i < list.length; i++) {
        const v = list[i] as Vehicle;
        const target = v.pos + speed * dt;
        v.speed = speed;
        if (target >= stopLine) {
          v.pos = Math.max(0, stopLine);
          v.queued = true;
          v.queuedAt = this.t;
          q.push(v);
          joined++;
          // Each lane-full of joiners extends the queue tail upstream.
          if (q.length % l.lanes === 0) stopLine -= VEHICLE_SPACING;
        } else {
          v.pos = target;
        }
        this.linkSpeedSum[li] = (this.linkSpeedSum[li] as number) + speed;
        this.linkSpeedN[li] = (this.linkSpeedN[li] as number) + 1;
        if (speed < STOPPED_SPEED && !v.queued) {
          v.idleSeconds += dt;
          v.waitTime += dt;
          this.idleVehicleSeconds += dt;
        }
      }
      if (joined) this.running[li] = list.filter((v) => !v.queued);
    }
  }

  /**
   * Re-plan from node `fromNode`. Keeps the traversed prefix of the route.
   * `force` = the next link is impassable, so any path is accepted;
   * otherwise only a clearly better path replaces the current one.
   */
  private replan(v: Vehicle, fromNode: number, keepUpTo: number, force: boolean): boolean {
    const path = this.graph.aStar(fromNode, v.destination, this.liveCost);
    if (!path || path.links.length === 0) return false;
    if (!force) {
      let current = 0;
      for (let i = keepUpTo; i < v.route.length; i++) current += this.liveCost(v.route[i] as number);
      if (!(path.cost < current * ROUTE_ABANDON_FACTOR)) return true; // keep current route
    }
    v.route = v.route.slice(0, keepUpTo).concat(path.links);
    v.reroutes++;
    this.reroutes++;
    return true;
  }

  private strand(v: Vehicle): void {
    this.tripsStranded++;
    this.log({ t: this.t, type: 'trip_stranded', nodeId: this.graph.node(v.origin).id, message: `Vehicle ${v.id} has no route to destination` });
  }

  private routeAheadAffected(v: Vehicle): 'closed' | 'incident' | null {
    let incident = false;
    for (let i = v.routePos + 1; i < v.route.length; i++) {
      const li = v.route[i] as number;
      if (this.closed[li]) return 'closed';
      if ((this.capacityFactor[li] as number) < 0.6) incident = true;
    }
    return incident ? 'incident' : null;
  }

  private dischargeNodes(dt: number): void {
    const nN = this.graph.nodes.length;
    for (let n = 0; n < nN; n++) {
      const incoming = this.graph.incoming[n] as number[];
      if (incoming.length === 0) continue;
      const node = this.graph.node(n);
      const plan = this.signalByNode[n];
      const state = plan ? signalStateAt(plan, this.t) : null;
      const served = state && plan ? new Set(plan.phases[state.phaseIndex]?.approaches ?? []) : null;
      const start = (this.rotate[n] as number) % incoming.length;
      this.rotate[n] = (this.rotate[n] as number) + 1;
      let nodeQueue = 0;

      for (let k = 0; k < incoming.length; k++) {
        const li = incoming[(start + k) % incoming.length] as number;
        const q = this.queues[li] as Fifo<Vehicle>;
        nodeQueue += q.length;
        const l = this.graph.link(li);
        let rateFactor: number;
        if (node.kind === 'gateway') rateFactor = 1.5;
        else if (plan) rateFactor = state?.discharging && served?.has(l.id) ? 1 : 0;
        else rateFactor = PRIORITY_CAPACITY_FACTOR;

        if (rateFactor === 0 || q.length === 0) {
          this.credit[li] = 0; // capacity during red / idle green cannot be banked
          continue;
        }
        const rate = (l.lanes * l.saturationFlow * (this.capacityFactor[li] as number) * rateFactor) / 3600;
        this.credit[li] = Math.min(l.lanes, (this.credit[li] as number) + rate * dt);

        let blocked = false;
        while ((this.credit[li] as number) >= 1 && q.length) {
          const v = q.peek() as Vehicle;
          const atDestination = v.routePos === v.route.length - 1;
          if (atDestination) {
            q.shift();
            this.leaveLink(v, li);
            this.finishTrip(v, n);
            this.credit[li] = (this.credit[li] as number) - 1;
            continue;
          }
          if (this.params.rerouting) {
            const affected = this.routeAheadAffected(v);
            // Closures force a re-plan every time; incident avoidance is
            // considered once per junction so blocked queues don't re-search each second.
            if (affected === 'closed' || (affected === 'incident' && v.checkedAt !== v.routePos)) {
              v.checkedAt = v.routePos;
              if (!this.replan(v, n, v.routePos + 1, affected === 'closed')) {
                q.shift();
                this.leaveLink(v, li);
                this.strand(v);
                continue;
              }
            }
          }
          const next = v.route[v.routePos + 1] as number;
          if (!this.canEnter(next)) {
            blocked = true;
            break;
          }
          q.shift();
          this.leaveLink(v, li);
          this.nodeThroughput[n] = (this.nodeThroughput[n] as number) + 1;
          this.nodeDelaySum[n] = (this.nodeDelaySum[n] as number) + (this.t - v.queuedAt);
          if (this.t - v.queuedAt >= 1) v.stops++;
          this.enterLink(v, next, v.routePos + 1);
          this.credit[li] = (this.credit[li] as number) - 1;
        }
        if (blocked && !this.spillbackActive[li]) {
          this.spillbackActive[li] = 1;
          this.log({ t: this.t, type: 'spillback', linkId: l.id, nodeId: node.id, message: `Queue on ${l.name} blocked by full downstream link` });
        } else if (!blocked && q.length === 0) {
          this.spillbackActive[li] = 0;
        }
      }
      if (nodeQueue > (this.nodeQueueMax[n] as number)) this.nodeQueueMax[n] = nodeQueue;
    }
  }

  private finishTrip(v: Vehicle, _node: number): void {
    const travelTime = this.t - v.enteredAt;
    this.completed.push({
      travelTime,
      waitTime: v.waitTime,
      delay: Math.max(0, travelTime - v.freeFlowTime),
      stops: v.stops,
      distance: v.distance,
    });
    this.windowCompleted.push(travelTime);
  }

  private accumulateQueueStats(dt: number): void {
    for (let li = 0; li < this.queues.length; li++) {
      const q = this.queues[li] as Fifo<Vehicle>;
      const len = q.length;
      if (len === 0) continue;
      this.linkQueueSum[li] = (this.linkQueueSum[li] as number) + len * dt;
      if (len > (this.linkQueueMax[li] as number)) this.linkQueueMax[li] = len;
      for (const v of q) {
        v.waitTime += dt;
        v.idleSeconds += dt;
      }
      this.idleVehicleSeconds += len * dt;
    }
  }

  /* ─────────────── public stepping API ─────────────── */

  step(): void {
    if (this.finished) return;
    const dt = 1;
    this.entriesThisStep.fill(0);
    this.applySchedule();
    this.generateTrips();
    this.moveVehicles(dt);
    this.dischargeNodes(dt);
    this.releaseDepartures();
    this.accumulateQueueStats(dt);
    this.t += dt;

    if (this.t % this.params.sampleInterval === 0) this.takeSample();
    if (this.params.frameInterval > 0 && this.t % this.params.frameInterval === 0 && this.hooks.onFrame) {
      this.hooks.onFrame(this.captureFrame());
    }
    if (this.t >= this.params.duration) this.finished = true;
  }

  /** Runs until `until` (exclusive cap at duration). Returns true when the run is complete. */
  advance(until: number): boolean {
    const target = Math.min(until, this.params.duration);
    while (this.t < target && !this.finished) this.step();
    this.hooks.onProgress?.(this.progress());
    return this.finished;
  }

  run(hooks: RunHooks = {}, chunk = 60): SimulationResult {
    this.setHooks(hooks);
    while (!this.advance(this.t + chunk));
    return this.result();
  }

  progress(): ProgressInfo {
    return {
      t: this.t,
      duration: this.params.duration,
      fraction: this.t / this.params.duration,
      vehiclesInNetwork: this.vehiclesInNetwork(),
      completedTrips: this.completed.length,
    };
  }

  vehiclesInNetwork(): number {
    let n = 0;
    for (let i = 0; i < this.occupancy.length; i++) n += this.occupancy[i] as number;
    return n;
  }

  private takeSample(): void {
    let queued = 0;
    let speedSum = 0;
    let count = 0;
    for (let li = 0; li < this.running.length; li++) {
      const q = (this.queues[li] as Fifo<Vehicle>).length;
      queued += q;
      count += q;
      for (const v of this.running[li] as Vehicle[]) {
        speedSum += v.speed;
        count++;
      }
    }
    let pending = 0;
    for (const p of this.pending) pending += p.length;
    const w = this.windowCompleted;
    const s: MetricSample = {
      t: this.t,
      vehiclesInNetwork: this.vehiclesInNetwork(),
      queuedVehicles: queued,
      completedTrips: this.completed.length,
      meanSpeed: count ? speedSum / count : 0,
      windowMeanTravelTime: w.length ? w.reduce((a, b) => a + b, 0) / w.length : null,
      throughputPerHour: (w.length * 3600) / this.params.sampleInterval,
      pendingDepartures: pending,
    };
    this.windowCompleted = [];
    this.samples.push(s);
    this.hooks.onSample?.(s);
  }

  /** Packs vehicle positions into a typed array (see Frame). Deterministic down-sampling by id. */
  captureFrame(): Frame {
    const total = this.vehiclesInNetwork();
    const stride = Math.max(1, Math.ceil(total / Math.max(1, this.params.maxFrameVehicles)));
    const data: number[] = [];
    for (let li = 0; li < this.running.length; li++) {
      const l = this.graph.link(li);
      const q = this.queues[li] as Fifo<Vehicle>;
      let qi = 0;
      for (const v of q) {
        if (v.id % stride === 0) {
          const pos = Math.max(0, l.length - Math.floor(qi / l.lanes) * VEHICLE_SPACING - 2);
          data.push(v.id, li, Math.round(pos * 10), 1 | ((qi % l.lanes) << 1));
        }
        qi++;
      }
      for (const v of this.running[li] as Vehicle[]) {
        if (v.id % stride === 0) data.push(v.id, li, Math.round(v.pos * 10), (v.id % l.lanes) << 1);
      }
    }
    return { t: this.t, count: data.length / 4, data: Uint32Array.from(data) };
  }

  /** Live link state for visual overlays: [occupancy, queue, congestion×1000] per link. */
  linkState(): Uint16Array {
    const out = new Uint16Array(this.running.length * 3);
    for (let li = 0; li < this.running.length; li++) {
      const l = this.graph.link(li);
      const vf = l.speedLimit * (this.speedFactor[li] as number);
      const speed = this.currentSpeed(li, vf);
      const q = (this.queues[li] as Fifo<Vehicle>).length;
      const queueShare = Math.min(1, (q * VEHICLE_SPACING) / (l.lanes * l.length));
      const congestion = Math.max(1 - speed / l.speedLimit, queueShare);
      out[li * 3] = Math.min(65535, this.occupancy[li] as number);
      out[li * 3 + 1] = Math.min(65535, q);
      out[li * 3 + 2] = Math.round(Math.min(1, Math.max(0, congestion)) * 1000);
    }
    return out;
  }

  /* ─────────────── results ─────────────── */

  result(): SimulationResult {
    const dur = this.t;
    const trips = this.completed;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const tt = trips.map((x) => x.travelTime).sort((a, b) => a - b);
    const p95 = tt.length ? (tt[Math.min(tt.length - 1, Math.floor(0.95 * (tt.length - 1)))] as number) : 0;

    const links: LinkResult[] = this.graph.links.map((l, li) => {
      const exited = this.linkExited[li] as number;
      const capacity = ((l.lanes * l.saturationFlow * (this.greenRatio[li] as number)) / 3600) * dur;
      const meanSpeed = (this.linkSpeedN[li] as number) > 0 ? (this.linkSpeedSum[li] as number) / (this.linkSpeedN[li] as number) : null;
      const meanQueue = dur > 0 ? (this.linkQueueSum[li] as number) / dur : 0;
      const meanTravelTime = exited ? (this.linkTravelSum[li] as number) / exited : null;
      // Congestion = share of link travel time lost to delay (1 − t_free / t_actual),
      // i.e. the travel-time index expressed on a 0–1 scale. Unused links count as free.
      const freeFlow = l.length / l.speedLimit;
      const congestion = meanTravelTime && meanTravelTime > 0 ? Math.max(0, 1 - freeFlow / meanTravelTime) : 0;
      return {
        linkId: l.id,
        entered: this.linkEntered[li] as number,
        exited,
        meanTravelTime,
        meanSpeed,
        maxQueue: this.linkQueueMax[li] as number,
        meanQueue,
        utilization: capacity > 0 ? exited / capacity : 0,
        congestion: Math.min(1, congestion),
      };
    });

    const intersections: IntersectionResult[] = this.graph.nodes
      .map((node, n) => ({
        nodeId: node.id,
        throughput: this.nodeThroughput[n] as number,
        meanDelay: (this.nodeThroughput[n] as number) > 0 ? (this.nodeDelaySum[n] as number) / (this.nodeThroughput[n] as number) : 0,
        maxQueue: this.nodeQueueMax[n] as number,
      }))
      .filter((r) => this.graph.node(this.graph.nodeIndex.get(r.nodeId) as number).kind !== 'gateway');

    let maxQueue = 0;
    for (const m of this.linkQueueMax) maxQueue = Math.max(maxQueue, m);

    const vehicleKm = this.vehicleMetres / 1000;
    const summary: SimulationSummary = {
      engineVersion: ENGINE_VERSION,
      seed: this.params.seed,
      duration: dur,
      tripsGenerated: this.tripsGenerated,
      tripsCompleted: trips.length,
      tripsStranded: this.tripsStranded,
      vehiclesRemaining: this.vehiclesInNetwork() + this.pending.reduce((s, p) => s + p.length, 0),
      meanTravelTime: mean(tt),
      meanWaitTime: mean(trips.map((x) => x.waitTime)),
      meanDelay: mean(trips.map((x) => x.delay)),
      p95TravelTime: p95,
      meanStops: mean(trips.map((x) => x.stops)),
      throughputPerHour: dur > 0 ? (trips.length * 3600) / dur : 0,
      vehicleKm,
      maxQueue,
      meanNetworkSpeed: mean(this.samples.map((s) => s.meanSpeed)),
      reroutes: this.reroutes,
      energy: estimateTrafficEnergy(vehicleKm, this.idleVehicleSeconds / 3600),
    };

    const samples = this.samples;
    return {
      summary,
      samples,
      links,
      intersections,
      events: this.events,
      fingerprint: fingerprint({ summary, samples, links }),
      inputFingerprint: inputFingerprint(this.network, this.params),
    };
  }
}

export function inputFingerprint(network: CityNetwork, params: ScenarioParams): string {
  return fingerprint({
    engine: ENGINE_VERSION,
    city: { id: network.id, version: network.version, links: network.links.length, nodes: network.nodes.length },
    params,
  });
}

/** Assumptions behind the traffic energy estimate. Illustrative, not calibrated. */
export const TRAFFIC_ENERGY_ASSUMPTIONS = {
  iceShare: 0.85,
  iceLitresPer100Km: 8.0,
  iceIdleLitresPerHour: 0.7,
  co2KgPerLitre: 2.31,
  evKwhPerKm: 0.18,
  note: 'Model assumptions for comparison between scenarios — not measured or calibrated values.',
} as const;

export function estimateTrafficEnergy(vehicleKm: number, idleHours: number): EnergyEstimate {
  const a = TRAFFIC_ENERGY_ASSUMPTIONS;
  const fuelLitres = vehicleKm * a.iceShare * (a.iceLitresPer100Km / 100) + idleHours * a.iceShare * a.iceIdleLitresPerHour;
  const evKwh = vehicleKm * (1 - a.iceShare) * a.evKwhPerKm;
  return {
    fuelLitres,
    evKwh,
    co2Kg: fuelLitres * a.co2KgPerLitre,
    idleHours,
    assumptions: { ...a },
  };
}

export function simulate(network: CityNetwork, params: Partial<ScenarioParams> = {}, hooks: RunHooks = {}): SimulationResult {
  return new TrafficSimulation(network, params).run(hooks);
}
