import { test, expect, type Page } from '@playwright/test';

async function startWithBar(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Dash Tester');
  await page.getByLabel('Stadt-Seed').fill('dash-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'ramen_bar', x, y).ok) {
          store.getState().dispatch({ type: 'placeBuilding', defId: 'ramen_bar', x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string }).owner === 'player') as { id: number };
          (store.getState() as unknown as { openDashboard: (id: number) => void }).openDashboard(b.id);
          return;
        }
  });
  await page.waitForTimeout(300);
}

test('dashboard: order supplies, hire staff, start an upgrade, adjust menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startWithBar(page);
  const panel = page.getByRole('region', { name: 'Ramenbar' });
  await expect(panel).toContainText('Kapazität');
  await page.screenshot({ path: 'tests/e2e/output/d-overview.png' });

  // Supply: order 40 noodles from the market runner.
  await panel.getByRole('tab', { name: 'Einkauf' }).click();
  await expect(panel).toContainText('Lager');
  await panel.getByRole('button', { name: /Neon Market Kurier/ }).click();
  await panel.getByLabel('Menge Nudeln').fill('40');
  await panel.getByLabel('Menge Brühe').fill('30');
  await expect(panel).toContainText('Gesamt');
  await panel.getByRole('button', { name: 'Bestellen', exact: true }).click();
  await expect(panel).toContainText('Offene Lieferungen');
  await page.screenshot({ path: 'tests/e2e/output/d-supply.png' });

  // Staff: hire the first candidate.
  await panel.getByRole('tab', { name: 'Personal' }).click();
  const before = await panel.getByRole('button', { name: 'Einstellen' }).count();
  expect(before).toBeGreaterThan(0);
  await panel.getByRole('button', { name: 'Einstellen' }).first().click();
  await expect(panel.getByRole('button', { name: 'Einstellen' })).toHaveCount(before - 1);
  await page.screenshot({ path: 'tests/e2e/output/d-staff.png' });

  // Upgrades: start seating upgrade (instant in sandbox).
  await panel.getByRole('tab', { name: 'Ausbau' }).click();
  await panel.getByRole('button', { name: 'Ausbauen' }).first().click();
  await expect(panel).toContainText('Stufe 1 / 3');

  // Menu: disable a dish and change a price.
  await panel.getByRole('tab', { name: 'Speisekarte' }).click();
  const boxes = panel.getByRole('checkbox');
  await boxes.nth(1).uncheck();
  await expect(boxes.nth(1)).not.toBeChecked();
  await panel.getByLabel('Preis Shoyu-Ramen').fill('30');
  await expect(panel).toContainText('30 ¢');
  await page.screenshot({ path: 'tests/e2e/output/d-menu.png' });

  // Run a day and check the settlement appears.
  await page.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(17 * 60 + 5));
  await panel.getByRole('tab', { name: 'Übersicht' }).click();
  await expect(panel).toContainText('Letzte Tagesabrechnung');
  await expect(panel).toContainText('Löhne');

  // Staff panel lists employees across businesses.
  await page.keyboard.press('p');
  await expect(page.getByRole('region', { name: 'Personal' })).toContainText('Lohnkosten');
  expect(errors, errors.join('\n')).toEqual([]);
});
