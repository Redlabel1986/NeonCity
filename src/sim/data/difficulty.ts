/** Difficulty presets and player backgrounds. Pure data. */

export type DifficultyId = 'story' | 'casual' | 'standard' | 'hardcore' | 'sandbox';

export interface DifficultyPreset {
  id: DifficultyId;
  name: string;
  description: string;
  startingCredits: number;
  /** Multiplier on construction costs and land prices. */
  costMultiplier: number;
  /** Multiplier on customer demand. */
  demandMultiplier: number;
  /** Multiplier on daily rent of the player's apartment. */
  rentMultiplier: number;
  /** Sandbox: instant construction and no money checks. */
  instantBuild: boolean;
  unlimitedMoney: boolean;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyPreset> = {
  story: {
    id: 'story',
    name: 'Story',
    description: 'Entspannt die Stadt erkunden. Großzügiges Startkapital und milde Kosten.',
    startingCredits: 60000,
    costMultiplier: 0.8,
    demandMultiplier: 1.3,
    rentMultiplier: 0.6,
    instantBuild: false,
    unlimitedMoney: false,
  },
  casual: {
    id: 'casual',
    name: 'Casual',
    description: 'Fehler verzeihen, aber Geld muss verdient werden.',
    startingCredits: 35000,
    costMultiplier: 0.9,
    demandMultiplier: 1.15,
    rentMultiplier: 0.8,
    instantBuild: false,
    unlimitedMoney: false,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Die vorgesehene Erfahrung. Jede Entscheidung zählt.',
    startingCredits: 22000,
    costMultiplier: 1,
    demandMultiplier: 1,
    rentMultiplier: 1,
    instantBuild: false,
    unlimitedMoney: false,
  },
  hardcore: {
    id: 'hardcore',
    name: 'Hardcore',
    description: 'Wenig Geld, hohe Mieten, gnadenlose Konkurrenz.',
    startingCredits: 12000,
    costMultiplier: 1.2,
    demandMultiplier: 0.85,
    rentMultiplier: 1.4,
    instantBuild: false,
    unlimitedMoney: false,
  },
  sandbox: {
    id: 'sandbox',
    name: 'Sandbox',
    description: 'Unbegrenztes Geld, sofortiger Bau. Zum Experimentieren.',
    startingCredits: 1_000_000,
    costMultiplier: 1,
    demandMultiplier: 1,
    rentMultiplier: 1,
    instantBuild: true,
    unlimitedMoney: true,
  },
};

export type BackgroundId = 'street_kid' | 'ex_corporate' | 'restaurateur' | 'heir' | 'mechanic' | 'ex_cop' | 'hacker' | 'smuggler' | 'consultant' | 'gang_member';

export interface BackgroundPerks {
  /** Multiplier on taxi vehicle wear. */
  vehicleWear?: number;
  /** Multiplier on research points. */
  research?: number;
  /** Multiplier on the cost of founding a criminal organisation. */
  foundingCost?: number;
  /** Dirty credits at the start. */
  startDirty?: number;
  /** Political influence at the start. */
  startInfluence?: number;
  /** Skill bonus for crew candidates. */
  crewSkill?: number;
  /** Faster decay of police attention. */
  heatDecay?: number;
  /** Starting relations with factions. */
  relations?: Partial<Record<string, number>>;
}

export interface PlayerBackground {
  id: BackgroundId;
  name: string;
  description: string;
  /** Added to the difficulty's starting credits. */
  creditsBonus: number;
  /** Daily rent of the starting apartment in credits. */
  apartmentRent: number;
  /** Which district the camera and apartment start in. */
  homeDistrict: 'greenhaven' | 'silverbrook' | 'old_city' | 'undercity' | 'corporate_heights' | 'neon_market' | 'skyline_gardens' | 'ghost_quarter' | 'chrome_district' | 'rust_docks';
  /** Multiplier on gastronomy guest draw. */
  gastronomyBonus: number;
  /** Multiplier on construction cost. */
  constructionBonus: number;
  perks?: BackgroundPerks;
}

export const BACKGROUNDS: Record<BackgroundId, PlayerBackground> = {
  street_kid: {
    id: 'street_kid',
    name: 'Straßenkind',
    description: 'Aufgewachsen in der Undercity. Kaum Geld, aber billige Miete und ein Gespür für die Straße.',
    creditsBonus: -4000,
    apartmentRent: 40,
    homeDistrict: 'undercity',
    gastronomyBonus: 1.0,
    constructionBonus: 0.92,
  },
  ex_corporate: {
    id: 'ex_corporate',
    name: 'Ex-Konzernangestellter',
    description: 'Abfindung in der Tasche, Kontakte in Corporate Heights, teure Wohnung.',
    creditsBonus: 6000,
    apartmentRent: 160,
    homeDistrict: 'corporate_heights',
    gastronomyBonus: 1.0,
    constructionBonus: 1.0,
  },
  restaurateur: {
    id: 'restaurateur',
    name: 'Gastronom',
    description: 'Jahre hinter dem Tresen. Gäste spüren Qualität, und du weißt, was sie wollen.',
    creditsBonus: 0,
    apartmentRent: 90,
    homeDistrict: 'neon_market',
    gastronomyBonus: 1.15,
    constructionBonus: 1.0,
  },
  heir: {
    id: 'heir',
    name: 'Immobilienerbe',
    description: 'Viel Kapital, hoher Lebensstandard, keine Ahnung von Nudelsuppe.',
    creditsBonus: 15000,
    apartmentRent: 260,
    homeDistrict: 'skyline_gardens',
    gastronomyBonus: 0.9,
    constructionBonus: 1.0,
  },
  mechanic: {
    id: 'mechanic',
    name: 'Mechaniker',
    description: 'Jahre in den Werkstätten der Rust Docks. Deine Fahrzeuge halten länger, die Gewerkschaft kennt dich.',
    creditsBonus: -1000,
    apartmentRent: 70,
    homeDistrict: 'old_city',
    gastronomyBonus: 1.0,
    constructionBonus: 0.97,
    perks: { vehicleWear: 0.7, relations: { union: 20 } },
  },
  ex_cop: {
    id: 'ex_cop',
    name: 'Ehemaliger Polizist',
    description: 'Du kennst die Reviere und die Ermittler. Die Polizei vertraut dir, Aufmerksamkeit verfliegt schneller, die Familien misstrauen dir.',
    creditsBonus: 2000,
    apartmentRent: 110,
    homeDistrict: 'corporate_heights',
    gastronomyBonus: 1.0,
    constructionBonus: 1.0,
    perks: { heatDecay: 1.4, relations: { police: 35, city_hall: 10, nullsect: -20 } },
  },
  hacker: {
    id: 'hacker',
    name: 'Hacker',
    description: 'Aus der Undercity ins Netz. Forschung geht dir leichter von der Hand, Null Sect lässt deine Systeme in Ruhe.',
    creditsBonus: 0,
    apartmentRent: 55,
    homeDistrict: 'undercity',
    gastronomyBonus: 1.0,
    constructionBonus: 1.0,
    perks: { research: 1.2, relations: { nullsect: 40, hyperion: -15 } },
  },
  smuggler: {
    id: 'smuggler',
    name: 'Schmuggler',
    description: 'Wenig sauberes Geld, aber Schwarzgeld, Kontakte und ein Gespür für die Docks. Eine Organisation gründest du günstig.',
    creditsBonus: -6000,
    apartmentRent: 60,
    homeDistrict: 'ghost_quarter',
    gastronomyBonus: 1.0,
    constructionBonus: 1.0,
    perks: { foundingCost: 0.5, startDirty: 4000, crewSkill: 5, relations: { police: -20 } },
  },
  consultant: {
    id: 'consultant',
    name: 'Unternehmensberater',
    description: 'Du kennst den Rat und die Konzerne. Politischer Einfluss von Anfang an, aber die Straße kennt dich nicht.',
    creditsBonus: 4000,
    apartmentRent: 180,
    homeDistrict: 'chrome_district',
    gastronomyBonus: 0.95,
    constructionBonus: 1.0,
    perks: { startInfluence: 15, relations: { city_hall: 25, progress_bloc: 20, novanet: 10 } },
  },
  gang_member: {
    id: 'gang_member',
    name: 'Gangmitglied',
    description: 'Du kommst aus einer Familie. Bessere Leute für die Organisation, Gründung umsonst, aber die Polizei hat dich auf dem Schirm.',
    creditsBonus: -3000,
    apartmentRent: 45,
    homeDistrict: 'ghost_quarter',
    gastronomyBonus: 1.0,
    constructionBonus: 0.95,
    perks: { foundingCost: 0, crewSkill: 12, startDirty: 1500, relations: { police: -30, union: 10 } },
  },
};
