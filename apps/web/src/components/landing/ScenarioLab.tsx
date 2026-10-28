'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import data from '@/data/landing.json';
import { CityMap } from './CityMap';

const fmt = (v: number, unit: string) => (unit === 's' ? (v >= 120 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(0)} s`) : unit === 'veh/h' || unit === 'trips' ? Math.round(v).toLocaleString('en-US') : unit === 'kg' ? `${(v / 1000).toFixed(2)} t` : `${v.toFixed(v < 10 ? 2 : 0)} ${unit}`);

const SHOW = ['meanTravelTime', 'meanWaitTime', 'p95TravelTime', 'tripsCompleted', 'maxQueue', 'co2Kg'];

/** Section 6 — What if you could see what's next? */
export function ScenarioLab() {
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(96, Math.max(4, ((clientX - r.left) / r.width) * 100)));
  }, []);
  const rows = data.optimisedDeltas.filter((d) => SHOW.includes(d.key));
  return (
    <section id="scenario-lab" className="relative bg-ink" aria-labelledby="lab-title">
      <div className="mx-auto max-w-[1480px] px-5 py-24 md:px-10 md:py-36">
        <div className="grid gap-6 md:grid-cols-2 md:items-end">
          <h2 id="lab-title" className="display-caps text-[clamp(2rem,4.4vw,4.2rem)] text-white">
            What if you could
            <br />
            see what&rsquo;s next?
          </h2>
          <p className="max-w-[46ch] text-lg leading-relaxed text-sand/80 md:justify-self-end">
            The Scenario Lab runs two versions of the same morning side by side. Here, the baseline&rsquo;s fixed 35/35-second signals against timings MADAR proposed with Webster&rsquo;s method —
            {' '}{data.optimised.signalsRetimed} junctions retimed, same seed, same demand.
          </p>
        </div>

        <div
          ref={box}
          className="relative mt-14 touch-none select-none overflow-hidden rounded-[28px] border border-line-dark bg-midnight"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            move(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && move(e.clientX)}
        >
          <CityMap layer="movement" theme="dark" congestion={data.optimised.congestion} label="Congestion with optimised signal timings" className="block" />
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            <div className="h-full w-full bg-midnight">
              <CityMap layer="movement" theme="dark" congestion={data.baseline.congestion} label="Congestion with baseline signal timings" className="block" />
            </div>
          </div>
          <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1.5 text-xs text-sand/85 backdrop-blur">Baseline · fixed timings</span>
          <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-lavender/85 px-3 py-1.5 text-xs text-white backdrop-blur">Variant · Webster timings</span>
          <div className="absolute inset-y-0" style={{ left: `${split}%` }}>
            <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/80" />
            <input
              type="range"
              min={4}
              max={96}
              value={Math.round(split)}
              onChange={(e) => setSplit(Number(e.target.value))}
              aria-label="Compare baseline and variant"
              className="sr-only"
            />
            <div className="absolute top-1/2 -ml-6 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-ink/80 text-white shadow-xl backdrop-blur">
              <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
                <path d="M6 1 L1 6 L6 11 M14 1 L19 6 L14 11" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          </div>
        </div>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <caption className="sr-only">Baseline versus variant metrics</caption>
            <thead>
              <tr className="text-[0.78rem] text-sand/55">
                <th className="py-3 font-normal">Metric</th>
                <th className="py-3 font-normal">Baseline</th>
                <th className="py-3 font-normal">Variant</th>
                <th className="py-3 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.key} className="border-t border-line-dark text-sand">
                  <td className="py-4 pr-4">
                    {m.label}
                    {m.kind === 'estimate' && <span className="ml-2 rounded-full border border-line-dark px-2 py-0.5 text-[0.68rem] text-sand/60">estimate</span>}
                  </td>
                  <td className="py-4 tabular-nums text-sand/75">{fmt(m.baseline, m.unit)}</td>
                  <td className="py-4 tabular-nums">{fmt(m.variant, m.unit)}</td>
                  <td className={`py-4 text-right tabular-nums ${m.verdict === 'improved' ? 'text-mint' : m.verdict === 'worse' ? 'text-peach' : 'text-sand/60'}`}>
                    {m.percent === null ? '—' : `${m.percent > 0 ? '+' : ''}${m.percent.toFixed(1)} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link href="/app/scenarios" className="pill pill-primary">
            Open the Scenario Lab
          </Link>
          <p className="text-sm text-sand/55">Engine v{data.engineVersion} · seed {data.seed} · fingerprints {data.baseline.fingerprint.slice(0, 8)} / {data.optimised.fingerprint.slice(0, 8)}</p>
        </div>
      </div>
    </section>
  );
}
