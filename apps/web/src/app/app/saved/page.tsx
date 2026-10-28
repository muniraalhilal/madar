'use client';
import Link from 'next/link';
import { useSession } from '@/components/app/session';
import { Empty, fmt, PageHeader, Panel, StatusBadge } from '@/components/app/ui';
import type { ScenarioListItem } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { ReportRow } from '../reports/page';

export default function Saved() {
  const { project } = useSession();
  const sc = useApi<ScenarioListItem[]>(project ? `/projects/${project.id}/scenarios?saved=true` : null);
  const rep = useApi<ReportRow[]>(project ? `/projects/${project.id}/reports` : null);
  return (
    <>
      <PageHeader title="Saved" description="Scenarios you saved to the library, and the reports built from them." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Saved scenarios">
          {sc.data?.length === 0 && <Empty title="Nothing saved yet">Use “Save to library” in the Scenario Lab.</Empty>}
          <ul className="space-y-1">
            {sc.data?.map((s) => (
              <li key={s.id}>
                <Link href={`/app/scenarios/${s.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-white/5">
                  <span><span className="block text-white">{s.name}</span><span className="text-xs text-sand/55">{s.kind} · updated {fmt.ago(s.updatedAt)}</span></span>
                  {s.latestRun && <StatusBadge status={s.latestRun.status} />}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Reports">
          {rep.data?.length === 0 && <Empty title="No reports yet" />}
          <ul className="space-y-1">
            {rep.data?.map((r) => (
              <li key={r.id}><Link href={`/app/reports/${r.id}`} className="block rounded-xl px-3 py-3 hover:bg-white/5"><span className="block text-white">{r.title}</span><span className="text-xs text-sand/55">{fmt.ago(r.createdAt)}</span></Link></li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
