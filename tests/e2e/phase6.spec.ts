import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P6 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase6-seed');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('factions, politics and decisions are playable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  await page.keyboard.press('k');
  const factions = page.getByRole('region', { name: 'Fraktionen' });
  await expect(factions).toContainText('Hyperion Dynamics');
  await factions.getByRole('button', { name: /Dockarbeitergewerkschaft/ }).click();
  await factions.getByRole('button', { name: /unterstützen/ }).click();
  await expect(factions).toContainText('+');
  await page.screenshot({ path: 'tests/e2e/output/p6-factions.png' });

  await page.keyboard.press('o');
  const politics = page.getByRole('region', { name: 'Politik' });
  await expect(politics).toContainText('Stadtrat');
  await expect(politics).toContainText('Umsatzsteuer');
  await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { politics: { influence: number } };
    s.politics.influence = 60;
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  });
  await politics.getByRole('button', { name: /→ 4 %/ }).click();
  await expect(politics).toContainText('Antrag von dir');
  await page.screenshot({ path: 'tests/e2e/output/p6-politics.png' });

  // Inject a decision and resolve it from the dock.
  await page.evaluate(() => {
    const s = window.__neon.session.sim!.state as unknown as { decisions: { pending: unknown[]; nextId: number; cooldowns: Record<string, number> }; tick: number };
    s.decisions.pending.push({
      id: s.decisions.nextId++,
      kind: 'church_donation',
      title: 'Die Kirche des Signals bittet um eine Spende',
      text: 'Testentscheidung.',
      options: [
        { id: 'donate', label: '1.500 ¢ spenden', hint: '' },
        { id: 'decline', label: 'Ablehnen', hint: '' },
      ],
      createdTick: s.tick,
      expiresDay: 99,
      context: { factionId: 'signal_church', amount: 1500 },
    });
    (window.__neon.store.getState() as unknown as { bumpTick: () => void }).bumpTick();
  });
  await expect(page.getByRole('banner')).toContainText('1 Entscheidung');
  await page.getByRole('button', { name: /Entscheidungen/ }).click();
  await page.getByRole('button', { name: '1.500 ¢ spenden' }).click();
  await expect(page.getByRole('banner')).not.toContainText('Entscheidung');
  await page.screenshot({ path: 'tests/e2e/output/p6-decision.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
