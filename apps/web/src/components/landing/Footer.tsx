import { LogoHorizontal } from '@/components/brand/Logo';

export function Footer() {
  return (
    <footer className="border-t border-line-dark bg-ink text-sand/70">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-8 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <LogoHorizontal compact />
          <p className="mt-5 max-w-[56ch] text-sm leading-relaxed">
            A software engineering portfolio project. Madar is a fictional city; all city data is synthetic and every image on this page was rendered from it by MADAR&rsquo;s own offline renderer.
          </p>
        </div>
        <p className="text-[0.68rem] tracking-[0.32em] uppercase">Buildings / People / Infrastructure / Environment / Possibilities</p>
      </div>
    </footer>
  );
}
