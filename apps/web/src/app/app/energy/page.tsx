'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '@/components/app/session';
import { SERIES, ErrorNote, PageHeader, Panel, Skeleton, Stat } from '@/components/app/ui';
import { api } from '@/lib/api';

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
      <PageHeader title="Energy monitoring" description="Building energy for one synthetic hot day. Move the levers to see the modelled effect — these are estimates from documented assumptions, not meter readings." />
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Levers">
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
