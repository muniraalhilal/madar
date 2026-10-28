'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Activity, Bell, Bookmark, Boxes, FileText, FlaskConical, Gauge, LayoutDashboard, LogOut, Menu, Settings, TriangleAlert, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoHorizontal } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from './session';

const NAV = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/explorer', label: 'City Explorer', icon: Boxes },
  { href: '/app/traffic', label: 'Traffic', icon: Activity },
  { href: '/app/energy', label: 'Energy', icon: Zap },
  { href: '/app/incidents', label: 'Incidents', icon: TriangleAlert },
  { href: '/app/scenarios', label: 'Scenario Lab', icon: FlaskConical },
  { href: '/app/results', label: 'Results', icon: Gauge },
  { href: '/app/reports', label: 'Reports', icon: FileText },
  { href: '/app/saved', label: 'Saved', icon: Bookmark },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.93rem] transition-colors', active ? 'bg-lavender/15 text-white' : 'text-sand/65 hover:bg-white/5 hover:text-sand')}
            >
              <Icon size={18} strokeWidth={1.7} className={active ? 'text-lavender-soft' : ''} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface Notification { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

function Notifications() {
  const { socket } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => {
    api<Notification[]>('/notifications').then(setItems).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!socket) return;
    const on = (n: Notification) => setItems((xs) => [n, ...xs].slice(0, 50));
    socket.on('notification', on);
    return () => {
      socket.off('notification', on);
    };
  }, [socket]);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <Dialog.Root onOpenChange={(open) => open && unread && api('/notifications/read-all', { method: 'POST' }).then(() => setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))))}>
      <Dialog.Trigger className="relative grid h-10 w-10 place-items-center rounded-full border border-line-dark text-sand/80 hover:text-white" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-lavender px-1 text-[0.68rem] text-white">{unread}</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50" />
        <Dialog.Content className="fixed right-3 top-16 z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line-dark bg-midnight p-4 shadow-2xl">
          <Dialog.Title className="font-medium">Notifications</Dialog.Title>
          <ul className="mt-3 max-h-[60vh] space-y-1 overflow-auto">
            {items.length === 0 && <li className="py-6 text-center text-sm text-sand/55">Nothing yet. Finished simulations appear here.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Dialog.Close asChild>
                  <Link href={n.link ?? '/app'} className="block rounded-xl px-3 py-2.5 hover:bg-white/5">
                    <p className="text-sm text-white">{n.title}</p>
                    <p className="text-xs text-sand/60">{n.body}</p>
                  </Link>
                </Dialog.Close>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, projects, project, setProjectId } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  };
  return (
    <div className="min-h-[100svh] bg-ink text-sand lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-[100svh] flex-col border-r border-line-dark bg-midnight/60 px-4 py-5 lg:flex">
        <Link href="/" className="px-2" aria-label="MADAR home">
          <LogoHorizontal compact />
        </Link>
        <nav className="mt-8 flex-1" aria-label="Application">
          <NavList />
        </nav>
        <div className="rounded-2xl border border-line-dark p-3">
          <p className="truncate text-sm text-white">{user?.displayName ?? '…'}</p>
          <p className="truncate text-xs text-sand/55">
            {user?.email} · {user?.role}
          </p>
          <button onClick={logout} className="mt-3 inline-flex items-center gap-2 text-xs text-sand/70 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line-dark bg-ink/80 px-4 backdrop-blur-xl md:px-8">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="grid h-10 w-10 place-items-center rounded-full border border-line-dark lg:hidden" aria-label="Open navigation">
              <Menu size={18} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] overflow-auto border-r border-line-dark bg-midnight p-4">
                <div className="flex items-center justify-between">
                  <LogoHorizontal compact />
                  <Dialog.Close className="grid h-10 w-10 place-items-center rounded-full border border-line-dark" aria-label="Close navigation">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <nav className="mt-6" aria-label="Application">
                  <NavList onNavigate={() => setOpen(false)} />
                </nav>
                <button onClick={logout} className="mt-6 inline-flex items-center gap-2 px-3 text-sm text-sand/70">
                  <LogOut size={16} /> Sign out
                </button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <label className="sr-only" htmlFor="project-select">
            Project
          </label>
          <select
            id="project-select"
            value={project?.id ?? ''}
            onChange={(e) => setProjectId(e.target.value)}
            className="max-w-[60vw] truncate rounded-full border border-line-dark bg-night-2 px-4 py-2 text-sm text-sand focus:outline-none focus:ring-2 focus:ring-lavender/60"
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Notifications />
          </div>
        </header>
        <main id="main" className="px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
