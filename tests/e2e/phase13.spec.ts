import { test, expect, type Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('neon-dynasty.seenIntro', '1'));
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('P13 Tester');
  await page.getByLabel('Stadt-Seed').fill('phase13-seed');
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await page.getByRole('button', { name: 'Stadt betreten' }).click();
  await page.waitForFunction(() => !!window.__neon?.session.renderer && !!window.__neon.session.sim);
  await page.keyboard.press('0');
  await page.waitForTimeout(300);
}

test('casino: slots, roulette and blackjack move real credits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const balance = (): Promise<number> => page.evaluate(() => window.__neon.session.sim!.state.ledger.balance);
  await page.keyboard.press('j');
  const casino = page.getByRole('region', { name: 'Casino' });
  await expect(casino).toContainText('Royal Nova Casino');

  // Slots
  const before = await balance();
  await casino.getByLabel('Einsatz').fill('100');
  await casino.getByRole('button', { name: /Drehen für/ }).click();
  await expect(casino.getByTestId('slots-result')).toBeVisible();
  const afterSlots = await balance();
  const payout = await page.evaluate(() => window.__neon.session.sim!.state.casino.lastSlots!.payout);
  expect(afterSlots).toBeCloseTo(before - 100 + payout, 1);
  const slotsText = await casino.getByTestId('slots-result').innerText();
  expect(slotsText.startsWith(payout > 0 ? 'Gewinn' : 'Nichts')).toBe(true);
  await page.screenshot({ path: 'tests/e2e/output/p13-slots.png' });

  // Roulette: red and black together return the stake unless zero comes up.
  await casino.getByRole('tab', { name: 'Roulette' }).click();
  await casino.getByRole('button', { name: '50', exact: true }).click();
  await casino.getByRole('button', { name: 'Rot (1:1)' }).click();
  await casino.getByRole('button', { name: 'Schwarz (1:1)' }).click();
  await expect(casino).toContainText('Gesamt 100 ¢');
  const beforeRoulette = await balance();
  await casino.getByRole('button', { name: /Kugel werfen/ }).click();
  await expect(casino.getByTestId('roulette-result')).toBeVisible();
  const spun = await page.evaluate(() => window.__neon.session.sim!.state.casino.lastRoulette!.number);
  const afterRoulette = await balance();
  expect(afterRoulette).toBeCloseTo(spun === 0 ? beforeRoulette - 100 : beforeRoulette, 1);
  await page.screenshot({ path: 'tests/e2e/output/p13-roulette.png' });

  // Blackjack: deal, play to the end, result and ledger agree.
  await casino.getByRole('tab', { name: 'Blackjack' }).click();
  await casino.getByLabel('Einsatz').fill('200');
  const beforeBj = await balance();
  await casino.getByRole('button', { name: /Geben für/ }).click();
  await expect(casino.getByTestId('blackjack-table')).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const phase = await page.evaluate(() => window.__neon.session.sim!.state.casino.blackjack!.phase);
    if (phase !== 'player') break;
    await casino.getByRole('button', { name: 'Halten' }).click();
  }
  await expect(casino.getByTestId('blackjack-result')).toBeVisible();
  const hand = await page.evaluate(() => window.__neon.session.sim!.state.casino.blackjack!);
  expect(await balance()).toBeCloseTo(beforeBj - hand.bet + hand.payout, 1);
  await page.screenshot({ path: 'tests/e2e/output/p13-blackjack.png' });

  // Finance panel lists the casino category.
  await page.keyboard.press('f');
  await expect(page.getByRole('region', { name: 'Finanzen' })).toContainText('Casino');
  expect(errors).toEqual([]);
});
