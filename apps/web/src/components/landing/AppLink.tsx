'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DemoWelcome } from '@/components/demo/DemoWelcome';
import { DEMO } from '@/demo/mode';

/**
 * A link into the application. In the demo build every entry point first shows
 * the demo notice, then continues to `to` ("Sign in" and "Create an account"
 * lead to the dashboard: there are no accounts). Appearance is unchanged.
 */
export function AppLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!DEMO)
    return (
      <Link href={to} className={className}>
        {children}
      </Link>
    );
  const destination = to === '/login' || to === '/register' ? '/app' : to;
  return (
    <>
      <Link
        href={destination}
        className={className}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab: the app shows the notice itself
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Link>
      {open && <DemoWelcome open={open} onOpenChange={setOpen} destination={destination} />}
    </>
  );
}
