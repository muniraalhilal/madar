import type { MetricDelta } from '@madar/sim-engine';

export interface ReportContent {
  generatedAt: string;
  title: string;
  notes: string;
  baseline: { runId: string; scenarioName: string; seed: number; engineVersion: string; resultFingerprint: string | null; params: unknown };
  variant: { runId: string; scenarioName: string; seed: number; engineVersion: string; resultFingerprint: string | null; params: unknown } | null;
  metrics: MetricDelta[];
  topLinks: { name: string; linkId: string; baselineCongestion: number; variantCongestion: number }[];
  findings: string[];
  assumptions: Record<string, unknown>;
  disclaimer: string;
}

const fmt = (v: number, unit: string) => {
  if (unit === 's') return v >= 120 ? `${(v / 60).toFixed(1)} min` : `${v.toFixed(0)} s`;
  if (unit === 'm/s') return `${(v * 3.6).toFixed(1)} km/h`;
  if (Math.abs(v) >= 1000) return `${Math.round(v).toLocaleString('en-US')} ${unit}`;
  return `${v.toFixed(v < 10 ? 2 : 0)} ${unit}`;
};

/** Deterministic narrative generated from computed deltas — no invented statistics. */
export function findingsFrom(metrics: MetricDelta[], hasVariant: boolean): string[] {
  if (!hasVariant) {
    return metrics
      .filter((m) => ['meanTravelTime', 'meanDelay', 'throughputPerHour', 'maxQueue'].includes(m.key))
      .map((m) => `${m.label}: ${fmt(m.baseline, m.unit)}${m.kind === 'estimate' ? ' (model estimate)' : ''}.`);
  }
  const notable = metrics.filter((m) => m.verdict !== 'unchanged' && m.percent !== null).sort((a, b) => Math.abs(b.percent!) - Math.abs(a.percent!));
  if (!notable.length) return ['No metric changed by more than 1 % between the two scenarios.'];
  return notable.slice(0, 6).map((m) => {
    const dir = m.delta < 0 ? 'fell' : 'rose';
    return `${m.label} ${dir} ${Math.abs(m.percent!).toFixed(1)} % (${fmt(m.baseline, m.unit)} → ${fmt(m.variant, m.unit)}) — ${m.verdict}${m.kind === 'estimate' ? ', model estimate' : ''}.`;
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderReportHtml(c: ReportContent): string {
  const rows = c.metrics
    .map(
      (m) => `<tr><td>${esc(m.label)}${m.kind === 'estimate' ? ' <span class="est">estimate</span>' : ''}</td><td>${esc(fmt(m.baseline, m.unit))}</td>${
        c.variant ? `<td>${esc(fmt(m.variant, m.unit))}</td><td class="${m.verdict}">${m.percent === null ? '—' : `${m.percent > 0 ? '+' : ''}${m.percent.toFixed(1)} %`}</td>` : ''
      }</tr>`,
    )
    .join('');
  const links = c.topLinks
    .map((l) => `<tr><td>${esc(l.name)} <code>${esc(l.linkId)}</code></td><td>${(l.baselineCongestion * 100).toFixed(0)} %</td>${c.variant ? `<td>${(l.variantCongestion * 100).toFixed(0)} %</td>` : ''}</tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} — MADAR report</title>
<style>
:root{--ink:#0D1020;--muted:#5b5f75;--line:#e4e1ec;--lav:#6a5be0;--mint:#1f8f7a;--peach:#c4572a}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#F6F4F1}
main{max-width:860px;margin:0 auto;padding:48px 28px 80px;background:#fff;min-height:100vh}
.brand{letter-spacing:.42em;font-weight:600;font-size:12px;color:var(--lav)}h1{font-size:30px;line-height:1.15;margin:.4em 0 .2em}
.meta{color:var(--muted);font-size:13px}table{width:100%;border-collapse:collapse;margin:14px 0 28px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.improved{color:var(--mint);font-weight:600}.worse{color:var(--peach);font-weight:600}
.est{font-size:11px;border:1px solid var(--line);border-radius:99px;padding:1px 7px;color:var(--muted)}h2{font-size:17px;margin-top:34px}
ul{padding-left:20px}code{font-size:12px;color:var(--muted)}.note{background:#f4f2fb;border-radius:10px;padding:14px 16px;font-size:13px;color:#3d3f52}
@media print{body{background:#fff}main{padding:0}}
</style></head><body><main>
<div class="brand">MADAR · THE CITY IN MOTION.</div>
<h1>${esc(c.title)}</h1>
<p class="meta">Generated ${esc(new Date(c.generatedAt).toUTCString())} · Engine ${esc(c.baseline.engineVersion)} · Baseline seed ${c.baseline.seed}</p>
${c.notes ? `<p>${esc(c.notes)}</p>` : ''}
<h2>Scenarios</h2>
<ul><li><strong>Baseline:</strong> ${esc(c.baseline.scenarioName)} <code>run ${esc(c.baseline.runId.slice(0, 8))} · fp ${esc(c.baseline.resultFingerprint ?? '')}</code></li>
${c.variant ? `<li><strong>Variant:</strong> ${esc(c.variant.scenarioName)} <code>run ${esc(c.variant.runId.slice(0, 8))} · fp ${esc(c.variant.resultFingerprint ?? '')}</code></li>` : ''}</ul>
<h2>Key findings</h2><ul>${c.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<h2>Metrics</h2><table><thead><tr><th>Metric</th><th>Baseline</th>${c.variant ? '<th>Variant</th><th>Change</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
<h2>Most affected roads</h2><table><thead><tr><th>Road</th><th>Baseline congestion</th>${c.variant ? '<th>Variant congestion</th>' : ''}</tr></thead><tbody>${links}</tbody></table>
<p class="note">${esc(c.disclaimer)}</p>
</main></body></html>`;
}
