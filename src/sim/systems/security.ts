/**
 * Security firms: guards are assigned to districts as patrols. The city pays
 * per patrol, private contracts come from businesses in patrolled districts.
 * Patrols raise police presence and lower crime over time, which helps every
 * legal business and hurts criminal operations, including the player's own.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { SecurityModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DISTRICT_ARCHETYPES } from '../data/districts';
import { book } from '../economy/finance';
import type { GameState, SecurityState } from '../state';
import { closeStaffDay, createEmployee, generateCandidates, effortOf, ROLES_BY_KIND } from './staff';
import { wantedLevelFor } from '../data/underworld';
import { techFactors } from './research';

export function createSecurityState(model: SecurityModel, rng: Rng, day: number, tick: number, districtSkillBias: number): SecurityState {
  const biz: SecurityState = {
    kind: 'security',
    patrols: {},
    reputation: 40,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayRevenue: 0,
    todayCosts: 0,
    lifetimeRevenue: 0,
    investigation: null,
    history: [],
  };
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.security!);
  return biz;
}

export function guardsOf(biz: SecurityState): number {
  return biz.employees.filter((e) => e.role === 'guard').length;
}

export function assignedGuards(biz: SecurityState): number {
  return Object.values(biz.patrols).reduce((s, n) => s + n, 0);
}

export function assignPatrol(state: GameState, buildingId: number, districtId: number, guards: number): { ok: true } | { ok: false; error: string } {
  const b = state.buildings[buildingId];
  const biz = b?.business;
  if (!b || b.owner !== 'player' || !biz || biz.kind !== 'security') return { ok: false, error: 'Keine eigene Sicherheitsfirma.' };
  if (!state.districts[districtId]) return { ok: false, error: 'Unbekannter Bezirk.' };
  const n = Math.max(0, Math.floor(guards));
  const others = assignedGuards(biz) - (biz.patrols[districtId] ?? 0);
  if (others + n > guardsOf(biz)) return { ok: false, error: `Nur ${guardsOf(biz)} Wachleute verfügbar.` };
  if (n === 0) delete biz.patrols[districtId];
  else biz.patrols[districtId] = n;
  return { ok: true };
}

export function startInvestigation(state: GameState, buildingId: number, familyIndex: number): { ok: true } | { ok: false; error: string } {
  const b = state.buildings[buildingId];
  const biz = b?.business;
  if (!b || b.owner !== 'player' || !biz || biz.kind !== 'security') return { ok: false, error: 'Keine eigene Sicherheitsfirma.' };
  if (!state.underworld.rivals[familyIndex]) return { ok: false, error: 'Unbekannte Familie.' };
  if (biz.employees.filter((e) => e.role === 'investigator').length === 0) return { ok: false, error: 'Ermittlungen brauchen mindestens einen Ermittler.' };
  biz.investigation = { familyIndex, progress: 0 };
  return { ok: true };
}

/** Day close: contracts, patrol effects, investigations, conflicts of interest. */
export function closeSecurityDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player' || b.status !== 'operational' || b.business?.kind !== 'security') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'security') continue;
    const biz = b.business;
    const guards = biz.employees.filter((e) => e.role === 'guard');
    const avgSkill = guards.length > 0 ? guards.reduce((s, e) => s + e.skill * effortOf(e), 0) / guards.length : 0;
    let patrols = 0;
    let revenue = 0;
    let contracts = 0;
    for (const [key, n] of Object.entries(biz.patrols)) {
      const district = state.districts[Number(key)];
      if (!district || n <= 0) continue;
      patrols += n;
      // City contract: pays per guard-day, more in rough districts.
      const cityRate = model.cityRatePerGuard * (0.7 + district.stats.crime / 120);
      revenue += n * cityRate;
      // Private contracts from businesses in the district.
      const venues = district.economy.venues;
      contracts += Math.round(venues * model.contractPerVenue * Math.min(1, n / 3));
      // Effects: presence up, crime down, bounded; conflicts with the player's own territory.
      const effect = n * (0.3 + avgSkill / 200) * (0.5 + biz.reputation / 200) * techFactors(state).security;
      district.stats.policePresence = Math.min(100, district.stats.policePresence + effect * 0.6);
      district.stats.crime = Math.max(0, district.stats.crime - effect * 0.5);
      const org = state.underworld.org;
      if (org && (org.control[district.id] ?? 0) > 0) org.control[district.id] = Math.max(0, (org.control[district.id] ?? 0) - effect * 0.8);
      for (const family of state.underworld.rivals) {
        if ((family.control[district.id] ?? 0) > 0) family.control[district.id] = Math.max(0, (family.control[district.id] ?? 0) - effect * 0.5);
      }
    }
    // Districts without patrols drift back towards their archetype.
    for (const district of state.districts) {
      if (biz.patrols[district.id]) continue;
      const base = DISTRICT_ARCHETYPES[district.archetype].stats;
      district.stats.policePresence += (base.policePresence - district.stats.policePresence) * 0.05;
    }
    revenue = Math.round(revenue + contracts);
    if (revenue > 0) book(state, events, revenue, { category: 'sales', description: `${b.label}: Verträge (${patrols} Streifen)`, buildingId: b.id });
    biz.todayRevenue += revenue;
    biz.lifetimeRevenue += revenue;
    // Investigation against a rival family.
    if (biz.investigation) {
      const investigators = biz.employees.filter((e) => e.role === 'investigator');
      const family = state.underworld.rivals[biz.investigation.familyIndex];
      if (family && investigators.length > 0) {
        const progress = investigators.reduce((s, e) => s + (4 + e.skill / 10) * effortOf(e), 0);
        biz.investigation.progress += progress;
        if (biz.investigation.progress >= 100) {
          family.strength = Math.max(10, family.strength - 20);
          for (const key of Object.keys(family.control)) family.control[Number(key)] = Math.max(0, (family.control[Number(key)] ?? 0) * 0.6);
          const bounty = 4000;
          book(state, events, bounty, { category: 'sales', description: `${b.label}: Ermittlungsprämie gegen ${family.name}`, buildingId: b.id });
          biz.reputation = Math.min(100, biz.reputation + 8);
          biz.investigation = null;
          events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label}: Ermittlung gegen ${family.name} abgeschlossen. Die Familie verliert Einfluss, Prämie ${bounty} ¢.`, buildingId: String(b.id) });
        }
      }
    }
    // Conflict of interest: running a security firm while wanted damages it.
    const wanted = wantedLevelFor(state.underworld.heat);
    if (wanted >= 3) {
      biz.reputation = Math.max(0, biz.reputation - 6);
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: Interne Ermittlungen wegen deiner Verwicklung in die Unterwelt. Ruf und Verträge leiden.`, buildingId: String(b.id) });
      if (wanted >= 5) {
        biz.patrols = {};
        events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: Die Stadt kündigt alle Streifenverträge.`, buildingId: String(b.id) });
      }
    } else {
      const target = 40 + Math.min(40, patrols * 4) + (guards.length > 0 ? avgSkill * 0.2 : -10);
      biz.reputation = Math.max(0, Math.min(100, biz.reputation + (target - biz.reputation) * 0.15 + rng.gaussian()));
    }
    const wages = closeStaffDay(ctx, b, patrols > 0 ? Math.min(1, assignedGuards(biz) / Math.max(1, guards.length)) : 0.2);
    const def = BUILDING_DEFINITIONS[b.defId]!;
    const costs = wages + def.upkeepPerDay;
    biz.history.push({ day, revenue: biz.todayRevenue, costs, patrols, contracts });
    if (biz.history.length > 30) biz.history.shift();
    biz.todayRevenue = 0;
    biz.todayCosts = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.security!);
  }
}
