import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const CLOUD = 'http://localhost:8790';
const contexts: BrowserContext[] = [];

async function open(browser: Browser, mobile: boolean): Promise<Page> {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.addInitScript((cloud) => {
    localStorage.setItem('neon-dynasty.seenIntro', '1');
    localStorage.setItem('neon-dynasty.cloudServer', cloud);
  }, CLOUD);
  await page.goto('/');
  return page;
}

test.afterEach(async () => {
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
});

test('a game started on the phone continues on the PC through the cloud save', async ({ browser }) => {
  test.setTimeout(240_000);
  const account = `Cloud ${Date.now().toString(36)}`;

  // Phone: start a game, build a stand, run a few hours, register and upload.
  const phone = await open(browser, true);
  await phone.getByLabel('Dein Name').fill('Wolke');
  await phone.getByLabel('Stadt-Seed').fill('cloud-seed');
  await phone.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await phone.getByRole('button', { name: 'Stadt betreten' }).click();
  await phone.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await phone.evaluate(() => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, 'food_stand', x, y).ok) {
          store.getState().dispatch({ type: 'placeBuilding', defId: 'food_stand', x, y });
          return;
        }
  });
  await phone.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(5 * 60));
  await phone.evaluate(() => window.__neon.store.getState().dispatch({ type: 'setSpeed', speed: 0 }));
  const phoneTick = await phone.evaluate(() => window.__neon.session.sim!.state.tick);
  await phone.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Mehr' }).tap();
  await phone.getByTestId('mobile-sheet').getByRole('button', { name: 'Spielstände' }).tap();
  const cloudBox = phone.getByRole('region', { name: 'Cloud-Spielstand' });
  await cloudBox.getByLabel('Cloud-Kontoname').fill(account);
  await cloudBox.getByLabel('Cloud-Passwort').fill('geheim123');
  await cloudBox.getByRole('button', { name: 'Konto anlegen' }).tap();
  await expect(cloudBox).toContainText(`Angemeldet als ${account}`);
  await expect(cloudBox.getByTestId('cloud-meta')).toContainText('Noch kein Spielstand');
  await cloudBox.getByRole('button', { name: 'Jetzt in die Cloud speichern' }).tap();
  await expect(cloudBox.getByTestId('cloud-meta')).toContainText('Wolke', { timeout: 15000 });
  await expect(cloudBox.getByTestId('cloud-meta')).toContainText('Handy');
  await phone.screenshot({ path: 'tests/e2e/output/cloud-phone.png' });

  // PC: fresh browser profile, log in, continue from the cloud.
  const pc = await open(browser, false);
  const pcBox = pc.getByRole('region', { name: 'Cloud-Spielstand' });
  await pcBox.getByLabel('Cloud-Kontoname').fill(account);
  await pcBox.getByLabel('Cloud-Passwort').fill('geheim123');
  await pcBox.getByRole('button', { name: 'Anmelden' }).click();
  await expect(pcBox.getByTestId('cloud-meta')).toContainText('Wolke', { timeout: 15000 });
  await pcBox.getByRole('button', { name: 'Weiter aus der Cloud' }).click();
  await pc.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await pc.evaluate(() => window.__neon.store.getState().dispatch({ type: 'setSpeed', speed: 0 }));
  const pcTick = await pc.evaluate(() => window.__neon.session.sim!.state.tick);
  // The save carries the phone's tick; the PC clock may have advanced a few minutes before the pause.
  expect(pcTick).toBeGreaterThanOrEqual(phoneTick);
  expect(pcTick - phoneTick).toBeLessThan(60);
  const stands = await pc.evaluate(() => Object.values(window.__neon.session.sim!.state.buildings).filter((b) => (b as { owner: string; defId: string }).owner === 'player' && (b as { defId: string }).defId === 'food_stand').length);
  expect(stands).toBe(1);
  await expect(pc.getByRole('banner')).toContainText('Wolke');
  await pc.screenshot({ path: 'tests/e2e/output/cloud-pc.png' });

  // PC plays on and saves; the phone sees the newer save.
  await pc.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(3 * 60));
  await pc.getByRole('button', { name: 'Spielstände' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Jetzt in die Cloud speichern' }).click();
  await expect(pc.getByRole('dialog').getByTestId('cloud-meta')).toContainText('PC', { timeout: 15000 });
  const pcTick2 = await pc.evaluate(() => window.__neon.session.sim!.state.tick);
  await cloudBox.getByRole('button', { name: 'Cloud-Spielstand laden' }).tap();
  await expect.poll(() => phone.evaluate(() => window.__neon.session.sim!.state.tick), { timeout: 20000 }).toBeGreaterThanOrEqual(pcTick2);
  expect(await phone.evaluate(() => window.__neon.session.sim!.state.tick)).toBeLessThan(pcTick2 + 120);

  // Account management on the PC: change the password; the phone is signed out and logs in again with the new one.
  const pcDialog = pc.getByRole('dialog');
  await pcDialog.getByRole('button', { name: 'Konto verwalten' }).click();
  const manage = pcDialog.getByTestId('cloud-account');
  await expect(manage).toContainText(`Konto ${account}`);
  await manage.getByLabel('Aktuelles Passwort').fill('geheim123');
  await manage.getByLabel('Neues Passwort', { exact: true }).fill('neues456');
  await manage.getByLabel('Neues Passwort wiederholen').fill('neues456');
  await manage.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(manage).toContainText('Passwort geändert', { timeout: 15000 });
  await pc.screenshot({ path: 'tests/e2e/output/cloud-account.png' });
  // The phone's token is stale now: its next cloud action fails and asks for a new login.
  // (Loading from the cloud closed the saves sheet on the phone; open it again.)
  const moreSheet = phone.getByTestId('mobile-sheet').getByRole('button', { name: 'Spielstände' });
  if (!(await moreSheet.isVisible())) await phone.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Mehr' }).tap();
  await moreSheet.tap();
  await cloudBox.getByRole('button', { name: 'Jetzt in die Cloud speichern' }).tap();
  await expect(cloudBox.getByRole('alert')).toContainText('neu anmelden', { timeout: 15000 });
  await cloudBox.getByRole('button', { name: 'Abmelden' }).tap();
  await cloudBox.getByLabel('Cloud-Kontoname').fill(account);
  await cloudBox.getByLabel('Cloud-Passwort').fill('neues456');
  await cloudBox.getByRole('button', { name: 'Anmelden' }).tap();
  await expect(cloudBox).toContainText(`Angemeldet als ${account}`);
  await expect(cloudBox.getByTestId('cloud-meta')).toContainText('PC', { timeout: 15000 });
  // Delete the account from the PC with the new password.
  await manage.getByRole('button', { name: 'Konto löschen' }).click();
  await manage.getByLabel('Passwort zur Bestätigung').fill('neues456');
  await manage.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(pcDialog.getByRole('region', { name: 'Cloud-Spielstand' })).toContainText('Mit einem Konto wandert dein Spielstand', { timeout: 15000 });
  const gone = await pc.request.post(`${CLOUD}/api/cloud/login`, { data: { name: account, password: 'neues456' } });
  expect(gone.status()).toBe(401);
});
