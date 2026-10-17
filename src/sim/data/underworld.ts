/**
 * Underworld data: organisation roles, illegal operations, rival families
 * and wanted levels. Everything here is abstract game mechanics.
 */

export type CrewRole = 'underboss' | 'advisor' | 'captain' | 'enforcer' | 'driver' | 'informant' | 'accountant' | 'hacker' | 'recruit';

export const CREW_ROLE_LABELS: Record<CrewRole, string> = {
  underboss: 'Stellvertreter',
  advisor: 'Berater',
  captain: 'Bezirksleiter',
  enforcer: 'Vollstrecker',
  driver: 'Fahrer',
  informant: 'Informant',
  accountant: 'Buchhalter',
  hacker: 'Hacker',
  recruit: 'Rekrut',
};

/** Daily cut each role expects (credits, dirty). */
export const CREW_WAGE: Record<CrewRole, number> = {
  underboss: 260,
  advisor: 200,
  captain: 180,
  enforcer: 110,
  driver: 90,
  informant: 80,
  accountant: 150,
  hacker: 170,
  recruit: 50,
};

export interface OperationDefinition {
  id: string;
  name: string;
  description: string;
  /** Required crew by role (any role counts towards `any`). */
  crew: Partial<Record<CrewRole | 'any', number>>;
  /** Duration in hours. */
  hours: number;
  /** Dirty credits paid on success (scaled by district purchasing power). */
  payout: number;
  /** Base risk of failure (0-1) before police presence and heat. */
  risk: number;
  /** Heat added on success / failure. */
  heat: number;
  /** Territory control gained in the district on success. */
  control: number;
  /** Needs minimum territory control in the district. */
  minControl: number;
  /** Repeatable as standing business (daily) or a one-off job. */
  kind: 'job' | 'standing';
}

export const OPERATIONS: Record<string, OperationDefinition> = {
  show_presence: {
    id: 'show_presence',
    name: 'Präsenz zeigen',
    description: 'Vollstrecker patrouillieren im Bezirk. Baut Gebietskontrolle auf, bringt kein Geld.',
    crew: { enforcer: 1, any: 1 },
    hours: 12,
    payout: 0,
    risk: 0.08,
    heat: 3,
    control: 12,
    minControl: 0,
    kind: 'job',
  },
  smuggling_run: {
    id: 'smuggling_run',
    name: 'Schmuggel-Lauf',
    description: 'Ware aus den Rust Docks in den Bezirk bringen. Fahrer und Muskeln nötig.',
    crew: { driver: 1, enforcer: 1 },
    hours: 8,
    payout: 2600,
    risk: 0.2,
    heat: 8,
    control: 3,
    minControl: 10,
    kind: 'job',
  },
  data_heist: {
    id: 'data_heist',
    name: 'Datendiebstahl',
    description: 'Ein Hacker zieht Konzern-Datensätze, ein Informant liefert den Zugang. Hoher Ertrag, hohes Risiko.',
    crew: { hacker: 1, informant: 1 },
    hours: 16,
    payout: 7500,
    risk: 0.3,
    heat: 14,
    control: 0,
    minControl: 0,
    kind: 'job',
  },
  fencing: {
    id: 'fencing',
    name: 'Hehlerei',
    description: 'Gestohlene Ware über einen Mittelsmann verkaufen. Braucht kaum Leute.',
    crew: { any: 1 },
    hours: 6,
    payout: 900,
    risk: 0.12,
    heat: 4,
    control: 1,
    minControl: 0,
    kind: 'job',
  },
  protection: {
    id: 'protection',
    name: 'Schutzgeld',
    description: 'Lokale im kontrollierten Gebiet zahlen täglich. Konkurrenz leidet, Polizei wird aufmerksam.',
    crew: { enforcer: 1 },
    hours: 24,
    payout: 0,
    risk: 0.05,
    heat: 2,
    control: 2,
    minControl: 30,
    kind: 'standing',
  },
  black_market: {
    id: 'black_market',
    name: 'Schwarzmarkt',
    description: 'Ein fester Umschlagplatz im Bezirk. Täglicher Ertrag nach Kaufkraft und Kontrolle.',
    crew: { captain: 1, any: 2 },
    hours: 24,
    payout: 1400,
    risk: 0.1,
    heat: 5,
    control: 1,
    minControl: 40,
    kind: 'standing',
  },
  casino: {
    id: 'casino',
    name: 'Illegales Casino',
    description: 'Hinterzimmer-Casino in einer eigenen Gewerbeimmobilie des Bezirks. Hoher Ertrag, Razzia-Risiko.',
    crew: { accountant: 1, enforcer: 1 },
    hours: 24,
    payout: 2400,
    risk: 0.08,
    heat: 7,
    control: 0,
    minControl: 25,
    kind: 'standing',
  },
};

export const OPERATION_IDS: readonly string[] = Object.keys(OPERATIONS);

export const WANTED_LEVELS: readonly { level: number; name: string; minHeat: number; description: string }[] = [
  { level: 0, name: 'Unauffällig', minHeat: 0, description: 'Niemand schaut hin.' },
  { level: 1, name: 'Verdächtig', minHeat: 12, description: 'Ermittler notieren Namen.' },
  { level: 2, name: 'Unter Beobachtung', minHeat: 28, description: 'Operationen scheitern öfter.' },
  { level: 3, name: 'Ermittlungen', minHeat: 45, description: 'Geldwäsche wird geprüft: halbe Kapazität.' },
  { level: 4, name: 'Razzien', minHeat: 60, description: 'Tägliche Razzia-Chance: Verhaftungen und Beschlagnahmungen.' },
  { level: 5, name: 'Organisierte Fahndung', minHeat: 78, description: 'Standing-Operationen werden ausgehoben, Konten eingefroren.' },
  { level: 6, name: 'Stadtweite Operation', minHeat: 92, description: 'Alles steht still. Nur Abwarten oder Bestechung hilft.' },
];

export function wantedLevelFor(heat: number): number {
  let level = 0;
  for (const w of WANTED_LEVELS) if (heat >= w.minHeat) level = w.level;
  return level;
}

export const RIVAL_FAMILY_NAMES = ['Familie Okonkwo', 'Hayashi-gumi', 'Die Chromkrähen', 'Kartell Vásquez'];
