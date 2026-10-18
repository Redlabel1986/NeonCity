import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P4 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase4-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByLabel('Aufstieg durch Regionen').uncheck();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

async function buildAndOpen(page: Page, defId: string): Promise<void> {
  await page.evaluate((id) => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, id, x, y).ok) {
          const before = new Set(Object.keys(session.sim!.state.buildings));
          store.getState().dispatch({ type: 'placeBuilding', defId: id, x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string; id: number }).owner === 'player' && !before.has(String((v as { id: number }).id))) as { id: number };
          (store.getState() as unknown as { openDashboard: (id: number) => void }).openDashboard(b.id);
          return;
        }
    throw new Error('no lot');
  }, defId);
  await page.waitForTimeout(200);
}

test('hotel, taxi and kiosk dashboards work and real estate can be bought', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  await buildAndOpen(page, 'capsule_hotel');
  const hotel = page.getByRole('region', { name: 'Kapselhotel' });
  await expect(hotel).toContainText('Belegung');
  await hotel.getByLabel('Zimmerpreis').fill('50');
  await expect(hotel).toContainText('50 ¢');
  await hotel.getByRole('tab', { name: 'Ausbau' }).click();
  await expect(hotel).toContainText('Zimmerausbau');
  await page.screenshot({ path: 'tests/e2e/output/p4-hotel.png' });

  await buildAndOpen(page, 'taxi_depot');
  const taxi = page.getByRole('region', { name: 'Taxidepot' });
  await expect(taxi).toContainText('Flotte');
  const vehiclesBefore = await taxi.getByRole('button', { name: 'Verkaufen' }).count();
  await taxi.getByRole('button', { name: /Fahrzeug kaufen/ }).click();
  await expect(taxi.getByRole('button', { name: 'Verkaufen' })).toHaveCount(vehiclesBefore + 1);
  await page.screenshot({ path: 'tests/e2e/output/p4-taxi.png' });

  await buildAndOpen(page, 'kiosk');
  const kiosk = page.getByRole('region', { name: 'Nachtkiosk' });
  await expect(kiosk).toContainText('Sortiment');
  await kiosk.getByRole('tab', { name: 'Einkauf' }).click();
  await expect(kiosk).toContainText('Lager');
  await page.screenshot({ path: 'tests/e2e/output/p4-kiosk.png' });

  // Run a day; all three should have activity.
  await page.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(17 * 60 + 5));
  const activity = await page.evaluate(() => {
    const kinds: Record<string, number> = {};
    for (const b of Object.values(window.__neon.session.sim!.state.buildings) as { owner: string; business?: { kind: string; lifetimeGuests?: number; lifetimeRides?: number; lifetimeCustomers?: number } }[]) {
      if (b.owner !== 'player' || !b.business) continue;
      kinds[b.business.kind] = b.business.lifetimeGuests ?? b.business.lifetimeRides ?? b.business.lifetimeCustomers ?? 0;
    }
    return kinds;
  });
  expect(activity.hotel).toBeGreaterThan(0);
  expect(activity.transport).toBeGreaterThan(0);
  expect(activity.retail).toBeGreaterThan(0);

  // Buy a residential building via the inspector.
  await page.evaluate(() => {
    const { session, store } = window.__neon;
    const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string; cityStyle?: string }).owner === 'city' && (v as { cityStyle?: string }).cityStyle === 'old') as { id: number; x: number; y: number };
    (store.getState() as unknown as { selectBuilding: (id: number) => void }).selectBuilding(b.id);
    session.renderer!.focusTile(b.x, b.y, 1.5);
  });
  const inspector = page.getByRole('complementary', { name: 'Auswahl' });
  await inspector.getByRole('button', { name: 'Immobilie kaufen' }).click();
  await inspector.getByRole('button', { name: 'Jetzt kaufen' }).click();
  await expect(inspector).toContainText('Immobilie');
  await expect(inspector).toContainText('Mietniveau');
  await page.keyboard.press('i');
  const estate = page.getByRole('region', { name: 'Immobilien' });
  await expect(estate).toContainText('Miete / Tag');
  await expect(estate).toContainText('Übernahmekandidaten');
  await page.screenshot({ path: 'tests/e2e/output/p4-estate.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
