// MADAR identity geometry — the single source for every logo rendering
// (generated SVG files, the web app's React components, favicons).

export const COLORS = {
  midnight: '#0B0E1A', // Deep Indigo — primary dark
  surface: '#0D1020', // Deep Midnight — raised dark surfaces
  lavender: '#8B7CF6', // Cosmic Lavender — primary accent
  lavenderSoft: '#B4A3E6', // Soft Lavender
  lavenderMist: '#DBCFFF',
  lavenderDeep: '#5B4BD6',
  mint: '#7CD9C7',
  sand: '#F6F4F1', // Sand White
  slate: '#8D93A6',
  peach: '#FFB58E',
};

/**
 * The orbital symbol: a tilted ring passing behind and then in front of a
 * glass-like sphere, with a small orbiting point. 200×200 viewBox.
 */
export function symbolSvg({ theme = 'dark', id = 'm', simple = false } = {}) {
  const dark = theme === 'dark';
  const ringA = dark ? '#6E5FE8' : '#4B3CC4';
  const ringB = dark ? '#B4A3E6' : '#7A6AF0';
  const ringC = dark ? '#F3F0FF' : '#B4A3E6';
  const sw = simple ? 9 : 5.2;
  const glow = simple
    ? ''
    : `<filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const g = simple ? '' : ` filter="url(#glow-${id})"`;
  // ellipse in the rotated frame
  const cx = 100, cy = 100, rx = 84, ry = 33;
  const a = (-52 * Math.PI) / 180;
  const dx = cx + rx * Math.cos(a);
  const dy = cy + ry * Math.sin(a);
  return `<defs>
<radialGradient id="orb-${id}" cx="0.36" cy="0.3" r="0.78"><stop offset="0" stop-color="#FBF9FF"/><stop offset="0.32" stop-color="${dark ? '#D6CCFF' : '#CFC4FA'}"/><stop offset="0.72" stop-color="${dark ? '#8070E8' : '#7766DD'}"/><stop offset="1" stop-color="${dark ? '#2E2670' : '#3D3392'}"/></radialGradient>
<linearGradient id="ring-${id}" x1="0" y1="0.5" x2="1" y2="0.5"><stop offset="0" stop-color="${ringA}"/><stop offset="0.55" stop-color="${ringB}"/><stop offset="1" stop-color="${ringC}"/></linearGradient>
<radialGradient id="dot-${id}" cx="0.4" cy="0.4" r="0.7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="${dark ? '#B4A3E6' : '#7A6AF0'}"/></radialGradient>
${glow}</defs>
<g transform="rotate(-24 100 100)" fill="none" stroke="url(#ring-${id})" stroke-linecap="round">
<path d="M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" stroke-width="${sw * 0.8}" opacity="${simple ? 0.9 : 0.6}"/>
</g>
<circle cx="100" cy="102" r="${simple ? 30 : 33}" fill="url(#orb-${id})"/>
${simple ? '' : `<circle cx="100" cy="102" r="33" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="0.8"/>`}
<g transform="rotate(-24 100 100)">
<path d="M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}" fill="none" stroke="url(#ring-${id})" stroke-width="${sw}" stroke-linecap="round"${g}/>
<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="${simple ? 11 : 7.5}" fill="url(#dot-${id})"${g}/>
</g>`;
}

/**
 * MADAR lettering: geometric monoline capitals with the crossbar-less "Λ" A,
 * drawn as strokes on a 100-unit cap height. Returns outlined SVG and width.
 */
const LETTERS = {
  M: { w: 92, d: 'M0 100 V0 L46 74 L92 0 V100' },
  A: { w: 88, d: 'M0 100 L44 0 L88 100' },
  D: { w: 84, d: 'M0 0 V100 H34 A50 50 0 0 0 34 0 Z' },
  R: { w: 78, d: 'M0 100 V0 H44 A27 27 0 0 1 44 54 H0 M38 54 L78 100' },
};
const GAP = 46;

export function wordmarkPaths({ height = 100, x = 0, y = 0, color = COLORS.sand, stroke } = {}) {
  const s = height / 100;
  const sw = (stroke ?? height * 0.075) / s;
  let pen = 0;
  const parts = [];
  for (const ch of 'MADAR') {
    const L = LETTERS[ch];
    parts.push(`<path transform="translate(${pen} 0)" d="${L.d}"/>`);
    pen += L.w + GAP;
  }
  const width = (pen - GAP) * s;
  return {
    width,
    svg: `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="10">${parts.join('')}</g>`,
  };
}

export const WORDMARK_LETTERS = LETTERS;
export const WORDMARK_GAP = GAP;
