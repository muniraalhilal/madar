'use client';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoStacked } from '@/components/brand/Logo';
import { demoReady, onBootProgress, resetDemo, type BootStep } from '@/demo/backend';
import { DEMO } from '@/demo/mode';
import { DemoWelcome, demoWelcomed } from './DemoWelcome';

/**
 * Demo-only wrapper around the application:
 *  - on a first visit, computes the sample study with the engine (a few seconds)
 *    and shows each step as it happens;
 *  - shows the demo notice to visitors who arrive directly on an app URL.
 */
export function DemoAppFrame({ children }: { children: React.ReactNode }) {
  if (!DEMO) return <>{children}</>;
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<BootStep[]>([]);
  const [welcome, setWelcome] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => setWelcome(!demoWelcomed()), []);
  useEffect(() => onBootProgress(setSteps), []);
  useEffect(() => {
    let live = true;
    setError(null);
    demoReady()
      .then(() => live && setReady(true))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [attempt]);

  const notice = welcome && <DemoWelcome open onOpenChange={(o) => !o && setWelcome(false)} onBack={() => router.push('/')} />;

  if (ready)
    return (
      <>
        {children}
        {notice}
      </>
    );
  const first = steps.length > 1;
  return (
    <div className="grid min-h-[100svh] place-items-center bg-ink px-5 py-12 text-sand">
      <div className="w-full max-w-md text-center">
        <LogoStacked scale={0.5} />
        {error ? (
          <div className="mt-10 rounded-2xl border border-danger/30 bg-danger/5 p-5 text-left text-sm" role="alert">
            <p className="font-medium text-white">The demo could not start.</p>
            <p className="mt-1 text-sand/70">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="pill pill-primary !py-2" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
              <button className="pill pill-ghost !py-2" onClick={async () => { await resetDemo(); setAttempt((a) => a + 1); }}>Reset the demo</button>
            </div>
          </div>
        ) : (
          <div className="mt-10" aria-live="polite">
            <p className="text-white">{first ? 'Preparing the demo city' : 'Opening the demo'}</p>
            {first && <p className="mt-1 text-sm text-sand/60">First visit: the MADAR engine is computing the sample study in your browser. This takes a few seconds and happens once.</p>}
            {first && (
              <ol className="mx-auto mt-6 max-w-sm space-y-2.5 text-left text-sm">
                {steps.filter((s) => s.label !== 'Ready').map((s) => (
                  <li key={s.label} className="flex items-start gap-2.5">
                    {s.done ? <Check size={16} className="mt-0.5 shrink-0 text-mint" aria-label="done" /> : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-lavender-soft motion-reduce:animate-none" aria-label="in progress" />}
                    <span className={s.done ? 'text-sand/60' : 'text-sand'}>{s.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {notice}
    </div>
  );
}
