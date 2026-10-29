/**
 * Demo mode: the application runs entirely in the visitor's browser, with the
 * MADAR engine in a Web Worker and data kept in this browser. It is on for the
 * static GitHub Pages build (no API server exists there) and can be forced
 * locally with NEXT_PUBLIC_DEMO=1.
 */
export const DEMO = process.env.NEXT_PUBLIC_STATIC_SITE === '1' || process.env.NEXT_PUBLIC_DEMO === '1';
