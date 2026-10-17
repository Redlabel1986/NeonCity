/**
 * Casino games: slots, roulette and blackjack played with the player's own
 * credits. Stakes are booked as expenses when placed and winnings as income
 * when the round ends, so every credit shows up in the ledger.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { CasinoState, GameState } from '../state';
import { book, canAfford, isUnlimitedMoney } from '../economy/finance';
import {
  BLACKJACK_PAYOUT,
  CASINO_NAME,
  DEALER_STANDS_AT,
  MAX_BET,
  MIN_BET,
  SLOT_SYMBOLS,
  handValue,
  isBlackjack,
  rouletteReturn,
  slotPayout,
  validRouletteBet,
  type Card,
  type RouletteBet,
  type SlotSymbol,
} from '../data/casino';

export function createCasinoState(): CasinoState {
  return { blackjack: null, lastSlots: null, lastRoulette: null, stats: { rounds: 0, wagered: 0, returned: 0, biggestWin: 0 }, history: [] };
}

type Result = { ok: true } | { ok: false; error: string };

function checkStake(state: GameState, amount: number, label: string): string | null {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return 'Der Einsatz muss eine ganze Zahl sein.';
  if (amount < MIN_BET) return `Mindesteinsatz ${MIN_BET} ¢.`;
  if (amount > MAX_BET) return `Höchsteinsatz ${MAX_BET} ¢ je ${label}.`;
  if (!canAfford(state, amount)) return 'Nicht genug Credits für diesen Einsatz.';
  return null;
}

function record(state: GameState, game: CasinoState['history'][number]['game'], wagered: number, returned: number, text: string): void {
  const casino = state.casino;
  casino.stats.rounds++;
  casino.stats.wagered += wagered;
  casino.stats.returned += returned;
  casino.stats.biggestWin = Math.max(casino.stats.biggestWin, returned - wagered);
  casino.history.unshift({ tick: state.tick, game, wagered, returned, text });
  if (casino.history.length > 20) casino.history.length = 20;
}

function drawSymbol(rng: Rng): SlotSymbol {
  let roll = rng.next() * 100;
  for (const s of SLOT_SYMBOLS) {
    roll -= s.weight;
    if (roll < 0) return s.id;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]!.id;
}

/** One pull of the slot machine. */
export function playSlots(ctx: SimContext, bet: number): Result {
  const { state, events, rng } = ctx;
  if (state.casino.blackjack && state.casino.blackjack.phase === 'player') return { ok: false, error: 'Beende zuerst die laufende Blackjack-Hand.' };
  const error = checkStake(state, bet, 'Dreh');
  if (error) return { ok: false, error };
  book(state, events, -bet, { category: 'gambling', description: `${CASINO_NAME}: Einsatz Slots` });
  const reels: SlotSymbol[] = [drawSymbol(rng), drawSymbol(rng), drawSymbol(rng)];
  const multiplier = slotPayout(reels);
  const payout = Math.round(bet * multiplier);
  if (payout > 0) book(state, events, payout, { category: 'gambling', description: `${CASINO_NAME}: Gewinn Slots (×${multiplier})` });
  state.casino.lastSlots = { reels, bet, payout, tick: state.tick };
  record(state, 'slots', bet, payout, payout > 0 ? `Slots: ${reels.join(' ')} → ${payout} ¢` : `Slots: ${reels.join(' ')} → nichts`);
  return { ok: true };
}

/** One spin of the roulette wheel with any number of bets. */
export function playRoulette(ctx: SimContext, bets: RouletteBet[]): Result {
  const { state, events, rng } = ctx;
  if (!Array.isArray(bets) || bets.length === 0) return { ok: false, error: 'Setze mindestens eine Wette.' };
  if (bets.length > 12) return { ok: false, error: 'Höchstens zwölf Wetten je Drehung.' };
  for (const b of bets) {
    const invalid = validRouletteBet(b);
    if (invalid) return { ok: false, error: invalid };
    if (!Number.isInteger(b.amount)) return { ok: false, error: 'Einsätze müssen ganze Zahlen sein.' };
  }
  const total = bets.reduce((s, b) => s + b.amount, 0);
  if (total > MAX_BET) return { ok: false, error: `Höchstens ${MAX_BET} ¢ je Drehung insgesamt.` };
  if (!canAfford(state, total)) return { ok: false, error: 'Nicht genug Credits für diese Einsätze.' };
  book(state, events, -total, { category: 'gambling', description: `${CASINO_NAME}: Einsatz Roulette (${bets.length} Wetten)` });
  const number = rng.int(0, 36);
  let payout = 0;
  for (const b of bets) payout += rouletteReturn(b, number);
  payout = Math.round(payout);
  if (payout > 0) book(state, events, payout, { category: 'gambling', description: `${CASINO_NAME}: Gewinn Roulette (${number})` });
  state.casino.lastRoulette = { number, bets, payout, tick: state.tick };
  record(state, 'roulette', total, payout, `Roulette: ${number} → ${payout > 0 ? `${payout} ¢` : 'nichts'}`);
  return { ok: true };
}

function drawCard(rng: Rng): Card {
  return { rank: rng.int(1, 13), suit: rng.int(0, 3) };
}

/** Deals a new blackjack hand; the stake is taken immediately. */
export function blackjackDeal(ctx: SimContext, bet: number): Result {
  const { state, events, rng } = ctx;
  const current = state.casino.blackjack;
  if (current && current.phase === 'player') return { ok: false, error: 'Es läuft bereits eine Hand.' };
  const error = checkStake(state, bet, 'Hand');
  if (error) return { ok: false, error };
  book(state, events, -bet, { category: 'gambling', description: `${CASINO_NAME}: Einsatz Blackjack` });
  const player = [drawCard(rng), drawCard(rng)];
  const dealer = [drawCard(rng), drawCard(rng)];
  state.casino.blackjack = { bet, player, dealer, doubled: false, phase: 'player', outcome: null, payout: 0 };
  if (isBlackjack(player) || isBlackjack(dealer)) settle(ctx);
  return { ok: true };
}

export function blackjackHit(ctx: SimContext): Result {
  const { state, rng } = ctx;
  const hand = state.casino.blackjack;
  if (!hand || hand.phase !== 'player') return { ok: false, error: 'Keine laufende Hand.' };
  hand.player.push(drawCard(rng));
  if (handValue(hand.player).total >= 21) settle(ctx);
  return { ok: true };
}

export function blackjackStand(ctx: SimContext): Result {
  const hand = ctx.state.casino.blackjack;
  if (!hand || hand.phase !== 'player') return { ok: false, error: 'Keine laufende Hand.' };
  settle(ctx);
  return { ok: true };
}

/** Doubles the stake, takes exactly one more card and stands. */
export function blackjackDouble(ctx: SimContext): Result {
  const { state, events, rng } = ctx;
  const hand = state.casino.blackjack;
  if (!hand || hand.phase !== 'player') return { ok: false, error: 'Keine laufende Hand.' };
  if (hand.player.length !== 2) return { ok: false, error: 'Verdoppeln geht nur mit den ersten beiden Karten.' };
  if (!canAfford(state, hand.bet)) return { ok: false, error: 'Nicht genug Credits zum Verdoppeln.' };
  book(state, events, -hand.bet, { category: 'gambling', description: `${CASINO_NAME}: Verdoppeln Blackjack` });
  hand.bet *= 2;
  hand.doubled = true;
  hand.player.push(drawCard(rng));
  settle(ctx);
  return { ok: true };
}

/** Dealer plays out and the hand is paid. */
function settle(ctx: SimContext): void {
  const { state, events, rng } = ctx;
  const hand = state.casino.blackjack!;
  const player = handValue(hand.player).total;
  const playerBj = isBlackjack(hand.player);
  const dealerBj = isBlackjack(hand.dealer);
  if (player <= 21 && !playerBj && !dealerBj) {
    while (handValue(hand.dealer).total < DEALER_STANDS_AT) hand.dealer.push(drawCard(rng));
  }
  const dealer = handValue(hand.dealer).total;
  let outcome: NonNullable<typeof hand.outcome>;
  let payout = 0;
  if (playerBj && dealerBj) {
    outcome = 'push';
    payout = hand.bet;
  } else if (playerBj) {
    outcome = 'blackjack';
    payout = Math.round(hand.bet * (1 + BLACKJACK_PAYOUT));
  } else if (dealerBj || player > 21) {
    outcome = 'lose';
  } else if (dealer > 21 || player > dealer) {
    outcome = 'win';
    payout = hand.bet * 2;
  } else if (player === dealer) {
    outcome = 'push';
    payout = hand.bet;
  } else {
    outcome = 'lose';
  }
  hand.phase = 'done';
  hand.outcome = outcome;
  hand.payout = payout;
  if (payout > 0) book(state, events, payout, { category: 'gambling', description: `${CASINO_NAME}: ${outcome === 'push' ? 'Einsatz zurück' : 'Gewinn'} Blackjack` });
  const text = outcome === 'blackjack' ? `Blackjack! ${payout} ¢` : outcome === 'win' ? `Blackjack gewonnen (${player} gegen ${dealer}): ${payout} ¢` : outcome === 'push' ? `Blackjack unentschieden (${player})` : `Blackjack verloren (${player > 21 ? 'überkauft' : `${player} gegen ${dealer}`})`;
  record(state, 'blackjack', hand.bet, payout, text);
}

/** Net result of all casino play so far (negative = the house won). */
export function casinoNet(state: GameState): number {
  return state.casino.stats.returned - state.casino.stats.wagered;
}

export { isUnlimitedMoney };
