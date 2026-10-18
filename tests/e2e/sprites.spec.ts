import { test, expect, type Page } from '@playwright/test';

/** Pre-rendered building sprites replace the procedural city buildings once loaded; screenshots per region, day and night. */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Sprites');
  await page.getByLabel('Stadt-Seed').fill('sprite-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByLabel('Aufstieg durch Regionen').uncheck();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
}

test('city buildings show pre-rendered sprites in every region, by day and night', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/sprites/') && !r.ok()) failed.push(r.url());
  });
  await start(page);
  const coverage = async (): Promise<number> =>
    page.evaluate(() => {
      const { session } = window.__neon;
      const r = session.renderer as unknown as { spriteNameFor: (id: number) => string | null };
      const city = Object.values(session.sim!.state.buildings).filter((b) => (b as { owner: string }).owner === 'city') as { id: number }[];
      return city.filter((b) => r.spriteNameFor(b.id) !== null).length / city.length;
    });
  await expect.poll(coverage, { timeout: 30000 }).toBeGreaterThan(0.8);
  expect(failed).toEqual([]);
  await page.evaluate(() => window.__neon.store.getState().dispatch({ type: 'setSpeed', speed: 0 }));
  // Four separate maps: switch through them with the tabs; each shows only its own map.
  for (const region of ['greenhaven', 'silverbrook', 'neon_central', 'nova_eclipse']) {
    await page.getByTestId(`map-tab-${region}`).click();
    await expect(page.getByTestId(`map-tab-${region}`)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `tests/e2e/output/p17-map-${region}.png` });
    const zoomOut = await page.evaluate(() => {
      const r = window.__neon.session.renderer as unknown as { focusTile: (x: number, y: number, z: number) => void; mapRect: { x0: number; y0: number; x1: number; y1: number } };
      const m = r.mapRect;
      r.focusTile((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, 0.42);
      return m;
    });
    expect(zoomOut.x1 - zoomOut.x0).toBeGreaterThan(20);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `tests/e2e/output/p17-map-${region}-overview.png` });
  }
  // Night: advance to 22:00 and shoot the city again.
  await page.evaluate(() => {
    const sim = window.__neon.session.sim as unknown as { run: (n: number) => void; state: { tick: number } };
    const minute = (sim.state.tick + 420) % 1440; // ticks start at 07:00
    sim.run((1440 + 22 * 60 - minute) % 1440);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/e2e/output/p17-sprites-nova-night.png' });
  // The inspector names a city building after its sprite.
  const named = await page.evaluate(() => {
    const { session } = window.__neon;
    const r = session.renderer as unknown as { spriteNameFor: (id: number) => string | null };
    const b = Object.values(session.sim!.state.buildings).find((x) => (x as { owner: string }).owner === 'city' && r.spriteNameFor((x as { id: number }).id)) as { id: number };
    (window.__neon.store.getState() as unknown as { selectBuilding: (id: number) => void }).selectBuilding(b.id);
    return r.spriteNameFor(b.id);
  });
  await expect(page.getByRole('complementary', { name: 'Auswahl' }).getByRole('heading', { level: 2 })).toHaveText(named!);
  expect(errors).toEqual([]);
});
