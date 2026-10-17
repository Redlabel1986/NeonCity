import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { collectEvents, describeElapsed, emptyReport, ticksForElapsed, NOTABLE_LIMIT } from '../../src/sim/catchup';

const options: NewGameOptions = { seed: 'catchup', playerName: 'Rückkehrer', difficulty: 'standard', background: 'restaurateur', citySize: 40 };

describe('Offline progress (catch-up)', () => {
  it('turns elapsed real time into ticks at the game speed and respects the cap', () => {
    expect(ticksForElapsed(60_000, 1, 3)).toEqual({ ticks: 120, capped: false }); // one real minute = two game hours at 1×
    expect(ticksForElapsed(60_000, 3, 3)).toEqual({ ticks: 360, capped: false });
    expect(ticksForElapsed(8 * 3600_000, 1, 3)).toEqual({ ticks: 3 * MINUTES_PER_DAY, capped: true }); // a night is capped to three days
    expect(ticksForElapsed(8 * 3600_000, 1, 0)).toEqual({ ticks: 0, capped: false }); // feature off
    expect(ticksForElapsed(8 * 3600_000, 0, 7)).toEqual({ ticks: 0, capped: false }); // paused games stay paused
    expect(ticksForElapsed(-5, 1, 7).ticks).toBe(0);
    expect(describeElapsed(5 * 60_000)).toBe('5 Min.');
    expect(describeElapsed(135 * 60_000)).toBe('2 Std. 15 Min.');
    expect(describeElapsed(50 * 3600_000)).toBe('2 Tage 2 Std.');
  });

  it('reports exactly what the engine produced while away: days, income, expenses, buildings, notable lines', () => {
    const sim = new Simulation(createNewGame(options));
    const { grid } = sim.state;
    outer: for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (checkPlacement(sim.state, 'food_stand', x, y).ok) {
          expect(sim.apply({ type: 'placeBuilding', defId: 'food_stand', x, y }).ok).toBe(true);
          break outer;
        }
    sim.drainEvents();
    const startBalance = sim.state.ledger.balance;
    const { ticks, capped } = ticksForElapsed(3 * 3600_000, 1, 2); // three real hours, capped to two days
    expect(capped).toBe(true);
    expect(ticks).toBe(2 * MINUTES_PER_DAY);
    const report = emptyReport(3 * 3600_000, sim.world.tick, startBalance, capped);
    let done = 0;
    const slice = 240;
    while (done < ticks) {
      const n = Math.min(slice, ticks - done);
      sim.run(n);
      collectEvents(report, sim.drainEvents());
      done += n;
    }
    report.ticks = done;
    report.endTick = sim.world.tick;
    report.endBalance = sim.state.ledger.balance;
    expect(report.endTick - report.startTick).toBe(2 * MINUTES_PER_DAY);
    expect(report.days).toBe(2);
    expect(report.completedBuildings).toBe(1);
    expect(report.income).toBeGreaterThan(0);
    expect(report.expenses).toBeGreaterThan(0);
    // The ledger moved by exactly the reported net (bookings are rounded to cents).
    expect(report.endBalance - report.startBalance).toBeCloseTo(report.income - report.expenses, 1);
    expect(report.notable.length).toBeGreaterThan(0);
    expect(report.notable.length).toBeLessThanOrEqual(NOTABLE_LIMIT);
    expect(report.notable.every((n) => ['warning', 'danger', 'success'].includes(n.level))).toBe(true);
  });
});
