'use client';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/app/session';
import { btn, ErrorNote, fmt, PageHeader, Panel, Skeleton } from '@/components/app/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useRouteId } from '@/lib/routes';
import { demoReportHtml } from '@/demo/backend';
import { DEMO } from '@/demo/mode';

/** Demo: the same HTML the API's export endpoint renders, opened from memory. */
function openDemoPrintable(id: string) {
  const url = URL.createObjectURL(new Blob([demoReportHtml(id)], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Content {
  generatedAt: string; title: string; notes: string; findings: string[]; disclaimer: string;
  baseline: { scenarioName: string; seed: number; engineVersion: string; resultFingerprint: string | null };
  variant: { scenarioName: string; resultFingerprint: string | null } | null;
  metrics: { key: string; label: string; unit: string; baseline: number; variant: number; percent: number | null; verdict: string; kind: string }[];
}

export default function ReportPage() {
  const id = useRouteId('id');
  const router = useRouter();
  const { canWrite } = useSession();
  const r = useApi<{ id: string; title: string; content: Content; createdAt: string }>(`/reports/${id}`);
  if (r.error) return <ErrorNote>{r.error}</ErrorNote>;
  if (!r.data) return <Skeleton className="h-96" />;
  const c = r.data.content;
  return (
    <>
      <PageHeader
        eyebrow={`Report · ${fmt.ago(r.data.createdAt)}`}
        title={r.data.title}
        description={<>Engine v{c.baseline.engineVersion} · seed {c.baseline.seed} · baseline <code className="text-xs">{c.baseline.resultFingerprint}</code>{c.variant && <> · variant <code className="text-xs">{c.variant.resultFingerprint}</code></>}</>}
        actions={
          <>
            {DEMO ? (
              <button className={btn.primary} onClick={() => openDemoPrintable(id)}><ExternalLink size={16} /> Printable version</button>
            ) : (
              <a className={btn.primary} href={`/api/reports/${id}/export.html`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Printable version</a>
            )}
            {canWrite && (
              <button className={btn.danger} onClick={async () => { if (confirm('Delete this report?')) { await api(`/reports/${id}`, { method: 'DELETE' }); router.push('/app/reports'); } }}>
                <Trash2 size={16} /> Delete
              </button>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Key findings">
          <ul className="list-disc space-y-2 pl-5 text-sand/85">{c.findings.map((f) => <li key={f}>{f}</li>)}</ul>
          <p className="mt-6 text-xs leading-relaxed text-sand/50">{c.disclaimer}</p>
        </Panel>
        <Panel title={c.variant ? `${c.baseline.scenarioName} → ${c.variant.scenarioName}` : c.baseline.scenarioName} padded={false}>
          <table className="w-full text-sm">
            <tbody>
              {c.metrics.map((m) => (
                <tr key={m.key} className="border-t border-line-dark first:border-0">
                  <td className="px-5 py-2.5">{m.label}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-sand/70">{m.unit === 's' ? fmt.s(m.baseline) : fmt.n(m.baseline)}</td>
                  {c.variant && <td className="px-5 py-2.5 text-right tabular-nums">{m.unit === 's' ? fmt.s(m.variant) : fmt.n(m.variant)}</td>}
                  {c.variant && <td className={`px-5 py-2.5 text-right tabular-nums ${m.verdict === 'improved' ? 'text-mint' : m.verdict === 'worse' ? 'text-peach' : 'text-sand/55'}`}>{fmt.pct(m.percent)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
