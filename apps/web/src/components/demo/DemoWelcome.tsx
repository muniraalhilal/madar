'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Symbol } from '@/components/brand/Logo';

const ACK_KEY = 'madar.demo.welcomed';

export function demoWelcomed(): boolean {
  try {
    return sessionStorage.getItem(ACK_KEY) === '1';
  } catch {
    return false;
  }
}
function markWelcomed() {
  try {
    sessionStorage.setItem(ACK_KEY, '1');
  } catch {
    /* storage unavailable: the notice simply shows again */
  }
}

/**
 * The single, honest front door to the application: this is a demonstration on
 * synthetic data, with no accounts. Shown from every landing-page entry point
 * and on a first direct visit to the app.
 */
export function DemoWelcome({
  open,
  onOpenChange,
  destination,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where "Explore demo" goes; omit to stay on the current page. */
  destination?: string;
  /** "Back to home": defaults to closing the dialog (we are already home). */
  onBack?: () => void;
}) {
  const router = useRouter();
  const explore = () => {
    markWelcomed();
    onOpenChange(false);
    if (destination) router.push(destination);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/75 backdrop-blur-md" />
        <Dialog.Content
          aria-describedby="demo-welcome-desc"
          className="fixed left-1/2 top-1/2 z-[81] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-line-dark bg-midnight text-sand shadow-[0_40px_120px_-20px_rgba(91,75,214,0.45)]"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-lavender/25" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-lavender/15" />
          <div className="relative px-7 pb-7 pt-8 sm:px-9 sm:pt-10">
            <Dialog.Close className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-line-dark text-sand/70 hover:text-white" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
            <Symbol size={48} id="demo-welcome" />
            <p className="tagline mt-6 text-[0.68rem] tracking-[0.36em] text-lavender-soft">Interactive demo · synthetic data</p>
            <Dialog.Title className="mt-3 text-[1.65rem] font-medium leading-tight tracking-tight text-white sm:text-3xl">Welcome to the MADAR demo.</Dialog.Title>
            <div id="demo-welcome-desc" className="mt-4 space-y-3 text-[0.98rem] leading-relaxed text-sand/75">
              <p>Explore a fictional city, test scenarios, and compare simulated results.</p>
              <p>This is an interactive demonstration using synthetic data. Registration and real account access are not available.</p>
            </div>
            <ul className="mt-5 space-y-1.5 text-sm text-sand/60">
              <li>· Simulations run in your browser with the MADAR engine.</li>
              <li>· Your changes are kept in this browser only. You can reset the demo at any time.</li>
            </ul>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="pill pill-ghost justify-center" onClick={() => (onBack ? onBack() : onOpenChange(false))}>
                Back to home
              </button>
              <button type="button" className="pill pill-primary justify-center" onClick={explore} autoFocus>
                Explore demo
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
