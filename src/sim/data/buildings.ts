/**
 * Data-driven building definitions.
 *
 * `availability` marks which development phase unlocks the building. Entries
 * with a phase greater than the current phase are shown in the build menu
 * as "not yet available" and cannot be placed.
 */

import type { DistrictArchetype } from './districts';

export const CURRENT_PHASE = 7;

export type BuildingCategory =
  | 'gastronomy'
  | 'hotel'
  | 'transport'
  | 'retail'
  | 'industry'
  | 'residential'
  | 'office'
  | 'civic'
  | 'security'
  | 'research';

export type BusinessModelId = 'gastronomy' | 'hotel' | 'transport' | 'retail' | 'security' | 'lab' | 'industry';

export interface GastronomyModel {
  kind: 'gastronomy';
  /** Opening hours (hour of day, end may wrap past midnight). */
  openHour: number;
  closeHour: number;
  /** Seats; each seat turns over about twice per hour. */
  seats: number;
  /** Guests one cook of skill 50 can serve per hour. */
  cookRate: number;
  /** Guests one service employee of skill 50 can handle per hour. */
  serviceRate: number;
  /** Base attraction: guests per hour at peak in an average district. */
  baseDraw: number;
  /** Recipes this business type can offer; the first ones start enabled. */
  recipes: readonly string[];
  enabledAtStart: number;
  /** Starting staff: roles with default skill. */
  startingStaff: readonly { role: 'cook' | 'service'; skill: number }[];
  /** Ingredient units delivered with the opening. */
  startingStock: Record<string, number>;
  /** Base storage capacity in ingredient units. */
  storage: number;
  /** Upgrades available for this type. */
  upgrades: readonly string[];
  /** Base hygiene loss per served guest. */
  hygieneLossPerGuest: number;
}

export interface HotelModel {
  kind: 'hotel';
  rooms: number;
  basePricePerNight: number;
  /** Cost of cleaning and supplies per occupied room-night. */
  costPerRoomNight: number;
  /** Base travellers per day attracted in an average district. */
  baseDemand: number;
  /** Comfort level 0-100 (capsule low, business high). */
  comfort: number;
  startingStaff: readonly { role: 'reception' | 'housekeeping'; skill: number }[];
  upgrades: readonly string[];
}

export interface TransportModel {
  kind: 'transport';
  /** Vehicles delivered with the depot. */
  startingVehicles: number;
  vehiclePrice: number;
  /** Base fare per ride. */
  baseFare: number;
  /** Energy cost per ride. */
  energyPerRide: number;
  /** Rides a driver of skill 50 completes per hour with a healthy vehicle. */
  ridesPerDriverHour: number;
  /** Service radius in tiles. */
  radius: number;
  startingStaff: readonly { role: 'driver'; skill: number }[];
  upgrades: readonly string[];
}

export interface RetailModel {
  kind: 'retail';
  openHour: number;
  closeHour: number;
  /** Goods on offer (ingredient catalogue ids with category retail). */
  goods: readonly string[];
  /** Customers one clerk of skill 50 can handle per hour. */
  clerkRate: number;
  /** Base customers per hour at peak in an average district. */
  baseDraw: number;
  startingStaff: readonly { role: 'clerk'; skill: number }[];
  startingStock: Record<string, number>;
  storage: number;
  upgrades: readonly string[];
}

export interface SecurityModel {
  kind: 'security';
  /** Credits the city pays per guard and day on patrol. */
  cityRatePerGuard: number;
  /** Credits per venue and day from private contracts in a patrolled district. */
  contractPerVenue: number;
  startingStaff: readonly { role: 'guard' | 'investigator'; skill: number }[];
  upgrades: readonly string[];
}

export interface LabModel {
  kind: 'lab';
  startingStaff: readonly { role: 'researcher' | 'technician'; skill: number }[];
  upgrades: readonly string[];
}

export interface IndustryModel {
  kind: 'industry';
  /** Production recipes this factory type supports. */
  lines: readonly string[];
  maxLines: number;
  /** Units per day the base machinery can process. */
  baseMachineUnits: number;
  startingStaff: readonly { role: 'worker' | 'technician'; skill: number }[];
  startingStock: Record<string, number>;
  storage: number;
  upgrades: readonly string[];
}

export type BusinessModel = GastronomyModel | HotelModel | TransportModel | RetailModel | SecurityModel | LabModel | IndustryModel;

export interface BuildingDefinition {
  id: string;
  name: string;
  category: BuildingCategory;
  description: string;
  footprint: { w: number; h: number };
  floors: number;
  /** Construction cost in credits (excluding land). */
  cost: number;
  /** Construction time in game minutes. */
  buildTimeMinutes: number;
  /** Daily upkeep (maintenance, energy base load) in credits. */
  upkeepPerDay: number;
  /** Development phase that makes this building available. */
  availability: number;
  /** Art key used by the renderer. */
  art: 'ramen' | 'foodstand' | 'capsule_hotel' | 'taxi_depot' | 'kiosk' | 'diner' | 'security_hq' | 'lab' | 'factory' | 'city';
  business?: BusinessModel;
}

export const BUILDING_DEFINITIONS: Record<string, BuildingDefinition> = {
  ramen_bar: {
    id: 'ramen_bar',
    name: 'Ramenbar',
    category: 'gastronomy',
    description:
      'Dampfende Nudelsuppen für Nachtschwärmer, Pendler und Konzernangestellte. Dein erster Schritt ins Geschäft.',
    footprint: { w: 1, h: 1 },
    floors: 2,
    cost: 6500,
    buildTimeMinutes: 18 * 60,
    upkeepPerDay: 90,
    availability: 1,
    art: 'ramen',
    business: {
      kind: 'gastronomy',
      openHour: 11,
      closeHour: 2,
      seats: 12,
      cookRate: 14,
      serviceRate: 22,
      baseDraw: 14,
      recipes: ['shoyu_ramen', 'miso_ramen', 'veggie_ramen', 'spicy_synth_ramen', 'gyoza', 'synth_beer'],
      enabledAtStart: 3,
      startingStaff: [
        { role: 'cook', skill: 48 },
        { role: 'service', skill: 42 },
      ],
      startingStock: { noodles: 90, broth: 80, vegetables: 70, synthmeat: 60, spices: 25, drinks: 40 },
      storage: 640,
      upgrades: ['seating', 'kitchen', 'storage', 'decor', 'hygiene_station', 'staff_room', 'marketing'],
      hygieneLossPerGuest: 0.06,
    },
  },
  food_stand: {
    id: 'food_stand',
    name: 'Streetfood-Stand',
    category: 'gastronomy',
    description: 'Ein mobiler Stand mit Synth-Grill. Billig, schnell gebaut, geringe Marge.',
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 1800,
    buildTimeMinutes: 6 * 60,
    upkeepPerDay: 35,
    availability: 1,
    art: 'foodstand',
    business: {
      kind: 'gastronomy',
      openHour: 10,
      closeHour: 23,
      seats: 6,
      cookRate: 16,
      serviceRate: 30,
      baseDraw: 10,
      recipes: ['noodle_box', 'synth_skewer', 'synth_beer'],
      enabledAtStart: 2,
      startingStaff: [{ role: 'cook', skill: 40 }],
      startingStock: { noodles: 60, vegetables: 45, synthmeat: 40, spices: 15, drinks: 25 },
      storage: 300,
      upgrades: ['kitchen', 'storage', 'decor', 'marketing'],
      hygieneLossPerGuest: 0.05,
    },
  },
  diner: {
    id: 'diner',
    name: 'Imbiss',
    category: 'gastronomy',
    description: 'Schneller Imbiss mit kleiner Karte. Entsteht auch bei der Übernahme eines Konkurrenzlokals.',
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 3800,
    buildTimeMinutes: 10 * 60,
    upkeepPerDay: 55,
    availability: 4,
    art: 'diner',
    business: {
      kind: 'gastronomy',
      openHour: 10,
      closeHour: 1,
      seats: 8,
      cookRate: 15,
      serviceRate: 26,
      baseDraw: 11,
      recipes: ['noodle_box', 'gyoza', 'synth_skewer', 'synth_beer'],
      enabledAtStart: 3,
      startingStaff: [{ role: 'cook', skill: 42 }],
      startingStock: { noodles: 60, vegetables: 45, synthmeat: 50, spices: 15, drinks: 30 },
      storage: 400,
      upgrades: ['seating', 'kitchen', 'storage', 'decor', 'hygiene_station', 'marketing'],
      hygieneLossPerGuest: 0.055,
    },
  },
  capsule_hotel: {
    id: 'capsule_hotel',
    name: 'Kapselhotel',
    category: 'hotel',
    description: 'Schlafkapseln für Pendler und Reisende. Günstige Zimmer, hohe Auslastung, wenig Komfort.',
    footprint: { w: 2, h: 1 },
    floors: 4,
    cost: 24000,
    buildTimeMinutes: 48 * 60,
    upkeepPerDay: 260,
    availability: 4,
    art: 'capsule_hotel',
    business: {
      kind: 'hotel',
      rooms: 24,
      basePricePerNight: 38,
      costPerRoomNight: 7,
      baseDemand: 26,
      comfort: 30,
      startingStaff: [
        { role: 'reception', skill: 45 },
        { role: 'housekeeping', skill: 40 },
      ],
      upgrades: ['rooms', 'lobby', 'housekeeping_tech', 'security', 'marketing'],
    },
  },
  business_hotel: {
    id: 'business_hotel',
    name: 'Businesshotel',
    category: 'hotel',
    description: 'Komfortable Zimmer für Konzernreisende. Teuer im Bau, hohe Preise, anspruchsvolle Gäste.',
    footprint: { w: 2, h: 2 },
    floors: 9,
    cost: 78000,
    buildTimeMinutes: 96 * 60,
    upkeepPerDay: 720,
    availability: 4,
    art: 'capsule_hotel',
    business: {
      kind: 'hotel',
      rooms: 40,
      basePricePerNight: 140,
      costPerRoomNight: 22,
      baseDemand: 22,
      comfort: 75,
      startingStaff: [
        { role: 'reception', skill: 55 },
        { role: 'housekeeping', skill: 50 },
        { role: 'housekeeping', skill: 45 },
      ],
      upgrades: ['rooms', 'lobby', 'housekeeping_tech', 'security', 'marketing'],
    },
  },
  taxi_depot: {
    id: 'taxi_depot',
    name: 'Taxidepot',
    category: 'transport',
    description: 'Basis für eine Taxiflotte: Fahrzeuge kaufen, Fahrer einstellen, Tarife setzen, Werkstatt pflegen.',
    footprint: { w: 2, h: 2 },
    floors: 2,
    cost: 32000,
    buildTimeMinutes: 60 * 60,
    upkeepPerDay: 320,
    availability: 4,
    art: 'taxi_depot',
    business: {
      kind: 'transport',
      startingVehicles: 2,
      vehiclePrice: 9500,
      baseFare: 14,
      energyPerRide: 2.2,
      ridesPerDriverHour: 2.6,
      radius: 28,
      startingStaff: [
        { role: 'driver', skill: 45 },
        { role: 'driver', skill: 40 },
      ],
      upgrades: ['charging', 'workshop', 'dispatch'],
    },
  },
  security_hq: {
    id: 'security_hq',
    name: 'Sicherheitszentrale',
    category: 'security',
    description: 'Private Sicherheitsfirma: Wachleute auf Streife in Bezirken, Verträge mit Stadt und Betrieben, Ermittlungen gegen Familien.',
    footprint: { w: 2, h: 1 },
    floors: 3,
    cost: 28000,
    buildTimeMinutes: 54 * 60,
    upkeepPerDay: 240,
    availability: 5,
    art: 'security_hq',
    business: {
      kind: 'security',
      cityRatePerGuard: 95,
      contractPerVenue: 18,
      startingStaff: [
        { role: 'guard', skill: 45 },
        { role: 'guard', skill: 40 },
        { role: 'investigator', skill: 50 },
      ],
      upgrades: ['security', 'dispatch', 'staff_room'],
    },
  },
  research_lab: {
    id: 'research_lab',
    name: 'Forschungslabor',
    category: 'research',
    description: 'Forscher und Techniker arbeiten an Technologien, die alle deine Betriebe verbessern.',
    footprint: { w: 2, h: 1 },
    floors: 5,
    cost: 36000,
    buildTimeMinutes: 60 * 60,
    upkeepPerDay: 300,
    availability: 7,
    art: 'lab',
    business: {
      kind: 'lab',
      startingStaff: [
        { role: 'researcher', skill: 55 },
        { role: 'researcher', skill: 45 },
        { role: 'technician', skill: 40 },
      ],
      upgrades: ['security', 'staff_room'],
    },
  },
  food_factory: {
    id: 'food_factory',
    name: 'Lebensmittelfabrik',
    category: 'industry',
    description: 'Verarbeitet Rohstoffe zu Nudeln, Brühe, Synth-Fleisch, Getränken und Snacks. Beliefert eigene Betriebe und den Großmarkt.',
    footprint: { w: 2, h: 2 },
    floors: 3,
    cost: 48000,
    buildTimeMinutes: 72 * 60,
    upkeepPerDay: 420,
    availability: 7,
    art: 'factory',
    business: {
      kind: 'industry',
      lines: ['noodle_works', 'broth_kettles', 'synthmeat_plant', 'fermenter', 'snack_line'],
      maxLines: 3,
      baseMachineUnits: 400,
      startingStaff: [
        { role: 'worker', skill: 45 },
        { role: 'worker', skill: 40 },
        { role: 'technician', skill: 45 },
      ],
      startingStock: { grain: 300, protein_base: 150, chemicals: 60 },
      storage: 1500,
      upgrades: ['machines', 'filters', 'storage', 'staff_room'],
    },
  },
  tech_factory: {
    id: 'tech_factory',
    name: 'Elektronikwerk',
    category: 'industry',
    description: 'Stellt Stims und Cyber-Ersatzteile her. Hohe Marge, hoher Energiebedarf, viel Verschmutzung.',
    footprint: { w: 2, h: 2 },
    floors: 4,
    cost: 64000,
    buildTimeMinutes: 84 * 60,
    upkeepPerDay: 520,
    availability: 7,
    art: 'factory',
    business: {
      kind: 'industry',
      lines: ['stim_lab', 'parts_assembly'],
      maxLines: 2,
      baseMachineUnits: 220,
      startingStaff: [
        { role: 'worker', skill: 50 },
        { role: 'technician', skill: 50 },
      ],
      startingStock: { chemicals: 150, electronics: 90 },
      storage: 900,
      upgrades: ['machines', 'filters', 'storage', 'security'],
    },
  },
  kiosk: {
    id: 'kiosk',
    name: 'Nachtkiosk',
    category: 'retail',
    description: 'Rund um die Uhr Snacks, Getränke, Stims und Ersatzteile. Lebt von Laufkundschaft und Marge.',
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 4200,
    buildTimeMinutes: 12 * 60,
    upkeepPerDay: 60,
    availability: 4,
    art: 'kiosk',
    business: {
      kind: 'retail',
      openHour: 6,
      closeHour: 4,
      goods: ['snacks', 'drinks', 'stims', 'cyber_parts', 'meds'],
      clerkRate: 24,
      baseDraw: 16,
      startingStaff: [{ role: 'clerk', skill: 40 }],
      startingStock: { snacks: 80, drinks: 60, stims: 30, cyber_parts: 15, meds: 20 },
      storage: 300,
      upgrades: ['shelves', 'storage', 'decor', 'security', 'marketing'],
    },
  },
};

export const PLAYER_BUILDING_IDS: readonly string[] = Object.keys(BUILDING_DEFINITIONS);

export function getDefinition(defId: string): BuildingDefinition {
  const def = BUILDING_DEFINITIONS[defId];
  if (!def) throw new Error(`Unknown building definition: ${defId}`);
  return def;
}

/** City-owned (NPC) buildings are generated from the district style. */
export interface CityBuildingKind {
  id: string;
  label: string;
  style: DistrictArchetype['style'];
}

export const CITY_BUILDING_LABELS: Record<DistrictArchetype['style'], readonly string[]> = {
  corporate: ['Konzernturm', 'Bürokomplex', 'Datenzentrum', 'Bankgebäude'],
  market: ['Ladenzeile', 'Imbiss', 'Elektronikmarkt', 'Spielhalle', 'Karaoke-Bar'],
  docks: ['Lagerhalle', 'Montagewerk', 'Containerdepot', 'Recyclinganlage'],
  ghost: ['Leerstand', 'Pfandleihe', 'Hinterhofwerkstatt', 'Billigabsteige'],
  old: ['Wohnblock', 'Eckladen', 'Wäscherei', 'Teehaus', 'Mietshaus'],
  chrome: ['Cyberware-Klinik', 'Forschungslabor', 'Apotheke', 'Implantat-Studio'],
  undercity: ['Containerwohnung', 'Schwarzmarktstand', 'Pumpstation', 'Notunterkunft'],
  skyline: ['Luxusresidenz', 'Privatklinik', 'Galerie', 'Penthouse-Turm'],
};
