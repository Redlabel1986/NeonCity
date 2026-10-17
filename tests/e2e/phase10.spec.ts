import { test, expect, type Page } from '@playwright/test';

interface PlacementApi {
  setHover: (tile: { x: number; y: number }) => void;
  handleTileClick: (x: number, y: number, button: number) => void;
  placementFacing: number | null;
}
type CheckWithFacing = (state: unknown, defId: string, x: number, y: number, facing?: number) => { ok: boolean; facing: number };

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P10 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase10-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('rotate a building during placement so the entrance faces the street', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  await page.keyboard.press('b');
  const build = page.getByRole('region', { name: 'Bauen' });
  await build.locator('li', { hasText: 'Ramenbar' }).getByRole('button', { name: 'Platzieren' }).click();

  // Find a lot where exactly one of the two back edges has no road, so rotating there must fail.
  const spot = await page.evaluate(() => {
    const { session, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number; edgeTouchesRoad: (x: number, y: number, w: number, h: number, f: number) => boolean } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++) {
        const auto = (checkPlacement as CheckWithFacing)(session.sim!.state, 'ramen_bar', x, y);
        if (!auto.ok) continue;
        const off = [0, 1, 2, 3].find((f) => !state.grid.edgeTouchesRoad(x, y, 1, 1, f));
        if (off === undefined) continue;
        return { x, y, auto: auto.facing, off };
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const { x, y, auto, off } = spot!;

  await page.evaluate(({ x, y }) => (window.__neon.store.getState() as unknown as PlacementApi).setHover({ x, y }), { x, y });
  await expect(build).toContainText('Eingang:');
  await expect(build).toContainText('automatisch zur Straße');
  await page.screenshot({ path: 'tests/e2e/output/p10-placement.png' });

  // Rotate until the entrance points away from the road: the check must refuse.
  const steps = ((off - auto) % 4 + 4) % 4;
  for (let i = 0; i < steps; i++) await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window.__neon.store.getState() as unknown as PlacementApi).placementFacing)).toBe(off);
  await expect(build).toContainText('Der Eingang muss zur Straße zeigen');
  await expect(build).not.toContainText('automatisch zur Straße');

  // Rotate back with Q and place; the building keeps the chosen facing.
  for (let i = 0; i < steps; i++) await page.keyboard.press('q');
  await expect.poll(() => page.evaluate(() => (window.__neon.store.getState() as unknown as PlacementApi).placementFacing)).toBe(auto);
  await build.getByRole('button', { name: 'Gebäude nach rechts drehen' }).click();
  const chosen = await page.evaluate(() => (window.__neon.store.getState() as unknown as PlacementApi).placementFacing as number);
  const valid = await page.evaluate(({ x, y, f }) => (window.__neon.checkPlacement as CheckWithFacing)(window.__neon.session.sim!.state, 'ramen_bar', x, y, f).ok, { x, y, f: chosen });
  if (!valid) await build.getByRole('button', { name: 'Gebäude nach links drehen' }).click();
  const finalFacing = await page.evaluate(() => (window.__neon.store.getState() as unknown as PlacementApi).placementFacing as number);
  await page.evaluate(({ x, y }) => (window.__neon.store.getState() as unknown as PlacementApi).handleTileClick(x, y, 0), { x, y });
  await expect.poll(() =>
    page.evaluate(() => {
      const b = Object.values(window.__neon.session.sim!.state.buildings).find((v) => (v as { owner: string }).owner === 'player') as { facing: number } | undefined;
      return b?.facing ?? -1;
    }),
  ).toBe(finalFacing);
  await expect(page.getByRole('region', { name: 'Bauen' })).not.toContainText('Platzierung aktiv');
  await page.screenshot({ path: 'tests/e2e/output/p10-placed.png' });
  expect(errors).toEqual([]);
});
