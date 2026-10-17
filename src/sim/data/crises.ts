/** Economic crises with concrete, temporary effects. */

export interface CrisisDefinition {
  id: string;
  name: string;
  description: string;
  /** Days the crisis lasts (min..max). */
  days: readonly [number, number];
  /** Base chance per day to start when no crisis runs. */
  chance: number;
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
};

export const CRISIS_IDS: readonly string[] = Object.keys(CRISES);
