/**
 * Factions, parties and laws. Pure data; the systems interpret it.
 */

export type FactionId =
  | 'hyperion'
  | 'kosei'
  | 'union'
  | 'citizens'
  | 'police'
  | 'nullsect'
  | 'novanet'
  | 'progress_bloc'
  | 'social_alliance'
  | 'city_hall'
  | 'green_cell'
  | 'signal_church';

export type FactionKind = 'corporation' | 'union' | 'civic' | 'police' | 'hackers' | 'media' | 'party' | 'administration' | 'activists' | 'religion';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  kind: FactionKind;
  description: string;
  /** What the faction wants; shown to the player and used by the relation model. */
  goals: readonly string[];
  /** Districts where the faction is strong. */
  homeDistricts: readonly string[];
  allies: readonly FactionId[];
  enemies: readonly FactionId[];
  baseInfluence: number;
}

export const FACTIONS: Record<FactionId, FactionDefinition> = {
  hyperion: {
    id: 'hyperion',
    name: 'Hyperion Dynamics',
    kind: 'corporation',
    description: 'Megakonzern für Robotik und Sicherheitstechnik. Will niedrige Steuern, freie Bauordnung und Ruhe in Corporate Heights.',
    goals: ['Niedrige Umsatzsteuer', 'Lockere Bauordnung', 'Hohe Polizeipräsenz in Corporate Heights'],
    homeDistricts: ['corporate_heights', 'chrome_district'],
    allies: ['progress_bloc', 'police'],
    enemies: ['union', 'nullsect', 'green_cell'],
    baseInfluence: 85,
  },
  kosei: {
    id: 'kosei',
    name: 'Kōsei Group',
    kind: 'corporation',
    description: 'Konzern für Lebensmittel, Logistik und Hotels. Konkurriert mit dir in Gastronomie und Hotellerie.',
    goals: ['Keine Mindestlöhne', 'Übernahme erfolgreicher Betriebe', 'Freie Preise'],
    homeDistricts: ['skyline_gardens', 'rust_docks'],
    allies: ['progress_bloc', 'novanet'],
    enemies: ['union', 'citizens'],
    baseInfluence: 70,
  },
  union: {
    id: 'union',
    name: 'Dockarbeitergewerkschaft',
    kind: 'union',
    description: 'Organisiert Arbeiter in den Rust Docks und darüber hinaus. Streikt, wenn Löhne unter dem Erwarteten liegen.',
    goals: ['Mindestlohn', 'Faire Löhne in Betrieben', 'Arbeitsplätze in den Docks'],
    homeDistricts: ['rust_docks', 'old_city', 'undercity'],
    allies: ['social_alliance', 'citizens'],
    enemies: ['hyperion', 'kosei'],
    baseInfluence: 50,
  },
  citizens: {
    id: 'citizens',
    name: 'Bürgerrat Old City',
    kind: 'civic',
    description: 'Mieterinitiative gegen Verdrängung. Protestiert gegen hohe Mieten und Luxusbauten in Wohnvierteln.',
    goals: ['Mietdeckel', 'Bezahlbarer Wohnraum', 'Keine Verdrängung'],
    homeDistricts: ['old_city', 'ghost_quarter'],
    allies: ['social_alliance', 'union'],
    enemies: ['kosei'],
    baseInfluence: 40,
  },
  police: {
    id: 'police',
    name: 'Polizei Nova Eclipse',
    kind: 'police',
    description: 'Die städtische Polizei. Schätzt Sicherheitsfirmen, die kooperieren, und jagt Organisationen, die auffallen.',
    goals: ['Hohes Polizeibudget', 'Weniger Kriminalität', 'Kooperation privater Sicherheitsfirmen'],
    homeDistricts: ['corporate_heights', 'skyline_gardens'],
    allies: ['city_hall', 'hyperion'],
    enemies: ['nullsect'],
    baseInfluence: 65,
  },
  nullsect: {
    id: 'nullsect',
    name: 'Null Sect',
    kind: 'hackers',
    description: 'Hackerkollektiv aus der Undercity. Greift Konzerne und unsichere Betriebe an, verkauft Daten.',
    goals: ['Schwache Überwachung', 'Offene Netze', 'Chaos in Corporate Heights'],
    homeDistricts: ['undercity', 'ghost_quarter'],
    allies: ['green_cell'],
    enemies: ['hyperion', 'police'],
    baseInfluence: 35,
  },
  novanet: {
    id: 'novanet',
    name: 'NovaNet Media',
    kind: 'media',
    description: 'Größter Nachrichtenkanal der Stadt. Berichte können deinen Ruf heben oder zerstören.',
    goals: ['Exklusive Geschichten', 'Werbekunden', 'Zugang zu Konzernen'],
    homeDistricts: ['neon_market', 'corporate_heights'],
    allies: ['kosei'],
    enemies: [],
    baseInfluence: 60,
  },
  progress_bloc: {
    id: 'progress_bloc',
    name: 'Fortschrittsblock',
    kind: 'party',
    description: 'Wirtschaftsliberale Partei: niedrige Steuern, lockere Bauordnung, Sicherheit durch Technik.',
    goals: ['Umsatzsteuer senken', 'Bauordnung lockern', 'Polizeibudget erhöhen'],
    homeDistricts: ['corporate_heights', 'chrome_district', 'skyline_gardens'],
    allies: ['hyperion', 'kosei'],
    enemies: ['social_alliance'],
    baseInfluence: 55,
  },
  social_alliance: {
    id: 'social_alliance',
    name: 'Soziale Allianz',
    kind: 'party',
    description: 'Sozialpartei: Mindestlohn, Mietdeckel, Sozialprogramme aus Steuern.',
    goals: ['Mindestlohn erhöhen', 'Mietdeckel', 'Sozialprogramme'],
    homeDistricts: ['old_city', 'undercity', 'rust_docks'],
    allies: ['union', 'citizens'],
    enemies: ['progress_bloc'],
    baseInfluence: 50,
  },
  city_hall: {
    id: 'city_hall',
    name: 'Stadtverwaltung',
    kind: 'administration',
    description: 'Bürgermeisteramt und Behörden. Vergibt Genehmigungen und Verträge, hört auf die Mehrheit im Rat.',
    goals: ['Volle Kassen', 'Ruhige Bezirke', 'Funktionierende Infrastruktur'],
    homeDistricts: ['corporate_heights'],
    allies: ['police'],
    enemies: [],
    baseInfluence: 75,
  },
  green_cell: {
    id: 'green_cell',
    name: 'Grüne Zelle',
    kind: 'activists',
    description: 'Umweltaktivisten. Blockieren verschmutzende Betriebe und fordern saubere Energie.',
    goals: ['Weniger Verschmutzung', 'Saubere Energie', 'Grünflächen'],
    homeDistricts: ['chrome_district', 'skyline_gardens'],
    allies: ['nullsect', 'citizens'],
    enemies: ['hyperion'],
    baseInfluence: 30,
  },
  signal_church: {
    id: 'signal_church',
    name: 'Kirche des Signals',
    kind: 'religion',
    description: 'Techno-religiöse Bewegung mit Anhängern in allen Schichten. Spenden kaufen Wohlwollen und Gäste.',
    goals: ['Mitglieder', 'Spenden', 'Respekt'],
    homeDistricts: ['ghost_quarter', 'undercity', 'old_city'],
    allies: [],
    enemies: [],
    baseInfluence: 35,
  },
};

export const FACTION_IDS: readonly FactionId[] = Object.keys(FACTIONS) as FactionId[];
export const PARTY_IDS: readonly FactionId[] = ['progress_bloc', 'social_alliance'];

// ------------------------------------------------------------------ laws

export interface LawDefinition {
  id: string;
  name: string;
  description: string;
  /** Selectable values with labels; effects are interpreted by the politics system. */
  options: readonly { value: number; label: string }[];
  defaultValue: number;
  /** Which party favours higher values (+1) or lower values (−1). */
  progressBias: number;
}

export const LAWS: Record<string, LawDefinition> = {
  salesTax: {
    id: 'salesTax',
    name: 'Umsatzsteuer',
    description: 'Prozentsatz auf alle Verkaufserlöse deiner Betriebe, täglich abgeführt. Finanziert Polizei und Sozialprogramme.',
    options: [
      { value: 0.04, label: '4 %' },
      { value: 0.08, label: '8 %' },
      { value: 0.12, label: '12 %' },
      { value: 0.16, label: '16 %' },
    ],
    defaultValue: 0.08,
    progressBias: -1,
  },
  minimumWage: {
    id: 'minimumWage',
    name: 'Mindestlohn',
    description: 'Untergrenze für Tageslöhne. Höhere Werte heben Lohnerwartungen und Kaufkraft in armen Bezirken.',
    options: [
      { value: 0, label: 'keiner' },
      { value: 60, label: '60 ¢' },
      { value: 80, label: '80 ¢' },
      { value: 100, label: '100 ¢' },
    ],
    defaultValue: 0,
    progressBias: -1,
  },
  rentCap: {
    id: 'rentCap',
    name: 'Mietdeckel',
    description: 'Obergrenze für das Mietniveau eigener Immobilien.',
    options: [
      { value: 1.6, label: 'keiner' },
      { value: 1.3, label: '130 %' },
      { value: 1.1, label: '110 %' },
    ],
    defaultValue: 1.6,
    progressBias: 1,
  },
  policeBudget: {
    id: 'policeBudget',
    name: 'Polizeibudget',
    description: 'Höheres Budget hebt die Polizeipräsenz in allen Bezirken, lässt Aufmerksamkeit langsamer sinken und kostet Steuern.',
    options: [
      { value: 0.7, label: 'gekürzt' },
      { value: 1, label: 'normal' },
      { value: 1.3, label: 'erhöht' },
    ],
    defaultValue: 1,
    progressBias: 1,
  },
  zoning: {
    id: 'zoning',
    name: 'Bauordnung',
    description: 'Strenge Bauordnung verteuert und verlangsamt Neubauten, hebt aber die Attraktivität.',
    options: [
      { value: 0.85, label: 'locker' },
      { value: 1, label: 'normal' },
      { value: 1.25, label: 'streng' },
    ],
    defaultValue: 1,
    progressBias: -1,
  },
  curfew: {
    id: 'curfew',
    name: 'Sperrstunde',
    description: 'Gastronomie muss früher schließen. Weniger Nachtumsatz, weniger Kriminalität.',
    options: [
      { value: 0, label: 'keine' },
      { value: 1, label: '1 Uhr' },
      { value: 2, label: '23 Uhr' },
    ],
    defaultValue: 0,
    progressBias: 0,
  },
};

export const LAW_IDS: readonly string[] = Object.keys(LAWS);

export const COUNCIL_SEATS = 24;
export const ELECTION_INTERVAL_DAYS = 30;
