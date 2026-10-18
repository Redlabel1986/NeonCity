/**
 * Employees: hiring, wages, morale, quitting, and the throughput / quality
 * they provide to a business.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { Building, Employee, EmployeeRole, GastronomyState, StaffedBusiness } from '../state';
import { randomName } from '../data/names';
import { upgradeEffects } from '../data/upgrades';
import { stageEffects, unlockedAlongPath } from '../data/evolution';
import { book } from '../economy/finance';

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  cook: 'Koch',
  service: 'Service',
  manager: 'Manager',
  reception: 'Rezeption',
  housekeeping: 'Housekeeping',
  driver: 'Fahrer',
  clerk: 'Verkäufer',
  security: 'Sicherheit',
  guard: 'Wachmann',
  investigator: 'Ermittler',
  researcher: 'Forscher',
  worker: 'Arbeiter',
  technician: 'Techniker',
  banker: 'Bankkaufmann',
  analyst: 'Kreditanalyst',
  sommelier: 'Sommelier',
  concierge: 'Concierge',
  dispatcher: 'Disponent',
};

/** Which roles each business type hires. */
export const ROLES_BY_KIND: Record<string, readonly EmployeeRole[]> = {
  gastronomy: ['cook', 'service', 'manager'],
  hotel: ['reception', 'housekeeping', 'security', 'manager'],
  transport: ['driver', 'manager'],
  retail: ['clerk', 'security', 'manager'],
  security: ['guard', 'investigator', 'manager'],
  lab: ['researcher', 'technician', 'manager'],
  industry: ['worker', 'technician', 'manager'],
  bank: ['banker', 'analyst', 'security', 'manager'],
};

const WAGE_BASE: Record<EmployeeRole, number> = { cook: 80, service: 65, manager: 140, reception: 70, housekeeping: 60, driver: 75, clerk: 62, security: 70, guard: 72, investigator: 110, researcher: 120, worker: 68, technician: 95, banker: 90, analyst: 125, sommelier: 130, concierge: 115, dispatcher: 95 };

/** Expected daily wage for a role and skill level. */
export function expectedWage(role: EmployeeRole, skill: number): number {
  return Math.round(WAGE_BASE[role] + skill * (role === 'manager' ? 1.6 : 1.1));
}

export function createEmployee(biz: StaffedBusiness, rng: Rng, role: EmployeeRole, skill: number, tick: number, wage?: number): Employee {
  return {
    id: biz.nextEntityId++,
    name: randomName(rng),
    role,
    skill: Math.round(skill),
    wage: wage ?? expectedWage(role, skill),
    morale: 65,
    hiredTick: tick,
    lowMoraleDays: 0,
  };
}

export function generateCandidates(biz: StaffedBusiness, rng: Rng, day: number, districtSkillBias: number, roles: readonly EmployeeRole[] = ROLES_BY_KIND.gastronomy!): void {
  biz.candidates = biz.candidates.filter((c) => c.expiresDay > day);
  const want = Math.round((4 - biz.candidates.length) * laborState.candidateFactor);
  for (let i = 0; i < want; i++) {
    const role = rng.pick(roles);
    const skill = Math.round(Math.max(10, Math.min(95, 35 + districtSkillBias * 0.25 + rng.gaussian() * 18)));
    const wageAsk = Math.round(expectedWage(role, skill) * rng.range(0.9, 1.2) * laborState.wageFactor);
    biz.candidates.push({ id: biz.nextEntityId++, name: randomName(rng), role, skill, wageAsk, expiresDay: day + rng.int(2, 4) });
  }
}

export function hire(ctx: SimContext, b: Building, candidateId: number): { ok: true } | { ok: false; error: string } {
  const biz = b.business as StaffedBusiness | undefined;
  if (!biz) return { ok: false, error: 'Kein Betrieb.' };
  const idx = biz.candidates.findIndex((c) => c.id === candidateId);
  if (idx < 0) return { ok: false, error: 'Bewerber nicht mehr verfügbar.' };
  if (biz.employees.length >= 10) return { ok: false, error: 'Mehr als zehn Mitarbeiter sind in diesem Betrieb nicht möglich.' };
  const c = biz.candidates[idx]!;
  biz.candidates.splice(idx, 1);
  biz.employees.push({ id: c.id, name: c.name, role: c.role, skill: c.skill, wage: c.wageAsk, morale: 70, hiredTick: ctx.state.tick, lowMoraleDays: 0 });
  ctx.events.emit({ type: 'log', tick: ctx.state.tick, level: 'info', message: `${b.label}: ${c.name} als ${ROLE_LABELS[c.role]} eingestellt (${c.wageAsk} ¢/Tag).`, buildingId: String(b.id) });
  return { ok: true };
}

export function fire(ctx: SimContext, b: Building, employeeId: number): { ok: true } | { ok: false; error: string } {
  const biz = b.business as StaffedBusiness | undefined;
  if (!biz) return { ok: false, error: 'Kein Betrieb.' };
  const idx = biz.employees.findIndex((e) => e.id === employeeId);
  if (idx < 0) return { ok: false, error: 'Mitarbeiter nicht gefunden.' };
  const e = biz.employees[idx]!;
  biz.employees.splice(idx, 1);
  // Severance: three days of wages.
  book(ctx.state, ctx.events, -e.wage * 3, { category: 'wages', description: `Abfindung: ${e.name}`, buildingId: b.id });
  ctx.events.emit({ type: 'log', tick: ctx.state.tick, level: 'warning', message: `${b.label}: ${e.name} entlassen (Abfindung ${e.wage * 3} ¢).`, buildingId: String(b.id) });
  return { ok: true };
}

export function setWage(b: Building, employeeId: number, wage: number): { ok: true } | { ok: false; error: string } {
  const biz = b.business as StaffedBusiness | undefined;
  const e = biz?.employees.find((x) => x.id === employeeId);
  if (!biz || !e) return { ok: false, error: 'Mitarbeiter nicht gefunden.' };
  if (!Number.isFinite(wage) || wage < 20 || wage > 1000) return { ok: false, error: 'Der Lohn muss zwischen 20 und 1000 ¢ liegen.' };
  e.wage = Math.round(wage);
  return { ok: true };
}

export interface StaffCapacity {
  cooks: number;
  service: number;
  managers: number;
  cookThroughput: number;
  serviceThroughput: number;
  cookSkill: number; // morale-weighted average skill of cooks
  serviceSkill: number;
  managerSkill: number;
}

/** Global strike flag set by the engine each hour; halves everyone's effort. */
export const laborState = { strike: false, blockade: false, wageFactor: 1, candidateFactor: 1 };

/** Morale-weighted effort of an employee (0.7 .. 1.1), halved during a strike. */
export function effortOf(e: Employee): number {
  const effort = 0.7 + (e.morale / 100) * 0.4;
  return laborState.strike ? effort * 0.5 : effort;
}

/** Throughput sum of a role: rate × skill factor × effort. */
export function roleThroughput(biz: StaffedBusiness, role: EmployeeRole, rate: number): { count: number; throughput: number; skill: number } {
  let count = 0;
  let throughput = 0;
  let skillSum = 0;
  for (const e of biz.employees) {
    if (e.role !== role) continue;
    count++;
    const effort = effortOf(e);
    throughput += rate * (0.6 + (e.skill / 100) * 0.8) * effort;
    skillSum += e.skill * effort;
  }
  return { count, throughput, skill: count > 0 ? skillSum / count : 0 };
}

export function staffCapacity(biz: GastronomyState, cookRate: number, serviceRate: number): StaffCapacity {
  let cooks = 0;
  let service = 0;
  let managers = 0;
  let cookThroughput = 0;
  let serviceThroughput = 0;
  let cookSkillSum = 0;
  let serviceSkillSum = 0;
  let managerSkill = 0;
  for (const e of biz.employees) {
    const effort = effortOf(e);
    if (e.role === 'cook') {
      cooks++;
      cookThroughput += cookRate * (0.6 + (e.skill / 100) * 0.8) * effort;
      cookSkillSum += e.skill * effort;
    } else if (e.role === 'service') {
      service++;
      serviceThroughput += serviceRate * (0.6 + (e.skill / 100) * 0.8) * effort;
      serviceSkillSum += e.skill * effort;
    } else {
      managers++;
      managerSkill = Math.max(managerSkill, e.skill);
    }
  }
  return {
    cooks,
    service,
    managers,
    cookThroughput,
    serviceThroughput,
    cookSkill: cooks > 0 ? cookSkillSum / cooks : 0,
    serviceSkill: service > 0 ? serviceSkillSum / service : 0,
    managerSkill,
  };
}

/** Day close: pays wages, updates morale, handles resignations. Returns wages paid. */
export function closeStaffDay(ctx: SimContext, b: Building, utilization: number): number {
  const { state, events, rng } = ctx;
  const biz = b.business as StaffedBusiness | undefined;
  if (!biz) return 0;
  const hygiene = b.business?.kind === 'gastronomy' ? b.business.hygiene : b.business?.kind === 'hotel' ? b.business.cleanliness : 100;
  const minWage = state.politics?.laws?.minimumWage ?? 0;
  const strike = state.factions?.some((f) => f.activeEffect === 'strike' && f.activeUntilDay > Math.floor((state.tick + 7 * 60) / 1440)) ?? false;
  let wages = 0;
  const bonus = upgradeEffects(biz.upgrades).morale;
  const hasManager = biz.employees.some((e) => e.role === 'manager');
  const quitters: Employee[] = [];
  for (const e of biz.employees) {
    wages += e.wage;
    if (e.wage < minWage) e.wage = minWage; // the law enforces the floor
    const fair = Math.max(minWage, expectedWage(e.role, e.skill) * laborState.wageFactor * stageEffects(b).wage); // luxury stages pay more, automation less
    const payFactor = e.wage / fair; // <1 underpaid
    if (strike) e.morale = Math.max(0, e.morale - 1);
    let target = 50 + (payFactor - 1) * 80 + bonus + (hasManager ? 6 : 0) - Math.max(0, utilization - 0.9) * 60 + (hygiene < 40 ? -10 : 0);
    target = Math.max(0, Math.min(100, target));
    e.morale = Math.max(0, Math.min(100, e.morale + (target - e.morale) * 0.25 + rng.gaussian() * 2));
    // Skill grows slowly with experience.
    e.skill = Math.min(100, e.skill + 0.15);
    if (e.morale < 18) e.lowMoraleDays++;
    else e.lowMoraleDays = 0;
    if (e.lowMoraleDays >= 3 && rng.chance(0.5)) quitters.push(e);
  }
  if (wages > 0) book(state, events, -wages, { category: 'wages', description: `Löhne: ${b.label}`, buildingId: b.id });
  for (const q of quitters) {
    biz.employees = biz.employees.filter((e) => e.id !== q.id);
    events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: ${q.name} (${ROLE_LABELS[q.role]}) hat gekündigt. Zu wenig Lohn oder zu viel Stress.`, buildingId: String(b.id) });
  }
  return wages;
}

/** Candidates are offered from the district: skill bias from purchasing power. */
export function refreshCandidates(ctx: SimContext, b: Building, day: number): void {
  const biz = b.business as StaffedBusiness | undefined;
  if (!biz) return;
  const district = ctx.state.districts[b.districtId]!;
  generateCandidates(biz, ctx.rng, day, district.stats.purchasingPower, rolesFor(b));
}

/** Roles a business hires: its kind's roles plus what its evolution stages unlocked. */
export function rolesFor(b: Building): readonly EmployeeRole[] {
  const base = ROLES_BY_KIND[b.business?.kind ?? 'gastronomy'] ?? ROLES_BY_KIND.gastronomy!;
  const extra = unlockedAlongPath(b).roles.filter((r) => !base.includes(r));
  return extra.length > 0 ? [...base, ...extra] : base;
}
