'use client';
import { FlaskConical, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useSession } from '@/components/app/session';
import { btn, Empty, ErrorNote, fmt, PageHeader, Skeleton, StatusBadge } from '@/components/app/ui';
import { api, type Scenario, type ScenarioListItem } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { href } from '@/lib/routes';

function ScenariosInner() {
  const { project, canWrite } = useSession();
  const router = useRouter();
  const signal = useSearchParams().get('signal');
  const list = useApi<ScenarioListItem[]>(project ? `/projects/${project.id}/scenarios` : null);
  const [name, setName] = useState('');
  const [base, setBase] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const baseline = list.data?.find((s) => s.kind === 'baseline');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    try {
      const sc = await api<Scenario>(`/projects/${project.id}/scenarios`, { method: 'POST', json: { name: name || 'Untitled scenario', baseScenarioId: base || baseline?.id } });
      router.push(href.scenario(sc.id, signal ? `signal=${signal}` : ''));
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Scenario Lab" description="Each scenario is a version of the same morning: change signal timings, close roads, add incidents or shift demand, then run it and compare against the baseline." />
      {signal && <p className="mb-6 rounded-xl border border-lavender/30 bg-lavender/10 px-4 py-3 text-sm">Pick or create a variant to retime junction <strong>{signal}</strong>.</p>}
      {canWrite && (
        <form onSubmit={create} className="mb-8 flex flex-col gap-3 rounded-2xl border border-line-dark bg-midnight/70 p-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="sc-name" className="text-sm text-sand/70">New scenario</label>
            <input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retimed Orbit Boulevard" className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-4 py-2.5" />
          </div>
          <div>
            <label htmlFor="sc-base" className="text-sm text-sand/70">Start from</label>
            <select id="sc-base" value={base} onChange={(e) => setBase(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 md:w-64">
              {(list.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button className={btn.primary}><Plus size={16} /> Create scenario</button>
        </form>
      )}
      {err && <ErrorNote>{err}</ErrorNote>}
      {list.loading && <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {list.error && <ErrorNote>{list.error}</ErrorNote>}
      {list.data && list.data.length === 0 && <Empty title="No scenarios yet">Create your first one above.</Empty>}
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {list.data?.map((s) => (
          <li key={s.id}>
            <Link href={href.scenario(s.id, signal ? `signal=${signal}` : '')} className="block h-full rounded-2xl border border-line-dark bg-midnight/70 p-5 transition hover:border-lavender/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs text-sand/55">
                    <FlaskConical size={13} /> {s.kind === 'baseline' ? 'Baseline' : 'Variant'} {s.isSaved && '· saved'}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-medium text-white">{s.name}</h2>
                </div>
                {s.latestRun && <StatusBadge status={s.latestRun.status} />}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-sand/60">{s.description || 'No description.'}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-sand/60">
                <span>{s.changes.signalOverrides} signal changes</span>
                <span>{s.changes.closures} closures</span>
                <span>{s.changes.incidents} incidents</span>
                <span>{s.runCount} runs</span>
                {s.latestRun?.meanTravelTimeS != null && <span className="text-sand">avg trip {fmt.s(s.latestRun.meanTravelTimeS)}</span>}
                <span className="ml-auto">updated {fmt.ago(s.updatedAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ScenariosPage() {
  return (
    <Suspense>
      <ScenariosInner />
    </Suspense>
  );
}
