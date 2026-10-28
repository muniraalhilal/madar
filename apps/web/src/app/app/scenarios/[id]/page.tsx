'use client';
import { Bookmark, BookmarkCheck, Copy, Pause, Play, Plus, Square, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/app/session';
import { btn, ErrorNote, fmt, PageHeader, Panel, Skeleton, StatusBadge } from '@/components/app/ui';
import { ApiError, api, type Run, type Scenario, type ScenarioParams } from '@/lib/api';
import { useCityMap } from '@/lib/city';
import { useApi } from '@/lib/useApi';
import { useRunLive } from '@/lib/useRunLive';

type Draft = Pick<Scenario, 'name' | 'description' | 'isSaved' | 'signalOverrides' | 'closures' | 'incidents'> & { params: ScenarioParams };
interface Proposal { intersectionCode: string; intersectionName: string; currentGreens: number[]; proposedGreens: number[]; phaseNames: string[]; cycle: number; oversaturated: boolean }

function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const signalParam = useSearchParams().get('signal');
  const { project, canWrite } = useSession();
  const { city } = useCityMap(project?.cityId);
  const sc = useApi<Scenario>(`/scenarios/${id}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pace, setPace] = useState(60);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  useEffect(() => {
    if (!sc.data) return;
    const { name, description, isSaved, signalOverrides, closures, incidents, params } = sc.data;
    setDraft({ name, description, isSaved, signalOverrides, closures, incidents, params: params! });
    const running = sc.data.runs.find((r) => ['queued', 'running', 'paused'].includes(r.status));
    if (running) setActiveRun(running.id);
  }, [sc.data]);

  useEffect(() => {
    if (signalParam && draft && city && !draft.signalOverrides.some((o) => o.intersectionCode === signalParam)) {
      const plan = city.signals.find((p) => p.nodeId === signalParam);
      if (plan) setDraft({ ...draft, signalOverrides: [...draft.signalOverrides, { intersectionCode: plan.nodeId, intersectionName: city.nodes.find((n) => n.id === plan.nodeId)?.name ?? plan.nodeId, offsetS: null, greens: plan.phases.map((p) => p.green) }] });
    }
  }, [signalParam, draft, city]);

  const live = useRunLive(activeRun, null);
  useEffect(() => {
    if (live.status === 'completed' || live.status === 'failed' || live.status === 'cancelled') void sc.reload();
  }, [live.status]);

  const dirty = useMemo(() => {
    if (!sc.data || !draft) return false;
    const { name, description, isSaved, signalOverrides, closures, incidents, params } = sc.data;
    return JSON.stringify({ name, description, isSaved, signalOverrides, closures, incidents, params }) !== JSON.stringify(draft);
  }, [sc.data, draft]);

  if (sc.error) return <ErrorNote>{sc.error}</ErrorNote>;
  if (!sc.data || !draft || !city) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  const scenario = sc.data;
  const readOnly = !canWrite;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setP = (patch: Partial<ScenarioParams>) => setDraft({ ...draft, params: { ...draft.params, ...patch } });
  const signals = city.signals;
  const roadOptions = city.links.map((l) => {
    const a = city.nodes.find((n) => n.id === l.from)!;
    const b = city.nodes.find((n) => n.id === l.to)!;
    return { code: l.id, label: `${l.name}: ${a.name} → ${b.name}` };
  });
  const baselineRun = scenario.runs.find((r) => r.status === 'completed');

  async function save(): Promise<boolean> {
    setSaving(true);
    setIssues([]);
    setNotice(null);
    try {
      await api(`/scenarios/${id}`, {
        method: 'PATCH',
        json: {
          name: draft!.name,
          description: draft!.description,
          isSaved: draft!.isSaved,
          params: draft!.params,
          signalOverrides: draft!.signalOverrides.map(({ intersectionCode, offsetS, greens }) => ({ intersectionCode, offsetS, greens })),
          closures: draft!.closures.map(({ roadCode, startS, endS, reason }) => ({ roadCode, startS, endS, reason })),
          incidents: draft!.incidents.map(({ roadCode, kind, severity, startS, durationS, description }) => ({ roadCode, kind, severity, startS, durationS, description })),
        },
      });
      await sc.reload();
      setNotice('Saved.');
      return true;
    } catch (e) {
      if (e instanceof ApiError) setIssues(e.issues.length ? e.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)) : [e.message]);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function run() {
    if (dirty && !(await save())) return;
    try {
      const r = await api<Run>(`/scenarios/${id}/runs`, { method: 'POST', json: { pace } });
      setActiveRun(r.id);
      setNotice(r.identicalPreviousRunId ? 'Started. These exact inputs ran before — the result will be identical (deterministic engine).' : 'Simulation started.');
      void sc.reload();
    } catch (e) {
      setIssues([(e as Error).message]);
    }
  }

  async function control(action: 'pause' | 'resume' | 'cancel') {
    if (!activeRun) return;
    await api(`/runs/${activeRun}/control`, { method: 'POST', json: { action } }).catch((e: Error) => setIssues([e.message]));
  }

  async function propose() {
    const runId = scenario.runs.find((r) => r.status === 'completed')?.id;
    const list = await api<{ id: string; kind: string; latestRun: { id: string; status: string } | null }[]>(`/projects/${scenario.projectId}/scenarios`);
    const base = list.find((s) => s.kind === 'baseline' && s.latestRun?.status === 'completed');
    const src = base?.latestRun?.id ?? runId;
    if (!src) {
      setIssues(['Run the baseline first — Webster proposals need observed flows.']);
      return;
    }
    setProposals(await api<Proposal[]>(`/scenarios/${id}/propose-signals`, { method: 'POST', json: { runId: src } }));
  }

  const runActive = live.status && ['queued', 'running', 'paused'].includes(live.status);

  return (
    <>
      <PageHeader
        eyebrow={scenario.kind === 'baseline' ? 'Baseline scenario' : 'Variant scenario'}
        title={draft.name}
        description={<span>Every change here is validated by the same engine that runs the simulation.</span>}
        actions={
          <>
            {!readOnly && (
              <button className={btn.ghost} onClick={() => set({ isSaved: !draft.isSaved })} aria-pressed={draft.isSaved}>
                {draft.isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {draft.isSaved ? 'Saved' : 'Save to library'}
              </button>
            )}
            {!readOnly && (
              <button
                className={btn.ghost}
                onClick={async () => {
                  const copy = await api<Scenario>(`/scenarios/${id}/duplicate`, { method: 'POST' });
                  router.push(`/app/scenarios/${copy.id}`);
                }}
              >
                <Copy size={16} /> Duplicate
              </button>
            )}
            {!readOnly && (
              <button className={btn.primary} onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </>
        }
      />
      {issues.length > 0 && (
        <div className="mb-6">
          <ErrorNote>
            <span className="block font-medium">This scenario can&rsquo;t be saved yet:</span>
            <ul className="mt-1 list-disc pl-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </ErrorNote>
        </div>
      )}
      {notice && <p className="mb-6 text-sm text-mint" role="status">{notice}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Scenario">
            <div className="grid gap-4 md:grid-cols-2">
              <TextIn label="Name" value={draft.name} onChange={(v) => set({ name: v })} disabled={readOnly} />
              <TextIn label="Description" value={draft.description} onChange={(v) => set({ description: v })} disabled={readOnly} />
            </div>
          </Panel>

          <Panel title="Demand & time">
            <div className="grid gap-5 md:grid-cols-2">
              <Range label="Demand" value={draft.params.demandMultiplier} min={0.2} max={2} step={0.05} fmt={(v) => `${Math.round(v * 100)} % of base`} onChange={(v) => setP({ demandMultiplier: v })} disabled={readOnly} />
              <Range label="Duration" value={draft.params.durationS} min={600} max={7200} step={300} fmt={(v) => `${v / 60} min`} onChange={(v) => setP({ durationS: v })} disabled={readOnly} />
              <Range label="Start hour" value={draft.params.startHour} min={0} max={23} step={1} fmt={(v) => `${String(v).padStart(2, '0')}:00`} onChange={(v) => setP({ startHour: v })} disabled={readOnly} />
              <div>
                <label className="text-sm text-sand/70" htmlFor="seed">Random seed</label>
                <input id="seed" type="number" min={0} value={draft.params.seed} disabled={readOnly} onChange={(e) => setP({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-4 py-2.5 tabular-nums" />
                <p className="mt-1 text-xs text-sand/50">Same seed + same inputs = identical results.</p>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={draft.params.rerouting} disabled={readOnly} onChange={(e) => setP({ rerouting: e.target.checked })} className="h-4 w-4 accent-[#8B7CF6]" />
                Drivers re-route around closures and incidents
              </label>
            </div>
          </Panel>

          <Panel
            title={`Signal timings (${draft.signalOverrides.length})`}
            action={!readOnly && <button className={btn.ghost} onClick={propose}><Wand2 size={15} /> Propose with Webster</button>}
          >
            {proposals && (
              <div className="mb-5 rounded-xl border border-lavender/30 bg-lavender/10 p-4">
                <p className="text-sm text-white">Webster&rsquo;s method suggests new greens for {proposals.length} junctions, from flows observed in the latest baseline run.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    className={btn.primary}
                    onClick={() => {
                      set({ signalOverrides: proposals.map((p) => ({ intersectionCode: p.intersectionCode, intersectionName: p.intersectionName, offsetS: null, greens: p.proposedGreens })) });
                      setProposals(null);
                    }}
                  >
                    Apply all
                  </button>
                  <button className={btn.ghost} onClick={() => setProposals(null)}>Dismiss</button>
                </div>
              </div>
            )}
            {draft.signalOverrides.length === 0 && <p className="text-sm text-sand/60">All junctions use their default plans (35 s per phase).</p>}
            <ul className="space-y-4">
              {draft.signalOverrides.map((o, i) => {
                const plan = signals.find((p) => p.nodeId === o.intersectionCode);
                return (
                  <li key={o.intersectionCode} className="rounded-xl border border-line-dark p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{o.intersectionName}</p>
                      {!readOnly && (
                        <button className="text-sand/60 hover:text-danger" aria-label={`Remove override for ${o.intersectionName}`} onClick={() => set({ signalOverrides: draft.signalOverrides.filter((_, k) => k !== i) })}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {o.greens.map((g, k) => (
                        <Range
                          key={k}
                          label={`${plan?.phases[k]?.name ?? `Phase ${k + 1}`} green`}
                          value={g}
                          min={5}
                          max={120}
                          step={1}
                          fmt={(v) => `${v} s (default ${plan?.phases[k]?.green ?? '—'} s)`}
                          disabled={readOnly}
                          onChange={(v) => set({ signalOverrides: draft.signalOverrides.map((x, xi) => (xi === i ? { ...x, greens: x.greens.map((gg, gk) => (gk === k ? v : gg)) } : x)) })}
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {!readOnly && (
              <AddRow
                label="Retime a junction"
                options={signals.filter((p) => !draft.signalOverrides.some((o) => o.intersectionCode === p.nodeId)).map((p) => ({ code: p.nodeId, label: city.nodes.find((n) => n.id === p.nodeId)?.name ?? p.nodeId }))}
                onAdd={(code) => {
                  const plan = signals.find((p) => p.nodeId === code)!;
                  set({ signalOverrides: [...draft.signalOverrides, { intersectionCode: code, intersectionName: city.nodes.find((n) => n.id === code)?.name ?? code, offsetS: null, greens: plan.phases.map((p) => p.green) }] });
                }}
              />
            )}
          </Panel>

          <Panel title={`Road closures (${draft.closures.length})`}>
            <ul className="space-y-3">
              {draft.closures.map((c, i) => (
                <li key={`${c.roadCode}-${i}`} className="grid gap-3 rounded-xl border border-line-dark p-4 md:grid-cols-[1fr_120px_120px_auto] md:items-end">
                  <p className="text-sm text-white">{roadOptions.find((r) => r.code === c.roadCode)?.label ?? c.roadCode}</p>
                  <NumIn label="From (min)" value={c.startS / 60} onChange={(v) => set({ closures: draft.closures.map((x, k) => (k === i ? { ...x, startS: Math.round(v * 60) } : x)) })} disabled={readOnly} />
                  <NumIn label="Until (min)" value={c.endS == null ? '' : c.endS / 60} placeholder="end" onChange={(v) => set({ closures: draft.closures.map((x, k) => (k === i ? { ...x, endS: Number.isFinite(v) && v > 0 ? Math.round(v * 60) : null } : x)) })} disabled={readOnly} />
                  {!readOnly && <button className={btn.ghost} onClick={() => set({ closures: draft.closures.filter((_, k) => k !== i) })} aria-label="Remove closure"><Trash2 size={15} /></button>}
                </li>
              ))}
            </ul>
            {draft.closures.length === 0 && <p className="text-sm text-sand/60">No roads closed.</p>}
            {!readOnly && <AddRow label="Close a road" options={roadOptions} onAdd={(code) => set({ closures: [...draft.closures, { id: '', roadCode: code, roadName: '', startS: 0, endS: null, reason: '' }] })} />}
          </Panel>

          <Panel title={`Incidents (${draft.incidents.length})`}>
            <ul className="space-y-3">
              {draft.incidents.map((c, i) => (
                <li key={`${c.roadCode}-${i}`} className="grid gap-3 rounded-xl border border-line-dark p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto] xl:items-end">
                  <div>
                    <p className="text-sm text-white">{roadOptions.find((r) => r.code === c.roadCode)?.label ?? c.roadCode}</p>
                    <label className="sr-only" htmlFor={`kind-${i}`}>Kind</label>
                    <select id={`kind-${i}`} value={c.kind} disabled={readOnly} onChange={(e) => set({ incidents: draft.incidents.map((x, k) => (k === i ? { ...x, kind: e.target.value as typeof c.kind } : x)) })} className="mt-2 rounded-lg border border-line-dark bg-night-2 px-3 py-1.5 text-sm capitalize">
                      {['collision', 'breakdown', 'roadwork', 'event'].map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </div>
                  <Range label="Capacity lost" value={c.severity} min={0.1} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)} %`} disabled={readOnly} onChange={(v) => set({ incidents: draft.incidents.map((x, k) => (k === i ? { ...x, severity: v } : x)) })} />
                  <NumIn label="Starts (min)" value={c.startS / 60} onChange={(v) => set({ incidents: draft.incidents.map((x, k) => (k === i ? { ...x, startS: Math.round(v * 60) } : x)) })} disabled={readOnly} />
                  <NumIn label="Lasts (min)" value={c.durationS / 60} onChange={(v) => set({ incidents: draft.incidents.map((x, k) => (k === i ? { ...x, durationS: Math.max(30, Math.round(v * 60)) } : x)) })} disabled={readOnly} />
                  {!readOnly && <button className={btn.ghost} onClick={() => set({ incidents: draft.incidents.filter((_, k) => k !== i) })} aria-label="Remove incident"><Trash2 size={15} /></button>}
                </li>
              ))}
            </ul>
            {draft.incidents.length === 0 && <p className="text-sm text-sand/60">No incidents.</p>}
            {!readOnly && <AddRow label="Add an incident" options={roadOptions} onAdd={(code) => set({ incidents: [...draft.incidents, { id: '', roadCode: code, roadName: '', kind: 'collision', severity: 0.6, startS: 600, durationS: 1200, description: '' }] })} />}
          </Panel>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Panel title="Run simulation">
            {!readOnly && (
              <>
                <label className="text-sm text-sand/70" htmlFor="pace">Speed</label>
                <select id="pace" value={pace} onChange={(e) => setPace(Number(e.target.value))} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-3 py-2.5">
                  <option value={60}>Watch live — 60× real time</option>
                  <option value={240}>Fast live — 240×</option>
                  <option value={0}>As fast as possible</option>
                </select>
                <button className={`${btn.primary} mt-4 w-full justify-center py-3`} onClick={run} disabled={!!runActive}>
                  <Play size={16} /> {dirty ? 'Save and run' : 'Run simulation'}
                </button>
              </>
            )}
            {activeRun && live.status && (
              <div className="mt-5 rounded-xl border border-line-dark p-4" aria-live="polite">
                <div className="flex items-center justify-between">
                  <StatusBadge status={live.status} />
                  <span className="text-sm tabular-nums text-sand/70">{fmt.clock(draft.params.startHour, live.t)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(live.fraction * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Simulation progress">
                  <div className="h-full rounded-full bg-lavender transition-[width] duration-300" style={{ width: `${live.fraction * 100}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-sand/55">On the network</dt><dd className="tabular-nums">{fmt.n(live.vehicles)}</dd></div>
                  <div><dt className="text-xs text-sand/55">Trips done</dt><dd className="tabular-nums">{fmt.n(live.completed)}</dd></div>
                </dl>
                {live.error && <p className="mt-2 text-sm text-danger">{live.error}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {live.status === 'running' && <button className={btn.ghost} onClick={() => control('pause')}><Pause size={15} /> Pause</button>}
                  {live.status === 'paused' && <button className={btn.ghost} onClick={() => control('resume')}><Play size={15} /> Resume</button>}
                  {runActive && <button className={btn.danger} onClick={() => control('cancel')}><Square size={14} /> Cancel</button>}
                  {live.status === 'completed' && <Link href={`/app/results/${activeRun}`} className={btn.primary}>View results</Link>}
                </div>
                {live.events.length > 0 && (
                  <ul className="mt-4 max-h-36 space-y-1 overflow-auto text-xs text-sand/65">
                    {live.events.slice(-8).reverse().map((e, k) => <li key={k}>{fmt.clock(draft.params.startHour, e.t)} — {e.message}</li>)}
                  </ul>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Runs">
            {scenario.runs.length === 0 && <p className="text-sm text-sand/60">No runs yet.</p>}
            <ul className="space-y-2">
              {scenario.runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/results/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
                    <span className="text-sm">
                      {fmt.ago(r.queuedAt)}
                      {r.meanTravelTimeS != null && <span className="block text-xs text-sand/55">avg trip {fmt.s(r.meanTravelTimeS)} · {fmt.n(r.throughputPerHour)} veh/h</span>}
                    </span>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
            {baselineRun && scenario.kind === 'variant' && <CompareWithBaseline projectId={scenario.projectId} variantRun={baselineRun.id} />}
          </Panel>
        </div>
      </div>
    </>
  );
}

function CompareWithBaseline({ projectId, variantRun }: { projectId: string; variantRun: string }) {
  const list = useApi<{ kind: string; latestRun: { id: string; status: string } | null }[]>(`/projects/${projectId}/scenarios`);
  const b = list.data?.find((s) => s.kind === 'baseline' && s.latestRun?.status === 'completed');
  if (!b?.latestRun) return null;
  return (
    <Link href={`/app/compare?baseline=${b.latestRun.id}&variant=${variantRun}`} className={`${btn.ghost} mt-4 w-full justify-center`}>
      Compare latest run with baseline
    </Link>
  );
}

function TextIn({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm text-sand/70">{label}</label>
      <input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line-dark bg-night-2 px-4 py-2.5" />
    </div>
  );
}

function NumIn({ label, value, onChange, disabled, placeholder }: { label: string; value: number | string; onChange: (v: number) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <label className="block text-xs text-sand/60">
      {label}
      <input type="number" min={0} step="1" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-line-dark bg-night-2 px-3 py-2 text-sm tabular-nums text-sand" />
    </label>
  );
}

function Range({ label, value, min, max, step, fmt: f, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; disabled?: boolean }) {
  const id = `r-${label.toLowerCase().replace(/\W+/g, '-')}-${min}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-sand/70">{label}</label>
        <span className="text-sm tabular-nums text-white">{f(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#8B7CF6]" />
    </div>
  );
}

function AddRow({ label, options, onAdd }: { label: string; options: { code: string; label: string }[]; onAdd: (code: string) => void }) {
  const [v, setV] = useState('');
  const id = `add-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={v} onChange={(e) => setV(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 text-sm">
        <option value="">{label}…</option>
        {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      <button className={btn.ghost} disabled={!v} onClick={() => { onAdd(v); setV(''); }}><Plus size={15} /> Add</button>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
