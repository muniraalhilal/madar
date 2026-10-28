import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small seeded PRNG (mulberry32) so every render of a preset is identical. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a0, b) => a0 + next() * (b - a0), pick: (xs) => xs[Math.floor(next() * xs.length)] };
}

function tag(geo, { seed, floorH = 4, bayW = 1.6, tint = 0.5, lit = 1, base = 0, kind = 0 }) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const fill = (v) => new Float32Array(n).fill(v);
  g.setAttribute('aSeed', new THREE.BufferAttribute(fill(seed), 1));
  g.setAttribute('aBase', new THREE.BufferAttribute(fill(base), 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(fill(kind), 1));
  const style = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) style.set([floorH, bayW, tint, lit], i * 4);
  g.setAttribute('aStyle', new THREE.BufferAttribute(style, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aSeed', 'aBase', 'aKind', 'aStyle'].includes(k)) g.deleteAttribute(k);
  return g;
}

function box(w, h, d, x, z, y0 = 0, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2 + y0, 0);
  if (rotY) g.rotateY(rotY);
  g.translate(x, 0, z);
  return g;
}

/** Extruded footprint along +Y with optional taper and twist (radians over full height). */
function extrudedTower(shape, height, { taper = 1, twist = 0, steps = 1, x = 0, z = 0, rotY = 0, y0 = 0 }) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, steps, bevelEnabled: false, curveSegments: 18 });
  g.rotateX(-Math.PI / 2); // extrusion now along +Y
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / height;
    const s = 1 + (taper - 1) * t;
    const a = twist * t + rotY;
    const px = p.getX(i) * s;
    const pz = p.getZ(i) * s;
    p.setXYZ(i, px * Math.cos(a) - pz * Math.sin(a) + x, y + y0, px * Math.sin(a) + pz * Math.cos(a) + z);
  }
  g.computeVertexNormals();
  return g;
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Soft triangle (three arcs) — the Madar Tower plan. */
function softTriangle(r) {
  const s = new THREE.Shape();
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 - Math.PI / 2;
    for (let k = 0; k <= 16; k++) {
      const a = a0 + (k / 16) * ((Math.PI * 2) / 3);
      const bulge = 0.86 + 0.14 * Math.sin((k / 16) * Math.PI);
      const corner = 1 - 0.1 * Math.pow(Math.cos((k / 16) * Math.PI), 8);
      pts.push(new THREE.Vector2(Math.cos(a) * r * bulge * corner, Math.sin(a) * r * bulge * corner));
    }
  }
  s.setFromPoints(pts);
  return s;
}

function ellipse(rx, rz) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return s;
}

export function buildCity(opts) {
  // opts.corridors: arrays of [x, z] samples along elevated roads; buildings keep clear of them
  const R = rng(opts.seed ?? 2026);
  const towers = [];
  const emissive = { red: [], lavender: [], white: [], warm: [] };
  const landmarkSpots = [];

  // ── Landmarks: original designs, not replicas of real buildings ──
  // Madar Tower: twisting soft-triangle supertall with an orbital crown.
  {
    const H = 452;
    towers.push(tag(extrudedTower(softTriangle(38), H, { taper: 0.42, twist: 1.15, steps: 60, x: 0, z: -200 }), { seed: 1.1, floorH: 4.2, bayW: 2.2, tint: 0.85, lit: 1.0, kind: 3 }));
    // crown frame: thin fins rising past the roof
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const fin = box(1.2, 46, 3.5, Math.cos(a) * 15, -200 + Math.sin(a) * 15, H - 6, -a);
      towers.push(tag(fin, { seed: 9, kind: 3, lit: 0 }));
    }
    emissive.lavender.push({ type: 'torus', r: 34, tube: 0.9, x: 0, y: H + 22, z: -200, tilt: [0.42, 0, 0.18] });
    // the brand orbit: a vast, faint ring of light circling the tower, with its orb
    emissive.orbit = { r: 950, tube: 3.2, x: -80, y: 600, z: -260, tilt: [0.62, 0.0, -0.42], orb: 0.04 };
    emissive.lavender.push({ type: 'torus', r: 16.5, tube: 0.5, x: 0, y: H + 30, z: -200, tilt: [0, 0, 0] });
    emissive.white.push({ type: 'spire', h: 70, r: 1.4, x: 0, y: H + 30, z: -200 });
    emissive.red.push({ x: 0, y: H + 101, z: -200, r: 1.6 });
    landmarkSpots.push([0, -200, 70]);
  }
  // Noor Exchange: angled blade
  {
    const g = extrudedTower(roundedRect(74, 26, 8), 318, { taper: 0.9, steps: 8, x: -280, z: -60, rotY: 0.32 });
    towers.push(tag(g, { seed: 2.2, floorH: 4.0, bayW: 1.5, tint: 0.2, lit: 1.0 }));
    emissive.red.push({ x: -280, y: 322, z: -60, r: 1.4 });
    landmarkSpots.push([-280, -60, 60]);
  }
  // Lantern Spire: faceted cylinder with vertical fins
  {
    const g = new THREE.CylinderGeometry(24, 30, 286, 20, 12);
    g.translate(250, 143, -360);
    towers.push(tag(g, { seed: 3.3, floorH: 3.9, bayW: 1.8, tint: 0.65, lit: 1.0, kind: 3 }));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      towers.push(tag(box(0.8, 300, 2.2, 250 + Math.cos(a) * 27.5, -360 + Math.sin(a) * 27.5, 0, -a), { seed: 3.4, kind: 3, lit: 0 }));
    }
    emissive.warm.push({ type: 'torus', r: 25, tube: 0.6, x: 250, y: 286, z: -360, tilt: [Math.PI / 2, 0, 0] });
    emissive.red.push({ x: 250, y: 300, z: -360, r: 1.4 });
    landmarkSpots.push([250, -360, 50]);
  }
  // Meridian Twins with a sky bridge
  for (const [x, z, s] of [
    [430, -110, 4.4],
    [520, -30, 4.5],
  ]) {
    const H = 264;
    towers.push(tag(box(46, H * 0.62, 46, x, z), { seed: s, floorH: 4.0, bayW: 1.6, tint: 0.4 }));
    towers.push(tag(box(38, H * 0.25, 38, x, z, H * 0.62), { seed: s + 0.1, floorH: 4.0, bayW: 1.6, tint: 0.4, base: 0 }));
    towers.push(tag(box(28, H * 0.13, 28, x, z, H * 0.87), { seed: s + 0.2, floorH: 4.0, bayW: 1.6, tint: 0.4 }));
    emissive.red.push({ x, y: H + 2, z, r: 1.3 });
    landmarkSpots.push([x, z, 40]);
  }
  towers.push(tag(box(100, 9, 10, 475, -70, 168, -0.73), { seed: 4.9, floorH: 4.5, bayW: 2.0, tint: 0.6, lit: 1.4 }));
  // Crescent Residences: curved slab
  {
    const s = new THREE.Shape();
    const pts = [];
    for (let k = 0; k <= 24; k++) pts.push(new THREE.Vector2(Math.cos(Math.PI * (0.15 + 0.7 * (k / 24))) * 120, Math.sin(Math.PI * (0.15 + 0.7 * (k / 24))) * 120 - 90));
    for (let k = 24; k >= 0; k--) pts.push(new THREE.Vector2(Math.cos(Math.PI * (0.15 + 0.7 * (k / 24))) * 98, Math.sin(Math.PI * (0.15 + 0.7 * (k / 24))) * 98 - 90));
    s.setFromPoints(pts);
    towers.push(tag(extrudedTower(s, 212, { x: -520, z: -330, rotY: 0.5, steps: 4 }), { seed: 5.5, floorH: 3.3, bayW: 2.4, tint: 0.3, lit: 1.25, kind: 0 }));
    landmarkSpots.push([-520, -330, 130]);
  }
  // Harbor Crescent Hotel near the water: stepped ellipse
  {
    for (let i = 0; i < 5; i++) {
      const g = extrudedTower(ellipse(46 - i * 6, 22 - i * 2), 44, { x: -760, z: 240, y0: i * 44, rotY: 0.6 });
      towers.push(tag(g, { seed: 6.6 + i * 0.01, floorH: 3.3, bayW: 2.0, tint: 0.7, lit: 1.3, kind: 0 }));
    }
    emissive.warm.push({ type: 'torus', r: 22, tube: 0.5, x: -760, y: 222, z: 240, tilt: [Math.PI / 2, 0, 0.6] });
    landmarkSpots.push([-760, 240, 60]);
  }

  // ── Secondary high-rise cluster around the core ──
  const corridor = (opts.corridors ?? []).flat();
  const nearRoad = (x, z, pad) => corridor.some(([cx, cz]) => Math.abs(x - cx) < pad && Math.abs(z - cz) < pad && Math.hypot(x - cx, z - cz) < pad);
  const near = (x, z, pad) => landmarkSpots.some(([lx, lz, r]) => Math.hypot(x - lx, z - lz) < r + pad) || nearRoad(x, z, pad + 14);
  for (let i = 0; i < 190; i++) {
    const a = R.range(0, Math.PI * 2);
    const d = 110 + Math.pow(R.next(), 1.35) * 1900;
    const x = Math.cos(a) * d * 1.3;
    const z = -230 + Math.sin(a) * d * 0.8;
    if (z > 360 || near(x, z, 30)) continue;
    const falloff = Math.exp(-d / 1100);
    const H = 55 + Math.pow(R.next(), 1.5) * 300 * (0.25 + 0.75 * falloff);
    const w = R.range(24, 50);
    const dd = R.range(22, 46);
    const rot = R.pick([0, 0, 0, 0.32, -0.25, 0.12, 0.6]);
    const kr = R.next();
    const kind = kr < 0.16 ? 1 : kr < 0.28 ? 3 : 0;
    const seed = 10 + i * 1.37;
    const style = { seed, floorH: R.pick([3.3, 3.6, 3.9, 4.2]), bayW: R.pick([1.3, 1.5, 1.8, 2.2, 2.8]), tint: R.next(), lit: R.range(0.25, 1.4), kind };
    const form = R.next();
    let top = H;
    if (form < 0.22) {
      towers.push(tag(box(w, H, dd, x, z, 0, rot), style));
    } else if (form < 0.45) {
      // classic setbacks
      const t1 = R.range(0.55, 0.75);
      towers.push(tag(box(w, H * t1, dd, x, z, 0, rot), style));
      towers.push(tag(box(w * 0.74, H * (0.9 - t1), dd * 0.74, x, z, H * t1, rot), { ...style, seed: seed + 0.5 }));
      towers.push(tag(box(w * 0.5, H * 0.1, dd * 0.5, x, z, H * 0.9, rot), { ...style, seed: seed + 0.6 }));
    } else if (form < 0.68) {
      towers.push(tag(extrudedTower(roundedRect(w, dd, Math.min(w, dd) * R.range(0.15, 0.45)), H, { x, z, rotY: rot, taper: R.range(0.72, 1), steps: 8 }), style));
    } else if (form < 0.8) {
      // twisting tower
      towers.push(tag(extrudedTower(roundedRect(w * 0.9, w * 0.9, w * 0.2), H, { x, z, rotY: rot, twist: R.range(0.5, 1.2) * (R.next() < 0.5 ? -1 : 1), taper: R.range(0.75, 0.95), steps: 40 }), style));
    } else if (form < 0.9) {
      const g = new THREE.CylinderGeometry(w * 0.42, w * 0.5, H, 18, 6);
      g.translate(x, H / 2, z);
      towers.push(tag(g, style));
    } else {
      // slab pair with a shared podium
      towers.push(tag(box(w * 0.55, H, dd, x - w * 0.4, z, 0, rot), style));
      towers.push(tag(box(w * 0.55, H * 0.82, dd, x + w * 0.45, z + dd * 0.2, 0, rot), { ...style, seed: seed + 0.3 }));
      top = H;
    }
    // rooftop plant (before any crown is stacked on top)
    if (R.next() < 0.5) towers.push(tag(box(w * 0.35, R.range(4, 9), dd * 0.3, x + w * 0.1, z, top, rot), { seed: seed + 0.95, kind: 1, lit: 0 }));
    // crowns
    const crown = R.next();
    if (H > 160 && crown < 0.35) {
      emissive.warm.push({ type: 'box', w: w * 0.62, h: 2.2, d: dd * 0.62, x, y: top - 4, z, rot });
    } else if (H > 140 && crown < 0.55) {
      const sp = new THREE.ConeGeometry(Math.min(w, dd) * 0.28, H * 0.12, 4);
      sp.rotateY(Math.PI / 4 + rot);
      sp.translate(x, top + H * 0.06, z);
      towers.push(tag(sp, { ...style, seed: seed + 0.8, kind: 1, lit: 0 }));
      top += H * 0.12;
    }
    if (top > 150) emissive.red.push({ x, y: top + 1.5, z, r: 1.1 });
    landmarkSpots.push([x, z, Math.max(w, dd) * 0.8]);
    if (R.next() < 0.55) towers.push(tag(box(w * 1.8, R.range(9, 24), dd * 1.6, x, z, 0, rot), { seed: seed + 0.9, floorH: 5.5, bayW: 3.5, tint: 0.5, lit: 1.6, kind: 2 }));
  }

  // ── Urban fabric: thousands of low and mid-rise blocks out to the horizon ──
  const fabric = [];
  const spacing = 64;
  for (let gx = -110; gx <= 110; gx++) {
    for (let gz = -150; gz <= 12; gz++) {
      const x = gx * spacing + R.range(-14, 14);
      const z = gz * spacing + R.range(-14, 14);
      if (z > 360) continue;
      const d = Math.hypot(x, (z + 200) * 1.2);
      if (d > 8500) continue;
      if (R.next() < 0.22 + Math.min(0.4, d / 22000)) continue; // streets, plazas, parks
      if (near(x, z, 18)) continue;
      // density falls away from the core; occasional mid-rise clusters
      const core = Math.exp(-d / 1600);
      const cluster = Math.pow(Math.max(0, Math.sin(x * 0.0023) * Math.cos(z * 0.0019)), 3);
      const H = Math.max(8, R.range(10, 30) + core * R.range(20, 90) + cluster * R.range(20, 110));
      const w = R.range(22, 46);
      const dd = R.range(22, 46);
      const seed = 500 + fabric.length * 0.731;
      const rot = R.pick([0, 0, 0.1, -0.1]);
      const resid = H < 45 && R.next() < 0.7;
      const st = { seed, floorH: R.pick([3.1, 3.3, 3.6]), bayW: R.pick([2.0, 2.6, 3.2, 4.0]), tint: R.next(), lit: resid ? R.range(0.2, 0.9) : R.range(0.3, 1.3), kind: resid ? 1 : 0 };
      if (R.next() < 0.3 && H > 24) {
        // stepped block
        fabric.push(tag(box(w, H * 0.6, dd, x, z, 0, rot), st));
        fabric.push(tag(box(w * 0.7, H * 0.4, dd * 0.65, x, z, H * 0.6, rot), { ...st, seed: seed + 0.3 }));
      } else {
        fabric.push(tag(box(w, H, dd, x, z, 0, rot), st));
      }
      if (R.next() < 0.35) fabric.push(tag(box(w * 0.3, R.range(2.5, 5), dd * 0.3, x - w * 0.15, z, H, rot), { ...st, seed: seed + 0.7, kind: 1, lit: 0 }));
    }
  }

  const buildings = mergeGeometries([...towers, ...fabric], false);
  return { buildings, emissive, stats: { towers: towers.length, fabric: fabric.length } };
}

/* ───────────── Highways ───────────── */

/** Ribbon along a 3D curve: returns deck, parapets and per-lane trail strips. */
export function buildHighway(curve, { width = 26, lanesPerDir = 3, segments = 600, seed = 1, deckThickness = 2.2 }) {
  const pts = curve.getSpacedPoints(segments);
  const deck = [];
  const trails = [];
  const pylons = [];
  const up = new THREE.Vector3(0, 1, 0);
  const frames = pts.map((p, i) => {
    const t = curve.getTangentAt(i / segments).normalize();
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    return { p, t, side };
  });
  const len = curve.getLength();

  // deck: top, bottom and two sides as a single strip mesh
  const pos = [];
  const nrm = [];
  const led = [];
  const quad = (a, b, c, d, n, l = 0) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) {
      nrm.push(...n);
      led.push(l);
    }
  };
  for (let i = 0; i < frames.length - 1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    const corner = (f, sx, dy) => f.p.clone().addScaledVector(f.side, sx).add(new THREE.Vector3(0, dy, 0)).toArray();
    const hw = width / 2;
    quad(corner(f0, -hw, 0), corner(f1, -hw, 0), corner(f1, hw, 0), corner(f0, hw, 0), [0, 1, 0]);
    quad(corner(f0, hw, -deckThickness), corner(f1, hw, -deckThickness), corner(f1, -hw, -deckThickness), corner(f0, -hw, -deckThickness), [0, -1, 0]);
    // parapets with an LED strip under the lip
    for (const sgn of [-1, 1]) {
      const n = f0.side.clone().multiplyScalar(sgn).toArray();
      quad(corner(f0, sgn * hw, 1.1), corner(f1, sgn * hw, 1.1), corner(f1, sgn * hw, 0.0), corner(f0, sgn * hw, 0.0), n);
      quad(corner(f0, sgn * hw, -deckThickness + 0.35), corner(f1, sgn * hw, -deckThickness + 0.35), corner(f1, sgn * hw, -deckThickness), corner(f0, sgn * hw, -deckThickness), n, 1);
    }
    if (i % 14 === 0 && f0.p.y > 6) pylons.push(f0.p.clone());
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  deckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  deckGeo.setAttribute('aLed', new THREE.Float32BufferAttribute(led, 1));
  deck.push(deckGeo);
  for (const p of pylons) {
    const g = new THREE.BoxGeometry(5.5, p.y, 3.2);
    g.translate(p.x, p.y / 2 - 1, p.z);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aLed', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
    deck.push(g.toNonIndexed ? g.toNonIndexed() : g);
  }

  // trails: 2 directions × lanes, each a thin ribbon slightly above the deck
  const laneW = (width - 4) / (lanesPerDir * 2);
  const tp = [];
  const tc = [];
  const tu = [];
  const ts = [];
  const ta = [];
  const head = [1.0, 0.92, 0.82];
  const tail = [1.0, 0.16, 0.12];
  for (let dir = 0; dir < 2; dir++) {
    for (let lane = 0; lane < lanesPerDir; lane++) {
      const off = (dir === 0 ? -1 : 1) * (1 + laneW * (lane + 0.5));
      const color = dir === 0 ? head : tail;
      const lseed = seed * 10 + dir * 4 + lane;
      // Seen from a distance a lane of long-exposure traffic reads as a band about
      // a lane wide; a wider, faint strip adds the halo that cameras pick up.
      for (const [h, wv, gain] of [
        [0.8, laneW * 0.85, 1],
        [0.9, laneW * 2.0, 0.07],
      ]) {
        for (let i = 0; i < frames.length - 1; i++) {
          const f0 = frames[i];
          const f1 = frames[i + 1];
          const u0 = (i / segments) * len;
          const u1 = ((i + 1) / segments) * len;
          const pt = (f, across) => f.p.clone().addScaledVector(f.side, off + across).add(new THREE.Vector3(0, h, 0)).toArray();
          const a = pt(f0, -wv / 2);
          const b = pt(f1, -wv / 2);
          const c = pt(f1, wv / 2);
          const d = pt(f0, wv / 2);
          tp.push(...a, ...b, ...c, ...a, ...c, ...d);
          for (let k = 0; k < 6; k++) tc.push(dir, gain);
          tu.push(u0, u1, u1, u0, u1, u0);
          for (let k = 0; k < 6; k++) ts.push(lseed);
          ta.push(-1, -1, 1, -1, 1, 1);
        }
      }
    }
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  trailGeo.setAttribute('aDirGain', new THREE.Float32BufferAttribute(tc, 2));
  trailGeo.setAttribute('aU', new THREE.Float32BufferAttribute(tu, 1));
  trailGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(ts, 1));
  trailGeo.setAttribute('aAcross', new THREE.Float32BufferAttribute(ta, 1));
  trails.push(trailGeo);
  return { deck: mergeGeometries(deck.map((g) => (g.index ? g.toNonIndexed() : g)), false), trails: mergeGeometries(trails, false) };
}
