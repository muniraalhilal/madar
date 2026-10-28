'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TimeSeries } from '@/components/app/charts/TimeSeries';
import { useSession } from '@/components/app/session';
import { SERIES, Empty, fmt, PageHeader, Panel, Stat } from '@/components/app/ui';
import { CityMap } from '@/components/landing/CityMap';
import type { Run } from '@/lib/api';
import { useApi } from '@/lib/useApi';

interface LinkRow { linkId: string; name: string; congestion: number; meanQueue: number; utilization: number; exited: number; meanSpeed: number | null }
interface Metric { tS: number; vehiclesInNetwork: number; queuedVehicles: number; meanSpeedMs: number; throughputPerHour: number }

export default function Traffic() {
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
  const startHour = (run?.params as { startHour?: number })?.startHour ?? 7;
  if (runs.data && done.length === 0) return (<><PageHeader title="Traffic intelligence" /><Empty title="No completed runs yet" action={<Link href="/app/scenarios" className="pill pill-primary">Run a scenario</Link>}>Traffic analytics come from simulation runs.</Empty></>);
  const s = run?.summary;
  return (
    <>
      <PageHeader
        title="Traffic intelligence"
        description="Network performance for one run: where the queues formed, how full each road was, and how speed changed through the hour."
        actions={
          <select aria-label="Run" value={id} onChange={(e) => setId(e.target.value)} className="rounded-full border border-line-dark bg-night-2 px-4 py-2 text-sm">
            {done.map((r) => <option key={r.id} value={r.id}>{r.scenarioName} · {fmt.ago(r.queuedAt)}</option>)}
          </select>
        }
      />
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Mean network speed" value={fmt.kmh(s.meanNetworkSpeed)} />
          <Stat label="Vehicle-kilometres" value={fmt.n(s.vehicleKm)} />
          <Stat label="Average delay per trip" value={fmt.s(s.meanDelay)} />
          <Stat label="Vehicles still travelling at end" value={fmt.n(s.vehiclesRemaining)} />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Mean speed of vehicles on the network">
          <TimeSeries startHour={startHour} unit="km/h" format={(v) => `${v.toFixed(1)} km/h`} series={[{ key: 's', label: 'Speed', color: SERIES.baseline, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.meanSpeedMs * 3.6 })) }]} />
        </Panel>
        <Panel title="Trips completed per hour (rolling minute)">
          <TimeSeries startHour={startHour} unit="veh/h" series={[{ key: 't', label: 'Throughput', color: SERIES.variant, data: (metrics.data ?? []).map((m) => ({ t: m.tS, v: m.throughputPerHour })) }]} />
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Panel title="Where delay concentrated" padded={false}>
          <div className="p-3"><CityMap layer="movement" theme="dark" congestion={Object.fromEntries((links.data ?? []).map((l) => [l.linkId, l.congestion]))} label="Congestion map" /></div>
        </Panel>
        <Panel title="Road utilisation" padded={false}>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-midnight text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">Road</th><th className="px-4 py-2 text-right font-normal">Used</th><th className="px-4 py-2 text-right font-normal">Delay share</th></tr></thead>
              <tbody>
                {[...(links.data ?? [])].sort((a, b) => b.utilization - a.utilization).slice(0, 40).map((l) => (
                  <tr key={l.linkId} className="border-t border-line-dark">
                    <td className="px-4 py-2">{l.name} <span className="text-xs text-sand/45">{l.linkId}</span></td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-2 tabular-nums">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-lavender" style={{ width: `${Math.min(100, l.utilization * 100)}%` }} /></span>
                        {Math.round(l.utilization * 100)} %
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Math.round(l.congestion * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-sand/50">Used = vehicles discharged ÷ stop-line capacity over the run (saturation flow × effective green share).</p>
        </Panel>
      </div>
    </>
  );
}
