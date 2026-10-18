/**
 * Business evolution: runs the stage graph from data/evolution.ts.
 *
 * A conversion is atomic: prerequisites and money are checked, the cost is
 * booked and remembered on the building, the conversion runs for its
 * duration (capacity −20 % meanwhile), then the stage is applied and its
 * unlocks are added exactly once. Cancelling refunds most of the cost.
 * Critics (stars) and franchise licences are the stage mechanics that need
 * their own daily step.
 */

import type { SimContext } from '../core/context';
import type { Building, GameState } from '../state';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulty';
import { RECIPES } from '../data/recipes';
import { RESEARCH } from '../data/research';
import { hasFeature, stageLevel, stageName, stageOf, treeOf, unlockedAlongPath, type Stage } from '../data/evolution';
import { levelDef, PLAYER_LEVELS } from '../data/regions';
import { book, canAfford } from '../economy/finance';
import { techFactors } from './research';
import { effectivePlayerTier, stageXp } from './progression';

export const CANCEL_REFUND = 0.7;
export const MAX_STARS = 3;

export interface EvolutionCheck {
  ok: boolean;
  stage: Stage | null;
  /** Reasons the conversion is blocked, in UI wording. */
  unmet: string[];
  cost: number;
  minutes: number;
  /** The stage is a direct successor of the current one. */
  reachable: boolean;
}

function lastDay(b: Building): { revenue: number; satisfaction?: number } | null {
  const biz = b.business as { history?: { revenue?: number; satisfaction?: number }[] } | undefined;
  const h = biz?.history;
  if (!h || h.length === 0) return null;
  const last = h[h.length - 1]!;
  return { revenue: last.revenue ?? 0, satisfaction: last.satisfaction };
}

/** Whether a building may convert to `stageId` now, with every unmet requirement spelled out. */
export function checkEvolution(state: GameState, b: Building, stageId: string): EvolutionCheck {
  const tree = treeOf(b.defId);
  const current = stageOf(b);
  const stage = tree?.stages[stageId] ?? null;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const tech = state.research ? techFactors(state) : { buildCost: 1, buildTime: 1 };
  const cost = stage ? Math.round(stage.cost * difficulty.costMultiplier * tech.buildCost) : 0;
  const minutes = stage ? (difficulty.instantBuild ? 0 : Math.round(stage.minutes * tech.buildTime)) : 0;
  const unmet: string[] = [];
  const reachable = !!current && current.next.includes(stageId);
  if (!tree || !stage || !current) return { ok: false, stage, unmet: ['Unbekannte Entwicklungsstufe.'], cost, minutes, reachable: false };
  if (b.owner !== state.playerId || !b.business) unmet.push('Kein eigener Betrieb.');
  if (!reachable) unmet.push(`${stage.name} folgt nicht auf ${current.name}.`);
  if (b.status !== 'operational') unmet.push('Der Betrieb ist noch nicht eröffnet.');
  if (b.stageUpgrade) unmet.push('Es läuft bereits ein Ausbau.');
  const allowed = levelDef(effectivePlayerTier(state)).maxBusinessTier;
  if (stage.level > allowed) unmet.push(`Spielerlevel ${PLAYER_LEVELS.find((t) => t.maxBusinessTier >= stage.level)?.level ?? PLAYER_LEVELS.length} nötig (Weltkarte, Taste G).`);
  const req = stage.requires;
  const biz = b.business as { reputation?: number; employees?: { role: string; skill: number }[]; upgrades?: Record<string, number> } | undefined;
  if (req.reputation !== undefined && (biz?.reputation ?? 0) < req.reputation) unmet.push(`Ruf ${req.reputation} nötig (${Math.round(biz?.reputation ?? 0)}).`);
  const day = lastDay(b);
  if (req.satisfaction !== undefined && (day?.satisfaction ?? 0) < req.satisfaction) unmet.push(`Zufriedenheit ${req.satisfaction} am letzten Tag nötig (${Math.round(day?.satisfaction ?? 0)}).`);
  if (req.revenuePerDay !== undefined && (day?.revenue ?? 0) < req.revenuePerDay) unmet.push(`Tagesumsatz ${req.revenuePerDay} ¢ nötig (${Math.round(day?.revenue ?? 0)} ¢).`);
  if (req.ageDays !== undefined && (state.tick - b.placedTick) / 1440 < req.ageDays) unmet.push(`Betrieb muss ${req.ageDays} Tage alt sein.`);
  if (req.staff && !(biz?.employees ?? []).some((e) => e.role === req.staff!.role && e.skill >= req.staff!.skill)) unmet.push(`Mitarbeiter ${roleLabel(req.staff.role)} mit Fähigkeit ${req.staff.skill} nötig.`);
  if (req.research && !state.research.unlocked.includes(req.research)) unmet.push(`Forschung „${RESEARCH[req.research]?.name ?? req.research}“ nötig.`);
  if (req.upgrade && (biz?.upgrades?.[req.upgrade.id] ?? 0) < req.upgrade.level) unmet.push(`Ausbau ${req.upgrade.id} Stufe ${req.upgrade.level} nötig.`);
  if (!canAfford(state, cost)) unmet.push(`Nicht genug Credits (${cost} ¢).`);
  return { ok: unmet.length === 0, stage, unmet, cost, minutes, reachable };
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = { cook: 'Koch', reception: 'Rezeption', driver: 'Fahrer', investigator: 'Ermittler', guard: 'Wachmann', researcher: 'Forscher', analyst: 'Kreditanalyst', technician: 'Techniker' };
  return labels[role] ?? role;
}

export function startEvolution(ctx: SimContext, b: Building, stageId: string): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const check = checkEvolution(state, b, stageId);
  if (!check.ok || !check.stage) return { ok: false, error: check.unmet[0] ?? 'Ausbau nicht möglich.' };
  const stage = check.stage;
  book(state, events, -check.cost, { category: 'construction', description: `Ausbau zu ${stage.name}: ${b.label}`, buildingId: b.id });
  b.investment += check.cost;
  if (check.minutes === 0) {
    completeEvolution(ctx, b, stage.id);
  } else {
    b.stageUpgrade = { toStageId: stage.id, readyTick: state.tick + check.minutes, paid: check.cost };
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Ausbau zu ${stage.name} gestartet (${Math.round(check.minutes / 60)} h, Kapazität −20 % solange).`, buildingId: String(b.id) });
  }
  return { ok: true };
}

/** Stops a running conversion; most of the money comes back. */
export function cancelEvolution(ctx: SimContext, b: Building): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (b.owner !== state.playerId) return { ok: false, error: 'Kein eigener Betrieb.' };
  const running = b.stageUpgrade;
  if (!running) return { ok: false, error: 'Es läuft kein Ausbau.' };
  const refund = Math.round(running.paid * CANCEL_REFUND);
  b.stageUpgrade = undefined;
  b.investment = Math.max(0, b.investment - running.paid);
  book(state, events, refund, { category: 'refund', description: `Ausbau abgebrochen: ${b.label}`, buildingId: b.id });
  events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Ausbau abgebrochen, ${refund} ¢ erstattet (${Math.round(CANCEL_REFUND * 100)} %).`, buildingId: String(b.id) });
  return { ok: true };
}

/** Applies a stage: id, history, floors, name, unlocks (recipes once). */
export function completeEvolution(ctx: SimContext, b: Building, stageId: string): void {
  const { state, events } = ctx;
  const tree = treeOf(b.defId);
  const stage = tree?.stages[stageId];
  if (!tree || !stage) return;
  if ((b.stageId ?? tree.initialStageId) === stage.id) {
    // Already there (e.g. a repeated completion): nothing to unlock twice.
    b.stageUpgrade = undefined;
    return;
  }
  const previous = stageOf(b);
  const def = BUILDING_DEFINITIONS[b.defId];
  const wasDefaultName = !!previous && (b.label === previous.name || b.label === def?.name);
  b.stageHistory = [...(b.stageHistory ?? []), b.stageId ?? tree.initialStageId].filter((id, i, arr) => arr.indexOf(id) === i);
  b.stageId = stage.id;
  b.stageUpgrade = undefined;
  b.floors = stage.art.floors;
  if (wasDefaultName) b.label = stage.name;
  // Unlocks: recipes land on the menu once, disabled until the player switches them on.
  if (b.business?.kind === 'gastronomy') {
    for (const recipeId of unlockedAlongPath(b).recipes) {
      if (!RECIPES[recipeId] || b.business.menu.some((m) => m.recipeId === recipeId)) continue;
      b.business.menu.push({ recipeId, price: RECIPES[recipeId]!.basePrice, enabled: false, soldToday: 0 });
    }
  }
  events.emit({ type: 'building:completed', tick: state.tick, buildingId: String(b.id) });
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label} ist jetzt: ${stage.name} (Stufe ${stage.level}). ${stage.pros}`, buildingId: String(b.id) });
  stageXp(state, events, stage.id, stage.level, stage.name);
}

/** Advances running conversions; checked every quarter hour to keep the per-tick cost low. */
export function stepEvolutions(ctx: SimContext): void {
  const { state } = ctx;
  if (state.tick % 15 !== 0) return;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (!b.stageUpgrade || state.tick < b.stageUpgrade.readyTick) continue;
    completeEvolution(ctx, b, b.stageUpgrade.toStageId);
  }
}

// ---------------------------------------------------------------- franchise

export function maxFranchises(b: Building): number {
  return hasFeature(b, 'franchise') ? stageLevel(b) : 0;
}

/** Daily licence fee one franchisee pays, depending on the brand's stage and reputation. */
export function franchiseFee(b: Building): number {
  const reputation = (b.business as { reputation?: number } | undefined)?.reputation ?? 0;
  return Math.round(180 * stageLevel(b) * (0.5 + reputation / 100));
}

export function grantFranchise(ctx: SimContext, b: Building): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (b.owner !== state.playerId || !b.business) return { ok: false, error: 'Kein eigener Betrieb.' };
  if (!hasFeature(b, 'franchise')) return { ok: false, error: `${stageName(b)} darf noch keine Franchise-Verträge vergeben.` };
  const current = b.franchises ?? 0;
  if (current >= maxFranchises(b)) return { ok: false, error: `Höchstens ${maxFranchises(b)} Franchisenehmer auf dieser Stufe.` };
  if (((b.business as { reputation?: number }).reputation ?? 0) < 60) return { ok: false, error: 'Franchisenehmer wollen eine Marke mit Ruf 60 oder mehr.' };
  b.franchises = current + 1;
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label}: Franchise-Vertrag Nr. ${b.franchises} unterschrieben, ${franchiseFee(b)} ¢ Lizenzgebühr pro Tag.`, buildingId: String(b.id) });
  return { ok: true };
}

export function revokeFranchise(ctx: SimContext, b: Building): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (b.owner !== state.playerId) return { ok: false, error: 'Kein eigener Betrieb.' };
  if (!b.franchises) return { ok: false, error: 'Es gibt keinen Franchise-Vertrag.' };
  b.franchises -= 1;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Ein Franchise-Vertrag wurde beendet.`, buildingId: String(b.id) });
  return { ok: true };
}

// ------------------------------------------------------------- daily step

/** Critics and franchisees: once a day per player. */
export function closeEvolutionDay(ctx: SimContext): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || !b.business) continue;
    const biz = b.business as { reputation: number; quality?: number; hygiene?: number };
    // Franchise: fees in, reputation coupled to the brand's quality.
    if (b.franchises && b.franchises > 0) {
      if (!hasFeature(b, 'franchise')) {
        b.franchises = 0;
      } else {
        const fee = franchiseFee(b) * b.franchises;
        book(state, events, fee, { category: 'sales', description: `Franchise-Gebühren: ${b.label} (${b.franchises})`, buildingId: b.id });
        if (biz.reputation < 55) {
          biz.reputation = Math.max(0, biz.reputation - 0.8 * b.franchises);
          events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Franchisenehmer liefern schlechte Qualität, der Ruf der Marke leidet.`, buildingId: String(b.id) });
        }
      }
    }
    // Critics: unannounced visits; stars follow quality, satisfaction and hygiene.
    if (hasFeature(b, 'critics') && b.business.kind === 'gastronomy' && rng.chance(0.15)) {
      const day = lastDay(b);
      const score = 0.45 * (biz.quality ?? 0) + 0.35 * (day?.satisfaction ?? 0) + 0.2 * (biz.hygiene ?? 100);
      const stars = b.stars ?? 0;
      if (score >= 80 && stars < MAX_STARS) {
        b.stars = stars + 1;
        events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label}: Ein Kritiker war da. ${b.stars}. Stern verliehen (Bewertung ${Math.round(score)}).`, buildingId: String(b.id) });
      } else if (score < 62 && stars > 0) {
        b.stars = stars - 1;
        events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: Ein Kritiker war da und nicht zufrieden (Bewertung ${Math.round(score)}). Ein Stern ist weg, ${b.stars} bleiben.`, buildingId: String(b.id) });
      } else {
        events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Kritikerbesuch, Bewertung ${Math.round(score)}. ${stars > 0 ? `${stars} Stern${stars > 1 ? 'e' : ''} bestätigt.` : 'Für einen Stern braucht es 80.'}`, buildingId: String(b.id) });
      }
    } else if (!hasFeature(b, 'critics') && b.stars) {
      b.stars = 0;
    }
  }
}
