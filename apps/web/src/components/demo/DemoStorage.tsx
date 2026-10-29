'use client';
import { HardDrive, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { btn, fmt } from '@/components/app/ui';
import { demoStorageInfo, resetDemo } from '@/demo/backend';
import { DEMO } from '@/demo/mode';
import { asset } from '@/lib/site';

/** Where the demo keeps the visitor's work, and a way to start over. */
export function DemoStorage({ compact = false }: { compact?: boolean }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof demoStorageInfo>> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (DEMO) void demoStorageInfo().then(setInfo);
  }, []);
  if (!DEMO) return null;
  const persistent = info?.stateSaved && info.resultsSaved;
  const reset = async () => {
    setBusy(true);
    await resetDemo();
    window.location.assign(asset('/app/'));
  };
  return (
    <div className={compact ? '' : 'rounded-2xl border border-line-dark bg-midnight/70 p-5'}>
      <div className="flex items-start gap-3">
        <HardDrive size={18} className="mt-0.5 shrink-0 text-lavender-soft" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          {info === null ? (
            <p className="text-sand/60">Checking this browser’s storage…</p>
          ) : persistent ? (
            <p className="text-sand/80">
              Your scenarios, runs and reports are <strong className="font-medium text-white">saved in this browser</strong> and will be here when you come back on this device. Nothing is sent to a server, and other visitors cannot see them.
            </p>
          ) : (
            <p className="text-sand/80">
              This browser is not allowing site storage (for example in a private window), so your changes <strong className="font-medium text-white">last only until you close this tab</strong>.
            </p>
          )}
          {info?.createdAt && <p className="mt-1 text-xs text-sand/50">Demo started {fmt.ago(info.createdAt)}.</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-sand/75">Delete everything you created and recompute the sample study?</span>
            <button className={btn.danger} onClick={reset} disabled={busy}>
              <RotateCcw size={15} /> {busy ? 'Resetting…' : 'Yes, reset'}
            </button>
            <button className={btn.ghost} onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <button className={btn.ghost} onClick={() => setConfirming(true)}>
            <RotateCcw size={15} /> Reset demo
          </button>
        )}
      </div>
    </div>
  );
}
