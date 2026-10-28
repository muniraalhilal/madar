import { LiveTraffic } from './LiveTraffic';
import { Still } from './Still';

/** Section 3 — Movement, reimagined. */
export function Movement() {
  return (
    <section id="movement" className="relative bg-ink" aria-labelledby="movement-title">
      <div className="relative h-[78svh] min-h-[520px] overflow-hidden">
        <Still name="movement" alt="Long-exposure light trails on Madar's elevated interchange at blue hour, towers rising behind." className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/20 via-60% to-ink" />
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-ink/90 via-ink/55 to-transparent md:w-3/5" />
        <div className="relative mx-auto flex h-full max-w-[1480px] flex-col justify-start px-5 pt-28 md:px-10 md:pt-36">
          <h2 id="movement-title" className="display-caps text-[clamp(2.2rem,5vw,4.8rem)] text-white">
            Movement,
            <br />
            reimagined.
          </h2>
          <p className="mt-6 max-w-[36ch] text-lg leading-relaxed text-sand/90">
            Vehicles leave home, pick a route with A*, queue at red lights and spill back when a road fills. Nothing below is a video.
          </p>
        </div>
      </div>
      <div className="relative mx-auto -mt-28 max-w-[1480px] px-5 pb-28 md:-mt-40 md:px-10 md:pb-36">
        <LiveTraffic />
      </div>
    </section>
  );
}
