import { test, expect, type Page } from '@playwright/test';

interface Api {
  catchUpFrom: (since: number) => Promise<void>;
  updateSettings: (patch: Record<string, unknown>) => void;
}

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Rückkehrer');
  await page.getByLabel('Stadt-Seed').fill('catchup-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(300);
}

test('time away is simulated on return, capped by the setting, with a report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
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
  await page.evaluate(() => (window.__neon.store.getState() as unknown as Api).updateSettings({ offlineProgressDays: 1 }));
  const tickBefore = await page.evaluate(() => window.__neon.session.sim!.state.tick);
  const balanceBefore = await page.evaluate(() => window.__neon.session.sim!.state.ledger.balance);

  // "Away" for two real hours at 1×: that would be ten game days; the setting caps it to one.
  await page.evaluate(() => (window.__neon.store.getState() as unknown as Api).catchUpFrom(Date.now() - 2 * 3600 * 1000));
  const report = page.getByTestId('catchup-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('2 Std.');
  await expect(report).toContainText('begrenzt auf 1 Tage');
  await expect(report).toContainText('Einnahmen');
  const tickAfter = await page.evaluate(() => window.__neon.session.sim!.state.tick);
  expect(tickAfter - tickBefore).toBeGreaterThanOrEqual(1440);
  expect(tickAfter - tickBefore).toBeLessThan(1440 + 120);
  const balanceAfter = await page.evaluate(() => window.__neon.session.sim!.state.ledger.balance);
  expect(balanceAfter).not.toBe(balanceBefore);
  await page.screenshot({ path: 'tests/e2e/output/p16-catchup.png' });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(report).toHaveCount(0);

  // Switched off: nothing happens.
  await page.evaluate(() => (window.__neon.store.getState() as unknown as Api).updateSettings({ offlineProgressDays: 0 }));
  const t2 = await page.evaluate(() => window.__neon.session.sim!.state.tick);
  await page.evaluate(() => (window.__neon.store.getState() as unknown as Api).catchUpFrom(Date.now() - 2 * 3600 * 1000));
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.__neon.session.sim!.state.tick)) - t2).toBeLessThan(60);
  await expect(page.getByTestId('catchup-report')).toHaveCount(0);
  expect(errors).toEqual([]);
});
