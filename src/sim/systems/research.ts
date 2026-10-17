/**
 * Research: labs with researchers accumulate points towards a chosen node.
 * Unlocked nodes change multipliers read by the other systems via `hasTech`.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { LabModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { RESEARCH } from '../data/research';
import { BACKGROUNDS, DIFFICULTIES } from '../data/difficulty';
import { book, canAfford } from '../economy/finance';
import type { GameState, ResearchLabState, ResearchState } from '../state';
import { closeStaffDay, createEmployee, generateCandidates, effortOf, ROLES_BY_KIND } from './staff';

export function createResearchState(): ResearchState {
  return { unlocked: [], progress: {}, lifetimeSpent: 0 };
}

export function hasTech(state: GameState, id: string): boolean {
  return state.research?.unlocked.includes(id) ?? false;
}

export function createLabState(model: LabModel, rng: Rng, day: number, tick: number, districtSkillBias: number): ResearchLabState {
  const biz: ResearchLabState = {
    kind: 'lab',
    activeNodeId: null,
    progress: 0,
    reputation: 40,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayCosts: 0,
    history: [],
  };
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.lab!);
  return biz;
}

export function canResearch(state: GameState, nodeId: string): { ok: true } | { ok: false; error: string } {
  const node = RESEARCH[nodeId];
  if (!node) return { ok: false, error: 'Unbekannte Technologie.' };
  if (state.research.unlocked.includes(nodeId)) return { ok: false, error: `${node.name} ist bereits erforscht.` };
  for (const req of node.requires) if (!state.research.unlocked.includes(req)) return { ok: false, error: `${node.name} braucht zuerst ${RESEARCH[req]?.name}.` };
  return { ok: true };
}

/** Assigns a research node to a lab; the cost is paid when starting. */
export function startResearch(ctx: SimContext, buildingId: number, nodeId: string): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const b = state.buildings[buildingId];
  const biz = b?.business;
  if (!b || b.owner !== 'player' || !biz || biz.kind !== 'lab') return { ok: false, error: 'Kein eigenes Labor.' };
  if (b.status !== 'operational') return { ok: false, error: 'Das Labor ist noch im Bau.' };
  const check = canResearch(state, nodeId);
  if (!check.ok) return check;
  if (biz.activeNodeId === nodeId) return { ok: false, error: 'Dieses Labor forscht bereits daran.' };
  if (Object.values(state.buildings).some((x) => x.business?.kind === 'lab' && x.business.activeNodeId === nodeId)) return { ok: false, error: 'Ein anderes Labor forscht bereits daran.' };
  const node = RESEARCH[nodeId]!;
  const cost = Math.round(node.cost * DIFFICULTIES[state.player.difficulty].costMultiplier);
  if (!canAfford(state, cost)) return { ok: false, error: `Nicht genug Credits für ${node.name} (${cost} ¢).` };
  book(state, events, -cost, { category: 'research', description: `Forschung gestartet: ${node.name}`, buildingId: b.id });
  state.research.lifetimeSpent += cost;
  biz.activeNodeId = nodeId;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Forschung an ${node.name} gestartet (${node.points} Punkte nötig).`, buildingId: String(b.id) });
  return { ok: true };
}

export function labOutput(biz: ResearchLabState): number {
  let points = 0;
  for (const e of biz.employees) {
    if (e.role !== 'researcher') continue;
    points += (4 + e.skill / 8) * effortOf(e);
  }
  const technicians = biz.employees.filter((e) => e.role === 'technician').length;
  return points * (1 + Math.min(0.5, technicians * 0.15));
}

export function closeLabsDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player' || b.status !== 'operational' || b.business?.kind !== 'lab') continue;
    const biz = b.business;
    const wages = closeStaffDay(ctx, b, biz.activeNodeId ? 0.8 : 0.3);
    let points = 0;
    if (biz.activeNodeId) {
      const node = RESEARCH[biz.activeNodeId];
      if (!node || state.research.unlocked.includes(biz.activeNodeId)) biz.activeNodeId = null;
      else {
        points = Math.round(labOutput(biz) * (biz.upgradeInProgress ? 0.8 : 1) * (BACKGROUNDS[state.player.background].perks?.research ?? 1));
        state.research.progress[node.id] = (state.research.progress[node.id] ?? 0) + points;
        if ((state.research.progress[node.id] ?? 0) >= node.points) {
          state.research.unlocked.push(node.id);
          delete state.research.progress[node.id];
          biz.activeNodeId = null;
          biz.reputation = Math.min(100, biz.reputation + 5);
          events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Forschung abgeschlossen: ${node.name}. ${node.effect}.`, buildingId: String(b.id) });
          applyUnlockSideEffects(state, node.id);
        }
      }
    }
    const def = BUILDING_DEFINITIONS[b.defId]!;
    biz.history.push({ day, revenue: 0, costs: wages + def.upkeepPerDay, points });
    if (biz.history.length > 30) biz.history.shift();
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.lab!);
  }
}

/** One-off effects when a node completes (e.g. new recipes on menus). */
function applyUnlockSideEffects(state: GameState, nodeId: string): void {
  if (nodeId === 'synth_cuisine') {
    for (const b of Object.values(state.buildings)) {
      if (b.owner !== 'player' || b.business?.kind !== 'gastronomy') continue;
      const model = BUILDING_DEFINITIONS[b.defId]?.business;
      if (!model || model.kind !== 'gastronomy' || b.defId === 'food_stand') continue;
      for (const recipeId of ['synth_sushi', 'lab_steak']) {
        if (!b.business.menu.some((m) => m.recipeId === recipeId)) b.business.menu.push({ recipeId, price: recipeId === 'synth_sushi' ? 24 : 32, enabled: false, soldToday: 0 });
      }
    }
  }
}

/** Research multipliers consumed by the other systems. */
export function techFactors(state: GameState): {
  cookRate: number;
  roomCost: number;
  rides: number;
  basket: number;
  delivery: number;
  shelfLife: number;
  security: number;
  shrink: number;
  loanRate: number;
  premium: number;
  buildTime: number;
  buildCost: number;
  waste: number;
  revenue: number;
  upkeep: number;
  factoryEnergy: number;
  comfort: number;
  satisfaction: number;
} {
  const t = (id: string): boolean => hasTech(state, id);
  return {
    cookRate: t('kitchen_automation') ? 1.15 : 1,
    roomCost: t('robotic_housekeeping') ? 0.8 : 1,
    rides: t('autonomous_assist') ? 1.25 : 1,
    basket: t('stim_license') ? 1.15 : 1,
    delivery: t('drone_delivery') ? 0.6 : 1,
    shelfLife: t('cold_chain') ? 2 : 0,
    security: t('surveillance_ai') ? 1.3 : 1,
    shrink: t('surveillance_ai') ? 0.5 : 1,
    loanRate: t('credit_scoring') ? -0.0005 : 0,
    premium: t('credit_scoring') ? 0.8 : 1,
    buildTime: t('prefab') ? 0.7 : 1,
    buildCost: t('prefab') ? 0.9 : 1,
    waste: t('demand_forecast') ? 0.5 : 1,
    revenue: t('dynamic_pricing') ? 1.06 : 1,
    upkeep: t('microgrid') ? 0.85 : 1,
    factoryEnergy: t('microgrid') ? 0.7 : 1,
    comfort: t('wellness_implants') ? 8 : 0,
    satisfaction: t('flavor_profiling') ? 5 : 0,
  };
}
