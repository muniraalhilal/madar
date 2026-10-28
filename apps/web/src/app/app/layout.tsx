import { SessionProvider } from '@/components/app/session';
import { Shell } from '@/components/app/Shell';

export const metadata = { title: 'App' };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
