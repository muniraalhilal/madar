'use client';
import { Boxes, FlaskConical, Plus, TriangleAlert, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/app/session';
import { btn, Empty, fmt, Panel, Stat, StatusBadge } from '@/components/app/ui';
import { CityMap } from '@/components/landing/CityMap';
import { Still } from '@/components/landing/Still';
import { api, type Project, type Run } from '@/lib/api';
import { useApi } from '@/lib/useApi';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user, project, projects, reloadProjects, setProjectId } = useSession();
  const router = useRouter();
  const runs = useApi<Run[]>(project ? `/projects/${project.id}/runs` : null);
  const activity = useApi<{ id: number; action: string; createdAt: string; actorName: string | null; metadata: Record<string, unknown> }[]>(project ? `/projects/${project.id}/activity` : null);
  const latest = runs.data?.find((r) => r.status === 'completed');
  const links = useApi<{ linkId: string; congestion: number }[]>(latest ? `/runs/${latest.id}/links` : null);
  const [hello, setHello] = useState('Welcome');
  useEffect(() => setHello(greeting()), []);
  const [newName, setNewName] = useState('');

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-line-dark">
        <Still name="hero" alt="" className="absolute inset-0 h-full w-full" imgClassName="object-[70%_50%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/50 to-ink/0" />
        <div className="relative max-w-xl px-6 py-10 md:px-10 md:py-14">
          <p className="text-sand/80">{hello}{user ? `, ${user.displayName.split(' ')[0]}` : ''}.</p>
          <p className="mt-1 text-sm text-sand/60">Welcome to MADAR</p>
          <h1 className="display-caps mt-5 text-4xl text-white md:text-5xl">
            Explore
            <br />
            your city
          </h1>
          <p className="mt-4 max-w-[40ch] text-sand/80">{project ? `${project.name} · ${project.scenarioCount} scenarios · ${project.runCount} runs` : 'Create a project to begin.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/explorer" className="pill pill-primary">Get started</Link>
            <Link href="/app/scenarios" className="pill pill-ghost">Scenario Lab</Link>
          </div>
        </div>
      </section>

      {projects.length === 0 && user?.role !== 'viewer' && (
        <Panel title="Create your first project">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); const p = await api<Project>('/projects', { method: 'POST', json: { name: newName || 'My study' } }); await reloadProjects(); setProjectId(p.id); router.refresh(); }}>
            <label htmlFor="pname" className="sr-only">Project name</label>
            <input id="pname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Morning peak study" className="min-w-0 flex-1 rounded-xl border border-line-dark bg-night-2 px-4 py-2.5" />
            <button className={btn.primary}><Plus size={16} /> Create project</button>
          </form>
        </Panel>
      )}

      {latest?.summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average trip (latest run)" value={fmt.s(latest.summary.meanTravelTime)} sub={latest.scenarioName} tone="muted" />
          <Stat label="Average wait" value={fmt.s(latest.summary.meanWaitTime)} />
          <Stat label="Trips per hour" value={fmt.n(latest.summary.throughputPerHour)} />
          <Stat label="CO₂ estimate" value={`${(latest.summary.energy.co2Kg / 1000).toFixed(1)} t`} sub="model estimate" tone="muted" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Network now (latest run)" action={latest && <Link href={`/app/results/${latest.id}`} className="text-sm text-lavender-soft hover:underline">Open result</Link>} padded={false}>
          {latest ? <div className="p-3"><CityMap layer="movement" theme="dark" congestion={Object.fromEntries((links.data ?? []).map((l) => [l.linkId, l.congestion]))} label="Congestion in the latest run" /></div> : <div className="p-5"><Empty title="No completed runs yet" action={<Link href="/app/scenarios" className={btn.primary}>Run the baseline</Link>}>Run the baseline scenario to see how the network performs.</Empty></div>}
        </Panel>
        <div className="space-y-6">
          <Panel title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['/app/explorer', 'City Explorer', Boxes],
                ['/app/scenarios', 'New scenario', FlaskConical],
                ['/app/incidents', 'Stage incident', TriangleAlert],
                ['/app/energy', 'Energy levers', Zap],
              ].map(([href, label, Icon]) => {
                const I = Icon as typeof Boxes;
                return <Link key={href as string} href={href as string} className="flex items-center gap-2.5 rounded-xl border border-line-dark px-3 py-3 text-sm hover:border-lavender/40"><I size={17} className="text-lavender-soft" /> {label as string}</Link>;
              })}
            </div>
          </Panel>
          <Panel title="Recent runs">
            {(runs.data ?? []).length === 0 && <p className="text-sm text-sand/60">No runs yet.</p>}
            <ul className="space-y-1">
              {(runs.data ?? []).slice(0, 6).map((r) => (
                <li key={r.id}><Link href={`/app/results/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-white/5"><span className="min-w-0 truncate text-sm">{r.scenarioName}<span className="block text-xs text-sand/50">{fmt.ago(r.queuedAt)}{r.summary ? ` · ${fmt.s(r.summary.meanTravelTime)} avg` : ''}</span></span><StatusBadge status={r.status} /></Link></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Activity">
            <ul className="space-y-2 text-sm">
              {(activity.data ?? []).slice(0, 8).map((a) => <li key={a.id} className="flex justify-between gap-3"><span className="text-sand/80">{a.actorName ?? 'Someone'} · {a.action.replace('.', ' ').replace('_', ' ')}</span><span className="shrink-0 text-xs text-sand/50">{fmt.ago(a.createdAt)}</span></li>)}
              {activity.data?.length === 0 && <li className="text-sand/60">Nothing yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
