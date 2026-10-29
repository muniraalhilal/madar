'use client';
import type { Frame } from '@madar/sim-engine';
import { Pause, Play, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Selection } from '@/components/app/explorer/CityScene';
import { useSession } from '@/components/app/session';
import { btn, ErrorNote, fmt, StatusBadge } from '@/components/app/ui';
import { api, type Run, type ScenarioListItem } from '@/lib/api';
import { useCityMap } from '@/lib/city';
import { usePlayback } from '@/lib/playback';
import { useApi } from '@/lib/useApi';

const CityScene = dynamic(() => import('@/components/app/explorer/CityScene').then((m) => m.CityScene), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sand/50">Loading the city…</div> });

interface LinkRow { linkId: string; congestion: number; meanQueue: number; exited: number; meanTravelTime: number | null; meanSpeed: number | null; maxQueue: number; utilization: number }

export default function ExplorerPage() {
  const { project, canWrite } = useSession();
  const { city, error } = useCityMap(project?.cityId);
  const runs = useApi<Run[]>(project ? `/projects/${project.id}/runs` : null);
  const completed = (runs.data ?? []).filter((r) => r.status === 'completed');
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => {
    if (!runId && completed[0]) setRunId(completed[0].id);
  }, [completed, runId]);
  const links = useApi<LinkRow[]>(runId ? `/runs/${runId}/links` : null);
  const congestion = useMemo(() => (links.data ? Object.fromEntries(links.data.map((l) => [l.linkId, l.congestion])) : undefined), [links.data]);
  const { frames, error: pbError } = usePlayback(runId);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!frames || !playing) return;
    const id = setInterval(() => setFi((i) => (i + 1) % frames.length), 90);
    return () => clearInterval(id);
  }, [frames, playing]);
  const frame: Frame | null = frames?.[fi] ?? null;
  const [sel, setSel] = useState<Selection>(null);
  const [layers, setLayers] = useState({ congestion: true, vehicles: true });
  const [focus, setFocus] = useState<THREE.Vector3 | null>(null);
  const selectedRun = completed.find((r) => r.id === runId);
  const startHour = (selectedRun?.params as { startHour?: number } | undefined)?.startHour ?? 7;

  return (
    <div className="-mx-4 -my-6 h-[calc(100svh-4rem)] md:-mx-8 md:-my-8">
      <div className="relative h-full">
        {error && <div className="p-6"><ErrorNote>Could not load the city: {error}</ErrorNote></div>}
        {city && <CityScene city={city} congestion={layers.congestion ? congestion : undefined} frame={layers.vehicles ? frame : null} selected={sel} onSelect={(s) => { setSel(s); if (s && city) { const p = locate(city, s); if (p) setFocus(p); } }} focus={focus} />}

        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-3 md:inset-x-5 md:top-5">
          <div className="pointer-events-auto rounded-2xl border border-line-dark bg-ink/80 p-3 backdrop-blur-xl">
            <p className="text-xs text-sand/60">Colour roads by</p>
            <label className="sr-only" htmlFor="run-pick">Simulation run</label>
            <select id="run-pick" value={runId ?? ''} onChange={(e) => { setRunId(e.target.value || null); setFi(0); }} className="mt-1 max-w-[70vw] rounded-lg border border-line-dark bg-night-2 px-3 py-1.5 text-sm">
              {completed.length === 0 && <option value="">No completed runs yet</option>}
              {completed.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.scenarioName} · {fmt.ago(r.finishedAt ?? r.queuedAt)}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-sand/60">
              <span>Free</span>
              <span className="h-1.5 w-24 rounded-full bg-[linear-gradient(90deg,#7CD9C7,#B4A3E6,#8B7CF6,#FFB58E,#FF7878)]" />
              <span>Congested</span>
            </div>
            <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-dark pt-2 text-xs text-sand/75">
              <legend className="sr-only">Layers</legend>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#8B7CF6]" checked={layers.congestion} onChange={(e) => setLayers({ ...layers, congestion: e.target.checked })} /> Road congestion</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#8B7CF6]" checked={layers.vehicles} onChange={(e) => setLayers({ ...layers, vehicles: e.target.checked })} /> Vehicles</label>
            </fieldset>
          </div>
          <p className="pointer-events-auto hidden rounded-full border border-line-dark bg-ink/70 px-3 py-1.5 text-xs text-sand/60 backdrop-blur md:block">Drag to pan · right-drag to orbit · scroll to zoom · click a road, junction or building</p>
        </div>

        {frames && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl border border-line-dark bg-ink/80 px-3 py-2.5 backdrop-blur-xl md:inset-x-auto md:bottom-5 md:left-5 md:w-[460px]">
            <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lavender text-white" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause playback' : 'Play playback'}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <label htmlFor="scrub" className="sr-only">Playback time</label>
            <input id="scrub" type="range" min={0} max={frames.length - 1} value={fi} onChange={(e) => { setFi(Number(e.target.value)); setPlaying(false); }} className="w-full accent-[#8B7CF6]" />
            <span className="w-24 shrink-0 text-right text-sm tabular-nums">{fmt.clock(startHour, frame?.t ?? 0)} · {frame?.count ?? 0}</span>
          </div>
        )}
        {pbError && <p className="absolute bottom-5 left-5 rounded-xl bg-ink/80 px-3 py-2 text-xs text-sand/60">{pbError}</p>}

        {sel && city && <Inspector sel={sel} city={city} links={links.data} runStatus={selectedRun} canWrite={canWrite} projectId={project?.id} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}

function locate(city: NonNullable<ReturnType<typeof useCityMap>['city']>, s: NonNullable<Selection>): THREE.Vector3 | null {
  if (s.type === 'intersection') {
    const n = city.nodes.find((x) => x.id === s.id);
    return n ? new THREE.Vector3(n.x, 0, -n.y) : null;
  }
  if (s.type === 'road') {
    const l = city.links.find((x) => x.id === s.id);
    const a = city.nodes.find((x) => x.id === l?.from);
    const b = city.nodes.find((x) => x.id === l?.to);
    return a && b ? new THREE.Vector3((a.x + b.x) / 2, 0, -(a.y + b.y) / 2) : null;
  }
  const b = city.buildings.find((x) => x.id === s.id);
  if (!b) return null;
  const cx = b.footprint.reduce((t, p) => t + p.x, 0) / b.footprint.length;
  const cy = b.footprint.reduce((t, p) => t + p.y, 0) / b.footprint.length;
  return new THREE.Vector3(cx, 0, -cy);
}

function Inspector({ sel, city, links, runStatus, canWrite, projectId, onClose }: { sel: NonNullable<Selection>; city: NonNullable<ReturnType<typeof useCityMap>['city']>; links: LinkRow[] | null; runStatus?: Run; canWrite: boolean; projectId?: string; onClose: () => void }) {
  const scenarios = useApi<ScenarioListItem[]>(projectId ? `/projects/${projectId}/scenarios` : null);
  const variants = (scenarios.data ?? []).filter((s) => s.kind === 'variant');
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMsg(null), [sel]);

  let title = '';
  let body: React.ReactNode = null;
  if (sel.type === 'road') {
    const l = city.links.find((x) => x.id === sel.id)!;
    const r = links?.find((x) => x.linkId === sel.id);
    const from = city.nodes.find((n) => n.id === l.from)!;
    const to = city.nodes.find((n) => n.id === l.to)!;
    title = l.name;
    body = (
      <>
        <p className="text-sm text-sand/65">
          {from.name} → {to.name}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Item k="Length" v={`${Math.round(l.length)} m`} />
          <Item k="Lanes" v={l.lanes} />
          <Item k="Speed limit" v={fmt.kmh(l.speedLimit)} />
          <Item k="Capacity" v={`${(l.lanes * l.saturationFlow).toLocaleString('en-US')} veh/h`} />
          {r && (
            <>
              <Item k="Congestion" v={`${Math.round(r.congestion * 100)} %`} />
              <Item k="Mean queue" v={`${r.meanQueue.toFixed(1)} veh`} />
              <Item k="Vehicles through" v={fmt.n(r.exited)} />
              <Item k="Mean travel time" v={fmt.s(r.meanTravelTime)} />
            </>
          )}
        </dl>
        {canWrite && (
          <div className="mt-5 border-t border-line-dark pt-4">
            <p className="text-sm text-white">Close this road in a scenario</p>
            <div className="mt-2 flex gap-2">
              <label className="sr-only" htmlFor="close-target">Scenario</label>
              <select id="close-target" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line-dark bg-night-2 px-3 py-2 text-sm">
                <option value="">Choose a variant…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                className={btn.primary}
                disabled={!target}
                onClick={async () => {
                  try {
                    const sc = await api<{ closures: { roadCode: string; startS: number; endS: number | null; reason: string }[] }>(`/scenarios/${target}`);
                    await api(`/scenarios/${target}`, { method: 'PATCH', json: { closures: [...sc.closures.map(({ roadCode, startS, endS, reason }) => ({ roadCode, startS, endS, reason })), { roadCode: sel.id, startS: 0, reason: 'Added from City Explorer' }] } });
                    setMsg('Closure added. Run the scenario to see the effect.');
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                Add
              </button>
            </div>
            {msg && <p className="mt-2 text-xs text-sand/70" role="status">{msg}</p>}
          </div>
        )}
      </>
    );
  } else if (sel.type === 'intersection') {
    const n = city.nodes.find((x) => x.id === sel.id)!;
    const plan = city.signals.find((p) => p.nodeId === n.id);
    title = n.name;
    body = (
      <>
        <p className="text-sm capitalize text-sand/65">{n.kind === 'signal' ? 'Signalised junction' : n.kind === 'gateway' ? 'Regional gateway' : 'Priority junction'}</p>
        {plan && (
          <div className="mt-4">
            <p className="text-sm text-white">Signal plan · cycle {plan.phases.reduce((s, p) => s + p.green + p.yellow + p.allRed, 0)} s</p>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full">
              {plan.phases.map((p, i) => (
                <div key={i} className="flex">
                  <span style={{ width: p.green * 3 }} className={i % 2 ? 'bg-mint-deep' : 'bg-lavender'} />
                  <span style={{ width: p.yellow * 3 }} className="bg-peach" />
                  <span style={{ width: p.allRed * 3 }} className="bg-danger/70" />
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-sm text-sand/75">
              {plan.phases.map((p) => (
                <li key={p.name}>{p.name}: {p.green} s green, {p.yellow} s yellow, {p.allRed} s all-red</li>
              ))}
            </ul>
            {canWrite && (
              <Link href={`/app/scenarios?signal=${n.id}`} className={`${btn.ghost} mt-4`}>
                Retime in Scenario Lab
              </Link>
            )}
          </div>
        )}
      </>
    );
  } else {
    const b = city.buildings.find((x) => x.id === sel.id)!;
    title = b.name;
    const d = city.districts.find((x) => x.id === b.districtId);
    body = (
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <Item k="District" v={d?.name ?? b.districtId} />
        <Item k="Use" v={<span className="capitalize">{b.use}</span>} />
        <Item k="Height" v={`${Math.round(b.height)} m`} />
        <Item k="Floors" v={b.floors} />
        <Item k="Floor area" v={`${fmt.n(b.floorArea)} m²`} />
      </dl>
    );
  }
  return (
    <aside className="absolute inset-x-3 bottom-20 max-h-[55svh] overflow-auto rounded-2xl border border-line-dark bg-ink/90 p-5 backdrop-blur-xl md:inset-x-auto md:bottom-auto md:right-5 md:top-5 md:w-[360px] md:max-h-[calc(100%-2.5rem)]" aria-label="Selection details">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-white">{title}</h2>
        <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-dark" aria-label="Close details">
          <X size={16} />
        </button>
      </div>
      {body}
      {runStatus && <p className="mt-5 flex items-center gap-2 text-xs text-sand/50">Results from <StatusBadge status={runStatus.status} /> {runStatus.scenarioName}</p>}
    </aside>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-sand/55">{k}</dt>
      <dd className="mt-0.5 tabular-nums text-sand">{v}</dd>
    </div>
  );
}
