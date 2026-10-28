'use client';
import type { MetricDelta } from '@madar/sim-engine';
import { FileText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { TimeSeries } from '@/components/app/charts/TimeSeries';
import { useSession } from '@/components/app/session';
import { SERIES, btn, ErrorNote, fmt, PageHeader, Panel, Skeleton } from '@/components/app/ui';
import { CityMap } from '@/components/landing/CityMap';
import { api, type Run } from '@/lib/api';
import { useApi } from '@/lib/useApi';

interface Comparison {
  baseline: Run;
  variant: Run;
  sameInputs: boolean;
  identicalResults: boolean;
  metrics: MetricDelta[];
  links: { linkId: string; name: string; baselineCongestion: number; variantCongestion: number; congestionDelta: number; baselineMeanQueue: number; variantMeanQueue: number }[];
  intersections: { nodeId: string; name: string; baselineDelay: number; variantDelay: number }[];
  series: { baseline: { t: number; vehicles: number; queued: number; travel: number | null }[]; variant: { t: number; vehicles: number; queued: number; travel: number | null }[] };
}

const val = (m: MetricDelta, v: number) => (m.unit === 's' ? fmt.s(v) : m.unit === 'm/s' ? fmt.kmh(v) : m.unit === 'kg' ? `${(v / 1000).toFixed(2)} t` : `${v >= 100 ? fmt.n(v) : v.toFixed(2)} ${m.unit}`);

function CompareInner() {
  const q = useSearchParams();
  const router = useRouter();
  const { canWrite } = useSession();
  const b = q.get('baseline');
  const v = q.get('variant');
  const cmp = useApi<Comparison>(b && v ? `/runs/compare?baseline=${b}&variant=${v}` : null);
  const bl = useApi<{ linkId: string; congestion: number }[]>(b ? `/runs/${b}/links` : null);
  const vl = useApi<{ linkId: string; congestion: number }[]>(v ? `/runs/${v}/links` : null);
  const [busy, setBusy] = useState(false);
  if (!b || !v) return <ErrorNote>Choose two runs to compare from a results page.</ErrorNote>;
  if (cmp.error) return <ErrorNote>{cmp.error}</ErrorNote>;
  if (!cmp.data) return <Skeleton className="h-96" />;
  const c = cmp.data;
  const startHour = (c.baseline.params as { startHour?: number })?.startHour ?? 7;
  return (
    <>
      <PageHeader
        eyebrow="Scenario comparison"
        title={`${c.baseline.scenarioName} vs ${c.variant.scenarioName}`}
        description={c.identicalResults ? 'Identical inputs produced an identical result fingerprint — the engine is deterministic.' : c.sameInputs ? 'Same inputs.' : 'Differences below come from the scenario changes alone: same city, same engine version.'}
        actions={
          canWrite && (
            <button
              className={btn.primary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await api<{ id: string }>(`/projects/${c.baseline.projectId}/reports`, { method: 'POST', json: { title: `${c.variant.scenarioName} vs ${c.baseline.scenarioName}`, baselineRunId: b, variantRunId: v } });
                router.push(`/app/reports/${r.id}`);
              }}
            >
              <FileText size={16} /> Save as report
            </button>
          )
        }
      />
      <div className="space-y-6">
        <Panel title="Key metrics" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-xs text-sand/55">
                <tr>
                  <th className="px-5 py-3 text-left font-normal">Metric</th>
                  <th className="px-5 py-3 text-right font-normal"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SERIES.baseline }} />Baseline</th>
                  <th className="px-5 py-3 text-right font-normal"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SERIES.variant }} />Variant</th>
                  <th className="px-5 py-3 text-right font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {c.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-dark">
                    <td className="px-5 py-3">{m.label}{m.kind === 'estimate' && <span className="ml-2 rounded-full border border-line-dark px-2 py-0.5 text-[0.68rem] text-sand/55">estimate</span>}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-sand/75">{val(m, m.baseline)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{val(m, m.variant)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${m.verdict === 'improved' ? 'text-mint' : m.verdict === 'worse' ? 'text-peach' : 'text-sand/55'}`}>
                      {m.percent == null ? '—' : fmt.pct(m.percent)} <span className="sr-only">{m.verdict}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Vehicles on the network">
            <TimeSeries startHour={startHour} unit="veh" series={[{ key: 'b', label: 'Baseline', color: SERIES.baseline, data: c.series.baseline.map((x) => ({ t: x.t, v: x.vehicles })) }, { key: 'v', label: 'Variant', color: SERIES.variant, data: c.series.variant.map((x) => ({ t: x.t, v: x.vehicles })) }]} />
          </Panel>
          <Panel title="Average trip time">
            <TimeSeries startHour={startHour} unit="s" format={(x) => fmt.s(x)} series={[{ key: 'b', label: 'Baseline', color: SERIES.baseline, data: c.series.baseline.map((x) => ({ t: x.t, v: x.travel })) }, { key: 'v', label: 'Variant', color: SERIES.variant, data: c.series.variant.map((x) => ({ t: x.t, v: x.travel })) }]} />
          </Panel>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Baseline congestion" padded={false}><div className="p-3"><CityMap layer="movement" theme="dark" congestion={Object.fromEntries((bl.data ?? []).map((l) => [l.linkId, l.congestion]))} label="Baseline congestion map" /></div></Panel>
          <Panel title="Variant congestion" padded={false}><div className="p-3"><CityMap layer="movement" theme="dark" congestion={Object.fromEntries((vl.data ?? []).map((l) => [l.linkId, l.congestion]))} label="Variant congestion map" /></div></Panel>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Roads that changed most" padded={false}>
            <table className="w-full text-sm">
              <tbody>
                {c.links.map((l) => (
                  <tr key={l.linkId} className="border-t border-line-dark first:border-0">
                    <td className="px-5 py-2.5">{l.name} <span className="text-xs text-sand/45">{l.linkId}</span></td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-sand/70">{Math.round(l.baselineCongestion * 100)} % → {Math.round(l.variantCongestion * 100)} %</td>
                    <td className={`px-5 py-2.5 text-right tabular-nums ${l.congestionDelta < 0 ? 'text-mint' : 'text-peach'}`}>{l.congestionDelta > 0 ? '+' : ''}{Math.round(l.congestionDelta * 100)} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Junction delay" padded={false}>
            <table className="w-full text-sm">
              <tbody>
                {c.intersections.map((j) => (
                  <tr key={j.nodeId} className="border-t border-line-dark first:border-0">
                    <td className="px-5 py-2.5">{j.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-sand/70">{fmt.s(j.baselineDelay)} → {fmt.s(j.variantDelay)}</td>
                    <td className={`px-5 py-2.5 text-right tabular-nums ${j.variantDelay < j.baselineDelay ? 'text-mint' : 'text-peach'}`}>{fmt.pct(j.baselineDelay ? ((j.variantDelay - j.baselineDelay) / j.baselineDelay) * 100 : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareInner />
    </Suspense>
  );
}
