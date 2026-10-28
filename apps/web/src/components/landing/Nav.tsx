'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogoHorizontal } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '#connected', label: 'The city' },
  { href: '#movement', label: 'Movement' },
  { href: '#scenario-lab', label: 'Scenario Lab' },
  { href: '#engineering', label: 'Engineering' },
];

export function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 1.6);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-500',
        solid ? 'border-b border-line-dark bg-ink/70 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-5 md:h-20 md:px-10" aria-label="Main">
        <Link href="/" aria-label="MADAR home" className="shrink-0">
          <LogoHorizontal compact />
        </Link>
        <ul className="hidden items-center gap-9 text-[0.92rem] text-sand/80 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-[0.92rem] text-sand/80 hover:text-white sm:inline">
            Sign in
          </Link>
          <Link href="/app" className="pill pill-primary hidden !py-2.5 sm:inline-flex">
            Enter MADAR
          </Link>
          <Dialog.Root>
            <Dialog.Trigger className="grid h-11 w-11 place-items-center rounded-full border border-line-dark text-sand lg:hidden" aria-label="Open menu">
              <Menu size={20} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm" />
              <Dialog.Content className="fixed inset-x-3 top-3 z-50 rounded-3xl border border-line-dark bg-midnight p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <Dialog.Title className="sr-only">Menu</Dialog.Title>
                  <LogoHorizontal compact />
                  <Dialog.Close className="grid h-11 w-11 place-items-center rounded-full border border-line-dark" aria-label="Close menu">
                    <X size={20} />
                  </Dialog.Close>
                </div>
                <ul className="mt-8 space-y-1">
                  {LINKS.map((l) => (
                    <li key={l.href}>
                      <Dialog.Close asChild>
                        <a href={l.href} className="block rounded-2xl px-3 py-3.5 text-lg text-sand hover:bg-night-3">
                          {l.label}
                        </a>
                      </Dialog.Close>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Link href="/login" className="pill pill-ghost justify-center">
                    Sign in
                  </Link>
                  <Link href="/app" className="pill pill-primary justify-center">
                    Enter MADAR
                  </Link>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </nav>
    </header>
  );
}
