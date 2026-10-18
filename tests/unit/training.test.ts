import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement, quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import { TRAINING_COURSES, dailySelfImprovement, trainingCost, trainingGain } from '../../src/sim/data/training';
import { effectiveCapacity } from '../../src/sim/systems/business';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import type { Building, GastronomyState } from '../../src/sim/state';

const options: NewGameOptions = { progression: false, seed: 'training', playerName: 'Chefin', difficulty: 'standard', background: 'restaurateur', citySize: 96 };

function openBar(sim: Simulation): Building {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (checkPlacement(sim.state, 'ramen_bar', x, y).ok) {
        const q = quotePlacement(sim.state, BUILDING_DEFINITIONS.ramen_bar!, grid.districtAt(x, y));
        sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y });
        sim.run(q.buildTime);
        return Object.values(sim.state.buildings).find((b) => b.owner === 'player')!;
      }
  throw new Error('no lot');
}

describe('Staff training and self-improvement', () => {
  it('a course costs money, takes the employee off the floor and raises skill and morale when it ends', () => {
    const sim = new Simulation(createNewGame(options));
    const b = openBar(sim);
    const biz = b.business as GastronomyState;
    const cook = biz.employees.find((e) => e.role === 'cook')!;
    const skill = cook.skill;
    const morale = cook.morale;
    const capBefore = effectiveCapacity(b, sim.state)!.cookThroughput;
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'trainEmployee', buildingId: b.id, employeeId: cook.id, courseId: 'seminar' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(balance - trainingCost(TRAINING_COURSES.seminar!, skill));
    expect(cook.training?.courseId).toBe('seminar');
    expect(effectiveCapacity(b, sim.state)!.cookThroughput).toBeLessThan(capBefore); // away at the course
    expect(sim.apply({ type: 'trainEmployee', buildingId: b.id, employeeId: cook.id, courseId: 'workshop' }).ok).toBe(false);
    sim.run(MINUTES_PER_DAY * 4);
    expect(cook.training).toBeUndefined();
    expect(cook.skill).toBeGreaterThanOrEqual(skill + trainingGain(TRAINING_COURSES.seminar!, skill));
    expect(cook.morale).not.toBe(morale);
    expect(sim.state.log.some((l) => l.message.includes('Fachseminar abgeschlossen'))).toBe(true);
  });

  it('the master class needs experience; money is checked', () => {
    const sim = new Simulation(createNewGame(options));
    const b = openBar(sim);
    const e = (b.business as GastronomyState).employees[0]!;
    e.skill = 30;
    expect(sim.apply({ type: 'trainEmployee', buildingId: b.id, employeeId: e.id, courseId: 'master' }).ok).toBe(false);
    e.skill = 60;
    sim.state.ledger.balance = 10;
    expect(sim.apply({ type: 'trainEmployee', buildingId: b.id, employeeId: e.id, courseId: 'master' }).ok).toBe(false);
    expect(e.training).toBeUndefined();
  });

  it('employees improve on their own only with morale above 50, faster when happier', () => {
    expect(dailySelfImprovement(40, 50, false)).toBe(0);
    expect(dailySelfImprovement(40, 30, true)).toBe(0);
    expect(dailySelfImprovement(40, 90, false)).toBeGreaterThan(dailySelfImprovement(40, 60, false));
    expect(dailySelfImprovement(40, 80, true)).toBeGreaterThan(dailySelfImprovement(40, 80, false));
    expect(dailySelfImprovement(95, 90, false)).toBeLessThan(dailySelfImprovement(20, 90, false));
    const sim = new Simulation(createNewGame(options));
    const b = openBar(sim);
    const [happy, sad] = (b.business as GastronomyState).employees;
    happy!.wage = 400; // generous pay keeps morale high
    sad!.wage = 20; // underpaid: morale falls
    const s0 = happy!.skill;
    const t0 = sad!.skill;
    sim.run(MINUTES_PER_DAY * 6);
    expect(happy!.morale).toBeGreaterThan(50);
    expect(happy!.skill).toBeGreaterThan(s0);
    expect(sad!.morale).toBeLessThanOrEqual(50);
    expect(sad!.skill).toBeLessThan(t0 + 0.3);
  });
});
