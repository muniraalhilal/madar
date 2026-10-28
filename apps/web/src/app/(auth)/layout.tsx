import Link from 'next/link';
import { LogoHorizontal, LogoStacked } from '@/components/brand/Logo';
import { Still } from '@/components/landing/Still';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100svh] bg-ink lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="relative hidden overflow-hidden lg:block">
        <Still name="enter" alt="" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-ink/30" />
        <div className="absolute inset-x-0 bottom-16 flex justify-center">
          <LogoStacked scale={0.7} />
        </div>
      </div>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="MADAR home" className="w-fit">
          <LogoHorizontal compact />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-center text-xs text-sand/40">Synthetic data · fictional city · portfolio project</p>
      </main>
    </div>
  );
}
