import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P5 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase5-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('underworld: found an organisation, recruit, run an operation; security firm patrols', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  await page.keyboard.press('x');
  const panel = page.getByRole('region', { name: 'Unterwelt' });
  await expect(panel).toContainText('Familien der Stadt');
  await panel.getByLabel('Name der Organisation').fill('Neon Syndikat');
  await panel.getByRole('button', { name: 'Gründen' }).click();
  await expect(panel).toContainText('Schwarzgeld');
  await page.screenshot({ path: 'tests/e2e/output/p5-underworld.png' });

  await panel.getByRole('tab', { name: /Leute/ }).click();
  const before = await panel.getByRole('button', { name: 'Anwerben' }).count();
  expect(before).toBeGreaterThan(0);
  await panel.getByRole('button', { name: 'Anwerben' }).first().click();
  await expect(panel.getByRole('button', { name: 'Anwerben' })).toHaveCount(before - 1);
  await panel.getByRole('button', { name: 'Anwerben' }).first().click();

  await panel.getByRole('tab', { name: /Operationen/ }).click();
  await expect(panel).toContainText('Hehlerei');
  // Fencing needs one member of any role.
  const fencing = panel.locator('li', { hasText: 'Hehlerei' }).getByRole('button', { name: 'Starten' });
  await fencing.click();
  await expect(panel).toContainText('Laufend');
  await page.screenshot({ path: 'tests/e2e/output/p5-operations.png' });

  await panel.getByRole('tab', { name: 'Territorium' }).click();
  await expect(panel).toContainText('Deine Kontrolle');
  await panel.getByRole('tab', { name: 'Rivalen' }).click();
  await expect(panel).toContainText('Tribut zahlen');

  // Security firm
  await page.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'security_hq', x, y).ok) {
          const before = new Set(Object.keys(session.sim!.state.buildings));
          store.getState().dispatch({ type: 'placeBuilding', defId: 'security_hq', x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string; id: number }).owner === 'player' && !before.has(String((v as { id: number }).id))) as { id: number };
          (store.getState() as unknown as { openDashboard: (id: number) => void }).openDashboard(b.id);
          return;
        }
    throw new Error('no lot');
  });
  const hq = page.getByRole('region', { name: 'Sicherheitszentrale' });
  await expect(hq).toContainText('Streifen je Bezirk');
  await hq.getByLabel(/Wachleute in Corporate Heights/).fill('2');
  await expect(hq).toContainText('2 / 2');
  await page.screenshot({ path: 'tests/e2e/output/p5-security.png' });

  // Run a day: contracts should pay and the top bar shows the wanted state.
  await page.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(17 * 60 + 5));
  await expect(page.getByRole('banner')).toContainText('Fahndung');
  const stats = await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { underworld: { org: { lifetimeDirty: number } | null; heat: number }; buildings: Record<string, { business?: { kind: string; lifetimeRevenue?: number } }> };
    const hq = Object.values(s.buildings).find((b) => b.business?.kind === 'security')!;
    return { heat: s.underworld.heat, hqRevenue: hq.business!.lifetimeRevenue };
  });
  expect(stats.hqRevenue).toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
