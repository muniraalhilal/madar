'use client';
import { Boxes, FileText, GitCompare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SERIES, btn, ErrorNote, fmt, PageHeader, Panel, Skeleton, Stat, StatusBadge } from '@/components/app/ui';
import { TimeSeries } from '@/components/app/charts/TimeSeries';
import { CityMap } from '@/components/landing/CityMap';
import { useSession } from '@/components/app/session';
import { api, type Run } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useRunLive } from '@/lib/useRunLive';
import { href, useRouteId } from '@/lib/routes';
import { DEMO } from '@/demo/mode';

interface Metric { tS: number; vehiclesInNetwork: number; queuedVehicles: number; completedTrips: number; meanSpeedMs: number; windowMeanTravelTimeS: number | null; throughputPerHour: number }
interface LinkRow { linkId: string; name: string; congestion: number; meanQueue: number; maxQueue: number; exited: number; meanTravelTime: number | null }
interface Junction { nodeId: string; name: string; kind: string; meanDelay: number; maxQueue: number; throughput: number }
interface Ev { t: number; type: string; message: string }

export default function RunPage() {
  const runId = useRouteId('runId');
  const router = useRouter();
  const { project, canWrite } = useSession();
  const run = useApi<Run>(`/runs/${runId}`);
  const done = run.data?.status === 'completed';
  const metrics = useApi<Metric[]>(done ? `/runs/${runId}/metrics` : null);
  const links = useApi<LinkRow[]>(done ? `/runs/${runId}/links` : null);
  const junctions = useApi<Junction[]>(done ? `/runs/${runId}/intersections` : null);
  const events = useApi<Ev[]>(done ? `/runs/${runId}/events` : null);
  const runs = useApi<Run[]>(project ? `/projects/${project.id}/runs` : null);
  const live = useRunLive(run.data && !done ? runId : null, run.data?.status);
  const [other, setOther] = useState('');

  if (run.error) return <ErrorNote>{run.error}</ErrorNote>;
  if (!run.data) return <Skeleton className="h-96" />;
  const r = run.data;
  const s = r.summary;
  const startHour = (r.params as { startHour?: number })?.startHour ?? 7;
  if (live.status === 'completed' && !done) void run.reload();

  return (
    <>
      <PageHeader
        eyebrow="Simulation result"
        title={r.scenarioName ?? 'Run'}
        description={
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={live.status ?? r.status} /> engine v{r.engineVersion} · seed {r.seed} · inputs <code className="text-xs">{r.inputFingerprint}</code>
            {r.resultFingerprint && <> · result <code className="text-xs">{r.resultFingerprint}</code></>}
            {DEMO && done && r.wallTimeMs != null && <> · computed in your browser in {(r.wallTimeMs / 1000).toFixed(1)} s</>}
          </span>
        }
        actions={
          done && (
            <>
              <Link href={`/app/explorer`} className={btn.ghost}><Boxes size={16} /> Explorer</Link>
              {canWrite && (
                <button
                  className={btn.ghost}
                  onClick={async () => {
                    const rep = await api<{ id: string }>(`/projects/${r.projectId}/reports`, { method: 'POST', json: { title: `${r.scenarioName} — run report`, baselineRunId: r.id } });
                    router.push(href.report(rep.id));
                  }}
                >
                  <FileText size={16} /> Generate report
                </button>
              )}
            </>
          )
        }
      />
      {!done && (['failed', 'cancelled'].includes(live.status ?? r.status) ? (
        <Panel title={(live.status ?? r.status) === 'failed' ? 'This run failed' : 'This run was stopped'}>
          <p className="mb-3 text-sm text-sand/70">It produced no results. Open its scenario in the Scenario Lab to run it again.</p>
          {r.errorMessage && <ErrorNote>{r.errorMessage}</ErrorNote>}
        </Panel>
      ) : (
        <Panel title="In progress">
          <p className="text-sm text-sand/70">This run is {live.status ?? r.status}. Results appear here when it completes.</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-lavender" style={{ width: `${Math.max(live.fraction, r.progress) * 100}%` }} /></div>
        </Panel>
      ))}
      {done && s && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Average travel time" value={fmt.s(s.meanTravelTime)} sub={`95th percentile ${fmt.s(s.p95TravelTime)}`} />
            <Stat label="Average waiting time" value={fmt.s(s.meanWaitTime)} sub={`${s.meanStops.toFixed(1)} stops per trip`} />
            <Stat label="Trips completed" value={fmt.n(s.tripsCompleted)} sub={`${fmt.n(s.throughputPerHour)} per hour`} />
            <Stat label="Longest queue" value={`${s.maxQueue} veh`} sub={`${fmt.n(s.reroutes)} re-routes`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Vehicles on the network">
              <TimeSeries startHour={startHour} unit="veh" series={[{ key: 'v', label: 'On the network', color: SERIES.baseline, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.vehiclesInNetwork })) }, { key: 'q', label: 'Queued', color: SERIES.third, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.queuedVehicles })) }]} />
            </Panel>
            <Panel title="Average trip time, by minute finished">
              <TimeSeries startHour={startHour} unit="s" format={(v) => fmt.s(v)} series={[{ key: 'tt', label: 'Trip time', color: SERIES.baseline, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.windowMeanTravelTimeS })) }]} />
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Panel title="Congestion map" padded={false}>
              <div className="p-3"><CityMap layer="movement" theme="dark" congestion={Object.fromEntries((links.data ?? []).map((l) => [l.linkId, l.congestion]))} label="Congestion by road in this run" /></div>
            </Panel>
            <Panel title="Most congested roads" padded={false}>
              <table className="w-full text-sm">
                <thead className="text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">Road</th><th className="px-4 py-2 text-right font-normal">Delay share</th><th className="px-4 py-2 text-right font-normal">Mean queue</th></tr></thead>
                <tbody>
                  {(links.data ?? []).slice(0, 10).map((l) => (
                    <tr key={l.linkId} className="border-t border-line-dark">
                      <td className="px-4 py-2.5">{l.name} <span className="text-xs text-sand/45">{l.linkId}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{Math.round(l.congestion * 100)} %</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{l.meanQueue.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Slowest junctions" padded={false} className="xl:col-span-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">Junction</th><th className="px-4 py-2 text-right font-normal">Mean delay</th><th className="px-4 py-2 text-right font-normal">Max queue</th><th className="px-4 py-2 text-right font-normal">Throughput</th></tr></thead>
                <tbody>
                  {(junctions.data ?? []).slice(0, 8).map((j) => (
                    <tr key={j.nodeId} className="border-t border-line-dark">
                      <td className="px-4 py-2.5">{j.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt.s(j.meanDelay)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{j.maxQueue}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt.n(j.throughput)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Energy & emissions (estimates)">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-sand/65">Fuel</dt><dd className="tabular-nums">{fmt.n(s.energy.fuelLitres)} L</dd></div>
                <div className="flex justify-between"><dt className="text-sand/65">EV electricity</dt><dd className="tabular-nums">{fmt.n(s.energy.evKwh)} kWh</dd></div>
                <div className="flex justify-between"><dt className="text-sand/65">CO₂</dt><dd className="tabular-nums">{(s.energy.co2Kg / 1000).toFixed(2)} t</dd></div>
                <div className="flex justify-between"><dt className="text-sand/65">Idling</dt><dd className="tabular-nums">{fmt.n(s.energy.idleHours)} veh·h</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-sand/50">Derived from simulated vehicle-km and idle time with fixed fleet assumptions (85 % combustion, 8 L/100 km). Use for comparing scenarios, not as measurements.</p>
            </Panel>
          </div>
          <Panel title="Compare with another run">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="cmp" className="sr-only">Other run</label>
              <select id="cmp" value={other} onChange={(e) => setOther(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 text-sm">
                <option value="">Choose a completed run…</option>
                {(runs.data ?? []).filter((x) => x.status === 'completed' && x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.scenarioName} · {fmt.ago(x.queuedAt)}</option>)}
              </select>
              <Link aria-disabled={!other} href={other ? `/app/compare?baseline=${other}&variant=${r.id}` : '#'} className={`${btn.primary} ${other ? '' : 'pointer-events-none opacity-50'}`}><GitCompare size={16} /> Compare</Link>
            </div>
          </Panel>
          <Panel title={`Event log (${events.data?.length ?? 0})`}>
            <ul className="max-h-72 space-y-1.5 overflow-auto text-sm">
              {(events.data ?? []).filter((e) => e.type !== 'spillback').slice(0, 200).map((e, i) => (
                <li key={i} className="flex gap-3"><span className="w-12 shrink-0 tabular-nums text-sand/50">{fmt.clock(startHour, e.t)}</span><span className="text-sand/80">{e.message}</span></li>
              ))}
              {(events.data ?? []).filter((e) => e.type === 'spillback').length > 0 && <li className="pt-2 text-xs text-sand/50">+ {(events.data ?? []).filter((e) => e.type === 'spillback').length} spillback events (queues blocked by full downstream roads)</li>}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
