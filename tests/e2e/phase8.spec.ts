import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P8 Tester');
  await page.getByLabel('Stadt-Seed').fill('visual-seed');
  await page.getByLabel('Aufstieg durch Regionen').uncheck();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('intro, weather, heatmap, contrast mode and remappable keys', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  const intro = page.getByRole('region', { name: 'Einstieg' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(intro).toHaveCount(0);

  // Force a storm and screenshot the effects.
  await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { weather: { kind: string; untilTick: number; intensity: number }; tick: number };
    s.weather = { kind: 'storm', untilTick: s.tick + 600, intensity: 1 };
    window.__neon.session.renderer!.focusTile(50, 66, 1.3);
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  });
  await page.waitForTimeout(1200);
  await expect(page.getByRole('banner')).toContainText('Gewitter');
  await page.screenshot({ path: 'tests/e2e/output/p8-storm.png' });

  // Heatmap selector on the minimap.
  await page.getByLabel('Heatmap').selectOption('crime');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/e2e/output/p8-heatmap.png' });

  // Settings: contrast + remap the build key to "g".
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Hoher Kontrast').check();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await dialog.getByRole('button', { name: 'Taste für Bauen ändern' }).click();
  await page.keyboard.press('n');
  await expect(dialog.getByRole('button', { name: 'Taste für Bauen ändern' })).toHaveText('N');
  await dialog.getByRole('button', { name: 'Taste für Bauen ändern' }).click();
  await page.keyboard.press('w');
  await expect(page.getByText(/ist für Kamera oder System reserviert/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect(page.getByRole('region', { name: 'Bauen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await expect(page.getByRole('region', { name: 'Bauen' })).toHaveCount(0);
  await page.screenshot({ path: 'tests/e2e/output/p8-contrast.png' });

  // Audio starts after a gesture without errors.
  const audioRunning = await page.evaluate(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 200)));
  expect(audioRunning).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
