'use client';
import { RoadGraph, type CityNetwork, type Frame } from '@madar/sim-engine';
import { useEffect, useMemo, useRef } from 'react';
import { congestionColor, VIEW } from '@/components/landing/CityMap';

interface LinkGeo {
  pts: [number, number][];
  cum: number[];
}

/**
 * Top-down playback of one recorded run: roads tinted by that run's average
 * congestion, and every simulated vehicle at the selected frame (lavender while
 * moving, peach while queued). Frames come from the run's stored playback.
 */
export function PlaybackMap({ city, frame, congestion, label }: { city: CityNetwork; frame: Frame | null; congestion?: Record<string, number>; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);

  const geo = useMemo(() => {
    const g = new RoadGraph(city);
    return city.links.map((_, li): LinkGeo => {
      const pts = g.linkPolyline(li).map((p) => [p.x, p.y] as [number, number]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, cum };
    });
  }, [city]);

  const toPx = (x: number, y: number, W: number, H: number) => {
    const s = Math.min(W / VIEW.w, H / VIEW.h);
    return [(W - VIEW.w * s) / 2 + (x - VIEW.x) * s, (H - VIEW.h * s) / 2 + (-y - VIEW.y) * s] as const;
  };

  // Static layer: districts outline and roads coloured by congestion.
  useEffect(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w.clientWidth * dpr);
      c.height = Math.round(w.clientHeight * dpr);
      const b = document.createElement('canvas');
      b.width = c.width;
      b.height = c.height;
      const ctx = b.getContext('2d')!;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const d of city.districts) {
        ctx.beginPath();
        d.boundary.forEach((p, i) => {
          const [px, py] = toPx(p.x, p.y, b.width, b.height);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = `${d.color}0d`;
        ctx.fill();
      }
      city.links.forEach((l, li) => {
        const g = geo[li]!;
        ctx.beginPath();
        g.pts.forEach(([x, y], i) => {
          const [px, py] = toPx(x, y, b.width, b.height);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.strokeStyle = congestion ? congestionColor(congestion[l.id] ?? 0, 0.42) : 'rgba(219,207,255,0.16)';
        ctx.lineWidth = Math.max(2, b.width / 300) * (l.lanes >= 3 ? 1.5 : 1);
        ctx.stroke();
      });
      base.current = b;
      paint();
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(w);
    return () => ro.disconnect();
  }, [city, geo, congestion]);

  const paint = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (base.current) ctx.drawImage(base.current, 0, 0);
    if (!frame) return;
    const r = Math.max(1.6, c.width / 620);
    const d = frame.data;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < frame.count; i++) {
      const g = geo[d[i * 4 + 1]!];
      if (!g) continue;
      const pos = d[i * 4 + 2]! / 10;
      const queued = (d[i * 4 + 3]! & 1) === 1;
      const lane = d[i * 4 + 3]! >> 1;
      let k = 1;
      while (k < g.cum.length - 1 && g.cum[k]! < pos) k++;
      const a = g.pts[k - 1]!;
      const bb = g.pts[k]!;
      const seg = g.cum[k]! - g.cum[k - 1]! || 1;
      const t = Math.min(1, Math.max(0, (pos - g.cum[k - 1]!) / seg));
      const dx = (bb[0] - a[0]) / seg;
      const dy = (bb[1] - a[1]) / seg;
      const off = 14 + lane * 12; // keep right
      const [px, py] = toPx(a[0] + (bb[0] - a[0]) * t + dy * off, a[1] + (bb[1] - a[1]) * t - dx * off, c.width, c.height);
      ctx.fillStyle = queued ? 'rgba(255,181,142,0.95)' : 'rgba(200,190,255,0.85)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  useEffect(paint);

  return (
    <div ref={wrap} className="relative aspect-[6300/4300] w-full">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={label} />
    </div>
  );
}
