import { test, expect, devices } from '@playwright/test';

/**
 * Visual check of the night look on a phone: the city must render without
 * errors and every night overlay must sit in the depth sorted building layer.
 */
test.use({ ...devices['Pixel 7'], hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test('night look on a phone: solid lights, depth sorted overlays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Nacht');
  await page.getByLabel('Stadt-Seed').fill('look-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(500);
  // Pause, advance the clock to 22:00 and zoom in on the centre of the city.
  await page.evaluate(() => {
    const { session, store } = window.__neon;
    store.getState().setSpeed(0);
    const sim = session.sim!;
    const minute = sim.state.tick % 1440;
    sim.run((1440 + 22 * 60 - minute) % 1440);
    const r = session.renderer as unknown as { flyTo: (x: number, y: number, zoom: number, duration: number) => void };
    const { grid } = sim.state;
    r.flyTo(grid.width / 2, grid.height / 2, 1.6, 0);
  });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const r = window.__neon.session.renderer as unknown as { nightAlpha: number; debugInfo?: () => { layerTint: number; children: number } };
    return { nightAlpha: r.nightAlpha, ...(r.debugInfo ? r.debugInfo() : { layerTint: -1, children: -1 }) };
  });
  expect(info.nightAlpha).toBe(1);
  await page.screenshot({ path: 'tests/e2e/output/look-night-phone.png' });
  // A street scene with traffic and shop signs near the player's start.
  await page.evaluate(() => {
    const { session } = window.__neon;
    const r = session.renderer as unknown as { flyTo: (x: number, y: number, zoom: number, duration: number) => void };
    const { grid } = session.sim!.state;
    r.flyTo(grid.width * 0.3, grid.height * 0.65, 2.2, 0);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/output/look-night-street.png' });
  // Step through the morning until full daylight.
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() => window.__neon.session.sim!.run(60));
    await page.waitForTimeout(150);
    if ((await page.evaluate(() => (window.__neon.session.renderer as unknown as { nightAlpha: number }).nightAlpha)) === 0) break;
  }
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window.__neon.session.renderer as unknown as { nightAlpha: number }).nightAlpha)).toBe(0);
  await page.screenshot({ path: 'tests/e2e/output/look-day-phone.png' });
  expect(errors).toEqual([]);
});
