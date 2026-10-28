'use client';
import { useState } from 'react';
import { IconConnection, IconHarmony, IconMovement, IconProgress } from '@/components/brand/SystemIcons';
import data from '@/data/landing.json';
import { cn } from '@/lib/cn';
import { CityMap, type MapLayer } from './CityMap';

const LAYERS: { id: MapLayer; label: string; Icon: typeof IconMovement; text: string }[] = [
  { id: 'movement', label: 'Movement', Icon: IconMovement, text: 'Every road, coloured by how much of its travel time is lost to delay in the simulated 07:00 peak.' },
  { id: 'connection', label: 'Connection', Icon: IconConnection, text: `${data.city.counts.signals} signalised junctions and six regional gateways tie ${data.city.counts.roads} directed road links together.` },
  { id: 'harmony', label: 'Harmony', Icon: IconHarmony, text: 'Five districts, each with its own character, demand and rhythm through the day.' },
  { id: 'progress', label: 'Progress', Icon: IconProgress, text: `${data.city.counts.buildings} modelled buildings. Darker means taller — and, in the energy model, more floor area to cool.` },
];

/** Section 2 — Everything is connected. */
export function Connected() {
  const [layer, setLayer] = useState<MapLayer>('movement');
  const [district, setDistrict] = useState<string | null>(null);
  const active = LAYERS.find((l) => l.id === layer)!;
  const d = data.city.districts.find((x) => x.id === district);
  return (
    <section id="connected" className="relative bg-sand text-ink" aria-labelledby="connected-title">
      <div className="mx-auto grid max-w-[1480px] gap-12 px-5 py-24 md:px-10 md:py-36 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm font-medium text-lavender-deep">One city, many systems</p>
          <h2 id="connected-title" className="display-caps mt-5 text-[clamp(2.2rem,4.6vw,4.4rem)]">
            Everything
            <br />
            is connected.
          </h2>
          <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-slate-deep">
            A signal timing on one boulevard changes queues three junctions away. MADAR models the city as one network — roads, junctions, districts and
            buildings — so you can see how a change in one place travels through the rest.
          </p>
          <div role="tablist" aria-label="City systems" className="mt-10 grid grid-cols-4 gap-2 sm:max-w-md">
            {LAYERS.map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={layer === id}
                aria-controls="system-map"
                onClick={() => setLayer(id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-[0.8rem] transition-colors',
                  layer === id ? 'bg-ink text-sand' : 'text-slate-deep hover:bg-sand-2',
                )}
              >
                <Icon size={36} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-6 min-h-[3.5rem] max-w-[46ch] text-[0.98rem] leading-relaxed text-ink/75" aria-live="polite">
            {active.text}
          </p>
        </div>
        <div>
          <div id="system-map" role="tabpanel" aria-label={`${active.label} layer`} className="relative">
            <CityMap layer={layer} highlightDistrict={district} onDistrict={setDistrict} label={`Map of the fictional city of Madar showing the ${active.label.toLowerCase()} layer`} />
            {layer === 'movement' && (
              <div className="mt-4 flex items-center gap-3 text-xs text-slate-deep">
                <span>Free flow</span>
                <span className="h-1.5 w-40 rounded-full bg-[linear-gradient(90deg,#7CD9C7,#B4A3E6,#8B7CF6,#FFB58E,#FF7878)]" />
                <span>Delay-dominated</span>
              </div>
            )}
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-ink/10 pt-8 sm:grid-cols-4">
            {(d
              ? [
                  ['District', d.name],
                  ['Buildings', String(d.buildings)],
                  ['Floor area', `${(d.floorArea / 1e6).toFixed(2)} M m²`],
                  ['Signals', String(d.signals)],
                ]
              : [
                  ['Districts', String(data.city.counts.districts)],
                  ['Junctions', String(data.city.counts.intersections)],
                  ['Road links', String(data.city.counts.roads)],
                  ['Buildings', String(data.city.counts.buildings)],
                ]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.8rem] text-slate-deep">{k}</dt>
                <dd className="mt-1 text-xl font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-slate-deep">Synthetic data. Madar is a fictional reference city generated by the MADAR engine (city v{data.cityVersion}).</p>
        </div>
      </div>
    </section>
  );
}
