import { test, expect, type Page } from '@playwright/test';
import { cityInterior } from '../../src/render/interior/cityCatalog';

/** City buildings can be entered: catalogued rooms per archetype, clickable zones with simulation data. */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Innen');
  await page.getByLabel('Stadt-Seed').fill('interior-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByLabel('Aufstieg durch Regionen').uncheck();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
}

test('city buildings open their catalogued interiors with clickable zones', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.evaluate(() => window.__neon.store.getState().dispatch({ type: 'setSpeed', speed: 0 }));
  // 11:00: people are at work, so the rooms show staff.
  await page.evaluate(() => {
    const sim = window.__neon.session.sim as unknown as { run: (n: number) => void; state: { tick: number } };
    sim.run((1440 + 11 * 60 - ((sim.state.tick + 420) % 1440)) % 1440); // ticks start at 07:00
  });
  // Wait for the sprite catalogue, then list city buildings with their sprite ids.
  const lots = await page.waitForFunction(() => {
    const { session } = window.__neon;
    const r = session.renderer as unknown as { spriteIdFor: (s: unknown, b: unknown) => string | null };
    const state = session.sim!.state as unknown as { buildings: Record<string, { id: number; owner: string; defId: string }>; competitors: Record<string, unknown> };
    const out = Object.values(state.buildings)
      .filter((b) => b.owner === 'city' && b.defId === 'city')
      .map((b) => ({ id: b.id, sprite: r.spriteIdFor(state, b), competitor: !!state.competitors[b.id] }))
      .filter((x) => x.sprite);
    return out.length > 50 ? out : null;
  }, undefined, { timeout: 30000 });
  const all = (await lots.jsonValue()) as { id: number; sprite: string; competitor: boolean }[];
  const wanted = ['house', 'restaurant', 'clinic', 'garage', 'office', 'logistics', 'hotel', 'retail', 'apartment', 'police'];
  const picks: { id: number; sprite: string; archetype: string }[] = [];
  for (const archetype of wanted) {
    const hit = all.find((x) => cityInterior(x.sprite)?.archetype === archetype && !cityInterior(x.sprite)!.technical);
    if (hit) picks.push({ ...hit, archetype });
  }
  expect(picks.length).toBeGreaterThanOrEqual(5);

  for (const [i, pick] of picks.entries()) {
    await page.evaluate((id) => (window.__neon.store.getState() as unknown as { selectBuilding: (id: number) => void }).selectBuilding(id), pick.id);
    await page.getByTestId('enter-city-interior').click();
    await expect(page.getByTestId('interior-view')).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/e2e/output/p20-interior-${pick.archetype}.png` });
    if (i < 3) {
      // Click the centre of the first zone: the detail card shows its name and simulation values.
      const point = await page.evaluate(() => {
        const r = window.__neon.session.renderer as unknown as {
          app: { canvas: HTMLCanvasElement };
          interior: { screenPointOf: (x: number, y: number) => { x: number; y: number }; scene: { zones: { label: string; x: number; y: number; w: number; h: number; interactive?: boolean }[] } };
        };
        const zone = r.interior.scene.zones.find((z) => z.interactive !== false)!;
        const p = r.interior.screenPointOf(zone.x + zone.w / 2, zone.y + zone.h / 2);
        const c = r.app.canvas.getBoundingClientRect();
        return { x: c.left + p.x, y: c.top + p.y, label: zone.label };
      });
      await page.mouse.click(point.x, point.y);
      await expect(page.getByTestId('interior-zone-card')).toBeVisible();
      await expect(page.getByTestId('interior-zone-card')).toContainText(point.label);
      await page.screenshot({ path: `tests/e2e/output/p20-interior-${pick.archetype}-zone.png` });
    }
    await page.getByRole('button', { name: 'Innenansicht verlassen' }).click();
    await expect(page.getByTestId('interior-view')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
