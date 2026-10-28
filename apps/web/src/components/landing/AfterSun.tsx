'use client';
import { useEffect, useRef, useState } from 'react';
import data from '@/data/landing.json';
import { trackProgress, usePrefersReducedMotion } from '@/lib/motion';
import { Still } from './Still';

/**
 * Section 4 — After the sun. Before tomorrow.
 * Scroll moves the clock from 18:00 to 23:00: the twilight render dissolves
 * into the night render (same camera) while the building-energy model's
 * hourly load is traced underneath.
 */
export function AfterSun() {
  const track = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => track.current && setP(trackProgress(track.current)));
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [reduced]);

  const prog = reduced ? 1 : p;
  const hour = 18 + prog * 5;
  const kwh = data.energy.hourlyKwh;
  const max = Math.max(...kwh);
  const W = 600;
  const H = 150;
  const pt = (h: number) => [(h / 23) * W, H - (kwh[h]! / max) * (H - 12) - 4] as const;
  const line = kwh.map((_, h) => `${h ? 'L' : 'M'}${pt(h)[0].toFixed(1)} ${pt(h)[1].toFixed(1)}`).join(' ');
  const hi = Math.min(23, Math.floor(hour));
  const frac = hour - hi;
  const now = kwh[hi]! + ((kwh[Math.min(23, hi + 1)] ?? kwh[hi]!) - kwh[hi]!) * frac;
  const x = (hour / 23) * W;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;

  return (
    <section ref={track} className={reduced ? 'relative bg-ink' : 'relative h-[240svh] bg-ink'} aria-labelledby="aftersun-title">
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden md:block">
        <div className="relative min-h-0 flex-1 md:absolute md:inset-0">
          <Still name="hero" alt="Madar at sunset." className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0" style={{ opacity: smooth(0.1, 0.85, prog) }}>
            <Still name="night" alt="The same view of Madar after dark, windows and highways lit." className="absolute inset-0 h-full w-full" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/50 md:via-ink/0" />
          <div className="absolute inset-y-0 left-0 hidden w-2/3 bg-gradient-to-r from-ink/80 to-transparent md:block" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1480px] px-5 pb-8 pt-6 md:absolute md:inset-x-0 md:bottom-0 md:px-10 md:pb-16">
          <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-end">
            <div>
              <h2 id="aftersun-title" className="display-caps text-[clamp(1.9rem,4.2vw,4rem)] text-white">
                After the sun.
                <br />
                Before tomorrow.
              </h2>
              <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-sand/85 md:text-lg">
                As the city cools, its buildings don&rsquo;t. MADAR&rsquo;s energy model follows {data.city.counts.buildings} buildings through a synthetic hot day — lighting, occupancy and the cooling load that peaks long
                after sunset.
              </p>
            </div>
            <figure className="rounded-3xl border border-white/10 bg-ink/55 p-5 backdrop-blur-md">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-4xl font-light tabular-nums md:text-5xl" aria-label={`Time ${clock}`}>
                  {clock}
                </span>
                <span className="text-right text-sm text-sand/75">
                  <span className="block text-2xl text-white tabular-nums">{(now / 1000).toFixed(1)} MWh</span>
                  city building load this hour
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-4 w-full" role="img" aria-label="Hourly building energy load over 24 hours, peaking in the afternoon and easing after dark">
                <defs>
                  <linearGradient id="en-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#8B7CF6" stopOpacity="0.45" />
                    <stop offset="1" stopColor="#8B7CF6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill="url(#en-fill)" />
                <path d={line} fill="none" stroke="#B4A3E6" strokeWidth="2" />
                <rect x={(18 / 23) * W} y="0" width={(5 / 23) * W} height={H} fill="#DBCFFF" opacity="0.06" />
                <line x1={x} x2={x} y1="0" y2={H} stroke="#FFB58E" strokeWidth="1.5" />
                <circle cx={x} cy={H - (now / max) * (H - 12) - 4} r="5" fill="#FFB58E" />
                {[0, 6, 12, 18, 23].map((h) => (
                  <text key={h} x={(h / 23) * W} y={H + 20} fill="#8D93A6" fontSize="13" textAnchor={h === 0 ? 'start' : h === 23 ? 'end' : 'middle'}>
                    {String(h).padStart(2, '0')}:00
                  </text>
                ))}
              </svg>
              <figcaption className="mt-2 text-xs text-sand/55">Model estimate under stated assumptions (synthetic 33 °C day). Daily total {(data.energy.dailyKwh / 1000).toFixed(0)} MWh.</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
