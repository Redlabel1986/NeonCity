import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions, SAVE_FORMAT_VERSION } from '../../src/sim/engine';
import { Rng } from '../../src/sim/core/rng';
import { ROULETTE_RED, handValue, rouletteReturn, slotPayout, slotReturnToPlayer, type RouletteBet } from '../../src/sim/data/casino';
import { deserialize, serialize } from '../../src/persistence/serializer';
import { withPlayer } from '../../src/sim/players';

const options: NewGameOptions = { progression: false, seed: 'casino', playerName: 'Spieler', difficulty: 'standard', background: 'restaurateur', citySize: 32 };

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

describe('Phase 13: Royal Nova Casino', () => {
  it('slot paytable returns about 87.5 % and roulette 97.3 % in the long run', () => {
    const rtp = slotReturnToPlayer();
    expect(rtp).toBeGreaterThan(0.85);
    expect(rtp).toBeLessThan(0.9);
    expect(slotPayout(['diamond', 'diamond', 'diamond'])).toBe(100);
    expect(slotPayout(['cherry', 'cherry', 'bar'])).toBe(2);
    expect(slotPayout(['bar', 'bell', 'bar'])).toBe(1);
    expect(slotPayout(['bar', 'bell', 'seven'])).toBe(0);
    // Every roulette bet kind returns 36/37 of the stake on average.
    const bets: RouletteBet[] = [
      { kind: 'straight', value: 17, amount: 37 },
      { kind: 'red', amount: 37 },
      { kind: 'black', amount: 37 },
      { kind: 'even', amount: 37 },
      { kind: 'odd', amount: 37 },
      { kind: 'low', amount: 37 },
      { kind: 'high', amount: 37 },
      { kind: 'dozen', value: 2, amount: 37 },
      { kind: 'column', value: 3, amount: 37 },
    ];
    for (const bet of bets) {
      let total = 0;
      for (let n = 0; n <= 36; n++) total += rouletteReturn(bet, n);
      expect(total / (37 * bet.amount)).toBeCloseTo(36 / 37, 5);
    }
    expect(ROULETTE_RED.size).toBe(18);
    expect(handValue([{ rank: 1, suit: 0 }, { rank: 13, suit: 1 }])).toEqual({ total: 21, soft: true });
    expect(handValue([{ rank: 1, suit: 0 }, { rank: 1, suit: 1 }, { rank: 9, suit: 2 }])).toEqual({ total: 21, soft: true });
    expect(handValue([{ rank: 10, suit: 0 }, { rank: 6, suit: 1 }, { rank: 8, suit: 2 }]).total).toBe(24);
  });

  it('books every stake and win through the ledger and refuses bets the player cannot cover', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    const start = state.ledger.balance;
    expect(sim.apply({ type: 'casinoSlots', bet: 5 }).ok).toBe(false);
    expect(sim.apply({ type: 'casinoSlots', bet: 999999 }).ok).toBe(false);
    expect(sim.apply({ type: 'casinoSlots', bet: 12.5 }).ok).toBe(false);
    let wagered = 0;
    let returned = 0;
    for (let i = 0; i < 300; i++) {
      expect(sim.apply({ type: 'casinoSlots', bet: 20 }).ok).toBe(true);
      wagered += 20;
      returned += state.casino.lastSlots!.payout;
    }
    expect(state.casino.stats.rounds).toBe(300);
    expect(state.casino.stats.wagered).toBe(wagered);
    expect(state.casino.stats.returned).toBe(returned);
    expect(state.ledger.balance).toBeCloseTo(start - wagered + returned, 2);
    const gambling = state.ledger.transactions.filter((t) => t.category === 'gambling');
    expect(gambling.length).toBeGreaterThan(0);
    // Over 300 spins the house keeps a visible share but not everything.
    expect(returned).toBeGreaterThan(wagered * 0.5);
    expect(returned).toBeLessThan(wagered * 1.3);
    // Roulette: a bet on every colour plus zero cannot lose more than the zero case.
    const before = state.ledger.balance;
    expect(sim.apply({ type: 'casinoRoulette', bets: [{ kind: 'red', amount: 100 }, { kind: 'black', amount: 100 }] }).ok).toBe(true);
    const r = state.casino.lastRoulette!;
    expect(r.payout).toBe(r.number === 0 ? 0 : 200);
    expect(state.ledger.balance).toBeCloseTo(before - 200 + r.payout, 2);
    expect(sim.apply({ type: 'casinoRoulette', bets: [] }).ok).toBe(false);
    expect(sim.apply({ type: 'casinoRoulette', bets: [{ kind: 'straight', value: 40, amount: 10 }] }).ok).toBe(false);
    expect(sim.apply({ type: 'casinoRoulette', bets: [{ kind: 'red', amount: 4000 }, { kind: 'black', amount: 4000 }] }).ok).toBe(false);
    // Broke players cannot play.
    state.ledger.balance = 5;
    expect(sim.apply({ type: 'casinoSlots', bet: 10 }).ok).toBe(false);
    expect(sim.apply({ type: 'blackjackDeal', bet: 10 }).ok).toBe(false);
  });

  it('plays blackjack by the rules: deal, hit, stand, double, payouts', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    expect(sim.apply({ type: 'blackjackHit' }).ok).toBe(false);
    let outcomes = { win: 0, lose: 0, push: 0, blackjack: 0 };
    let wagered = 0;
    let returned = 0;
    for (let i = 0; i < 200; i++) {
      const before = state.ledger.balance;
      expect(sim.apply({ type: 'blackjackDeal', bet: 50 }).ok).toBe(true);
      const hand = state.casino.blackjack!;
      expect(hand.player.length).toBe(2);
      expect(hand.dealer.length).toBe(2);
      if (hand.phase === 'player') {
        expect(sim.apply({ type: 'blackjackDeal', bet: 50 }).ok).toBe(false); // one hand at a time
        if (i % 5 === 0) expect(sim.apply({ type: 'blackjackDouble' }).ok).toBe(true);
        else {
          while (state.casino.blackjack!.phase === 'player' && handValue(state.casino.blackjack!.player).total < 17) expect(sim.apply({ type: 'blackjackHit' }).ok).toBe(true);
          if (state.casino.blackjack!.phase === 'player') expect(sim.apply({ type: 'blackjackStand' }).ok).toBe(true);
        }
      }
      const done = state.casino.blackjack!;
      expect(done.phase).toBe('done');
      expect(done.outcome).not.toBeNull();
      outcomes = { ...outcomes, [done.outcome!]: outcomes[done.outcome!] + 1 };
      const stake = done.bet;
      wagered += stake;
      returned += done.payout;
      expect(state.ledger.balance).toBeCloseTo(before - stake + done.payout, 2);
      const player = handValue(done.player).total;
      const dealer = handValue(done.dealer).total;
      if (done.outcome === 'lose') expect(player > 21 || (dealer <= 21 && dealer > player) || (done.dealer.length === 2 && dealer === 21 && !(done.player.length === 2 && player === 21))).toBe(true);
      if (done.outcome === 'win') expect(player <= 21 && (dealer > 21 || player > dealer)).toBe(true);
      if (done.outcome === 'push') expect(player === dealer).toBe(true);
      if (done.outcome === 'blackjack') expect(done.player.length === 2 && player === 21 && done.payout === Math.round(stake * 2.5)).toBe(true);
      if (done.outcome !== 'lose' && player <= 21 && !(done.player.length === 2 && player === 21)) expect(dealer >= 17 || dealer > 21 || (done.dealer.length === 2 && dealer === 21)).toBe(true);
    }
    expect(outcomes.win + outcomes.blackjack).toBeGreaterThan(40);
    expect(outcomes.lose).toBeGreaterThan(40);
    expect(returned).toBeGreaterThan(wagered * 0.7);
    expect(returned).toBeLessThan(wagered * 1.15);
  });

  it('is deterministic per seed and survives save, load and the v12 migration', () => {
    const a = new Simulation(createNewGame(options));
    const b = new Simulation(createNewGame(options));
    for (let i = 0; i < 20; i++) {
      a.apply({ type: 'casinoSlots', bet: 10 });
      b.apply({ type: 'casinoSlots', bet: 10 });
    }
    expect(a.state.casino.history.map((h) => h.text)).toEqual(b.state.casino.history.map((h) => h.text));
    a.apply({ type: 'blackjackDeal', bet: 100 });
    const file = serialize(a.world, 'x');
    const restored = withPlayer(deserialize(file).state, 'player');
    expect(restored.casino.blackjack).toEqual(a.state.casino.blackjack);
    expect(restored.casino.stats).toEqual(a.state.casino.stats);
    const raw = JSON.parse(file) as { version: number; state: { players: Record<string, Record<string, unknown>> } };
    delete raw.state.players.player!.casino;
    const migrated = deserialize(JSON.stringify({ ...raw, version: 12 })).state;
    expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
    expect(withPlayer(migrated, 'player').casino.stats.rounds).toBe(0);
    void Rng;
    void sum;
  });
});
