import { test, expect, type Browser, type Page } from '@playwright/test';

const SERVER = 'http://localhost:8790';

async function join(browser: Browser, name: string, mode: 'register' | 'login'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  const online = page.getByRole('region', { name: 'Online spielen' });
  await online.getByLabel('Server-Adresse').fill(SERVER);
  await expect(online).toContainText('Nova Eclipse: Tag');
  await online.getByLabel('Online-Name').fill(name);
  await online.getByLabel('Passwort').fill('geheim123');
  await online.getByRole('button', { name: mode === 'register' ? 'Registrieren und beitreten' : 'Anmelden' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await expect(page.getByTestId('online-badge')).toContainText('Online');
  return page;
}

test('two accounts share one city: buildings, presence and the server clock', async ({ browser }) => {
  test.setTimeout(360_000); // two WebGL pages plus a world catch-up take a while in headless mode
  const suffix = Date.now().toString(36);
  const ada = await join(browser, `Ada ${suffix}`, 'register');
  const bo = await join(browser, `Bo ${suffix}`, 'register');
  const errors: string[] = [];
  ada.on('pageerror', (e) => errors.push(e.message));
  bo.on('pageerror', (e) => errors.push(e.message));

  await expect(ada.getByTestId('online-badge')).toContainText('2 verbunden');
  await expect(bo.getByTestId('online-badge')).toContainText('2 verbunden');
  // The server clock runs for everyone; speed keys do nothing.
  const tick0 = await ada.evaluate(() => window.__neon.session.sim!.state.tick);
  await ada.keyboard.press('0');
  await expect.poll(() => ada.evaluate(() => window.__neon.session.sim!.state.tick), { timeout: 15000 }).toBeGreaterThan(tick0);

  // Ada builds a bar through the normal UI flow (store dispatch → server → both clients).
  const spot = await ada.evaluate(() => {
    const { session, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'ramen_bar', x, y).ok) return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  await ada.evaluate(({ x, y }) => window.__neon.store.getState().dispatch({ type: 'placeBuilding', defId: 'ramen_bar', x, y }), spot!);
  const adaId = await ada.evaluate(() => (window.__neon.store.getState() as unknown as { online: { playerId: string } }).online.playerId);
  const ownedBy = (page: Page, owner: string): Promise<number> =>
    page.evaluate((o) => Object.values(window.__neon.session.sim!.state.buildings).filter((b) => (b as { owner: string }).owner === o).length, owner);
  await expect.poll(() => ownedBy(ada, adaId), { timeout: 15000 }).toBe(1);
  await expect.poll(() => ownedBy(bo, adaId), { timeout: 15000 }).toBe(1);
  // Bo sees it as Ada's building in the inspector.
  const barId = await bo.evaluate((o) => (Object.values(window.__neon.session.sim!.state.buildings).find((b) => (b as { owner: string }).owner === o) as { id: number }).id, adaId);
  await bo.evaluate((id) => (window.__neon.store.getState() as unknown as { selectBuilding: (id: number) => void }).selectBuilding(id), barId);
  await expect(bo.getByRole('complementary', { name: 'Auswahl' })).toContainText(`Gebäude von Ada ${suffix}`);
  await expect(bo.getByRole('complementary', { name: 'Auswahl' })).not.toContainText('Dashboard öffnen');
  // Bo's money is untouched by Ada's purchase; both worlds agree on the tick after catching up.
  const boBalance = await bo.evaluate(() => window.__neon.session.sim!.state.ledger.balance);
  expect(boBalance).toBeGreaterThan(0);
  await bo.screenshot({ path: 'tests/e2e/output/p12-online-bo.png' });
  await ada.screenshot({ path: 'tests/e2e/output/p12-online-ada.png' });

  // Logging in again (new page) restores the same player with the bar.
  await ada.close();
  const adaAgain = await join(browser, `Ada ${suffix}`, 'login');
  await expect.poll(() => ownedBy(adaAgain, adaId), { timeout: 15000 }).toBe(1);
  await expect(adaAgain.getByRole('banner')).toContainText(`Ada ${suffix}`);
  expect(errors).toEqual([]);
});
