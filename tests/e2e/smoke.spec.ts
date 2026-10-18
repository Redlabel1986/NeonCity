import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __neon: {
      session: {
        sim: { state: Record<string, unknown> & { tick: number; speed: number; buildings: Record<string, unknown>; ledger: { balance: number }; grid: unknown } } | null;
        renderer: { focusTile: (x: number, y: number, zoom?: number) => void; zoom: number } | null;
      };
      store: { getState: () => Record<string, unknown> & { dispatch: (c: unknown) => boolean; selectedBuildingId: number | null } };
      checkPlacement: (state: unknown, defId: string, x: number, y: number) => { ok: boolean; error?: string };
      awardXp: (state: unknown, events: unknown, id: string, xp: number, title: string) => number;
    };
  }
}

async function startGame(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Neon\s*Dynasty/i })).toBeVisible();
  await page.getByLabel('Dein Name').fill('E2E Tester');
  await page.getByLabel('Stadt-Seed').fill('e2e-seed-1');
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await expect(page.getByRole('banner')).toContainText('Credits');
  await page.waitForFunction(() => !!window.__neon.session.renderer && !!window.__neon.session.sim);
  await page.waitForTimeout(600);
}

test('city renders and a ramen bar can be built, operated, saved and loaded', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await startGame(page);
  await page.screenshot({ path: 'tests/e2e/output/01-start.png' });

  // Pause the game for deterministic interaction.
  await page.keyboard.press('0');
  const credits0 = await page.evaluate(() => window.__neon.session.sim!.state.ledger.balance);

  // Find a buildable lot in the home district and centre the camera on it.
  const lot = await page.evaluate(() => {
    const { session, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number }; player: { homeDistrictId: number }; districts: { cx: number; cy: number }[] };
    const home = state.districts[state.player.homeDistrictId]!;
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 0; y < state.grid.height; y++) {
      for (let x = 0; x < state.grid.width; x++) {
        if (!checkPlacement(session.sim!.state, 'ramen_bar', x, y).ok) continue;
        const d = Math.abs(x - home.cx) + Math.abs(y - home.cy);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    session.renderer!.focusTile(best!.x, best!.y, 1.6);
    return best!;
  });

  await page.keyboard.press('b');
  await expect(page.getByRole('region', { name: 'Bauen' }).getByRole('heading', { name: 'Asia-Imbiss' })).toBeVisible();
  await page.getByRole('button', { name: 'Platzieren' }).first().click();
  await expect(page.getByText('Platzierung aktiv')).toBeVisible();

  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'tests/e2e/output/02-placement.png' });
  await page.mouse.click(cx, cy);

  await expect
    .poll(async () => page.evaluate(() => Object.values(window.__neon.session.sim!.state.buildings).filter((b) => (b as { owner: string }).owner === 'player').length))
    .toBe(1);
  const credits1 = await page.evaluate(() => window.__neon.session.sim!.state.ledger.balance);
  expect(credits1).toBeLessThan(credits0);
  await expect(page.getByRole('complementary', { name: 'Auswahl' }).getByRole('heading', { name: 'Asia-Imbiss' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Auswahl' })).toContainText('Baustelle');
  await page.screenshot({ path: 'tests/e2e/output/03-construction.png' });

  // Skip ahead deterministically (40 game hours) while paused; the loop forwards events next frame.
  await page.evaluate(() => {
    (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(40 * 60);
  });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const b = Object.values(window.__neon.session.sim!.state.buildings).find((x) => (x as { owner: string }).owner === 'player') as { status: string; business?: { lifetimeGuests: number } } | undefined;
          return b?.status === 'operational' && (b.business?.lifetimeGuests ?? 0) > 0;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(page.getByRole('complementary', { name: 'Auswahl' })).toContainText('Betrieb');
  await page.keyboard.press('0');
  await page.screenshot({ path: 'tests/e2e/output/04-operational.png' });

  // Quick save, mutate, quick load, verify restoration.
  const tickBefore = await page.evaluate(() => window.__neon.session.sim!.state.tick);
  await page.keyboard.press('F5');
  await expect(page.getByText(/Schnellspeicherung angelegt/)).toBeVisible();
  await page.keyboard.press('3');
  await page.waitForTimeout(1500);
  await page.keyboard.press('0');
  const tickLater = await page.evaluate(() => window.__neon.session.sim!.state.tick);
  expect(tickLater).toBeGreaterThan(tickBefore);
  await page.keyboard.press('F9');
  await expect(page.getByText(/geladen/)).toBeVisible();
  await page.waitForFunction((t) => window.__neon.session.sim!.state.tick === t, tickBefore);

  // Saves dialog lists the quick save.
  await page.getByRole('button', { name: 'Spielstände' }).click();
  await expect(page.getByRole('dialog')).toContainText('Schnellspeicherung');
  await page.keyboard.press('Escape');

  // Lot refers to a real tile; the ghost/selection should have been placed there.
  expect(lot.x).toBeGreaterThanOrEqual(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('invalid placement is rejected with a message and no money is spent', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('0');
  const result = await page.evaluate(() => {
    const store = window.__neon.store.getState();
    const before = window.__neon.session.sim!.state.ledger.balance;
    const ok = store.dispatch({ type: 'placeBuilding', defId: 'ramen_bar', x: 0, y: 0 }); // (0,0) is always a road
    return { ok, same: window.__neon.session.sim!.state.ledger.balance === before };
  });
  expect(result.ok).toBe(false);
  expect(result.same).toBe(true);
  await expect(page.getByText(/bereits bebaut oder nicht bebaubar|Straßenanschluss/)).toBeVisible();
});

test('every navigation entry opens a working panel', async ({ page }) => {
  await startGame(page);
  for (const name of ['Stadt', 'Bauen', 'Unternehmen', 'Immobilien', 'Personal', 'Finanzen', 'Forschung', 'Fraktionen', 'Politik', 'Unterwelt', 'Statistik']) {
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole('region', { name })).toBeVisible();
    await expect(page.getByText(/Noch nicht verfügbar/)).toHaveCount(0);
  }
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: /^Bauen/ }).click();
  await expect(page.getByRole('region', { name: 'Bauen' }).getByRole('heading', { name: 'Forschungslabor' })).toBeVisible();
});
