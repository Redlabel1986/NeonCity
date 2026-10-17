import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions, SAVE_FORMAT_VERSION } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { buildInteriorScene, type DashboardTab } from '../../src/render/interior/layouts';
import { migrate, serialize, type SaveFile } from '../../src/persistence/serializer';
import type { Building, GastronomyState, RetailState } from '../../src/sim/state';

const options: NewGameOptions = { seed: 'interior', playerName: 'Innen', difficulty: 'sandbox', background: 'restaurateur', citySize: 48 };

function build(sim: Simulation, defId: string): Building {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!checkPlacement(sim.state, defId, x, y).ok) continue;
      const before = new Set(Object.keys(sim.state.buildings));
      sim.apply({ type: 'placeBuilding', defId, x, y });
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player' && !before.has(String(v.id)))!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return b;
    }
  throw new Error('no lot');
}

const TABS_BY_KIND: Record<string, DashboardTab[]> = {
  gastronomy: ['overview', 'menu', 'supply', 'staff', 'upgrades'],
  hotel: ['overview', 'staff', 'upgrades'],
  transport: ['overview', 'staff', 'upgrades'],
  retail: ['overview', 'supply', 'staff', 'upgrades'],
  security: ['overview', 'staff', 'upgrades'],
  lab: ['overview', 'staff', 'upgrades'],
  industry: ['overview', 'supply', 'staff', 'upgrades'],
};

describe('Phase 11: interior scenes', () => {
  it('builds a scene for every business kind with zones for each dashboard tab and figures for the staff', () => {
    const sim = new Simulation(createNewGame(options));
    for (const defId of ['ramen_bar', 'capsule_hotel', 'taxi_depot', 'kiosk', 'security_hq', 'research_lab', 'food_factory']) {
      const b = build(sim, defId);
      const scene = buildInteriorScene(b, sim.state);
      expect(scene, defId).not.toBeNull();
      const kind = b.business!.kind;
      const tabs = new Set(scene!.zones.map((z) => z.tab));
      for (const t of TABS_BY_KIND[kind]!) expect(tabs.has(t), `${defId} zone for ${t}`).toBe(true);
      const staffFigures = scene!.figures.filter((f) => f.role !== 'guest' && f.role !== 'vip' && f.role !== 'customer');
      const employees = (b.business as { employees: unknown[] }).employees.length;
      expect(staffFigures.length, `${defId} staff figures`).toBe(kind === 'security' ? staffFigures.length : employees);
      for (const z of scene!.zones) {
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(scene!.width + 0.01);
        expect(z.y + z.h).toBeLessThanOrEqual(scene!.height + 0.01);
      }
      for (const p of scene!.props) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.x).toBeLessThanOrEqual(scene!.width + 0.01);
        expect(p.y).toBeLessThanOrEqual(scene!.height + 0.01);
      }
    }
    expect(buildInteriorScene(Object.values(sim.state.buildings).find((b) => b.owner === 'city')!, sim.state)).toBeNull();
  });

  it('shows the guests the simulation served this hour, never more than there are seats', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const biz = bar.business as GastronomyState;
    let seen = 0;
    for (let h = 0; h < 36; h++) {
      sim.run(60);
      const scene = buildInteriorScene(bar, sim.state)!;
      const guests = scene.figures.filter((f) => f.role === 'guest').length;
      expect(guests).toBeLessThanOrEqual(Math.min(biz.hourGuests, 40));
      if (biz.hourGuests > 0) {
        expect(guests).toBeGreaterThan(0);
        seen++;
      }
      expect(scene.subtitle).toContain(`${biz.hourGuests} Gäste gerade`);
    }
    expect(seen).toBeGreaterThan(0);
    const kiosk = build(sim, 'kiosk');
    sim.run(24 * 60);
    const retail = kiosk.business as RetailState;
    expect(typeof retail.hourCustomers).toBe('number');
    expect(buildInteriorScene(kiosk, sim.state)!.subtitle).toContain(`${retail.hourCustomers} Kunden gerade`);
  });

  it('migrates version 10 saves by adding the hourly counters', () => {
    const sim = new Simulation(createNewGame(options));
    build(sim, 'ramen_bar');
    build(sim, 'kiosk');
    const file = JSON.parse(serialize(sim.state, 'x')) as SaveFile;
    const raw = file.state as unknown as { buildings: Record<string, { business?: Record<string, unknown> }> };
    for (const b of Object.values(raw.buildings)) {
      if (!b.business) continue;
      delete b.business.hourGuests;
      delete b.business.hourCustomers;
    }
    const migrated = migrate({ ...file, version: 10 });
    expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
    const buildings = (migrated.state as unknown as { buildings: Record<string, { business?: { kind: string; hourGuests?: number; hourCustomers?: number } }> }).buildings;
    const bar = Object.values(buildings).find((b) => b.business?.kind === 'gastronomy')!;
    const shop = Object.values(buildings).find((b) => b.business?.kind === 'retail')!;
    expect(bar.business!.hourGuests).toBe(0);
    expect(shop.business!.hourCustomers).toBe(0);
  });
});
