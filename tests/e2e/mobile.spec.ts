import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.screenshot({ path: 'tests/e2e/output/m-menu.png', fullPage: false });
  await page.getByLabel('Dein Name').fill('Mobil');
  await page.getByLabel('Stadt-Seed').fill('mobile-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(400);
}

/** Screen position of a tile centre after focusing it (the canvas centre). */
async function focusAndCentre(page: Page, x: number, y: number, zoom: number): Promise<{ cx: number; cy: number }> {
  await page.evaluate(({ x, y, zoom }) => window.__neon.session.renderer!.focusTile(x, y, zoom), { x, y, zoom });
  await page.waitForTimeout(150);
  const box = (await page.locator('canvas').first().boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test('phone layout: bottom navigation, sheets, two-step touch placement, pinch zoom', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await expect(page.getByTestId('mobile-layout')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(nav.getByRole('button', { name: 'Bauen' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText('¢');
  await page.screenshot({ path: 'tests/e2e/output/m-map.png' });

  // Build sheet → start placement → sheet closes, placement bar appears.
  await nav.getByRole('button', { name: 'Bauen' }).tap();
  const sheet = page.getByTestId('mobile-sheet');
  await expect(sheet).toContainText('Asia-Imbiss');
  await page.screenshot({ path: 'tests/e2e/output/m-build.png' });
  await sheet.locator('li', { hasText: 'Asia-Imbiss' }).getByRole('button', { name: 'Platzieren' }).tap();
  await expect(sheet).toHaveCount(0);
  const bar = page.getByTestId('placement-bar');
  await expect(bar).toContainText('Tippe auf ein freies Grundstück');
  await expect(bar.getByRole('button', { name: 'Hier bauen' })).toBeDisabled();

  // First tap previews the ghost, "Hier bauen" confirms.
  const spot = await page.evaluate(() => {
    const { session, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 8; y < state.grid.height - 8; y++) for (let x = 8; x < state.grid.width - 8; x++) if (checkPlacement(session.sim!.state, 'ramen_bar', x, y).ok) return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  const { cx, cy } = await focusAndCentre(page, spot!.x, spot!.y, 1.6);
  await page.touchscreen.tap(cx, cy);
  await expect(bar.getByRole('button', { name: 'Hier bauen' })).toBeEnabled();
  await expect(bar).toContainText('Eingang');
  await page.screenshot({ path: 'tests/e2e/output/m-placement.png' });
  await bar.getByRole('button', { name: 'Hier bauen' }).tap();
  await expect.poll(() => page.evaluate(() => Object.values(window.__neon.session.sim!.state.buildings).filter((b) => (b as { owner: string }).owner === 'player').length)).toBe(1);
  await expect(page.getByTestId('placement-bar')).toHaveCount(0);
  // The placed building is selected: inspector sheet with the bar.
  await expect(page.getByRole('region', { name: 'Auswahl' })).toContainText('Asia-Imbiss');
  await page.screenshot({ path: 'tests/e2e/output/m-inspector.png' });
  await page.getByRole('region', { name: 'Auswahl' }).getByRole('button', { name: 'Schließen' }).tap();
  await expect(page.getByRole('region', { name: 'Auswahl' })).toHaveCount(0);

  // Tap on a city building opens the inspector; tap on the map pans instead of selecting when dragged.
  const city = await page.evaluate(() => {
    const b = Object.values(window.__neon.session.sim!.state.buildings).find((v) => {
      const c = v as { owner: string; w: number; x: number; y: number };
      return c.owner === 'city' && c.w === 1 && c.x > 10 && c.y > 10 && c.x < 80 && c.y < 80;
    }) as { x: number; y: number };
    return b;
  });
  const c2 = await focusAndCentre(page, city.x, city.y, 2);
  await page.touchscreen.tap(c2.cx, c2.cy);
  await expect(page.getByRole('region', { name: 'Auswahl' })).toContainText('Stadtgebäude');
  await page.getByRole('region', { name: 'Auswahl' }).getByRole('button', { name: 'Schließen' }).tap();

  // Pinch zoom: two synthetic touch pointers moving apart double the zoom.
  await focusAndCentre(page, city.x, city.y, 1);
  const zoomBefore = await page.evaluate(() => window.__neon.session.renderer!.zoom);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const mid = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const ev = (type: string, id: number, x: number, y: number): void => {
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
    };
    ev('pointerdown', 1, mid.x - 40, mid.y);
    ev('pointerdown', 2, mid.x + 40, mid.y);
    ev('pointermove', 1, mid.x - 80, mid.y);
    ev('pointermove', 2, mid.x + 80, mid.y);
    ev('pointerup', 1, mid.x - 80, mid.y);
    ev('pointerup', 2, mid.x + 80, mid.y);
  });
  const zoomAfter = await page.evaluate(() => window.__neon.session.renderer!.zoom);
  expect(zoomAfter).toBeGreaterThan(zoomBefore * 1.5);
  // The pinch must not have selected anything.
  await expect(page.getByRole('region', { name: 'Auswahl' })).toHaveCount(0);

  // "Mehr" sheet reaches the remaining panels and the settings dialog.
  await nav.getByRole('button', { name: 'Mehr' }).tap();
  await expect(page.getByTestId('mobile-sheet')).toContainText('Unterwelt');
  await page.screenshot({ path: 'tests/e2e/output/m-more.png' });
  await page.getByTestId('mobile-sheet').getByRole('button', { name: 'Einstellungen' }).tap();
  await expect(page.getByRole('dialog')).toContainText('Darstellung');
  await page.screenshot({ path: 'tests/e2e/output/m-settings.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).tap();
  // The More sheet stays open behind the dialog; reopen it only if it was closed.
  if (!(await page.getByTestId('mobile-sheet').isVisible())) await nav.getByRole('button', { name: 'Mehr' }).tap();
  await page.getByTestId('mobile-sheet').getByRole('button', { name: 'Casino' }).tap();
  await expect(page.getByTestId('mobile-sheet')).toContainText('Royal Nova Casino');
  await page.screenshot({ path: 'tests/e2e/output/m-casino.png' });
  expect(errors).toEqual([]);
});
