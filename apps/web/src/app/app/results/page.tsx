'use client';
import Link from 'next/link';
import { useSession } from '@/components/app/session';
import { Empty, ErrorNote, fmt, PageHeader, Skeleton, StatusBadge } from '@/components/app/ui';
import type { Run } from '@/lib/api';
import { useApi } from '@/lib/useApi';

export default function ResultsList() {
  const { project } = useSession();
  const runs = useApi<Run[]>(project ? `/projects/${project.id}/runs` : null);
  return (
    <>
      <PageHeader title="Simulation results" description="Every run is stored with its exact inputs, engine version and a result fingerprint." />
      {runs.loading && <Skeleton className="h-64" />}
      {runs.error && <ErrorNote>{runs.error}</ErrorNote>}
      {runs.data?.length === 0 && <Empty title="No runs yet" action={<Link className="pill pill-primary" href="/app/scenarios">Open the Scenario Lab</Link>}>Run a scenario and its results will appear here.</Empty>}
      {runs.data && runs.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line-dark">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-midnight text-xs text-sand/55">
              <tr>
                <th className="px-4 py-3 font-normal">Scenario</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Avg trip</th>
                <th className="px-4 py-3 font-normal">Avg delay</th>
                <th className="px-4 py-3 font-normal">Trips / h</th>
                <th className="px-4 py-3 font-normal">Seed</th>
                <th className="px-4 py-3 font-normal">Fingerprint</th>
                <th className="px-4 py-3 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id} className="border-t border-line-dark hover:bg-white/[0.03]">
                  <td className="px-4 py-3"><Link href={`/app/results/${r.id}`} className="text-white hover:text-lavender-soft">{r.scenarioName}</Link></td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 tabular-nums">{fmt.s(r.summary?.meanTravelTime)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt.s(r.summary?.meanDelay)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt.n(r.summary?.throughputPerHour)}</td>
                  <td className="px-4 py-3 tabular-nums text-sand/70">{r.seed}</td>
                  <td className="px-4 py-3 font-mono text-xs text-sand/55">{r.resultFingerprint?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3 text-sand/60">{fmt.ago(r.queuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
