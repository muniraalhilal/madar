'use client';
import data from '@/data/landing.json';
import { cn } from '@/lib/cn';

export type MapLayer = 'movement' | 'connection' | 'harmony' | 'progress';

type Link = (typeof data.city.links)[number];

export const VIEW = { x: -3150, y: -2620, w: 6300, h: 4300 }; // y flipped: north is up

export const pathOf = (pts: number[][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${-(y as number)}`).join(' ');

/** Colour ramp for congestion 0…1: lavender → mist → peach. */
export function congestionColor(c: number, alpha = 1) {
  const stops = [
    [0.0, [124, 217, 199]],
    [0.25, [180, 163, 230]],
    [0.45, [139, 124, 246]],
    [0.65, [255, 181, 142]],
    [1.0, [255, 120, 120]],
  ] as const;
  let i = 0;
  while (i < stops.length - 2 && c > stops[i + 1]![0]) i++;
  const [a, ca] = stops[i]!;
  const [b, cb] = stops[i + 1]!;
  const t = Math.min(1, Math.max(0, (c - a) / (b - a)));
  const mix = ca.map((v, k) => Math.round(v + ((cb[k] as number) - v) * t));
  return `rgba(${mix[0]},${mix[1]},${mix[2]},${alpha})`;
}

const width = (l: Link) => (l.cls === 'ring' ? 46 : l.cls === 'boulevard' ? 42 : l.cls === 'arterial' || l.cls === 'corniche' ? 32 : l.cls === 'collector' ? 24 : 16);

export function CityMap({
  layer,
  congestion,
  theme = 'light',
  className,
  highlightDistrict,
  onDistrict,
  children,
  label,
}: {
  layer: MapLayer;
  congestion?: Record<string, number>;
  theme?: 'light' | 'dark';
  className?: string;
  highlightDistrict?: string | null;
  onDistrict?: (id: string | null) => void;
  children?: React.ReactNode;
  label: string;
}) {
  const dark = theme === 'dark';
  const road = dark ? 'rgba(219,207,255,0.16)' : 'rgba(11,14,26,0.16)';
  const c = congestion ?? data.baseline.congestion;
  const maxH = Math.max(...data.city.buildings.map((b) => b.h));
  return (
    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className={cn('h-auto w-full', className)} role="img" aria-label={label}>
      {/* bay */}
      <path d={`M${VIEW.x} 1250 C -1500 1320, 1200 1330, ${VIEW.x + VIEW.w} 1180 L ${VIEW.x + VIEW.w} ${VIEW.y + VIEW.h} L ${VIEW.x} ${VIEW.y + VIEW.h} Z`} fill={dark ? 'rgba(139,124,246,0.07)' : 'rgba(139,124,246,0.08)'} />
      {data.city.districts.map((d) => {
        const on = layer === 'harmony' || highlightDistrict === d.id;
        return (
          <path
            key={d.id}
            d={pathOf(d.boundary) + 'Z'}
            fill={d.color}
            fillOpacity={on ? (highlightDistrict === d.id ? 0.38 : 0.24) : dark ? 0.04 : 0.06}
            stroke={d.color}
            strokeOpacity={on ? 0.7 : dark ? 0.12 : 0.18}
            strokeWidth={8}
            strokeDasharray={on ? undefined : '30 30'}
            onPointerEnter={() => onDistrict?.(d.id)}
            onPointerLeave={() => onDistrict?.(null)}
            className="transition-[fill-opacity,stroke-opacity] duration-500"
          />
        );
      })}
      <g opacity={layer === 'progress' ? 1 : 0.9} className="transition-opacity duration-500">
        {data.city.buildings.map((b) => (
          <path
            key={b.id}
            d={pathOf(b.fp) + 'Z'}
            fill={layer === 'progress' ? `rgba(139,124,246,${0.18 + 0.8 * Math.pow(b.h / maxH, 0.6)})` : dark ? 'rgba(219,207,255,0.09)' : 'rgba(11,14,26,0.10)'}
            className="transition-[fill] duration-500"
          />
        ))}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {data.city.links.map((l) => {
          const cong = Math.max(c[l.id as keyof typeof c] ?? 0, c[l.rev as keyof typeof c] ?? 0);
          const stroke = layer === 'movement' ? congestionColor(cong, 0.95) : layer === 'connection' ? (dark ? 'rgba(180,163,230,0.6)' : 'rgba(91,75,214,0.55)') : road;
          return <path key={l.id} d={pathOf(l.pts)} stroke={stroke} strokeWidth={width(l)} className="transition-[stroke] duration-500" />;
        })}
      </g>
      {layer === 'connection' && (
        <g>
          {data.city.nodes
            .filter((n) => n.kind !== 'priority')
            .map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={-n.y} r={n.kind === 'gateway' ? 46 : 34} fill={n.kind === 'gateway' ? '#7CD9C7' : '#8B7CF6'} />
                <circle cx={n.x} cy={-n.y} r={n.kind === 'gateway' ? 90 : 70} fill="none" stroke={n.kind === 'gateway' ? '#7CD9C7' : '#8B7CF6'} strokeOpacity={0.35} strokeWidth={6} />
              </g>
            ))}
        </g>
      )}
      {layer === 'harmony' &&
        data.city.districts.map((d) => {
          const xs = d.boundary.map((p) => p[0] as number);
          const ys = d.boundary.map((p) => p[1] as number);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          return (
            <text key={d.id} x={cx} y={-cy} textAnchor="middle" fontSize={120} fill={dark ? '#F6F4F1' : '#0B0E1A'} fontFamily="Space Grotesk, sans-serif" fontWeight={500} style={{ pointerEvents: 'none' }}>
              {d.name.replace(' District', '')}
            </text>
          );
        })}
      {children}
    </svg>
  );
}
