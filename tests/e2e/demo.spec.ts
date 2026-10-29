import { expect, test, type Page } from '@playwright/test';

/** Paths are relative to the base URL so the /madar/ base path is exercised. */
const noCredentialFields = async (page: Page) => {
  await expect(page.locator('input[type="password"], input[type="email"], input[autocomplete="username"]')).toHaveCount(0);
};

async function enterDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: 'Enter MADAR' }).first().click();
  await page.getByRole('dialog', { name: 'Welcome to the MADAR demo.' }).getByRole('button', { name: 'Explore demo' }).click();
  await page.waitForURL(/\/app\/?$/);
  await expect(page.getByText('Recent runs')).toBeVisible({ timeout: 60_000 });
}

test('every landing entry point explains demo access first @mobile', async ({ page, isMobile }) => {
  await page.goto('./');
  const entries = isMobile ? ['Explore MADAR', 'Open the Scenario Lab', 'Create an account'] : ['Sign in', 'Enter MADAR', 'Explore MADAR', 'Open the Scenario Lab', 'Create an account'];
  for (const name of entries) {
    const link = page.getByRole('link', { name, exact: true }).first();
    if (name === 'Explore MADAR') {
      // The hero headline and its button fade in as the visitor scrolls the descent.
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.35));
      await page.waitForTimeout(800);
    } else await link.scrollIntoViewIfNeeded();
    await link.click();
    const dialog = page.getByRole('dialog', { name: 'Welcome to the MADAR demo.' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Registration and real account access are not available.');
    await noCredentialFields(page);
    await dialog.getByRole('button', { name: 'Back to home' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/madar\/?(#.*)?$/);
  }
  // The Scenario Lab entry continues to the Scenario Lab.
  const lab = page.getByRole('link', { name: 'Open the Scenario Lab' }).first();
  await lab.scrollIntoViewIfNeeded();
  await lab.click();
  await page.getByRole('button', { name: 'Explore demo' }).click();
  await page.waitForURL(/\/app\/scenarios\/?$/);
  await expect(page.getByRole('heading', { name: 'Scenario Lab' })).toBeVisible({ timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('demo journey: sample study → new variant → run → compare → report → saved', async ({ page }) => {
  await enterDemo(page);
  await expect(page.getByText('Demo · Synthetic data').first()).toBeVisible();
  await expect(page.getByText('Webster signal timing').first()).toBeVisible();

  await page.getByRole('link', { name: 'Scenario Lab' }).first().click();
  await page.getByLabel('New scenario').fill('Harbor closure test');
  await page.getByRole('button', { name: 'Create scenario' }).click();
  await expect(page.getByRole('heading', { name: 'Harbor closure test' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/scenarios\/view\/?\?id=/);

  await page.getByLabel('Close a road').selectOption({ index: 5 });
  await page.getByLabel('Close a road').locator('..').getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Speed').selectOption('0');
  await page.getByRole('button', { name: /save and run/i }).click();
  await expect(page.getByRole('link', { name: 'View results' })).toBeVisible({ timeout: 60_000 });

  // Refresh keeps the scenario (saved in this browser) and the deep link works.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Harbor closure test' })).toBeVisible();
  await page.getByRole('link', { name: 'Compare latest run with baseline' }).click();
  await expect(page.getByRole('heading', { name: /vs Harbor closure test/ })).toBeVisible();
  await expect(page.getByText('Better when')).toBeVisible();
  await page.getByRole('button', { name: 'Save as report' }).click();
  await expect(page).toHaveURL(/\/app\/reports\/view\/?\?id=/);
  await expect(page.getByRole('button', { name: 'Printable version' })).toBeVisible();

  await page.getByRole('link', { name: 'Saved' }).first().click();
  await expect(page.getByText('saved in this browser')).toBeVisible();
  await expect(page.getByText(/vs Baseline/).first()).toBeVisible();
  await noCredentialFields(page);
});

test('movement playback controls and junction timings', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('link', { name: 'Movement' }).first().click();
  const play = page.getByRole('button', { name: 'Play playback' });
  await expect(play).toBeEnabled();
  const time = page.getByLabel('Playback time');
  await play.click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await page.getByRole('button', { name: 'Reset playback to the start' }).click();
  await expect(time).toHaveValue('0');
  await page.getByRole('button', { name: /Signal timing for/ }).first().click();
  await expect(page.getByText(/s green/).first()).toBeVisible();
});

test('direct visit to an app page shows the notice; exit returns home @mobile', async ({ page }) => {
  await page.goto('app/energy/');
  const dialog = page.getByRole('dialog', { name: 'Welcome to the MADAR demo.' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Explore demo' }).click();
  await expect(page.getByRole('heading', { name: 'Buildings & energy' })).toBeVisible();
  await expect(page.getByText(/model estimate/i).first()).toBeVisible();
  await page.getByRole('link', { name: 'Exit demo to the home page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /the city in motion/i })).toBeAttached();
});

test('help page and reset demo', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('link', { name: 'About the demo' }).first().click();
  await expect(page.getByRole('heading', { name: 'What you can try in MADAR' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  await expect(page.getByText('Preparing the demo city')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Recent runs')).toBeVisible({ timeout: 60_000 });
});
