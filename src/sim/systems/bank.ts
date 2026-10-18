/**
 * Banks: founded with capital (the reserve), they collect deposits from the
 * district's population and lend them out. Interest on loans is income,
 * interest on deposits and loan defaults are costs. Rates are the player's
 * levers; the balance sheet is bounded by reserve × leverage × tier.
 *
 * Deposits belong to the customers and never touch the player's ledger;
 * the reserve is the player's own money, locked in the bank until withdrawn.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { BankModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulty';
import { upgradeEffects } from '../data/upgrades';
import { effectiveUpkeep, stageEffects } from '../data/evolution';
import { book, canAfford } from '../economy/finance';
import type { BankState, Building, GameState } from '../state';
import { closeStaffDay, createEmployee, generateCandidates, roleThroughput, ROLES_BY_KIND } from './staff';
import { crisisFactors } from './crises';

export const BANK_RATE_BOUNDS = {
  deposit: { min: 0, max: 0.003 },
  loan: { min: 0.001, max: 0.02 },
};

/** Reserve must stay above this share of deposits, otherwise the supervisor stops new deposits. */
export const RESERVE_RATIO = 0.1;

export function createBankState(model: BankModel, rng: Rng, day: number, tick: number, districtSkillBias: number): BankState {
  const biz: BankState = {
    kind: 'bank',
    reserve: model.foundingCapital,
    deposits: 0,
    loansOut: 0,
    depositRate: model.marketDepositRate,
    loanRate: model.marketLoanRate,
    reputation: 40,
    supervised: false,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayRevenue: 0,
    todayCosts: 0,
    todayDefaults: 0,
    lifetimeProfit: 0,
    history: [],
  };
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.bank!);
  return biz;
}

function bankOf(state: GameState, buildingId: number): { b: Building; biz: BankState; model: BankModel } | null {
  const b = state.buildings[buildingId];
  const model = BUILDING_DEFINITIONS[b?.defId ?? '']?.business;
  const biz = b?.business;
  if (!b || b.owner !== state.playerId || !biz || biz.kind !== 'bank' || !model || model.kind !== 'bank') return null;
  return { b, biz, model };
}

/** Largest deposit book the bank may hold. */
export function balanceSheetLimit(b: Building, biz: BankState, model: BankModel): number {
  return Math.round(biz.reserve * model.leverage * stageEffects(b).leverage);
}

export interface BankOutlook {
  limit: number;
  /** Expected daily deposit inflow at current rates. */
  inflow: number;
  /** Expected daily outflow. */
  outflow: number;
  /** Loan book the market would take at the current loan rate. */
  loanDemand: number;
  dailyInterestIncome: number;
  dailyInterestCost: number;
  expectedDefaults: number;
  reserveRatio: number;
}

/** What the bank will roughly do tomorrow at its current settings (also used by the day close). */
export function explainBank(state: GameState, b: Building): BankOutlook | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'bank' || !biz || biz.kind !== 'bank') return null;
  const stats = state.districts[b.districtId]!.stats;
  const tf = stageEffects(b);
  const fx = upgradeEffects(biz.upgrades);
  const bankers = roleThroughput(biz, 'banker', 1);
  const analysts = roleThroughput(biz, 'analyst', 1);
  const limit = balanceSheetLimit(b, biz, model);
  const rateAppeal = Math.max(0.2, Math.min(2.2, Math.pow(Math.max(0.0001, biz.depositRate) / model.marketDepositRate, 0.7)));
  const district = (0.4 + Math.min(1.2, stats.population / 30000)) * (0.5 + stats.purchasingPower / 100) * (0.8 + stats.attractiveness / 500);
  const reputation = 0.6 + (biz.reputation / 100) * 0.8;
  const staff = 0.5 + Math.min(2, bankers.count) * 0.25 + Math.min(0.4, bankers.skill / 250);
  const demand = DIFFICULTIES[state.player.difficulty].demandMultiplier * crisisFactors(state).demand;
  const inflow = biz.supervised ? 0 : model.baseDepositDraw * tf.draw * district * rateAppeal * reputation * staff * fx.draw * demand;
  const outflow = biz.deposits * (0.015 + (biz.depositRate < model.marketDepositRate ? 0.02 : 0) + (biz.supervised ? 0.05 : 0));
  const loanAppeal = Math.max(0.1, Math.min(1, Math.pow(model.marketLoanRate / Math.max(0.0001, biz.loanRate), 1.2)));
  const loanDemand = (biz.deposits + biz.reserve) * 0.85 * loanAppeal * (0.6 + Math.min(2, analysts.count) * 0.2);
  const risk = model.baseDefaultRate * (0.4 + stats.crime / 100 + stats.corruption / 200) * (biz.loanRate / model.marketLoanRate > 1.5 ? 1.5 : 1) * Math.max(0.4, 1 - analysts.skill / 150) * (2 - crisisFactors(state).demand);
  return {
    limit,
    inflow,
    outflow,
    loanDemand,
    dailyInterestIncome: biz.loansOut * biz.loanRate,
    dailyInterestCost: biz.deposits * biz.depositRate,
    expectedDefaults: biz.loansOut * risk,
    reserveRatio: biz.deposits > 0 ? biz.reserve / biz.deposits : 1,
  };
}

export function setBankRates(state: GameState, buildingId: number, depositRate: number, loanRate: number): { ok: true } | { ok: false; error: string } {
  const bank = bankOf(state, buildingId);
  if (!bank) return { ok: false, error: 'Keine eigene Bank.' };
  if (!Number.isFinite(depositRate) || !Number.isFinite(loanRate)) return { ok: false, error: 'Ungültiger Zinssatz.' };
  const d = Math.max(BANK_RATE_BOUNDS.deposit.min, Math.min(BANK_RATE_BOUNDS.deposit.max, depositRate));
  const l = Math.max(BANK_RATE_BOUNDS.loan.min, Math.min(BANK_RATE_BOUNDS.loan.max, loanRate));
  if (l <= d) return { ok: false, error: 'Der Kreditzins muss über dem Einlagenzins liegen.' };
  bank.biz.depositRate = Math.round(d * 1e6) / 1e6;
  bank.biz.loanRate = Math.round(l * 1e6) / 1e6;
  return { ok: true };
}

/** Moves capital between the player's ledger and the bank's reserve (positive = pay in). */
export function bankCapital(ctx: SimContext, buildingId: number, amount: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const bank = bankOf(state, buildingId);
  if (!bank) return { ok: false, error: 'Keine eigene Bank.' };
  const { b, biz } = bank;
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value === 0) return { ok: false, error: 'Betrag fehlt.' };
  if (value > 0) {
    if (!canAfford(state, value)) return { ok: false, error: `Nicht genug Credits (${value} ¢).` };
    book(state, events, -value, { category: 'capital', description: `Kapital eingezahlt: ${b.label}`, buildingId: b.id });
    biz.reserve += value;
    return { ok: true };
  }
  const withdraw = -value;
  const minReserve = Math.max(0, Math.ceil(biz.deposits * RESERVE_RATIO), Math.ceil(biz.loansOut - biz.deposits));
  const free = biz.reserve - minReserve;
  if (withdraw > free) return { ok: false, error: `Höchstens ${Math.max(0, free)} ¢ sind frei; der Rest deckt Einlagen (${Math.round(RESERVE_RATIO * 100)} %) und ausgereichte Kredite.` };
  biz.reserve -= withdraw;
  book(state, events, withdraw, { category: 'capital', description: `Kapital entnommen: ${b.label}`, buildingId: b.id });
  return { ok: true };
}

/** What closing the bank pays out: reserve plus loans sold at a discount, minus deposits owed. */
export function bankClosingValue(biz: BankState): number {
  return Math.round(biz.reserve + biz.loansOut * 0.9 - biz.deposits);
}

export function closeBanksDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'bank') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'bank') continue;
    const biz = b.business;
    const outlook = explainBank(state, b)!;
    const utilization = outlook.limit > 0 ? biz.deposits / outlook.limit : 1;
    const wages = closeStaffDay(ctx, b, Math.min(1, utilization));

    // Deposits move with rates, reputation and staff; bounded by the balance sheet.
    const inflow = outlook.inflow * rng.range(0.85, 1.15);
    const outflow = outlook.outflow * rng.range(0.85, 1.15);
    biz.deposits = Math.max(0, Math.min(outlook.limit, biz.deposits + inflow - outflow));
    // Loans follow demand with a lag; never more than deposits plus reserve.
    const target = Math.min(outlook.loanDemand, (biz.deposits + biz.reserve) * 0.9);
    biz.loansOut = Math.max(0, biz.loansOut + (target - biz.loansOut) * 0.25);

    const interestIncome = Math.round(biz.loansOut * biz.loanRate * 100) / 100;
    const interestCost = Math.round(biz.deposits * biz.depositRate * 100) / 100;
    const defaults = Math.round(outlook.expectedDefaults * rng.range(0.5, 1.5) * 100) / 100;
    biz.loansOut = Math.max(0, biz.loansOut - defaults);
    if (interestIncome > 0) book(state, events, interestIncome, { category: 'interest', description: `Kreditzinsen: ${b.label}`, buildingId: b.id });
    if (interestCost > 0) book(state, events, -interestCost, { category: 'interest', description: `Einlagenzinsen: ${b.label}`, buildingId: b.id });
    if (defaults > 0) book(state, events, -defaults, { category: 'other', description: `Kreditausfälle: ${b.label}`, buildingId: b.id });
    biz.todayRevenue += interestIncome;
    biz.todayCosts += interestCost + defaults;
    biz.todayDefaults += defaults;

    // Supervision: the reserve has to cover a share of the deposits.
    const wasSupervised = biz.supervised;
    biz.supervised = biz.deposits > 0 && biz.reserve < biz.deposits * RESERVE_RATIO;
    if (biz.supervised && !wasSupervised) {
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: Die Bankenaufsicht stoppt neue Einlagen, die Rücklage liegt unter ${Math.round(RESERVE_RATIO * 100)} % der Einlagen. Zahle Kapital ein.`, buildingId: String(b.id) });
    }
    // Reputation: fair deposit rates and a solid reserve build trust; defaults and supervision cost it.
    const trustTarget = 45 + (biz.depositRate / model.marketDepositRate - 1) * 15 + Math.min(15, (outlook.reserveRatio - RESERVE_RATIO) * 40) - (biz.supervised ? 25 : 0) - (defaults > interestIncome * 0.5 ? 10 : 0) + (biz.upgrades.security ?? 0) * 4;
    biz.reputation = Math.max(0, Math.min(100, biz.reputation + (trustTarget - biz.reputation) * 0.15));

    const costs = wages + effectiveUpkeep(b) + biz.todayCosts;
    biz.lifetimeProfit += biz.todayRevenue - costs;
    biz.history.push({ day, deposits: Math.round(biz.deposits), loansOut: Math.round(biz.loansOut), revenue: biz.todayRevenue, costs, defaults: biz.todayDefaults });
    if (biz.history.length > 60) biz.history.splice(0, biz.history.length - 60);
    biz.todayRevenue = 0;
    biz.todayCosts = 0;
    biz.todayDefaults = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.bank!);
  }
}
