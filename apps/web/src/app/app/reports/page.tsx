'use client';
import Link from 'next/link';
import { useSession } from '@/components/app/session';
import { Empty, ErrorNote, fmt, PageHeader, Skeleton } from '@/components/app/ui';
import { useApi } from '@/lib/useApi';
import { href } from '@/lib/routes';

export interface ReportRow { id: string; title: string; createdAt: string; author: string | null; variantRunId: string | null }

export default function Reports() {
  const { project } = useSession();
  const list = useApi<ReportRow[]>(project ? `/projects/${project.id}/reports` : null);
  return (
    <>
      <PageHeader title="Insights & reports" description="Reports freeze a comparison at the moment they are created, with seeds and fingerprints, so they never change afterwards." />
      {list.loading && <Skeleton className="h-40" />}
      {list.error && <ErrorNote>{list.error}</ErrorNote>}
      {list.data?.length === 0 && <Empty title="No reports yet">Open a comparison and choose “Save as report”, or generate one from any completed run.</Empty>}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Link href={href.report(r.id)} className="block rounded-2xl border border-line-dark bg-midnight/70 p-5 hover:border-lavender/40">
              <p className="text-xs text-sand/55">{r.variantRunId ? 'Comparison' : 'Single run'} · {fmt.ago(r.createdAt)} · {r.author}</p>
              <h2 className="mt-1 font-medium text-white">{r.title}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
