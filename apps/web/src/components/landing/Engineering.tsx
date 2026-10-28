import data from '@/data/landing.json';

const PILLARS = [
  { title: 'Simulation', text: 'A mesoscopic link-queue model: finite road storage, saturation-flow discharge, signal phases with start-up lost time, spillback and A* re-routing.' },
  { title: 'Data', text: 'PostgreSQL with PostGIS holds the road graph, buildings and districts as real geometry, with GiST indexes behind every spatial query.' },
  { title: 'Analytics', text: 'Each run stores a minute-by-minute time series, per-road and per-junction results, events and a compressed playback of every vehicle.' },
  { title: 'Reproducibility', text: 'Seeded randomness and index-ordered loops: the same scenario, seed and engine version always return the same result fingerprint.' },
  { title: 'Decisions', text: 'Comparisons are direction-aware — lower delay is better, higher throughput is better — and estimates are labelled as estimates.' },
];

/** Section 7 — Beyond visualization. */
export function Engineering() {
  const box = 'fill-white stroke-ink/15';
  return (
    <section id="engineering" className="bg-paper text-ink" aria-labelledby="eng-title">
      <div className="mx-auto max-w-[1480px] px-5 py-24 md:px-10 md:py-36">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <h2 id="eng-title" className="display-caps text-[clamp(2rem,4.4vw,4.2rem)]">
              Beyond
              <br />
              visualization.
            </h2>
            <p className="mt-7 max-w-[44ch] text-lg leading-relaxed text-slate-deep">
              The pictures are the easy part. Underneath is a working system: an API, a job queue, a simulation worker and a spatial database — each piece tested on its own and end to end.
            </p>
            <div className="mt-10 rounded-2xl bg-ink p-5 font-mono text-[0.8rem] leading-6 text-sand/85">
              <p className="text-sand/45">{'// identical inputs, identical outputs'}</p>
              <p>
                engine <span className="text-lavender-soft">v{data.engineVersion}</span> · seed <span className="text-lavender-soft">{data.seed}</span>
              </p>
              <p>
                baseline <span className="text-mint">{data.baseline.fingerprint}</span>
              </p>
              <p>
                variant&nbsp; <span className="text-mint">{data.optimised.fingerprint}</span>
              </p>
            </div>
          </div>
          <div>
            <svg viewBox="0 0 640 360" className="w-full" role="img" aria-label="Architecture: the browser talks to a NestJS API, which stores data in PostgreSQL with PostGIS and queues simulation jobs in Redis; a worker runs the engine, saves results and streams progress back through Redis to the browser over WebSockets.">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="#5B4BD6" />
                </marker>
              </defs>
              <g fontFamily="Space Grotesk, sans-serif" fontSize="14" fill="#0B0E1A">
                <rect x="10" y="140" width="130" height="80" rx="16" className={box} />
                <text x="75" y="175" textAnchor="middle" fontWeight="600">Browser</text>
                <text x="75" y="196" textAnchor="middle" fontSize="12" fill="#4A5066">Next.js · R3F</text>
                <rect x="250" y="140" width="140" height="80" rx="16" className={box} />
                <text x="320" y="175" textAnchor="middle" fontWeight="600">API</text>
                <text x="320" y="196" textAnchor="middle" fontSize="12" fill="#4A5066">NestJS · Socket.IO</text>
                <rect x="490" y="30" width="140" height="80" rx="16" className={box} />
                <text x="560" y="65" textAnchor="middle" fontWeight="600">PostgreSQL</text>
                <text x="560" y="86" textAnchor="middle" fontSize="12" fill="#4A5066">PostGIS · Drizzle</text>
                <rect x="490" y="250" width="140" height="80" rx="16" className={box} />
                <text x="560" y="285" textAnchor="middle" fontWeight="600">Redis</text>
                <text x="560" y="306" textAnchor="middle" fontSize="12" fill="#4A5066">BullMQ · pub/sub</text>
                <rect x="250" y="270" width="140" height="80" rx="16" fill="#0B0E1A" />
                <text x="320" y="305" textAnchor="middle" fontWeight="600" fill="#F6F4F1">Worker</text>
                <text x="320" y="326" textAnchor="middle" fontSize="12" fill="#B4A3E6">MADAR engine</text>
              </g>
              <g stroke="#5B4BD6" strokeWidth="1.6" fill="none" markerEnd="url(#arr)">
                <path d="M140 170 H246" />
                <path d="M250 192 H144" strokeDasharray="5 5" />
                <path d="M390 160 C 440 160, 450 80, 486 74" />
                <path d="M390 205 C 440 205, 450 285, 486 290" />
                <path d="M490 300 H394" />
                <path d="M320 270 C 330 200, 430 130, 486 90" strokeDasharray="5 5" />
              </g>
              <g fontFamily="Space Grotesk, sans-serif" fontSize="11.5" fill="#4A5066">
                <text x="150" y="160">REST · cookies</text>
                <text x="150" y="214">live frames (WS)</text>
                <text x="404" y="130">SQL</text>
                <text x="404" y="252">enqueue</text>
                <text x="404" y="318">jobs · progress</text>
                <text x="360" y="230">results</text>
              </g>
            </svg>
            <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {PILLARS.map((p) => (
                <li key={p.title} className="border-t border-ink/12 pt-5">
                  <h3 className="font-medium">{p.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-deep">{p.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
