/**
 * Domain types shared by the engine, the API, the worker and the web client.
 * Coordinates are in a local planar system, metres, x = east, y = north.
 * The city is fictional; nothing here is a real geographic location.
 */

export type NodeKind = 'signal' | 'priority' | 'gateway';
export type RoadClass = 'ring' | 'boulevard' | 'arterial' | 'collector' | 'local' | 'corniche';

export interface Point {
  x: number;
  y: number;
}

export interface NetworkNode {
  id: string;
  name: string;
  kind: NodeKind;
  x: number;
  y: number;
  districtId: string | null;
}

export interface NetworkLink {
  id: string;
  name: string;
  from: string;
  to: string;
  /** Length in metres. Must be > 0. */
  length: number;
  lanes: number;
  /** Free-flow speed in m/s. */
  speedLimit: number;
  /** Saturation flow per lane at the downstream stop line, veh/h/lane. */
  saturationFlow: number;
  roadClass: RoadClass;
  /** Optional intermediate geometry (excluding endpoints) for curved roads. */
  shape?: Point[];
}

export interface SignalPhase {
  name: string;
  /** Link ids whose downstream end is served during this phase's green. */
  approaches: string[];
  green: number;
  yellow: number;
  allRed: number;
}

export interface SignalPlan {
  nodeId: string;
  offset: number;
  phases: SignalPhase[];
}

export interface District {
  id: string;
  name: string;
  nameAr: string;
  character: string;
  /** Polygon (closed implicitly). */
  boundary: Point[];
  color: string;
}

export type BuildingUse = 'office' | 'residential' | 'retail' | 'mixed' | 'civic' | 'hotel';

export interface Building {
  id: string;
  name: string;
  districtId: string;
  use: BuildingUse;
  footprint: Point[];
  height: number;
  floors: number;
  /** Gross floor area, m². */
  floorArea: number;
}

export interface Zone {
  id: string;
  name: string;
  /** Nodes where trips of this zone start or end. */
  nodes: string[];
  /** Relative trip production / attraction weights. */
  production: number;
  attraction: number;
}

export interface CityNetwork {
  id: string;
  name: string;
  version: string;
  nodes: NetworkNode[];
  links: NetworkLink[];
  signals: SignalPlan[];
  districts: District[];
  buildings: Building[];
  zones: Zone[];
  /** Base demand for the whole network, vehicles per hour, before multipliers. */
  baseDemandVehPerHour: number;
}

/* ───────────────────────── Scenario input ───────────────────────── */

export interface SignalOverride {
  nodeId: string;
  offset?: number;
  /** Green times by phase index; yellow / all-red stay as configured. */
  greens: number[];
}

export interface RoadClosure {
  linkId: string;
  /** Seconds from simulation start. */
  start: number;
  /** Seconds from simulation start; omit for "until the end". */
  end?: number;
}

export interface IncidentSpec {
  id: string;
  linkId: string;
  start: number;
  duration: number;
  /** Fraction of capacity removed, 0 < severity ≤ 1 (1 = fully blocked). */
  severity: number;
  kind: 'collision' | 'breakdown' | 'roadwork' | 'event';
}

export interface ScenarioParams {
  /** Simulated duration in seconds. */
  duration: number;
  seed: number;
  /** Multiplies network base demand. */
  demandMultiplier: number;
  /** Simulated wall-clock start, hour of day (affects demand profile). */
  startHour: number;
  signalOverrides: SignalOverride[];
  closures: RoadClosure[];
  incidents: IncidentSpec[];
  /** Vehicles re-plan at the next node when their route hits a closed or blocked link. */
  rerouting: boolean;
  /** Seconds between persisted metric samples. */
  sampleInterval: number;
  /** Seconds between playback frames (0 disables frame capture). */
  frameInterval: number;
  /** Upper bound on vehicles written into each frame (deterministic sampling). */
  maxFrameVehicles: number;
}

/* ───────────────────────── Output ───────────────────────── */

export interface MetricSample {
  t: number;
  vehiclesInNetwork: number;
  queuedVehicles: number;
  completedTrips: number;
  /** Mean speed of moving + queued vehicles, m/s. */
  meanSpeed: number;
  /** Mean travel time of trips completed in this sample window, s. */
  windowMeanTravelTime: number | null;
  /** Trips completed in this window, scaled to vehicles/hour. */
  throughputPerHour: number;
  /** Vehicles waiting to enter because origin links were full. */
  pendingDepartures: number;
}

export interface LinkResult {
  linkId: string;
  entered: number;
  exited: number;
  meanTravelTime: number | null;
  meanSpeed: number | null;
  maxQueue: number;
  meanQueue: number;
  /** exited / theoretical stop-line capacity over the run. */
  utilization: number;
  /** 0 = free flow, 1 = standstill. */
  congestion: number;
}

export interface IntersectionResult {
  nodeId: string;
  throughput: number;
  meanDelay: number;
  maxQueue: number;
}

export interface SimulationEvent {
  t: number;
  type:
    | 'closure_started'
    | 'closure_ended'
    | 'incident_started'
    | 'incident_cleared'
    | 'reroute'
    | 'trip_stranded'
    | 'spillback';
  linkId?: string;
  nodeId?: string;
  count?: number;
  message: string;
}

export interface EnergyEstimate {
  /** These are modelled estimates under stated assumptions, not measurements. */
  fuelLitres: number;
  evKwh: number;
  co2Kg: number;
  idleHours: number;
  assumptions: Record<string, number | string>;
}

export interface SimulationSummary {
  engineVersion: string;
  seed: number;
  duration: number;
  tripsGenerated: number;
  tripsCompleted: number;
  tripsStranded: number;
  vehiclesRemaining: number;
  meanTravelTime: number;
  meanWaitTime: number;
  meanDelay: number;
  p95TravelTime: number;
  meanStops: number;
  throughputPerHour: number;
  vehicleKm: number;
  maxQueue: number;
  meanNetworkSpeed: number;
  reroutes: number;
  energy: EnergyEstimate;
}

export interface SimulationResult {
  summary: SimulationSummary;
  samples: MetricSample[];
  links: LinkResult[];
  intersections: IntersectionResult[];
  events: SimulationEvent[];
  /** Fingerprint of summary + samples + link results. Equal inputs ⇒ equal fingerprint. */
  fingerprint: string;
  inputFingerprint: string;
}

/**
 * A playback frame. `data` is packed as [vehicleId, linkIndex, positionDm, flags] × n
 * so it can travel over the wire as a typed array without per-vehicle objects.
 * flags bit0 = queued.
 */
export interface Frame {
  t: number;
  count: number;
  data: Uint32Array;
}

export interface ProgressInfo {
  t: number;
  duration: number;
  fraction: number;
  vehiclesInNetwork: number;
  completedTrips: number;
}
