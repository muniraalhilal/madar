import { Rng } from '../core/prng.js';
import type {
  Building,
  BuildingUse,
  CityNetwork,
  District,
  NetworkLink,
  NetworkNode,
  Point,
  RoadClass,
  SignalPlan,
  Zone,
} from '../core/types.js';

/**
 * Generates "Madar", the fictional reference city used throughout the platform.
 *
 * The output is fully deterministic: the same `seed` always yields the same city,
 * so database seeds, tests and screenshots stay stable. Every name, figure and
 * geometry here is synthetic — it does not describe any real place.
 */

export const CITY_VERSION = '1.0.0';

const COLS = [-2100, -1400, -750, 0, 650, 1350, 2050];
const ROWS = [-1250, -650, -100, 450, 1000, 1600];

interface RoadSpec {
  roadClass: RoadClass;
  lanes: number;
  speed: number; // m/s
  name: string;
}

const CLASS_DEFAULTS: Record<RoadClass, { lanes: number; speed: number; sat: number }> = {
  ring: { lanes: 3, speed: 22.2, sat: 1900 },
  boulevard: { lanes: 3, speed: 16.7, sat: 1800 },
  arterial: { lanes: 2, speed: 13.9, sat: 1800 },
  corniche: { lanes: 2, speed: 16.7, sat: 1800 },
  collector: { lanes: 2, speed: 11.1, sat: 1700 },
  local: { lanes: 1, speed: 8.3, sat: 1600 },
};

const STREET_NAMES_NS = [
  'Western Ring',
  'Wadi Street',
  'Lantern Street',
  'Orbit Boulevard',
  'Meridian Street',
  'Quarter Avenue',
  'Eastern Ring',
];
const STREET_NAMES_EW = [
  'Corniche Road',
  'Harbor Avenue',
  'Crescent Street',
  'Noor Avenue',
  'Souq Street',
  'Northern Ring',
];

const NAMED_JUNCTIONS: Record<string, string> = {
  'c3r3': 'Orbit Circle',
  'c3r2': 'Noor Square',
  'c2r3': 'Lantern Junction',
  'c4r3': 'Meridian Cross',
  'c3r4': 'Souq Gate',
  'c3r1': 'Harbor Gate',
  'c3r0': 'Corniche Plaza',
  'c5r3': 'Quarter Cross',
  'c1r3': 'Wadi Cross',
  'c2r2': 'Crescent Junction',
  'c4r2': 'Exchange Junction',
};

/** Interior segments removed to break the grid into superblocks. */
const REMOVED = new Set(['h:c4r1', 'v:c2r4', 'h:c1r4', 'v:c5r0', 'h:c4r4']);

/** Small deterministic offsets so the grid doesn't read as graph paper. */
function jitter(c: number, r: number): Point {
  if (c === 0 || c === COLS.length - 1 || r === ROWS.length - 1) return { x: 0, y: 0 };
  return { x: Math.round(Math.sin(c * 1.7 + r * 2.3) * 45), y: Math.round(Math.cos(c * 2.9 - r * 1.3) * 40) };
}

function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function classifyNS(c: number): RoadSpec {
  if (c === 0 || c === COLS.length - 1) return { roadClass: 'ring', ...CLASS_DEFAULTS.ring, name: STREET_NAMES_NS[c] as string };
  if (c === 3) return { roadClass: 'boulevard', ...CLASS_DEFAULTS.boulevard, name: STREET_NAMES_NS[c] as string };
  if (c === 1 || c === 5) return { roadClass: 'arterial', ...CLASS_DEFAULTS.arterial, name: STREET_NAMES_NS[c] as string };
  return { roadClass: 'collector', ...CLASS_DEFAULTS.collector, name: STREET_NAMES_NS[c] as string };
}

function classifyEW(r: number): RoadSpec {
  if (r === 0) return { roadClass: 'corniche', ...CLASS_DEFAULTS.corniche, name: STREET_NAMES_EW[r] as string };
  if (r === ROWS.length - 1) return { roadClass: 'ring', ...CLASS_DEFAULTS.ring, name: STREET_NAMES_EW[r] as string };
  if (r === 3) return { roadClass: 'boulevard', ...CLASS_DEFAULTS.boulevard, name: STREET_NAMES_EW[r] as string };
  if (r === 2) return { roadClass: 'arterial', ...CLASS_DEFAULTS.arterial, name: STREET_NAMES_EW[r] as string };
  return { roadClass: 'collector', ...CLASS_DEFAULTS.collector, name: STREET_NAMES_EW[r] as string };
}

export const DISTRICTS: District[] = [
  {
    id: 'noor',
    name: 'Al Noor Financial District',
    nameAr: 'حي النور المالي',
    character: 'Dense high-rise core: offices, towers and the Orbit Boulevard spine.',
    boundary: [
      { x: -750, y: -650 },
      { x: 1350, y: -650 },
      { x: 1350, y: 1000 },
      { x: -750, y: 1000 },
    ],
    color: '#8B7CF6',
  },
  {
    id: 'souq',
    name: 'Old Souq',
    nameAr: 'السوق القديم',
    character: 'Low-rise heritage quarter, retail lanes and civic buildings.',
    boundary: [
      { x: -750, y: 1000 },
      { x: 1350, y: 1000 },
      { x: 1350, y: 1900 },
      { x: -750, y: 1900 },
    ],
    color: '#FFB58E',
  },
  {
    id: 'wadi',
    name: 'Wadi Gardens',
    nameAr: 'حدائق الوادي',
    character: 'Residential neighbourhoods around linear parks.',
    boundary: [
      { x: -2400, y: -1550 },
      { x: -750, y: -1550 },
      { x: -750, y: 1900 },
      { x: -2400, y: 1900 },
    ],
    color: '#7CD9C7',
  },
  {
    id: 'harbor',
    name: 'Harbor Arc',
    nameAr: 'قوس المرفأ',
    character: 'Waterfront mixed-use, hotels and the Corniche.',
    boundary: [
      { x: -750, y: -1550 },
      { x: 2400, y: -1550 },
      { x: 2400, y: -650 },
      { x: -750, y: -650 },
    ],
    color: '#B4A3E6',
  },
  {
    id: 'innovation',
    name: 'Innovation Quarter',
    nameAr: 'حي الابتكار',
    character: 'Research campuses, labs and mid-rise workplaces.',
    boundary: [
      { x: 1350, y: -650 },
      { x: 2400, y: -650 },
      { x: 2400, y: 1900 },
      { x: 1350, y: 1900 },
    ],
    color: '#9FB4FF',
  },
];

export function districtAt(p: Point): string | null {
  for (const d of DISTRICTS) {
    const [a, , c] = d.boundary as [Point, Point, Point, Point];
    if (p.x >= a.x && p.x < c.x && p.y >= a.y && p.y < c.y) return d.id;
  }
  return null;
}

interface GatewaySpec {
  id: string;
  name: string;
  x: number;
  y: number;
  attach: string;
  zone: string;
}

const GATEWAYS: GatewaySpec[] = [
  { id: 'g-west', name: 'West Gateway', x: -3000, y: 450, attach: 'c0r3', zone: 'region-west' },
  { id: 'g-southwest', name: 'Southwest Gateway', x: -3000, y: -650, attach: 'c0r1', zone: 'region-west' },
  { id: 'g-north', name: 'North Gateway', x: 0, y: 2500, attach: 'c3r5', zone: 'region-north' },
  { id: 'g-northwest', name: 'Northwest Gateway', x: -1400, y: 2500, attach: 'c1r5', zone: 'region-north' },
  { id: 'g-east', name: 'East Gateway', x: 2950, y: 450, attach: 'c6r3', zone: 'region-east' },
  { id: 'g-southeast', name: 'Southeast Gateway', x: 2950, y: -650, attach: 'c6r1', zone: 'region-east' },
];

export interface GenerateOptions {
  seed?: number;
  baseDemandVehPerHour?: number;
}

export function generateCity(opts: GenerateOptions = {}): CityNetwork {
  const seed = opts.seed ?? 2026;
  const rng = new Rng(seed);
  const nodes: NetworkNode[] = [];
  const links: NetworkLink[] = [];
  const pos = new Map<string, Point>();

  for (let c = 0; c < COLS.length; c++) {
    for (let r = 0; r < ROWS.length; r++) {
      const id = `c${c}r${r}`;
      const j = jitter(c, r);
      const p = { x: (COLS[c] as number) + j.x, y: (ROWS[r] as number) + j.y };
      pos.set(id, p);
      nodes.push({
        id,
        name: NAMED_JUNCTIONS[id] ?? `${STREET_NAMES_NS[c]} × ${STREET_NAMES_EW[r]}`,
        kind: 'priority', // refined after links exist
        x: p.x,
        y: p.y,
        districtId: districtAt(p),
      });
    }
  }
  for (const g of GATEWAYS) {
    pos.set(g.id, { x: g.x, y: g.y });
    nodes.push({ id: g.id, name: g.name, kind: 'gateway', x: g.x, y: g.y, districtId: null });
  }

  const addTwoWay = (a: string, b: string, spec: RoadSpec, curve?: (t: number, p0: Point, p1: Point) => Point) => {
    const p0 = pos.get(a) as Point;
    const p1 = pos.get(b) as Point;
    const shape: Point[] = [];
    if (curve) for (let i = 1; i < 8; i++) shape.push(curve(i / 8, p0, p1));
    const forward = [p0, ...shape, p1];
    const length = Math.ceil(polylineLength(forward) * 10) / 10;
    const sat = CLASS_DEFAULTS[spec.roadClass].sat;
    const base = { length, lanes: spec.lanes, speedLimit: spec.speed, saturationFlow: sat, roadClass: spec.roadClass, name: spec.name };
    links.push({ id: `${a}>${b}`, from: a, to: b, ...base, ...(shape.length ? { shape } : {}) });
    links.push({ id: `${b}>${a}`, from: b, to: a, ...base, ...(shape.length ? { shape: [...shape].reverse() } : {}) });
  };

  // Corniche follows a gentle waterfront curve.
  const cornicheCurve = (t: number, p0: Point, p1: Point): Point => ({
    x: Math.round(p0.x + (p1.x - p0.x) * t),
    y: Math.round(p0.y + (p1.y - p0.y) * t - Math.sin(Math.PI * t) * 55),
  });

  for (let c = 0; c < COLS.length; c++) {
    for (let r = 0; r < ROWS.length; r++) {
      if (c + 1 < COLS.length && !REMOVED.has(`h:c${c}r${r}`)) {
        addTwoWay(`c${c}r${r}`, `c${c + 1}r${r}`, classifyEW(r), r === 0 ? cornicheCurve : undefined);
      }
      if (r + 1 < ROWS.length && !REMOVED.has(`v:c${c}r${r}`)) {
        addTwoWay(`c${c}r${r}`, `c${c}r${r + 1}`, classifyNS(c));
      }
    }
  }
  // Souq Diagonal: historic route cutting one block from the heritage quarter to the core.
  addTwoWay('c2r4', 'c3r3', { roadClass: 'collector', ...CLASS_DEFAULTS.collector, name: 'Souq Diagonal' });
  addTwoWay('c1r4', 'c2r3', { roadClass: 'local', ...CLASS_DEFAULTS.local, name: 'Garden Lane' });

  for (const g of GATEWAYS) {
    addTwoWay(g.id, g.attach, { roadClass: 'ring', ...CLASS_DEFAULTS.ring, name: `${g.name} Expressway` });
  }

  // Signalise junctions where major roads meet or degree is high.
  const major = new Set<RoadClass>(['ring', 'boulevard', 'arterial']);
  const incomingByNode = new Map<string, NetworkLink[]>();
  for (const l of links) {
    const list = incomingByNode.get(l.to) ?? [];
    list.push(l);
    incomingByNode.set(l.to, list);
  }
  const signals: SignalPlan[] = [];
  for (const n of nodes) {
    if (n.kind === 'gateway') continue;
    const inc = (incomingByNode.get(n.id) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
    const majorCount = inc.filter((l) => major.has(l.roadClass)).length;
    if (inc.length >= 3 && (majorCount >= 2 || inc.length >= 4)) {
      n.kind = 'signal';
      const ns: string[] = [];
      const ew: string[] = [];
      for (const l of inc) {
        const from = pos.get(l.from) as Point;
        const dx = n.x - from.x;
        const dy = n.y - from.y;
        (Math.abs(dy) >= Math.abs(dx) ? ns : ew).push(l.id);
      }
      if (ns.length && ew.length) {
        signals.push({
          nodeId: n.id,
          offset: 0,
          phases: [
            { name: 'North–South', approaches: ns, green: 35, yellow: 3, allRed: 2 },
            { name: 'East–West', approaches: ew, green: 35, yellow: 3, allRed: 2 },
          ],
        });
      } else {
        n.kind = 'priority';
      }
    }
  }

  const buildings = generateBuildings(rng.fork(7));

  const zones: Zone[] = [
    { id: 'zone-noor', name: 'Al Noor Financial District', nodes: [], production: 0.6, attraction: 3.2 },
    { id: 'zone-souq', name: 'Old Souq', nodes: [], production: 1.0, attraction: 1.1 },
    { id: 'zone-wadi', name: 'Wadi Gardens', nodes: [], production: 2.6, attraction: 0.5 },
    { id: 'zone-harbor', name: 'Harbor Arc', nodes: [], production: 1.2, attraction: 1.2 },
    { id: 'zone-innovation', name: 'Innovation Quarter', nodes: [], production: 0.7, attraction: 1.9 },
    { id: 'region-west', name: 'Regional — West', nodes: [], production: 1.6, attraction: 0.4 },
    { id: 'region-north', name: 'Regional — North', nodes: [], production: 1.3, attraction: 0.4 },
    { id: 'region-east', name: 'Regional — East', nodes: [], production: 1.4, attraction: 0.5 },
  ];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  for (const n of nodes) {
    if (n.kind === 'gateway') {
      const g = GATEWAYS.find((x) => x.id === n.id) as GatewaySpec;
      zoneById.get(g.zone)?.nodes.push(n.id);
    } else if (n.districtId) {
      zoneById.get(`zone-${n.districtId}`)?.nodes.push(n.id);
    }
  }

  return {
    id: 'madar-city',
    name: 'Madar (fictional reference city)',
    version: CITY_VERSION,
    nodes,
    links,
    signals,
    districts: DISTRICTS,
    buildings,
    zones,
    baseDemandVehPerHour: opts.baseDemandVehPerHour ?? 24000,
  };
}

/* ───────────────────────── Buildings ───────────────────────── */

const LANDMARKS: Record<string, { name: string; height: number; use: BuildingUse }> = {
  'c3r2': { name: 'Madar Tower', height: 452, use: 'office' },
  'c2r2': { name: 'Noor Exchange', height: 318, use: 'office' },
  'c3r3': { name: 'Lantern Spire', height: 286, use: 'mixed' },
  'c4r2': { name: 'Meridian Twin East', height: 264, use: 'office' },
  'c2r1': { name: 'Crescent Residences', height: 212, use: 'residential' },
  'c4r0': { name: 'Harbor Crescent Hotel', height: 196, use: 'hotel' },
  'c3r4': { name: 'Souq Civic Hall', height: 38, use: 'civic' },
  'c5r3': { name: 'Quarter Research Campus', height: 88, use: 'office' },
};

/** Blocks kept open as parks. Keys are the cell's south-west corner. */
const PARKS = new Set(['c1r2', 'c4r3', 'c0r4', 'c5r1']);

function heightFor(district: string | null, rng: Rng): { height: number; use: BuildingUse } {
  switch (district) {
    case 'noor':
      return { height: Math.round(rng.range(70, 240)), use: rng.next() < 0.75 ? 'office' : 'mixed' };
    case 'innovation':
      return { height: Math.round(rng.range(24, 110)), use: rng.next() < 0.7 ? 'office' : 'mixed' };
    case 'harbor': {
      const r = rng.next();
      return { height: Math.round(rng.range(22, 140)), use: r < 0.35 ? 'hotel' : r < 0.7 ? 'mixed' : 'residential' };
    }
    case 'souq': {
      const r = rng.next();
      return { height: Math.round(rng.range(9, 32)), use: r < 0.55 ? 'retail' : r < 0.85 ? 'mixed' : 'civic' };
    }
    default:
      return { height: Math.round(rng.range(10, 54)), use: rng.next() < 0.85 ? 'residential' : 'retail' };
  }
}

function generateBuildings(rng: Rng): Building[] {
  const out: Building[] = [];
  const setback = 70;
  for (let c = 0; c < COLS.length - 1; c++) {
    for (let r = 0; r < ROWS.length - 1; r++) {
      const cell = `c${c}r${r}`;
      if (PARKS.has(cell)) continue;
      const x0 = (COLS[c] as number) + setback;
      const x1 = (COLS[c + 1] as number) - setback;
      const y0 = (ROWS[r] as number) + setback + (r === 0 ? 40 : 0);
      const y1 = (ROWS[r + 1] as number) - setback;
      const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const district = districtAt(centre);
      const nx = (x1 - x0) > 600 ? 3 : 2;
      const ny = (y1 - y0) > 520 ? 3 : 2;
      const lotW = (x1 - x0) / nx;
      const lotH = (y1 - y0) / ny;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          if (rng.next() < 0.12) continue; // plazas and vacant lots
          const isLandmark = i === 0 && j === ny - 1 && LANDMARKS[cell];
          const fillW = rng.range(0.42, 0.78);
          const fillH = rng.range(0.42, 0.78);
          const w = lotW * (isLandmark ? 0.7 : fillW);
          const h = lotH * (isLandmark ? 0.7 : fillH);
          const cx = x0 + lotW * (i + 0.5);
          const cy = y0 + lotH * (j + 0.5);
          const footprint: Point[] = [
            { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) },
            { x: Math.round(cx + w / 2), y: Math.round(cy - h / 2) },
            { x: Math.round(cx + w / 2), y: Math.round(cy + h / 2) },
            { x: Math.round(cx - w / 2), y: Math.round(cy + h / 2) },
          ];
          const spec = isLandmark ? LANDMARKS[cell]! : heightFor(district, rng);
          const floorHeight = spec.use === 'residential' || spec.use === 'hotel' ? 3.3 : 4.0;
          const floors = Math.max(2, Math.round(spec.height / floorHeight));
          // Towers taper: usable floor plate shrinks with height.
          const plate = w * h * (spec.height > 150 ? 0.45 : 0.9);
          const id = `b-${cell}-${i}${j}`;
          out.push({
            id,
            name: isLandmark ? LANDMARKS[cell]!.name : `${(district ?? 'city').toUpperCase().slice(0, 3)}-${cell.toUpperCase()}-${i}${j}`,
            districtId: district ?? 'wadi',
            use: spec.use,
            footprint,
            height: spec.height,
            floors,
            floorArea: Math.round(plate * floors),
          });
        }
      }
    }
  }
  return out;
}

export function cityBounds(network: CityNetwork): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of network.nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  return { minX, maxX, minY, maxY };
}
