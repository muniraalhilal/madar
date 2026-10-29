'use client';
import { ENERGY_ASSUMPTIONS, buildingHourlyLoad } from '@madar/sim-engine';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '@/components/app/session';
import { SERIES, ErrorNote, PageHeader, Panel, Skeleton, Stat } from '@/components/app/ui';
import { api } from '@/lib/api';
import { useCityMap } from '@/lib/city';

interface EnergyRes { hourlyKwh: number[]; dailyKwh: number; peakKw: number; peakHour: number; temperatureC: number[]; districts: { districtId: string; dailyKwh: number; peakKw: number; intensityKwhPerM2Day: number }[]; byUse: Record<string, number>; topBuildings: { buildingId: string; name: string; dailyKwh: number }[] }
interface Resp { baseline: EnergyRes; scenario: EnergyRes; savingKwh: number; savingPercent: number }

const NAMES: Record<string, string> = { noor: 'Al Noor Financial', souq: 'Old Souq', wadi: 'Wadi Gardens', harbor: 'Harbor Arc', innovation: 'Innovation Quarter' };

export default function Energy() {
  const { project } = useSession();
  const [lv, setLv] = useState({ setpointDelta: 1, lightingSaving: 0.3, occupancyScale: 1 });
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => {
      api<Resp>(`/cities/${project.cityId}/energy?setpointDelta=${lv.setpointDelta}&lightingSaving=${lv.lightingSaving}&occupancyScale=${lv.occupancyScale}`).then(setData).catch((e: Error) => setErr(e.message));
    }, 150);
    return () => clearTimeout(t);
  }, [lv, project]);
  const rows = data ? data.baseline.hourlyKwh.map((v, h) => ({ h: `${String(h).padStart(2, '0')}:00`, base: Math.round(v / 1000), scen: Math.round(data.scenario.hourlyKwh[h]! / 1000) })) : [];
  return (
    <>
      <PageHeader title="Buildings & energy" description="Building energy for one synthetic hot day. Move the levers to see the modelled effect — these are estimates from documented assumptions, not meter readings." />
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Levers" className="xl:self-start">
          <div className="space-y-6">
            <Lever label="Cooling setpoint" value={lv.setpointDelta} min={-3} max={4} step={0.5} show={(v) => `${v > 0 ? '+' : ''}${v} °C (24 °C base)`} onChange={(v) => setLv({ ...lv, setpointDelta: v })} />
            <Lever label="Lighting upgrades" value={lv.lightingSaving} min={0} max={0.6} step={0.05} show={(v) => `${Math.round(v * 100)} % less lighting load`} onChange={(v) => setLv({ ...lv, lightingSaving: v })} />
            <Lever label="Occupancy" value={lv.occupancyScale} min={0.5} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)} % of typical`} onChange={(v) => setLv({ ...lv, occupancyScale: v })} />
          </div>
        </Panel>
        <div className="space-y-6">
          {!data ? <Skeleton className="h-80" /> : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Daily use (scenario)" value={`${(data.scenario.dailyKwh / 1000).toFixed(0)} MWh`} sub={`baseline ${(data.baseline.dailyKwh / 1000).toFixed(0)} MWh`} tone="muted" />
                <Stat label="Change" value={`${data.savingPercent > 0 ? '−' : '+'}${Math.abs(data.savingPercent).toFixed(1)} %`} sub={`${Math.abs(data.savingKwh / 1000).toFixed(1)} MWh per day`} tone={data.savingPercent > 0 ? 'good' : 'bad'} />
                <Stat label="Peak demand" value={`${(data.scenario.peakKw / 1000).toFixed(1)} MW`} sub={`at ${String(data.scenario.peakHour).padStart(2, '0')}:00`} />
                <Stat label="Hottest hour" value={`${Math.max(...data.baseline.temperatureC).toFixed(1)} °C`} sub="synthetic outdoor temperature" />
              </div>
              <Panel title="Hourly load, MWh">
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(219,207,255,0.08)" vertical={false} />
                      <XAxis dataKey="h" stroke="rgba(246,244,241,0.45)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} interval={3} />
                      <YAxis stroke="rgba(246,244,241,0.45)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={{ background: '#0D1020', border: '1px solid rgba(219,207,255,0.16)', borderRadius: 12 }} cursor={{ fill: 'rgba(219,207,255,0.06)' }} formatter={(v: number, n: string) => [`${v} MWh`, n === 'base' ? 'Baseline' : 'Scenario']} />
                      <Legend formatter={(k: string) => <span style={{ color: '#F6F4F1', fontSize: 12 }}>{k === 'base' ? 'Baseline' : 'Scenario'}</span>} />
                      <Bar dataKey="base" fill={SERIES.baseline} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="scen" fill={SERIES.variant} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Districts" padded={false}>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-sand/55"><tr><th className="px-4 py-2 text-left font-normal">District</th><th className="px-4 py-2 text-right font-normal">MWh / day</th><th className="px-4 py-2 text-right font-normal">kWh / m² / day</th></tr></thead>
                    <tbody>{data.scenario.districts.map((d) => <tr key={d.districtId} className="border-t border-line-dark"><td className="px-4 py-2.5">{NAMES[d.districtId] ?? d.districtId}</td><td className="px-4 py-2.5 text-right tabular-nums">{(d.dailyKwh / 1000).toFixed(1)}</td><td className="px-4 py-2.5 text-right tabular-nums">{d.intensityKwhPerM2Day.toFixed(2)}</td></tr>)}</tbody>
                  </table>
                </Panel>
                <Panel title="Largest consumers" padded={false}>
                  <table className="w-full text-sm">
                    <tbody>{data.scenario.topBuildings.slice(0, 8).map((b) => <tr key={b.buildingId} className="border-t border-line-dark first:border-0"><td className="px-4 py-2.5">{b.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{(b.dailyKwh / 1000).toFixed(1)} MWh</td></tr>)}</tbody>
                  </table>
                </Panel>
              </div>
              <HourAndBuildings lv={lv} cityHourly={data} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Lever({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  const id = `lv-${label.replace(/\W+/g, '')}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm text-sand/75">{label}</label>
      <p className="text-sm tabular-nums text-white">{show(value)}</p>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#8B7CF6]" />
    </div>
  );
}

const USE_LABEL: Record<string, string> = { office: 'Office', residential: 'Residential', retail: 'Retail', mixed: 'Mixed use', civic: 'Civic', hotel: 'Hotel' };
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Time-of-day view and per-building detail, computed with the engine's building model. */
function HourAndBuildings({ lv, cityHourly }: { lv: { setpointDelta: number; lightingSaving: number; occupancyScale: number }; cityHourly: Resp }) {
  const { project } = useSession();
  const { city } = useCityMap(project?.cityId);
  const [hour, setHour] = useState(cityHourly.scenario.peakHour);
  const buildings = useMemo(() => (city ? [...city.buildings].sort((a, b) => a.name.localeCompare(b.name)) : []), [city]);
  const [bid, setBid] = useState('');
  const b = buildings.find((x) => x.id === bid) ?? buildings.find((x) => x.id === cityHourly.scenario.topBuildings[0]?.buildingId) ?? buildings[0];
  const atHour = useMemo(() => {
    if (!city) return [];
    return city.buildings.map((x) => ({ x, kwh: buildingHourlyLoad(x, lv)[hour]! })).sort((p, q) => q.kwh - p.kwh).slice(0, 6);
  }, [city, lv, hour]);
  if (!city || !b) return <Skeleton className="h-64" />;
  const base = buildingHourlyLoad(b);
  const scen = buildingHourlyLoad(b, lv);
  const max = Math.max(...base, ...scen);
  const district = city.districts.find((d) => d.id === b.districtId);
  return (
    <>
      <Panel title="Time of day">
        <label htmlFor="hour" className="text-sm text-sand/70">Hour shown: <span className="tabular-nums text-white">{hh(hour)}–{hh((hour + 1) % 24)}</span></label>
        <input id="hour" type="range" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="mt-2 w-full accent-[#8B7CF6]" />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="City load this hour" value={`${(cityHourly.scenario.hourlyKwh[hour]! / 1000).toFixed(0)} MWh`} sub={`baseline ${(cityHourly.baseline.hourlyKwh[hour]! / 1000).toFixed(1)} MWh · estimate`} tone="muted" />
          <Stat label="Outdoor temperature" value={`${cityHourly.baseline.temperatureC[hour]!.toFixed(1)} °C`} sub="synthetic hot day" tone="muted" />
          <div className="col-span-2 rounded-2xl border border-line-dark bg-midnight/70 px-5 py-4">
            <p className="text-[0.8rem] text-sand/60">Largest loads this hour</p>
            <ol className="mt-1.5 space-y-0.5 text-sm">
              {atHour.map(({ x, kwh }) => (
                <li key={x.id} className="flex justify-between gap-3"><button onClick={() => setBid(x.id)} className="truncate text-left text-white hover:text-lavender-soft">{x.name}</button><span className="shrink-0 tabular-nums text-sand/70">{(kwh / 1000).toFixed(2)} MWh</span></li>
              ))}
            </ol>
          </div>
        </div>
      </Panel>
      <Panel title="Building detail">
        <label htmlFor="bld" className="sr-only">Building</label>
        <select id="bld" value={b.id} onChange={(e) => setBid(e.target.value)} className="w-full max-w-md rounded-xl border border-line-dark bg-night-2 px-3 py-2.5 text-sm">
          {buildings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[
            ['Use', USE_LABEL[b.use] ?? b.use],
            ['District', district?.name ?? b.districtId],
            ['Floor area', `${fmtN(b.floorArea)} m²`],
            ['Height', `${Math.round(b.height)} m`],
            ['Daily use, levers applied', `${(scen.reduce((a, v) => a + v, 0) / 1000).toFixed(2)} MWh`],
            ['Daily use, baseline', `${(base.reduce((a, v) => a + v, 0) / 1000).toFixed(2)} MWh`],
            [`At ${hh(hour)}`, `${fmtN(scen[hour]!)} kWh`],
            ['Peak hour', hh(scen.indexOf(Math.max(...scen)))],
          ].map(([k, v]) => <div key={k}><dt className="text-xs text-sand/55">{k}</dt><dd className="mt-0.5 text-white">{v}</dd></div>)}
        </dl>
        <div className="mt-5 flex h-28 items-end gap-[3px]" role="img" aria-label={`Hourly energy use of ${b.name}, baseline and with levers applied`}>
          {scen.map((v, h) => (
            <button key={h} onClick={() => setHour(h)} className="group relative flex h-full flex-1 items-end" aria-label={`${hh(h)}: ${fmtN(v)} kWh`}>
              <span className="absolute bottom-0 w-full rounded-t-sm" style={{ height: `${(base[h]! / max) * 100}%`, background: 'rgba(139,124,246,0.28)' }} />
              <span className={`relative w-full rounded-t-sm ${h === hour ? 'bg-mint' : 'bg-[#2AA88F] group-hover:bg-mint'}`} style={{ height: `${(v / max) * 100}%` }} />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.7rem] text-sand/45"><span>00:00</span><span>12:00</span><span>23:00</span></div>
        <p className="mt-2 text-xs text-sand/55"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2AA88F]" />with levers · <span className="mx-1 inline-block h-2 w-2 rounded-sm bg-lavender/40" />baseline. Model estimate for a synthetic building.</p>
      </Panel>
      <Panel title="Assumptions">
        <ul className="space-y-1.5 text-sm text-sand/75">
          <li>Annual energy use intensity by use (kWh/m²·year): {Object.entries(ENERGY_ASSUMPTIONS.euiKwhPerM2Year).map(([k, v]) => `${USE_LABEL[k] ?? k} ${v}`).join(' · ')}.</li>
          <li>Cooling share of load: {Math.round(Math.min(...Object.values(ENERGY_ASSUMPTIONS.coolingShare)) * 100)}–{Math.round(Math.max(...Object.values(ENERGY_ASSUMPTIONS.coolingShare)) * 100)} % depending on use; lighting {Math.round(ENERGY_ASSUMPTIONS.lightingShare * 100)} % of non-cooling load.</li>
          <li>Cooling setpoint {ENERGY_ASSUMPTIONS.baseSetpointC} °C before levers. Outdoor temperature follows a synthetic day averaging {ENERGY_ASSUMPTIONS.outdoorMeanC} °C (±{ENERGY_ASSUMPTIONS.outdoorAmplitudeC} °C, warmest at 15:00).</li>
          <li>Hourly activity follows a typical profile for each building use; occupancy scales the swing around it.</li>
          <li className="text-sand/55">{ENERGY_ASSUMPTIONS.note}</li>
        </ul>
      </Panel>
    </>
  );
}

const fmtN = (v: number) => Math.round(v).toLocaleString('en-US');
