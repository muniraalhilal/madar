import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'madar-demo-2026';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('planner@madar.dev');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app');
}

async function runScenario(page: Page) {
  await page.getByLabel('Speed').selectOption('0');
  await page.getByRole('button', { name: /run simulation|save and run/i }).click();
  await expect(page.getByRole('link', { name: 'View results' })).toBeVisible({ timeout: 120_000 });
}

test('landing page tells the story and leads into the app @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /the city in motion/i })).toBeAttached();
  await expect(page.locator('#connected')).toBeAttached();
  await page.locator('#connected').scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: 'Harmony' }).click();
  await expect(page.getByRole('tab', { name: 'Harmony' })).toHaveAttribute('aria-selected', 'true');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('unauthenticated visitors are sent to sign in', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/app/scenarios');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('main journey: login → explorer → scenario → run → compare → report', async ({ page }) => {
  await login(page);

  // City Explorer renders the 3D city
  await page.getByRole('link', { name: 'City Explorer' }).first().click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });

  // Baseline needs a result to compare against
  await page.goto('/app/scenarios');
  await page.getByRole('link', { name: /Baseline/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await runScenario(page);

  // Create a variant from the baseline and retime its signals with Webster
  await page.goto('/app/scenarios');
  const name = `E2E retime ${Date.now()}`;
  await page.getByLabel('New scenario').fill(name);
  await page.getByRole('button', { name: 'Create scenario' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.getByRole('button', { name: 'Propose with Webster' }).click();
  await page.getByRole('button', { name: 'Apply all' }).click();
  await expect(page.getByText(/Signal timings \(\d+\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Save to library' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await runScenario(page);

  // Compare with the baseline and save a report
  await page.getByRole('link', { name: 'Compare latest run with baseline' }).click();
  await expect(page.getByRole('table').first()).toContainText('Average travel time');
  await page.getByRole('button', { name: 'Save as report' }).click();
  await expect(page.getByRole('heading', { name: 'Key findings' })).toBeVisible();

  // The saved scenario shows up in the library
  await page.goto('/app/saved');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(`${name} vs`, { exact: false })).toBeVisible();
});
