import { test, expect, type Page } from '@playwright/test';

/**
 * Player levels and regions: a new game starts in Greenhaven at level 1, the
 * other regions are locked on the map and in the world map panel; XP promotes,
 * the level-up dialog opens the next region and the camera can fly there.
 */
async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Aufsteiger');
  await page.getByLabel('Stadt-Seed').fill('level-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await expect(page.getByLabel('Aufstieg durch Regionen')).toBeChecked();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(400);
}

test('starts in Greenhaven, locks the other regions, levels up through XP and opens Silverbrook', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await expect(page.getByTestId('level-stat')).toContainText('1 · Greenhaven');
  const home = await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { districts: { id: number; archetype: string; cx: number; cy: number }[]; player: { homeDistrictId: number } };
    return s.districts[s.player.homeDistrictId]!.archetype;
  });
  expect(home).toBe('greenhaven');
  await page.screenshot({ path: 'tests/e2e/output/p17-greenhaven.png' });

  // Placement outside Greenhaven is refused with the lock reason.
  const locked = await page.evaluate(() => {
    const { session, checkPlacement } = window.__neon;
    const s = session.sim!.state as unknown as { districts: { id: number; archetype: string; cx: number; cy: number }[] };
    const nova = s.districts.find((d) => d.archetype === 'corporate_heights')!;
    return checkPlacement(session.sim!.state, 'food_stand', nova.cx, nova.cy).error;
  });
  expect(['district_locked', 'tile_occupied', 'no_road_access']).toContain(locked);

  // World map: Silverbrook locked at level 2.
  await page.keyboard.press('g');
  const map = page.getByTestId('world-map');
  await expect(map).toBeVisible();
  await expect(map.getByTestId('region-greenhaven')).toContainText('offen');
  await expect(map.getByTestId('region-silverbrook')).toContainText('gesperrt · ab Level 2');
  await expect(map.getByTestId('xp-text')).toContainText('/ 1.000');

  // XP cheat through the debug hook: enough for level 2.
  await page.evaluate(() => {
    const { session, awardXp } = window.__neon;
    const sim = session.sim as unknown as { state: unknown; events: unknown };
    awardXp(sim.state, sim.events, 'e2e-cheat', 1000, 'E2E');
  });
  const dialog = page.getByTestId('levelup');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog).toContainText('Silverbrook ist jetzt offen');
  await page.screenshot({ path: 'tests/e2e/output/p17-levelup.png' });
  await dialog.getByRole('button', { name: 'Neuen Bezirk entdecken' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('level-stat')).toContainText('2 · Silverbrook');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'tests/e2e/output/p17-silverbrook.png' });

  // Silverbrook is open now, Neon Central still locked (the world map panel stays open behind the dialog).
  if (!(await page.getByTestId('world-map').isVisible())) await page.keyboard.press('g');
  await expect(page.getByTestId('region-silverbrook')).toContainText('offen');
  await expect(page.getByTestId('region-neon_central')).toContainText('gesperrt · ab Level 3');
  const unlocked = await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { progression: { level: number; unlockedRegions: string[]; pendingLevelUp: unknown } };
    return s.progression;
  });
  expect(unlocked.level).toBe(2);
  expect(unlocked.unlockedRegions).toEqual(['greenhaven', 'silverbrook']);
  expect(unlocked.pendingLevelUp).toBeNull();
  expect(errors).toEqual([]);
});
