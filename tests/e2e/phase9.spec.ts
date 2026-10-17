import { test, expect } from '@playwright/test';

test('sell the company and start a new career from the finance panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P9 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase9-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'food_stand', x, y).ok) {
          store.getState().dispatch({ type: 'placeBuilding', defId: 'food_stand', x, y });
          return;
        }
  });
  await page.keyboard.press('f');
  const finance = page.getByRole('region', { name: 'Finanzen' });
  await expect(finance).toContainText('Weg zum Megakonzern');
  await finance.getByRole('button', { name: 'Unternehmensgruppe verkaufen' }).click();
  await finance.getByRole('button', { name: 'Wirklich alles verkaufen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neue Karriere' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Hacker/ }).click();
  await dialog.getByLabel('Name').fill('Neo');
  await dialog.getByRole('button', { name: 'Karriere starten' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('banner')).toContainText('Neo');
  await expect(finance).toContainText('Nr. 2');
  await page.screenshot({ path: 'tests/e2e/output/p9-career.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
