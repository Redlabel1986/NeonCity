/** Economic crises with concrete, temporary effects. */

export interface CrisisDefinition {
  id: string;
  name: string;
  description: string;
  /** Days the crisis lasts (min..max). */
  days: readonly [number, number];
  /** Base chance per day to start when no crisis runs. */
  chance: number;
  /** Region-only event (data/regions.ts); undefined = city-wide. */
  region?: import('./regions').RegionId;
}

export const CRISES: Record<string, CrisisDefinition> = {
  energy_shortage: { id: 'energy_shortage', name: 'Energieknappheit', description: 'Das Netz rationiert Strom. Energieversorgung aller Bezirke −30, Baustellen langsamer, Fabriken drosseln.', days: [4, 8], chance: 0.012 },
  supply_chain: { id: 'supply_chain', name: 'Lieferkettenkrise', description: 'Häfen gesperrt: Einkaufspreise +50 %, Lieferungen doppelt so lang.', days: [5, 9], chance: 0.012 },
  recession: { id: 'recession', name: 'Rezession', description: 'Kaufkraft −15 % in allen Bezirken, weniger Gäste und Reisende.', days: [8, 14], chance: 0.008 },
  property_bubble: { id: 'property_bubble', name: 'Immobilienblase', description: 'Grundstückspreise +60 %. Am Ende platzt die Blase: −35 %.', days: [10, 16], chance: 0.006 },
  labor_shortage: { id: 'labor_shortage', name: 'Arbeitskräftemangel', description: 'Weniger Bewerber, Lohnerwartungen +25 %.', days: [6, 10], chance: 0.01 },
  cyber_wave: { id: 'cyber_wave', name: 'Cyberangriffswelle', description: 'Ungesicherte Betriebe verlieren jeden Tag mit 30 % Chance einen Tagesumsatz.', days: [3, 5], chance: 0.01 },
  general_strike: { id: 'general_strike', name: 'Generalstreik', description: 'Stadtweiter Streik: Personal arbeitet mit halber Leistung.', days: [2, 3], chance: 0.006 },
  hyperinflation: { id: 'hyperinflation', name: 'Hyperinflation', description: 'Alle Einkaufspreise und Lohnerwartungen +35 %.', days: [6, 10], chance: 0.005 },
  financial_scandal: { id: 'financial_scandal', name: 'Finanzskandal', description: 'Banken verdoppeln Zinsen, Investoren ziehen 20 % ihres Kapitals ab.', days: [5, 8], chance: 0.006 },
  // Regional events
  village_fair: { id: 'village_fair', name: 'Dorffest in Greenhaven', description: 'Wochenmarkt und Fest: Betriebe in Greenhaven haben 40 % mehr Nachfrage.', days: [2, 3], chance: 0.02, region: 'greenhaven' },
  harvest_failure: { id: 'harvest_failure', name: 'Ernteausfall', description: 'Unwetter über den Feldern: Gemüse, Kräuter und Getreide kosten 50 % mehr, Höfe ernten weniger.', days: [4, 7], chance: 0.01, region: 'greenhaven' },
  traffic_jam: { id: 'traffic_jam', name: 'Verkehrschaos in Silverbrook', description: 'Baustellen auf allen Ausfallstraßen: Taxis schaffen 30 % weniger Fahrten, Läden 10 % weniger Kunden.', days: [2, 4], chance: 0.015, region: 'silverbrook' },
  chain_competition: { id: 'chain_competition', name: 'Handelskette eröffnet', description: 'Eine große Kette eröffnet in Silverbrook: Einzelhandel dort verliert 20 % Kunden.', days: [6, 10], chance: 0.008, region: 'silverbrook' },
  corp_scandal: { id: 'corp_scandal', name: 'Konzernskandal', description: 'Entlassungswelle in Neon Central: Kaufkraft dort −12 %, Demonstrationen.', days: [5, 8], chance: 0.01, region: 'neon_central' },
  megacity_blackout: { id: 'megacity_blackout', name: 'Megacity-Blackout', description: 'Nova Eclipse ohne Strom: Energieversorgung dort −40, Flugtaxis bleiben am Boden.', days: [2, 4], chance: 0.01, region: 'nova_eclipse' },
};

export const CRISIS_IDS: readonly string[] = Object.keys(CRISES);
