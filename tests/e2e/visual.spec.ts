import { test, expect, type Page } from '@playwright/test';

/** Visual review helper: screenshots at characteristic times and zoom levels. */
async function start(page: Page, seed: string): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Visual');
  await page.getByLabel('Stadt-Seed').fill(seed);
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
}

async function runTo(page: Page, hour: number): Promise<void> {
  await page.evaluate((h) => {
    const sim = window.__neon.session.sim as unknown as { state: { tick: number }; run: (n: number) => void };
    const minuteOfDay = (sim.state.tick + 7 * 60) % 1440;
    let delta = h * 60 - minuteOfDay;
    if (delta <= 0) delta += 1440;
    sim.run(delta);
  }, hour);
  await page.waitForTimeout(300);
}

test('visual review shots', async ({ page }) => {
  await start(page, 'visual-seed');
  await page.evaluate(() => window.__neon.session.renderer!.focusTile(48, 48, 0.45));
  await runTo(page, 13);
  await page.screenshot({ path: 'tests/e2e/output/v-macro-day.png' });
  await page.evaluate(() => window.__neon.session.renderer!.focusTile(50, 66, 1.3));
  await page.screenshot({ path: 'tests/e2e/output/v-meso-day.png' });
  await runTo(page, 22);
  await page.screenshot({ path: 'tests/e2e/output/v-meso-night.png' });
  await page.evaluate(() => window.__neon.session.renderer!.focusTile(48, 48, 0.45));
  await page.screenshot({ path: 'tests/e2e/output/v-macro-night.png' });
  await page.evaluate(() => window.__neon.session.renderer!.focusTile(26, 28, 1.3));
  await runTo(page, 12);
  await page.screenshot({ path: 'tests/e2e/output/v-chrome-day.png' });
  expect(true).toBe(true);
});
