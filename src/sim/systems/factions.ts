/**
 * Factions act on their own: relations shift with what the player does
 * (wages, rents, crime, security, donations), and each faction takes
 * actions that produce decisions or direct effects.
 */

import type { SimContext } from '../core/context';
import type { FactionState, GameState, SharedFactionState } from '../state';
import { FACTIONS, FACTION_IDS, type FactionId } from '../data/factions';
import { expectedWage } from './staff';
import { createDecision } from './decisions';
import { book, canAfford } from '../economy/finance';

export function createFactions(): SharedFactionState[] {
  return FACTION_IDS.map((id) => ({ id, influence: FACTIONS[id].baseInfluence }));
}

export function factionState(state: GameState, id: FactionId): FactionState {
  return state.factions.find((f) => f.id === id)!;
}

/** True while a faction effect (strike, blockade) is active. */
export function activeEffect(state: GameState, effect: string, day: number): boolean {
  return state.factions.some((f) => f.activeEffect === effect && f.activeUntilDay > day);
}

/** Pays a faction to improve relations (meeting, sponsorship). */
export function supportFaction(ctx: SimContext, factionId: FactionId, amount: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const f = state.factions.find((x) => x.id === factionId);
  if (!f) return { ok: false, error: 'Unbekannte Fraktion.' };
  if (!Number.isFinite(amount) || amount < 500) return { ok: false, error: 'Mindestens 500 ¢.' };
  if (!canAfford(state, amount)) return { ok: false, error: 'Nicht genug Credits.' };
  book(state, events, -amount, { category: 'donation', description: `Unterstützung: ${FACTIONS[factionId].name}` });
  const gain = Math.min(25, (amount / 500) * 3 * (1 - f.influence / 250));
  f.relation = Math.max(-100, Math.min(100, f.relation + gain));
  state.politics.lifetimeDonations += amount;
  if (FACTIONS[factionId].kind === 'party') state.politics.influence = Math.min(100, state.politics.influence + amount / 1000);
  // Enemies notice.
  for (const enemy of FACTIONS[factionId].enemies) {
    const e = state.factions.find((x) => x.id === enemy);
    if (e) e.relation = Math.max(-100, e.relation - gain * 0.3);
  }
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${FACTIONS[factionId].name}: Beziehung +${gain.toFixed(1)}.` });
  return { ok: true };
}

/** Daily: relation drift from behaviour, then faction actions. */
/** City-wide faction influence; runs once per day in the shared pass. */
export function closeFactionsSharedDay(ctx: SimContext, day: number): void {
  const { state, rng } = ctx;
  for (const f of state.factions) {
    const def = FACTIONS[f.id];
    // Influence follows council strength and city state.
    if (def.kind === 'party') f.influence = Math.max(10, Math.min(100, 30 + (state.politics.council[def.id] ?? 0) * 3));
    else f.influence = Math.max(5, Math.min(100, f.influence + rng.gaussian() * 0.5));
  }
  void day;
}

/** Relations and faction actions towards one player; runs per player. */
export function closeFactionsPlayerDay(ctx: SimContext, day: number): void {
  const { state } = ctx;
  const player = playerProfile(state);
  for (const f of state.factions) {
    const def = FACTIONS[f.id];
    let drift = -f.relation * 0.02; // relations fade towards neutral
    switch (def.kind) {
      case 'union':
        drift += player.underpaidShare > 0.3 ? -1.5 : player.underpaidShare === 0 && player.employees > 0 ? 0.6 : 0;
        break;
      case 'civic':
        drift += player.highRentProperties > 0 ? -1.2 : player.properties > 0 ? 0.4 : 0;
        break;
      case 'police':
        drift += state.player.wantedLevel >= 2 ? -2 : player.patrols > 0 ? 0.8 : 0;
        break;
      case 'corporation':
        drift += player.businesses >= 4 ? -0.4 : 0.2;
        break;
      case 'hackers':
        drift += player.securedBusinesses > 0 ? -0.5 : 0.2;
        break;
      case 'activists':
        drift += player.pollutingDistricts > 0 ? -0.6 : 0.2;
        break;
      case 'party':
        drift += def.id === 'social_alliance' ? (player.underpaidShare > 0.3 ? -0.5 : 0.3) : player.businesses >= 3 ? 0.3 : 0;
        break;
      default:
        drift += 0.1;
    }
    f.relation = Math.max(-100, Math.min(100, f.relation + drift));
    if (f.activeUntilDay <= day) f.activeEffect = null;
  }
  factionActions(ctx, day, player);
}

interface PlayerProfile {
  businesses: number;
  employees: number;
  underpaidShare: number;
  properties: number;
  highRentProperties: number;
  patrols: number;
  securedBusinesses: number;
  pollutingDistricts: number;
  bestBusinessId: number | null;
  bestBusinessValue: number;
}

function playerProfile(state: GameState): PlayerProfile {
  let businesses = 0;
  let employees = 0;
  let underpaid = 0;
  let properties = 0;
  let highRent = 0;
  let patrols = 0;
  let secured = 0;
  let bestId: number | null = null;
  let bestValue = 0;
  const minWage = state.politics.laws.minimumWage ?? 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== state.playerId) continue;
    if (b.property) {
      properties++;
      if (b.property.rentLevel > 1.3) highRent++;
    }
    if (!b.business || b.status !== 'operational') continue;
    businesses++;
    if ((b.business.upgrades.security ?? 0) > 0) secured++;
    for (const e of b.business.employees) {
      employees++;
      if (e.wage < Math.max(minWage, expectedWage(e.role, e.skill) * 0.85)) underpaid++;
    }
    if (b.business.kind === 'security') patrols += Object.values(b.business.patrols).reduce((s, n) => s + n, 0);
    const last = b.business.history[b.business.history.length - 1];
    const value = last ? last.revenue - last.costs : 0;
    if (value > bestValue) {
      bestValue = value;
      bestId = b.id;
    }
  }
  const polluting = state.districts.filter((d) => d.stats.pollution > 70 && Object.values(state.buildings).some((b) => b.owner === state.playerId && b.districtId === d.id && b.business)).length;
  return { businesses, employees, underpaidShare: employees > 0 ? underpaid / employees : 0, properties, highRentProperties: highRent, patrols, securedBusinesses: secured, pollutingDistricts: polluting, bestBusinessId: bestId, bestBusinessValue: bestValue };
}

function factionActions(ctx: SimContext, day: number, player: PlayerProfile): void {
  const { state, rng } = ctx;
  if (day < 3) return; // let the player settle in
  const union = factionState(state, 'union');
  if (player.underpaidShare > 0.3 && player.employees >= 2 && union.relation < 0 && day - union.lastActionDay >= 6 && rng.chance(0.5)) {
    union.lastActionDay = day;
    const amount = Math.round(400 + player.employees * 120);
    createDecision(
      ctx,
      {
        kind: 'strike',
        title: 'Die Gewerkschaft droht mit Streik',
        text: `${Math.round(player.underpaidShare * 100)} % deiner Belegschaft verdienen deutlich unter dem Erwarteten. Die Dockarbeitergewerkschaft verlangt 10 % mehr Lohn für alle, sonst wird zwei Tage gestreikt.`,
        options: [
          { id: 'raise', label: 'Löhne um 10 % erhöhen', hint: 'Dauerhaft höhere Lohnkosten, Moral steigt, Gewerkschaft wird zum Verbündeten.' },
          { id: 'pay', label: `Einmalig ${amount} ¢ zahlen`, hint: 'Kauft Ruhe für diesmal.' },
          { id: 'endure', label: 'Streik aushalten', hint: 'Zwei Tage halbe Kapazität in allen Betrieben.' },
        ],
        context: { factionId: 'union', amount },
      },
      10,
    );
  }
  const citizens = factionState(state, 'citizens');
  if (player.highRentProperties > 0 && day - citizens.lastActionDay >= 7 && rng.chance(0.45)) {
    citizens.lastActionDay = day;
    createDecision(
      ctx,
      {
        kind: 'protest',
        title: 'Mieterprotest gegen deine Mieten',
        text: 'Der Bürgerrat Old City ruft zum Protest gegen Verdrängung auf. Deine Immobilien mit Mietniveau über 130 % stehen auf den Plakaten.',
        options: [
          { id: 'lower_rents', label: 'Mieten auf Normalniveau senken', hint: 'Weniger Miete, Bürgerrat wird freundlich.' },
          { id: 'ignore', label: 'Ignorieren', hint: 'Ein Tag Blockade, Attraktivität der Old City sinkt, Bürgerrat wird feindlich.' },
        ],
        context: { factionId: 'citizens' },
      },
      8,
    );
  }
  const kosei = factionState(state, 'kosei');
  if (player.bestBusinessId !== null && player.bestBusinessValue > 800 && day - kosei.lastActionDay >= 12 && rng.chance(0.3)) {
    kosei.lastActionDay = day;
    const b = state.buildings[player.bestBusinessId]!;
    const amount = Math.round(b.investment * 1.4 + player.bestBusinessValue * 25);
    createDecision(
      ctx,
      {
        kind: 'takeover_offer',
        title: `Übernahmeangebot für ${b.label}`,
        text: `Die Kōsei Group bietet ${amount} ¢ für ${b.label}. Der Betrieb macht täglich rund ${Math.round(player.bestBusinessValue)} ¢ Gewinn.`,
        options: [
          { id: 'accept', label: `Für ${amount} ¢ verkaufen`, hint: 'Sofortige Auszahlung, Betrieb und Personal gehen an den Konzern.' },
          { id: 'decline', label: 'Ablehnen', hint: 'Der Konzern merkt sich das.' },
        ],
        context: { factionId: 'kosei', buildingId: b.id, amount },
      },
      12,
      2,
    );
  }
  const hackers = factionState(state, 'nullsect');
  if (player.businesses > 0 && hackers.relation < 10 && day - hackers.lastActionDay >= 9 && rng.chance(0.3)) {
    hackers.lastActionDay = day;
    const targets = Object.values(state.buildings).filter((b) => b.owner === state.playerId && b.business && b.status === 'operational');
    const target = rng.pick(targets);
    const amount = Math.round(600 + (target.business!.history[target.business!.history.length - 1]?.revenue ?? 500) * 0.8);
    createDecision(
      ctx,
      {
        kind: 'cyberattack',
        title: `Cyberangriff auf ${target.label}`,
        text: `Null Sect hat die Systeme von ${target.label} verschlüsselt und verlangt ${amount} ¢. Ein Sicherheitssystem (Ausbau) hätte den Angriff abgewehrt.`,
        options: [
          { id: 'pay', label: `${amount} ¢ zahlen`, hint: 'Systeme sofort wieder frei.' },
          { id: 'refuse', label: 'Nicht zahlen', hint: 'Ohne Sicherheitssystem: Ausfall, Verlust und Rufschaden.' },
        ],
        context: { factionId: 'nullsect', buildingId: target.id, amount },
      },
      9,
      1,
    );
  }
  const media = factionState(state, 'novanet');
  if (player.businesses >= 2 && day - media.lastActionDay >= 10 && rng.chance(0.35)) {
    media.lastActionDay = day;
    const amount = 2500;
    createDecision(
      ctx,
      {
        kind: 'media_story',
        title: 'NovaNet plant eine Geschichte über dich',
        text: 'Ein Reporter recherchiert zu deiner Unternehmensgruppe. Eine Werbepartnerschaft sichert einen wohlwollenden Ton.',
        options: [
          { id: 'exclusive', label: `Werbepartnerschaft (${amount} ¢)`, hint: 'Ruf aller Betriebe +6, NovaNet wird freundlich.' },
          { id: 'none', label: 'Abwarten', hint: 'Der Ton hängt von eurer Beziehung ab.' },
        ],
        context: { factionId: 'novanet', amount },
      },
      10,
    );
  }
  const church = factionState(state, 'signal_church');
  if (player.businesses > 0 && day - church.lastActionDay >= 14 && rng.chance(0.3)) {
    church.lastActionDay = day;
    createDecision(
      ctx,
      {
        kind: 'church_donation',
        title: 'Die Kirche des Signals bittet um eine Spende',
        text: 'Die Gemeinde sammelt für ihren Sender in der Undercity. Spender werden in den Predigten empfohlen.',
        options: [
          { id: 'donate', label: '1.500 ¢ spenden', hint: 'Beziehung +20, Unternehmensruf +2.' },
          { id: 'decline', label: 'Ablehnen', hint: 'Beziehung −5.' },
        ],
        context: { factionId: 'signal_church', amount: 1500 },
      },
      14,
    );
  }
  const green = factionState(state, 'green_cell');
  if (player.pollutingDistricts > 0 && day - green.lastActionDay >= 11 && rng.chance(0.35)) {
    green.lastActionDay = day;
    const b = Object.values(state.buildings).find((x) => x.owner === state.playerId && x.business && state.districts[x.districtId]!.stats.pollution > 70);
    createDecision(
      ctx,
      {
        kind: 'blockade',
        title: 'Grüne Zelle blockiert deine Lieferungen',
        text: `Aktivisten blockieren die Zufahrten zu ${b?.label ?? 'deinem Betrieb'} wegen der Verschmutzung im Bezirk.`,
        options: [
          { id: 'negotiate', label: '2.000 ¢ Umweltprogramm', hint: 'Blockade endet, Verschmutzung −5, Beziehung +20.' },
          { id: 'wait', label: 'Aussitzen', hint: 'Ein Tag verspätete Lieferungen, Beziehung −10.' },
        ],
        context: { factionId: 'green_cell', buildingId: b?.id ?? -1, amount: 2000 },
      },
      11,
      1,
    );
  }
  const police = factionState(state, 'police');
  if (state.underworld.org && state.player.wantedLevel >= 1 && day - police.lastActionDay >= 10 && rng.chance(0.3)) {
    police.lastActionDay = day;
    createDecision(
      ctx,
      {
        kind: 'police_cooperation',
        title: 'Die Polizei bietet ein Gespräch an',
        text: 'Ermittler bieten dir an, Informationen über die Familien zu liefern. Im Gegenzug sinkt die Aufmerksamkeit auf dich.',
        options: [
          { id: 'cooperate', label: 'Kooperieren', hint: 'Aufmerksamkeit −6, Polizei +15, Familien −10.' },
          { id: 'refuse', label: 'Ablehnen', hint: 'Polizei −8.' },
        ],
        context: { factionId: 'police' },
      },
      10,
    );
  }
  // VIP visit to the best hotel or restaurant.
  if (player.bestBusinessId !== null && day - (state.decisions.cooldowns.vip_visit ?? -99) >= 0 && rng.chance(0.08)) {
    const b = state.buildings[player.bestBusinessId]!;
    createDecision(
      ctx,
      {
        kind: 'vip_visit',
        title: `Prominenz kündigt sich in ${b.label} an`,
        text: 'Ein bekannter NovaNet-Star will heute Abend vorbeikommen. Ein Empfang kostet, bringt aber Aufmerksamkeit.',
        options: [
          { id: 'host', label: 'Empfang ausrichten (1.200 ¢)', hint: 'Ruf des Betriebs +12, Unternehmensruf +5.' },
          { id: 'ignore', label: 'Normal weiterarbeiten', hint: 'Nichts passiert.' },
        ],
        context: { buildingId: b.id, amount: 1200 },
      },
      15,
      1,
    );
  }
}
