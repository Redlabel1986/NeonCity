/**
 * Corporate finance: valuation, bank loans, investors (shares, dividends),
 * insurance policies and insolvency.
 */

import type { SimContext } from '../core/context';
import type { Building, CorporateState, GameState } from '../state';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { book, canAfford } from '../economy/finance';
import { techFactors } from './research';
import { tickToDate } from '../core/clock';

export function createCorporateState(name: string): CorporateState {
  return { name, loans: [], nextLoanId: 1, sharesSold: 0, investorCapital: 0, lifetimeDividends: 0, insurance: {}, lifetimePremiums: 0, lifetimeClaims: 0, insolvencyDays: 0, bankrupt: false, lastValuation: 0, megacorp: false, megacorpSinceDay: 0, careers: 1, chainTakeoverCooldownDay: 0 };
}

export const MEGACORP_VALUATION = 400000;
export const MEGACORP_BUSINESSES = 6;
export const MEGACORP_KINDS = 3;

/** Requirements for megacorp status and how far the player is. */
export function megacorpProgress(state: GameState): { valuation: number; businesses: number; kinds: number; qualifies: boolean } {
  const owned = Object.values(state.buildings).filter((b) => b.owner === 'player' && b.business && b.status === 'operational');
  const kinds = new Set(owned.map((b) => b.business!.kind)).size;
  const v = valuation(state);
  return { valuation: v, businesses: owned.length, kinds, qualifies: v >= MEGACORP_VALUATION && owned.length >= MEGACORP_BUSINESSES && kinds >= MEGACORP_KINDS };
}

/** Buys every competitor venue of a district in one deal (megacorp action). */
export function chainTakeover(ctx: SimContext, districtId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (!state.corporate.megacorp) return { ok: false, error: 'Nur ein Megakonzern kann ganze Ketten übernehmen.' };
  const day = tickToDate(state.tick).day;
  if (state.corporate.chainTakeoverCooldownDay > day) return { ok: false, error: `Die Kartellbehörde prüft noch bis Tag ${state.corporate.chainTakeoverCooldownDay + 1}.` };
  const venues = Object.values(state.competitors).filter((c) => c.districtId === districtId);
  if (venues.length === 0) return { ok: false, error: 'In diesem Bezirk gibt es keine Konkurrenzlokale.' };
  const total = Math.round(venues.reduce((s, c) => s + propertyPriceOf(state, c.buildingId), 0) * 0.9);
  if (!canAfford(state, total)) return { ok: false, error: `Die Kette kostet ${total} ¢.` };
  for (const c of venues) {
    const r = takeoverCompetitorFree(ctx, c.buildingId);
    if (!r.ok) return r;
  }
  book(state, events, -total, { category: 'land', description: `Kettenübernahme ${state.districts[districtId]!.name} (${venues.length} Lokale)` });
  state.corporate.chainTakeoverCooldownDay = day + 10;
  for (const f of state.factions) if (f.id === 'kosei' || f.id === 'union') f.relation = Math.max(-100, f.relation - 15);
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${venues.length} Lokale in ${state.districts[districtId]!.name} für ${total} ¢ übernommen. Kōsei und die Gewerkschaft sind alarmiert.` });
  return { ok: true };
}

/** Sells the whole group: every business and property at 90 % of its value; the organisation disbands. */
export function sellCompany(ctx: SimContext): { ok: true; proceeds: number } | { ok: false; error: string } {
  const { state, events } = ctx;
  const assets = Object.values(state.buildings).filter((b) => b.owner === 'player' && (b.business || b.property));
  if (assets.length === 0) return { ok: false, error: 'Es gibt nichts zu verkaufen.' };
  if (state.corporate.sharesSold > 0) return { ok: false, error: 'Kaufe zuerst alle Anteile der Investoren zurück.' };
  let proceeds = 0;
  for (const b of assets) {
    proceeds += Math.round(businessValue(b) * 0.9);
    b.owner = 'city';
    b.label = b.defId === 'city' ? b.label : `Leerstand (${b.label})`;
    delete b.business;
    delete b.property;
    b.investment = 0;
  }
  for (const loan of state.corporate.loans) proceeds -= loan.remaining;
  state.corporate.loans = [];
  book(state, events, proceeds, { category: 'capital', description: `Verkauf der Unternehmensgruppe (${assets.length} Objekte)` });
  if (state.underworld.org) {
    state.underworld.org = null;
    state.ledger.dirtyBalance = 0;
  }
  state.corporate.megacorp = false;
  state.corporate.insurance = {};
  events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `Unternehmensgruppe verkauft: ${proceeds} ¢ nach Tilgung aller Kredite. Zeit für eine neue Karriere.` });
  return { ok: true, proceeds };
}

/** Daily: megacorp status check. */
export function stepMegacorp(ctx: SimContext, day: number): void {
  const { state, events } = ctx;
  const p = megacorpProgress(state);
  if (p.qualifies && !state.corporate.megacorp) {
    state.corporate.megacorp = true;
    state.corporate.megacorpSinceDay = day;
    for (const f of state.factions) {
      if (f.id === 'hyperion' || f.id === 'kosei') f.relation = Math.max(-100, f.relation - 20);
      if (f.id === 'novanet' || f.id === 'city_hall') f.relation = Math.min(100, f.relation + 10);
    }
    state.politics.influence = Math.min(100, state.politics.influence + 15);
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${state.corporate.name} ist jetzt ein Megakonzern. Kettenübernahmen und Lieferverträge sind freigeschaltet; die anderen Konzerne sehen dich als Rivalen.` });
  } else if (!p.qualifies && state.corporate.megacorp && p.valuation < MEGACORP_VALUATION * 0.5) {
    state.corporate.megacorp = false;
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${state.corporate.name} hat den Megakonzern-Status verloren.` });
  }
}

import { propertyPrice, takeoverCompetitor } from './property';

function propertyPriceOf(state: GameState, buildingId: number): number {
  const b = state.buildings[buildingId];
  return b ? propertyPrice(state, b) : 0;
}

/** Takeover without paying (the chain deal books one total). */
function takeoverCompetitorFree(ctx: SimContext, buildingId: number): { ok: true } | { ok: false; error: string } {
  const before = ctx.state.ledger.balance;
  const unlimited = ctx.state.player.difficulty === 'sandbox';
  // Temporarily lift the price check by crediting, then restoring the balance.
  const price = propertyPriceOf(ctx.state, buildingId);
  if (!unlimited) ctx.state.ledger.balance += price;
  const r = takeoverCompetitor(ctx, buildingId);
  if (!unlimited) ctx.state.ledger.balance = before;
  // Remove the per-venue booking so only the chain total appears.
  const idx = ctx.state.ledger.transactions.findIndex((t) => t.buildingId === buildingId && t.description.startsWith('Übernahme:'));
  if (idx >= 0) {
    const t = ctx.state.ledger.transactions[idx]!;
    ctx.state.ledger.todayExpenses -= -t.amount;
    ctx.state.ledger.transactions.splice(idx, 1);
  }
  return r;
}

export const INSURANCE_POLICIES: Record<string, { id: string; name: string; description: string; premiumPerDay: number; covers: string }> = {
  property: { id: 'property', name: 'Gebäudeversicherung', description: 'Deckt 80 % der Reparaturen nach Unfällen und Zwischenfällen in Hotels.', premiumPerDay: 60, covers: 'accident' },
  cyber: { id: 'cyber', name: 'Cyber-Police', description: 'Erstattet 80 % der Verluste aus Cyberangriffen und Lösegeld.', premiumPerDay: 45, covers: 'cyber' },
  liability: { id: 'liability', name: 'Haftpflicht', description: 'Übernimmt Bußgelder aus Hygienekontrollen zu 70 %.', premiumPerDay: 30, covers: 'fine' },
  theft: { id: 'theft', name: 'Diebstahlschutz', description: 'Ersetzt 60 % des Warenschwunds.', premiumPerDay: 25, covers: 'theft' },
};

/** Value of one business from its investment and recent profits. */
export function businessValue(b: Building): number {
  const biz = b.business;
  if (!biz) return b.property ? b.property.purchasePrice * (0.6 + b.property.condition / 250) : 0;
  const recent = biz.history.slice(-7);
  const profit = recent.length > 0 ? recent.reduce((s, h) => s + (h.revenue - h.costs), 0) / recent.length : 0;
  return Math.max(0, b.investment * 0.7 + Math.max(0, profit) * 25);
}

export function valuation(state: GameState): number {
  let total = 0;
  for (const b of Object.values(state.buildings)) if (b.owner === 'player') total += businessValue(b);
  total += Math.max(0, state.ledger.balance);
  for (const l of state.corporate.loans) total -= l.remaining;
  return Math.round(total);
}

export function loanLimit(state: GameState): number {
  const v = valuation(state);
  const owed = state.corporate.loans.reduce((s, l) => s + l.remaining, 0);
  return Math.max(0, Math.round(v * 0.5 + 5000 - owed));
}

export function loanRate(state: GameState): number {
  const base = 0.004 + (state.crisis.active?.id === 'financial_scandal' ? 0.004 : 0) + (state.ledger.daysInDebt > 0 ? 0.002 : 0);
  return Math.max(0.001, base + techFactors(state).loanRate);
}

export function takeLoan(ctx: SimContext, amount: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (state.corporate.bankrupt) return { ok: false, error: 'Im Insolvenzverfahren gibt es keine Kredite.' };
  if (!Number.isFinite(amount) || amount < 1000) return { ok: false, error: 'Mindestens 1.000 ¢.' };
  const limit = loanLimit(state);
  if (amount > limit) return { ok: false, error: `Die Bank gewährt höchstens ${limit} ¢ (halbe Unternehmensbewertung abzüglich offener Kredite).` };
  if (state.corporate.loans.length >= 4) return { ok: false, error: 'Höchstens vier Kredite gleichzeitig.' };
  const rate = loanRate(state);
  const loan = { id: state.corporate.nextLoanId++, principal: amount, remaining: amount, dailyRate: rate, installment: Math.ceil(amount / 40), takenTick: state.tick };
  state.corporate.loans.push(loan);
  book(state, events, amount, { category: 'loan', description: `Kredit aufgenommen (${(rate * 100).toFixed(2)} % pro Tag)` });
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Kredit über ${amount} ¢ aufgenommen. Rate ${loan.installment} ¢/Tag plus Zinsen.` });
  return { ok: true };
}

export function repayLoan(ctx: SimContext, loanId: number, amount: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const loan = state.corporate.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, error: 'Kredit nicht gefunden.' };
  const pay = Math.min(loan.remaining, Math.max(0, Math.round(amount)));
  if (pay <= 0) return { ok: false, error: 'Ungültiger Betrag.' };
  if (!canAfford(state, pay)) return { ok: false, error: 'Nicht genug Credits.' };
  book(state, events, -pay, { category: 'loan', description: 'Sondertilgung' });
  loan.remaining -= pay;
  if (loan.remaining <= 0) state.corporate.loans = state.corporate.loans.filter((l) => l.id !== loanId);
  return { ok: true };
}

export function sellShares(ctx: SimContext, share: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (!Number.isFinite(share) || share <= 0 || share > 0.49) return { ok: false, error: 'Zwischen 1 % und 49 %.' };
  if (state.corporate.sharesSold + share > 0.49) return { ok: false, error: 'Du musst die Mehrheit behalten (max. 49 % verkauft).' };
  const v = valuation(state);
  if (v < 10000) return { ok: false, error: 'Investoren steigen erst ab 10.000 ¢ Bewertung ein.' };
  const price = Math.round(v * share * (state.crisis.active?.id === 'financial_scandal' ? 0.7 : 0.9));
  state.corporate.sharesSold = Math.round((state.corporate.sharesSold + share) * 100) / 100;
  state.corporate.investorCapital += price;
  book(state, events, price, { category: 'capital', description: `Anteilsverkauf ${Math.round(share * 100)} % an Investoren` });
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${Math.round(share * 100)} % der Anteile für ${price} ¢ verkauft. Investoren erhalten ihren Anteil am Tagesgewinn.` });
  return { ok: true };
}

export function buyBackShares(ctx: SimContext, share: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (!Number.isFinite(share) || share <= 0 || share > state.corporate.sharesSold + 1e-9) return { ok: false, error: 'So viele Anteile sind nicht verkauft.' };
  const price = Math.round(valuation(state) * share * 1.1);
  if (!canAfford(state, price)) return { ok: false, error: `Rückkauf kostet ${price} ¢.` };
  book(state, events, -price, { category: 'capital', description: `Anteilsrückkauf ${Math.round(share * 100)} %` });
  state.corporate.sharesSold = Math.max(0, Math.round((state.corporate.sharesSold - share) * 100) / 100);
  return { ok: true };
}

export function setInsurance(state: GameState, policyId: string, active: boolean): { ok: true } | { ok: false; error: string } {
  if (!INSURANCE_POLICIES[policyId]) return { ok: false, error: 'Unbekannte Police.' };
  state.corporate.insurance[policyId] = active;
  return { ok: true };
}

/** Called by systems when an insurable loss occurs; returns the reimbursed amount. */
export function insuranceClaim(ctx: SimContext, covers: string, loss: number, description: string): number {
  const { state, events } = ctx;
  const policy = Object.values(INSURANCE_POLICIES).find((p) => p.covers === covers);
  if (!policy || !state.corporate.insurance[policy.id] || loss <= 0) return 0;
  const share = covers === 'accident' || covers === 'cyber' ? 0.8 : covers === 'fine' ? 0.7 : 0.6;
  const payout = Math.round(loss * share);
  book(state, events, payout, { category: 'insurance', description: `Versicherungsleistung: ${description}` });
  state.corporate.lifetimeClaims += payout;
  return payout;
}

/** Day close: interest, instalments, dividends, premiums, insolvency. */
export function closeCorporateDay(ctx: SimContext): void {
  const { state, events } = ctx;
  const corp = state.corporate;
  // Loans
  for (const loan of [...corp.loans]) {
    const interest = Math.round(loan.remaining * loan.dailyRate);
    if (interest > 0) book(state, events, -interest, { category: 'interest', description: 'Kreditzinsen' });
    const pay = Math.min(loan.remaining, loan.installment);
    book(state, events, -pay, { category: 'loan', description: 'Kreditrate' });
    loan.remaining -= pay;
    if (loan.remaining <= 0) {
      corp.loans = corp.loans.filter((l) => l.id !== loan.id);
      events.emit({ type: 'log', tick: state.tick, level: 'success', message: 'Ein Kredit ist vollständig getilgt.' });
    }
  }
  // Dividends on positive daily net result of the businesses.
  if (corp.sharesSold > 0) {
    // Operating result only: capital inflows (loans, share sales) are not profit.
    const dayStart = state.tick - 1440;
    let net = 0;
    for (const t of state.ledger.transactions) {
      if (t.tick <= dayStart || t.category === 'loan' || t.category === 'capital') continue;
      net += t.amount;
    }
    if (net > 0) {
      const dividend = Math.round(net * corp.sharesSold);
      book(state, events, -dividend, { category: 'dividend', description: `Dividende an Investoren (${Math.round(corp.sharesSold * 100)} %)` });
      corp.lifetimeDividends += dividend;
    }
  }
  // Premiums
  const factor = techFactors(state).premium;
  let premiums = 0;
  for (const [id, active] of Object.entries(corp.insurance)) if (active) premiums += INSURANCE_POLICIES[id]?.premiumPerDay ?? 0;
  premiums = Math.round(premiums * factor);
  if (premiums > 0) {
    book(state, events, -premiums, { category: 'insurance', description: 'Versicherungsprämien' });
    corp.lifetimePremiums += premiums;
  }
  corp.lastValuation = valuation(state);
  // Insolvency: balance deeply negative for days -> liquidate assets, then bankruptcy.
  const threshold = -(5000 + corp.lastValuation * 0.2);
  if (state.ledger.balance < threshold) {
    corp.insolvencyDays++;
    if (corp.insolvencyDays === 1) events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `Zahlungsunfähigkeit droht: Kontostand ${Math.round(state.ledger.balance)} ¢. Nach drei Tagen werden Vermögenswerte zwangsverkauft.` });
    if (corp.insolvencyDays >= 3) liquidate(ctx);
  } else corp.insolvencyDays = 0;
}

function liquidate(ctx: SimContext): void {
  const { state, events } = ctx;
  const assets = Object.values(state.buildings)
    .filter((b) => b.owner === 'player' && (b.business || b.property))
    .sort((a, b) => businessValue(a) - businessValue(b));
  if (assets.length === 0) {
    if (!state.corporate.bankrupt) {
      state.corporate.bankrupt = true;
      state.speed = 0;
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: 'Insolvenz: Alle Vermögenswerte sind verkauft, die Schulden bleiben. Das Unternehmen ist am Ende.' });
    }
    return;
  }
  const victim = assets[0]!;
  const value = Math.round(businessValue(victim) * 0.6);
  const def = BUILDING_DEFINITIONS[victim.defId];
  book(state, events, value, { category: 'other', description: `Zwangsverkauf: ${victim.label}`, buildingId: victim.id });
  victim.owner = 'city';
  victim.label = def && victim.defId !== 'city' ? `Leerstand (${victim.label})` : victim.label;
  delete victim.business;
  delete victim.property;
  victim.investment = 0;
  events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `Zwangsverkauf: ${victim.label} für ${value} ¢ (Insolvenzverfahren Tag ${tickToDate(state.tick).day + 1}).`, buildingId: String(victim.id) });
}
