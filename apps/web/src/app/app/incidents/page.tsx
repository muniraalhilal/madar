'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/components/app/session';
import { btn, Empty, ErrorNote, PageHeader, Panel } from '@/components/app/ui';
import { api, type Scenario, type ScenarioListItem } from '@/lib/api';
import { useCityMap } from '@/lib/city';
import { useApi } from '@/lib/useApi';

interface Inc { id: string; scenarioId: string; scenarioName: string; roadCode: string; roadName: string; kind: string; severity: number; startS: number; durationS: number }
interface Clo { id: string; scenarioId: string; scenarioName: string; roadCode: string; roadName: string; startS: number; endS: number | null; reason: string }

const mins = (s: number) => `${Math.round(s / 60)} min`;

export default function Incidents() {
  const { project, canWrite } = useSession();
  const router = useRouter();
  const { city } = useCityMap(project?.cityId);
  const data = useApi<{ incidents: Inc[]; closures: Clo[] }>(project ? `/projects/${project.id}/incidents` : null);
  const scen = useApi<ScenarioListItem[]>(project ? `/projects/${project.id}/scenarios` : null);
  const [f, setF] = useState({ road: '', kind: 'collision', severity: 0.7, start: 10, duration: 20 });
  const [err, setErr] = useState<string | null>(null);

  async function stage(e: React.FormEvent) {
    e.preventDefault();
    const base = scen.data?.find((s) => s.kind === 'baseline');
    if (!project || !base || !f.road) return;
    try {
      const road = city?.links.find((l) => l.id === f.road);
      const sc = await api<Scenario>(`/projects/${project.id}/scenarios`, { method: 'POST', json: { name: `${f.kind[0]!.toUpperCase()}${f.kind.slice(1)} on ${road?.name ?? f.road}`, baseScenarioId: base.id } });
      await api(`/scenarios/${sc.id}`, { method: 'PATCH', json: { incidents: [{ roadCode: f.road, kind: f.kind, severity: f.severity, startS: f.start * 60, durationS: f.duration * 60, description: 'Staged from Incident Center' }] } });
      router.push(`/app/scenarios/${sc.id}`);
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Incident center" description="Every incident and closure planned across this project's scenarios. Stage a new one and MADAR creates a variant of the baseline for it." />
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Panel title={`Incidents (${data.data?.incidents.length ?? 0})`} padded={false}>
            {data.data?.incidents.length === 0 ? <div className="p-5"><Empty title="No incidents planned" /></div> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">Road</th><th className="px-4 py-2 text-left font-normal">Kind</th><th className="px-4 py-2 text-right font-normal">Capacity lost</th><th className="px-4 py-2 text-right font-normal">When</th><th className="px-4 py-2 text-left font-normal">Scenario</th></tr></thead>
                <tbody>{data.data?.incidents.map((i) => <tr key={i.id} className="border-t border-line-dark"><td className="px-4 py-2.5">{i.roadName}</td><td className="px-4 py-2.5 capitalize">{i.kind}</td><td className="px-4 py-2.5 text-right tabular-nums">{Math.round(i.severity * 100)} %</td><td className="px-4 py-2.5 text-right tabular-nums">+{mins(i.startS)} for {mins(i.durationS)}</td><td className="px-4 py-2.5"><Link className="text-lavender-soft hover:underline" href={`/app/scenarios/${i.scenarioId}`}>{i.scenarioName}</Link></td></tr>)}</tbody>
              </table>
            )}
          </Panel>
          <Panel title={`Closures (${data.data?.closures.length ?? 0})`} padded={false}>
            {data.data?.closures.length === 0 ? <div className="p-5"><Empty title="No closures planned" /></div> : (
              <table className="w-full text-sm">
                <tbody>{data.data?.closures.map((c) => <tr key={c.id} className="border-t border-line-dark first:border-0"><td className="px-4 py-2.5">{c.roadName} <span className="text-xs text-sand/45">{c.roadCode}</span></td><td className="px-4 py-2.5 tabular-nums">from +{mins(c.startS)}{c.endS != null ? ` to +${mins(c.endS)}` : ''}</td><td className="px-4 py-2.5 text-sand/60">{c.reason}</td><td className="px-4 py-2.5"><Link className="text-lavender-soft hover:underline" href={`/app/scenarios/${c.scenarioId}`}>{c.scenarioName}</Link></td></tr>)}</tbody>
              </table>
            )}
          </Panel>
        </div>
        {canWrite && (
          <Panel title="Stage an incident">
            <form onSubmit={stage} className="space-y-4">
              <div>
                <label htmlFor="inc-road" className="text-sm text-sand/70">Road</label>
                <select id="inc-road" required value={f.road} onChange={(e) => setF({ ...f, road: e.target.value })} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 text-sm">
                  <option value="">Choose a road…</option>
                  {city?.links.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.id}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="inc-kind" className="text-sm text-sand/70">Kind</label>
                <select id="inc-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 text-sm capitalize">
                  {['collision', 'breakdown', 'roadwork', 'event'].map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
              <label className="block text-sm text-sand/70">Capacity lost: <span className="text-white">{Math.round(f.severity * 100)} %</span>
                <input type="range" min={0.1} max={1} step={0.05} value={f.severity} onChange={(e) => setF({ ...f, severity: Number(e.target.value) })} className="mt-2 w-full accent-[#8B7CF6]" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-sand/70">Starts after (min)<input type="number" min={0} max={110} value={f.start} onChange={(e) => setF({ ...f, start: Number(e.target.value) })} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2" /></label>
                <label className="text-sm text-sand/70">Lasts (min)<input type="number" min={1} max={120} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2" /></label>
              </div>
              <button className={`${btn.primary} w-full justify-center`} disabled={!f.road}>Create incident scenario</button>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
