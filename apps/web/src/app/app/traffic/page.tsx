'use client';
import type { Frame } from '@madar/sim-engine';
import { ChevronDown, Pause, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { TimeSeries } from '@/components/app/charts/TimeSeries';
import { PlaybackMap } from '@/components/app/PlaybackMap';
import { useSession } from '@/components/app/session';
import { SERIES, Empty, ErrorNote, fmt, PageHeader, Panel, Skeleton, Stat } from '@/components/app/ui';
import { CityMap } from '@/components/landing/CityMap';
import type { Run } from '@/lib/api';
import { useCityMap } from '@/lib/city';
import { usePlayback } from '@/lib/playback';
import { href } from '@/lib/routes';
import { useApi } from '@/lib/useApi';

interface LinkRow { linkId: string; name: string; congestion: number; meanQueue: number; maxQueue: number; utilization: number; exited: number; meanSpeed: number | null; meanTravelTime: number | null }
interface Metric { tS: number; vehiclesInNetwork: number; queuedVehicles: number; completedTrips: number; meanSpeedMs: number; throughputPerHour: number; windowMeanTravelTimeS: number | null }
interface Junction { nodeId: string; name: string; kind: string; throughput: number; meanDelay: number; maxQueue: number }

const SPEEDS = [1, 2, 4, 8] as const;

export default function Movement() {
  const { project } = useSession();
  const runs = useApi<Run[]>(project ? `/projects/${project.id}/runs` : null);
  const done = (runs.data ?? []).filter((r) => r.status === 'completed');
  const [id, setId] = useState('');
  useEffect(() => {
    if (!id && done[0]) setId(done[0].id);
  }, [done, id]);
  const run = done.find((r) => r.id === id);
  const links = useApi<LinkRow[]>(id ? `/runs/${id}/links` : null);
  const metrics = useApi<Metric[]>(id ? `/runs/${id}/metrics` : null);
  const junctions = useApi<Junction[]>(id ? `/runs/${id}/intersections` : null);
  const startHour = (run?.params as { startHour?: number })?.startHour ?? 7;
  if (runs.error) return <ErrorNote>{runs.error}</ErrorNote>;
  if (runs.data && done.length === 0)
    return (
      <>
        <PageHeader title="Movement" />
        <Empty title="No completed runs yet" action={<Link href="/app/scenarios" className="pill pill-primary">Run a scenario</Link>}>Movement analytics and playback come from simulation runs.</Empty>
      </>
    );
  const s = run?.summary;
  const congestion = links.data ? Object.fromEntries(links.data.map((l) => [l.linkId, l.congestion])) : undefined;
  return (
    <>
      <PageHeader
        title="Movement"
        description="Watch a recorded run vehicle by vehicle, then see where queues formed, how full each road was and how each junction performed."
        actions={
          <select aria-label="Run" value={id} onChange={(e) => setId(e.target.value)} className="max-w-full rounded-full border border-line-dark bg-night-2 px-4 py-2 text-sm">
            {done.map((r) => <option key={r.id} value={r.id}>{r.scenarioName} · {fmt.ago(r.finishedAt ?? r.queuedAt)}</option>)}
          </select>
        }
      />
      {!run ? <Skeleton className="h-96" /> : <Playback run={run} metrics={metrics.data ?? []} congestion={congestion} startHour={startHour} />}

      {s && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average travel time" value={fmt.s(s.meanTravelTime)} sub={`95th percentile ${fmt.s(s.p95TravelTime)}`} tone="muted" />
          <Stat label="Average delay per trip" value={fmt.s(s.meanDelay)} sub="versus free-flow travel" tone="muted" />
          <Stat label="Trips completed" value={fmt.n(s.tripsCompleted)} sub={`of ${fmt.n(s.tripsGenerated)} started`} tone="muted" />
          <Stat label="Longest queue" value={`${fmt.n(s.maxQueue)} veh`} sub={`mean network speed ${fmt.kmh(s.meanNetworkSpeed)}`} tone="muted" />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Vehicles on the network and in queues">
          <TimeSeries startHour={startHour} unit="veh" series={[
            { key: 'v', label: 'On the network', color: SERIES.baseline, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.vehiclesInNetwork })) },
            { key: 'q', label: 'Queued at junctions', color: SERIES.third, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.queuedVehicles })) },
          ]} />
        </Panel>
        <Panel title="Average travel time of trips finishing each minute">
          <TimeSeries startHour={startHour} unit="s" format={(v) => fmt.s(v)} series={[{ key: 't', label: 'Travel time', color: SERIES.variant, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.windowMeanTravelTimeS })) }]} />
        </Panel>
        <Panel title="Mean speed of vehicles on the network">
          <TimeSeries startHour={startHour} unit="km/h" format={(v) => `${v.toFixed(1)} km/h`} series={[{ key: 's', label: 'Speed', color: SERIES.baseline, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.meanSpeedMs * 3.6 })) }]} />
        </Panel>
        <Panel title="Trips completed per hour (rolling minute)">
          <TimeSeries startHour={startHour} unit="veh/h" series={[{ key: 't', label: 'Throughput', color: SERIES.variant, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.throughputPerHour })) }]} />
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Panel title="Where delay concentrated" padded={false}>
          <div className="p-3"><CityMap layer="movement" theme="dark" congestion={congestion} label="Congestion map" /></div>
          <Legend />
        </Panel>
        <Panel title="Roads" padded={false}>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-midnight text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">Road</th><th className="px-4 py-2 text-right font-normal">Used</th><th className="px-4 py-2 text-right font-normal">Congestion</th><th className="px-4 py-2 text-right font-normal">Max queue</th></tr></thead>
              <tbody>
                {[...(links.data ?? [])].sort((a, b) => b.utilization - a.utilization).slice(0, 40).map((l) => (
                  <tr key={l.linkId} className="border-t border-line-dark">
                    <td className="px-4 py-2">{l.name} <span className="text-xs text-sand/45">{l.linkId}</span></td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:block"><span className="block h-full bg-lavender" style={{ width: `${Math.min(100, l.utilization * 100)}%` }} /></span>
                        {Math.round(l.utilization * 100)} %
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Math.round(l.congestion * 100)} %</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.maxQueue} veh</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-sand/50">Used = vehicles discharged ÷ stop-line capacity over the run (saturation flow × effective green share). Congestion = 1 − free-flow time ÷ actual travel time (0 % free flowing, 100 % standstill).</p>
        </Panel>
      </div>
      <Junctions rows={junctions.data} runId={id} />
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 px-4 pb-3 text-[0.72rem] text-sand/60">
      <span>Free flow</span>
      <span className="h-1.5 w-28 rounded-full bg-[linear-gradient(90deg,#7CD9C7,#B4A3E6,#8B7CF6,#FFB58E,#FF7878)]" aria-hidden="true" />
      <span>Congested</span>
    </div>
  );
}

/** Frame-by-frame playback of the run's stored vehicle positions, with time-synced readouts. */
function Playback({ run, metrics, congestion, startHour }: { run: Run; metrics: Metric[]; congestion?: Record<string, number>; startHour: number }) {
  const { project } = useSession();
  const { city } = useCityMap(project?.cityId);
  const { frames, error } = usePlayback(run.id);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  useEffect(() => {
    setFi(0);
    setPlaying(false);
  }, [run.id]);
  useEffect(() => {
    if (!frames || !playing) return;
    const t = setInterval(() => setFi((i) => {
      const n = i + speed;
      if (n >= frames.length - 1) {
        setPlaying(false);
        return frames.length - 1;
      }
      return n;
    }), 100);
    return () => clearInterval(t);
  }, [frames, playing, speed]);
  const frame: Frame | null = frames?.[fi] ?? null;
  const t = frame?.t ?? 0;
  const sample = useMemo(() => {
    let best: Metric | undefined;
    for (const m of metrics) if (m.tS <= Math.max(t, metrics[0]?.tS ?? 0)) best = m;
    return best;
  }, [metrics, t]);
  const queuedNow = useMemo(() => {
    if (!frame) return 0;
    let q = 0;
    for (let i = 0; i < frame.count; i++) q += frame.data[i * 4 + 3]! & 1;
    return q;
  }, [frame]);
  const frameStep = frames && frames.length > 1 ? frames[1]!.t - frames[0]!.t : 4;

  return (
    <Panel title="Playback" action={<Link href={href.run(run.id)} className="text-sm text-lavender-soft hover:underline">Open result</Link>} padded={false}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-3">
          {!city || (!frames && !error) ? <Skeleton className="aspect-[6300/4300] w-full" /> : error ? <div className="grid aspect-[6300/4300] place-items-center rounded-xl border border-dashed border-line-dark p-6 text-center text-sm text-sand/60">{error}</div> : <PlaybackMap city={city} frame={frame} congestion={congestion} label={`Vehicles in ${run.scenarioName} at ${fmt.clock(startHour, t)}`} />}
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line-dark bg-line-dark lg:grid-cols-1 lg:border-l lg:border-t-0">
          {[
            ['Simulated time', fmt.clock(startHour, t)],
            ['Vehicles drawn', fmt.n(frame?.count ?? 0)],
            ['Queued now', frame ? `${fmt.n(queuedNow)} veh` : '—'],
            ['Trips completed so far', fmt.n(sample?.completedTrips)],
            ['Avg trip, last minute', fmt.s(sample?.windowMeanTravelTimeS)],
          ].map(([k, v]) => (
            <div key={k} className="bg-midnight px-4 py-3">
              <dt className="text-xs text-sand/55">{k}</dt>
              <dd className="mt-0.5 text-lg tabular-nums text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line-dark px-4 py-3">
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lavender text-white disabled:opacity-40" disabled={!frames} onClick={() => { if (frames && fi >= frames.length - 1) setFi(0); setPlaying((p) => !p); }} aria-label={playing ? 'Pause playback' : 'Play playback'}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-dark text-sand disabled:opacity-40" disabled={!frames} onClick={() => { setPlaying(false); setFi(0); }} aria-label="Reset playback to the start">
          <RotateCcw size={16} />
        </button>
        <label htmlFor="pb-time" className="sr-only">Playback time</label>
        <input id="pb-time" type="range" min={0} max={Math.max(0, (frames?.length ?? 1) - 1)} value={fi} disabled={!frames} onChange={(e) => { setFi(Number(e.target.value)); setPlaying(false); }} className="min-w-[160px] flex-1 accent-[#8B7CF6]" />
        <div className="flex items-center gap-1 rounded-full border border-line-dark p-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((x) => (
            <button key={x} onClick={() => setSpeed(x)} aria-pressed={speed === x} className={`rounded-full px-2.5 py-1 text-xs tabular-nums ${speed === x ? 'bg-lavender/25 text-white' : 'text-sand/65 hover:text-white'}`}>
              {Math.round((x * frameStep) / 0.1)}×
            </button>
          ))}
        </div>
      </div>
      <p className="px-4 pb-3 text-xs text-sand/50">Recorded positions every {frameStep} simulated seconds (up to 1,000 vehicles per frame), replayed from the stored run. Lavender: moving · peach: queued. Speeds are relative to real time.</p>
    </Panel>
  );
}

/** Junction performance with the signal timing that produced it. */
function Junctions({ rows, runId }: { rows: Junction[] | null; runId: string }) {
  const { project } = useSession();
  const { city } = useCityMap(project?.cityId);
  const run = useApi<Run>(runId ? `/runs/${runId}` : null);
  const [open, setOpen] = useState<string | null>(null);
  if (!rows || !city) return <Skeleton className="mt-6 h-64" />;
  const overrides = new Map(((run.data?.params as { signalOverrides?: { nodeId: string; greens: number[]; offset?: number }[] } | undefined)?.signalOverrides ?? []).map((o) => [o.nodeId, o]));
  return (
    <Panel title="Junctions" className="mt-6" padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-sand/55">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Junction</th>
              <th className="px-4 py-2 text-left font-normal">Control</th>
              <th className="px-4 py-2 text-right font-normal">Mean delay</th>
              <th className="px-4 py-2 text-right font-normal">Vehicles through</th>
              <th className="px-4 py-2 text-right font-normal">Max queue</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 24).map((j) => {
              const plan = city.signals.find((p) => p.nodeId === j.nodeId);
              const o = overrides.get(j.nodeId);
              const greens = o?.greens ?? plan?.phases.map((p) => p.green) ?? [];
              const cycle = plan ? plan.phases.reduce((a, p, i) => a + (greens[i] ?? p.green) + p.yellow + p.allRed, 0) : 0;
              const isOpen = open === j.nodeId;
              return (
                <Fragment key={j.nodeId}>
                  <tr className="border-t border-line-dark">
                    <td className="px-4 py-2.5 text-white">{j.name}</td>
                    <td className="px-4 py-2.5 text-sand/70">{plan ? `Signal · ${cycle} s cycle${o ? ' · re-timed' : ''}` : 'Priority (no signal)'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt.s(j.meanDelay)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt.n(j.throughput)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{j.maxQueue} veh</td>
                    <td className="px-2 py-2.5">
                      {plan && (
                        <button onClick={() => setOpen(isOpen ? null : j.nodeId)} aria-expanded={isOpen} aria-label={`Signal timing for ${j.name}`} className="grid h-8 w-8 place-items-center rounded-full text-sand/60 hover:bg-white/5 hover:text-white">
                          <ChevronDown size={16} className={isOpen ? 'rotate-180 transition' : 'transition'} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && plan && (
                    <tr className="bg-night-2/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {plan.phases.map((p, i) => (
                            <span key={p.name} className="rounded-xl border border-line-dark px-3 py-2 text-xs">
                              <span className="block text-sand/55">{p.name}</span>
                              <span className="tabular-nums text-white">{greens[i] ?? p.green} s green</span>
                              <span className="text-sand/55"> + {p.yellow} s amber + {p.allRed} s all-red</span>
                            </span>
                          ))}
                          <span className="rounded-xl border border-line-dark px-3 py-2 text-xs text-sand/60">Offset {o?.offset ?? plan.offset} s</span>
                        </div>
                        <Link href={`/app/scenarios?signal=${j.nodeId}`} className="mt-3 inline-block text-xs text-lavender-soft hover:underline">Change this timing in a scenario →</Link>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-sand/50">Sorted by mean delay per vehicle. Signal timings shown are the ones this run used.</p>
    </Panel>
  );
}
