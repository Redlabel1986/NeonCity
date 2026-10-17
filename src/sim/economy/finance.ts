/**
 * Finance: the single place where credits change hands. Money never appears
 * without a transaction; every transaction has a category and description.
 */

import type { EventBus } from '../core/events';
import type { GameState, Ledger, TransactionCategory } from '../state';
import { BALANCE_HISTORY_LIMIT, TRANSACTION_LIMIT } from '../state';

export function createLedger(startingBalance: number): Ledger {
  return {
    balance: startingBalance,
    dirtyBalance: 0,
    transactions: [],
    todayIncome: 0,
    todayExpenses: 0,
    yesterdayIncome: 0,
    yesterdayExpenses: 0,
    balanceHistory: [{ day: 0, balance: startingBalance }],
    daysInDebt: 0,
  };
}

export function canAfford(state: GameState, amount: number): boolean {
  if (amount <= 0) return true;
  if (isUnlimitedMoney(state)) return true;
  return state.ledger.balance >= amount;
}

export function isUnlimitedMoney(state: GameState): boolean {
  return state.player.difficulty === 'sandbox';
}

export interface BookOptions {
  category: TransactionCategory;
  description: string;
  buildingId?: number;
}

/**
 * Books a transaction. Positive amounts are income, negative are expenses.
 * Expenses are always booked (running costs can push the balance negative);
 * discretionary spending must call `canAfford` first.
 */
export function book(state: GameState, events: EventBus, amount: number, opts: BookOptions): void {
  if (!Number.isFinite(amount)) throw new Error('book: amount must be finite');
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 0) return;
  const ledger = state.ledger;
  ledger.balance = Math.round((ledger.balance + rounded) * 100) / 100;
  if (rounded > 0) ledger.todayIncome += rounded;
  else ledger.todayExpenses += -rounded;
  ledger.transactions.push({
    tick: state.tick,
    amount: rounded,
    category: opts.category,
    description: opts.description,
    buildingId: opts.buildingId,
  });
  if (ledger.transactions.length > TRANSACTION_LIMIT) {
    ledger.transactions.splice(0, ledger.transactions.length - TRANSACTION_LIMIT);
  }
  events.emit({ type: 'finance:transaction', tick: state.tick, amount: rounded, category: opts.category });
}

/** Called at the day boundary: rolls daily totals and records balance history. */
export function closeDay(state: GameState, day: number): { income: number; expenses: number } {
  const ledger = state.ledger;
  const result = { income: ledger.todayIncome, expenses: ledger.todayExpenses };
  ledger.yesterdayIncome = ledger.todayIncome;
  ledger.yesterdayExpenses = ledger.todayExpenses;
  ledger.todayIncome = 0;
  ledger.todayExpenses = 0;
  ledger.balanceHistory.push({ day, balance: ledger.balance });
  if (ledger.balanceHistory.length > BALANCE_HISTORY_LIMIT) {
    ledger.balanceHistory.splice(0, ledger.balanceHistory.length - BALANCE_HISTORY_LIMIT);
  }
  ledger.daysInDebt = ledger.balance < 0 ? ledger.daysInDebt + 1 : 0;
  return result;
}
