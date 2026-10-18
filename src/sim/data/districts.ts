/**
 * District archetype definitions. All values are data; the generator assigns
 * archetypes to map regions and the economy systems read these values.
 *
 * Percent-like values are 0-100. Credits are in game credits (¢).
 */

export type DistrictArchetypeId =
  | 'greenhaven'
  | 'silverbrook'
  | 'corporate_heights'
  | 'neon_market'
  | 'rust_docks'
  | 'ghost_quarter'
  | 'old_city'
  | 'chrome_district'
  | 'undercity'
  | 'skyline_gardens';

export interface DistrictStats {
  population: number; // residents
  purchasingPower: number; // 0-100
  rentIndex: number; // credits per tile and day (base rent)
  landPrice: number; // credits per tile when buying a lot
  crime: number; // 0-100
  policePresence: number; // 0-100
  attractiveness: number; // 0-100
  infrastructure: number; // 0-100
  traffic: number; // 0-100 (foot & vehicle traffic, drives walk-in customers)
  energySupply: number; // 0-100 (below 40 construction is throttled)
  water: number; // 0-100
  pollution: number; // 0-100
  corruption: number; // 0-100
  politicalInfluence: number; // 0-100
  demandFood: number; // 0-100 demand for gastronomy
  competition: number; // 0-100 competitive pressure for gastronomy
}

export interface DistrictArchetype {
  id: DistrictArchetypeId;
  name: string;
  tagline: string;
  /** Hex colour used for map overlays and UI accents. */
  color: number;
  /** Visual style key for procedurally drawn buildings. */
  style: 'rural' | 'suburb' | 'corporate' | 'market' | 'docks' | 'ghost' | 'old' | 'chrome' | 'undercity' | 'skyline';
  stats: DistrictStats;
  /** Fraction of block tiles left as empty lots (buildable). */
  vacancy: number;
  /** Fraction of block tiles that become parks / plazas. */
  greenery: number;
  /** Building footprint sizes preferred for city-owned buildings: [w,h,weight]. */
  footprints: readonly (readonly [number, number, number])[];
  /** Floors range for city buildings. */
  floors: readonly [number, number];
}

export const DISTRICT_ARCHETYPES: Record<DistrictArchetypeId, DistrictArchetype> = {
  greenhaven: {
    id: 'greenhaven',
    name: 'Greenhaven',
    tagline: 'Felder, Wälder, Seen und Solardächer',
    color: 0x6fcf6f,
    style: 'rural',
    vacancy: 0.14,
    greenery: 0.5,
    footprints: [
      [1, 1, 6],
      [2, 1, 2],
      [2, 2, 1],
    ],
    floors: [1, 2],
    stats: {
      population: 9000,
      purchasingPower: 48,
      rentIndex: 8,
      landPrice: 320,
      crime: 8,
      policePresence: 40,
      attractiveness: 82,
      infrastructure: 55,
      traffic: 25,
      energySupply: 72,
      water: 92,
      pollution: 4,
      corruption: 10,
      politicalInfluence: 15,
      demandFood: 56,
      competition: 18,
    },
  },
  silverbrook: {
    id: 'silverbrook',
    name: 'Silverbrook',
    tagline: 'Reihenhäuser, Supermärkte und Pendler',
    color: 0x9fb8d8,
    style: 'suburb',
    vacancy: 0.14,
    greenery: 0.16,
    footprints: [
      [1, 1, 4],
      [2, 1, 3],
      [1, 2, 2],
      [2, 2, 1],
    ],
    floors: [2, 4],
    stats: {
      population: 26000,
      purchasingPower: 62,
      rentIndex: 16,
      landPrice: 700,
      crime: 20,
      policePresence: 60,
      attractiveness: 68,
      infrastructure: 76,
      traffic: 60,
      energySupply: 86,
      water: 90,
      pollution: 20,
      corruption: 24,
      politicalInfluence: 30,
      demandFood: 62,
      competition: 40,
    },
  },
  corporate_heights: {
    id: 'corporate_heights',
    name: 'Corporate Heights',
    tagline: 'Glas, Stahl und Konzernmacht',
    color: 0x19e6ff,
    style: 'corporate',
    vacancy: 0.08,
    greenery: 0.08,
    footprints: [
      [2, 2, 5],
      [3, 3, 3],
      [2, 3, 2],
      [1, 1, 1],
    ],
    floors: [8, 20],
    stats: {
      population: 18000,
      purchasingPower: 92,
      rentIndex: 48,
      landPrice: 2600,
      crime: 12,
      policePresence: 85,
      attractiveness: 88,
      infrastructure: 95,
      traffic: 78,
      energySupply: 98,
      water: 96,
      pollution: 22,
      corruption: 55,
      politicalInfluence: 90,
      demandFood: 70,
      competition: 65,
    },
  },
  neon_market: {
    id: 'neon_market',
    name: 'Neon Market',
    tagline: 'Einzelhandel, Imbisse und endlose Reklame',
    color: 0xff2bd6,
    style: 'market',
    vacancy: 0.16,
    greenery: 0.04,
    footprints: [
      [1, 1, 6],
      [2, 1, 3],
      [1, 2, 3],
      [2, 2, 2],
    ],
    floors: [2, 6],
    stats: {
      population: 42000,
      purchasingPower: 58,
      rentIndex: 22,
      landPrice: 1100,
      crime: 38,
      policePresence: 45,
      attractiveness: 72,
      infrastructure: 70,
      traffic: 95,
      energySupply: 85,
      water: 80,
      pollution: 48,
      corruption: 40,
      politicalInfluence: 35,
      demandFood: 95,
      competition: 80,
    },
  },
  rust_docks: {
    id: 'rust_docks',
    name: 'Rust Docks',
    tagline: 'Industrie, Logistik und Rost',
    color: 0xff8a1f,
    style: 'docks',
    vacancy: 0.18,
    greenery: 0.02,
    footprints: [
      [2, 2, 4],
      [3, 2, 3],
      [2, 3, 2],
      [1, 1, 2],
    ],
    floors: [2, 5],
    stats: {
      population: 21000,
      purchasingPower: 38,
      rentIndex: 12,
      landPrice: 520,
      crime: 46,
      policePresence: 30,
      attractiveness: 25,
      infrastructure: 65,
      traffic: 60,
      energySupply: 75,
      water: 60,
      pollution: 85,
      corruption: 50,
      politicalInfluence: 30,
      demandFood: 55,
      competition: 25,
    },
  },
  ghost_quarter: {
    id: 'ghost_quarter',
    name: 'Ghost Quarter',
    tagline: 'Schwarzmarkt und verlassene Fassaden',
    color: 0x9b30ff,
    style: 'ghost',
    vacancy: 0.24,
    greenery: 0.03,
    footprints: [
      [1, 1, 5],
      [2, 1, 3],
      [2, 2, 2],
    ],
    floors: [3, 8],
    stats: {
      population: 26000,
      purchasingPower: 30,
      rentIndex: 8,
      landPrice: 380,
      crime: 82,
      policePresence: 15,
      attractiveness: 18,
      infrastructure: 45,
      traffic: 50,
      energySupply: 60,
      water: 55,
      pollution: 62,
      corruption: 80,
      politicalInfluence: 20,
      demandFood: 60,
      competition: 35,
    },
  },
  old_city: {
    id: 'old_city',
    name: 'Old City',
    tagline: 'Wohnblöcke und kleine Läden',
    color: 0xffb020,
    style: 'old',
    vacancy: 0.14,
    greenery: 0.1,
    footprints: [
      [1, 1, 5],
      [2, 1, 3],
      [1, 2, 3],
      [2, 2, 3],
    ],
    floors: [3, 7],
    stats: {
      population: 55000,
      purchasingPower: 45,
      rentIndex: 16,
      landPrice: 760,
      crime: 35,
      policePresence: 50,
      attractiveness: 52,
      infrastructure: 62,
      traffic: 70,
      energySupply: 80,
      water: 78,
      pollution: 45,
      corruption: 35,
      politicalInfluence: 45,
      demandFood: 80,
      competition: 50,
    },
  },
  chrome_district: {
    id: 'chrome_district',
    name: 'Chrome District',
    tagline: 'Kliniken, Labore und Cyberware',
    color: 0xd9f6ff,
    style: 'chrome',
    vacancy: 0.12,
    greenery: 0.12,
    footprints: [
      [2, 2, 4],
      [2, 3, 2],
      [1, 1, 2],
      [3, 3, 1],
    ],
    floors: [4, 12],
    stats: {
      population: 24000,
      purchasingPower: 78,
      rentIndex: 34,
      landPrice: 1800,
      crime: 18,
      policePresence: 70,
      attractiveness: 75,
      infrastructure: 90,
      traffic: 65,
      energySupply: 95,
      water: 92,
      pollution: 20,
      corruption: 45,
      politicalInfluence: 65,
      demandFood: 60,
      competition: 45,
    },
  },
  undercity: {
    id: 'undercity',
    name: 'The Undercity',
    tagline: 'Informelle Wirtschaft unter der Stadt',
    color: 0x8cff3a,
    style: 'undercity',
    vacancy: 0.2,
    greenery: 0.0,
    footprints: [
      [1, 1, 6],
      [2, 1, 2],
      [2, 2, 1],
    ],
    floors: [1, 3],
    stats: {
      population: 38000,
      purchasingPower: 22,
      rentIndex: 5,
      landPrice: 220,
      crime: 68,
      policePresence: 8,
      attractiveness: 12,
      infrastructure: 30,
      traffic: 55,
      energySupply: 35,
      water: 40,
      pollution: 70,
      corruption: 65,
      politicalInfluence: 10,
      demandFood: 85,
      competition: 30,
    },
  },
  skyline_gardens: {
    id: 'skyline_gardens',
    name: 'Skyline Gardens',
    tagline: 'Luxus über den Wolken',
    color: 0xffe08a,
    style: 'skyline',
    vacancy: 0.1,
    greenery: 0.22,
    footprints: [
      [2, 2, 4],
      [3, 3, 2],
      [2, 3, 2],
      [1, 1, 1],
    ],
    floors: [6, 16],
    stats: {
      population: 9000,
      purchasingPower: 100,
      rentIndex: 60,
      landPrice: 3400,
      crime: 6,
      policePresence: 90,
      attractiveness: 98,
      infrastructure: 97,
      traffic: 40,
      energySupply: 100,
      water: 100,
      pollution: 8,
      corruption: 60,
      politicalInfluence: 85,
      demandFood: 50,
      competition: 40,
    },
  },
};

export const DISTRICT_ORDER: readonly DistrictArchetypeId[] = [
  'greenhaven',
  'silverbrook',
  'corporate_heights',
  'neon_market',
  'rust_docks',
  'ghost_quarter',
  'old_city',
  'chrome_district',
  'undercity',
  'skyline_gardens',
];
