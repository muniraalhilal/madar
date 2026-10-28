// Generates the MADAR identity as standalone SVG (outlined text — no font
// dependency) plus PNG favicons / app icons. Run: pnpm --filter @madar/brand build:assets
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { symbolSvg, wordmarkPaths, COLORS } from '../src/geometry.js';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'svg');
const png = join(here, '..', 'png');
mkdirSync(out, { recursive: true });
mkdirSync(png, { recursive: true });

const hb = await require('harfbuzzjs');
function shaper(fontPath) {
  const blob = hb.createBlob(readFileSync(fontPath));
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);
  const upem = face.upem;
  return (text, { size, x = 0, y = 0, tracking = 0, features } = {}) => {
    const buf = hb.createBuffer();
    buf.addText(text);
    buf.guessSegmentProperties();
    hb.shape(font, buf, features);
    const glyphs = buf.json();
    const scale = size / upem;
    let pen = 0;
    const parts = [];
    for (const g of glyphs) {
      const d = font.glyphToPath(g.g);
      if (d) parts.push(`<path transform="translate(${(x + (pen + g.dx) * scale).toFixed(2)} ${(y - g.dy * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`);
      pen += g.ax + (tracking * upem) / size;
    }
    buf.destroy();
    return { svg: parts.join(''), width: pen * scale };
  };
}
const fonts = {
  arabic: shaper(require.resolve('@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf')),
  arabicLight: shaper(require.resolve('@expo-google-fonts/ibm-plex-sans-arabic/300Light/IBMPlexSansArabic_300Light.ttf')),
  tagline: shaper(require.resolve('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf')),
};

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="MADAR — مَدار — The City in Motion.">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>\n`;

function lockup({ theme, layout }) {
  const ink = theme === 'dark' ? COLORS.sand : COLORS.midnight;
  const accent = theme === 'dark' ? COLORS.lavenderSoft : COLORS.lavenderDeep;
  const sym = (s, x, y) => `<g transform="translate(${x} ${y}) scale(${s / 200})">${symbolSvg({ theme, id: `${layout}-${theme}` })}</g>`;
  const word = (h, x, y) => wordmarkPaths({ height: h, x, y, color: ink, stroke: h * 0.075 });
  const ar = (size, cx, y) => {
    const t = fonts.arabic('مَدار', { size });
    return { svg: `<g fill="${accent}" transform="translate(${cx - t.width / 2} 0)">${fonts.arabic('مَدار', { size, y }).svg}</g>`, width: t.width };
  };
  const tag = (size, cx, y) => {
    const t = fonts.tagline('THE CITY IN MOTION.', { size, tracking: size * 0.42 });
    return `<g fill="${ink}" opacity="0.86" transform="translate(${cx - t.width / 2} 0)">${fonts.tagline('THE CITY IN MOTION.', { size, y, tracking: size * 0.42 }).svg}</g>`;
  };
  if (layout === 'stacked') {
    const W = 720;
    const wm = word(86, 0, 0);
    return {
      w: W,
      h: 640,
      body: sym(250, (W - 250) / 2, 20) + `<g transform="translate(${(W - wm.width) / 2} 300)">${wm.svg}</g>` + ar(64, W / 2, 470).svg + tag(22, W / 2, 560),
    };
  }
  if (layout === 'horizontal') {
    const wm = word(64, 0, 0);
    const W = 170 + 40 + wm.width + 30;
    return {
      w: W,
      h: 200,
      body: sym(170, 0, 15) + `<g transform="translate(210 40)">${wm.svg}</g>` + `<g transform="translate(${210 + wm.width / 2} 0)">${ar(40, 0, 158).svg}</g>`,
    };
  }
  if (layout === 'wordmark') {
    const wm = word(100, 0, 0);
    return { w: Math.ceil(wm.width) + 20, h: 120, body: `<g transform="translate(10 10)">${wm.svg}</g>` };
  }
  if (layout === 'wordmark-ar') {
    const t = fonts.arabic('مَدار', { size: 140 });
    return { w: Math.ceil(t.width) + 40, h: 200, body: `<g fill="${accent}">${fonts.arabic('مَدار', { size: 140, x: 20, y: 140 }).svg}</g>` };
  }
  if (layout === 'bilingual') {
    const wm = word(80, 0, 0);
    const W = Math.ceil(wm.width) + 60;
    return { w: W, h: 330, body: `<g transform="translate(30 20)">${wm.svg}</g>` + ar(70, W / 2, 210).svg + tag(20, W / 2, 300) };
  }
  throw new Error(layout);
}

const written = [];
const write = (name, content) => {
  writeFileSync(join(out, name), content);
  written.push(name);
};

for (const theme of ['dark', 'light']) {
  write(`symbol-${theme}.svg`, svg(200, 200, symbolSvg({ theme, id: `s-${theme}` })));
  for (const layout of ['stacked', 'horizontal', 'wordmark', 'wordmark-ar', 'bilingual']) {
    const l = lockup({ theme, layout });
    write(`logo-${layout}-${theme}.svg`, svg(Math.ceil(l.w), l.h, l.body));
  }
}
// primary = stacked on brand midnight
{
  const l = lockup({ theme: 'dark', layout: 'stacked' });
  write('logo-primary.svg', svg(l.w, l.h, l.body, COLORS.midnight));
}
// favicon: simplified symbol, bolder ring for 16–32 px legibility
write('favicon.svg', svg(64, 64, `<rect width="64" height="64" rx="14" fill="${COLORS.midnight}"/><g transform="translate(2 2) scale(0.3)">${symbolSvg({ theme: 'dark', id: 'fav', simple: true })}</g>`));
// app icon: rounded square, deep space gradient
const appIcon = (theme) =>
  svg(
    1024,
    1024,
    `<defs><linearGradient id="bg-${theme}" x1="0" y1="0" x2="1" y2="1">${
      theme === 'dark'
        ? `<stop offset="0" stop-color="#1B1838"/><stop offset="1" stop-color="${COLORS.midnight}"/>`
        : theme === 'light'
          ? `<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEEAF8"/>`
          : `<stop offset="0" stop-color="#A99BFF"/><stop offset="1" stop-color="#6F5FE6"/>`
    }</linearGradient></defs><rect width="1024" height="1024" rx="228" fill="url(#bg-${theme})"/><g transform="translate(132 132) scale(3.8)">${symbolSvg({ theme: theme === 'light' ? 'light' : 'dark', id: `app-${theme}` })}</g>`,
  );
write('app-icon-dark.svg', appIcon('dark'));
write('app-icon-light.svg', appIcon('light'));
write('app-icon-lavender.svg', appIcon('lavender'));

// PNG exports
const toPng = (name, size, file) => sharp(Buffer.from(readFileSync(join(out, name)))).resize(size, size).png().toFile(join(png, file));
await toPng('favicon.svg', 32, 'favicon-32.png');
await toPng('favicon.svg', 16, 'favicon-16.png');
await toPng('app-icon-dark.svg', 180, 'apple-touch-icon.png');
await toPng('app-icon-dark.svg', 512, 'icon-512.png');
await toPng('app-icon-dark.svg', 192, 'icon-192.png');
console.log(`✓ ${written.length} SVGs, 5 PNGs`);
