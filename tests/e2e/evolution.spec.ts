import { test, expect, type Page } from '@playwright/test';

/**
 * Business evolution in the UI: the dashboard's tree shows the stages, a
 * reachable stage can be started when the money is there, the conversion
 * runs, the building changes stage, name and look.
 */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Entwickler');
  await page.getByLabel('Stadt-Seed').fill('evolve-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(400);
}

test('the evolution tree shows stages, starts a conversion and applies it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  // Build an Asia-Imbiss in the home district, run the construction and open its dashboard.
  const id = await page.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number; districtAt: (x: number, y: number) => number }; player: { homeDistrictId: number }; buildings: Record<string, { id: number; owner: string; defId: string }> };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (state.grid.districtAt(x, y) === state.player.homeDistrictId && checkPlacement(session.sim!.state, 'ramen_bar', x, y).ok) {
          store.getState().dispatch({ type: 'placeBuilding', defId: 'ramen_bar', x, y });
          const b = Object.values(state.buildings).find((c) => c.owner === 'player' && c.defId === 'ramen_bar')! as { id: number; status: string };
          const sim = session.sim as unknown as { run: (n: number) => void };
          for (let i = 0; i < 60 && b.status !== 'operational'; i++) sim.run(60);
          (store.getState() as unknown as { openDashboard: (id: number) => void }).openDashboard(b.id);
          (store.getState() as unknown as { setDashboardTab: (t: string) => void }).setDashboardTab('evolution');
          return b.id;
        }
    return -1;
  });
  expect(id).toBeGreaterThan(0);
  const tree = page.getByTestId('evolution-tree');
  await expect(tree).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Asia-Imbiss, Stufe 1' })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Sternerestaurant, Stufe 5' })).toBeVisible();
  await tree.getByRole('button', { name: 'Ramenbar, Stufe 2', exact: true }).click();
  const details = page.getByTestId('stage-details');
  await expect(details).toContainText('Ramenbar');
  await expect(details).toContainText('Kosten');
  await page.screenshot({ path: 'tests/e2e/output/p17-evolution-tree.png' });
  // Without money the start is blocked with a reason; with money it runs.
  await page.evaluate(() => {
    (window.__neon.session.sim!.state as unknown as { ledger: { balance: number } }).ledger.balance = 1000;
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  });
  await page.waitForTimeout(300);
  await expect(details.getByTestId('stage-unmet')).toContainText('Credits');
  await page.evaluate(() => {
    (window.__neon.session.sim!.state as unknown as { ledger: { balance: number } }).ledger.balance = 500000;
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  });
  await page.waitForTimeout(300);
  await details.getByRole('button', { name: 'Ausbau starten' }).click();
  await expect(page.locator('text=Ausbau zu')).toContainText('Ramenbar', { timeout: 10000 });
  // Let the conversion run out.
  await page.evaluate((bid) => {
    const sim = window.__neon.session.sim as unknown as { run: (n: number) => void; state: { tick: number; buildings: Record<string, { stageUpgrade?: { readyTick: number } }> } };
    const up = sim.state.buildings[String(bid)]!.stageUpgrade;
    if (up) sim.run(up.readyTick - sim.state.tick + 15);
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  }, id);
  await expect.poll(() => page.evaluate((bid) => (window.__neon.session.sim!.state.buildings[String(bid)] as { stageId?: string }).stageId, id), { timeout: 10000 }).toBe('asia.ramen');
  await expect(page.locator('text=Aktuelle Stufe:').locator('..')).toContainText('Ramenbar');
  const label = await page.evaluate((bid) => (window.__neon.session.sim!.state.buildings[String(bid)] as { label: string }).label, id);
  expect(label).toBe('Ramenbar');
  await page.screenshot({ path: 'tests/e2e/output/p17-evolution-done.png' });
  expect(errors).toEqual([]);
});
