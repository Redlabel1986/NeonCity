/**
 * Royal Nova Casino: rules and paytables. Every outcome is drawn from the
 * simulation's seeded random generator, so results are deterministic and
 * identical on every client of an online world.
 */

export const CASINO_NAME = 'Royal Nova Casino';
export const MIN_BET = 10;
export const MAX_BET = 5000;

// ---------------------------------------------------------------- slots

export type SlotSymbol = 'cherry' | 'lemon' | 'bell' | 'bar' | 'seven' | 'neon' | 'diamond';

export interface SlotSymbolDef {
  id: SlotSymbol;
  label: string;
  glyph: string;
  /** Weight on each reel (all weights sum to 100). */
  weight: number;
  /** Payout multiplier for three of a kind. */
  triple: number;
}

export const SLOT_SYMBOLS: readonly SlotSymbolDef[] = [
  { id: 'cherry', label: 'Kirsche', glyph: '🍒', weight: 30, triple: 3 },
  { id: 'lemon', label: 'Zitrone', glyph: '🍋', weight: 25, triple: 4 },
  { id: 'bell', label: 'Glocke', glyph: '🔔', weight: 18, triple: 6 },
  { id: 'bar', label: 'Bar', glyph: '▬', weight: 12, triple: 10 },
  { id: 'seven', label: 'Sieben', glyph: '7', weight: 8, triple: 20 },
  { id: 'neon', label: 'Neon', glyph: '◈', weight: 5, triple: 40 },
  { id: 'diamond', label: 'Diamant', glyph: '◆', weight: 2, triple: 100 },
];

/** Multiplier for exactly two cherries (any positions). */
export const SLOT_TWO_CHERRIES = 2;
/** Multiplier for any other pair (stake returned). */
export const SLOT_PAIR = 1;

/** Payout multiplier of a reel result (0 = lost). */
export function slotPayout(reels: readonly SlotSymbol[]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return SLOT_SYMBOLS.find((s) => s.id === a)!.triple;
  const cherries = reels.filter((r) => r === 'cherry').length;
  if (cherries === 2) return SLOT_TWO_CHERRIES;
  if (a === b || b === c || a === c) return SLOT_PAIR;
  return 0;
}

/** Exact return-to-player of the slot machine (sum over all reel combinations). */
export function slotReturnToPlayer(): number {
  let rtp = 0;
  for (const a of SLOT_SYMBOLS)
    for (const b of SLOT_SYMBOLS)
      for (const c of SLOT_SYMBOLS) {
        const p = (a.weight / 100) * (b.weight / 100) * (c.weight / 100);
        rtp += p * slotPayout([a.id, b.id, c.id]);
      }
  return rtp;
}

// ---------------------------------------------------------------- roulette

export type RouletteBetKind = 'straight' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'dozen' | 'column';

export interface RouletteBet {
  kind: RouletteBetKind;
  /** Number for straight bets (0-36), 1-3 for dozen and column. */
  value?: number;
  amount: number;
}

export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const ROULETTE_BET_LABELS: Record<RouletteBetKind, string> = {
  straight: 'Zahl (35:1)',
  red: 'Rot (1:1)',
  black: 'Schwarz (1:1)',
  even: 'Gerade (1:1)',
  odd: 'Ungerade (1:1)',
  low: '1–18 (1:1)',
  high: '19–36 (1:1)',
  dozen: 'Dutzend (2:1)',
  column: 'Kolonne (2:1)',
};

/** Total returned for a winning bet including the stake (0 when lost). */
export function rouletteReturn(bet: RouletteBet, number: number): number {
  const win = (ratio: number): number => bet.amount * (ratio + 1);
  switch (bet.kind) {
    case 'straight':
      return bet.value === number ? win(35) : 0;
    case 'red':
      return ROULETTE_RED.has(number) ? win(1) : 0;
    case 'black':
      return number !== 0 && !ROULETTE_RED.has(number) ? win(1) : 0;
    case 'even':
      return number !== 0 && number % 2 === 0 ? win(1) : 0;
    case 'odd':
      return number % 2 === 1 ? win(1) : 0;
    case 'low':
      return number >= 1 && number <= 18 ? win(1) : 0;
    case 'high':
      return number >= 19 ? win(1) : 0;
    case 'dozen':
      return number !== 0 && Math.ceil(number / 12) === bet.value ? win(2) : 0;
    case 'column':
      return number !== 0 && ((number - 1) % 3) + 1 === bet.value ? win(2) : 0;
    default:
      return 0;
  }
}

export function validRouletteBet(bet: RouletteBet): string | null {
  if (!Number.isFinite(bet.amount) || bet.amount < MIN_BET) return `Mindesteinsatz ${MIN_BET} ¢ je Wette.`;
  if (bet.kind === 'straight' && (bet.value === undefined || !Number.isInteger(bet.value) || bet.value < 0 || bet.value > 36)) return 'Zahlenwette braucht eine Zahl von 0 bis 36.';
  if ((bet.kind === 'dozen' || bet.kind === 'column') && (bet.value === undefined || ![1, 2, 3].includes(bet.value))) return 'Dutzend und Kolonne brauchen 1, 2 oder 3.';
  if (!(bet.kind in ROULETTE_BET_LABELS)) return 'Unbekannte Wette.';
  return null;
}

// ---------------------------------------------------------------- blackjack

export interface Card {
  /** 1 = Ace, 11 = Jack, 12 = Queen, 13 = King. */
  rank: number;
  /** 0 spades, 1 hearts, 2 diamonds, 3 clubs. */
  suit: number;
}

export const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'] as const;

export function cardLabel(card: Card): string {
  const rank = card.rank === 1 ? 'A' : card.rank === 11 ? 'B' : card.rank === 12 ? 'D' : card.rank === 13 ? 'K' : String(card.rank);
  return `${rank}${SUIT_GLYPHS[card.suit]}`;
}

/** Best hand value (aces count 11 while that does not bust). */
export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Blackjack pays 3:2, dealer stands on every 17, no split, no insurance (documented in ECONOMY.md). */
export const BLACKJACK_PAYOUT = 1.5;
export const DEALER_STANDS_AT = 17;
