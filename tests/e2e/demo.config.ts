import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the static demo build (GitHub Pages), served under /madar/:
 *   NEXT_PUBLIC_BASE_PATH=/madar pnpm --filter @madar/web build:static
 *   serve apps/web/out at http://localhost:8090/madar/ (e.g. a folder with a `madar` symlink → out)
 *   pnpm exec playwright test -c tests/e2e/demo.config.ts
 */
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
export default defineConfig({
  testDir: '.',
  testMatch: 'demo.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.DEMO_BASE_URL ?? 'http://localhost:8090/madar/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args } }, grep: /@mobile/ },
  ],
});
