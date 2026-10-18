/**
 * Universal business evolution: every business type owns a directed graph of
 * stages (stable ids). A stage carries prerequisites, cost and duration,
 * what it unlocks (recipes, staff roles, rooms, mechanics) and the effects
 * the economy applies. Branches are specialisations; a business may stop
 * at any node. Pure data; `systems/evolution.ts` runs the conversions.
 *
 * Effect levels 1-6 give every chain the same economic ladder, overridden
 * where a specialisation is deliberately different (prestige is not profit:
 * an omakase counter has few seats and very high prices, a fast-food chain
 * the opposite).
 */

import type { Building, EmployeeRole } from '../state';
import { BUILDING_DEFINITIONS } from './buildings';

/** Mechanics a stage switches on; each one is implemented in the simulation (see GAME_DESIGN.md). */
export type Feature =
  | 'delivery' // extra orders served from the kitchen without seats
  | 'reservations' // fewer guests turned away, smoother capacity
  | 'critics' // restaurant critics visit; stars raise draw and price acceptance
  | 'franchise' // the player may sign franchisees that pay licence fees
  | 'automation' // robots: throughput up, wages down, staff morale less relevant
  | 'nightlife' // opening hours move into the night
  | 'vip' // VIP guests appear more often and pay a premium
  | 'wellness' // hotel: spa services add revenue per stay and comfort
  | 'casino' // hotel: gaming floor adds revenue per stay, attracts incidents
  | 'conference' // hotel: business bookings stabilise demand
  | 'driverless' // transport: vehicles run without a driver (at a lower rate)
  | 'air' // transport: air taxis, large radius and premium fares
  | 'armored' // transport/security: secured transports, higher contract value
  | 'dispatch' // transport: central dispatch, fewer missed rides
  | 'group'; // organisational level: holding features (franchise, brand)

export interface StageEffects {
  capacity: number;
  throughput: number;
  draw: number;
  quality: number;
  price: number;
  upkeep: number;
  radius: number;
  lines: number;
  /** Multiplier on the wages staff expect (luxury needs qualified people). */
  wage: number;
  /** Credits per occupied room-night from extra services (hotel). */
  extraPerStay: number;
  /** Bank: deposits allowed per credit of reserve, multiplier. */
  leverage: number;
  /** Opening hours override (gastronomy). */
  hours: { open: number; close: number } | null;
}

export interface StageRequirements {
  /** Business reputation 0-100. */
  reputation?: number;
  /** Average guest satisfaction yesterday 0-100. */
  satisfaction?: number;
  /** Revenue of the last closed day. */
  revenuePerDay?: number;
  /** Days since the building opened. */
  ageDays?: number;
  /** A staff member with at least this skill in the role. */
  staff?: { role: EmployeeRole; skill: number };
  /** Research node that must be unlocked. */
  research?: string;
  /** A room upgrade level that must exist. */
  upgrade?: { id: string; level: number };
}

export interface StageUnlocks {
  recipes?: readonly string[];
  roles?: readonly EmployeeRole[];
  upgrades?: readonly string[];
}

export interface StageArt {
  floors: number;
  style?: 'rural' | 'suburb' | 'corporate' | 'market' | 'docks' | 'ghost' | 'old' | 'chrome' | 'undercity' | 'skyline';
  sign?: string;
  color?: number;
}

export interface Stage {
  id: string;
  name: string;
  description: string;
  /** Economic ladder 1-6; also the player level gate (see PLAYER_LEVELS.maxBusinessTier). */
  level: number;
  /** Branch label ("japanisch", "fastfood"); null on the main path. */
  specialization: string | null;
  /** Credits before difficulty scaling. */
  cost: number;
  /** Game minutes before difficulty scaling. */
  minutes: number;
  requires: StageRequirements;
  unlocks: StageUnlocks;
  effects: StageEffects;
  features: readonly Feature[];
  next: readonly string[];
  art: StageArt;
  /** What the player gains and risks, shown in the tree. */
  pros: string;
  cons: string;
}

export interface EvolutionTree {
  businessTypeId: string;
  initialStageId: string;
  stages: Record<string, Stage>;
}

export const MAX_LEVEL = 6;

const LEVEL_DEFAULTS: readonly StageEffects[] = [
  { capacity: 1, throughput: 1, draw: 1, quality: 0, price: 1, upkeep: 1, radius: 1, lines: 0, wage: 1, extraPerStay: 0, leverage: 1, hours: null },
  { capacity: 1.3, throughput: 1.2, draw: 1.25, quality: 4, price: 1.1, upkeep: 1.5, radius: 1.15, lines: 0, wage: 1.05, extraPerStay: 0, leverage: 1.2, hours: null },
  { capacity: 1.7, throughput: 1.45, draw: 1.55, quality: 9, price: 1.25, upkeep: 2.2, radius: 1.3, lines: 1, wage: 1.1, extraPerStay: 0, leverage: 1.5, hours: null },
  { capacity: 2.2, throughput: 1.75, draw: 1.9, quality: 15, price: 1.45, upkeep: 3.2, radius: 1.5, lines: 1, wage: 1.2, extraPerStay: 0, leverage: 1.9, hours: null },
  { capacity: 2.8, throughput: 2.1, draw: 2.3, quality: 22, price: 1.7, upkeep: 4.5, radius: 1.7, lines: 2, wage: 1.35, extraPerStay: 0, leverage: 2.4, hours: null },
  { capacity: 3.2, throughput: 2.4, draw: 2.6, quality: 26, price: 1.9, upkeep: 5.5, radius: 1.9, lines: 2, wage: 1.5, extraPerStay: 0, leverage: 3, hours: null },
];
const LEVEL_COST = [0, 0, 0.8, 1.6, 2.8, 4.5, 6.5];
const LEVEL_TIME = [0, 0, 0.5, 0.7, 0.9, 1.1, 1.3];
export const LEVEL_REPUTATION = [0, 0, 30, 45, 60, 75, 80];

export function levelDefaults(level: number): StageEffects {
  return LEVEL_DEFAULTS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1]!;
}

interface StageSpec {
  desc: string;
  spec?: string;
  next?: readonly string[];
  eff?: Partial<StageEffects>;
  feat?: readonly Feature[];
  req?: StageRequirements;
  unl?: StageUnlocks;
  art: StageArt;
  cost?: number;
  minutes?: number;
  pros: string;
  cons: string;
}

function buildTree(defId: string, initial: string, specs: Record<string, [name: string, level: number, spec: StageSpec]>): EvolutionTree {
  const def = BUILDING_DEFINITIONS[defId];
  if (!def) throw new Error(`Evolution: unknown building ${defId}`);
  const stages: Record<string, Stage> = {};
  for (const [id, [name, level, s]] of Object.entries(specs)) {
    const base = levelDefaults(level);
    stages[id] = {
      id,
      name,
      description: s.desc,
      level,
      specialization: s.spec ?? null,
      cost: s.cost ?? Math.round(def.cost * LEVEL_COST[level]!),
      minutes: s.minutes ?? Math.round(def.buildTimeMinutes * LEVEL_TIME[level]!),
      requires: { ...(level >= 2 ? { reputation: LEVEL_REPUTATION[level] } : {}), ...(s.req ?? {}) },
      unlocks: s.unl ?? {},
      effects: { ...base, ...(s.eff ?? {}) },
      features: s.feat ?? [],
      next: s.next ?? [],
      art: s.art,
      pros: s.pros,
      cons: s.cons,
    };
  }
  for (const st of Object.values(stages)) for (const n of st.next) if (!stages[n]) throw new Error(`Evolution ${defId}: ${st.id} → ${n} fehlt`);
  if (!stages[initial]) throw new Error(`Evolution ${defId}: Startstufe ${initial} fehlt`);
  return { businessTypeId: defId, initialStageId: initial, stages };
}

const NEON = { pink: 0xff2bd6, cyan: 0x19e6ff, amber: 0xffb020, acid: 0x8cff3a, red: 0xff3a5a, orange: 0xff8a1f, white: 0xf0f0ff };

// ----------------------------------------------------------- Asian gastronomy

const asia = buildTree('ramen_bar', 'asia.imbiss', {
  'asia.imbiss': ['Asia-Imbiss', 1, { desc: 'Nudelsuppen über die Theke, ein paar Hocker, viel Dampf.', next: ['asia.ramen', 'asia.noodle', 'asia.korean_street', 'asia.neon_ramen'], art: { floors: 2, sign: 'ASIA', color: NEON.amber }, pros: 'Günstig, schnell, kaum Risiko.', cons: 'Kleine Karte, kleine Marge.' }],
  // Main path
  'asia.ramen': ['Ramenbar', 2, { desc: 'Offene Küche, Neonreklame, Stammgäste bis in die Nacht.', next: ['asia.restaurant', 'asia.izakaya'], unl: { recipes: ['tonkotsu_ramen'], upgrades: ['delivery_kitchen'] }, art: { floors: 2, sign: 'RAMEN', color: NEON.pink }, pros: 'Mehr Plätze und Tonkotsu-Ramen auf der Karte; Lieferküche möglich.', cons: 'Höhere Betriebskosten.' }],
  'asia.restaurant': ['Asiatisches Restaurant', 3, { desc: 'Separate Sitzbereiche, mehrere Köche, Reservierungen.', next: ['asia.premium'], feat: ['reservations'], unl: { recipes: ['synth_sushi', 'peking_duck'], roles: ['sommelier'] }, req: { staff: { role: 'cook', skill: 55 } }, art: { floors: 3, style: 'market', sign: 'ASIA HOUSE', color: NEON.pink }, pros: 'Reservierungen, Sushi und Ente, ein Sommelier hebt die Qualität.', cons: 'Braucht einen Koch mit Fähigkeit 55, Löhne +10 %.' }],
  'asia.premium': ['Gehobenes China-/Japan-Restaurant', 4, { desc: 'Hochwertige Möbel, exklusive Fassade, Tasting-Menüs.', next: ['asia.star'], feat: ['reservations', 'vip'], unl: { recipes: ['tasting_menu'], upgrades: ['vip_lounge'] }, req: { satisfaction: 70, staff: { role: 'cook', skill: 65 } }, art: { floors: 4, style: 'chrome', sign: 'KAISEKI', color: NEON.cyan }, pros: 'Preisniveau +45 %, VIP-Gäste, VIP-Lounge ausbaubar.', cons: 'Anspruchsvolle Gäste: Zufriedenheit 70 nötig, Löhne +20 %.' }],
  'asia.star': ['Sternerestaurant', 5, { desc: 'Fine Dining mit Hologrammen und VIP-Bereich. Kritiker kommen unangekündigt.', next: ['asia.group'], feat: ['reservations', 'vip', 'critics'], eff: { capacity: 1.8, price: 2.4, upkeep: 6, wage: 1.6, quality: 30, draw: 1.9 }, req: { satisfaction: 78, staff: { role: 'cook', skill: 75 }, upgrade: { id: 'kitchen', level: 2 } }, art: { floors: 5, style: 'skyline', sign: 'ÉTOILE', color: NEON.white }, pros: 'Sterne der Kritiker: jeder Stern +12 % Anziehung und höhere Preisakzeptanz.', cons: 'Weniger Plätze als ein großes Lokal, Betriebskosten ×6, Löhne +60 %. Prestige ist nicht gleich Gewinn.' }],
  'asia.group': ['Internationale Restaurantgruppe', 6, { desc: 'Organisationsebene: eigene Marke, Franchise-Verträge, Catering.', feat: ['reservations', 'vip', 'critics', 'franchise', 'group'], eff: { capacity: 1.8, price: 2.4, upkeep: 6.5, wage: 1.6, quality: 30, draw: 2.1 }, req: { ageDays: 20, revenuePerDay: 6000 }, art: { floors: 5, style: 'skyline', sign: 'ÉTOILE GROUP', color: NEON.white }, pros: 'Franchise-Lizenzen bringen tägliche Gebühren ohne eigenes Gebäude.', cons: 'Franchisenehmer verwässern den Ruf, wenn die Qualität sinkt.' }],
  // Japanese
  'asia.izakaya': ['Izakaya', 3, { desc: 'Japanische Kneipe: kleine Gerichte, Sake, lange Nächte.', spec: 'japanisch', next: ['asia.sushi'], feat: ['nightlife'], eff: { hours: { open: 17, close: 3 }, draw: 1.6, price: 1.2 }, unl: { recipes: ['yakitori', 'sake_set'] }, art: { floors: 2, style: 'old', sign: 'IZAKAYA', color: NEON.red }, pros: 'Abend- und Nachtgeschäft, Getränkeumsatz.', cons: 'Tagsüber geschlossen.' }],
  'asia.sushi': ['Sushi-Restaurant', 4, { desc: 'Theke, Laufband, Fisch aus dem Zuchttank.', spec: 'japanisch', next: ['asia.omakase'], feat: ['reservations'], unl: { recipes: ['synth_sushi', 'sashimi_plate'], roles: ['sommelier'] }, req: { staff: { role: 'cook', skill: 65 } }, art: { floors: 3, style: 'chrome', sign: 'SUSHI', color: NEON.cyan }, pros: 'Hohe Qualität, gutes Preisniveau.', cons: 'Braucht einen Koch mit Fähigkeit 65.' }],
  'asia.omakase': ['Omakase-Restaurant', 5, { desc: 'Zwölf Plätze, ein Meister, ein Menü. Kritiker lieben es.', spec: 'japanisch', next: ['asia.luxury_jp'], feat: ['reservations', 'vip', 'critics'], eff: { capacity: 0.9, price: 3, upkeep: 4, wage: 1.7, quality: 34, draw: 1.4 }, unl: { recipes: ['omakase_menu'] }, req: { satisfaction: 80, staff: { role: 'cook', skill: 80 } }, art: { floors: 3, style: 'skyline', sign: 'OMAKASE', color: NEON.white }, pros: 'Preisniveau ×3, höchste Qualität.', cons: 'Nur wenige Plätze: Umsatz hängt an Preis und Sternen.' }],
  'asia.luxury_jp': ['Luxusrestaurant', 6, { desc: 'Marke mit Strahlkraft, Franchise in anderen Städten.', spec: 'japanisch', feat: ['reservations', 'vip', 'critics', 'franchise', 'group'], eff: { capacity: 1.2, price: 3, upkeep: 5, wage: 1.7, quality: 34, draw: 1.8 }, req: { ageDays: 20 }, art: { floors: 4, style: 'skyline', sign: 'KIWAMI', color: NEON.white }, pros: 'Franchise-Gebühren, Marke.', cons: 'Rufpflege wird zum Vollzeitjob.' }],
  // Chinese
  'asia.noodle': ['Nudelrestaurant', 2, { desc: 'Handgezogene Nudeln, große Portionen, Familien.', spec: 'chinesisch', next: ['asia.china'], eff: { capacity: 1.5, price: 1, draw: 1.35 }, unl: { recipes: ['dan_dan_noodles'] }, art: { floors: 2, sign: 'NUDELN', color: NEON.amber }, pros: 'Mehr Plätze, mehr Laufkundschaft.', cons: 'Normales Preisniveau.' }],
  'asia.china': ['China-Restaurant', 3, { desc: 'Runde Tische, Drehteller, Dim Sum am Wochenende.', spec: 'chinesisch', next: ['asia.dimsum'], feat: ['reservations', 'delivery'], eff: { capacity: 1.9, draw: 1.6 }, unl: { recipes: ['dim_sum', 'peking_duck'], upgrades: ['delivery_kitchen'] }, art: { floors: 3, style: 'old', sign: 'CHINA', color: NEON.red }, pros: 'Lieferdienst und große Säle.', cons: 'Küche muss mithalten.' }],
  'asia.dimsum': ['Premium-Dim-Sum-Haus', 4, { desc: 'Teewagen, Körbe, Gäste aus den Türmen.', spec: 'chinesisch', next: ['asia.luxury_cn'], feat: ['reservations', 'delivery', 'vip'], unl: { recipes: ['dim_sum_premium'], upgrades: ['vip_lounge'], roles: ['sommelier'] }, req: { satisfaction: 70, staff: { role: 'cook', skill: 65 } }, art: { floors: 4, style: 'chrome', sign: 'DIM SUM', color: NEON.amber }, pros: 'Preisniveau +45 %, VIP.', cons: 'Zufriedenheit 70 nötig.' }],
  'asia.luxury_cn': ['Luxusrestaurant', 5, { desc: 'Bankette für Konzerne und Familien, Kritiker inklusive.', spec: 'chinesisch', next: ['asia.empire'], feat: ['reservations', 'vip', 'critics'], eff: { capacity: 2.4, price: 2.1, upkeep: 5.5, wage: 1.5 }, req: { satisfaction: 76, staff: { role: 'cook', skill: 72 } }, art: { floors: 5, style: 'skyline', sign: 'JADE', color: NEON.acid }, pros: 'Große Säle bei hohem Preisniveau.', cons: 'Betriebskosten ×5,5.' }],
  'asia.empire': ['Restaurantimperium', 6, { desc: 'Franchise-Ketten unter einer Marke.', spec: 'chinesisch', feat: ['reservations', 'vip', 'critics', 'franchise', 'group'], eff: { capacity: 2.4, price: 2.1, upkeep: 6, wage: 1.5, draw: 2.6 }, req: { ageDays: 20, revenuePerDay: 6000 }, art: { floors: 5, style: 'skyline', sign: 'JADE GROUP', color: NEON.acid }, pros: 'Lizenzgebühren.', cons: 'Qualitätskontrolle.' }],
  // Korean
  'asia.korean_street': ['Korean Streetfood', 2, { desc: 'Tteokbokki, Kimchi, scharf und schnell.', spec: 'koreanisch', next: ['asia.korean_bbq'], eff: { draw: 1.35, price: 1.05 }, unl: { recipes: ['tteokbokki'] }, art: { floors: 2, sign: 'K-STREET', color: NEON.red }, pros: 'Laufkundschaft.', cons: 'Kleine Marge.' }],
  'asia.korean_bbq': ['Korean BBQ', 3, { desc: 'Tischgrills, Gruppen, Bier. Laut und voll.', spec: 'koreanisch', next: ['asia.korean_premium'], feat: ['reservations', 'nightlife'], eff: { capacity: 1.9, hours: { open: 16, close: 2 }, draw: 1.7 }, unl: { recipes: ['korean_bbq', 'bibimbap'] }, art: { floors: 3, style: 'market', sign: 'K-BBQ', color: NEON.orange }, pros: 'Große Gruppen, Getränke.', cons: 'Hygiene leidet schneller.' }],
  'asia.korean_premium': ['Premium-Korean-Restaurant', 4, { desc: 'Hanwoo-Synth, private Räume.', spec: 'koreanisch', next: ['asia.korean_fine'], feat: ['reservations', 'vip'], unl: { recipes: ['hanwoo_set'], upgrades: ['vip_lounge'], roles: ['sommelier'] }, req: { satisfaction: 70 }, art: { floors: 4, style: 'chrome', sign: 'SEOUL', color: NEON.orange }, pros: 'Preisniveau +45 %.', cons: 'Zufriedenheit 70 nötig.' }],
  'asia.korean_fine': ['Fine Dining', 5, { desc: 'Koreanische Haute Cuisine, Kritiker und Sterne.', spec: 'koreanisch', feat: ['reservations', 'vip', 'critics'], eff: { capacity: 1.6, price: 2.5, upkeep: 5.5, wage: 1.6, quality: 30 }, req: { satisfaction: 78, staff: { role: 'cook', skill: 75 } }, art: { floors: 5, style: 'skyline', sign: 'HANSIK', color: NEON.white }, pros: 'Sterne.', cons: 'Wenig Plätze, hohe Kosten.' }],
  // Cyberpunk
  'asia.neon_ramen': ['Neon-Ramenbar', 2, { desc: 'Holo-Speisekarte, Bestellterminals, Nachtvolk.', spec: 'cyberpunk', next: ['asia.robot_ramen'], feat: ['nightlife', 'delivery'], eff: { hours: { open: 18, close: 5 }, draw: 1.3 }, unl: { recipes: ['tonkotsu_ramen'], upgrades: ['delivery_kitchen'] }, art: { floors: 2, style: 'undercity', sign: 'NEON RAMEN', color: NEON.pink }, pros: 'Lieferdienst und Nachtgeschäft.', cons: 'Tagsüber zu.' }],
  'asia.robot_ramen': ['Roboter-Ramenbar', 3, { desc: 'Kochroboter, ein Techniker, kaum Personal.', spec: 'cyberpunk', next: ['asia.auto_restaurant'], feat: ['delivery', 'automation'], eff: { throughput: 2, wage: 0.8, quality: 6 }, unl: { upgrades: ['robot_kitchen'], roles: ['technician'] }, req: { research: 'kitchen_automation' }, art: { floors: 3, style: 'chrome', sign: 'ROBO RAMEN', color: NEON.cyan }, pros: 'Doppelter Küchendurchsatz, Löhne −20 %.', cons: 'Braucht die Forschung Küchenautomation; Gäste vermissen Menschen (Qualität nur +6).' }],
  'asia.auto_restaurant': ['Vollautomatisches Restaurant', 4, { desc: 'Keine Kellner, Förderbänder, Drohnenlieferung.', spec: 'cyberpunk', next: ['asia.holo'], feat: ['delivery', 'automation', 'reservations'], eff: { throughput: 2.6, wage: 0.7, capacity: 2.4, quality: 10, price: 1.3 }, req: { research: 'kitchen_automation', staff: { role: 'technician', skill: 60 } }, art: { floors: 4, style: 'chrome', sign: 'AUTOMAT', color: NEON.cyan }, pros: 'Masse bei niedrigen Löhnen.', cons: 'Techniker nötig; Preisniveau bleibt mittel.' }],
  'asia.holo': ['Holographic Dining Experience', 5, { desc: 'Jeder Tisch eine andere Welt. Kritiker streiten, Gäste zahlen.', spec: 'cyberpunk', feat: ['delivery', 'automation', 'reservations', 'vip', 'critics'], eff: { throughput: 2.6, wage: 0.9, capacity: 2, quality: 24, price: 2.2, upkeep: 6 }, req: { satisfaction: 75, research: 'kitchen_automation' }, art: { floors: 5, style: 'chrome', sign: 'HOLO DINE', color: NEON.pink }, pros: 'Hohes Preisniveau mit Automatisierung.', cons: 'Energie- und Betriebskosten ×6.' }],
});

// ---------------------------------------------------------- Classic snack bar

const imbiss = buildTree('diner', 'imbiss.bude', {
  'imbiss.bude': ['Imbissbude', 1, { desc: 'Pommes, Nudelbox, Synth-Spieße. Schnell und ehrlich.', next: ['imbiss.doener', 'imbiss.burger', 'imbiss.currywurst', 'imbiss.falafel', 'imbiss.pizza'], art: { floors: 1, sign: 'IMBISS', color: NEON.cyan }, pros: 'Billig.', cons: 'Klein.' }],
  // Turkish grill path (main)
  'imbiss.doener': ['Dönerladen', 2, { desc: 'Drehspieß, Fladenbrot, lange Schlangen nach Mitternacht.', spec: 'grill', next: ['imbiss.turkish'], eff: { draw: 1.4, hours: { open: 10, close: 4 } }, unl: { recipes: ['doener', 'lahmacun'] }, art: { floors: 1, sign: 'DÖNER', color: NEON.red }, pros: 'Starke Laufkundschaft bis in die Nacht.', cons: 'Hygiene fällt schneller.' }],
  'imbiss.turkish': ['Türkisches Restaurant', 3, { desc: 'Tische, Tee, Familienfeiern.', spec: 'grill', next: ['imbiss.grill'], feat: ['reservations'], unl: { recipes: ['adana_grill', 'meze_plate'] }, art: { floors: 2, style: 'old', sign: 'ANATOLIA', color: NEON.red }, pros: 'Reservierungen, größere Karte.', cons: 'Mehr Personal.' }],
  'imbiss.grill': ['Gehobenes Grillrestaurant', 4, { desc: 'Holzkohle, Synth-Lamm, Weinkarte.', spec: 'grill', next: ['imbiss.star', 'imbiss.steakhouse'], feat: ['reservations', 'vip'], unl: { recipes: ['grill_platter'], roles: ['sommelier'], upgrades: ['vip_lounge'] }, req: { satisfaction: 70, staff: { role: 'cook', skill: 65 } }, art: { floors: 3, style: 'chrome', sign: 'GRILL', color: NEON.orange }, pros: 'Preisniveau +45 %.', cons: 'Zufriedenheit 70.' }],
  'imbiss.steakhouse': ['Steakhouse', 5, { desc: 'Dry-aged Synth, Spezialisierung statt Sterne.', spec: 'grill', feat: ['reservations', 'vip'], eff: { capacity: 2.2, price: 2, upkeep: 4.5, wage: 1.4 }, unl: { recipes: ['lab_steak', 'tomahawk'] }, req: { satisfaction: 72, staff: { role: 'cook', skill: 70 } }, art: { floors: 4, style: 'skyline', sign: 'STEAK', color: NEON.orange }, pros: 'Hohe Preise ohne Kritikerdruck.', cons: 'Teure Zutaten.' }],
  'imbiss.star': ['Sternerestaurant', 5, { desc: 'Vom Döner zum Stern. Kritiker kommen.', spec: 'grill', next: ['imbiss.chain'], feat: ['reservations', 'vip', 'critics'], eff: { capacity: 1.8, price: 2.4, upkeep: 6, wage: 1.6, quality: 30 }, req: { satisfaction: 78, staff: { role: 'cook', skill: 75 }, upgrade: { id: 'kitchen', level: 2 } }, art: { floors: 5, style: 'skyline', sign: 'ÉTOILE', color: NEON.white }, pros: 'Sterne.', cons: 'Wenig Plätze, Kosten ×6.' }],
  'imbiss.chain': ['Internationale Restaurantkette', 6, { desc: 'Franchise unter deiner Marke.', spec: 'grill', feat: ['reservations', 'vip', 'critics', 'franchise', 'group'], eff: { capacity: 1.8, price: 2.4, upkeep: 6.5, wage: 1.6, quality: 30 }, req: { ageDays: 20, revenuePerDay: 5000 }, art: { floors: 5, style: 'skyline', sign: 'ÉTOILE GROUP', color: NEON.white }, pros: 'Lizenzgebühren.', cons: 'Ruf.' }],
  // Burger / fast food path
  'imbiss.burger': ['Burgerladen', 2, { desc: 'Synth-Patties, Fritteuse, Takeaway.', spec: 'fastfood', next: ['imbiss.fastfood'], eff: { throughput: 1.4, draw: 1.3, price: 0.95 }, unl: { recipes: ['synth_burger', 'fries'] }, art: { floors: 1, sign: 'BURGER', color: NEON.amber }, pros: 'Schnelle Küche.', cons: 'Niedriges Preisniveau.' }],
  'imbiss.fastfood': ['Fastfood-Restaurant', 3, { desc: 'Bestellterminals, Standardprozesse, Masse.', spec: 'fastfood', next: ['imbiss.drivein'], feat: ['delivery'], eff: { throughput: 1.9, capacity: 2.1, draw: 1.7, price: 0.9, quality: 2 }, unl: { recipes: ['menu_box'], upgrades: ['delivery_kitchen'] }, art: { floors: 2, style: 'market', sign: 'FAST', color: NEON.amber }, pros: 'Hoher Durchsatz, Lieferdienst.', cons: 'Qualität bleibt flach.' }],
  'imbiss.drivein': ['Drive-in', 4, { desc: 'Autoschlange rund um die Uhr.', spec: 'fastfood', next: ['imbiss.franchise'], feat: ['delivery'], eff: { throughput: 2.3, capacity: 2.8, draw: 2.1, price: 0.9, hours: { open: 0, close: 24 }, quality: 4, wage: 1 }, req: { revenuePerDay: 2500 }, art: { floors: 2, style: 'market', sign: 'DRIVE-IN', color: NEON.amber }, pros: '24 Stunden offen, große Kapazität.', cons: 'Braucht 2.500 ¢ Tagesumsatz.' }],
  'imbiss.franchise': ['Franchise-Kette', 5, { desc: 'Dein Logo an fremden Fassaden.', spec: 'fastfood', next: ['imbiss.global'], feat: ['delivery', 'franchise'], eff: { throughput: 2.3, capacity: 3.2, draw: 2.5, price: 0.9, upkeep: 3.5, quality: 4, hours: { open: 0, close: 24 }, wage: 1 }, req: { ageDays: 15, revenuePerDay: 4000 }, art: { floors: 3, style: 'corporate', sign: 'CHROME BURGER', color: NEON.amber }, pros: 'Masse plus Lizenzgebühren; oft mehr Gewinn als ein Sternerestaurant.', cons: 'Kein Prestige, Qualitätskontrolle.' }],
  'imbiss.global': ['Globaler Fastfood-Konzern', 6, { desc: 'Die Marke gehört der Stadt.', spec: 'fastfood', feat: ['delivery', 'franchise', 'group'], eff: { throughput: 2.5, capacity: 3.6, draw: 2.9, price: 0.95, upkeep: 4, quality: 5, hours: { open: 0, close: 24 }, wage: 1 }, req: { ageDays: 30, revenuePerDay: 7000 }, art: { floors: 4, style: 'corporate', sign: 'CHROME BURGER HQ', color: NEON.amber }, pros: 'Höchste Franchise-Gebühren.', cons: 'Betriebskosten ×4.' }],
  // Smaller specialisations
  'imbiss.currywurst': ['Currywurst-Bude', 2, { desc: 'Ketchup, Curry, Pappschale. Kult.', spec: 'currywurst', eff: { draw: 1.45, price: 0.95, upkeep: 1.2 }, unl: { recipes: ['currywurst'] }, art: { floors: 1, sign: 'CURRY', color: NEON.red }, pros: 'Sehr viel Laufkundschaft bei kleinen Kosten.', cons: 'Keine weiteren Stufen.' }],
  'imbiss.falafel': ['Falafel & Vegan', 2, { desc: 'Kichererbsen statt Synth-Fleisch.', spec: 'vegan', next: ['imbiss.vegan'], eff: { draw: 1.2, price: 1.1, quality: 6 }, unl: { recipes: ['falafel_wrap'] }, art: { floors: 1, sign: 'VEGAN', color: NEON.acid }, pros: 'Gute Marge, zufriedene Gäste.', cons: 'Kleinere Zielgruppe.' }],
  'imbiss.vegan': ['Veganes Restaurant', 3, { desc: 'Ohne Synth-Fleisch, mit Reservierung.', spec: 'vegan', feat: ['reservations'], eff: { price: 1.35, quality: 12 }, unl: { recipes: ['vegan_bowl'] }, art: { floors: 2, style: 'skyline', sign: 'GREEN', color: NEON.acid }, pros: 'Hohes Preisniveau für Stufe 3.', cons: 'Endstufe dieses Zweigs.' }],
  'imbiss.pizza': ['Pizzeria', 2, { desc: 'Steinofen, Lieferfahrer, Familienabende.', spec: 'pizza', feat: ['delivery'], eff: { capacity: 1.4, draw: 1.3 }, unl: { recipes: ['pizza'], upgrades: ['delivery_kitchen'] }, art: { floors: 2, sign: 'PIZZA', color: NEON.orange }, pros: 'Lieferdienst ab Stufe 2.', cons: 'Keine weiteren Stufen.' }],
});

// ------------------------------------------------------------ Street food

const stand = buildTree('food_stand', 'stand.base', {
  'stand.base': ['Streetfood-Stand', 1, { desc: 'Synth-Grill auf Rädern.', next: ['stand.truck', 'stand.coffee', 'stand.drinks'], art: { floors: 1 }, pros: 'Billigster Einstieg.', cons: 'Sechs Plätze.' }],
  'stand.truck': ['Foodtruck', 2, { desc: 'Größere Küche, Markenlogo, Festivals.', next: ['stand.garden'], eff: { draw: 1.4 }, unl: { recipes: ['synth_burger'] }, art: { floors: 1, sign: 'TRUCK', color: NEON.amber }, pros: 'Mehr Anziehung.', cons: 'Immer noch wenig Plätze.' }],
  'stand.garden': ['Streetfood-Garten', 3, { desc: 'Biergarten-Atmosphäre, mehrere Stände, Musik.', feat: ['nightlife'], eff: { capacity: 2.2, hours: { open: 12, close: 2 }, draw: 1.8 }, next: ['stand.hall'], unl: { recipes: ['synth_skewer', 'korean_bbq'] }, art: { floors: 1, style: 'market', sign: 'GARTEN', color: NEON.acid }, pros: 'Viele Plätze, Abendgeschäft.', cons: 'Wetterabhängig.' }],
  'stand.hall': ['Markthalle', 4, { desc: 'Überdachte Halle mit Dutzenden Ständen. Dein Name am Eingang.', feat: ['reservations'], eff: { capacity: 3, draw: 2.3, price: 1.2 }, art: { floors: 2, style: 'market', sign: 'MARKTHALLE', color: NEON.acid }, pros: 'Masse.', cons: 'Endstufe.' }],
  // Café path
  'stand.coffee': ['Kaffeestand', 2, { desc: 'Synth-Espresso für Pendler, 6 bis 18 Uhr.', spec: 'café', next: ['stand.cafe'], eff: { hours: { open: 6, close: 18 }, draw: 1.3, price: 1.1 }, unl: { recipes: ['synth_coffee', 'pastry'] }, art: { floors: 1, sign: 'KAFFEE', color: NEON.amber }, pros: 'Morgengeschäft.', cons: 'Abends zu.' }],
  'stand.cafe': ['Kleines Café', 3, { desc: 'Sitzplätze, Kuchen, Laptops.', spec: 'café', next: ['stand.premium_cafe'], eff: { hours: { open: 7, close: 20 }, capacity: 1.8, price: 1.2 }, unl: { recipes: ['cake'] }, art: { floors: 2, style: 'old', sign: 'CAFÉ', color: NEON.amber }, pros: 'Gemütlich, gute Marge.', cons: 'Kleine Küche.' }],
  'stand.premium_cafe': ['Premium-Café', 4, { desc: 'Single-Origin-Synth, Barista-Wettbewerbe.', spec: 'café', next: ['stand.lounge'], feat: ['vip'], eff: { hours: { open: 7, close: 22 }, price: 1.5, quality: 16 }, req: { satisfaction: 70 }, art: { floors: 2, style: 'chrome', sign: 'ROAST', color: NEON.amber }, pros: 'Preisniveau +50 %.', cons: 'Zufriedenheit 70.' }],
  'stand.lounge': ['Luxus-Coffee-Lounge', 5, { desc: 'Ledersessel in der Skyline, Kritiker trinken mit.', spec: 'café', next: ['stand.cafe_chain'], feat: ['vip', 'critics'], eff: { hours: { open: 8, close: 23 }, price: 2, quality: 22, capacity: 1.6, upkeep: 4 }, req: { satisfaction: 75 }, art: { floors: 3, style: 'skyline', sign: 'LOUNGE', color: NEON.white }, pros: 'Hohe Preise.', cons: 'Wenig Plätze.' }],
  'stand.cafe_chain': ['Internationale Café-Kette', 6, { desc: 'Franchise an jeder Ecke.', spec: 'café', feat: ['vip', 'critics', 'franchise', 'group'], eff: { hours: { open: 6, close: 23 }, price: 1.8, quality: 20, capacity: 2.2, upkeep: 4.5 }, req: { ageDays: 20, revenuePerDay: 3000 }, art: { floors: 3, style: 'corporate', sign: 'ROAST GROUP', color: NEON.white }, pros: 'Lizenzgebühren.', cons: 'Ruf.' }],
  // Bar / nightlife path
  'stand.drinks': ['Getränkestand', 2, { desc: 'Synth-Bier vom Fass, Abend- und Nachtgäste.', spec: 'nachtleben', next: ['stand.pub'], feat: ['nightlife'], eff: { hours: { open: 17, close: 3 }, draw: 1.3 }, unl: { recipes: ['cocktail'] }, art: { floors: 1, sign: 'DRINKS', color: NEON.pink }, pros: 'Nachtgeschäft.', cons: 'Tagsüber zu.' }],
  'stand.pub': ['Kneipe', 3, { desc: 'Tresen, Stammtisch, Jukebox.', spec: 'nachtleben', next: ['stand.cocktail'], feat: ['nightlife'], eff: { hours: { open: 17, close: 4 }, capacity: 1.9, draw: 1.6 }, unl: { recipes: ['bar_snacks'] }, art: { floors: 2, style: 'old', sign: 'PUB', color: NEON.pink }, pros: 'Viele Plätze.', cons: 'Mehr Ärger: Hygiene und Zwischenfälle.' }],
  'stand.cocktail': ['Cocktailbar', 4, { desc: 'Mixologen, Neon, teure Gläser.', spec: 'nachtleben', next: ['stand.vip_club'], feat: ['nightlife', 'vip'], eff: { hours: { open: 19, close: 5 }, price: 1.6, quality: 14 }, unl: { recipes: ['signature_cocktail'], roles: ['sommelier'], upgrades: ['vip_lounge'] }, req: { satisfaction: 68 }, art: { floors: 2, style: 'chrome', sign: 'COCKTAILS', color: NEON.cyan }, pros: 'Preisniveau +60 %.', cons: 'Sommelier nötig für volle Qualität.' }],
  'stand.vip_club': ['VIP-Nachtclub', 5, { desc: 'Türsteher, Separees, Konzernkinder.', spec: 'nachtleben', next: ['stand.club_brand'], feat: ['nightlife', 'vip', 'critics'], eff: { hours: { open: 22, close: 6 }, price: 2.3, capacity: 2.6, draw: 2.4, upkeep: 5.5, wage: 1.4 }, req: { satisfaction: 72, upgrade: { id: 'security', level: 1 } }, art: { floors: 3, style: 'skyline', sign: 'ECLIPSE', color: NEON.pink }, pros: 'Hohes Preisniveau bei großer Kapazität.', cons: 'Sicherheitssystem Pflicht, Betriebskosten ×5,5.' }],
  'stand.club_brand': ['Internationale Clubmarke', 6, { desc: 'Franchise-Clubs, Events, Merchandise.', spec: 'nachtleben', feat: ['nightlife', 'vip', 'critics', 'franchise', 'group'], eff: { hours: { open: 22, close: 6 }, price: 2.3, capacity: 2.8, draw: 2.6, upkeep: 6, wage: 1.4 }, req: { ageDays: 20, revenuePerDay: 5000 }, art: { floors: 4, style: 'skyline', sign: 'ECLIPSE GROUP', color: NEON.pink }, pros: 'Lizenzgebühren.', cons: 'Ruf.' }],
});

// ------------------------------------------------------------------ Hotels

const capsule = buildTree('capsule_hotel', 'hotel.capsule', {
  'hotel.capsule': ['Kapselhotel', 1, { desc: 'Schlafkapseln für Pendler.', next: ['hotel.budget', 'hotel.robot'], art: { floors: 4, style: 'chrome', sign: 'CAPSULE', color: NEON.cyan }, pros: 'Hohe Auslastung.', cons: 'Wenig Komfort.' }],
  'hotel.budget': ['Budgethotel', 2, { desc: 'Echte Zimmer, Frühstücksautomat.', next: ['hotel.business', 'hotel.theme'], eff: { quality: 10 }, unl: { upgrades: ['conference_rooms'] }, art: { floors: 5, style: 'chrome', sign: 'HOTEL', color: NEON.cyan }, pros: 'Komfort +10.', cons: 'Mehr Reinigung.' }],
  'hotel.business': ['Businesshotel', 3, { desc: 'Konferenzräume, Shuttle, Expresskasse.', next: ['hotel.luxury', 'hotel.wellness', 'hotel.security'], feat: ['conference'], eff: { quality: 18 }, unl: { roles: ['concierge'], upgrades: ['conference_rooms'] }, art: { floors: 7, style: 'corporate', sign: 'BUSINESS', color: NEON.cyan }, pros: 'Konferenzbuchungen stabilisieren die Nachfrage.', cons: 'Konzerngäste verlangen Service.' }],
  'hotel.luxury': ['Luxushotel', 4, { desc: 'Suiten, Concierge, Dachbar.', next: ['hotel.cyber5', 'hotel.casino'], feat: ['conference', 'vip'], eff: { quality: 28, price: 1.6, extraPerStay: 25 }, unl: { roles: ['concierge'], upgrades: ['vip_lounge', 'wellness_spa'] }, req: { satisfaction: 72, staff: { role: 'reception', skill: 65 } }, art: { floors: 10, style: 'skyline', sign: 'GRAND', color: NEON.white }, pros: 'VIP-Gäste, Zusatzumsatz je Nacht.', cons: 'Zufriedenheit 72 nötig, Löhne +20 %.' }],
  'hotel.cyber5': ['Fünf-Sterne-Cyberhotel', 5, { desc: 'KI-Butler, Holo-Suiten, Landeplatz.', next: ['hotel.group'], feat: ['conference', 'vip', 'wellness'], eff: { quality: 40, price: 2.2, extraPerStay: 60, upkeep: 5, wage: 1.4 }, req: { satisfaction: 78, research: 'ai_concierge' }, art: { floors: 14, style: 'skyline', sign: 'NOVA PALACE', color: NEON.white }, pros: 'Höchstes Preisniveau.', cons: 'Forschung KI-Concierge nötig; Kosten ×5.' }],
  'hotel.group': ['Internationale Hotelgruppe', 6, { desc: 'Marke, Franchise, Buchungsplattform.', feat: ['conference', 'vip', 'wellness', 'franchise', 'group'], eff: { quality: 40, price: 2.2, extraPerStay: 60, upkeep: 5.5, wage: 1.4, draw: 2.8 }, req: { ageDays: 25 }, art: { floors: 14, style: 'skyline', sign: 'NOVA GROUP', color: NEON.white }, pros: 'Franchise-Gebühren.', cons: 'Ruf.' }],
  'hotel.theme': ['Themenhotel', 3, { desc: 'Jedes Zimmer eine Cyberpunk-Legende.', spec: 'thema', eff: { draw: 1.9, quality: 12, price: 1.3 }, art: { floors: 6, style: 'undercity', sign: 'LEGENDS', color: NEON.pink }, pros: 'Starke Anziehung.', cons: 'Endstufe.' }],
  'hotel.wellness': ['Wellnesshotel', 4, { desc: 'Spa, Synth-Thermen, Stille.', spec: 'wellness', next: ['hotel.sky_resort'], feat: ['wellness'], eff: { quality: 26, price: 1.5, extraPerStay: 40, capacity: 1.8 }, unl: { upgrades: ['wellness_spa'] }, req: { satisfaction: 70 }, art: { floors: 8, style: 'skyline', sign: 'SPA', color: NEON.acid }, pros: 'Spa-Umsatz je Nacht.', cons: 'Weniger Zimmer je Fläche.' }],
  'hotel.sky_resort': ['Exklusives Sky-Resort', 5, { desc: 'Über den Wolken, nur mit Flugtaxi.', spec: 'wellness', feat: ['wellness', 'vip'], eff: { quality: 42, price: 2.6, extraPerStay: 90, capacity: 1.4, upkeep: 5.5, wage: 1.5 }, req: { satisfaction: 80 }, art: { floors: 16, style: 'skyline', sign: 'SKY RESORT', color: NEON.white }, pros: 'Höchster Umsatz je Gast.', cons: 'Wenige Zimmer.' }],
  'hotel.security': ['Hochsicherheitshotel', 4, { desc: 'Panzerglas, Scanner, Diskretion.', spec: 'sicherheit', feat: ['armored', 'vip'], eff: { quality: 20, price: 1.7, draw: 1.5 }, req: { upgrade: { id: 'security', level: 2 } }, art: { floors: 9, style: 'corporate', sign: 'FORTRESS', color: NEON.red }, pros: 'Keine Zwischenfälle, hohe Preise.', cons: 'Sicherheitssystem Stufe 2 nötig, Endstufe.' }],
  'hotel.casino': ['Casinohotel', 5, { desc: 'Spieltische in der Lobby, Gäste bleiben länger.', spec: 'casino', feat: ['casino', 'vip'], eff: { quality: 30, price: 1.8, extraPerStay: 110, upkeep: 5.5 }, req: { satisfaction: 70, upgrade: { id: 'security', level: 1 } }, art: { floors: 12, style: 'skyline', sign: 'ROYAL', color: NEON.amber }, pros: 'Sehr hoher Zusatzumsatz je Nacht.', cons: 'Mehr Zwischenfälle, Sicherheitssystem Pflicht.' }],
  'hotel.robot': ['Roboterhotel', 2, { desc: 'Check-in am Terminal, Reinigungsdrohnen.', spec: 'automation', next: ['hotel.business'], feat: ['automation'], eff: { wage: 0.75, throughput: 1.6, quality: 6 }, unl: { upgrades: ['housekeeping_tech'] }, req: { research: 'robotic_housekeeping' }, art: { floors: 5, style: 'chrome', sign: 'ROBOTEL', color: NEON.cyan }, pros: 'Löhne −25 %.', cons: 'Forschung Reinigungsroboter nötig.' }],
});

const business = buildTree('business_hotel', 'bhotel.business', {
  'bhotel.business': ['Businesshotel', 1, { desc: 'Komfortable Zimmer für Konzernreisende.', next: ['bhotel.conference', 'bhotel.security'], art: { floors: 9, style: 'corporate', sign: 'HOTEL', color: NEON.cyan }, pros: 'Hohe Preise.', cons: 'Anspruchsvoll.' }],
  'bhotel.conference': ['Konferenzhotel', 2, { desc: 'Tagungsetagen, Catering.', next: ['bhotel.executive'], feat: ['conference'], unl: { upgrades: ['conference_rooms'], roles: ['concierge'] }, art: { floors: 10, style: 'corporate', sign: 'CONGRESS', color: NEON.cyan }, pros: 'Stabile Nachfrage.', cons: 'Mehr Personal.' }],
  'bhotel.executive': ['Executive-Hotel', 3, { desc: 'Clubetage, Limousinen.', next: ['bhotel.luxury'], feat: ['conference', 'vip'], eff: { extraPerStay: 30 }, unl: { upgrades: ['vip_lounge'] }, art: { floors: 12, style: 'corporate', sign: 'EXECUTIVE', color: NEON.white }, pros: 'VIP.', cons: 'Löhne +10 %.' }],
  'bhotel.luxury': ['Luxushotel', 4, { desc: 'Suiten, Spa, Sterneküche im Haus.', next: ['bhotel.palace', 'bhotel.casino'], feat: ['conference', 'vip', 'wellness'], eff: { extraPerStay: 60 }, unl: { upgrades: ['wellness_spa'] }, req: { satisfaction: 72, staff: { role: 'reception', skill: 65 } }, art: { floors: 14, style: 'skyline', sign: 'GRAND', color: NEON.white }, pros: 'Hoher Zusatzumsatz.', cons: 'Zufriedenheit 72.' }],
  'bhotel.palace': ['Fünf-Sterne-Palast', 5, { desc: 'Der Name der Stadt in der Lobby.', next: ['bhotel.group'], feat: ['conference', 'vip', 'wellness'], eff: { quality: 40, price: 2.2, extraPerStay: 90, upkeep: 5, wage: 1.45 }, req: { satisfaction: 78, research: 'ai_concierge' }, art: { floors: 18, style: 'skyline', sign: 'PALACE', color: NEON.white }, pros: 'Höchste Preise.', cons: 'Forschung KI-Concierge.' }],
  'bhotel.group': ['Internationale Hotelgruppe', 6, { desc: 'Franchise-Marke.', feat: ['conference', 'vip', 'wellness', 'franchise', 'group'], eff: { quality: 40, price: 2.2, extraPerStay: 90, upkeep: 5.5, wage: 1.45 }, req: { ageDays: 25 }, art: { floors: 18, style: 'skyline', sign: 'PALACE GROUP', color: NEON.white }, pros: 'Lizenzgebühren.', cons: 'Ruf.' }],
  'bhotel.security': ['Hochsicherheitshotel', 3, { desc: 'Für Leute, die nicht gefunden werden wollen.', spec: 'sicherheit', feat: ['armored', 'vip'], eff: { price: 1.6, draw: 1.3 }, req: { upgrade: { id: 'security', level: 2 } }, art: { floors: 10, style: 'corporate', sign: 'FORTRESS', color: NEON.red }, pros: 'Keine Zwischenfälle.', cons: 'Endstufe.' }],
  'bhotel.casino': ['Casinohotel', 5, { desc: 'Roulette neben der Rezeption.', spec: 'casino', feat: ['casino', 'vip'], eff: { extraPerStay: 130, price: 1.8, upkeep: 5.5 }, req: { satisfaction: 70, upgrade: { id: 'security', level: 1 } }, art: { floors: 14, style: 'skyline', sign: 'ROYAL', color: NEON.amber }, pros: 'Höchster Zusatzumsatz.', cons: 'Zwischenfälle.' }],
});

// ----------------------------------------------------------------- Transport

const taxi = buildTree('taxi_depot', 'taxi.depot', {
  'taxi.depot': ['Kleine Taxizentrale', 1, { desc: 'Zwei Wagen, ein Funkgerät.', next: ['taxi.fleet', 'taxi.limo', 'taxi.medical'], art: { floors: 2, style: 'docks', sign: 'TAXI', color: NEON.amber }, pros: 'Einfach.', cons: 'Kleiner Radius.' }],
  'taxi.fleet': ['Taxiflotte', 2, { desc: 'Werkstatt, Disponenten, Schichtbetrieb.', next: ['taxi.autonomous', 'taxi.security'], feat: ['dispatch'], unl: { roles: ['dispatcher'], upgrades: ['dispatch'] }, art: { floors: 3, style: 'docks', sign: 'FLEET', color: NEON.amber }, pros: 'Disponenten halbieren verpasste Fahrten.', cons: 'Mehr Fahrzeugverschleiß.' }],
  'taxi.autonomous': ['Autonome Taxiflotte', 3, { desc: 'Robotaxis fahren ohne Fahrer, Techniker warten sie.', next: ['taxi.air'], feat: ['dispatch', 'driverless'], eff: { wage: 0.8 }, unl: { roles: ['technician'] }, req: { research: 'autonomous_driving' }, art: { floors: 3, style: 'chrome', sign: 'ROBOTAXI', color: NEON.cyan }, pros: 'Fahrzeuge fahren auch ohne Fahrer (70 % Leistung).', cons: 'Forschung Autonomes Fahren nötig.' }],
  'taxi.air': ['Flugtaxiunternehmen', 4, { desc: 'Landeplattformen auf den Türmen.', next: ['taxi.mobility'], feat: ['dispatch', 'driverless', 'air'], eff: { radius: 2.4, price: 1.8, capacity: 1.6 }, req: { research: 'autonomous_driving', revenuePerDay: 3000 }, art: { floors: 6, style: 'skyline', sign: 'SKYCAB', color: NEON.cyan }, pros: 'Radius ×2,4, Tarife +80 %.', cons: 'Energie und Wartung teuer.' }],
  'taxi.mobility': ['Stadtweiter Mobilitätskonzern', 5, { desc: 'Shuttles, Flugtaxis, Abo-Tarife.', feat: ['dispatch', 'driverless', 'air', 'group'], eff: { radius: 3, price: 1.8, capacity: 2.2, draw: 2.4 }, req: { ageDays: 25 }, art: { floors: 8, style: 'corporate', sign: 'MOBILITY', color: NEON.cyan }, pros: 'Ganze Stadt im Radius.', cons: 'Betriebskosten ×4,5.' }],
  'taxi.limo': ['Limousinenservice', 2, { desc: 'Schwarze Wagen, weiße Handschuhe.', spec: 'vip', next: ['taxi.vip'], feat: ['vip'], eff: { price: 1.6, draw: 0.8 }, art: { floors: 2, style: 'corporate', sign: 'LIMO', color: NEON.white }, pros: 'Tarife +60 %.', cons: 'Weniger Fahrgäste.' }],
  'taxi.vip': ['VIP-Transport', 3, { desc: 'Gepanzert, diskret, teuer.', spec: 'vip', next: ['taxi.shuttle'], feat: ['vip', 'armored'], eff: { price: 2.2, draw: 0.75, wage: 1.3 }, unl: { roles: ['security'] }, req: { staff: { role: 'driver', skill: 65 } }, art: { floors: 3, style: 'corporate', sign: 'VIP', color: NEON.white }, pros: 'Tarife ×2,2.', cons: 'Fahrer mit Fähigkeit 65.' }],
  'taxi.shuttle': ['Luxus-Shuttles', 4, { desc: 'Hotel- und Konzernverträge.', spec: 'vip', feat: ['vip', 'armored', 'dispatch'], eff: { price: 2.2, draw: 1.2, capacity: 1.5 }, req: { satisfaction: 0, revenuePerDay: 2500 }, art: { floors: 4, style: 'corporate', sign: 'SHUTTLE', color: NEON.white }, pros: 'Mehr Nachfrage bei hohen Tarifen.', cons: 'Endstufe.' }],
  'taxi.security': ['Sicherheitstransport', 3, { desc: 'Werttransporte und Personenschutz auf Rädern.', spec: 'sicherheit', feat: ['armored', 'dispatch'], eff: { price: 1.9, draw: 0.9, wage: 1.25 }, unl: { roles: ['security'] }, req: { upgrade: { id: 'workshop', level: 1 } }, art: { floors: 3, style: 'corporate', sign: 'SECURE', color: NEON.red }, pros: 'Hohe Tarife.', cons: 'Werkstatt Stufe 1 nötig, Endstufe.' }],
  'taxi.medical': ['Krankenfahrdienst', 2, { desc: 'Liegendtransporte für Kliniken.', spec: 'medizin', eff: { price: 1.4, draw: 0.9 }, art: { floors: 2, style: 'chrome', sign: 'MEDICAB', color: NEON.acid }, pros: 'Stabile Nachfrage.', cons: 'Endstufe.' }],
});

// -------------------------------------------------------------------- Retail

const retail = buildTree('kiosk', 'shop.kiosk', {
  'shop.kiosk': ['Nachtkiosk', 1, { desc: 'Rund um die Uhr.', next: ['shop.store', 'shop.electronics', 'shop.pharmacy'], art: { floors: 1 }, pros: 'Laufkundschaft.', cons: 'Klein.' }],
  'shop.store': ['Kleiner Laden', 2, { desc: 'Regale, Kasse, ein Lager hinten.', next: ['shop.specialist', 'shop.supermarket'], art: { floors: 2, sign: 'MARKT', color: NEON.acid }, pros: 'Mehr Kunden.', cons: 'Mehr Schwund.' }],
  'shop.specialist': ['Fachgeschäft', 3, { desc: 'Beratung statt Masse.', eff: { price: 1.4, draw: 1.3, quality: 10 }, unl: { upgrades: ['security'] }, art: { floors: 2, style: 'chrome', sign: 'FACH', color: NEON.cyan }, pros: 'Preisniveau +40 %.', cons: 'Endstufe.' }],
  'shop.supermarket': ['Supermarkt', 4, { desc: 'Selbstbedienung, Bestellterminals, Lieferung.', next: ['shop.mall'], feat: ['delivery'], eff: { capacity: 2.6, draw: 2.2, price: 0.95 }, art: { floors: 2, style: 'market', sign: 'SUPER', color: NEON.acid }, pros: 'Masse.', cons: 'Preisniveau unter Normal.' }],
  'shop.mall': ['Einkaufszentrum', 5, { desc: 'Mieter, Food-Court, Parkdeck.', next: ['shop.group'], feat: ['delivery', 'vip'], eff: { capacity: 3.2, draw: 2.6, price: 1.1 }, req: { revenuePerDay: 4000 }, art: { floors: 4, style: 'corporate', sign: 'MALL', color: NEON.acid }, pros: 'Höchste Kundenzahl.', cons: 'Kosten ×4,5.' }],
  'shop.group': ['Handelskonzern', 6, { desc: 'Eigene Marken, Franchise-Läden.', feat: ['delivery', 'vip', 'franchise', 'group'], eff: { capacity: 3.4, draw: 2.8, price: 1.1 }, req: { ageDays: 25, revenuePerDay: 6000 }, art: { floors: 5, style: 'corporate', sign: 'RETAIL GROUP', color: NEON.acid }, pros: 'Lizenzgebühren.', cons: 'Ruf.' }],
  'shop.electronics': ['Elektronikmarkt', 2, { desc: 'Cyber-Ersatzteile und Stims mit Garantie.', spec: 'elektronik', eff: { price: 1.3, draw: 1.1, quality: 8 }, art: { floors: 2, style: 'chrome', sign: 'TECH', color: NEON.cyan }, pros: 'Höhere Preise.', cons: 'Endstufe.' }],
  'shop.pharmacy': ['Apotheke', 2, { desc: 'Medikamente mit Beratung, Nachtschalter.', spec: 'medizin', eff: { price: 1.35, draw: 1.05, quality: 10 }, art: { floors: 2, style: 'chrome', sign: 'PHARMA', color: NEON.acid }, pros: 'Hohe Marge.', cons: 'Endstufe.' }],
});

// ------------------------------------------------------------------ Security

const security = buildTree('security_hq', 'sec.firm', {
  'sec.firm': ['Kleine Sicherheitsfirma', 1, { desc: 'Wachleute, ein Ermittler.', next: ['sec.object', 'sec.bodyguard'], art: { floors: 3, style: 'corporate', sign: 'SECURITY', color: NEON.red }, pros: 'Verträge mit der Stadt.', cons: 'Klein.' }],
  'sec.object': ['Objektschutzunternehmen', 2, { desc: 'Nachtwachen für Fabriken und Hotels.', next: ['sec.fleet'], eff: { draw: 1.3 }, art: { floors: 3, style: 'corporate', sign: 'OBJEKT', color: NEON.red }, pros: 'Mehr Privatverträge.', cons: 'Mehr Wachleute nötig.' }],
  'sec.fleet': ['Sicherheitsdienst mit Fahrzeugflotte', 3, { desc: 'Streifenwagen, Werttransporte.', next: ['sec.private'], feat: ['armored', 'dispatch'], eff: { price: 1.4 }, unl: { roles: ['driver'], upgrades: ['workshop'] }, art: { floors: 4, style: 'corporate', sign: 'PATROL', color: NEON.red }, pros: 'Vertragswerte +40 %.', cons: 'Fahrzeugkosten.' }],
  'sec.private': ['Privates Sicherheitsunternehmen', 4, { desc: 'Eigene Einsatzzentrale, Bezirksverträge.', next: ['sec.corp'], feat: ['armored', 'dispatch'], unl: { roles: ['investigator'] }, req: { staff: { role: 'investigator', skill: 60 } }, art: { floors: 5, style: 'corporate', sign: 'PSU', color: NEON.red }, pros: 'Ermittlungen schneller.', cons: 'Löhne +20 %.' }],
  'sec.corp': ['Konzern-Sicherheitsdienst', 5, { desc: 'Du schützt die Türme.', next: ['sec.intl'], feat: ['armored', 'dispatch', 'vip'], eff: { price: 2 }, req: { revenuePerDay: 3000 }, art: { floors: 7, style: 'corporate', sign: 'CORPSEC', color: NEON.red }, pros: 'Vertragswerte ×2.', cons: 'Kosten ×4,5.' }],
  'sec.intl': ['Internationale Sicherheitsorganisation', 6, { desc: 'Privatarmee mit Marke.', feat: ['armored', 'dispatch', 'vip', 'group'], eff: { price: 2.2 }, req: { ageDays: 25 }, art: { floors: 9, style: 'corporate', sign: 'GLOBAL SEC', color: NEON.red }, pros: 'Höchste Vertragswerte.', cons: 'Politische Aufmerksamkeit.' }],
  'sec.bodyguard': ['Personenschutz', 2, { desc: 'Leibwächter für die Reichen.', spec: 'personenschutz', eff: { price: 1.6, draw: 0.8 }, req: { staff: { role: 'guard', skill: 60 } }, art: { floors: 3, style: 'corporate', sign: 'GUARD', color: NEON.white }, pros: 'Vertragswerte +60 %.', cons: 'Endstufe, Wachleute mit Fähigkeit 60.' }],
});

// ------------------------------------------------------------------ Research

const lab = buildTree('research_lab', 'lab.base', {
  'lab.base': ['Forschungslabor', 1, { desc: 'Forscher, Techniker, Reagenzien.', next: ['lab.center'], art: { floors: 5, style: 'chrome', sign: 'LAB', color: NEON.acid }, pros: 'Technologien.', cons: 'Kosten ohne Umsatz.' }],
  'lab.center': ['Forschungszentrum', 2, { desc: 'Mehr Labore, Reinraum.', next: ['lab.institute'], art: { floors: 6, style: 'chrome', sign: 'CENTER', color: NEON.acid }, pros: 'Forschung +20 %.', cons: 'Betriebskosten ×1,5.' }],
  'lab.institute': ['Technologieinstitut', 3, { desc: 'Stipendiaten, Patente.', next: ['lab.campus'], unl: { upgrades: ['security'] }, art: { floors: 7, style: 'chrome', sign: 'INSTITUT', color: NEON.acid }, pros: 'Forschung +45 %.', cons: 'Industriespionage.' }],
  'lab.campus': ['Forschungs-Campus', 4, { desc: 'Mehrere Gebäude, ein Ziel.', next: ['lab.corp'], req: { staff: { role: 'researcher', skill: 70 } }, art: { floors: 9, style: 'skyline', sign: 'CAMPUS', color: NEON.acid }, pros: 'Forschung +75 %.', cons: 'Forscher mit Fähigkeit 70.' }],
  'lab.corp': ['Konzernforschung', 5, { desc: 'Geheimprojekte, eigene Fertigung.', next: ['lab.complex'], art: { floors: 12, style: 'skyline', sign: 'R&D', color: NEON.acid }, pros: 'Forschung ×2,1.', cons: 'Kosten ×4,5.' }],
  'lab.complex': ['Internationaler Forschungskomplex', 6, { desc: 'Die Stadt lernt von dir.', feat: ['group'], req: { ageDays: 25 }, art: { floors: 14, style: 'skyline', sign: 'NEXUS', color: NEON.acid }, pros: 'Forschung ×2,4.', cons: 'Kosten ×5,5.' }],
});

// ------------------------------------------------------------------ Industry

function factoryTree(defId: string, prefix: string, sign: string): EvolutionTree {
  return buildTree(defId, `${prefix}.workshop`, {
    [`${prefix}.workshop`]: ['Produktionshalle', 1, { desc: 'Eine Halle, wenige Linien.', next: [`${prefix}.factory`], art: { floors: 3, style: 'docks', sign, color: NEON.orange }, pros: 'Eigene Versorgung.', cons: 'Begrenzte Linien.' }],
    [`${prefix}.factory`]: ['Fabrik', 2, { desc: 'Schichtbetrieb, mehr Maschinen.', next: [`${prefix}.automated`], art: { floors: 4, style: 'docks', sign, color: NEON.orange }, pros: 'Maschinenleistung +30 %.', cons: 'Verschmutzung.' }],
    [`${prefix}.automated`]: ['Automatisierte Fabrik', 3, { desc: 'Roboterlinien, Techniker statt Arbeiter.', next: [`${prefix}.complex`], feat: ['automation'], eff: { wage: 0.8, throughput: 1.8 }, req: { research: 'kitchen_automation' }, art: { floors: 4, style: 'chrome', sign, color: NEON.cyan }, pros: 'Eine Linie mehr, Löhne −20 %.', cons: 'Forschung nötig.' }],
    [`${prefix}.complex`]: ['Industriekomplex', 4, { desc: 'Mehrere Hallen, eigenes Umspannwerk.', next: [`${prefix}.campus`], feat: ['automation'], eff: { wage: 0.8, throughput: 2 }, req: { revenuePerDay: 3000 }, art: { floors: 5, style: 'docks', sign, color: NEON.orange }, pros: 'Maschinenleistung ×2,2.', cons: 'Kosten ×3,2.' }],
    [`${prefix}.campus`]: ['Hochautomatisierter Produktionscampus', 5, { desc: 'Fast menschenleer.', next: [`${prefix}.mega`], feat: ['automation'], eff: { wage: 0.7, throughput: 2.4 }, art: { floors: 6, style: 'chrome', sign, color: NEON.cyan }, pros: 'Zwei Linien mehr.', cons: 'Kosten ×4,5.' }],
    [`${prefix}.mega`]: ['Industriemegakonzern', 6, { desc: 'Produktion als Marke.', feat: ['automation', 'group'], eff: { wage: 0.7, throughput: 2.6 }, req: { ageDays: 25 }, art: { floors: 7, style: 'corporate', sign, color: NEON.orange }, pros: 'Höchste Leistung.', cons: 'Kosten ×5,5.' }],
  });
}

// ---------------------------------------------------------------------- Bank

const bank = buildTree('bank', 'bank.office', {
  'bank.office': ['Privates Kreditbüro', 1, { desc: 'Ein Schalter, ein Tresor.', next: ['bank.broker'], art: { floors: 3, style: 'corporate', sign: 'KREDIT', color: NEON.amber }, pros: 'Einstieg ins Zinsgeschäft.', cons: 'Kleine Bilanz.' }],
  'bank.broker': ['Kreditvermittlung', 2, { desc: 'Vermittelt Kredite, nimmt Einlagen.', next: ['bank.small'], art: { floors: 4, style: 'corporate', sign: 'FINANZ', color: NEON.amber }, pros: 'Bilanz +20 %.', cons: 'Mehr Ausfälle.' }],
  'bank.small': ['Kleine Bank', 3, { desc: 'Filiale mit Analysten.', next: ['bank.commercial'], unl: { upgrades: ['security'] }, art: { floors: 5, style: 'corporate', sign: 'BANK', color: NEON.amber }, pros: 'Bilanz +50 %.', cons: 'Aufsicht schaut genauer hin.' }],
  'bank.commercial': ['Geschäftsbank', 4, { desc: 'Konzernkunden, Großkredite.', next: ['bank.investment'], req: { staff: { role: 'analyst', skill: 65 } }, art: { floors: 8, style: 'corporate', sign: 'COMMERZ', color: NEON.amber }, pros: 'Bilanz ×1,9.', cons: 'Analyst mit Fähigkeit 65.' }],
  'bank.investment': ['Investmentbank', 5, { desc: 'Hochfrequenz, Hochrisiko.', next: ['bank.group'], eff: { draw: 2.6 }, req: { revenuePerDay: 4000 }, art: { floors: 12, style: 'skyline', sign: 'INVEST', color: NEON.white }, pros: 'Bilanz ×2,4.', cons: 'Kosten ×4,5.' }],
  'bank.group': ['Internationale Finanzgruppe', 6, { desc: 'Die Stadt rechnet in deiner Währung.', feat: ['group'], req: { ageDays: 25 }, art: { floors: 16, style: 'skyline', sign: 'FINANCE GROUP', color: NEON.white }, pros: 'Bilanz ×3.', cons: 'Kosten ×5,5.' }],
});

const farm = buildTree('farm', 'farm.small', {
  'farm.small': ['Bauernhof', 1, { desc: 'Felder, zwei Arbeiter, ein Traktor.', next: ['farm.greenhouse'], art: { floors: 1, style: 'rural', sign: 'HOF', color: NEON.acid }, pros: 'Regionale Produkte.', cons: 'Wetterabhängig, kleine Mengen.' }],
  'farm.greenhouse': ['Gewächshaus-Betrieb', 2, { desc: 'Glas, Hydroponik, Ernte das ganze Jahr.', next: ['farm.vertical'], eff: { throughput: 1.5 }, art: { floors: 1, style: 'rural', sign: 'GLASHAUS', color: NEON.acid }, pros: 'Mehr Ertrag, drei Linien.', cons: 'Energiekosten.' }],
  'farm.vertical': ['Vertikale Farm', 3, { desc: 'Stockwerke aus Licht und Nährlösung.', next: ['farm.agro'], feat: ['automation'], eff: { throughput: 2.2, wage: 0.85 }, req: { research: 'demand_forecast' }, art: { floors: 3, style: 'chrome', sign: 'VERTIFARM', color: NEON.acid }, pros: 'Große Mengen auf kleiner Fläche.', cons: 'Forschung Nachfrageprognose nötig.' }],
  'farm.agro': ['Automatisierter Agrarbetrieb', 4, { desc: 'Drohnen säen, Roboter ernten.', next: ['farm.park'], feat: ['automation'], eff: { throughput: 2.6, wage: 0.75 }, art: { floors: 3, style: 'chrome', sign: 'AGRO', color: NEON.acid }, pros: 'Löhne −25 %.', cons: 'Kosten ×3,2.' }],
  'farm.park': ['Agrarindustriepark', 5, { desc: 'Die Versorgung der Stadt kommt von hier.', next: ['farm.corp'], feat: ['automation'], eff: { throughput: 3 }, req: { revenuePerDay: 2500 }, art: { floors: 4, style: 'docks', sign: 'AGRO PARK', color: NEON.acid }, pros: 'Zwei Linien mehr.', cons: 'Kosten ×4,5.' }],
  'farm.corp': ['Lebensmittelproduktionskonzern', 6, { desc: 'Marke, Export, Verträge mit Konzernen.', feat: ['automation', 'group'], eff: { throughput: 3.2 }, req: { ageDays: 25 }, art: { floors: 5, style: 'corporate', sign: 'AGRO CORP', color: NEON.acid }, pros: 'Höchste Erträge.', cons: 'Kosten ×5,5.' }],
});

const inn = buildTree('inn', 'inn.pension', {
  'inn.pension': ['Landgasthof', 1, { desc: 'Zehn Zimmer, Garten, Frühstück vom Hof.', next: ['inn.hotel'], art: { floors: 2, style: 'rural', sign: 'GASTHOF', color: NEON.amber }, pros: 'Ruhe zieht Städter an.', cons: 'Wenige Zimmer.' }],
  'inn.hotel': ['Kleines Landhotel', 2, { desc: 'Anbau, Restaurant, Fahrradverleih.', next: ['inn.wellness', 'inn.theme'], eff: { quality: 10 }, unl: { upgrades: ['conference_rooms'] }, art: { floors: 2, style: 'rural', sign: 'LANDHOTEL', color: NEON.amber }, pros: 'Komfort +10.', cons: 'Mehr Reinigung.' }],
  'inn.wellness': ['Wellness-Landhotel', 3, { desc: 'Sauna am See, Spa mit Kräutern aus dem Garten.', next: ['inn.resort'], feat: ['wellness'], eff: { quality: 24, price: 1.4, extraPerStay: 35 }, unl: { upgrades: ['wellness_spa'], roles: ['concierge'] }, req: { satisfaction: 68 }, art: { floors: 3, style: 'rural', sign: 'SPA AM SEE', color: NEON.acid }, pros: 'Spa-Umsatz je Nacht.', cons: 'Zufriedenheit 68 nötig.' }],
  'inn.resort': ['Exklusives Landresort', 5, { desc: 'Reiche Gäste aus der Megacity, Hubschrauberlandeplatz.', feat: ['wellness', 'vip'], eff: { quality: 40, price: 2.4, extraPerStay: 90, capacity: 1.6, upkeep: 5, wage: 1.5 }, req: { satisfaction: 78, staff: { role: 'reception', skill: 65 } }, art: { floors: 3, style: 'skyline', sign: 'GREEN RESORT', color: NEON.white }, pros: 'Höchste Preise, auch im Umland.', cons: 'Wenige Zimmer, hohe Kosten.' }],
  'inn.theme': ['Themen-Gasthof', 3, { desc: 'Jedes Zimmer ein Märchen mit Hologramm.', spec: 'thema', eff: { draw: 1.8, quality: 12, price: 1.25 }, art: { floors: 2, style: 'old', sign: 'MÄRCHENHOF', color: NEON.pink }, pros: 'Starke Anziehung.', cons: 'Endstufe.' }],
});

const farmShop = buildTree('farm_shop', 'fshop.stand', {
  'fshop.stand': ['Hofladen', 1, { desc: 'Kisten, Waage, Kasse aus Holz.', next: ['fshop.store', 'fshop.organic'], art: { floors: 1 }, pros: 'Regionale Ware.', cons: 'Klein.' }],
  'fshop.store': ['Dorfmarkt', 2, { desc: 'Regale, Kühltheke, Lieferung ins Dorf.', next: ['fshop.chain'], feat: ['delivery'], eff: { capacity: 1.6, draw: 1.4 }, art: { floors: 2, style: 'rural', sign: 'DORFMARKT', color: NEON.acid }, pros: 'Lieferdienst.', cons: 'Mehr Schwund.' }],
  'fshop.organic': ['Bio-Feinkost', 3, { desc: 'Kräuter, Käse, Honig: teuer und gefragt.', spec: 'feinkost', eff: { price: 1.5, quality: 12, draw: 1.1 }, req: { reputation: 40 }, art: { floors: 2, style: 'rural', sign: 'FEINKOST', color: NEON.amber }, pros: 'Preisniveau +50 %.', cons: 'Endstufe.' }],
  'fshop.chain': ['Regionalmarkt-Kette', 4, { desc: 'Dein Hofladen in jeder Vorstadt.', feat: ['delivery', 'franchise'], eff: { capacity: 2.2, draw: 1.9 }, req: { revenuePerDay: 1500 }, art: { floors: 2, style: 'suburb', sign: 'REGIONAL', color: NEON.acid }, pros: 'Franchise-Gebühren.', cons: 'Kosten ×3,2.' }],
});

export const EVOLUTION: Record<string, EvolutionTree> = {
  farm,
  inn,
  farm_shop: farmShop,
  ramen_bar: asia,
  diner: imbiss,
  food_stand: stand,
  capsule_hotel: capsule,
  business_hotel: business,
  taxi_depot: taxi,
  kiosk: retail,
  security_hq: security,
  research_lab: lab,
  food_factory: factoryTree('food_factory', 'food', 'FOOD WERK'),
  tech_factory: factoryTree('tech_factory', 'tech', 'TECH WERK'),
  bank,
};

export function treeOf(defId: string): EvolutionTree | null {
  return EVOLUTION[defId] ?? null;
}

/** Current stage of a building (the initial one when none is stored or the id is unknown). */
export function stageOf(b: Building): Stage | null {
  const tree = treeOf(b.defId);
  if (!tree) return null;
  return tree.stages[b.stageId ?? ''] ?? tree.stages[tree.initialStageId]!;
}

const BASE_EFFECTS = levelDefaults(1);

export function stageEffects(b: Building): StageEffects {
  return stageOf(b)?.effects ?? BASE_EFFECTS;
}

export function hasFeature(b: Building, feature: Feature): boolean {
  return stageOf(b)?.features.includes(feature) ?? false;
}

/** Level of the current stage (1 for buildings without a tree). */
export function stageLevel(b: Building): number {
  return stageOf(b)?.level ?? 1;
}

/** Display name at the current stage, falling back to the definition name. */
export function stageName(b: Building): string {
  return stageOf(b)?.name ?? BUILDING_DEFINITIONS[b.defId]?.name ?? b.defId;
}

/** Daily upkeep of a building at its stage. */
export function effectiveUpkeep(b: Building): number {
  const def = BUILDING_DEFINITIONS[b.defId];
  if (!def) return 0;
  return Math.round(def.upkeepPerDay * stageEffects(b).upkeep);
}

/** Everything the building has unlocked along its path (stable, no duplicates). */
export function unlockedAlongPath(b: Building): { recipes: string[]; roles: EmployeeRole[]; upgrades: string[] } {
  const tree = treeOf(b.defId);
  const out = { recipes: [] as string[], roles: [] as EmployeeRole[], upgrades: [] as string[] };
  if (!tree) return out;
  const visited = new Set<string>([tree.initialStageId, ...(b.stageHistory ?? []), b.stageId ?? tree.initialStageId]);
  for (const id of visited) {
    const st = tree.stages[id];
    if (!st) continue;
    for (const r of st.unlocks.recipes ?? []) if (!out.recipes.includes(r)) out.recipes.push(r);
    for (const r of st.unlocks.roles ?? []) if (!out.roles.includes(r)) out.roles.push(r);
    for (const u of st.unlocks.upgrades ?? []) if (!out.upgrades.includes(u)) out.upgrades.push(u);
  }
  return out;
}
