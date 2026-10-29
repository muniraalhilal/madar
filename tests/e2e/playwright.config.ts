import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a live stack (web :3000, API :4000, worker,
 * Postgres, Redis) seeded with `pnpm db:seed`. See README → Testing.
 */
export default defineConfig({
  testDir: '.',
  testIgnore: 'demo.spec.ts', // the static demo has its own config (demo.config.ts)
  timeout: 180_000,
  expect: { timeout: 60_000 }, // generous for first-hit compilation in dev mode
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }, grep: /@mobile/ },
  ],
});
