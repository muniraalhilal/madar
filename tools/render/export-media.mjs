// Converts native renders into responsive AVIF + WebP sets for the web app.
// Every size is a DOWNscale of the native render — nothing is upscaled.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const src = new URL('./out/', import.meta.url).pathname;
const dst = new URL('../../apps/web/public/media/', import.meta.url).pathname;
mkdirSync(dst, { recursive: true });
const sets = {
  desktop: { native: [3840, 2160], widths: [3840, 2560, 1920, 1280] },
  mobile: { native: [1440, 3120], widths: [1440, 1080, 828] },
};
for (const name of ['hero', 'night', 'movement', 'enter']) {
  for (const [kind, cfg] of Object.entries(sets)) {
    const file = join(src, `${name}-${kind}-${cfg.native[0]}x${cfg.native[1]}.png`);
    if (!existsSync(file)) { console.warn('missing', file); continue; }
    for (const w of cfg.widths) {
      if (w > cfg.native[0]) continue;
      const base = join(dst, `${name}-${kind}-${w}`);
      const img = sharp(file).resize({ width: w, kernel: 'lanczos3' });
      await img.clone().avif({ quality: 58, effort: 6, chromaSubsampling: '4:4:4' }).toFile(`${base}.avif`);
      await img.clone().webp({ quality: 82, effort: 6 }).toFile(`${base}.webp`);
    }
    // tiny blurred placeholder
    await sharp(file).resize({ width: 32 }).blur(1.2).webp({ quality: 50 }).toFile(join(dst, `${name}-${kind}-lqip.webp`));
    console.log('✓', name, kind);
  }
}
for (const seq of ['hero-desktop', 'hero-mobile']) {
  const dir = join(src, 'seq', seq);
  if (existsSync(dir) && readdirSync(dir).length) cpSync(dir, join(dst, 'seq', seq), { recursive: true });
}
