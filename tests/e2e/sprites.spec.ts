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
  const shots: [string, string][] = [
    ['greenhaven', 'p17-sprites-greenhaven'],
    ['silverbrook', 'p17-sprites-silverbrook'],
    ['neon_market', 'p17-sprites-neon'],
    ['corporate_heights', 'p17-sprites-nova'],
  ];
  for (const [archetype, file] of shots) {
    await page.evaluate((a) => {
      const s = window.__neon.session.sim!.state as unknown as { districts: { archetype: string; cx: number; cy: number }[] };
      const d = s.districts.find((x) => x.archetype === a)!;
      window.__neon.session.renderer!.focusTile(d.cx, d.cy, 1.4);
    }, archetype);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `tests/e2e/output/${file}.png` });
  }
  // Night: advance to 22:00 and shoot the city again.
  await page.evaluate(() => {
    const sim = window.__neon.session.sim as unknown as { run: (n: number) => void; state: { tick: number } };
    const minute = sim.state.tick % 1440;
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
