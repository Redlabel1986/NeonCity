import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, difficulty = 'Standard'): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('UI Tester');
  await page.getByLabel('Stadt-Seed').fill('ui-seed');
  await page.getByRole('button', { name: difficulty, exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('main menu renders with backgrounds and difficulties', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Neon\s*Dynasty/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Straßenkind/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hardcore', exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/output/ui-menu.png' });
});

test('panels, dialogs and selection of city buildings work', async ({ page }) => {
  await start(page);
  await page.keyboard.press('c');
  await expect(page.getByRole('region', { name: 'Stadt' })).toContainText('Corporate Heights');
  await page.getByRole('region', { name: 'Stadt' }).getByRole('button', { name: 'Anzeigen' }).nth(2).click();
  await page.keyboard.press('f');
  await expect(page.getByRole('region', { name: 'Finanzen' })).toContainText('Kontostand');
  await page.keyboard.press('t');
  await expect(page.getByRole('region', { name: 'Statistik' })).toContainText('Kontostand je Tag');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Statistik' })).toHaveCount(0);

  // Select a city building by clicking on its tile.
  await page.evaluate(() => {
    const sim = window.__neon.session.sim!;
    const b = Object.values(sim.state.buildings).find((x) => (x as { owner: string; w: number }).owner === 'city' && (x as { w: number }).w === 1) as { x: number; y: number };
    window.__neon.session.renderer!.focusTile(b.x, b.y, 2);
  });
  await page.waitForTimeout(200);
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('complementary', { name: 'Auswahl' })).toContainText('Stadtgebäude');
  await expect(page.getByRole('complementary', { name: 'Auswahl' })).toContainText('Immobilie kaufen');
  await page.screenshot({ path: 'tests/e2e/output/ui-city-building.png' });

  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('dialog')).toContainText('Oberflächengröße');
  await page.getByLabel('Neon-, Licht- und Wettereffekte').uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  await expect(page.getByRole('dialog')).toContainText('Steuerung');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('sandbox: build, rename, demolish and return to menu with autosave', async ({ page }) => {
  await start(page, 'Sandbox');
  const placed = await page.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'food_stand', x, y).ok) {
          const ok = store.getState().dispatch({ type: 'placeBuilding', defId: 'food_stand', x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string }).owner === 'player') as { id: number; status: string };
          (store.getState() as unknown as { selectBuilding: (id: number) => void }).selectBuilding(b.id);
          return { ok, status: b.status, id: b.id };
        }
    return null;
  });
  expect(placed?.ok).toBe(true);
  expect(placed?.status).toBe('operational');
  const inspector = page.getByRole('complementary', { name: 'Auswahl' });
  await test.step('rename', async () => {
    await inspector.getByRole('button', { name: 'Umbenennen' }).click({ timeout: 5000 });
    await page.getByLabel('Neuer Name').fill('Nudel-Nomade');
    await page.getByRole('button', { name: 'OK' }).click({ timeout: 5000 });
    await expect(inspector).toContainText('Nudel-Nomade');
  });
  await test.step('demolish', async () => {
    await inspector.getByRole('button', { name: 'Abreißen' }).click({ timeout: 5000 });
    await inspector.getByRole('button', { name: 'Wirklich abreißen' }).click({ timeout: 5000 });
  });
  await expect
    .poll(async () => page.evaluate(() => Object.values(window.__neon.session.sim!.state.buildings).filter((b) => (b as { owner: string }).owner === 'player').length))
    .toBe(0);
  await expect(page.getByText(/abgerissen/)).toBeVisible();

  await page.getByRole('button', { name: 'Hauptmenü' }).click();
  await expect(page.getByRole('button', { name: 'Stadt betreten' })).toBeVisible();
  await page.getByRole('button', { name: 'Spielstand laden' }).click();
  await expect(page.getByRole('dialog')).toContainText('Autosave');
  await page.getByRole('dialog').getByRole('button', { name: 'Laden' }).first().click();
  await expect(page.getByRole('banner')).toContainText('UI Tester');
});
