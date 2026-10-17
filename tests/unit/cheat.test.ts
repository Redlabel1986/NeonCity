import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement, quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import { CHEAT_RAMEN_DAILY_PROFIT, CHEAT_RAMEN_NAME, isCheatRamenBar } from '../../src/sim/systems/business';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import type { Building, GastronomyState } from '../../src/sim/state';

const options: NewGameOptions = { seed: 'cheat-seed', playerName: 'Cheater', difficulty: 'standard', background: 'restaurateur', citySize: 48 };

function openRamenBar(sim: Simulation): Building {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (checkPlacement(sim.state, 'ramen_bar', x, y).ok) {
        const quote = quotePlacement(sim.state, BUILDING_DEFINITIONS.ramen_bar!, grid.districtAt(x, y));
        expect(sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y }).ok).toBe(true);
        sim.run(quote.buildTime);
        const b = Object.values(sim.state.buildings).find((c) => c.owner === 'player')!;
        expect(b.status).toBe('operational');
        return b;
      }
  throw new Error('no lot');
}

function dayProfit(b: Building): number {
  const biz = b.business as GastronomyState;
  const last = biz.history[biz.history.length - 1]!;
  return last.revenue - last.costs;
}

describe('Cheat: ramen bar named McNoodle69', () => {
  it('closes every day with exactly +10.000 ¢ while it carries the name, and stops when renamed back', () => {
    const sim = new Simulation(createNewGame(options));
    const b = openRamenBar(sim);
    expect(isCheatRamenBar(b)).toBe(false);
    expect(sim.apply({ type: 'rename', buildingId: b.id, label: ' mcnoodle69 ' }).ok).toBe(true);
    expect(isCheatRamenBar(b)).toBe(true);
    expect(b.label).toBe('mcnoodle69');
    sim.drainEvents();
    const before = sim.state.ledger.balance;
    sim.run(MINUTES_PER_DAY);
    const events = sim.drainEvents();
    expect(dayProfit(b)).toBeCloseTo(CHEAT_RAMEN_DAILY_PROFIT, 2);
    const bonus = sim.state.ledger.transactions.filter((t) => t.description === `Geheimrezept: ${b.label}`);
    expect(bonus.length).toBe(1);
    expect(bonus[0]!.category).toBe('sales');
    expect(events.some((e) => e.type === 'log' && e.message.includes('Geheimrezept'))).toBe(true);
    // The player really got the money: balance moved by at least the bar's profit minus rent and other player costs.
    const rent = sim.state.player.apartmentRent;
    expect(sim.state.ledger.balance - before).toBeGreaterThan(CHEAT_RAMEN_DAILY_PROFIT - rent - 2000);
    // Second day: still exactly the cheat profit.
    sim.run(MINUTES_PER_DAY);
    expect(dayProfit(b)).toBeCloseTo(CHEAT_RAMEN_DAILY_PROFIT, 2);

    // Renamed back: ordinary results again, no bonus bookings.
    expect(sim.apply({ type: 'rename', buildingId: b.id, label: 'Ramen Nakamura' }).ok).toBe(true);
    const count = sim.state.ledger.transactions.filter((t) => t.description.startsWith('Geheimrezept')).length;
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.ledger.transactions.filter((t) => t.description.startsWith('Geheimrezept')).length).toBe(count);
    expect(dayProfit(b)).not.toBeCloseTo(CHEAT_RAMEN_DAILY_PROFIT, 0);
  });

  it('only works for ramen bars', () => {
    expect(isCheatRamenBar({ defId: 'kiosk', label: CHEAT_RAMEN_NAME } as Building)).toBe(false);
    expect(isCheatRamenBar({ defId: 'ramen_bar', label: 'McNoodle68' } as Building)).toBe(false);
    expect(isCheatRamenBar({ defId: 'ramen_bar', label: 'MCNOODLE69' } as Building)).toBe(true);
  });
});
