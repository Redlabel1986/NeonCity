/**
 * Player progression: experience points, levels and regions.
 *
 * XP comes from milestones with stable ids (awarded once per player) and
 * from bounded repeatable sources whose id names the thing achieved
 * (stage ids, research nodes, regions), so selling and rebuilding never
 * farms XP. Reaching a level's XP promotes immediately and opens the
 * level's region. Businesses in every region keep running; nothing is
 * simulated twice.
 */

import type { SimContext } from '../core/context';
import type { EventBus } from '../core/events';
import type { GameState, ProgressionState } from '../state';
import { levelDef, levelForXp, MAX_PLAYER_LEVEL, PLAYER_LEVELS, REGION_ORDER, REGIONS, regionOfArchetype, XP_MILESTONES, XP_PER_REGION_ENTERED, XP_PER_STAGE_LEVEL, type RegionId } from '../data/regions';

export function createProgression(enabled = true): ProgressionState {
  return { enabled, level: 1, xp: 0, milestones: [], unlockedRegions: ['greenhaven'], levelReachedTick: 0, pendingLevelUp: null, stats: { lifetimeIncome: 0, lifetimeExpenses: 0 } };
}

/** The level that gates buildings and conversions: the real one, or the top level in free play. */
export function effectivePlayerTier(state: GameState): number {
  return state.progression.enabled ? state.progression.level : MAX_PLAYER_LEVEL;
}

export function regionOfDistrict(state: GameState, districtId: number): RegionId {
  const d = state.districts[districtId];
  return d ? regionOfArchetype(d.archetype) : 'neon_central';
}

export function isRegionUnlocked(state: GameState, region: RegionId): boolean {
  if (!state.progression.enabled) return true;
  return state.progression.unlockedRegions.includes(region);
}

export function isDistrictUnlocked(state: GameState, districtId: number): boolean {
  return isRegionUnlocked(state, regionOfDistrict(state, districtId));
}

/** District ids of every region the player may not use yet (renderer dimming, world map). */
export function lockedDistrictIds(state: GameState): number[] {
  return state.districts.filter((d) => !isDistrictUnlocked(state, d.id)).map((d) => d.id);
}

/** Centre tile of a region (the mean of its districts' centres). */
export function regionCentre(state: GameState, region: RegionId): { x: number; y: number } {
  const districts = state.districts.filter((d) => regionOfArchetype(d.archetype) === region);
  if (districts.length === 0) return { x: Math.floor(state.grid.width / 2), y: Math.floor(state.grid.height / 2) };
  return { x: Math.round(districts.reduce((s, d) => s + d.cx, 0) / districts.length), y: Math.round(districts.reduce((s, d) => s + d.cy, 0) / districts.length) };
}

/** The home district of a new player: Greenhaven when the level system is on, else the background's choice. */
export function startingDistrict(districts: readonly { id: number; archetype: string }[], backgroundHome: string, enabled: boolean): number {
  const greenhaven = enabled ? districts.find((d) => d.archetype === 'greenhaven') : undefined;
  return (greenhaven ?? districts.find((d) => d.archetype === backgroundHome) ?? districts[0]!).id;
}

// ------------------------------------------------------------------- xp

/**
 * Awards XP once per id. Returns the amount granted (0 when the id was
 * already awarded or the level system is off). `title` is logged.
 */
export function awardXp(state: GameState, events: EventBus, id: string, xp: number, title: string): number {
  const p = state.progression;
  if (!p.enabled || xp <= 0 || p.milestones.includes(id)) return 0;
  p.milestones.push(id);
  p.xp += xp;
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `+${xp} XP: ${title}` });
  promote(state, events);
  return xp;
}

export function awardMilestone(state: GameState, events: EventBus, milestoneId: string): number {
  const m = XP_MILESTONES[milestoneId];
  if (!m) return 0;
  return awardXp(state, events, milestoneId, m.xp, m.title);
}

/** Promotes as far as the XP allows; each new level opens its region. */
function promote(state: GameState, events: EventBus): void {
  const p = state.progression;
  const target = levelForXp(p.xp);
  while (p.level < target) {
    p.level += 1;
    p.levelReachedTick = state.tick;
    const def = levelDef(p.level);
    if (!p.unlockedRegions.includes(def.region)) p.unlockedRegions.push(def.region);
    p.pendingLevelUp = { level: p.level, region: def.region };
    const region = REGIONS[def.region];
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Level ${p.level}: ${def.name} erreicht. ${region.name} ist jetzt offen: ${region.tagline}. Betriebe bis Entwicklungsstufe ${def.maxBusinessTier}.` });
    events.emit({ type: 'level:up', tick: state.tick, level: p.level, region: def.region });
  }
}

export function acknowledgeLevelUp(state: GameState): { ok: true } {
  state.progression.pendingLevelUp = null;
  return { ok: true };
}

export interface ProgressionStatus {
  level: number;
  name: string;
  xp: number;
  /** XP of the current level's threshold and the next one (null at the top). */
  currentThreshold: number;
  nextThreshold: number | null;
  /** 0-1 towards the next level. */
  progress: number;
  nextRegion: RegionId | null;
  maxBusinessTier: number;
  regions: { id: RegionId; unlocked: boolean; requiredLevel: number }[];
}

export function progressionStatus(state: GameState): ProgressionStatus {
  const p = state.progression;
  const level = effectivePlayerTier(state);
  const def = levelDef(level);
  const next = level < MAX_PLAYER_LEVEL ? PLAYER_LEVELS[level]! : null;
  const span = next ? next.xp - def.xp : 1;
  return {
    level,
    name: def.name,
    xp: p.xp,
    currentThreshold: def.xp,
    nextThreshold: next?.xp ?? null,
    progress: next ? Math.max(0, Math.min(1, (p.xp - def.xp) / span)) : 1,
    nextRegion: next?.region ?? null,
    maxBusinessTier: def.maxBusinessTier,
    regions: REGION_ORDER.map((id) => ({ id, unlocked: isRegionUnlocked(state, id), requiredLevel: REGIONS[id].requiredLevel })),
  };
}

// ------------------------------------------------------------ daily step

const REVENUE_STEPS: readonly [number, string][] = [
  [10000, 'revenue_10k'],
  [50000, 'revenue_50k'],
  [250000, 'revenue_250k'],
  [1000000, 'revenue_1m'],
  [5000000, 'revenue_5m'],
];
const PROFIT_STEPS: readonly [number, string][] = [
  [10000, 'profit_10k'],
  [100000, 'profit_100k'],
  [1000000, 'profit_1m'],
];
const REPUTATION_STEPS: readonly [number, string][] = [
  [50, 'reputation_50'],
  [75, 'reputation_75'],
  [90, 'reputation_90'],
];

/** Day close: cumulative milestones (revenue, profit, reputation, branches, regions entered). */
export function closeProgressionDay(ctx: SimContext): void {
  const { state, events } = ctx;
  const p = state.progression;
  if (!p.enabled) return;
  p.stats.lifetimeIncome += state.ledger.todayIncome;
  p.stats.lifetimeExpenses += state.ledger.todayExpenses;
  const profit = p.stats.lifetimeIncome - p.stats.lifetimeExpenses;
  for (const [threshold, id] of PROFIT_STEPS) if (profit >= threshold) awardMilestone(state, events, id);
  let revenue = 0;
  const perType = new Map<string, number>();
  const regionsUsed = new Set<RegionId>();
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== state.playerId || !b.business) continue;
    const biz = b.business as { lifetimeRevenue?: number };
    revenue += biz.lifetimeRevenue ?? 0;
    if (b.status === 'operational') {
      perType.set(b.defId, (perType.get(b.defId) ?? 0) + 1);
      regionsUsed.add(regionOfDistrict(state, b.districtId));
    }
  }
  for (const [threshold, id] of REVENUE_STEPS) if (revenue >= threshold) awardMilestone(state, events, id);
  for (const [threshold, id] of REPUTATION_STEPS) if (state.player.reputation >= threshold) awardMilestone(state, events, id);
  if ([...perType.values()].some((n) => n >= 2)) awardMilestone(state, events, 'first_branch');
  for (const region of regionsUsed) awardXp(state, events, `region:${region}`, XP_PER_REGION_ENTERED, `${REGIONS[region].name} erschlossen`);
}

/** XP for reaching an evolution stage: once per stage id, scaled by its level. */
export function stageXp(state: GameState, events: EventBus, stageId: string, level: number, name: string): void {
  awardMilestone(state, events, 'first_evolution');
  awardXp(state, events, `stage:${stageId}`, XP_PER_STAGE_LEVEL * level, `Entwicklungsstufe ${name}`);
}
