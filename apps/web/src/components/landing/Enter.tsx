import Link from 'next/link';
import { LogoStacked } from '@/components/brand/Logo';
import { Still } from './Still';

/** Section 8 — Enter MADAR. */
export function Enter() {
  return (
    <section className="relative isolate overflow-hidden bg-ink" aria-labelledby="enter-title">
      <div className="relative h-[100svh] min-h-[640px]">
        <Still name="enter" alt="Looking up at the crown of Madar Tower at blue hour, its lavender ring lit above the skyline." className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
        <div className="relative mx-auto flex h-full max-w-[1480px] flex-col items-center justify-end px-5 pb-20 text-center md:pb-24">
          <h2 id="enter-title" className="sr-only">
            Enter MADAR
          </h2>
          <LogoStacked scale={0.82} />
          <p className="mt-8 max-w-[40ch] text-lg leading-relaxed text-sand/85">Sign in, pick a junction, change its signals and run the morning again. The city will show you what happens.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Link href="/app" className="pill pill-primary">
              Enter MADAR
            </Link>
            <Link href="/register" className="pill pill-ghost">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
