import { cn } from '@/lib/cn';

type Name = 'hero' | 'night' | 'movement' | 'enter';

/**
 * Art-directed responsive render: a portrait composition for phones and a
 * landscape one for everything else, each in AVIF with WebP fallback. All
 * sizes are downscaled from native renders (3840×2160 / 1440×3120).
 */
export function Still({ name, alt, className, priority = false, imgClassName }: { name: Name; alt: string; className?: string; priority?: boolean; imgClassName?: string }) {
  const d = (ext: string) => [1280, 1920, 2560, 3840].map((w) => `/media/${name}-desktop-${w}.${ext} ${w}w`).join(', ');
  const m = (ext: string) => [828, 1080, 1440].map((w) => `/media/${name}-mobile-${w}.${ext} ${w}w`).join(', ');
  const portrait = '(max-aspect-ratio: 4/5), (max-width: 767px)';
  return (
    <picture className={cn('block', className)}>
      <source media={portrait} type="image/avif" srcSet={m('avif')} sizes="100vw" />
      <source media={portrait} type="image/webp" srcSet={m('webp')} sizes="100vw" />
      <source type="image/avif" srcSet={d('avif')} sizes="100vw" />
      <source type="image/webp" srcSet={d('webp')} sizes="100vw" />
      <img
        src={`/media/${name}-desktop-1920.webp`}
        alt={alt}
        className={cn('h-full w-full object-cover', imgClassName)}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        width={3840}
        height={2160}
      />
    </picture>
  );
}
