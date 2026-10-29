'use client';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../ui';

export interface Series {
  key: string;
  label: string;
  color: string;
  data: { t: number; v: number | null }[];
  dashed?: boolean;
}

/** Line chart over simulated time. One y-axis; ≥2 series get a legend. */
export function TimeSeries({ series, startHour = 7, unit, height = 240, format }: { series: Series[]; startHour?: number; unit: string; height?: number; format?: (v: number) => string }) {
  const ts = Array.from(new Set(series.flatMap((s) => s.data.map((d) => d.t)))).sort((a, b) => a - b);
  const rows = ts.map((t) => {
    // Time lives under a reserved key so a series may be called anything (even "t").
    const r: Record<string, number | null> = { __t: t };
    for (const s of series) r[s.key] = s.data.find((d) => d.t === t)?.v ?? null;
    return r;
  });
  const f = format ?? ((v: number) => `${Math.round(v).toLocaleString('en-US')} ${unit}`);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(219,207,255,0.08)" vertical={false} />
          <XAxis dataKey="__t" tickFormatter={(t: number) => fmt.clock(startHour, t)} stroke="rgba(246,244,241,0.45)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={36} />
          <YAxis stroke="rgba(246,244,241,0.45)" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))} />
          <Tooltip
            contentStyle={{ background: '#0D1020', border: '1px solid rgba(219,207,255,0.16)', borderRadius: 12, color: '#F6F4F1' }}
            labelFormatter={(t: number) => fmt.clock(startHour, t)}
            formatter={(v: number, name: string) => [f(v), series.find((s) => s.key === name)?.label ?? name]}
            cursor={{ stroke: 'rgba(219,207,255,0.35)' }}
          />
          {series.length > 1 && <Legend formatter={(k: string) => <span style={{ color: '#F6F4F1', fontSize: 12 }}>{series.find((s) => s.key === k)?.label}</span>} />}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#0D1020' }} strokeDasharray={s.dashed ? '5 4' : undefined} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
