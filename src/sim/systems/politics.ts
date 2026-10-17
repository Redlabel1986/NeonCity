/**
 * Politics: city council, elections, laws with real effects, proposals,
 * donations, district influence and initiatives, taxes, and the dynamic
 * development of districts (gentrification, decay, crime drift).
 */

import type { SimContext } from '../core/context';
import type { GameState, PoliticsState } from '../state';
import { COUNCIL_SEATS, ELECTION_INTERVAL_DAYS, FACTIONS, LAWS, PARTY_IDS } from '../data/factions';
import { DISTRICT_ARCHETYPES } from '../data/districts';
import { book, canAfford } from '../economy/finance';
import { DIFFICULTIES } from '../data/difficulty';

export function createPolitics(): PoliticsState {
  return {
    influence: 0,
    council: { progress_bloc: 13, social_alliance: 11 },
    laws: Object.fromEntries(Object.values(LAWS).map((l) => [l.id, l.defaultValue])),
    proposals: [],
    nextProposalId: 1,
    nextElectionDay: ELECTION_INTERVAL_DAYS,
    districtInfluence: {},
    initiativeCooldownDay: {},
    lifetimeTaxes: 0,
    lifetimeDonations: 0,
  };
}

export function lawValue(state: GameState, lawId: string): number {
  return state.politics.laws[lawId] ?? LAWS[lawId]?.defaultValue ?? 0;
}

/** Share of council seats held by the party that favours the given change. */
export function councilSupport(state: GameState, lawId: string, value: number): number {
  const law = LAWS[lawId];
  if (!law) return 0;
  const current = lawValue(state, lawId);
  const direction = Math.sign(value - current) * law.progressBias; // +1 when the progress bloc likes it
  const progress = state.politics.council.progress_bloc ?? 0;
  const social = state.politics.council.social_alliance ?? 0;
  const favouring = direction > 0 ? progress : direction < 0 ? social : COUNCIL_SEATS / 2;
  const base = favouring / COUNCIL_SEATS;
  const influence = state.politics.influence / 100;
  return Math.max(0.05, Math.min(0.95, base * 0.8 + influence * 0.35));
}

export function proposeLaw(ctx: SimContext, lawId: string, value: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const law = LAWS[lawId];
  if (!law) return { ok: false, error: 'Unbekanntes Gesetz.' };
  if (!law.options.some((o) => o.value === value)) return { ok: false, error: 'Ungültiger Wert.' };
  if (value === lawValue(state, lawId)) return { ok: false, error: 'Das gilt bereits.' };
  if (state.politics.proposals.some((p) => p.lawId === lawId)) return { ok: false, error: 'Zu diesem Gesetz liegt schon ein Antrag vor.' };
  if (state.politics.influence < 10) return { ok: false, error: 'Du brauchst mindestens 10 Einfluss, um einen Antrag einzubringen (Spenden an Parteien, Immobilien, Betriebe).' };
  const cost = 2000;
  if (!canAfford(state, cost)) return { ok: false, error: `Ein Antrag kostet ${cost} ¢ Lobbyarbeit.` };
  book(state, events, -cost, { category: 'donation', description: `Antrag: ${law.name} ${law.options.find((o) => o.value === value)?.label}` });
  const day = Math.floor((state.tick + 7 * 60) / 1440);
  state.politics.proposals.push({ id: state.politics.nextProposalId++, lawId, value, by: 'player', voteDay: day + 3, support: councilSupport(state, lawId, value) });
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Antrag eingebracht: ${law.name} → ${law.options.find((o) => o.value === value)?.label}. Abstimmung in drei Tagen.` });
  return { ok: true };
}

export function districtInitiative(ctx: SimContext, districtId: number, kind: 'infrastructure' | 'safety' | 'beauty'): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const d = state.districts[districtId];
  if (!d) return { ok: false, error: 'Unbekannter Bezirk.' };
  const day = Math.floor((state.tick + 7 * 60) / 1440);
  if ((state.politics.initiativeCooldownDay[districtId] ?? 0) > day) return { ok: false, error: 'In diesem Bezirk läuft bereits eine Initiative.' };
  const influence = state.politics.districtInfluence[districtId] ?? 0;
  if (influence < 15) return { ok: false, error: `Du brauchst mindestens 15 Einfluss in ${d.name} (Betriebe und Immobilien dort).` };
  const cost = Math.round(6000 * DIFFICULTIES[state.player.difficulty].costMultiplier);
  if (!canAfford(state, cost)) return { ok: false, error: `Eine Initiative kostet ${cost} ¢.` };
  book(state, events, -cost, { category: 'donation', description: `Bezirksinitiative ${d.name}` });
  if (kind === 'infrastructure') {
    d.stats.infrastructure = Math.min(100, d.stats.infrastructure + 8);
    d.stats.energySupply = Math.min(100, d.stats.energySupply + 6);
    d.stats.traffic = Math.min(100, d.stats.traffic + 4);
  } else if (kind === 'safety') {
    d.stats.policePresence = Math.min(100, d.stats.policePresence + 10);
    d.stats.crime = Math.max(0, d.stats.crime - 8);
  } else {
    d.stats.attractiveness = Math.min(100, d.stats.attractiveness + 8);
    d.stats.pollution = Math.max(0, d.stats.pollution - 6);
  }
  state.politics.initiativeCooldownDay[districtId] = day + 10;
  state.politics.influence = Math.min(100, state.politics.influence + 2);
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Initiative in ${d.name} umgesetzt (${kind === 'infrastructure' ? 'Infrastruktur' : kind === 'safety' ? 'Sicherheit' : 'Aufwertung'}).` });
  return { ok: true };
}

/** Day close: taxes, proposals, elections, influence, district dynamics. */
export function closePoliticsDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const pol = state.politics;
  // Taxes on today's sales.
  const dayStart = state.tick - 1440;
  let sales = 0;
  for (const t of state.ledger.transactions) if (t.tick > dayStart && t.category === 'sales') sales += t.amount;
  const rate = lawValue(state, 'salesTax');
  const tax = Math.round(sales * rate);
  if (tax > 0) {
    book(state, events, -tax, { category: 'tax', description: `Umsatzsteuer ${Math.round(rate * 100)} %` });
    pol.lifetimeTaxes += tax;
  }
  // Proposals come to a vote.
  for (const p of [...pol.proposals]) {
    if (p.voteDay > day) continue;
    pol.proposals = pol.proposals.filter((x) => x.id !== p.id);
    const law = LAWS[p.lawId]!;
    const support = councilSupport(state, p.lawId, p.value);
    const passed = rng.chance(support);
    if (passed) {
      pol.laws[p.lawId] = p.value;
      pol.influence = Math.min(100, pol.influence + 3);
      events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Der Rat beschließt: ${law.name} → ${law.options.find((o) => o.value === p.value)?.label} (${Math.round(support * 100)} % Zustimmung).` });
      applyLawSideEffects(state, p.lawId);
    } else {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `Antrag abgelehnt: ${law.name} (${Math.round(support * 100)} % Zustimmung).` });
    }
  }
  // Factions file their own proposals occasionally.
  if (rng.chance(0.08) && pol.proposals.length < 2) {
    const party = rng.pick(PARTY_IDS);
    const law = rng.pick(Object.values(LAWS));
    const current = lawValue(state, law.id);
    const bias = party === 'progress_bloc' ? law.progressBias : -law.progressBias;
    const candidates = law.options.filter((o) => Math.sign(o.value - current) === bias);
    if (candidates.length > 0 && !pol.proposals.some((p) => p.lawId === law.id)) {
      const option = rng.pick(candidates);
      pol.proposals.push({ id: pol.nextProposalId++, lawId: law.id, value: option.value, by: party, voteDay: day + 3, support: councilSupport(state, law.id, option.value) });
      events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${FACTIONS[party].name} beantragt: ${law.name} → ${option.label}. Abstimmung in drei Tagen.` });
    }
  }
  // Elections.
  if (day >= pol.nextElectionDay) {
    pol.nextElectionDay = day + ELECTION_INTERVAL_DAYS;
    const progressVote = state.districts.reduce((s, d) => s + d.economy.citizens * (d.stats.purchasingPower / 100), 0);
    const socialVote = state.districts.reduce((s, d) => s + d.economy.citizens * (1 - d.stats.purchasingPower / 100) * (1 + (d.economy.citizens > 0 ? 1 - d.economy.employed / d.economy.citizens : 0)), 0);
    const progressRel = state.factions.find((f) => f.id === 'progress_bloc')!.relation;
    const socialRel = state.factions.find((f) => f.id === 'social_alliance')!.relation;
    const pw = progressVote * (1 + progressRel / 400) * rng.range(0.9, 1.1);
    const sw = socialVote * (1 + socialRel / 400) * rng.range(0.9, 1.1);
    const progressSeats = Math.round((pw / (pw + sw)) * COUNCIL_SEATS);
    pol.council = { progress_bloc: progressSeats, social_alliance: COUNCIL_SEATS - progressSeats };
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Ratswahl: Fortschrittsblock ${progressSeats} Sitze, Soziale Allianz ${COUNCIL_SEATS - progressSeats} Sitze.` });
  }
  // Player influence from assets and relations; decays slowly.
  const assets = Object.values(state.buildings).filter((b) => b.owner === 'player' && (b.business || b.property));
  const mediaRel = state.factions.find((f) => f.id === 'novanet')!.relation;
  const hallRel = state.factions.find((f) => f.id === 'city_hall')!.relation;
  const target = Math.min(100, assets.length * 2.5 + Math.max(0, mediaRel) * 0.2 + Math.max(0, hallRel) * 0.2 + pol.lifetimeDonations / 2000);
  pol.influence = Math.max(0, Math.min(100, pol.influence + (target - pol.influence) * 0.1));
  for (const d of state.districts) {
    const local = assets.filter((b) => b.districtId === d.id).length;
    const t = Math.min(100, local * 12 + (pol.influence / 4));
    pol.districtInfluence[d.id] = Math.max(0, Math.min(100, (pol.districtInfluence[d.id] ?? 0) + (t - (pol.districtInfluence[d.id] ?? 0)) * 0.15));
    d.stats.politicalInfluence = Math.max(0, Math.min(100, d.stats.politicalInfluence * 0.98 + pol.districtInfluence[d.id]! * 0.02));
  }
  developDistricts(ctx);
}

function applyLawSideEffects(state: GameState, lawId: string): void {
  if (lawId === 'rentCap') {
    const cap = lawValue(state, 'rentCap');
    for (const b of Object.values(state.buildings)) if (b.property && b.property.rentLevel > cap) b.property.rentLevel = cap;
  }
  if (lawId === 'minimumWage') {
    const min = lawValue(state, 'minimumWage');
    for (const b of Object.values(state.buildings)) if (b.owner === 'player' && b.business) for (const e of b.business.employees) if (e.wage < min) e.wage = min;
  }
}

/** Dynamic district development: gentrification, decay, crime and police drift. */
function developDistricts(ctx: SimContext): void {
  const { state, rng } = ctx;
  const policeBudget = lawValue(state, 'policeBudget');
  const minWage = lawValue(state, 'minimumWage');
  const curfew = lawValue(state, 'curfew');
  const zoning = lawValue(state, 'zoning');
  for (const d of state.districts) {
    const base = DISTRICT_ARCHETYPES[d.archetype].stats;
    const s = d.stats;
    // Attractiveness: venues with good reputation, well-kept properties, low crime, zoning.
    let venueQuality = 0;
    let venueCount = 0;
    let conditionSum = 0;
    let conditionCount = 0;
    for (const b of Object.values(state.buildings)) {
      if (b.districtId !== d.id) continue;
      if (b.business && b.owner === 'player' && b.status === 'operational') {
        venueQuality += b.business.reputation;
        venueCount++;
      }
      if (b.property) {
        conditionSum += b.property.condition;
        conditionCount++;
      }
    }
    for (const c of Object.values(state.competitors)) {
      if (c.districtId !== d.id) continue;
      venueQuality += c.reputation;
      venueCount++;
    }
    const venueTerm = venueCount > 0 ? (venueQuality / venueCount - 50) / 50 : 0;
    const conditionTerm = conditionCount > 0 ? (conditionSum / conditionCount - 60) / 60 : 0;
    const attractivenessTarget = base.attractiveness + venueTerm * 12 + conditionTerm * 8 - (s.crime - base.crime) * 0.3 + (zoning - 1) * 20 - (s.pollution - base.pollution) * 0.2;
    s.attractiveness = clamp(s.attractiveness + clamp((attractivenessTarget - s.attractiveness) * 0.04, -0.6, 0.6), 0, 100);
    // Rents and land prices follow attractiveness (gentrification).
    const rentTarget = base.rentIndex * (0.7 + s.attractiveness / 125);
    s.rentIndex = Math.max(3, Math.round((s.rentIndex + (rentTarget - s.rentIndex) * 0.03) * 10) / 10);
    const landTarget = base.landPrice * (0.7 + s.attractiveness / 125);
    s.landPrice = Math.max(100, Math.round(s.landPrice + (landTarget - s.landPrice) * 0.03));
    // Police presence follows budget; crime follows unemployment, police, curfew and gang control.
    const policeTarget = base.policePresence * policeBudget;
    s.policePresence = clamp(s.policePresence + (policeTarget - s.policePresence) * 0.03, 0, 100);
    const unemployment = d.economy.citizens > 0 ? 1 - d.economy.employed / d.economy.citizens : 0.3;
    const gang = Object.values(state.underworld.rivals).reduce((sum, f) => sum + (f.control[d.id] ?? 0), 0) + (state.underworld.org?.control[d.id] ?? 0);
    const crimeTarget = base.crime * (0.6 + unemployment) - (s.policePresence - base.policePresence) * 0.4 - curfew * 4 + gang * 0.15;
    s.crime = clamp(s.crime + clamp((crimeTarget - s.crime) * 0.04, -0.8, 0.8), 0, 100);
    // Minimum wage lifts purchasing power in poor districts a little, costs jobs in very poor ones.
    if (minWage > 0) {
      if (base.purchasingPower < 45) s.purchasingPower = clamp(s.purchasingPower + 0.05, 0, 100);
    }
    // Displacement: expensive districts lose low-income citizens to cheaper ones.
    if (s.rentIndex > base.rentIndex * 1.25 && rng.chance(0.5)) {
      const cheaper = state.districts.filter((o) => o.stats.rentIndex < s.rentIndex * 0.6);
      if (cheaper.length > 0) {
        const mover = state.population.citizens.find((c) => c.districtId === d.id && c.income < 60 + s.rentIndex && rng.chance(0.2));
        if (mover) {
          const target = rng.pick(cheaper);
          const homes = Object.values(state.buildings).filter((b) => b.owner === 'city' && b.districtId === target.id);
          if (homes.length > 0) {
            mover.districtId = target.id;
            mover.homeBuildingId = rng.pick(homes).id;
          }
        }
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
