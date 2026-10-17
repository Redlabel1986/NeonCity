/** Upgrades / rooms for gastronomy businesses. Level 0 = not built. */

export interface UpgradeLevel {
  cost: number;
  hours: number;
  /** Human readable effect. */
  effect: string;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  levels: readonly UpgradeLevel[];
}

export const UPGRADES: Record<string, UpgradeDefinition> = {
  seating: {
    id: 'seating',
    name: 'Gastraum',
    description: 'Mehr Sitzplätze und Theke. Erhöht die Gäste pro Stunde.',
    levels: [
      { cost: 2200, hours: 10, effect: '+6 Plätze' },
      { cost: 4200, hours: 14, effect: '+6 Plätze' },
      { cost: 7500, hours: 20, effect: '+8 Plätze' },
    ],
  },
  kitchen: {
    id: 'kitchen',
    name: 'Küche',
    description: 'Bessere Kochstationen: schneller und höhere Qualität.',
    levels: [
      { cost: 2800, hours: 12, effect: '+25 % Kochleistung, +5 Qualität' },
      { cost: 5600, hours: 16, effect: '+25 % Kochleistung, +5 Qualität' },
      { cost: 9800, hours: 24, effect: '+30 % Kochleistung, +8 Qualität' },
    ],
  },
  storage: {
    id: 'storage',
    name: 'Lager',
    description: 'Kühlzellen und Regale: mehr Platz, langsameres Verderben.',
    levels: [
      { cost: 1500, hours: 8, effect: '+80 Einheiten, +1 Tag Haltbarkeit' },
      { cost: 3200, hours: 12, effect: '+120 Einheiten, +1 Tag Haltbarkeit' },
    ],
  },
  decor: {
    id: 'decor',
    name: 'Ausstattung',
    description: 'Neonlicht, Hologramme, bessere Sitze. Steigert Zufriedenheit und Anziehung.',
    levels: [
      { cost: 1800, hours: 8, effect: '+6 Zufriedenheit, +8 % Anziehung' },
      { cost: 3600, hours: 10, effect: '+6 Zufriedenheit, +8 % Anziehung' },
      { cost: 7200, hours: 14, effect: '+8 Zufriedenheit, +10 % Anziehung' },
    ],
  },
  hygiene_station: {
    id: 'hygiene_station',
    name: 'Hygienestation',
    description: 'Automatische Reinigung: Hygiene fällt langsamer.',
    levels: [
      { cost: 1200, hours: 6, effect: '−40 % Hygieneverlust' },
      { cost: 2600, hours: 8, effect: '−30 % Hygieneverlust' },
    ],
  },
  staff_room: {
    id: 'staff_room',
    name: 'Personalraum',
    description: 'Pausenraum und Spinde. Hält die Moral oben.',
    levels: [
      { cost: 1400, hours: 8, effect: '+8 Moral' },
      { cost: 3000, hours: 10, effect: '+8 Moral' },
    ],
  },
  marketing: {
    id: 'marketing',
    name: 'Leuchtreklame',
    description: 'Hologramm-Werbung an der Fassade zieht Laufkundschaft an.',
    levels: [
      { cost: 1600, hours: 6, effect: '+12 % Anziehung' },
      { cost: 3400, hours: 8, effect: '+12 % Anziehung' },
    ],
  },
};

// Hotel
UPGRADES.rooms = {
  id: 'rooms',
  name: 'Zimmerausbau',
  description: 'Weitere Etagen werden hergerichtet: mehr Zimmer.',
  levels: [
    { cost: 9000, hours: 24, effect: '+8 Zimmer' },
    { cost: 16000, hours: 30, effect: '+8 Zimmer' },
    { cost: 26000, hours: 40, effect: '+12 Zimmer' },
  ],
};
UPGRADES.lobby = {
  id: 'lobby',
  name: 'Lobby & Bar',
  description: 'Empfangsbereich mit Bar: höherer Komfort und bessere Bewertungen.',
  levels: [
    { cost: 6000, hours: 16, effect: '+8 Komfort' },
    { cost: 12000, hours: 20, effect: '+8 Komfort' },
  ],
};
UPGRADES.housekeeping_tech = {
  id: 'housekeeping_tech',
  name: 'Reinigungsroboter',
  description: 'Automatisierte Reinigung senkt die Kosten je Zimmernacht und hält die Sauberkeit hoch.',
  levels: [
    { cost: 7000, hours: 12, effect: '−25 % Zimmerkosten, Sauberkeit +' },
    { cost: 14000, hours: 14, effect: '−25 % Zimmerkosten, Sauberkeit ++' },
  ],
};
UPGRADES.security = {
  id: 'security',
  name: 'Sicherheitssystem',
  description: 'Kameras, Schleusen, Wachpersonal-Terminals. Schützt vor Diebstahl und beruhigt Gäste.',
  levels: [
    { cost: 4000, hours: 10, effect: '−50 % Schwund und Zwischenfälle' },
    { cost: 8000, hours: 12, effect: '−75 % Schwund und Zwischenfälle' },
  ],
};
// Transport
UPGRADES.charging = {
  id: 'charging',
  name: 'Ladestation',
  description: 'Eigene Schnelllader senken die Energiekosten je Fahrt.',
  levels: [
    { cost: 8000, hours: 16, effect: '−30 % Energiekosten' },
    { cost: 15000, hours: 20, effect: '−50 % Energiekosten' },
  ],
};
UPGRADES.workshop = {
  id: 'workshop',
  name: 'Werkstatt',
  description: 'Eigene Mechaniker: günstigere Reparaturen, Fahrzeuge halten länger.',
  levels: [
    { cost: 9000, hours: 20, effect: 'Verschleiß −30 %, Reparaturen −40 %' },
    { cost: 17000, hours: 24, effect: 'Verschleiß −50 %, Reparaturen −60 %' },
  ],
};
UPGRADES.dispatch = {
  id: 'dispatch',
  name: 'Dispatch-KI',
  description: 'Routenoptimierung: mehr Fahrten je Fahrer und Stunde.',
  levels: [
    { cost: 6000, hours: 8, effect: '+20 % Fahrten' },
    { cost: 12000, hours: 10, effect: '+40 % Fahrten' },
  ],
};
// Retail
UPGRADES.shelves = {
  id: 'shelves',
  name: 'Regalsystem',
  description: 'Mehr Regalfläche: mehr Kunden je Stunde und größerer Warenkorb.',
  levels: [
    { cost: 2500, hours: 8, effect: '+30 % Kundenkapazität, Warenkorb +10 %' },
    { cost: 5000, hours: 10, effect: '+30 % Kundenkapazität, Warenkorb +10 %' },
  ],
};

// Industry
UPGRADES.machines = {
  id: 'machines',
  name: 'Maschinenpark',
  description: 'Mehr und bessere Maschinen: höhere Tagesleistung und Qualität.',
  levels: [
    { cost: 15000, hours: 24, effect: '+40 % Maschinenleistung, +5 Qualität' },
    { cost: 28000, hours: 30, effect: '+40 % Maschinenleistung, +5 Qualität' },
    { cost: 45000, hours: 40, effect: '+50 % Maschinenleistung, +5 Qualität' },
  ],
};
UPGRADES.filters = {
  id: 'filters',
  name: 'Filteranlage',
  description: 'Abgasfilter und Wasseraufbereitung senken die Verschmutzung.',
  levels: [
    { cost: 9000, hours: 16, effect: '−40 % Verschmutzung' },
    { cost: 17000, hours: 20, effect: '−80 % Verschmutzung' },
  ],
};

export const UPGRADE_IDS: readonly string[] = Object.keys(UPGRADES);

/** Numeric effects per upgrade level (cumulative over levels). */
export function upgradeEffects(upgrades: Record<string, number>): {
  seats: number;
  cookRate: number;
  quality: number;
  storage: number;
  shelfLife: number;
  satisfaction: number;
  draw: number;
  hygieneLoss: number;
  morale: number;
  rooms: number;
  comfort: number;
  roomCost: number;
  security: number;
  energy: number;
  wear: number;
  repair: number;
  rides: number;
  clerkRate: number;
  basket: number;
  machines: number;
} {
  const lvl = (id: string): number => upgrades[id] ?? 0;
  const seatsByLevel = [0, 6, 12, 20];
  const cookByLevel = [1, 1.25, 1.5, 1.8];
  const qualityByLevel = [0, 5, 10, 18];
  const storageByLevel = [0, 80, 200];
  const shelfByLevel = [0, 1, 2];
  const satByLevel = [0, 6, 12, 20];
  const drawDecor = [1, 1.08, 1.16, 1.26];
  const drawMarketing = [1, 1.12, 1.24];
  const hygieneByLevel = [1, 0.6, 0.3];
  const moraleByLevel = [0, 8, 16];
  const roomsByLevel = [0, 8, 16, 28];
  const comfortByLevel = [0, 8, 16];
  const roomCostByLevel = [1, 0.75, 0.5];
  const securityByLevel = [1, 0.5, 0.25];
  const energyByLevel = [1, 0.7, 0.5];
  const wearByLevel = [1, 0.7, 0.5];
  const repairByLevel = [1, 0.6, 0.4];
  const ridesByLevel = [1, 1.2, 1.4];
  const clerkByLevel = [1, 1.3, 1.6];
  const basketByLevel = [1, 1.1, 1.2];
  const machinesByLevel = [1, 1.4, 1.8, 2.3];
  return {
    seats: seatsByLevel[lvl('seating')] ?? 0,
    cookRate: cookByLevel[lvl('kitchen')] ?? 1,
    quality: qualityByLevel[lvl('kitchen')] ?? 0,
    storage: storageByLevel[lvl('storage')] ?? 0,
    shelfLife: shelfByLevel[lvl('storage')] ?? 0,
    satisfaction: satByLevel[lvl('decor')] ?? 0,
    draw: (drawDecor[lvl('decor')] ?? 1) * (drawMarketing[lvl('marketing')] ?? 1),
    hygieneLoss: hygieneByLevel[lvl('hygiene_station')] ?? 1,
    morale: moraleByLevel[lvl('staff_room')] ?? 0,
    rooms: roomsByLevel[lvl('rooms')] ?? 0,
    comfort: comfortByLevel[lvl('lobby')] ?? 0,
    roomCost: roomCostByLevel[lvl('housekeeping_tech')] ?? 1,
    security: securityByLevel[lvl('security')] ?? 1,
    energy: energyByLevel[lvl('charging')] ?? 1,
    wear: wearByLevel[lvl('workshop')] ?? 1,
    repair: repairByLevel[lvl('workshop')] ?? 1,
    rides: ridesByLevel[lvl('dispatch')] ?? 1,
    clerkRate: clerkByLevel[lvl('shelves')] ?? 1,
    basket: basketByLevel[lvl('shelves')] ?? 1,
    machines: machinesByLevel[lvl('machines')] ?? 1,
  };
}
