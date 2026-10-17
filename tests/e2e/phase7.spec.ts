import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P7 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase7-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

async function buildAndOpen(page: Page, defId: string): Promise<void> {
  await page.evaluate((id) => {
    const { session, store, checkPlacement } = window.__neon;
    const state = session.sim!.state as unknown as { grid: { width: number; height: number } };
    for (let y = 0; y < state.grid.height; y++)
      for (let x = 0; x < state.grid.width; x++)
        if (checkPlacement(session.sim!.state, id, x, y).ok) {
          const before = new Set(Object.keys(session.sim!.state.buildings));
          store.getState().dispatch({ type: 'placeBuilding', defId: id, x, y });
          const b = Object.values(session.sim!.state.buildings).find((v) => (v as { owner: string; id: number }).owner === 'player' && !before.has(String((v as { id: number }).id))) as { id: number };
          (store.getState() as unknown as { openDashboard: (id: number) => void }).openDashboard(b.id);
          return;
        }
    throw new Error('no lot');
  }, defId);
  await page.waitForTimeout(200);
}

test('research, factory and corporate finance are playable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  await buildAndOpen(page, 'research_lab');
  const lab = page.getByRole('region', { name: 'Forschungslabor' });
  await expect(lab).toContainText('Punkte / Tag');
  await lab.getByRole('button', { name: 'Forschungsbaum öffnen' }).click();
  const research = page.getByRole('region', { name: 'Forschung' });
  await expect(research).toContainText('Synth-Küche');
  await research.locator('li', { hasText: 'Synth-Küche' }).getByRole('button', { name: 'Erforschen' }).first().click();
  await expect(research).toContainText('läuft');
  await page.screenshot({ path: 'tests/e2e/output/p7-research.png' });

  await buildAndOpen(page, 'food_factory');
  const factory = page.getByRole('region', { name: 'Lebensmittelfabrik' });
  await expect(factory).toContainText('Produktionslinien');
  await factory.getByLabel('Neue Linie').selectOption('synthmeat_plant');
  await factory.getByRole('button', { name: 'Linie hinzufügen' }).click();
  await expect(factory).toContainText('Synth-Fleisch-Kultur');
  await page.screenshot({ path: 'tests/e2e/output/p7-factory.png' });

  await page.evaluate(() => (window.__neon.session.sim as unknown as { run: (n: number) => void }).run(17 * 60 + 5));
  await factory.getByRole('tab', { name: 'Produktion' }).click();
  await expect(factory).toContainText('Gestern: produziert');

  await page.keyboard.press('f');
  const finance = page.getByRole('region', { name: 'Finanzen' });
  await expect(finance).toContainText('Unternehmensbewertung');
  await finance.getByRole('button', { name: 'Kredit aufnehmen' }).click();
  await expect(finance).toContainText('Ablösen');
  await finance.getByLabel('Haftpflicht').check();
  await expect(finance.getByLabel('Haftpflicht')).toBeChecked();
  await page.screenshot({ path: 'tests/e2e/output/p7-finance.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
