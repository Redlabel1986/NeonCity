import { test, expect, type Page } from '@playwright/test';

interface Api {
  openDashboard: (id: number) => void;
  interiorBuildingId: number | null;
  dashboardTab: string;
  leaveInterior: () => void;
}

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P11 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase11-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

/** Places a building via the store and returns its id. */
async function place(page: Page, defId: string): Promise<number> {
  return page.evaluate((defId) => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, defId, x, y).ok) {
          const before = new Set(Object.keys(session.sim!.state.buildings));
          store.getState().dispatch({ type: 'placeBuilding', defId, x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string }).owner === 'player' && !before.has(String((v as { id: number }).id))) as { id: number };
          return b.id;
        }
    throw new Error('no lot');
  }, defId);
}

test('managing a business flies into the building and shows its interior', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const barId = await place(page, 'ramen_bar');
  await page.evaluate(() => {
    const sim = window.__neon.session.sim as unknown as { run: (n: number) => void };
    sim.run(6 * 60); // 13:00, the bar is open and serving
  });
  await page.evaluate((id) => (window.__neon.store.getState() as unknown as Api).openDashboard(id), barId);
  const interior = page.getByTestId('interior-view');
  await expect(interior).toBeVisible();
  await expect(page.getByRole('application', { name: /Innenansicht: Ramenbar/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__neon.session.renderer!.zoom)).toBeGreaterThan(2.4);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tests/e2e/output/p11-ramen-interior.png' });

  // Clicking a zone switches the dashboard tab: find the kitchen zone centre through the renderer geometry.
  const dashboard = page.getByRole('region', { name: 'Ramenbar' });
  await expect(dashboard.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => (window.__neon.store.getState() as unknown as { setDashboardTab: (t: string) => void }).setDashboardTab('supply'));
  await expect(dashboard.getByRole('tab', { name: 'Einkauf' })).toHaveAttribute('aria-selected', 'true');

  // Leaving returns to the city and keeps the dashboard closed.
  await page.getByRole('button', { name: 'Innenansicht verlassen' }).click();
  await expect(interior).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window.__neon.store.getState() as unknown as Api).interiorBuildingId)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__neon.session.renderer!.zoom)).toBeLessThan(1.7);

  // Other kinds: hotel, taxi depot, kiosk, security, lab, factory each get an interior.
  for (const [defId, label, shot] of [
    ['capsule_hotel', 'Kapselhotel', 'p11-hotel-interior.png'],
    ['taxi_depot', 'Taxidepot', 'p11-taxi-interior.png'],
    ['kiosk', 'Nachtkiosk', 'p11-kiosk-interior.png'],
    ['security_hq', 'Sicherheitszentrale', 'p11-security-interior.png'],
    ['research_lab', 'Forschungslabor', 'p11-lab-interior.png'],
    ['food_factory', 'Lebensmittelfabrik', 'p11-factory-interior.png'],
  ] as const) {
    const id = await place(page, defId);
    await page.evaluate((id) => (window.__neon.store.getState() as unknown as Api).openDashboard(id), id);
    await expect(page.getByRole('application', { name: new RegExp(`Innenansicht: ${label}`) })).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/e2e/output/${shot}` });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('interior-view')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
