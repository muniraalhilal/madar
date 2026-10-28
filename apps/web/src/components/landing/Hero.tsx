'use client';
import { AppLink } from './AppLink';
import { useEffect, useRef, useState } from 'react';
import { LogoStacked } from '@/components/brand/Logo';
import { trackProgress, useIsPortrait, usePrefersReducedMotion } from '@/lib/motion';
import { Still } from './Still';
import { asset } from '@/lib/site';

const FRAMES = 90;
const frameUrl = (set: string, i: number) => `${asset('/media/seq')}/${set}/${String(i).padStart(3, '0')}.webp`;

/**
 * Section 1 — The City in Motion.
 * A camera flight rendered offline by MADAR's renderer, scrubbed by scroll on a
 * canvas. The still at the end of the flight is the server-rendered fallback
 * (and the only thing shown with reduced motion).
 */
export function Hero() {
  const track = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const portrait = useIsPortrait();
  const [p, setP] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const set = portrait ? 'hero-mobile' : 'hero-desktop';
    const imgs: HTMLImageElement[] = new Array(FRAMES);
    let loaded = 0;
    let cancelled = false;
    // Load the first and last frames first, then fill in the flight.
    const order = [0, FRAMES - 1, ...Array.from({ length: FRAMES - 2 }, (_, i) => i + 1)];
    order.forEach((i, k) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = frameUrl(set, i);
      img.onload = () => {
        loaded++;
        if (!cancelled && k < 2 && loaded >= 2) setReady(true);
        if (!cancelled) draw();
      };
      imgs[i] = img;
    });

    let raf = 0;
    let current = -1;
    const draw = () => {
      const c = canvas.current;
      const el = track.current;
      if (!c || !el) return;
      const prog = trackProgress(el);
      const want = Math.round(Math.min(1, prog / 0.82) * (FRAMES - 1));
      // nearest loaded frame so scrubbing never shows a blank
      let idx = want;
      for (let d = 0; d < FRAMES && !(imgs[idx]?.complete && imgs[idx]!.naturalWidth); d++) idx = Math.max(0, want - d);
      const img = imgs[idx];
      if (!img?.complete || !img.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        current = -1;
      }
      if (idx === current) return;
      current = idx;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const iw = img.naturalWidth * s;
      const ih = img.naturalHeight * s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (track.current) setP(trackProgress(track.current));
        draw();
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, portrait]);

  const prog = reduced ? 1 : p;
  const intro = 1 - smooth(0.05, 0.32, prog); // stacked logo over the aerial view
  const headline = smooth(0.42, 0.7, prog);

  return (
    <section ref={track} id="top" aria-label="MADAR — The City in Motion" className={reduced ? 'relative' : 'relative h-[290svh]'}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <Still name="hero" alt="Twilight over Madar, a fictional city: towers around the twisting Madar Tower, a lavender orbit of light in the sky and illuminated highways sweeping over the bay." priority className="absolute inset-0 h-full w-full" />
        {!reduced && <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }} />}
        {/* text-safe gradients: sky stays visible, type sits on calm tones */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" style={{ opacity: 0.35 + headline * 0.55 }} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/10 to-transparent max-md:hidden" style={{ opacity: headline }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/60 to-transparent" />

        {!reduced && (
          <div className="absolute inset-0 grid place-items-center px-6" style={{ opacity: intro, transform: `scale(${1 - (1 - intro) * 0.08})` }} aria-hidden={intro < 0.05}>
            <div className="max-md:scale-[0.78]">
              <LogoStacked />
            </div>
            <p className="absolute bottom-10 text-xs tracking-[0.3em] text-sand/70 uppercase">Scroll to descend</p>
          </div>
        )}

        <div
          className="absolute inset-x-0 bottom-0 mx-auto max-w-[1480px] px-5 pb-28 md:px-10 md:pb-32"
          style={{ opacity: headline, transform: `translateY(${(1 - headline) * 28}px)`, pointerEvents: headline < 0.5 ? 'none' : 'auto' }}
        >
          <h1 className="display-caps max-w-[13ch] text-[clamp(2.6rem,7.4vw,7.2rem)] text-white">
            The city
            <br />
            in motion.
          </h1>
          <p className="mt-6 max-w-[34ch] text-[clamp(1.05rem,1.5vw,1.3rem)] leading-relaxed text-sand/85">
            Explore the systems shaping tomorrow&rsquo;s cities.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <AppLink to="/app" className="pill pill-primary">
              Explore MADAR
            </AppLink>
            <a href="#connected" className="group inline-flex items-center gap-4 text-sand/90">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-sand/50 transition group-hover:border-white group-hover:bg-white/10">
                <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
                  <path d="M1 1 L13 8 L1 15 Z" fill="currentColor" />
                </svg>
              </span>
              <span className="tagline text-[0.72rem] leading-5 tracking-[0.32em]">
                Explore
                <br />
                the city
              </span>
            </a>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-ink/30 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-6 px-5 py-3.5 text-[0.68rem] tracking-[0.32em] text-sand/70 uppercase md:px-10">
            <span className="hidden md:inline">Buildings / People / Infrastructure / Environment / Possibilities</span>
            <span className="md:hidden">Buildings / People / Possibilities</span>
            <span className="hidden tracking-[0.12em] normal-case text-sand/55 sm:inline">Rendered by MADAR · fictional city</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
