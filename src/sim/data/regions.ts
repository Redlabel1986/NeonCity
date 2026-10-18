/**
 * Regions and player levels. The city is one continuous map: the idyllic
 * countryside of Greenhaven in the west, the suburb Silverbrook, the dense
 * city Neon Central and the megacity Nova Eclipse in the east. Each region
 * groups district archetypes and opens at a player level reached through
 * experience points. Pure data with stable ids; applied by
 * `systems/progression.ts`.
 */

import type { DistrictArchetypeId } from './districts';

export type RegionId = 'greenhaven' | 'silverbrook' | 'neon_central' | 'nova_eclipse';

export interface RegionDefinition {
  id: RegionId;
  name: string;
  tagline: string;
  description: string;
  requiredLevel: number;
  /** District archetypes that make up the region (see data/districts.ts). */
  archetypes: readonly DistrictArchetypeId[];
  visualTheme: 'rural' | 'suburb' | 'city' | 'megacity';
  terrain: string;
  vegetationDensity: number;
  trafficDensity: number;
  /** Multipliers the region applies on top of its districts' stats (shown in the world map). */
  landValueModifier: number;
  operatingCostModifier: number;
  /** Building types only this region allows (others are listed per building). */
  specialties: readonly string[];
  resources: readonly string[];
  /** Crisis / event ids that can only happen here (data/crises.ts). */
  eventPoolIds: readonly string[];
  goal: string;
  color: number;
}

export const REGIONS: Record<RegionId, RegionDefinition> = {
  greenhaven: {
    id: 'greenhaven',
    name: 'Greenhaven',
    tagline: 'Felder, Wälder, Seen und ein Dorf mit Solardächern',
    description: 'Ländlich, grün, friedlich. Günstige Grundstücke, geringe Mieten, weniger Kunden, aber hohe Nachfrage nach regionalen Produkten und persönlichem Service. Die Technik ist da, aber leise.',
    requiredLevel: 1,
    archetypes: ['greenhaven'],
    visualTheme: 'rural',
    terrain: 'Felder, Wälder, Blumenwiesen, Seen',
    vegetationDensity: 0.45,
    trafficDensity: 0.25,
    landValueModifier: 0.3,
    operatingCostModifier: 0.8,
    specialties: ['Bauernhof', 'Landgasthof', 'Hofladen', 'Streetfood-Stand', 'Asia-Imbiss', 'Café-Pfad'],
    resources: ['Regionales Gemüse', 'Premium-Kräuter', 'Bio-Getreide'],
    eventPoolIds: ['village_fair', 'harvest_failure'],
    goal: 'Lerne den Aufbau und Betrieb kleiner Unternehmen.',
    color: 0x6fcf6f,
  },
  silverbrook: {
    id: 'silverbrook',
    name: 'Silverbrook',
    tagline: 'Reihenhäuser, Supermärkte, Pendler und Straßenbahnen',
    description: 'Die moderne Vorstadt: mittlere Grundstückspreise, mehr Kunden, Familien und Berufspendler. Transport, Lieferdienste und Filialen werden wichtig.',
    requiredLevel: 2,
    archetypes: ['silverbrook', 'old_city'],
    visualTheme: 'suburb',
    terrain: 'Wohnsiedlungen, Gewerbegebiete, Grünanlagen',
    vegetationDensity: 0.2,
    trafficDensity: 0.6,
    landValueModifier: 0.7,
    operatingCostModifier: 0.95,
    specialties: ['Dönerladen- und Burger-Pfad', 'Supermarkt', 'Taxiunternehmen', 'Kapselhotel', 'Lebensmittelfabrik', 'Hofladen'],
    resources: ['Haushaltswaren', 'Konsumgüter', 'Pendlertransport', 'Paketlogistik'],
    eventPoolIds: ['traffic_jam', 'chain_competition'],
    goal: 'Lerne Filialmanagement, Logistik und Personalverwaltung.',
    color: 0x9fb8d8,
  },
  neon_central: {
    id: 'neon_central',
    name: 'Neon Central',
    tagline: 'Hochbahnen, Leuchtreklamen, Clubs und Konzernbüros',
    description: 'Die große Stadt: hohe Grundstückspreise, hohe Mieten, viele Kunden, starker Wettbewerb, komplexe Lieferketten. Hier beginnt der Cyberpunk.',
    requiredLevel: 3,
    archetypes: ['neon_market', 'chrome_district', 'ghost_quarter', 'undercity'],
    visualTheme: 'city',
    terrain: 'Dichte Bebauung, Geschäftsviertel, Industrie',
    vegetationDensity: 0.05,
    trafficDensity: 0.9,
    landValueModifier: 1.2,
    operatingCostModifier: 1.1,
    specialties: ['Sternerestaurant', 'Nachtclub', 'Bank', 'Forschungslabor', 'Sicherheitsfirma', 'Businesshotel', 'Casino Royal Nova'],
    resources: ['Premiumelektronik', 'Medizinische Implantate', 'Luxuswaren'],
    eventPoolIds: ['corp_scandal'],
    goal: 'Lerne Unternehmensgruppen, Fraktionen und politische Einflussnahme.',
    color: 0xff2bd6,
  },
  nova_eclipse: {
    id: 'nova_eclipse',
    name: 'Nova Eclipse',
    tagline: 'Megatower, Flugtaxis, Hologramme und Konzernzentralen',
    description: 'Die Megacity: extrem hohe Grundstückspreise, sehr viele Kunden, internationale Konzerne, massiver Konkurrenzdruck, höchstes Potenzial.',
    requiredLevel: 4,
    archetypes: ['corporate_heights', 'skyline_gardens', 'rust_docks'],
    visualTheme: 'megacity',
    terrain: 'Vertikale Stadt, Hafen-Megakomplexe, Sky-Apartments',
    vegetationDensity: 0.08,
    trafficDensity: 1,
    landValueModifier: 2.2,
    operatingCostModifier: 1.3,
    specialties: ['Flugtaxiunternehmen', 'Elektronikwerk', 'Fünf-Sterne-Cyberhotel', 'Investmentbank', 'Luxushotel'],
    resources: ['High-End-Cyberware', 'KI-Systeme', 'Fusionsenergie', 'Luxusfahrzeuge'],
    eventPoolIds: ['megacity_blackout'],
    goal: 'Erschaffe ein wirtschaftliches, politisches oder kriminelles Imperium.',
    color: 0x19e6ff,
  },
};

export const REGION_ORDER: readonly RegionId[] = ['greenhaven', 'silverbrook', 'neon_central', 'nova_eclipse'];

export function regionOfArchetype(archetype: DistrictArchetypeId): RegionId {
  for (const r of REGION_ORDER) if (REGIONS[r].archetypes.includes(archetype)) return r;
  return 'neon_central';
}

/** 0-based position of a region on the west-east axis. */
export function regionIndex(id: RegionId): number {
  return Math.max(0, REGION_ORDER.indexOf(id));
}

/** How many regions lie between two (transport cost and delivery delays). */
export function regionDistance(a: RegionId, b: RegionId): number {
  return Math.abs(regionIndex(a) - regionIndex(b));
}

// ------------------------------------------------------------ player levels

export interface PlayerLevel {
  level: number;
  name: string;
  /** Total XP needed. Configurable. */
  xp: number;
  region: RegionId;
  /** Highest evolution level (data/evolution.ts) businesses may convert to. */
  maxBusinessTier: number;
}

export const PLAYER_LEVELS: readonly PlayerLevel[] = [
  { level: 1, name: 'Greenhaven', xp: 0, region: 'greenhaven', maxBusinessTier: 2 },
  { level: 2, name: 'Silverbrook', xp: 1000, region: 'silverbrook', maxBusinessTier: 3 },
  { level: 3, name: 'Neon Central', xp: 5000, region: 'neon_central', maxBusinessTier: 5 },
  { level: 4, name: 'Nova Eclipse', xp: 20000, region: 'nova_eclipse', maxBusinessTier: 6 },
];

export const MAX_PLAYER_LEVEL = PLAYER_LEVELS.length;

export function levelDef(level: number): PlayerLevel {
  return PLAYER_LEVELS[Math.max(1, Math.min(MAX_PLAYER_LEVEL, level)) - 1]!;
}

/** The level a total XP amount corresponds to. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (const l of PLAYER_LEVELS) if (xp >= l.xp) level = l.level;
  return level;
}

// ------------------------------------------------------------- xp rewards

/** One-off milestones: each id is awarded once per player, never again, whatever is sold or rebuilt. */
export const XP_MILESTONES: Record<string, { xp: number; title: string }> = {
  first_build: { xp: 50, title: 'Erstes Gebäude gebaut' },
  first_open: { xp: 100, title: 'Erstes Unternehmen eröffnet' },
  first_guests: { xp: 100, title: 'Erste 100 Kunden bedient' },
  profit_day: { xp: 60, title: 'Erster Tag mit Gewinn' },
  second_business: { xp: 120, title: 'Zweiter Betrieb' },
  order_supplies: { xp: 40, title: 'Erste Bestellung' },
  hire_staff: { xp: 40, title: 'Erste Einstellung' },
  first_upgrade: { xp: 80, title: 'Erster Raumausbau' },
  four_stars: { xp: 150, title: 'Vier Sterne Bewertung' },
  second_industry: { xp: 200, title: 'Zweite Branche' },
  landlord: { xp: 120, title: 'Erste Immobilie' },
  reserve: { xp: 100, title: 'Rücklage aufgebaut' },
  first_evolution: { xp: 150, title: 'Erstes Unternehmens-Upgrade' },
  first_branch: { xp: 250, title: 'Erste zusätzliche Filiale' },
  supply_chain: { xp: 400, title: 'Erste vollständige Lieferkette' },
  first_takeover: { xp: 300, title: 'Erste Übernahme' },
  profit_10k: { xp: 200, title: '10.000 ¢ Gewinn' },
  profit_100k: { xp: 400, title: '100.000 ¢ Gewinn' },
  profit_1m: { xp: 800, title: '1.000.000 ¢ Gewinn' },
  revenue_10k: { xp: 100, title: '10.000 ¢ Umsatz' },
  revenue_50k: { xp: 150, title: '50.000 ¢ Umsatz' },
  revenue_250k: { xp: 250, title: '250.000 ¢ Umsatz' },
  revenue_1m: { xp: 400, title: '1.000.000 ¢ Umsatz' },
  revenue_5m: { xp: 600, title: '5.000.000 ¢ Umsatz' },
  reputation_50: { xp: 100, title: 'Ruf 50' },
  reputation_75: { xp: 150, title: 'Ruf 75' },
  reputation_90: { xp: 200, title: 'Ruf 90' },
  city_contract: { xp: 500, title: 'Großer Stadtauftrag abgeschlossen' },
};

/** Repeatable-but-bounded rewards: the id carries what was achieved, so each thing counts once. */
export const XP_PER_STAGE_LEVEL = 40; // reaching an evolution stage: 40 × its level, once per stage id
export const XP_PER_RESEARCH = 60; // once per research node
export const XP_PER_REGION_ENTERED = 150; // first building in a region
