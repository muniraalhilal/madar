'use client';
import { MapControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { Building, CityNetwork, Frame, NetworkLink } from '@madar/sim-engine';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { congestionColor } from '@/components/landing/CityMap';

export type Selection = { type: 'road'; id: string } | { type: 'intersection'; id: string } | { type: 'building'; id: string } | null;

const LANE = 3.4;
const toV = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y);

/* ───────────── facade texture (shared image, per-mesh repeat) ───────────── */
function facadeTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#151a33';
  g.fillRect(0, 0, 64, 64);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const lit = rnd() < 0.42;
      g.fillStyle = lit ? (rnd() < 0.6 ? '#ffd7a8' : '#dcd6ff') : '#1f2647';
      g.globalAlpha = lit ? 0.55 + rnd() * 0.45 : 1;
      g.fillRect(x * 8 + 1.5, y * 8 + 2, 5, 4.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

function linkRibbon(points: THREE.Vector3[], width: number, offset: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x); // right-hand side of travel
    const p = points[i]!;
    const l = p.clone().addScaledVector(right, offset);
    const r = p.clone().addScaledVector(right, offset + width);
    pos.push(l.x, 0.6, l.z, r.x, 0.6, r.z);
    if (i < points.length - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Roads({ city, congestion, selected, onSelect }: { city: CityNetwork; congestion?: Record<string, number>; selected: Selection; onSelect: (s: Selection) => void }) {
  const nodes = useMemo(() => new Map(city.nodes.map((n) => [n.id, n])), [city]);
  const geos = useMemo(
    () =>
      city.links.map((l: NetworkLink) => {
        const a = nodes.get(l.from)!;
        const b = nodes.get(l.to)!;
        const pts = [toV(a.x, a.y), ...(l.shape ?? []).map((p) => toV(p.x, p.y)), toV(b.x, b.y)];
        return { id: l.id, geo: linkRibbon(pts, l.lanes * LANE * 1.6, 1.2) };
      }),
    [city, nodes],
  );
  useEffect(() => () => geos.forEach((g) => g.geo.dispose()), [geos]);
  return (
    <group>
      {geos.map(({ id, geo }) => {
        const c = congestion?.[id];
        const isSel = selected?.type === 'road' && selected.id === id;
        const color = isSel ? '#ffffff' : c === undefined ? '#3a3f66' : congestionColor(c);
        return (
          <mesh
            key={id}
            geometry={geo}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect({ type: 'road', id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Junctions({ city, selected, onSelect }: { city: CityNetwork; selected: Selection; onSelect: (s: Selection) => void }) {
  const signals = useMemo(() => new Set(city.signals.map((s) => s.nodeId)), [city]);
  return (
    <group>
      {city.nodes.map((n) => {
        const isSel = selected?.type === 'intersection' && selected.id === n.id;
        const sig = signals.has(n.id);
        return (
          <mesh
            key={n.id}
            position={toV(n.x, n.y, 1.2)}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ type: 'intersection', id: n.id });
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <circleGeometry args={[n.kind === 'gateway' ? 34 : sig ? 26 : 18, 32]} />
            <meshBasicMaterial color={isSel ? '#ffffff' : n.kind === 'gateway' ? '#7CD9C7' : sig ? '#8B7CF6' : '#5b6087'} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Buildings({ city, selected, onSelect }: { city: CityNetwork; selected: Selection; onSelect: (s: Selection) => void }) {
  const items = useMemo(() => {
    const base = facadeTexture(7);
    return city.buildings.map((b: Building, i) => {
      const xs = b.footprint.map((p) => p.x);
      const ys = b.footprint.map((p) => p.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const d = Math.max(...ys) - Math.min(...ys);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      // tall towers taper visually: narrower box on top of a podium
      const tex = base.clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 80)), Math.max(1, Math.round(b.floors / 22)));
      tex.offset.set((i * 0.37) % 1, (i * 0.13) % 1);
      return { b, w, d, cx, cy, tex };
    });
  }, [city]);
  useEffect(() => () => items.forEach((x) => x.tex.dispose()), [items]);
  return (
    <group>
      {items.map(({ b, w, d, cx, cy, tex }) => {
        const isSel = selected?.type === 'building' && selected.id === b.id;
        const tower = b.height > 150;
        const shaftW = tower ? w * 0.55 : w;
        const shaftD = tower ? d * 0.55 : d;
        const color = isSel ? '#b4a3e6' : b.use === 'civic' ? '#d8cfc4' : b.use === 'residential' ? '#9aa0bd' : '#c9cbe0';
        const select = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'building', id: b.id });
        };
        return (
          <group key={b.id} position={toV(cx, cy)}>
            {tower && (
              <mesh position={[0, 14, 0]} onClick={select}>
                <boxGeometry args={[w, 28, d]} />
                <meshStandardMaterial color="#8d91ad" roughness={0.6} metalness={0.2} />
              </mesh>
            )}
            <mesh position={[0, b.height / 2, 0]} onClick={select} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
              <boxGeometry args={[shaftW, b.height, shaftD]} />
              <meshStandardMaterial color={color} map={tex} emissiveMap={tex} emissive={'#ffffff'} emissiveIntensity={0.38} roughness={0.3} metalness={0.5} />
            </mesh>
            {b.name === 'Madar Tower' && (
              <mesh position={[0, b.height + 22, 0]} rotation={[Math.PI / 2 + 0.35, 0, 0.2]}>
                <torusGeometry args={[40, 1.6, 12, 96]} />
                <meshBasicMaterial color="#b4a3e6" toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Districts({ city }: { city: CityNetwork }) {
  const shapes = useMemo(
    () =>
      city.districts.map((d) => {
        const s = new THREE.Shape(d.boundary.map((p) => new THREE.Vector2(p.x, p.y)));
        return { id: d.id, color: d.color, geo: new THREE.ShapeGeometry(s) };
      }),
    [city],
  );
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {shapes.map((s) => (
        <mesh key={s.id} geometry={s.geo} position={[0, 0, 0.2]}>
          <meshBasicMaterial color={s.color} transparent opacity={0.07} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Vehicles as instanced boxes, positioned from packed playback frames (see sim-engine Frame). */
function Vehicles({ city, frame }: { city: CityNetwork; frame: Frame | null }) {
  const MAX = 3200;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const nodes = new Map(city.nodes.map((n) => [n.id, n]));
    return city.links.map((l) => {
      const a = nodes.get(l.from)!;
      const b = nodes.get(l.to)!;
      const pts = [a, ...(l.shape ?? []), b].map((p) => [p.x, p.y] as [number, number]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, cum, lanes: l.lanes };
    });
  }, [city]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const colA = useMemo(() => new THREE.Color('#e7e2ff'), []);
  const colQ = useMemo(() => new THREE.Color('#ffb58e'), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    let n = 0;
    if (frame) {
      const d = frame.data;
      for (let i = 0; i < frame.count && n < MAX; i++) {
        const L = geo[d[i * 4 + 1]!];
        if (!L) continue;
        const pos = d[i * 4 + 2]! / 10;
        const queued = (d[i * 4 + 3]! & 1) === 1;
        const lane = Math.min(L.lanes - 1, d[i * 4 + 3]! >> 1);
        let k = 1;
        while (k < L.cum.length - 1 && L.cum[k]! < pos) k++;
        const a = L.pts[k - 1]!;
        const b = L.pts[k]!;
        const seg = L.cum[k]! - L.cum[k - 1]! || 1;
        const t = Math.min(1, Math.max(0, (pos - L.cum[k - 1]!) / seg));
        const dx = (b[0] - a[0]) / seg;
        const dy = (b[1] - a[1]) / seg;
        const off = 1.2 + (lane + 0.5) * LANE * 1.6;
        const x = a[0] + (b[0] - a[0]) * t + dy * off;
        const y = a[1] + (b[1] - a[1]) * t - dx * off;
        tmp.position.set(x, 3, -y);
        tmp.rotation.set(0, Math.atan2(dy, dx), 0);
        tmp.updateMatrix();
        m.setMatrixAt(n, tmp.matrix);
        m.setColorAt(n, queued ? colQ : colA);
        n++;
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [frame, geo, tmp, colA, colQ]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[14, 5, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function CameraRig({ focus }: { focus: THREE.Vector3 | null }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | undefined };
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    goal.current = focus;
  }, [focus]);
  useFrame(() => {
    if (!goal.current || !controls) return;
    controls.target.lerp(goal.current, 0.08);
    const offset = camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target.clone().add(offset));
    controls.update();
    if (controls.target.distanceTo(goal.current) < 2) goal.current = null;
  });
  return null;
}

export function CityScene({
  city,
  congestion,
  frame,
  selected,
  onSelect,
  focus,
}: {
  city: CityNetwork;
  congestion?: Record<string, number>;
  frame: Frame | null;
  selected: Selection;
  onSelect: (s: Selection) => void;
  focus: THREE.Vector3 | null;
}) {
  return (
    <Canvas
      camera={{ position: [1500, 1250, 2300], fov: 40, near: 5, far: 30000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color('#0b0e1a');
        scene.fog = new THREE.Fog('#0b0e1a', 5200, 11000);
      }}
    >
      <hemisphereLight args={['#c9bfff', '#1b1730', 1.1]} />
      <directionalLight position={[-2000, 2600, 1200]} intensity={1.6} color="#ffd9c7" />
      <directionalLight position={[2400, 1500, -1800]} intensity={0.6} color="#8b7cf6" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} onClick={() => onSelect(null)}>
        <planeGeometry args={[16000, 12000]} />
        <meshStandardMaterial color="#10142a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 1250 + 2500]}>
        <planeGeometry args={[16000, 5000]} />
        <meshStandardMaterial color="#1a1840" roughness={0.25} metalness={0.6} />
      </mesh>
      <Districts city={city} />
      <Roads city={city} congestion={congestion} selected={selected} onSelect={onSelect} />
      <Junctions city={city} selected={selected} onSelect={onSelect} />
      <Buildings city={city} selected={selected} onSelect={onSelect} />
      <Vehicles city={city} frame={frame} />
      <MapControls makeDefault enableDamping dampingFactor={0.08} minDistance={250} maxDistance={7500} maxPolarAngle={Math.PI / 2.25} target={[0, 0, -200]} />
      <CameraRig focus={focus} />
    </Canvas>
  );
}
