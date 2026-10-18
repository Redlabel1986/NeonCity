/** Research trees. Each node needs credits, lab days (researcher output) and its prerequisites. */

export type ResearchTree = 'automation' | 'energy' | 'medtech' | 'logistics' | 'gastronomy' | 'security' | 'fintech' | 'construction' | 'ai';

export interface ResearchNode {
  id: string;
  tree: ResearchTree;
  name: string;
  description: string;
  effect: string;
  cost: number;
  /** Research points needed (one researcher of skill 50 yields ~10 per day). */
  points: number;
  requires: readonly string[];
}

export const RESEARCH_TREES: Record<ResearchTree, string> = {
  automation: 'Automatisierung',
  energy: 'Energie',
  medtech: 'Cyberware & Medizin',
  logistics: 'Logistik',
  gastronomy: 'Gastronomie',
  security: 'Sicherheit',
  fintech: 'Finanztechnologie',
  construction: 'Bauwesen',
  ai: 'Künstliche Intelligenz',
};

export const RESEARCH: Record<string, ResearchNode> = {
  kitchen_automation: { id: 'kitchen_automation', tree: 'automation', name: 'Küchenautomation', description: 'Robotische Kochstationen in allen Lokalen.', effect: 'Kochleistung +15 %', cost: 9000, points: 60, requires: [] },
  robotic_housekeeping: { id: 'robotic_housekeeping', tree: 'automation', name: 'Robotisches Housekeeping', description: 'Reinigungsdrohnen für Hotels.', effect: 'Zimmerkosten −20 %', cost: 12000, points: 80, requires: ['kitchen_automation'] },
  autonomous_assist: { id: 'autonomous_assist', tree: 'automation', name: 'Fahrassistenz', description: 'Teilautonome Taxis entlasten die Fahrer.', effect: 'Fahrten je Fahrer +25 %', cost: 15000, points: 100, requires: ['kitchen_automation'] },
  autonomous_driving: { id: 'autonomous_driving', tree: 'automation', name: 'Autonomes Fahren', description: 'Robotaxis fahren ohne Fahrer.', effect: 'Schaltet autonome Flotten und Flugtaxis im Entwicklungsbaum frei', cost: 26000, points: 180, requires: ['autonomous_assist'] },
  ai_concierge: { id: 'ai_concierge', tree: 'ai', name: 'KI-Concierge', description: 'Ein Butler, der jeden Gast kennt.', effect: 'Schaltet Fünf-Sterne-Hotels im Entwicklungsbaum frei, Hotelkomfort +4', cost: 22000, points: 150, requires: ['demand_forecast'] },
  microgrid: { id: 'microgrid', tree: 'energy', name: 'Microgrid', description: 'Eigene Energiezellen in jedem Betrieb.', effect: 'Betriebskosten −15 %, Fabrik-Energie −30 %', cost: 11000, points: 80, requires: [] },
  fusion_cells: { id: 'fusion_cells', tree: 'energy', name: 'Fusionszellen', description: 'Kompakte Fusionszellen machen unabhängig vom Netz.', effect: 'Energiekrisen treffen dich nur halb', cost: 24000, points: 160, requires: ['microgrid'] },
  wellness_implants: { id: 'wellness_implants', tree: 'medtech', name: 'Wellness-Implantate', description: 'Komfortmodule für Hotelgäste.', effect: 'Hotelkomfort +8', cost: 10000, points: 70, requires: [] },
  stim_license: { id: 'stim_license', tree: 'medtech', name: 'Stim-Lizenz', description: 'Lizenzierte Stims und Medikamente im Einzelhandel.', effect: 'Warenkorb im Einzelhandel +15 %', cost: 8000, points: 60, requires: [] },
  drone_delivery: { id: 'drone_delivery', tree: 'logistics', name: 'Lieferdrohnen', description: 'Drohnen übernehmen die Zustellung von Lieferanten.', effect: 'Lieferzeiten −40 %', cost: 9000, points: 60, requires: [] },
  cold_chain: { id: 'cold_chain', tree: 'logistics', name: 'Kühlkette', description: 'Durchgehende Kühlung von Lieferung bis Lager.', effect: 'Haltbarkeit +2 Tage', cost: 7000, points: 50, requires: [] },
  synth_cuisine: { id: 'synth_cuisine', tree: 'gastronomy', name: 'Synth-Küche', description: 'Neue Gerichte aus Laborprotein.', effect: 'Rezepte Synth-Sushi und Labor-Steak', cost: 6000, points: 45, requires: [] },
  flavor_profiling: { id: 'flavor_profiling', tree: 'gastronomy', name: 'Geschmacksprofile', description: 'Gäste bekommen, was sie mögen.', effect: 'Zufriedenheit +5 in Lokalen', cost: 10000, points: 70, requires: ['synth_cuisine'] },
  surveillance_ai: { id: 'surveillance_ai', tree: 'security', name: 'Überwachungs-KI', description: 'Kameras werten Muster aus.', effect: 'Streifeneffekt +30 %, Schwund −50 %', cost: 12000, points: 90, requires: [] },
  credit_scoring: { id: 'credit_scoring', tree: 'fintech', name: 'Kreditscoring', description: 'Bessere Bonitätsmodelle der Banken.', effect: 'Kreditzins −2 Punkte, Prämien −20 %', cost: 8000, points: 60, requires: [] },
  prefab: { id: 'prefab', tree: 'construction', name: 'Modulbau', description: 'Vorgefertigte Module beschleunigen Neubauten.', effect: 'Bauzeit −30 %, Baukosten −10 %', cost: 10000, points: 70, requires: [] },
  demand_forecast: { id: 'demand_forecast', tree: 'ai', name: 'Nachfrageprognose', description: 'KI plant Einkauf und Produktion.', effect: 'Verderb −50 %, Nachbestellung passt sich an', cost: 14000, points: 100, requires: [] },
  dynamic_pricing: { id: 'dynamic_pricing', tree: 'ai', name: 'Dynamische Preise', description: 'Preise folgen der Nachfrage in Echtzeit.', effect: 'Umsatz +6 % in allen Betrieben', cost: 20000, points: 140, requires: ['demand_forecast'] },
};

export const RESEARCH_IDS: readonly string[] = Object.keys(RESEARCH);
