'use client';
import { RoadGraph, generateCity } from '@madar/sim-engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/motion';
import { VIEW } from './CityMap';

interface LinkGeo {
  pts: [number, number][];
  cum: number[];
  len: number;
}

/**
 * The traffic engine running live in a Web Worker. Each dot is a simulated
 * vehicle: lavender while moving, peach while queued at a junction.
 */
export function LiveTraffic({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [stats, setStats] = useState({ t: 0, vehicles: 0, completed: 0, queued: 0, seed: 42 });

  const geo = useMemo(() => {
    const city = generateCity();
    const g = new RoadGraph(city);
    const links: LinkGeo[] = city.links.map((_, li) => {
      const pts = g.linkPolyline(li).map((p) => [p.x, p.y] as [number, number]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, cum, len: cum[cum.length - 1]! };
    });
    return { links, city };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const ctx = c.getContext('2d')!;
    let frame: { data: Uint32Array; count: number } | null = null;
    let raf = 0;
    let visible = false;
    let base: HTMLCanvasElement | null = null;

    const toPx = (x: number, y: number, W: number, H: number) => {
      const s = Math.min(W / VIEW.w, H / VIEW.h);
      const ox = (W - VIEW.w * s) / 2;
      const oy = (H - VIEW.h * s) / 2;
      return [ox + (x - VIEW.x) * s, oy + (-y - VIEW.y) * s, s] as const;
    };
    const drawBase = (W: number, H: number) => {
      base = document.createElement('canvas');
      base.width = W;
      base.height = H;
      const b = base.getContext('2d')!;
      b.lineCap = 'round';
      b.lineJoin = 'round';
      for (const l of geo.links) {
        b.beginPath();
        l.pts.forEach(([x, y], i) => {
          const [px, py] = toPx(x, y, W, H);
          if (i) b.lineTo(px, py);
          else b.moveTo(px, py);
        });
        b.strokeStyle = 'rgba(219,207,255,0.13)';
        b.lineWidth = Math.max(2, W / 260);
        b.stroke();
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w.clientWidth * dpr);
      c.height = Math.round(w.clientHeight * dpr);
      drawBase(c.width, c.height);
    };
    const render = () => {
      const W = c.width;
      const H = c.height;
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0);
      if (frame) {
        const r = Math.max(2, W / 520);
        const d = frame.data;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < frame.count; i++) {
          const li = d[i * 4 + 1]!;
          const pos = d[i * 4 + 2]! / 10;
          const queued = (d[i * 4 + 3]! & 1) === 1;
          const lane = d[i * 4 + 3]! >> 1;
          const L = geo.links[li];
          if (!L) continue;
          let k = 1;
          while (k < L.cum.length - 1 && L.cum[k]! < pos) k++;
          const a = L.pts[k - 1]!;
          const b = L.pts[k]!;
          const seg = L.cum[k]! - L.cum[k - 1]! || 1;
          const t = Math.min(1, Math.max(0, (pos - L.cum[k - 1]!) / seg));
          const dx = (b[0] - a[0]) / seg;
          const dy = (b[1] - a[1]) / seg;
          const off = 14 + lane * 12; // keep right: offset perpendicular to travel
          const x = a[0] + (b[0] - a[0]) * t + dy * off;
          const y = a[1] + (b[1] - a[1]) * t - dx * off;
          const [px, py] = toPx(x, y, W, H);
          ctx.fillStyle = queued ? 'rgba(255,181,142,0.95)' : 'rgba(200,190,255,0.85)';
          ctx.beginPath();
          ctx.arc(px, py, r * 0.62, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    let worker: Worker | null = null;
    if (!reduced) {
      worker = new Worker(new URL('../../workers/traffic.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data as { data: Uint32Array; count: number; t: number; vehicles: number; completed: number; seed: number };
        frame = m;
        let q = 0;
        for (let i = 0; i < m.count; i++) q += m.data[i * 4 + 3]! & 1;
        if (Math.round(m.t) % 2 === 0) setStats({ t: m.t, vehicles: m.vehicles, completed: m.completed, queued: Math.round((q / Math.max(1, m.count)) * 100), seed: m.seed });
      };
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) {
        worker?.postMessage({ type: 'start', speed: 1 });
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
      } else {
        worker?.postMessage({ type: 'stop' });
        cancelAnimationFrame(raf);
      }
    });
    io.observe(w);
    return () => {
      io.disconnect();
      worker?.terminate();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [geo, reduced]);

  const clock = (s: number) => {
    const m = 7 * 60 + Math.floor(s / 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  return (
    <div className={className}>
      <div ref={wrap} className="relative aspect-[6300/4300] w-full">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Live simulation of vehicles moving through Madar's road network" role="img" />
        {reduced && <p className="absolute inset-0 grid place-items-center text-sm text-sand/60">Live simulation paused (reduced motion is on).</p>}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line-dark text-sand sm:grid-cols-4" aria-live="off">
        {[
          ['Simulated time', clock(stats.t)],
          ['Vehicles on the network', stats.vehicles.toLocaleString('en-US')],
          ['Trips completed', stats.completed.toLocaleString('en-US')],
          ['Queued at junctions', `${stats.queued}%`],
        ].map(([k, v]) => (
          <div key={k} className="bg-ink px-4 py-4 sm:px-5">
            <dt className="text-[0.75rem] text-sand/60">{k}</dt>
            <dd className="mt-1 text-xl tabular-nums md:text-2xl">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-sand/50">
        Running now in your browser: MADAR engine, synthetic city, seed {stats.seed}. 20× real time.
      </p>
    </div>
  );
}
