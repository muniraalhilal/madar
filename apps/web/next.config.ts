import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

// STATIC_EXPORT=1 builds only the landing page as static files (GitHub Pages).
const staticExport = process.env.STATIC_EXPORT === '1';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const config: NextConfig = {
  reactStrictMode: true,
  ...(staticExport ? { output: 'export' as const, distDir: 'out', basePath, trailingSlash: true, images: { unoptimized: true } } : {}),
  transpilePackages: ['@madar/brand', '@madar/shared', '@madar/sim-engine'],
  poweredByHeader: false,
  // REST calls are proxied same-origin so auth cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};
if (staticExport) {
  // Static hosting has no server: no proxy, and headers are set by the host.
  delete config.rewrites;
  delete config.headers;
}
export default config;
