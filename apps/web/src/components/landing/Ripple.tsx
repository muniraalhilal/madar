'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import data from '@/data/landing.json';
import { trackProgress, usePrefersReducedMotion } from '@/lib/motion';
import { CityMap, pathOf } from './CityMap';

const byId = new Map<string, number[][]>();
for (const l of data.city.links) {
  byId.set(l.id, l.pts);
  byId.set(l.rev, [...l.pts].reverse());
}
const routePts = (ids: string[]) => ids.flatMap((id, i) => (i ? byId.get(id)!.slice(1) : byId.get(id)!));
const pct = (key: string) => data.closure.deltas.find((d) => d.key === key)!;

/** Section 5 — Every change creates a ripple. */
export function Ripple() {
  const track = useRef<HTMLElement>(null);
  const before = useRef<SVGPathElement>(null);
  const after = useRef<SVGPathElement>(null);
  const reduced = usePrefersReducedMotion();
  const [p, setP] = useState(0);
  const [lens, setLens] = useState({ a: 1, b: 1 });

  useEffect(() => {
    setLens({ a: before.current?.getTotalLength() ?? 1, b: after.current?.getTotalLength() ?? 1 });
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
  const s1 = clamp((prog - 0.04) / 0.26);
  const s2 = clamp((prog - 0.32) / 0.14);
  const s3 = clamp((prog - 0.48) / 0.3);
  const s4 = clamp((prog - 0.8) / 0.15);
  const step = s4 > 0.3 ? 3 : s3 > 0 ? 2 : s2 > 0.2 ? 1 : 0;

  const closurePts = byId.get('c3r2>c3r3')!;
  const [cx, cy] = [(closurePts[0]![0]! + closurePts.at(-1)![0]!) / 2, -((closurePts[0]![1]! + closurePts.at(-1)![1]!) / 2)];

  const congestion = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(data.baseline.congestion)) {
      const a = data.baseline.congestion[k as keyof typeof data.baseline.congestion] as number;
      const b = (data.closure.congestion as Record<string, number>)[k] ?? a;
      out[k] = a + (b - a) * s4;
    }
    return out;
  }, [s4]);

  const tt = pct('meanTravelTime');
  const steps = [
    { n: 'I', title: 'A normal morning', text: `The quickest way from ${data.route.from} to ${data.route.to} runs straight up Orbit Boulevard: about ${Math.round(data.route.before.seconds)} seconds at free-flow speed.` },
    { n: 'II', title: 'One block closes', text: 'At 07:05 Orbit Boulevard closes for works between Noor Square and Orbit Circle, in both directions. Vehicles already heading that way only find out at the next junction.' },
    { n: 'III', title: 'The city re-routes', text: `A* finds the next-best path — ${Math.round(data.route.after.seconds)} s at free flow — and ${data.closure.reroutes.toLocaleString('en-US')} vehicles re-plan mid-trip.` },
    { n: 'IV', title: 'The ripple', text: `Side streets absorb the traffic. Across the whole network, average travel time moves ${tt.percent! > 0 ? '+' : ''}${tt.percent!.toFixed(1)} % — one closed block, felt everywhere.` },
  ];

  return (
    <section ref={track} className={reduced ? 'relative bg-midnight' : 'relative h-[320svh] bg-midnight'} aria-labelledby="ripple-title">
      <div className="sticky top-0 flex min-h-[100svh] flex-col justify-center overflow-hidden pb-6 pt-20 md:py-20">
        <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 md:px-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
          <div>
            <h2 id="ripple-title" className="display-caps text-[clamp(1.6rem,4vw,3.8rem)] text-white">
              Every change
              <br />
              creates a ripple.
            </h2>
            <ol className="mt-5 space-y-1 md:mt-8">
              {steps.map((s, i) => (
                <li key={s.n} className={`grid-cols-[2.4rem_1fr] gap-x-3 rounded-2xl px-3 py-3 transition-colors duration-500 ${i === step ? 'grid bg-white/[0.06]' : reduced ? 'grid' : 'hidden md:grid'}`} aria-current={i === step ? 'step' : undefined}>
                  <span className={`font-display text-lg transition-colors ${i === step ? 'text-lavender-soft' : 'text-sand/35'}`}>{s.n}</span>
                  <div>
                    <p className={`font-medium transition-colors ${i === step ? 'text-white' : 'text-sand/45'}`}>{s.title}</p>
                    <p className={`overflow-hidden text-[0.95rem] leading-relaxed text-sand/75 transition-all duration-500 ${i === step || reduced ? 'mt-1 max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative">
            <CityMap layer="movement" theme="dark" congestion={congestion} label="Map showing the route before and after a closure on Orbit Boulevard, and congestion spreading to nearby roads">
              <path ref={before} d={pathOf(routePts(data.route.before.links))} fill="none" stroke="#DBCFFF" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={lens.a} strokeDashoffset={lens.a * (1 - s1)} opacity={1 - s3 * 0.75} />
              <path ref={after} d={pathOf(routePts(data.route.after.links))} fill="none" stroke="#7CD9C7" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={lens.b} strokeDashoffset={lens.b * (1 - s3)} />
              <g opacity={s2} transform={`translate(${cx} ${cy})`}>
                {[0, 1, 2].map((k) => {
                  const r = 120 + ((s3 * 2.2 + k / 3) % 1) * 700;
                  return <circle key={k} r={r} fill="none" stroke="#FFB58E" strokeWidth={10} opacity={s3 > 0 ? Math.max(0, 1 - r / 820) : 0} />;
                })}
                <circle r={110} fill="#0D1020" stroke="#FFB58E" strokeWidth={14} />
                <path d="M-48 -48 L48 48 M48 -48 L-48 48" stroke="#FFB58E" strokeWidth={22} strokeLinecap="round" />
              </g>
            </CityMap>
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-line-dark text-sand">
              {[
                ['Route at free flow', `${Math.round(data.route.before.seconds)} s → ${Math.round(data.route.after.seconds)} s`],
                ['Vehicles re-routed', data.closure.reroutes.toLocaleString('en-US')],
                ['Network travel time', `${tt.percent! > 0 ? '+' : ''}${tt.percent!.toFixed(1)} %`],
              ].map(([k, v]) => (
                <div key={k} className="bg-midnight px-4 py-3.5">
                  <p className="text-[0.72rem] text-sand/55">{k}</p>
                  <p className="mt-1 text-lg tabular-nums md:text-xl">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-sand/45">
              Simulated with the MADAR engine v{data.engineVersion}, seed {data.seed}, 07:00–08:00. Comparison against the baseline run with identical demand.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
