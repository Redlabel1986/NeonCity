/**
 * Decisions: events with causes, consequences and player choices. Systems
 * create pending decisions; the player resolves them via a command. Unresolved
 * decisions expire with a default outcome.
 */

import type { SimContext } from '../core/context';
import type { DecisionState, GameState, PendingDecision } from '../state';
import { tickToDate } from '../core/clock';
import { book, canAfford } from '../economy/finance';
import type { FactionId } from '../data/factions';
import { FACTIONS } from '../data/factions';
import { insuranceClaim } from './corporate';

export function createDecisionState(): DecisionState {
  return { pending: [], nextId: 1, cooldowns: {}, resolvedCount: 0 };
}

export function adjustRelation(state: GameState, factionId: FactionId, delta: number): void {
  const f = state.factions.find((x) => x.id === factionId);
  if (f) f.relation = Math.max(-100, Math.min(100, f.relation + delta));
}

export function relationOf(state: GameState, factionId: FactionId): number {
  return state.factions.find((x) => x.id === factionId)?.relation ?? 0;
}

/** Creates a decision unless the same kind is on cooldown. */
export function createDecision(ctx: SimContext, decision: Omit<PendingDecision, 'id' | 'createdTick' | 'expiresDay'>, cooldownDays: number, lifetimeDays = 3): boolean {
  const { state, events } = ctx;
  const day = tickToDate(state.tick).day;
  const d = state.decisions;
  if ((d.cooldowns[decision.kind] ?? -1) > day) return false;
  if (d.pending.some((p) => p.kind === decision.kind)) return false;
  d.cooldowns[decision.kind] = day + cooldownDays;
  d.pending.push({ ...decision, id: d.nextId++, createdTick: state.tick, expiresDay: day + lifetimeDays });
  events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `Entscheidung: ${decision.title}` });
  return true;
}

/** Expires old decisions by applying their last option (the passive one). */
export function expireDecisions(ctx: SimContext, day: number): void {
  const { state } = ctx;
  for (const p of [...state.decisions.pending]) {
    if (p.expiresDay <= day) {
      const last = p.options[p.options.length - 1]!;
      resolveDecision(ctx, p.id, last.id, true);
    }
  }
}

export function resolveDecision(ctx: SimContext, decisionId: number, optionId: string, expired = false): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const idx = state.decisions.pending.findIndex((p) => p.id === decisionId);
  if (idx < 0) return { ok: false, error: 'Diese Entscheidung ist nicht mehr offen.' };
  const p = state.decisions.pending[idx]!;
  const option = p.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: 'Unbekannte Option.' };
  const result = applyOutcome(ctx, p, optionId);
  if (!result.ok) return result;
  state.decisions.pending.splice(idx, 1);
  state.decisions.resolvedCount++;
  events.emit({ type: 'log', tick: state.tick, level: expired ? 'warning' : 'info', message: `${p.title}: ${expired ? 'nicht entschieden, ' : ''}${option.label}. ${result.summary}` });
  return { ok: true };
}

type Outcome = { ok: true; summary: string } | { ok: false; error: string };

/** Effects of each decision kind / option. Keep every effect concrete and traceable. */
function applyOutcome(ctx: SimContext, p: PendingDecision, optionId: string): Outcome {
  const { state, events, rng } = ctx;
  const buildingId = typeof p.context.buildingId === 'number' ? p.context.buildingId : -1;
  const building = state.buildings[buildingId];
  const factionId = p.context.factionId as FactionId | undefined;
  const amount = typeof p.context.amount === 'number' ? p.context.amount : 0;
  switch (p.kind) {
    case 'takeover_offer': {
      if (optionId === 'accept') {
        if (!building || building.owner !== 'player') return { ok: false, error: 'Der Betrieb existiert nicht mehr.' };
        book(state, events, amount, { category: 'other', description: `Verkauf an ${FACTIONS.kosei.name}: ${building.label}`, buildingId });
        building.owner = 'city';
        building.label = `${FACTIONS.kosei.name} ${building.label}`;
        delete building.business;
        delete building.property;
        if (factionId) adjustRelation(state, factionId, 15);
        return { ok: true, summary: `${amount} ¢ erhalten, der Betrieb gehört jetzt dem Konzern.` };
      }
      if (factionId) adjustRelation(state, factionId, -8);
      return { ok: true, summary: 'Das Angebot ist abgelehnt. Der Konzern merkt sich das.' };
    }
    case 'strike': {
      if (optionId === 'raise') {
        let raised = 0;
        for (const b of Object.values(state.buildings)) {
          if (b.owner !== 'player' || !b.business) continue;
          for (const e of b.business.employees) {
            e.wage = Math.round(e.wage * 1.1);
            e.morale = Math.min(100, e.morale + 10);
            raised++;
          }
        }
        adjustRelation(state, 'union', 20);
        return { ok: true, summary: `${raised} Löhne um 10 % erhöht, die Gewerkschaft bläst den Streik ab.` };
      }
      if (optionId === 'pay') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'other', description: 'Einmalzahlung an die Gewerkschaft' });
        adjustRelation(state, 'union', 8);
        return { ok: true, summary: `${amount} ¢ gezahlt, der Streik bleibt aus.` };
      }
      // endure: strike effect
      const f = state.factions.find((x) => x.id === 'union')!;
      f.activeEffect = 'strike';
      f.activeUntilDay = tickToDate(state.tick).day + 2;
      adjustRelation(state, 'union', -15);
      return { ok: true, summary: 'Zwei Tage Streik: halbe Kapazität in allen Betrieben.' };
    }
    case 'protest': {
      if (optionId === 'lower_rents') {
        for (const b of Object.values(state.buildings)) if (b.property && b.owner === 'player') b.property.rentLevel = Math.min(b.property.rentLevel, 1);
        adjustRelation(state, 'citizens', 18);
        return { ok: true, summary: 'Mieten auf Normalniveau gesenkt, der Protest löst sich auf.' };
      }
      if (optionId === 'ignore') {
        adjustRelation(state, 'citizens', -12);
        const home = state.districts.find((d) => d.archetype === 'old_city');
        if (home) home.stats.attractiveness = Math.max(0, home.stats.attractiveness - 4);
        return { ok: true, summary: 'Der Protest blockiert die Old City einen Tag. Attraktivität sinkt.' };
      }
      break;
    }
    case 'cyberattack': {
      if (optionId === 'pay') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'other', description: 'Lösegeld an Null Sect' });
        insuranceClaim(ctx, 'cyber', amount, 'Lösegeld');
        adjustRelation(state, 'nullsect', 5);
        return { ok: true, summary: `${amount} ¢ Lösegeld gezahlt, die Systeme laufen wieder.` };
      }
      if (building?.business) {
        const secured = (building.business.upgrades.security ?? 0) > 0;
        if (secured) return { ok: true, summary: 'Das Sicherheitssystem hat den Angriff abgewehrt.' };
        building.business.reputation = Math.max(0, building.business.reputation - 10);
        if ('hygiene' in building.business) building.business.hygiene = Math.max(0, building.business.hygiene - 20);
        const loss = Math.round(amount * 0.6);
        book(state, events, -loss, { category: 'other', description: `Cyberangriff: Ausfall ${building.label}`, buildingId });
        insuranceClaim(ctx, 'cyber', loss, `Cyberangriff ${building.label}`);
        return { ok: true, summary: `Systemausfall: ${loss} ¢ Verlust und Rufschaden.` };
      }
      return { ok: true, summary: 'Der Angriff lief ins Leere.' };
    }
    case 'media_story': {
      if (optionId === 'exclusive') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'donation', description: 'Werbepartnerschaft NovaNet' });
        adjustRelation(state, 'novanet', 15);
        for (const b of Object.values(state.buildings)) if (b.owner === 'player' && b.business) b.business.reputation = Math.min(100, b.business.reputation + 6);
        return { ok: true, summary: 'Wohlwollende Berichterstattung: Ruf aller Betriebe +6.' };
      }
      const positive = relationOf(state, 'novanet') > 0 || rng.chance(0.4);
      for (const b of Object.values(state.buildings)) if (b.owner === 'player' && b.business) b.business.reputation = Math.max(0, Math.min(100, b.business.reputation + (positive ? 3 : -7)));
      return { ok: true, summary: positive ? 'Der Bericht fällt freundlich aus (+3 Ruf).' : 'Der Bericht ist vernichtend (−7 Ruf).' };
    }
    case 'vip_visit': {
      if (optionId === 'host') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'other', description: 'Empfang für Prominenz' });
        if (building?.business) building.business.reputation = Math.min(100, building.business.reputation + 12);
        state.player.reputation = Math.min(100, state.player.reputation + 5);
        return { ok: true, summary: 'Der Besuch wird zum Stadtgespräch: Ruf +12.' };
      }
      return { ok: true, summary: 'Der Besuch verläuft unauffällig.' };
    }
    case 'blockade': {
      if (optionId === 'negotiate') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'donation', description: 'Umweltprogramm (Grüne Zelle)' });
        adjustRelation(state, 'green_cell', 20);
        const d = building ? state.districts[building.districtId] : undefined;
        if (d) d.stats.pollution = Math.max(0, d.stats.pollution - 5);
        return { ok: true, summary: 'Umweltprogramm finanziert, die Blockade endet.' };
      }
      const f = state.factions.find((x) => x.id === 'green_cell')!;
      f.activeEffect = 'blockade';
      f.activeUntilDay = tickToDate(state.tick).day + 1;
      adjustRelation(state, 'green_cell', -10);
      return { ok: true, summary: 'Ein Tag Blockade: Lieferungen verspäten sich.' };
    }
    case 'church_donation': {
      if (optionId === 'donate') {
        if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
        book(state, events, -amount, { category: 'donation', description: 'Spende an die Kirche des Signals' });
        adjustRelation(state, 'signal_church', 20);
        state.player.reputation = Math.min(100, state.player.reputation + 2);
        return { ok: true, summary: 'Die Gemeinde dankt und empfiehlt deine Betriebe.' };
      }
      adjustRelation(state, 'signal_church', -5);
      return { ok: true, summary: 'Keine Spende.' };
    }
    case 'police_cooperation': {
      if (optionId === 'cooperate') {
        adjustRelation(state, 'police', 15);
        state.underworld.heat = Math.max(0, state.underworld.heat - 6);
        for (const f of state.underworld.rivals) f.relation = Math.max(-100, f.relation - 10);
        return { ok: true, summary: 'Kooperation mit der Polizei: Aufmerksamkeit −6, Familien misstrauen dir.' };
      }
      adjustRelation(state, 'police', -8);
      return { ok: true, summary: 'Keine Kooperation. Die Polizei merkt es sich.' };
    }
    default:
      break;
  }
  return { ok: true, summary: '' };
}
