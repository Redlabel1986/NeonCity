/**
 * Underworld: the player's criminal organisation, illegal operations,
 * territory, rival families, police heat (wanted levels), raids and money
 * laundering. All of it is abstract game mechanics.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { ActiveOperation, Building, CrewMember, GameState, RivalFamily, UnderworldState } from '../state';
import { CREW_WAGE, OPERATIONS, RIVAL_FAMILY_NAMES, WANTED_LEVELS, wantedLevelFor, type CrewRole } from '../data/underworld';
import { randomName } from '../data/names';
import { book, canAfford } from '../economy/finance';
import { tickToDate } from '../core/clock';
import { isResidential } from './property';
import { BACKGROUNDS } from '../data/difficulty';

const CREW_ROLES: readonly CrewRole[] = ['underboss', 'advisor', 'captain', 'enforcer', 'driver', 'informant', 'accountant', 'hacker', 'recruit'];
export const MAX_CREW = 16;
export const FOUNDING_COST = 5000;

export function createUnderworld(state: GameState, rng: Rng): UnderworldState {
  const rivals: RivalFamily[] = [];
  const names = [...RIVAL_FAMILY_NAMES].sort(() => rng.next() - 0.5).slice(0, 3);
  // Each family holds a few districts, strongest in the rough ones.
  const rough = state.districts.filter((d) => d.stats.crime >= 40).map((d) => d.id);
  const all = state.districts.map((d) => d.id);
  names.forEach((name, i) => {
    const control: Record<number, number> = {};
    const home = rough[i % Math.max(1, rough.length)] ?? all[i]!;
    control[home] = rng.int(45, 70);
    const second = rng.pick(all);
    if (second !== home) control[second] = rng.int(10, 30);
    rivals.push({ name, strength: rng.int(40, 70), control, relation: rng.int(-30, 10), truceUntilDay: 0 });
  });
  return { org: null, heat: 0, lockdownUntilDay: 0, rivals, recentBribes: 0 };
}

export function wantedLevel(state: GameState): number {
  return wantedLevelFor(state.underworld.heat);
}

export function foundOrganisation(ctx: SimContext, name: string): { ok: true } | { ok: false; error: string } {
  const { state, events, rng } = ctx;
  if (state.underworld.org) return { ok: false, error: 'Du führst bereits eine Organisation.' };
  const label = name.trim().slice(0, 32);
  if (!label) return { ok: false, error: 'Die Organisation braucht einen Namen.' };
  const cost = Math.round(FOUNDING_COST * (BACKGROUNDS[state.player.background].perks?.foundingCost ?? 1));
  if (!canAfford(state, cost)) return { ok: false, error: `Die Gründung kostet ${cost} ¢ Startkapital.` };
  if (cost > 0) book(state, events, -cost, { category: 'other', description: `Gründung: ${label}` });
  const org: NonNullable<UnderworldState['org']> = {
    name: label,
    foundedTick: state.tick,
    members: [],
    candidates: [],
    nextId: 1,
    control: {},
    operations: [],
    nextOperationId: 1,
    launderingRate: 0.15,
    todayDirtyIncome: 0,
    todayLaundered: 0,
    lifetimeDirty: 0,
    lifetimeLaundered: 0,
  };
  state.underworld.org = org;
  // The home district starts with a little control.
  org.control[state.player.homeDistrictId] = 8;
  refreshCrewCandidates(org, rng, tickToDate(state.tick).day, state);
  events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${label} gegründet. Jede Operation erhöht die Aufmerksamkeit der Polizei.` });
  return { ok: true };
}

export function refreshCrewCandidates(org: NonNullable<UnderworldState['org']>, rng: Rng, day: number, state: GameState): void {
  org.candidates = org.candidates.filter((c) => c.expiresDay > day);
  const crimeBias = state.districts.reduce((s, d) => s + d.stats.crime, 0) / state.districts.length;
  while (org.candidates.length < 4) {
    const role = rng.pick(CREW_ROLES);
    const skill = Math.round(Math.max(10, Math.min(95, 30 + crimeBias * 0.3 + rng.gaussian() * 18 + (BACKGROUNDS[state.player.background].perks?.crewSkill ?? 0))));
    org.candidates.push({ id: org.nextId++, name: randomName(rng), role, skill, cut: Math.round(CREW_WAGE[role] * rng.range(0.85, 1.25)), expiresDay: day + rng.int(2, 4) });
  }
}

export function recruit(ctx: SimContext, candidateId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const org = state.underworld.org;
  if (!org) return { ok: false, error: 'Keine Organisation.' };
  const idx = org.candidates.findIndex((c) => c.id === candidateId);
  if (idx < 0) return { ok: false, error: 'Kandidat nicht mehr verfügbar.' };
  if (org.members.length >= MAX_CREW) return { ok: false, error: `Mehr als ${MAX_CREW} Mitglieder sind nicht möglich.` };
  const c = org.candidates[idx]!;
  org.candidates.splice(idx, 1);
  org.members.push({ id: c.id, name: c.name, role: c.role, skill: c.skill, loyalty: 60, ambition: Math.round(ctx.rng.range(10, 90)), cut: c.cut, joinedTick: state.tick, busyUntilTick: 0, jailed: false });
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${org.name}: ${c.name} angeworben.` });
  return { ok: true };
}

export function dismiss(ctx: SimContext, memberId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const org = state.underworld.org;
  if (!org) return { ok: false, error: 'Keine Organisation.' };
  const idx = org.members.findIndex((m) => m.id === memberId);
  if (idx < 0) return { ok: false, error: 'Mitglied nicht gefunden.' };
  const m = org.members[idx]!;
  if (m.busyUntilTick > state.tick && !m.jailed) return { ok: false, error: `${m.name} ist gerade im Einsatz.` };
  org.members.splice(idx, 1);
  // Disgruntled ex-members talk.
  if (m.loyalty < 40) {
    state.underworld.heat = Math.min(100, state.underworld.heat + 6);
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${m.name} wurde entlassen und redet mit der Polizei. Aufmerksamkeit steigt.` });
  } else events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${m.name} hat die Organisation verlassen.` });
  return { ok: true };
}

function freeMembers(org: NonNullable<UnderworldState['org']>, tick: number): CrewMember[] {
  return org.members.filter((m) => !m.jailed && m.busyUntilTick <= tick);
}

/** Picks members for the required crew; returns null when not enough. */
function assignCrew(org: NonNullable<UnderworldState['org']>, tick: number, crew: Partial<Record<CrewRole | 'any', number>>): CrewMember[] | null {
  const free = freeMembers(org, tick);
  const chosen: CrewMember[] = [];
  for (const [role, count] of Object.entries(crew)) {
    if (role === 'any') continue;
    for (let i = 0; i < (count ?? 0); i++) {
      const m = free.find((x) => x.role === role && !chosen.includes(x));
      if (!m) return null;
      chosen.push(m);
    }
  }
  for (let i = 0; i < (crew.any ?? 0); i++) {
    const m = free.find((x) => !chosen.includes(x));
    if (!m) return null;
    chosen.push(m);
  }
  return chosen;
}

export function startOperation(ctx: SimContext, operationId: string, districtId: number, frontBuildingId: number | null = null): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const uw = state.underworld;
  const org = uw.org;
  if (!org) return { ok: false, error: 'Keine Organisation.' };
  const def = OPERATIONS[operationId];
  if (!def) return { ok: false, error: 'Unbekannte Operation.' };
  const district = state.districts[districtId];
  if (!district) return { ok: false, error: 'Unbekannter Bezirk.' };
  const day = tickToDate(state.tick).day;
  if (uw.lockdownUntilDay > day) return { ok: false, error: 'Stadtweite Operation der Polizei: nichts geht, bis sie vorbei ist.' };
  if ((org.control[districtId] ?? 0) < def.minControl) return { ok: false, error: `${def.name} braucht mindestens ${def.minControl} % Kontrolle in ${district.name}.` };
  if (def.kind === 'standing' && org.operations.some((o) => o.operationId === operationId && o.districtId === districtId)) {
    return { ok: false, error: `${def.name} läuft in ${district.name} bereits.` };
  }
  if (operationId === 'casino') {
    const front = frontBuildingId !== null ? state.buildings[frontBuildingId] : undefined;
    if (!front || front.owner !== 'player' || !front.property || front.districtId !== districtId || isResidential(front)) {
      return { ok: false, error: 'Ein Casino braucht eine eigene Gewerbeimmobilie im Bezirk als Fassade.' };
    }
    if (org.operations.some((o) => o.frontBuildingId === frontBuildingId)) return { ok: false, error: 'Diese Immobilie ist bereits eine Fassade.' };
  }
  const crew = assignCrew(org, state.tick, def.crew);
  if (!crew) return { ok: false, error: `Nicht genug freie Leute für ${def.name}: ${describeCrew(def.crew)}.` };
  const op: ActiveOperation = {
    id: org.nextOperationId++,
    operationId,
    districtId,
    memberIds: crew.map((m) => m.id),
    startedTick: state.tick,
    endsTick: state.tick + def.hours * 60,
    frontBuildingId: operationId === 'casino' ? frontBuildingId : null,
  };
  for (const m of crew) m.busyUntilTick = def.kind === 'standing' ? Number.MAX_SAFE_INTEGER : op.endsTick;
  org.operations.push(op);
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${org.name}: ${def.name} in ${district.name} gestartet.` });
  return { ok: true };
}

function describeCrew(crew: Partial<Record<CrewRole | 'any', number>>): string {
  return Object.entries(crew)
    .map(([role, n]) => `${n} × ${role === 'any' ? 'beliebig' : role}`)
    .join(', ');
}

export function cancelOperation(ctx: SimContext, operationId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const org = state.underworld.org;
  if (!org) return { ok: false, error: 'Keine Organisation.' };
  const idx = org.operations.findIndex((o) => o.id === operationId);
  if (idx < 0) return { ok: false, error: 'Operation nicht gefunden.' };
  const op = org.operations[idx]!;
  org.operations.splice(idx, 1);
  for (const m of org.members) if (op.memberIds.includes(m.id)) m.busyUntilTick = 0;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${OPERATIONS[op.operationId]?.name} in ${state.districts[op.districtId]!.name} beendet.` });
  return { ok: true };
}

/** Success probability of an operation right now. */
export function successChance(state: GameState, op: { operationId: string; districtId: number; memberIds: number[] }): number {
  const def = OPERATIONS[op.operationId]!;
  const org = state.underworld.org!;
  const district = state.districts[op.districtId]!;
  const crew = org.members.filter((m) => op.memberIds.includes(m.id));
  const skill = crew.length > 0 ? crew.reduce((s, m) => s + m.skill, 0) / crew.length : 30;
  const police = district.stats.policePresence / 100;
  const corruption = district.stats.corruption / 100;
  const heatPenalty = wantedLevel(state) >= 2 ? 0.12 * (wantedLevel(state) - 1) : 0;
  const risk = def.risk * (0.6 + police * 0.9) * (1 - corruption * 0.35) * (1.2 - skill / 250) + heatPenalty;
  return Math.max(0.05, Math.min(0.97, 1 - risk));
}

/** Hourly: completes jobs. */
export function stepUnderworldHour(ctx: SimContext): void {
  const { state, events, rng } = ctx;
  const org = state.underworld.org;
  if (!org) return;
  const remaining: ActiveOperation[] = [];
  for (const op of org.operations) {
    const def = OPERATIONS[op.operationId]!;
    if (def.kind === 'standing' || op.endsTick > state.tick) {
      remaining.push(op);
      continue;
    }
    resolveJob(ctx, op, rng);
  }
  org.operations = remaining;
  void events;
}

function resolveJob(ctx: SimContext, op: ActiveOperation, rng: Rng): void {
  const { state, events } = ctx;
  const org = state.underworld.org!;
  const def = OPERATIONS[op.operationId]!;
  const district = state.districts[op.districtId]!;
  const chance = successChance(state, op);
  const crew = org.members.filter((m) => op.memberIds.includes(m.id));
  for (const m of crew) m.busyUntilTick = 0;
  if (rng.chance(chance)) {
    const payout = Math.round(def.payout * (0.6 + district.stats.purchasingPower / 120) * rng.range(0.85, 1.2));
    if (payout > 0) addDirty(state, org, payout);
    org.control[op.districtId] = Math.min(100, (org.control[op.districtId] ?? 0) + def.control);
    state.underworld.heat = Math.min(100, state.underworld.heat + def.heat);
    for (const m of crew) {
      m.loyalty = Math.min(100, m.loyalty + 3);
      m.skill = Math.min(100, m.skill + 0.5);
    }
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${def.name} in ${district.name} gelungen${payout > 0 ? `: ${payout} ¢ Schwarzgeld` : ''}.` });
  } else {
    state.underworld.heat = Math.min(100, state.underworld.heat + def.heat * 1.5);
    const arrested = crew.filter(() => rng.chance(0.35));
    for (const m of arrested) {
      m.jailed = true;
      m.busyUntilTick = state.tick + rng.int(3, 8) * 1440;
    }
    for (const m of crew) m.loyalty = Math.max(0, m.loyalty - 6);
    events.emit({
      type: 'log',
      tick: state.tick,
      level: 'danger',
      message: `${def.name} in ${district.name} gescheitert.${arrested.length > 0 ? ` Verhaftet: ${arrested.map((m) => m.name).join(', ')}.` : ''} Aufmerksamkeit steigt.`,
    });
  }
}

function addDirty(state: GameState, org: NonNullable<UnderworldState['org']>, amount: number): void {
  state.ledger.dirtyBalance = Math.round((state.ledger.dirtyBalance + amount) * 100) / 100;
  org.todayDirtyIncome += amount;
  org.lifetimeDirty += amount;
}

export function bribe(ctx: SimContext, amount: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  if (!Number.isFinite(amount) || amount < 500) return { ok: false, error: 'Mindestens 500 ¢.' };
  if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
  book(state, events, -amount, { category: 'other', description: 'Bestechung' });
  const uw = state.underworld;
  // Diminishing returns on repeated bribes.
  const effect = (amount / 500) * 4 * (1 / (1 + uw.recentBribes * 0.5));
  uw.heat = Math.max(0, uw.heat - effect);
  uw.recentBribes += 1;
  state.player.wantedLevel = wantedLevel(state);
  const home = state.districts[state.player.homeDistrictId]!;
  home.stats.corruption = Math.min(100, home.stats.corruption + 1);
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Bestechung gezahlt: Aufmerksamkeit −${effect.toFixed(1)}.` });
  return { ok: true };
}

export function negotiateTruce(ctx: SimContext, familyIndex: number, tribute: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const family = state.underworld.rivals[familyIndex];
  if (!family) return { ok: false, error: 'Unbekannte Familie.' };
  if (!Number.isFinite(tribute) || tribute < 1000) return { ok: false, error: 'Ein Tribut unter 1.000 ¢ beleidigt die Familie.' };
  if (state.ledger.dirtyBalance < tribute) return { ok: false, error: 'Tribut wird in Schwarzgeld gezahlt. Nicht genug vorhanden.' };
  state.ledger.dirtyBalance -= tribute;
  const day = tickToDate(state.tick).day;
  family.truceUntilDay = Math.max(family.truceUntilDay, day) + Math.round(tribute / 1000) * 3;
  family.relation = Math.min(100, family.relation + Math.round(tribute / 400));
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${family.name} nimmt den Tribut an. Waffenstillstand bis Tag ${family.truceUntilDay + 1}.` });
  return { ok: true };
}

export function setLaunderingRate(state: GameState, rate: number): { ok: true } | { ok: false; error: string } {
  const org = state.underworld.org;
  if (!org) return { ok: false, error: 'Keine Organisation.' };
  if (!Number.isFinite(rate)) return { ok: false, error: 'Ungültiger Wert.' };
  org.launderingRate = Math.max(0, Math.min(0.4, Math.round(rate * 100) / 100));
  return { ok: true };
}

/** Day close: standing income, cuts, laundering, heat, raids, rivals, district drift. */
export function closeUnderworldDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const uw = state.underworld;
  // Heat decays; bribes memory fades.
  const budget = state.politics?.laws?.policeBudget ?? 1;
  uw.heat = Math.max(0, uw.heat - (2.5 / budget) * (BACKGROUNDS[state.player.background].perks?.heatDecay ?? 1));
  uw.recentBribes = Math.max(0, uw.recentBribes - 0.5);
  const org = uw.org;
  rivalsAct(ctx, day);
  if (!org) {
    state.player.wantedLevel = wantedLevel(state);
    return;
  }
  // Release jailed members whose time is up.
  for (const m of org.members) if (m.jailed && m.busyUntilTick <= state.tick) {
    m.jailed = false;
    m.busyUntilTick = 0;
  }
  // Standing operations.
  for (const op of org.operations) {
    const def = OPERATIONS[op.operationId]!;
    if (def.kind !== 'standing') continue;
    const district = state.districts[op.districtId]!;
    const control = org.control[op.districtId] ?? 0;
    if (!rng.chance(successChance(state, op))) {
      uw.heat = Math.min(100, uw.heat + def.heat);
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${def.name} in ${district.name}: Störung durch die Polizei, heute kein Ertrag.` });
      continue;
    }
    let income = 0;
    if (op.operationId === 'protection') {
      // Competitors in the district pay a cut of their cash.
      for (const c of Object.values(state.competitors)) {
        if (c.districtId !== op.districtId) continue;
        const fee = Math.round(60 + c.cash * 0.02 * (control / 100));
        c.cash -= fee;
        income += fee;
      }
    } else {
      income = Math.round(def.payout * (0.5 + district.stats.purchasingPower / 100) * (0.5 + control / 100));
    }
    if (income > 0) addDirty(state, org, income);
    org.control[op.districtId] = Math.min(100, control + def.control);
    uw.heat = Math.min(100, uw.heat + def.heat * 0.6);
  }
  // Laundering through legal businesses.
  const legalRevenue = Object.values(state.buildings).reduce((s, b) => s + (b.owner === 'player' && b.business && b.status === 'operational' ? dailyRevenueOf(b) : 0), 0);
  const level = wantedLevel(state);
  const capacity = legalRevenue * org.launderingRate * (level >= 3 ? 0.5 : 1) * (level >= 5 ? 0 : 1);
  const laundered = Math.min(state.ledger.dirtyBalance, Math.round(capacity));
  if (laundered > 0) {
    state.ledger.dirtyBalance -= laundered;
    const clean = Math.round(laundered * 0.8);
    book(state, events, clean, { category: 'other', description: `Geldwäsche (${org.launderingRate * 100} % der Umsätze, 20 % Gebühr)` });
    org.todayLaundered += laundered;
    org.lifetimeLaundered += laundered;
    uw.heat = Math.min(100, uw.heat + org.launderingRate * 10);
  }
  // Cuts in dirty money; unpaid cuts hurt loyalty.
  let cuts = 0;
  for (const m of org.members) if (!m.jailed) cuts += m.cut;
  if (state.ledger.dirtyBalance >= cuts) state.ledger.dirtyBalance -= cuts;
  else {
    const shortfall = cuts - state.ledger.dirtyBalance;
    state.ledger.dirtyBalance = 0;
    for (const m of org.members) m.loyalty = Math.max(0, m.loyalty - 8);
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${org.name}: ${Math.round(shortfall)} ¢ an Anteilen konnten nicht gezahlt werden. Die Loyalität sinkt.` });
  }
  // Loyalty drift, betrayal, ambition.
  for (const m of org.members) {
    m.loyalty = Math.max(0, Math.min(100, m.loyalty + (m.cut >= CREW_WAGE[m.role] ? 1 : -2) + rng.gaussian()));
    if (m.loyalty < 20 && rng.chance(0.08)) {
      uw.heat = Math.min(100, uw.heat + 12);
      org.members = org.members.filter((x) => x.id !== m.id);
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${m.name} hat die Organisation verraten und packt bei der Polizei aus.` });
    } else if (m.ambition > 80 && m.role !== 'underboss' && rng.chance(0.03)) {
      const stolen = Math.min(state.ledger.dirtyBalance, Math.round(rng.range(500, 2500)));
      state.ledger.dirtyBalance -= stolen;
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${m.name} hat ${stolen} ¢ aus der Kasse abgezweigt.` });
    }
  }
  // Police response by wanted level.
  policeResponse(ctx, day);
  // District drift: control pushes crime up and police presence reacts.
  for (const d of state.districts) {
    const control = org.control[d.id] ?? 0;
    if (control > 0) {
      d.stats.crime = Math.min(100, d.stats.crime + control * 0.01);
      org.control[d.id] = Math.max(0, control - 1.2); // control fades without presence
    }
  }
  refreshCrewCandidates(org, rng, day + 1, state);
  org.todayDirtyIncome = 0;
  org.todayLaundered = 0;
  state.player.wantedLevel = wantedLevel(state);
}

function dailyRevenueOf(b: Building): number {
  const biz = b.business;
  if (!biz) return 0;
  const last = biz.history[biz.history.length - 1];
  return last ? last.revenue : 0;
}

function policeResponse(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const uw = state.underworld;
  const org = uw.org!;
  const level = wantedLevel(state);
  if (level >= 6 && uw.lockdownUntilDay <= day) {
    uw.lockdownUntilDay = day + 4;
    for (const op of org.operations) for (const m of org.members) if (op.memberIds.includes(m.id)) m.busyUntilTick = 0;
    org.operations = [];
    events.emit({ type: 'log', tick: state.tick, level: 'danger', message: 'Stadtweite Polizeioperation: Alle Operationen aufgehoben, vier Tage Stillstand.' });
    return;
  }
  if (level >= 4 && rng.chance(0.3 + (level - 4) * 0.25)) {
    // Raid: arrests and seizure.
    const free = org.members.filter((m) => !m.jailed);
    const arrested = free.filter(() => rng.chance(level >= 5 ? 0.35 : 0.2));
    for (const m of arrested) {
      m.jailed = true;
      m.busyUntilTick = state.tick + rng.int(4, 10) * 1440;
    }
    const seized = Math.round(state.ledger.dirtyBalance * (level >= 5 ? 0.5 : 0.25));
    state.ledger.dirtyBalance -= seized;
    const fine = Math.round(1500 + level * 800);
    book(state, events, -fine, { category: 'fine', description: 'Razzia: Bußgeld und Anwaltskosten' });
    if (level >= 5) {
      // Standing operations are broken up.
      const broken = org.operations.filter((o) => OPERATIONS[o.operationId]!.kind === 'standing');
      for (const op of broken) for (const m of org.members) if (op.memberIds.includes(m.id) && !m.jailed) m.busyUntilTick = 0;
      org.operations = org.operations.filter((o) => OPERATIONS[o.operationId]!.kind !== 'standing');
    }
    uw.heat = Math.max(0, uw.heat - 10);
    events.emit({
      type: 'log',
      tick: state.tick,
      level: 'danger',
      message: `Razzia! ${arrested.length} Verhaftungen, ${seized} ¢ Schwarzgeld beschlagnahmt, ${fine} ¢ Bußgeld${level >= 5 ? ', Standing-Operationen ausgehoben' : ''}.`,
    });
  }
}

/** Rival families: contest territory, pressure the player, react to truces. */
function rivalsAct(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const uw = state.underworld;
  const org = uw.org;
  for (const family of uw.rivals) {
    // Strength drifts with their territory.
    const territory = Object.values(family.control).reduce((s, c) => s + c, 0);
    family.strength = Math.max(10, Math.min(100, family.strength + (territory / 200 - 0.3) + rng.gaussian() * 0.5));
    if (!org || family.truceUntilDay > day) continue;
    // Contest districts where both have control.
    for (const [key, theirs] of Object.entries(family.control)) {
      const districtId = Number(key);
      const ours = org.control[districtId] ?? 0;
      if (ours <= 0 || theirs <= 0) continue;
      const ourStrength = org.members.filter((m) => !m.jailed && m.role === 'enforcer').length * 12 + ours;
      const theirStrength = family.strength + theirs;
      if (rng.chance(0.25)) {
        const win = rng.chance(ourStrength / (ourStrength + theirStrength));
        const swing = rng.int(4, 12);
        if (win) {
          family.control[districtId] = Math.max(0, theirs - swing);
          org.control[districtId] = Math.min(100, ours + swing * 0.5);
          family.relation = Math.max(-100, family.relation - 8);
          events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `Revierkampf in ${state.districts[districtId]!.name}: ${family.name} weicht zurück.` });
        } else {
          org.control[districtId] = Math.max(0, ours - swing);
          // Injuries: a member is out for days.
          const free = org.members.filter((m) => !m.jailed);
          const victim = free.length > 0 ? rng.pick(free) : null;
          if (victim) victim.busyUntilTick = Math.max(victim.busyUntilTick, state.tick + rng.int(2, 5) * 1440);
          events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `Revierkampf in ${state.districts[districtId]!.name}: ${family.name} drängt dich zurück${victim ? `, ${victim.name} fällt aus` : ''}.` });
          uw.heat = Math.min(100, uw.heat + 4);
        }
      }
    }
  }
}

export function wantedDescription(level: number): string {
  return WANTED_LEVELS[level]?.description ?? '';
}
