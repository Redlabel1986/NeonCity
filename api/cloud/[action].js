// server/vercelCloud.ts
import { del, get, put } from "@vercel/blob";

// server/cloud.ts
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// src/sim/core/clock.ts
var MINUTES_PER_HOUR = 60;
var HOURS_PER_DAY = 24;
var MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
var START_MINUTE_OF_DAY = 7 * MINUTES_PER_HOUR;

// src/sim/data/districts.ts
var DISTRICT_ARCHETYPES = {
  greenhaven: {
    id: "greenhaven",
    name: "Greenhaven",
    tagline: "Felder, W\xE4lder, Seen und Solard\xE4cher",
    color: 7327599,
    style: "rural",
    vacancy: 0.14,
    greenery: 0.5,
    footprints: [
      [1, 1, 6],
      [2, 1, 2],
      [2, 2, 1]
    ],
    floors: [1, 2],
    stats: {
      population: 9e3,
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
      competition: 18
    }
  },
  silverbrook: {
    id: "silverbrook",
    name: "Silverbrook",
    tagline: "Reihenh\xE4user, Superm\xE4rkte und Pendler",
    color: 10467544,
    style: "suburb",
    vacancy: 0.14,
    greenery: 0.16,
    footprints: [
      [1, 1, 4],
      [2, 1, 3],
      [1, 2, 2],
      [2, 2, 1]
    ],
    floors: [2, 4],
    stats: {
      population: 26e3,
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
      competition: 40
    }
  },
  corporate_heights: {
    id: "corporate_heights",
    name: "Corporate Heights",
    tagline: "Glas, Stahl und Konzernmacht",
    color: 1697535,
    style: "corporate",
    vacancy: 0.08,
    greenery: 0.08,
    footprints: [
      [2, 2, 5],
      [3, 3, 3],
      [2, 3, 2],
      [1, 1, 1]
    ],
    floors: [8, 20],
    stats: {
      population: 18e3,
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
      competition: 65
    }
  },
  neon_market: {
    id: "neon_market",
    name: "Neon Market",
    tagline: "Einzelhandel, Imbisse und endlose Reklame",
    color: 16722902,
    style: "market",
    vacancy: 0.16,
    greenery: 0.04,
    footprints: [
      [1, 1, 6],
      [2, 1, 3],
      [1, 2, 3],
      [2, 2, 2]
    ],
    floors: [2, 6],
    stats: {
      population: 42e3,
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
      competition: 80
    }
  },
  rust_docks: {
    id: "rust_docks",
    name: "Rust Docks",
    tagline: "Industrie, Logistik und Rost",
    color: 16747039,
    style: "docks",
    vacancy: 0.18,
    greenery: 0.02,
    footprints: [
      [2, 2, 4],
      [3, 2, 3],
      [2, 3, 2],
      [1, 1, 2]
    ],
    floors: [2, 5],
    stats: {
      population: 21e3,
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
      competition: 25
    }
  },
  ghost_quarter: {
    id: "ghost_quarter",
    name: "Ghost Quarter",
    tagline: "Schwarzmarkt und verlassene Fassaden",
    color: 10170623,
    style: "ghost",
    vacancy: 0.24,
    greenery: 0.03,
    footprints: [
      [1, 1, 5],
      [2, 1, 3],
      [2, 2, 2]
    ],
    floors: [3, 8],
    stats: {
      population: 26e3,
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
      competition: 35
    }
  },
  old_city: {
    id: "old_city",
    name: "Old City",
    tagline: "Wohnbl\xF6cke und kleine L\xE4den",
    color: 16756768,
    style: "old",
    vacancy: 0.14,
    greenery: 0.1,
    footprints: [
      [1, 1, 5],
      [2, 1, 3],
      [1, 2, 3],
      [2, 2, 3]
    ],
    floors: [3, 7],
    stats: {
      population: 55e3,
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
      competition: 50
    }
  },
  chrome_district: {
    id: "chrome_district",
    name: "Chrome District",
    tagline: "Kliniken, Labore und Cyberware",
    color: 14284543,
    style: "chrome",
    vacancy: 0.12,
    greenery: 0.12,
    footprints: [
      [2, 2, 4],
      [2, 3, 2],
      [1, 1, 2],
      [3, 3, 1]
    ],
    floors: [4, 12],
    stats: {
      population: 24e3,
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
      competition: 45
    }
  },
  undercity: {
    id: "undercity",
    name: "The Undercity",
    tagline: "Informelle Wirtschaft unter der Stadt",
    color: 9240378,
    style: "undercity",
    vacancy: 0.2,
    greenery: 0,
    footprints: [
      [1, 1, 6],
      [2, 1, 2],
      [2, 2, 1]
    ],
    floors: [1, 3],
    stats: {
      population: 38e3,
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
      competition: 30
    }
  },
  skyline_gardens: {
    id: "skyline_gardens",
    name: "Skyline Gardens",
    tagline: "Luxus \xFCber den Wolken",
    color: 16769162,
    style: "skyline",
    vacancy: 0.1,
    greenery: 0.22,
    footprints: [
      [2, 2, 4],
      [3, 3, 2],
      [2, 3, 2],
      [1, 1, 1]
    ],
    floors: [6, 16],
    stats: {
      population: 9e3,
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
      competition: 40
    }
  }
};

// src/sim/data/buildings.ts
var BUILDING_DEFINITIONS = {
  ramen_bar: {
    id: "ramen_bar",
    name: "Asia-Imbiss",
    category: "gastronomy",
    description: "Dampfende Nudelsuppen f\xFCr Nachtschw\xE4rmer, Pendler und Konzernangestellte. Dein erster Schritt ins Gesch\xE4ft; w\xE4chst zur Ramenbar, zum China-Restaurant und zum Sternerestaurant.",
    footprint: { w: 1, h: 1 },
    floors: 2,
    cost: 6500,
    buildTimeMinutes: 18 * 60,
    upkeepPerDay: 90,
    availability: 1,
    art: "ramen",
    business: {
      kind: "gastronomy",
      openHour: 11,
      closeHour: 2,
      seats: 12,
      cookRate: 14,
      serviceRate: 22,
      baseDraw: 14,
      recipes: ["shoyu_ramen", "miso_ramen", "veggie_ramen", "spicy_synth_ramen", "gyoza", "synth_beer"],
      enabledAtStart: 3,
      startingStaff: [
        { role: "cook", skill: 48 },
        { role: "service", skill: 42 }
      ],
      startingStock: { noodles: 90, broth: 80, vegetables: 70, synthmeat: 60, spices: 25, drinks: 40 },
      storage: 640,
      upgrades: ["seating", "kitchen", "storage", "decor", "hygiene_station", "staff_room", "marketing"],
      hygieneLossPerGuest: 0.06
    }
  },
  food_stand: {
    id: "food_stand",
    name: "Streetfood-Stand",
    category: "gastronomy",
    description: "Ein mobiler Stand mit Synth-Grill. Billig, schnell gebaut, geringe Marge.",
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 1800,
    buildTimeMinutes: 6 * 60,
    upkeepPerDay: 35,
    availability: 1,
    art: "foodstand",
    business: {
      kind: "gastronomy",
      openHour: 10,
      closeHour: 23,
      seats: 6,
      cookRate: 16,
      serviceRate: 30,
      baseDraw: 10,
      recipes: ["noodle_box", "synth_skewer", "synth_beer", "herb_bowl"],
      enabledAtStart: 2,
      startingStaff: [{ role: "cook", skill: 40 }],
      startingStock: { noodles: 60, vegetables: 45, synthmeat: 40, spices: 15, drinks: 25 },
      storage: 300,
      upgrades: ["kitchen", "storage", "decor", "marketing"],
      hygieneLossPerGuest: 0.05
    }
  },
  diner: {
    id: "diner",
    name: "Imbiss",
    category: "gastronomy",
    description: "Schneller Imbiss mit kleiner Karte. Entsteht auch bei der \xDCbernahme eines Konkurrenzlokals; w\xE4chst zum D\xF6nerladen, Restaurant und Sternerestaurant.",
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 3800,
    buildTimeMinutes: 10 * 60,
    upkeepPerDay: 55,
    availability: 4,
    art: "diner",
    business: {
      kind: "gastronomy",
      openHour: 10,
      closeHour: 1,
      seats: 8,
      cookRate: 15,
      serviceRate: 26,
      baseDraw: 11,
      recipes: ["noodle_box", "gyoza", "synth_skewer", "synth_beer"],
      enabledAtStart: 3,
      startingStaff: [{ role: "cook", skill: 42 }],
      startingStock: { noodles: 60, vegetables: 45, synthmeat: 50, spices: 15, drinks: 30 },
      storage: 400,
      upgrades: ["seating", "kitchen", "storage", "decor", "hygiene_station", "marketing"],
      hygieneLossPerGuest: 0.055
    }
  },
  capsule_hotel: {
    id: "capsule_hotel",
    name: "Kapselhotel",
    category: "hotel",
    description: "Schlafkapseln f\xFCr Pendler und Reisende. G\xFCnstige Zimmer, hohe Auslastung, wenig Komfort.",
    footprint: { w: 2, h: 1 },
    floors: 4,
    cost: 24e3,
    buildTimeMinutes: 48 * 60,
    upkeepPerDay: 260,
    availability: 4,
    minLevel: 2,
    art: "capsule_hotel",
    business: {
      kind: "hotel",
      rooms: 24,
      basePricePerNight: 38,
      costPerRoomNight: 7,
      baseDemand: 26,
      comfort: 30,
      startingStaff: [
        { role: "reception", skill: 45 },
        { role: "housekeeping", skill: 40 }
      ],
      upgrades: ["rooms", "lobby", "housekeeping_tech", "security", "marketing"]
    }
  },
  business_hotel: {
    id: "business_hotel",
    name: "Businesshotel",
    category: "hotel",
    description: "Komfortable Zimmer f\xFCr Konzernreisende. Teuer im Bau, hohe Preise, anspruchsvolle G\xE4ste.",
    footprint: { w: 2, h: 2 },
    floors: 9,
    cost: 78e3,
    buildTimeMinutes: 96 * 60,
    upkeepPerDay: 720,
    availability: 4,
    minLevel: 3,
    art: "capsule_hotel",
    business: {
      kind: "hotel",
      rooms: 40,
      basePricePerNight: 140,
      costPerRoomNight: 22,
      baseDemand: 22,
      comfort: 75,
      startingStaff: [
        { role: "reception", skill: 55 },
        { role: "housekeeping", skill: 50 },
        { role: "housekeeping", skill: 45 }
      ],
      upgrades: ["rooms", "lobby", "housekeeping_tech", "security", "marketing"]
    }
  },
  taxi_depot: {
    id: "taxi_depot",
    name: "Taxidepot",
    category: "transport",
    description: "Basis f\xFCr eine Taxiflotte: Fahrzeuge kaufen, Fahrer einstellen, Tarife setzen, Werkstatt pflegen.",
    footprint: { w: 2, h: 2 },
    floors: 2,
    cost: 32e3,
    buildTimeMinutes: 60 * 60,
    upkeepPerDay: 320,
    availability: 4,
    minLevel: 2,
    art: "taxi_depot",
    business: {
      kind: "transport",
      startingVehicles: 2,
      vehiclePrice: 9500,
      baseFare: 14,
      energyPerRide: 2.2,
      ridesPerDriverHour: 2.6,
      radius: 28,
      startingStaff: [
        { role: "driver", skill: 45 },
        { role: "driver", skill: 40 }
      ],
      upgrades: ["charging", "workshop", "dispatch"]
    }
  },
  security_hq: {
    id: "security_hq",
    name: "Sicherheitszentrale",
    category: "security",
    description: "Private Sicherheitsfirma: Wachleute auf Streife in Bezirken, Vertr\xE4ge mit Stadt und Betrieben, Ermittlungen gegen Familien.",
    footprint: { w: 2, h: 1 },
    floors: 3,
    cost: 28e3,
    buildTimeMinutes: 54 * 60,
    upkeepPerDay: 240,
    availability: 5,
    minLevel: 3,
    art: "security_hq",
    business: {
      kind: "security",
      cityRatePerGuard: 95,
      contractPerVenue: 18,
      startingStaff: [
        { role: "guard", skill: 45 },
        { role: "guard", skill: 40 },
        { role: "investigator", skill: 50 }
      ],
      upgrades: ["security", "dispatch", "staff_room"]
    }
  },
  research_lab: {
    id: "research_lab",
    name: "Forschungslabor",
    category: "research",
    description: "Forscher und Techniker arbeiten an Technologien, die alle deine Betriebe verbessern.",
    footprint: { w: 2, h: 1 },
    floors: 5,
    cost: 36e3,
    buildTimeMinutes: 60 * 60,
    upkeepPerDay: 300,
    availability: 7,
    minLevel: 3,
    art: "lab",
    business: {
      kind: "lab",
      startingStaff: [
        { role: "researcher", skill: 55 },
        { role: "researcher", skill: 45 },
        { role: "technician", skill: 40 }
      ],
      upgrades: ["security", "staff_room"]
    }
  },
  food_factory: {
    id: "food_factory",
    name: "Lebensmittelfabrik",
    category: "industry",
    description: "Verarbeitet Rohstoffe zu Nudeln, Br\xFChe, Synth-Fleisch, Getr\xE4nken und Snacks. Beliefert eigene Betriebe und den Gro\xDFmarkt.",
    footprint: { w: 2, h: 2 },
    floors: 3,
    cost: 48e3,
    buildTimeMinutes: 72 * 60,
    upkeepPerDay: 420,
    availability: 7,
    minLevel: 2,
    regions: ["silverbrook", "neon_central", "nova_eclipse"],
    art: "factory",
    business: {
      kind: "industry",
      lines: ["noodle_works", "broth_kettles", "synthmeat_plant", "fermenter", "snack_line"],
      maxLines: 3,
      baseMachineUnits: 400,
      startingStaff: [
        { role: "worker", skill: 45 },
        { role: "worker", skill: 40 },
        { role: "technician", skill: 45 }
      ],
      startingStock: { grain: 300, protein_base: 150, chemicals: 60 },
      storage: 1500,
      upgrades: ["machines", "filters", "storage", "staff_room"]
    }
  },
  tech_factory: {
    id: "tech_factory",
    name: "Elektronikwerk",
    category: "industry",
    description: "Stellt Stims und Cyber-Ersatzteile her. Hohe Marge, hoher Energiebedarf, viel Verschmutzung.",
    footprint: { w: 2, h: 2 },
    floors: 4,
    cost: 64e3,
    buildTimeMinutes: 84 * 60,
    upkeepPerDay: 520,
    availability: 7,
    minLevel: 4,
    regions: ["nova_eclipse", "neon_central"],
    art: "factory",
    business: {
      kind: "industry",
      lines: ["stim_lab", "parts_assembly"],
      maxLines: 2,
      baseMachineUnits: 220,
      startingStaff: [
        { role: "worker", skill: 50 },
        { role: "technician", skill: 50 }
      ],
      startingStock: { chemicals: 150, electronics: 90 },
      storage: 900,
      upgrades: ["machines", "filters", "storage", "security"]
    }
  },
  kiosk: {
    id: "kiosk",
    name: "Nachtkiosk",
    category: "retail",
    description: "Rund um die Uhr Snacks, Getr\xE4nke, Stims und Ersatzteile. Lebt von Laufkundschaft und Marge.",
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 4200,
    buildTimeMinutes: 12 * 60,
    upkeepPerDay: 60,
    availability: 4,
    art: "kiosk",
    business: {
      kind: "retail",
      openHour: 6,
      closeHour: 4,
      goods: ["snacks", "drinks", "stims", "cyber_parts", "meds"],
      clerkRate: 24,
      baseDraw: 16,
      startingStaff: [{ role: "clerk", skill: 40 }],
      startingStock: { snacks: 80, drinks: 60, stims: 30, cyber_parts: 15, meds: 20 },
      storage: 300,
      upgrades: ["shelves", "storage", "decor", "security", "marketing"]
    }
  },
  farm: {
    id: "farm",
    name: "Bauernhof",
    category: "industry",
    description: "Felder, Gew\xE4chshaus und Kr\xE4utergarten in Greenhaven. Liefert regionales Gem\xFCse, Premium-Kr\xE4uter und Bio-Getreide an eigene Betriebe und den Gro\xDFmarkt. Nur im Umland.",
    footprint: { w: 2, h: 2 },
    floors: 1,
    cost: 14e3,
    buildTimeMinutes: 30 * 60,
    upkeepPerDay: 120,
    availability: 7,
    minLevel: 1,
    regions: ["greenhaven"],
    art: "farm",
    business: {
      kind: "industry",
      lines: ["vegetable_field", "herb_garden", "grain_field"],
      maxLines: 2,
      baseMachineUnits: 220,
      startingStaff: [
        { role: "worker", skill: 45 },
        { role: "worker", skill: 40 }
      ],
      startingStock: {},
      storage: 900,
      upgrades: ["machines", "storage", "staff_room"]
    }
  },
  inn: {
    id: "inn",
    name: "Landgasthof",
    category: "hotel",
    description: "Pension mit zehn Zimmern, Garten und Fr\xFChst\xFCck. Zieht St\xE4dter an, die Ruhe suchen. Nur im Umland.",
    footprint: { w: 2, h: 1 },
    floors: 2,
    cost: 16e3,
    buildTimeMinutes: 36 * 60,
    upkeepPerDay: 150,
    availability: 7,
    minLevel: 1,
    regions: ["greenhaven"],
    art: "inn",
    business: {
      kind: "hotel",
      rooms: 10,
      basePricePerNight: 64,
      costPerRoomNight: 12,
      baseDemand: 9,
      comfort: 55,
      startingStaff: [
        { role: "reception", skill: 45 },
        { role: "housekeeping", skill: 42 }
      ],
      upgrades: ["rooms", "lobby", "housekeeping_tech", "marketing"]
    }
  },
  farm_shop: {
    id: "farm_shop",
    name: "Hofladen",
    category: "retail",
    description: "Verkauft regionales Gem\xFCse, Kr\xE4uter, Snacks und Getr\xE4nke direkt an die Nachbarschaft. Umland und Vorstadt.",
    footprint: { w: 1, h: 1 },
    floors: 1,
    cost: 3600,
    buildTimeMinutes: 10 * 60,
    upkeepPerDay: 45,
    availability: 7,
    minLevel: 1,
    regions: ["greenhaven", "silverbrook"],
    art: "kiosk",
    business: {
      kind: "retail",
      openHour: 7,
      closeHour: 20,
      goods: ["vegetables", "herbs", "snacks", "drinks"],
      clerkRate: 20,
      baseDraw: 12,
      startingStaff: [{ role: "clerk", skill: 42 }],
      startingStock: { vegetables: 60, herbs: 20, snacks: 40, drinks: 40 },
      storage: 260,
      upgrades: ["shelves", "storage", "decor", "marketing"]
    }
  },
  bank: {
    id: "bank",
    name: "Stadtbank-Filiale",
    category: "finance",
    description: "Eine eigene Bank: Einlagen der Bev\xF6lkerung einsammeln, Kredite vergeben, an der Zinsspanne verdienen. Braucht Gr\xFCndungskapital als R\xFCcklage und Level 3.",
    footprint: { w: 2, h: 2 },
    floors: 6,
    cost: 12e4,
    buildTimeMinutes: 96 * 60,
    upkeepPerDay: 600,
    availability: 7,
    minLevel: 3,
    regions: ["neon_central", "nova_eclipse"],
    art: "bank",
    business: {
      kind: "bank",
      foundingCapital: 15e4,
      baseDepositDraw: 6e3,
      marketDepositRate: 5e-4,
      marketLoanRate: 4e-3,
      baseDefaultRate: 15e-4,
      leverage: 6,
      startingStaff: [
        { role: "banker", skill: 50 },
        { role: "banker", skill: 42 },
        { role: "analyst", skill: 52 }
      ],
      upgrades: ["security", "decor", "staff_room", "marketing"]
    }
  }
};
var PLAYER_BUILDING_IDS = Object.keys(BUILDING_DEFINITIONS);

// src/sim/data/regions.ts
var PLAYER_LEVELS = [
  { level: 1, name: "Greenhaven", xp: 0, region: "greenhaven", maxBusinessTier: 2 },
  { level: 2, name: "Silverbrook", xp: 1e3, region: "silverbrook", maxBusinessTier: 3 },
  { level: 3, name: "Neon Central", xp: 5e3, region: "neon_central", maxBusinessTier: 5 },
  { level: 4, name: "Nova Eclipse", xp: 2e4, region: "nova_eclipse", maxBusinessTier: 6 }
];
var MAX_PLAYER_LEVEL = PLAYER_LEVELS.length;

// src/sim/data/difficulty.ts
var DIFFICULTIES = {
  story: {
    id: "story",
    name: "Story",
    description: "Entspannt die Stadt erkunden. Gro\xDFz\xFCgiges Startkapital und milde Kosten.",
    startingCredits: 6e4,
    costMultiplier: 0.8,
    demandMultiplier: 1.3,
    rentMultiplier: 0.6,
    instantBuild: false,
    unlimitedMoney: false
  },
  casual: {
    id: "casual",
    name: "Casual",
    description: "Fehler verzeihen, aber Geld muss verdient werden.",
    startingCredits: 35e3,
    costMultiplier: 0.9,
    demandMultiplier: 1.15,
    rentMultiplier: 0.8,
    instantBuild: false,
    unlimitedMoney: false
  },
  standard: {
    id: "standard",
    name: "Standard",
    description: "Die vorgesehene Erfahrung. Jede Entscheidung z\xE4hlt.",
    startingCredits: 22e3,
    costMultiplier: 1,
    demandMultiplier: 1,
    rentMultiplier: 1,
    instantBuild: false,
    unlimitedMoney: false
  },
  hardcore: {
    id: "hardcore",
    name: "Hardcore",
    description: "Wenig Geld, hohe Mieten, gnadenlose Konkurrenz.",
    startingCredits: 12e3,
    costMultiplier: 1.2,
    demandMultiplier: 0.85,
    rentMultiplier: 1.4,
    instantBuild: false,
    unlimitedMoney: false
  },
  sandbox: {
    id: "sandbox",
    name: "Sandbox",
    description: "Unbegrenztes Geld, sofortiger Bau. Zum Experimentieren.",
    startingCredits: 1e6,
    costMultiplier: 1,
    demandMultiplier: 1,
    rentMultiplier: 1,
    instantBuild: true,
    unlimitedMoney: true
  }
};
var BACKGROUNDS = {
  street_kid: {
    id: "street_kid",
    name: "Stra\xDFenkind",
    description: "Aufgewachsen in der Undercity. Kaum Geld, aber billige Miete und ein Gesp\xFCr f\xFCr die Stra\xDFe.",
    creditsBonus: -4e3,
    apartmentRent: 40,
    homeDistrict: "undercity",
    gastronomyBonus: 1,
    constructionBonus: 0.92
  },
  ex_corporate: {
    id: "ex_corporate",
    name: "Ex-Konzernangestellter",
    description: "Abfindung in der Tasche, Kontakte in Corporate Heights, teure Wohnung.",
    creditsBonus: 6e3,
    apartmentRent: 160,
    homeDistrict: "corporate_heights",
    gastronomyBonus: 1,
    constructionBonus: 1
  },
  restaurateur: {
    id: "restaurateur",
    name: "Gastronom",
    description: "Jahre hinter dem Tresen. G\xE4ste sp\xFCren Qualit\xE4t, und du wei\xDFt, was sie wollen.",
    creditsBonus: 0,
    apartmentRent: 90,
    homeDistrict: "neon_market",
    gastronomyBonus: 1.15,
    constructionBonus: 1
  },
  heir: {
    id: "heir",
    name: "Immobilienerbe",
    description: "Viel Kapital, hoher Lebensstandard, keine Ahnung von Nudelsuppe.",
    creditsBonus: 15e3,
    apartmentRent: 260,
    homeDistrict: "skyline_gardens",
    gastronomyBonus: 0.9,
    constructionBonus: 1
  },
  mechanic: {
    id: "mechanic",
    name: "Mechaniker",
    description: "Jahre in den Werkst\xE4tten der Rust Docks. Deine Fahrzeuge halten l\xE4nger, die Gewerkschaft kennt dich.",
    creditsBonus: -1e3,
    apartmentRent: 70,
    homeDistrict: "old_city",
    gastronomyBonus: 1,
    constructionBonus: 0.97,
    perks: { vehicleWear: 0.7, relations: { union: 20 } }
  },
  ex_cop: {
    id: "ex_cop",
    name: "Ehemaliger Polizist",
    description: "Du kennst die Reviere und die Ermittler. Die Polizei vertraut dir, Aufmerksamkeit verfliegt schneller, die Familien misstrauen dir.",
    creditsBonus: 2e3,
    apartmentRent: 110,
    homeDistrict: "corporate_heights",
    gastronomyBonus: 1,
    constructionBonus: 1,
    perks: { heatDecay: 1.4, relations: { police: 35, city_hall: 10, nullsect: -20 } }
  },
  hacker: {
    id: "hacker",
    name: "Hacker",
    description: "Aus der Undercity ins Netz. Forschung geht dir leichter von der Hand, Null Sect l\xE4sst deine Systeme in Ruhe.",
    creditsBonus: 0,
    apartmentRent: 55,
    homeDistrict: "undercity",
    gastronomyBonus: 1,
    constructionBonus: 1,
    perks: { research: 1.2, relations: { nullsect: 40, hyperion: -15 } }
  },
  smuggler: {
    id: "smuggler",
    name: "Schmuggler",
    description: "Wenig sauberes Geld, aber Schwarzgeld, Kontakte und ein Gesp\xFCr f\xFCr die Docks. Eine Organisation gr\xFCndest du g\xFCnstig.",
    creditsBonus: -6e3,
    apartmentRent: 60,
    homeDistrict: "ghost_quarter",
    gastronomyBonus: 1,
    constructionBonus: 1,
    perks: { foundingCost: 0.5, startDirty: 4e3, crewSkill: 5, relations: { police: -20 } }
  },
  consultant: {
    id: "consultant",
    name: "Unternehmensberater",
    description: "Du kennst den Rat und die Konzerne. Politischer Einfluss von Anfang an, aber die Stra\xDFe kennt dich nicht.",
    creditsBonus: 4e3,
    apartmentRent: 180,
    homeDistrict: "chrome_district",
    gastronomyBonus: 0.95,
    constructionBonus: 1,
    perks: { startInfluence: 15, relations: { city_hall: 25, progress_bloc: 20, novanet: 10 } }
  },
  gang_member: {
    id: "gang_member",
    name: "Gangmitglied",
    description: "Du kommst aus einer Familie. Bessere Leute f\xFCr die Organisation, Gr\xFCndung umsonst, aber die Polizei hat dich auf dem Schirm.",
    creditsBonus: -3e3,
    apartmentRent: 45,
    homeDistrict: "ghost_quarter",
    gastronomyBonus: 1,
    constructionBonus: 0.95,
    perks: { foundingCost: 0, crewSkill: 12, startDirty: 1500, relations: { police: -30, union: 10 } }
  }
};

// src/sim/data/factions.ts
var FACTIONS = {
  hyperion: {
    id: "hyperion",
    name: "Hyperion Dynamics",
    kind: "corporation",
    description: "Megakonzern f\xFCr Robotik und Sicherheitstechnik. Will niedrige Steuern, freie Bauordnung und Ruhe in Corporate Heights.",
    goals: ["Niedrige Umsatzsteuer", "Lockere Bauordnung", "Hohe Polizeipr\xE4senz in Corporate Heights"],
    homeDistricts: ["corporate_heights", "chrome_district"],
    allies: ["progress_bloc", "police"],
    enemies: ["union", "nullsect", "green_cell"],
    baseInfluence: 85
  },
  kosei: {
    id: "kosei",
    name: "K\u014Dsei Group",
    kind: "corporation",
    description: "Konzern f\xFCr Lebensmittel, Logistik und Hotels. Konkurriert mit dir in Gastronomie und Hotellerie.",
    goals: ["Keine Mindestl\xF6hne", "\xDCbernahme erfolgreicher Betriebe", "Freie Preise"],
    homeDistricts: ["skyline_gardens", "rust_docks"],
    allies: ["progress_bloc", "novanet"],
    enemies: ["union", "citizens"],
    baseInfluence: 70
  },
  union: {
    id: "union",
    name: "Dockarbeitergewerkschaft",
    kind: "union",
    description: "Organisiert Arbeiter in den Rust Docks und dar\xFCber hinaus. Streikt, wenn L\xF6hne unter dem Erwarteten liegen.",
    goals: ["Mindestlohn", "Faire L\xF6hne in Betrieben", "Arbeitspl\xE4tze in den Docks"],
    homeDistricts: ["rust_docks", "old_city", "undercity"],
    allies: ["social_alliance", "citizens"],
    enemies: ["hyperion", "kosei"],
    baseInfluence: 50
  },
  citizens: {
    id: "citizens",
    name: "B\xFCrgerrat Old City",
    kind: "civic",
    description: "Mieterinitiative gegen Verdr\xE4ngung. Protestiert gegen hohe Mieten und Luxusbauten in Wohnvierteln.",
    goals: ["Mietdeckel", "Bezahlbarer Wohnraum", "Keine Verdr\xE4ngung"],
    homeDistricts: ["old_city", "ghost_quarter"],
    allies: ["social_alliance", "union"],
    enemies: ["kosei"],
    baseInfluence: 40
  },
  police: {
    id: "police",
    name: "Polizei Nova Eclipse",
    kind: "police",
    description: "Die st\xE4dtische Polizei. Sch\xE4tzt Sicherheitsfirmen, die kooperieren, und jagt Organisationen, die auffallen.",
    goals: ["Hohes Polizeibudget", "Weniger Kriminalit\xE4t", "Kooperation privater Sicherheitsfirmen"],
    homeDistricts: ["corporate_heights", "skyline_gardens"],
    allies: ["city_hall", "hyperion"],
    enemies: ["nullsect"],
    baseInfluence: 65
  },
  nullsect: {
    id: "nullsect",
    name: "Null Sect",
    kind: "hackers",
    description: "Hackerkollektiv aus der Undercity. Greift Konzerne und unsichere Betriebe an, verkauft Daten.",
    goals: ["Schwache \xDCberwachung", "Offene Netze", "Chaos in Corporate Heights"],
    homeDistricts: ["undercity", "ghost_quarter"],
    allies: ["green_cell"],
    enemies: ["hyperion", "police"],
    baseInfluence: 35
  },
  novanet: {
    id: "novanet",
    name: "NovaNet Media",
    kind: "media",
    description: "Gr\xF6\xDFter Nachrichtenkanal der Stadt. Berichte k\xF6nnen deinen Ruf heben oder zerst\xF6ren.",
    goals: ["Exklusive Geschichten", "Werbekunden", "Zugang zu Konzernen"],
    homeDistricts: ["neon_market", "corporate_heights"],
    allies: ["kosei"],
    enemies: [],
    baseInfluence: 60
  },
  progress_bloc: {
    id: "progress_bloc",
    name: "Fortschrittsblock",
    kind: "party",
    description: "Wirtschaftsliberale Partei: niedrige Steuern, lockere Bauordnung, Sicherheit durch Technik.",
    goals: ["Umsatzsteuer senken", "Bauordnung lockern", "Polizeibudget erh\xF6hen"],
    homeDistricts: ["corporate_heights", "chrome_district", "skyline_gardens"],
    allies: ["hyperion", "kosei"],
    enemies: ["social_alliance"],
    baseInfluence: 55
  },
  social_alliance: {
    id: "social_alliance",
    name: "Soziale Allianz",
    kind: "party",
    description: "Sozialpartei: Mindestlohn, Mietdeckel, Sozialprogramme aus Steuern.",
    goals: ["Mindestlohn erh\xF6hen", "Mietdeckel", "Sozialprogramme"],
    homeDistricts: ["old_city", "undercity", "rust_docks"],
    allies: ["union", "citizens"],
    enemies: ["progress_bloc"],
    baseInfluence: 50
  },
  city_hall: {
    id: "city_hall",
    name: "Stadtverwaltung",
    kind: "administration",
    description: "B\xFCrgermeisteramt und Beh\xF6rden. Vergibt Genehmigungen und Vertr\xE4ge, h\xF6rt auf die Mehrheit im Rat.",
    goals: ["Volle Kassen", "Ruhige Bezirke", "Funktionierende Infrastruktur"],
    homeDistricts: ["corporate_heights"],
    allies: ["police"],
    enemies: [],
    baseInfluence: 75
  },
  green_cell: {
    id: "green_cell",
    name: "Gr\xFCne Zelle",
    kind: "activists",
    description: "Umweltaktivisten. Blockieren verschmutzende Betriebe und fordern saubere Energie.",
    goals: ["Weniger Verschmutzung", "Saubere Energie", "Gr\xFCnfl\xE4chen"],
    homeDistricts: ["chrome_district", "skyline_gardens"],
    allies: ["nullsect", "citizens"],
    enemies: ["hyperion"],
    baseInfluence: 30
  },
  signal_church: {
    id: "signal_church",
    name: "Kirche des Signals",
    kind: "religion",
    description: "Techno-religi\xF6se Bewegung mit Anh\xE4ngern in allen Schichten. Spenden kaufen Wohlwollen und G\xE4ste.",
    goals: ["Mitglieder", "Spenden", "Respekt"],
    homeDistricts: ["ghost_quarter", "undercity", "old_city"],
    allies: [],
    enemies: [],
    baseInfluence: 35
  }
};
var FACTION_IDS = Object.keys(FACTIONS);
var LAWS = {
  salesTax: {
    id: "salesTax",
    name: "Umsatzsteuer",
    description: "Prozentsatz auf alle Verkaufserl\xF6se deiner Betriebe, t\xE4glich abgef\xFChrt. Finanziert Polizei und Sozialprogramme.",
    options: [
      { value: 0.04, label: "4 %" },
      { value: 0.08, label: "8 %" },
      { value: 0.12, label: "12 %" },
      { value: 0.16, label: "16 %" }
    ],
    defaultValue: 0.08,
    progressBias: -1
  },
  minimumWage: {
    id: "minimumWage",
    name: "Mindestlohn",
    description: "Untergrenze f\xFCr Tagesl\xF6hne. H\xF6here Werte heben Lohnerwartungen und Kaufkraft in armen Bezirken.",
    options: [
      { value: 0, label: "keiner" },
      { value: 60, label: "60 \xA2" },
      { value: 80, label: "80 \xA2" },
      { value: 100, label: "100 \xA2" }
    ],
    defaultValue: 0,
    progressBias: -1
  },
  rentCap: {
    id: "rentCap",
    name: "Mietdeckel",
    description: "Obergrenze f\xFCr das Mietniveau eigener Immobilien.",
    options: [
      { value: 1.6, label: "keiner" },
      { value: 1.3, label: "130 %" },
      { value: 1.1, label: "110 %" }
    ],
    defaultValue: 1.6,
    progressBias: 1
  },
  policeBudget: {
    id: "policeBudget",
    name: "Polizeibudget",
    description: "H\xF6heres Budget hebt die Polizeipr\xE4senz in allen Bezirken, l\xE4sst Aufmerksamkeit langsamer sinken und kostet Steuern.",
    options: [
      { value: 0.7, label: "gek\xFCrzt" },
      { value: 1, label: "normal" },
      { value: 1.3, label: "erh\xF6ht" }
    ],
    defaultValue: 1,
    progressBias: 1
  },
  zoning: {
    id: "zoning",
    name: "Bauordnung",
    description: "Strenge Bauordnung verteuert und verlangsamt Neubauten, hebt aber die Attraktivit\xE4t.",
    options: [
      { value: 0.85, label: "locker" },
      { value: 1, label: "normal" },
      { value: 1.25, label: "streng" }
    ],
    defaultValue: 1,
    progressBias: -1
  },
  curfew: {
    id: "curfew",
    name: "Sperrstunde",
    description: "Gastronomie muss fr\xFCher schlie\xDFen. Weniger Nachtumsatz, weniger Kriminalit\xE4t.",
    options: [
      { value: 0, label: "keine" },
      { value: 1, label: "1 Uhr" },
      { value: 2, label: "23 Uhr" }
    ],
    defaultValue: 0,
    progressBias: 0
  }
};
var LAW_IDS = Object.keys(LAWS);

// src/sim/data/evolution.ts
var MAX_LEVEL = 6;
var LEVEL_DEFAULTS = [
  { capacity: 1, throughput: 1, draw: 1, quality: 0, price: 1, upkeep: 1, radius: 1, lines: 0, wage: 1, extraPerStay: 0, leverage: 1, hours: null },
  { capacity: 1.3, throughput: 1.2, draw: 1.25, quality: 4, price: 1.1, upkeep: 1.5, radius: 1.15, lines: 0, wage: 1.05, extraPerStay: 0, leverage: 1.2, hours: null },
  { capacity: 1.7, throughput: 1.45, draw: 1.55, quality: 9, price: 1.25, upkeep: 2.2, radius: 1.3, lines: 1, wage: 1.1, extraPerStay: 0, leverage: 1.5, hours: null },
  { capacity: 2.2, throughput: 1.75, draw: 1.9, quality: 15, price: 1.45, upkeep: 3.2, radius: 1.5, lines: 1, wage: 1.2, extraPerStay: 0, leverage: 1.9, hours: null },
  { capacity: 2.8, throughput: 2.1, draw: 2.3, quality: 22, price: 1.7, upkeep: 4.5, radius: 1.7, lines: 2, wage: 1.35, extraPerStay: 0, leverage: 2.4, hours: null },
  { capacity: 3.2, throughput: 2.4, draw: 2.6, quality: 26, price: 1.9, upkeep: 5.5, radius: 1.9, lines: 2, wage: 1.5, extraPerStay: 0, leverage: 3, hours: null }
];
var LEVEL_COST = [0, 0, 0.8, 1.6, 2.8, 4.5, 6.5];
var LEVEL_TIME = [0, 0, 0.5, 0.7, 0.9, 1.1, 1.3];
var LEVEL_REPUTATION = [0, 0, 30, 45, 60, 75, 80];
function levelDefaults(level) {
  return LEVEL_DEFAULTS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
}
function buildTree(defId, initial, specs) {
  const def = BUILDING_DEFINITIONS[defId];
  if (!def) throw new Error(`Evolution: unknown building ${defId}`);
  const stages = {};
  for (const [id, [name, level, s]] of Object.entries(specs)) {
    const base = levelDefaults(level);
    stages[id] = {
      id,
      name,
      description: s.desc,
      level,
      specialization: s.spec ?? null,
      cost: s.cost ?? Math.round(def.cost * LEVEL_COST[level]),
      minutes: s.minutes ?? Math.round(def.buildTimeMinutes * LEVEL_TIME[level]),
      requires: { ...level >= 2 ? { reputation: LEVEL_REPUTATION[level] } : {}, ...s.req ?? {} },
      unlocks: s.unl ?? {},
      effects: { ...base, ...s.eff ?? {} },
      features: s.feat ?? [],
      next: s.next ?? [],
      art: s.art,
      pros: s.pros,
      cons: s.cons
    };
  }
  for (const st of Object.values(stages)) for (const n of st.next) if (!stages[n]) throw new Error(`Evolution ${defId}: ${st.id} \u2192 ${n} fehlt`);
  if (!stages[initial]) throw new Error(`Evolution ${defId}: Startstufe ${initial} fehlt`);
  return { businessTypeId: defId, initialStageId: initial, stages };
}
var NEON = { pink: 16722902, cyan: 1697535, amber: 16756768, acid: 9240378, red: 16726618, orange: 16747039, white: 15790335 };
var asia = buildTree("ramen_bar", "asia.imbiss", {
  "asia.imbiss": ["Asia-Imbiss", 1, { desc: "Nudelsuppen \xFCber die Theke, ein paar Hocker, viel Dampf.", next: ["asia.ramen", "asia.noodle", "asia.korean_street", "asia.neon_ramen"], art: { floors: 2, sign: "ASIA", color: NEON.amber }, pros: "G\xFCnstig, schnell, kaum Risiko.", cons: "Kleine Karte, kleine Marge." }],
  // Main path
  "asia.ramen": ["Ramenbar", 2, { desc: "Offene K\xFCche, Neonreklame, Stammg\xE4ste bis in die Nacht.", next: ["asia.restaurant", "asia.izakaya"], unl: { recipes: ["tonkotsu_ramen"], upgrades: ["delivery_kitchen"] }, art: { floors: 2, sign: "RAMEN", color: NEON.pink }, pros: "Mehr Pl\xE4tze und Tonkotsu-Ramen auf der Karte; Lieferk\xFCche m\xF6glich.", cons: "H\xF6here Betriebskosten." }],
  "asia.restaurant": ["Asiatisches Restaurant", 3, { desc: "Separate Sitzbereiche, mehrere K\xF6che, Reservierungen.", next: ["asia.premium"], feat: ["reservations"], unl: { recipes: ["synth_sushi", "peking_duck"], roles: ["sommelier"] }, req: { staff: { role: "cook", skill: 55 } }, art: { floors: 3, style: "market", sign: "ASIA HOUSE", color: NEON.pink }, pros: "Reservierungen, Sushi und Ente, ein Sommelier hebt die Qualit\xE4t.", cons: "Braucht einen Koch mit F\xE4higkeit 55, L\xF6hne +10 %." }],
  "asia.premium": ["Gehobenes China-/Japan-Restaurant", 4, { desc: "Hochwertige M\xF6bel, exklusive Fassade, Tasting-Men\xFCs.", next: ["asia.star"], feat: ["reservations", "vip"], unl: { recipes: ["tasting_menu"], upgrades: ["vip_lounge"] }, req: { satisfaction: 70, staff: { role: "cook", skill: 65 } }, art: { floors: 4, style: "chrome", sign: "KAISEKI", color: NEON.cyan }, pros: "Preisniveau +45 %, VIP-G\xE4ste, VIP-Lounge ausbaubar.", cons: "Anspruchsvolle G\xE4ste: Zufriedenheit 70 n\xF6tig, L\xF6hne +20 %." }],
  "asia.star": ["Sternerestaurant", 5, { desc: "Fine Dining mit Hologrammen und VIP-Bereich. Kritiker kommen unangek\xFCndigt.", next: ["asia.group"], feat: ["reservations", "vip", "critics"], eff: { capacity: 1.8, price: 2.4, upkeep: 6, wage: 1.6, quality: 30, draw: 1.9 }, req: { satisfaction: 78, staff: { role: "cook", skill: 75 }, upgrade: { id: "kitchen", level: 2 } }, art: { floors: 5, style: "skyline", sign: "\xC9TOILE", color: NEON.white }, pros: "Sterne der Kritiker: jeder Stern +12 % Anziehung und h\xF6here Preisakzeptanz.", cons: "Weniger Pl\xE4tze als ein gro\xDFes Lokal, Betriebskosten \xD76, L\xF6hne +60 %. Prestige ist nicht gleich Gewinn." }],
  "asia.group": ["Internationale Restaurantgruppe", 6, { desc: "Organisationsebene: eigene Marke, Franchise-Vertr\xE4ge, Catering.", feat: ["reservations", "vip", "critics", "franchise", "group"], eff: { capacity: 1.8, price: 2.4, upkeep: 6.5, wage: 1.6, quality: 30, draw: 2.1 }, req: { ageDays: 20, revenuePerDay: 6e3 }, art: { floors: 5, style: "skyline", sign: "\xC9TOILE GROUP", color: NEON.white }, pros: "Franchise-Lizenzen bringen t\xE4gliche Geb\xFChren ohne eigenes Geb\xE4ude.", cons: "Franchisenehmer verw\xE4ssern den Ruf, wenn die Qualit\xE4t sinkt." }],
  // Japanese
  "asia.izakaya": ["Izakaya", 3, { desc: "Japanische Kneipe: kleine Gerichte, Sake, lange N\xE4chte.", spec: "japanisch", next: ["asia.sushi"], feat: ["nightlife"], eff: { hours: { open: 17, close: 3 }, draw: 1.6, price: 1.2 }, unl: { recipes: ["yakitori", "sake_set"] }, art: { floors: 2, style: "old", sign: "IZAKAYA", color: NEON.red }, pros: "Abend- und Nachtgesch\xE4ft, Getr\xE4nkeumsatz.", cons: "Tags\xFCber geschlossen." }],
  "asia.sushi": ["Sushi-Restaurant", 4, { desc: "Theke, Laufband, Fisch aus dem Zuchttank.", spec: "japanisch", next: ["asia.omakase"], feat: ["reservations"], unl: { recipes: ["synth_sushi", "sashimi_plate"], roles: ["sommelier"] }, req: { staff: { role: "cook", skill: 65 } }, art: { floors: 3, style: "chrome", sign: "SUSHI", color: NEON.cyan }, pros: "Hohe Qualit\xE4t, gutes Preisniveau.", cons: "Braucht einen Koch mit F\xE4higkeit 65." }],
  "asia.omakase": ["Omakase-Restaurant", 5, { desc: "Zw\xF6lf Pl\xE4tze, ein Meister, ein Men\xFC. Kritiker lieben es.", spec: "japanisch", next: ["asia.luxury_jp"], feat: ["reservations", "vip", "critics"], eff: { capacity: 0.9, price: 3, upkeep: 4, wage: 1.7, quality: 34, draw: 1.4 }, unl: { recipes: ["omakase_menu"] }, req: { satisfaction: 80, staff: { role: "cook", skill: 80 } }, art: { floors: 3, style: "skyline", sign: "OMAKASE", color: NEON.white }, pros: "Preisniveau \xD73, h\xF6chste Qualit\xE4t.", cons: "Nur wenige Pl\xE4tze: Umsatz h\xE4ngt an Preis und Sternen." }],
  "asia.luxury_jp": ["Luxusrestaurant", 6, { desc: "Marke mit Strahlkraft, Franchise in anderen St\xE4dten.", spec: "japanisch", feat: ["reservations", "vip", "critics", "franchise", "group"], eff: { capacity: 1.2, price: 3, upkeep: 5, wage: 1.7, quality: 34, draw: 1.8 }, req: { ageDays: 20 }, art: { floors: 4, style: "skyline", sign: "KIWAMI", color: NEON.white }, pros: "Franchise-Geb\xFChren, Marke.", cons: "Rufpflege wird zum Vollzeitjob." }],
  // Chinese
  "asia.noodle": ["Nudelrestaurant", 2, { desc: "Handgezogene Nudeln, gro\xDFe Portionen, Familien.", spec: "chinesisch", next: ["asia.china"], eff: { capacity: 1.5, price: 1, draw: 1.35 }, unl: { recipes: ["dan_dan_noodles"] }, art: { floors: 2, sign: "NUDELN", color: NEON.amber }, pros: "Mehr Pl\xE4tze, mehr Laufkundschaft.", cons: "Normales Preisniveau." }],
  "asia.china": ["China-Restaurant", 3, { desc: "Runde Tische, Drehteller, Dim Sum am Wochenende.", spec: "chinesisch", next: ["asia.dimsum"], feat: ["reservations", "delivery"], eff: { capacity: 1.9, draw: 1.6 }, unl: { recipes: ["dim_sum", "peking_duck"], upgrades: ["delivery_kitchen"] }, art: { floors: 3, style: "old", sign: "CHINA", color: NEON.red }, pros: "Lieferdienst und gro\xDFe S\xE4le.", cons: "K\xFCche muss mithalten." }],
  "asia.dimsum": ["Premium-Dim-Sum-Haus", 4, { desc: "Teewagen, K\xF6rbe, G\xE4ste aus den T\xFCrmen.", spec: "chinesisch", next: ["asia.luxury_cn"], feat: ["reservations", "delivery", "vip"], unl: { recipes: ["dim_sum_premium"], upgrades: ["vip_lounge"], roles: ["sommelier"] }, req: { satisfaction: 70, staff: { role: "cook", skill: 65 } }, art: { floors: 4, style: "chrome", sign: "DIM SUM", color: NEON.amber }, pros: "Preisniveau +45 %, VIP.", cons: "Zufriedenheit 70 n\xF6tig." }],
  "asia.luxury_cn": ["Luxusrestaurant", 5, { desc: "Bankette f\xFCr Konzerne und Familien, Kritiker inklusive.", spec: "chinesisch", next: ["asia.empire"], feat: ["reservations", "vip", "critics"], eff: { capacity: 2.4, price: 2.1, upkeep: 5.5, wage: 1.5 }, req: { satisfaction: 76, staff: { role: "cook", skill: 72 } }, art: { floors: 5, style: "skyline", sign: "JADE", color: NEON.acid }, pros: "Gro\xDFe S\xE4le bei hohem Preisniveau.", cons: "Betriebskosten \xD75,5." }],
  "asia.empire": ["Restaurantimperium", 6, { desc: "Franchise-Ketten unter einer Marke.", spec: "chinesisch", feat: ["reservations", "vip", "critics", "franchise", "group"], eff: { capacity: 2.4, price: 2.1, upkeep: 6, wage: 1.5, draw: 2.6 }, req: { ageDays: 20, revenuePerDay: 6e3 }, art: { floors: 5, style: "skyline", sign: "JADE GROUP", color: NEON.acid }, pros: "Lizenzgeb\xFChren.", cons: "Qualit\xE4tskontrolle." }],
  // Korean
  "asia.korean_street": ["Korean Streetfood", 2, { desc: "Tteokbokki, Kimchi, scharf und schnell.", spec: "koreanisch", next: ["asia.korean_bbq"], eff: { draw: 1.35, price: 1.05 }, unl: { recipes: ["tteokbokki"] }, art: { floors: 2, sign: "K-STREET", color: NEON.red }, pros: "Laufkundschaft.", cons: "Kleine Marge." }],
  "asia.korean_bbq": ["Korean BBQ", 3, { desc: "Tischgrills, Gruppen, Bier. Laut und voll.", spec: "koreanisch", next: ["asia.korean_premium"], feat: ["reservations", "nightlife"], eff: { capacity: 1.9, hours: { open: 16, close: 2 }, draw: 1.7 }, unl: { recipes: ["korean_bbq", "bibimbap"] }, art: { floors: 3, style: "market", sign: "K-BBQ", color: NEON.orange }, pros: "Gro\xDFe Gruppen, Getr\xE4nke.", cons: "Hygiene leidet schneller." }],
  "asia.korean_premium": ["Premium-Korean-Restaurant", 4, { desc: "Hanwoo-Synth, private R\xE4ume.", spec: "koreanisch", next: ["asia.korean_fine"], feat: ["reservations", "vip"], unl: { recipes: ["hanwoo_set"], upgrades: ["vip_lounge"], roles: ["sommelier"] }, req: { satisfaction: 70 }, art: { floors: 4, style: "chrome", sign: "SEOUL", color: NEON.orange }, pros: "Preisniveau +45 %.", cons: "Zufriedenheit 70 n\xF6tig." }],
  "asia.korean_fine": ["Fine Dining", 5, { desc: "Koreanische Haute Cuisine, Kritiker und Sterne.", spec: "koreanisch", feat: ["reservations", "vip", "critics"], eff: { capacity: 1.6, price: 2.5, upkeep: 5.5, wage: 1.6, quality: 30 }, req: { satisfaction: 78, staff: { role: "cook", skill: 75 } }, art: { floors: 5, style: "skyline", sign: "HANSIK", color: NEON.white }, pros: "Sterne.", cons: "Wenig Pl\xE4tze, hohe Kosten." }],
  // Cyberpunk
  "asia.neon_ramen": ["Neon-Ramenbar", 2, { desc: "Holo-Speisekarte, Bestellterminals, Nachtvolk.", spec: "cyberpunk", next: ["asia.robot_ramen"], feat: ["nightlife", "delivery"], eff: { hours: { open: 18, close: 5 }, draw: 1.3 }, unl: { recipes: ["tonkotsu_ramen"], upgrades: ["delivery_kitchen"] }, art: { floors: 2, style: "undercity", sign: "NEON RAMEN", color: NEON.pink }, pros: "Lieferdienst und Nachtgesch\xE4ft.", cons: "Tags\xFCber zu." }],
  "asia.robot_ramen": ["Roboter-Ramenbar", 3, { desc: "Kochroboter, ein Techniker, kaum Personal.", spec: "cyberpunk", next: ["asia.auto_restaurant"], feat: ["delivery", "automation"], eff: { throughput: 2, wage: 0.8, quality: 6 }, unl: { upgrades: ["robot_kitchen"], roles: ["technician"] }, req: { research: "kitchen_automation" }, art: { floors: 3, style: "chrome", sign: "ROBO RAMEN", color: NEON.cyan }, pros: "Doppelter K\xFCchendurchsatz, L\xF6hne \u221220 %.", cons: "Braucht die Forschung K\xFCchenautomation; G\xE4ste vermissen Menschen (Qualit\xE4t nur +6)." }],
  "asia.auto_restaurant": ["Vollautomatisches Restaurant", 4, { desc: "Keine Kellner, F\xF6rderb\xE4nder, Drohnenlieferung.", spec: "cyberpunk", next: ["asia.holo"], feat: ["delivery", "automation", "reservations"], eff: { throughput: 2.6, wage: 0.7, capacity: 2.4, quality: 10, price: 1.3 }, req: { research: "kitchen_automation", staff: { role: "technician", skill: 60 } }, art: { floors: 4, style: "chrome", sign: "AUTOMAT", color: NEON.cyan }, pros: "Masse bei niedrigen L\xF6hnen.", cons: "Techniker n\xF6tig; Preisniveau bleibt mittel." }],
  "asia.holo": ["Holographic Dining Experience", 5, { desc: "Jeder Tisch eine andere Welt. Kritiker streiten, G\xE4ste zahlen.", spec: "cyberpunk", feat: ["delivery", "automation", "reservations", "vip", "critics"], eff: { throughput: 2.6, wage: 0.9, capacity: 2, quality: 24, price: 2.2, upkeep: 6 }, req: { satisfaction: 75, research: "kitchen_automation" }, art: { floors: 5, style: "chrome", sign: "HOLO DINE", color: NEON.pink }, pros: "Hohes Preisniveau mit Automatisierung.", cons: "Energie- und Betriebskosten \xD76." }]
});
var imbiss = buildTree("diner", "imbiss.bude", {
  "imbiss.bude": ["Imbissbude", 1, { desc: "Pommes, Nudelbox, Synth-Spie\xDFe. Schnell und ehrlich.", next: ["imbiss.doener", "imbiss.burger", "imbiss.currywurst", "imbiss.falafel", "imbiss.pizza"], art: { floors: 1, sign: "IMBISS", color: NEON.cyan }, pros: "Billig.", cons: "Klein." }],
  // Turkish grill path (main)
  "imbiss.doener": ["D\xF6nerladen", 2, { desc: "Drehspie\xDF, Fladenbrot, lange Schlangen nach Mitternacht.", spec: "grill", next: ["imbiss.turkish"], eff: { draw: 1.4, hours: { open: 10, close: 4 } }, unl: { recipes: ["doener", "lahmacun"] }, art: { floors: 1, sign: "D\xD6NER", color: NEON.red }, pros: "Starke Laufkundschaft bis in die Nacht.", cons: "Hygiene f\xE4llt schneller." }],
  "imbiss.turkish": ["T\xFCrkisches Restaurant", 3, { desc: "Tische, Tee, Familienfeiern.", spec: "grill", next: ["imbiss.grill"], feat: ["reservations"], unl: { recipes: ["adana_grill", "meze_plate"] }, art: { floors: 2, style: "old", sign: "ANATOLIA", color: NEON.red }, pros: "Reservierungen, gr\xF6\xDFere Karte.", cons: "Mehr Personal." }],
  "imbiss.grill": ["Gehobenes Grillrestaurant", 4, { desc: "Holzkohle, Synth-Lamm, Weinkarte.", spec: "grill", next: ["imbiss.star", "imbiss.steakhouse"], feat: ["reservations", "vip"], unl: { recipes: ["grill_platter"], roles: ["sommelier"], upgrades: ["vip_lounge"] }, req: { satisfaction: 70, staff: { role: "cook", skill: 65 } }, art: { floors: 3, style: "chrome", sign: "GRILL", color: NEON.orange }, pros: "Preisniveau +45 %.", cons: "Zufriedenheit 70." }],
  "imbiss.steakhouse": ["Steakhouse", 5, { desc: "Dry-aged Synth, Spezialisierung statt Sterne.", spec: "grill", feat: ["reservations", "vip"], eff: { capacity: 2.2, price: 2, upkeep: 4.5, wage: 1.4 }, unl: { recipes: ["lab_steak", "tomahawk"] }, req: { satisfaction: 72, staff: { role: "cook", skill: 70 } }, art: { floors: 4, style: "skyline", sign: "STEAK", color: NEON.orange }, pros: "Hohe Preise ohne Kritikerdruck.", cons: "Teure Zutaten." }],
  "imbiss.star": ["Sternerestaurant", 5, { desc: "Vom D\xF6ner zum Stern. Kritiker kommen.", spec: "grill", next: ["imbiss.chain"], feat: ["reservations", "vip", "critics"], eff: { capacity: 1.8, price: 2.4, upkeep: 6, wage: 1.6, quality: 30 }, req: { satisfaction: 78, staff: { role: "cook", skill: 75 }, upgrade: { id: "kitchen", level: 2 } }, art: { floors: 5, style: "skyline", sign: "\xC9TOILE", color: NEON.white }, pros: "Sterne.", cons: "Wenig Pl\xE4tze, Kosten \xD76." }],
  "imbiss.chain": ["Internationale Restaurantkette", 6, { desc: "Franchise unter deiner Marke.", spec: "grill", feat: ["reservations", "vip", "critics", "franchise", "group"], eff: { capacity: 1.8, price: 2.4, upkeep: 6.5, wage: 1.6, quality: 30 }, req: { ageDays: 20, revenuePerDay: 5e3 }, art: { floors: 5, style: "skyline", sign: "\xC9TOILE GROUP", color: NEON.white }, pros: "Lizenzgeb\xFChren.", cons: "Ruf." }],
  // Burger / fast food path
  "imbiss.burger": ["Burgerladen", 2, { desc: "Synth-Patties, Fritteuse, Takeaway.", spec: "fastfood", next: ["imbiss.fastfood"], eff: { throughput: 1.4, draw: 1.3, price: 0.95 }, unl: { recipes: ["synth_burger", "fries"] }, art: { floors: 1, sign: "BURGER", color: NEON.amber }, pros: "Schnelle K\xFCche.", cons: "Niedriges Preisniveau." }],
  "imbiss.fastfood": ["Fastfood-Restaurant", 3, { desc: "Bestellterminals, Standardprozesse, Masse.", spec: "fastfood", next: ["imbiss.drivein"], feat: ["delivery"], eff: { throughput: 1.9, capacity: 2.1, draw: 1.7, price: 0.9, quality: 2 }, unl: { recipes: ["menu_box"], upgrades: ["delivery_kitchen"] }, art: { floors: 2, style: "market", sign: "FAST", color: NEON.amber }, pros: "Hoher Durchsatz, Lieferdienst.", cons: "Qualit\xE4t bleibt flach." }],
  "imbiss.drivein": ["Drive-in", 4, { desc: "Autoschlange rund um die Uhr.", spec: "fastfood", next: ["imbiss.franchise"], feat: ["delivery"], eff: { throughput: 2.3, capacity: 2.8, draw: 2.1, price: 0.9, hours: { open: 0, close: 24 }, quality: 4, wage: 1 }, req: { revenuePerDay: 2500 }, art: { floors: 2, style: "market", sign: "DRIVE-IN", color: NEON.amber }, pros: "24 Stunden offen, gro\xDFe Kapazit\xE4t.", cons: "Braucht 2.500 \xA2 Tagesumsatz." }],
  "imbiss.franchise": ["Franchise-Kette", 5, { desc: "Dein Logo an fremden Fassaden.", spec: "fastfood", next: ["imbiss.global"], feat: ["delivery", "franchise"], eff: { throughput: 2.3, capacity: 3.2, draw: 2.5, price: 0.9, upkeep: 3.5, quality: 4, hours: { open: 0, close: 24 }, wage: 1 }, req: { ageDays: 15, revenuePerDay: 4e3 }, art: { floors: 3, style: "corporate", sign: "CHROME BURGER", color: NEON.amber }, pros: "Masse plus Lizenzgeb\xFChren; oft mehr Gewinn als ein Sternerestaurant.", cons: "Kein Prestige, Qualit\xE4tskontrolle." }],
  "imbiss.global": ["Globaler Fastfood-Konzern", 6, { desc: "Die Marke geh\xF6rt der Stadt.", spec: "fastfood", feat: ["delivery", "franchise", "group"], eff: { throughput: 2.5, capacity: 3.6, draw: 2.9, price: 0.95, upkeep: 4, quality: 5, hours: { open: 0, close: 24 }, wage: 1 }, req: { ageDays: 30, revenuePerDay: 7e3 }, art: { floors: 4, style: "corporate", sign: "CHROME BURGER HQ", color: NEON.amber }, pros: "H\xF6chste Franchise-Geb\xFChren.", cons: "Betriebskosten \xD74." }],
  // Smaller specialisations
  "imbiss.currywurst": ["Currywurst-Bude", 2, { desc: "Ketchup, Curry, Pappschale. Kult.", spec: "currywurst", eff: { draw: 1.45, price: 0.95, upkeep: 1.2 }, unl: { recipes: ["currywurst"] }, art: { floors: 1, sign: "CURRY", color: NEON.red }, pros: "Sehr viel Laufkundschaft bei kleinen Kosten.", cons: "Keine weiteren Stufen." }],
  "imbiss.falafel": ["Falafel & Vegan", 2, { desc: "Kichererbsen statt Synth-Fleisch.", spec: "vegan", next: ["imbiss.vegan"], eff: { draw: 1.2, price: 1.1, quality: 6 }, unl: { recipes: ["falafel_wrap"] }, art: { floors: 1, sign: "VEGAN", color: NEON.acid }, pros: "Gute Marge, zufriedene G\xE4ste.", cons: "Kleinere Zielgruppe." }],
  "imbiss.vegan": ["Veganes Restaurant", 3, { desc: "Ohne Synth-Fleisch, mit Reservierung.", spec: "vegan", feat: ["reservations"], eff: { price: 1.35, quality: 12 }, unl: { recipes: ["vegan_bowl"] }, art: { floors: 2, style: "skyline", sign: "GREEN", color: NEON.acid }, pros: "Hohes Preisniveau f\xFCr Stufe 3.", cons: "Endstufe dieses Zweigs." }],
  "imbiss.pizza": ["Pizzeria", 2, { desc: "Steinofen, Lieferfahrer, Familienabende.", spec: "pizza", feat: ["delivery"], eff: { capacity: 1.4, draw: 1.3 }, unl: { recipes: ["pizza"], upgrades: ["delivery_kitchen"] }, art: { floors: 2, sign: "PIZZA", color: NEON.orange }, pros: "Lieferdienst ab Stufe 2.", cons: "Keine weiteren Stufen." }]
});
var stand = buildTree("food_stand", "stand.base", {
  "stand.base": ["Streetfood-Stand", 1, { desc: "Synth-Grill auf R\xE4dern.", next: ["stand.truck", "stand.coffee", "stand.drinks"], art: { floors: 1 }, pros: "Billigster Einstieg.", cons: "Sechs Pl\xE4tze." }],
  "stand.truck": ["Foodtruck", 2, { desc: "Gr\xF6\xDFere K\xFCche, Markenlogo, Festivals.", next: ["stand.garden"], eff: { draw: 1.4 }, unl: { recipes: ["synth_burger"] }, art: { floors: 1, sign: "TRUCK", color: NEON.amber }, pros: "Mehr Anziehung.", cons: "Immer noch wenig Pl\xE4tze." }],
  "stand.garden": ["Streetfood-Garten", 3, { desc: "Biergarten-Atmosph\xE4re, mehrere St\xE4nde, Musik.", feat: ["nightlife"], eff: { capacity: 2.2, hours: { open: 12, close: 2 }, draw: 1.8 }, next: ["stand.hall"], unl: { recipes: ["synth_skewer", "korean_bbq"] }, art: { floors: 1, style: "market", sign: "GARTEN", color: NEON.acid }, pros: "Viele Pl\xE4tze, Abendgesch\xE4ft.", cons: "Wetterabh\xE4ngig." }],
  "stand.hall": ["Markthalle", 4, { desc: "\xDCberdachte Halle mit Dutzenden St\xE4nden. Dein Name am Eingang.", feat: ["reservations"], eff: { capacity: 3, draw: 2.3, price: 1.2 }, art: { floors: 2, style: "market", sign: "MARKTHALLE", color: NEON.acid }, pros: "Masse.", cons: "Endstufe." }],
  // Café path
  "stand.coffee": ["Kaffeestand", 2, { desc: "Synth-Espresso f\xFCr Pendler, 6 bis 18 Uhr.", spec: "caf\xE9", next: ["stand.cafe"], eff: { hours: { open: 6, close: 18 }, draw: 1.3, price: 1.1 }, unl: { recipes: ["synth_coffee", "pastry"] }, art: { floors: 1, sign: "KAFFEE", color: NEON.amber }, pros: "Morgengesch\xE4ft.", cons: "Abends zu." }],
  "stand.cafe": ["Kleines Caf\xE9", 3, { desc: "Sitzpl\xE4tze, Kuchen, Laptops.", spec: "caf\xE9", next: ["stand.premium_cafe"], eff: { hours: { open: 7, close: 20 }, capacity: 1.8, price: 1.2 }, unl: { recipes: ["cake"] }, art: { floors: 2, style: "old", sign: "CAF\xC9", color: NEON.amber }, pros: "Gem\xFCtlich, gute Marge.", cons: "Kleine K\xFCche." }],
  "stand.premium_cafe": ["Premium-Caf\xE9", 4, { desc: "Single-Origin-Synth, Barista-Wettbewerbe.", spec: "caf\xE9", next: ["stand.lounge"], feat: ["vip"], eff: { hours: { open: 7, close: 22 }, price: 1.5, quality: 16 }, req: { satisfaction: 70 }, art: { floors: 2, style: "chrome", sign: "ROAST", color: NEON.amber }, pros: "Preisniveau +50 %.", cons: "Zufriedenheit 70." }],
  "stand.lounge": ["Luxus-Coffee-Lounge", 5, { desc: "Ledersessel in der Skyline, Kritiker trinken mit.", spec: "caf\xE9", next: ["stand.cafe_chain"], feat: ["vip", "critics"], eff: { hours: { open: 8, close: 23 }, price: 2, quality: 22, capacity: 1.6, upkeep: 4 }, req: { satisfaction: 75 }, art: { floors: 3, style: "skyline", sign: "LOUNGE", color: NEON.white }, pros: "Hohe Preise.", cons: "Wenig Pl\xE4tze." }],
  "stand.cafe_chain": ["Internationale Caf\xE9-Kette", 6, { desc: "Franchise an jeder Ecke.", spec: "caf\xE9", feat: ["vip", "critics", "franchise", "group"], eff: { hours: { open: 6, close: 23 }, price: 1.8, quality: 20, capacity: 2.2, upkeep: 4.5 }, req: { ageDays: 20, revenuePerDay: 3e3 }, art: { floors: 3, style: "corporate", sign: "ROAST GROUP", color: NEON.white }, pros: "Lizenzgeb\xFChren.", cons: "Ruf." }],
  // Bar / nightlife path
  "stand.drinks": ["Getr\xE4nkestand", 2, { desc: "Synth-Bier vom Fass, Abend- und Nachtg\xE4ste.", spec: "nachtleben", next: ["stand.pub"], feat: ["nightlife"], eff: { hours: { open: 17, close: 3 }, draw: 1.3 }, unl: { recipes: ["cocktail"] }, art: { floors: 1, sign: "DRINKS", color: NEON.pink }, pros: "Nachtgesch\xE4ft.", cons: "Tags\xFCber zu." }],
  "stand.pub": ["Kneipe", 3, { desc: "Tresen, Stammtisch, Jukebox.", spec: "nachtleben", next: ["stand.cocktail"], feat: ["nightlife"], eff: { hours: { open: 17, close: 4 }, capacity: 1.9, draw: 1.6 }, unl: { recipes: ["bar_snacks"] }, art: { floors: 2, style: "old", sign: "PUB", color: NEON.pink }, pros: "Viele Pl\xE4tze.", cons: "Mehr \xC4rger: Hygiene und Zwischenf\xE4lle." }],
  "stand.cocktail": ["Cocktailbar", 4, { desc: "Mixologen, Neon, teure Gl\xE4ser.", spec: "nachtleben", next: ["stand.vip_club"], feat: ["nightlife", "vip"], eff: { hours: { open: 19, close: 5 }, price: 1.6, quality: 14 }, unl: { recipes: ["signature_cocktail"], roles: ["sommelier"], upgrades: ["vip_lounge"] }, req: { satisfaction: 68 }, art: { floors: 2, style: "chrome", sign: "COCKTAILS", color: NEON.cyan }, pros: "Preisniveau +60 %.", cons: "Sommelier n\xF6tig f\xFCr volle Qualit\xE4t." }],
  "stand.vip_club": ["VIP-Nachtclub", 5, { desc: "T\xFCrsteher, Separees, Konzernkinder.", spec: "nachtleben", next: ["stand.club_brand"], feat: ["nightlife", "vip", "critics"], eff: { hours: { open: 22, close: 6 }, price: 2.3, capacity: 2.6, draw: 2.4, upkeep: 5.5, wage: 1.4 }, req: { satisfaction: 72, upgrade: { id: "security", level: 1 } }, art: { floors: 3, style: "skyline", sign: "ECLIPSE", color: NEON.pink }, pros: "Hohes Preisniveau bei gro\xDFer Kapazit\xE4t.", cons: "Sicherheitssystem Pflicht, Betriebskosten \xD75,5." }],
  "stand.club_brand": ["Internationale Clubmarke", 6, { desc: "Franchise-Clubs, Events, Merchandise.", spec: "nachtleben", feat: ["nightlife", "vip", "critics", "franchise", "group"], eff: { hours: { open: 22, close: 6 }, price: 2.3, capacity: 2.8, draw: 2.6, upkeep: 6, wage: 1.4 }, req: { ageDays: 20, revenuePerDay: 5e3 }, art: { floors: 4, style: "skyline", sign: "ECLIPSE GROUP", color: NEON.pink }, pros: "Lizenzgeb\xFChren.", cons: "Ruf." }]
});
var capsule = buildTree("capsule_hotel", "hotel.capsule", {
  "hotel.capsule": ["Kapselhotel", 1, { desc: "Schlafkapseln f\xFCr Pendler.", next: ["hotel.budget", "hotel.robot"], art: { floors: 4, style: "chrome", sign: "CAPSULE", color: NEON.cyan }, pros: "Hohe Auslastung.", cons: "Wenig Komfort." }],
  "hotel.budget": ["Budgethotel", 2, { desc: "Echte Zimmer, Fr\xFChst\xFCcksautomat.", next: ["hotel.business", "hotel.theme"], eff: { quality: 10 }, unl: { upgrades: ["conference_rooms"] }, art: { floors: 5, style: "chrome", sign: "HOTEL", color: NEON.cyan }, pros: "Komfort +10.", cons: "Mehr Reinigung." }],
  "hotel.business": ["Businesshotel", 3, { desc: "Konferenzr\xE4ume, Shuttle, Expresskasse.", next: ["hotel.luxury", "hotel.wellness", "hotel.security"], feat: ["conference"], eff: { quality: 18 }, unl: { roles: ["concierge"], upgrades: ["conference_rooms"] }, art: { floors: 7, style: "corporate", sign: "BUSINESS", color: NEON.cyan }, pros: "Konferenzbuchungen stabilisieren die Nachfrage.", cons: "Konzerng\xE4ste verlangen Service." }],
  "hotel.luxury": ["Luxushotel", 4, { desc: "Suiten, Concierge, Dachbar.", next: ["hotel.cyber5", "hotel.casino"], feat: ["conference", "vip"], eff: { quality: 28, price: 1.6, extraPerStay: 25 }, unl: { roles: ["concierge"], upgrades: ["vip_lounge", "wellness_spa"] }, req: { satisfaction: 72, staff: { role: "reception", skill: 65 } }, art: { floors: 10, style: "skyline", sign: "GRAND", color: NEON.white }, pros: "VIP-G\xE4ste, Zusatzumsatz je Nacht.", cons: "Zufriedenheit 72 n\xF6tig, L\xF6hne +20 %." }],
  "hotel.cyber5": ["F\xFCnf-Sterne-Cyberhotel", 5, { desc: "KI-Butler, Holo-Suiten, Landeplatz.", next: ["hotel.group"], feat: ["conference", "vip", "wellness"], eff: { quality: 40, price: 2.2, extraPerStay: 60, upkeep: 5, wage: 1.4 }, req: { satisfaction: 78, research: "ai_concierge" }, art: { floors: 14, style: "skyline", sign: "NOVA PALACE", color: NEON.white }, pros: "H\xF6chstes Preisniveau.", cons: "Forschung KI-Concierge n\xF6tig; Kosten \xD75." }],
  "hotel.group": ["Internationale Hotelgruppe", 6, { desc: "Marke, Franchise, Buchungsplattform.", feat: ["conference", "vip", "wellness", "franchise", "group"], eff: { quality: 40, price: 2.2, extraPerStay: 60, upkeep: 5.5, wage: 1.4, draw: 2.8 }, req: { ageDays: 25 }, art: { floors: 14, style: "skyline", sign: "NOVA GROUP", color: NEON.white }, pros: "Franchise-Geb\xFChren.", cons: "Ruf." }],
  "hotel.theme": ["Themenhotel", 3, { desc: "Jedes Zimmer eine Cyberpunk-Legende.", spec: "thema", eff: { draw: 1.9, quality: 12, price: 1.3 }, art: { floors: 6, style: "undercity", sign: "LEGENDS", color: NEON.pink }, pros: "Starke Anziehung.", cons: "Endstufe." }],
  "hotel.wellness": ["Wellnesshotel", 4, { desc: "Spa, Synth-Thermen, Stille.", spec: "wellness", next: ["hotel.sky_resort"], feat: ["wellness"], eff: { quality: 26, price: 1.5, extraPerStay: 40, capacity: 1.8 }, unl: { upgrades: ["wellness_spa"] }, req: { satisfaction: 70 }, art: { floors: 8, style: "skyline", sign: "SPA", color: NEON.acid }, pros: "Spa-Umsatz je Nacht.", cons: "Weniger Zimmer je Fl\xE4che." }],
  "hotel.sky_resort": ["Exklusives Sky-Resort", 5, { desc: "\xDCber den Wolken, nur mit Flugtaxi.", spec: "wellness", feat: ["wellness", "vip"], eff: { quality: 42, price: 2.6, extraPerStay: 90, capacity: 1.4, upkeep: 5.5, wage: 1.5 }, req: { satisfaction: 80 }, art: { floors: 16, style: "skyline", sign: "SKY RESORT", color: NEON.white }, pros: "H\xF6chster Umsatz je Gast.", cons: "Wenige Zimmer." }],
  "hotel.security": ["Hochsicherheitshotel", 4, { desc: "Panzerglas, Scanner, Diskretion.", spec: "sicherheit", feat: ["armored", "vip"], eff: { quality: 20, price: 1.7, draw: 1.5 }, req: { upgrade: { id: "security", level: 2 } }, art: { floors: 9, style: "corporate", sign: "FORTRESS", color: NEON.red }, pros: "Keine Zwischenf\xE4lle, hohe Preise.", cons: "Sicherheitssystem Stufe 2 n\xF6tig, Endstufe." }],
  "hotel.casino": ["Casinohotel", 5, { desc: "Spieltische in der Lobby, G\xE4ste bleiben l\xE4nger.", spec: "casino", feat: ["casino", "vip"], eff: { quality: 30, price: 1.8, extraPerStay: 110, upkeep: 5.5 }, req: { satisfaction: 70, upgrade: { id: "security", level: 1 } }, art: { floors: 12, style: "skyline", sign: "ROYAL", color: NEON.amber }, pros: "Sehr hoher Zusatzumsatz je Nacht.", cons: "Mehr Zwischenf\xE4lle, Sicherheitssystem Pflicht." }],
  "hotel.robot": ["Roboterhotel", 2, { desc: "Check-in am Terminal, Reinigungsdrohnen.", spec: "automation", next: ["hotel.business"], feat: ["automation"], eff: { wage: 0.75, throughput: 1.6, quality: 6 }, unl: { upgrades: ["housekeeping_tech"] }, req: { research: "robotic_housekeeping" }, art: { floors: 5, style: "chrome", sign: "ROBOTEL", color: NEON.cyan }, pros: "L\xF6hne \u221225 %.", cons: "Forschung Reinigungsroboter n\xF6tig." }]
});
var business = buildTree("business_hotel", "bhotel.business", {
  "bhotel.business": ["Businesshotel", 1, { desc: "Komfortable Zimmer f\xFCr Konzernreisende.", next: ["bhotel.conference", "bhotel.security"], art: { floors: 9, style: "corporate", sign: "HOTEL", color: NEON.cyan }, pros: "Hohe Preise.", cons: "Anspruchsvoll." }],
  "bhotel.conference": ["Konferenzhotel", 2, { desc: "Tagungsetagen, Catering.", next: ["bhotel.executive"], feat: ["conference"], unl: { upgrades: ["conference_rooms"], roles: ["concierge"] }, art: { floors: 10, style: "corporate", sign: "CONGRESS", color: NEON.cyan }, pros: "Stabile Nachfrage.", cons: "Mehr Personal." }],
  "bhotel.executive": ["Executive-Hotel", 3, { desc: "Clubetage, Limousinen.", next: ["bhotel.luxury"], feat: ["conference", "vip"], eff: { extraPerStay: 30 }, unl: { upgrades: ["vip_lounge"] }, art: { floors: 12, style: "corporate", sign: "EXECUTIVE", color: NEON.white }, pros: "VIP.", cons: "L\xF6hne +10 %." }],
  "bhotel.luxury": ["Luxushotel", 4, { desc: "Suiten, Spa, Sternek\xFCche im Haus.", next: ["bhotel.palace", "bhotel.casino"], feat: ["conference", "vip", "wellness"], eff: { extraPerStay: 60 }, unl: { upgrades: ["wellness_spa"] }, req: { satisfaction: 72, staff: { role: "reception", skill: 65 } }, art: { floors: 14, style: "skyline", sign: "GRAND", color: NEON.white }, pros: "Hoher Zusatzumsatz.", cons: "Zufriedenheit 72." }],
  "bhotel.palace": ["F\xFCnf-Sterne-Palast", 5, { desc: "Der Name der Stadt in der Lobby.", next: ["bhotel.group"], feat: ["conference", "vip", "wellness"], eff: { quality: 40, price: 2.2, extraPerStay: 90, upkeep: 5, wage: 1.45 }, req: { satisfaction: 78, research: "ai_concierge" }, art: { floors: 18, style: "skyline", sign: "PALACE", color: NEON.white }, pros: "H\xF6chste Preise.", cons: "Forschung KI-Concierge." }],
  "bhotel.group": ["Internationale Hotelgruppe", 6, { desc: "Franchise-Marke.", feat: ["conference", "vip", "wellness", "franchise", "group"], eff: { quality: 40, price: 2.2, extraPerStay: 90, upkeep: 5.5, wage: 1.45 }, req: { ageDays: 25 }, art: { floors: 18, style: "skyline", sign: "PALACE GROUP", color: NEON.white }, pros: "Lizenzgeb\xFChren.", cons: "Ruf." }],
  "bhotel.security": ["Hochsicherheitshotel", 3, { desc: "F\xFCr Leute, die nicht gefunden werden wollen.", spec: "sicherheit", feat: ["armored", "vip"], eff: { price: 1.6, draw: 1.3 }, req: { upgrade: { id: "security", level: 2 } }, art: { floors: 10, style: "corporate", sign: "FORTRESS", color: NEON.red }, pros: "Keine Zwischenf\xE4lle.", cons: "Endstufe." }],
  "bhotel.casino": ["Casinohotel", 5, { desc: "Roulette neben der Rezeption.", spec: "casino", feat: ["casino", "vip"], eff: { extraPerStay: 130, price: 1.8, upkeep: 5.5 }, req: { satisfaction: 70, upgrade: { id: "security", level: 1 } }, art: { floors: 14, style: "skyline", sign: "ROYAL", color: NEON.amber }, pros: "H\xF6chster Zusatzumsatz.", cons: "Zwischenf\xE4lle." }]
});
var taxi = buildTree("taxi_depot", "taxi.depot", {
  "taxi.depot": ["Kleine Taxizentrale", 1, { desc: "Zwei Wagen, ein Funkger\xE4t.", next: ["taxi.fleet", "taxi.limo", "taxi.medical"], art: { floors: 2, style: "docks", sign: "TAXI", color: NEON.amber }, pros: "Einfach.", cons: "Kleiner Radius." }],
  "taxi.fleet": ["Taxiflotte", 2, { desc: "Werkstatt, Disponenten, Schichtbetrieb.", next: ["taxi.autonomous", "taxi.security"], feat: ["dispatch"], unl: { roles: ["dispatcher"], upgrades: ["dispatch"] }, art: { floors: 3, style: "docks", sign: "FLEET", color: NEON.amber }, pros: "Disponenten halbieren verpasste Fahrten.", cons: "Mehr Fahrzeugverschlei\xDF." }],
  "taxi.autonomous": ["Autonome Taxiflotte", 3, { desc: "Robotaxis fahren ohne Fahrer, Techniker warten sie.", next: ["taxi.air"], feat: ["dispatch", "driverless"], eff: { wage: 0.8 }, unl: { roles: ["technician"] }, req: { research: "autonomous_driving" }, art: { floors: 3, style: "chrome", sign: "ROBOTAXI", color: NEON.cyan }, pros: "Fahrzeuge fahren auch ohne Fahrer (70 % Leistung).", cons: "Forschung Autonomes Fahren n\xF6tig." }],
  "taxi.air": ["Flugtaxiunternehmen", 4, { desc: "Landeplattformen auf den T\xFCrmen.", next: ["taxi.mobility"], feat: ["dispatch", "driverless", "air"], eff: { radius: 2.4, price: 1.8, capacity: 1.6 }, req: { research: "autonomous_driving", revenuePerDay: 3e3 }, art: { floors: 6, style: "skyline", sign: "SKYCAB", color: NEON.cyan }, pros: "Radius \xD72,4, Tarife +80 %.", cons: "Energie und Wartung teuer." }],
  "taxi.mobility": ["Stadtweiter Mobilit\xE4tskonzern", 5, { desc: "Shuttles, Flugtaxis, Abo-Tarife.", feat: ["dispatch", "driverless", "air", "group"], eff: { radius: 3, price: 1.8, capacity: 2.2, draw: 2.4 }, req: { ageDays: 25 }, art: { floors: 8, style: "corporate", sign: "MOBILITY", color: NEON.cyan }, pros: "Ganze Stadt im Radius.", cons: "Betriebskosten \xD74,5." }],
  "taxi.limo": ["Limousinenservice", 2, { desc: "Schwarze Wagen, wei\xDFe Handschuhe.", spec: "vip", next: ["taxi.vip"], feat: ["vip"], eff: { price: 1.6, draw: 0.8 }, art: { floors: 2, style: "corporate", sign: "LIMO", color: NEON.white }, pros: "Tarife +60 %.", cons: "Weniger Fahrg\xE4ste." }],
  "taxi.vip": ["VIP-Transport", 3, { desc: "Gepanzert, diskret, teuer.", spec: "vip", next: ["taxi.shuttle"], feat: ["vip", "armored"], eff: { price: 2.2, draw: 0.75, wage: 1.3 }, unl: { roles: ["security"] }, req: { staff: { role: "driver", skill: 65 } }, art: { floors: 3, style: "corporate", sign: "VIP", color: NEON.white }, pros: "Tarife \xD72,2.", cons: "Fahrer mit F\xE4higkeit 65." }],
  "taxi.shuttle": ["Luxus-Shuttles", 4, { desc: "Hotel- und Konzernvertr\xE4ge.", spec: "vip", feat: ["vip", "armored", "dispatch"], eff: { price: 2.2, draw: 1.2, capacity: 1.5 }, req: { satisfaction: 0, revenuePerDay: 2500 }, art: { floors: 4, style: "corporate", sign: "SHUTTLE", color: NEON.white }, pros: "Mehr Nachfrage bei hohen Tarifen.", cons: "Endstufe." }],
  "taxi.security": ["Sicherheitstransport", 3, { desc: "Werttransporte und Personenschutz auf R\xE4dern.", spec: "sicherheit", feat: ["armored", "dispatch"], eff: { price: 1.9, draw: 0.9, wage: 1.25 }, unl: { roles: ["security"] }, req: { upgrade: { id: "workshop", level: 1 } }, art: { floors: 3, style: "corporate", sign: "SECURE", color: NEON.red }, pros: "Hohe Tarife.", cons: "Werkstatt Stufe 1 n\xF6tig, Endstufe." }],
  "taxi.medical": ["Krankenfahrdienst", 2, { desc: "Liegendtransporte f\xFCr Kliniken.", spec: "medizin", eff: { price: 1.4, draw: 0.9 }, art: { floors: 2, style: "chrome", sign: "MEDICAB", color: NEON.acid }, pros: "Stabile Nachfrage.", cons: "Endstufe." }]
});
var retail = buildTree("kiosk", "shop.kiosk", {
  "shop.kiosk": ["Nachtkiosk", 1, { desc: "Rund um die Uhr.", next: ["shop.store", "shop.electronics", "shop.pharmacy"], art: { floors: 1 }, pros: "Laufkundschaft.", cons: "Klein." }],
  "shop.store": ["Kleiner Laden", 2, { desc: "Regale, Kasse, ein Lager hinten.", next: ["shop.specialist", "shop.supermarket"], art: { floors: 2, sign: "MARKT", color: NEON.acid }, pros: "Mehr Kunden.", cons: "Mehr Schwund." }],
  "shop.specialist": ["Fachgesch\xE4ft", 3, { desc: "Beratung statt Masse.", eff: { price: 1.4, draw: 1.3, quality: 10 }, unl: { upgrades: ["security"] }, art: { floors: 2, style: "chrome", sign: "FACH", color: NEON.cyan }, pros: "Preisniveau +40 %.", cons: "Endstufe." }],
  "shop.supermarket": ["Supermarkt", 4, { desc: "Selbstbedienung, Bestellterminals, Lieferung.", next: ["shop.mall"], feat: ["delivery"], eff: { capacity: 2.6, draw: 2.2, price: 0.95 }, art: { floors: 2, style: "market", sign: "SUPER", color: NEON.acid }, pros: "Masse.", cons: "Preisniveau unter Normal." }],
  "shop.mall": ["Einkaufszentrum", 5, { desc: "Mieter, Food-Court, Parkdeck.", next: ["shop.group"], feat: ["delivery", "vip"], eff: { capacity: 3.2, draw: 2.6, price: 1.1 }, req: { revenuePerDay: 4e3 }, art: { floors: 4, style: "corporate", sign: "MALL", color: NEON.acid }, pros: "H\xF6chste Kundenzahl.", cons: "Kosten \xD74,5." }],
  "shop.group": ["Handelskonzern", 6, { desc: "Eigene Marken, Franchise-L\xE4den.", feat: ["delivery", "vip", "franchise", "group"], eff: { capacity: 3.4, draw: 2.8, price: 1.1 }, req: { ageDays: 25, revenuePerDay: 6e3 }, art: { floors: 5, style: "corporate", sign: "RETAIL GROUP", color: NEON.acid }, pros: "Lizenzgeb\xFChren.", cons: "Ruf." }],
  "shop.electronics": ["Elektronikmarkt", 2, { desc: "Cyber-Ersatzteile und Stims mit Garantie.", spec: "elektronik", eff: { price: 1.3, draw: 1.1, quality: 8 }, art: { floors: 2, style: "chrome", sign: "TECH", color: NEON.cyan }, pros: "H\xF6here Preise.", cons: "Endstufe." }],
  "shop.pharmacy": ["Apotheke", 2, { desc: "Medikamente mit Beratung, Nachtschalter.", spec: "medizin", eff: { price: 1.35, draw: 1.05, quality: 10 }, art: { floors: 2, style: "chrome", sign: "PHARMA", color: NEON.acid }, pros: "Hohe Marge.", cons: "Endstufe." }]
});
var security = buildTree("security_hq", "sec.firm", {
  "sec.firm": ["Kleine Sicherheitsfirma", 1, { desc: "Wachleute, ein Ermittler.", next: ["sec.object", "sec.bodyguard"], art: { floors: 3, style: "corporate", sign: "SECURITY", color: NEON.red }, pros: "Vertr\xE4ge mit der Stadt.", cons: "Klein." }],
  "sec.object": ["Objektschutzunternehmen", 2, { desc: "Nachtwachen f\xFCr Fabriken und Hotels.", next: ["sec.fleet"], eff: { draw: 1.3 }, art: { floors: 3, style: "corporate", sign: "OBJEKT", color: NEON.red }, pros: "Mehr Privatvertr\xE4ge.", cons: "Mehr Wachleute n\xF6tig." }],
  "sec.fleet": ["Sicherheitsdienst mit Fahrzeugflotte", 3, { desc: "Streifenwagen, Werttransporte.", next: ["sec.private"], feat: ["armored", "dispatch"], eff: { price: 1.4 }, unl: { roles: ["driver"], upgrades: ["workshop"] }, art: { floors: 4, style: "corporate", sign: "PATROL", color: NEON.red }, pros: "Vertragswerte +40 %.", cons: "Fahrzeugkosten." }],
  "sec.private": ["Privates Sicherheitsunternehmen", 4, { desc: "Eigene Einsatzzentrale, Bezirksvertr\xE4ge.", next: ["sec.corp"], feat: ["armored", "dispatch"], unl: { roles: ["investigator"] }, req: { staff: { role: "investigator", skill: 60 } }, art: { floors: 5, style: "corporate", sign: "PSU", color: NEON.red }, pros: "Ermittlungen schneller.", cons: "L\xF6hne +20 %." }],
  "sec.corp": ["Konzern-Sicherheitsdienst", 5, { desc: "Du sch\xFCtzt die T\xFCrme.", next: ["sec.intl"], feat: ["armored", "dispatch", "vip"], eff: { price: 2 }, req: { revenuePerDay: 3e3 }, art: { floors: 7, style: "corporate", sign: "CORPSEC", color: NEON.red }, pros: "Vertragswerte \xD72.", cons: "Kosten \xD74,5." }],
  "sec.intl": ["Internationale Sicherheitsorganisation", 6, { desc: "Privatarmee mit Marke.", feat: ["armored", "dispatch", "vip", "group"], eff: { price: 2.2 }, req: { ageDays: 25 }, art: { floors: 9, style: "corporate", sign: "GLOBAL SEC", color: NEON.red }, pros: "H\xF6chste Vertragswerte.", cons: "Politische Aufmerksamkeit." }],
  "sec.bodyguard": ["Personenschutz", 2, { desc: "Leibw\xE4chter f\xFCr die Reichen.", spec: "personenschutz", eff: { price: 1.6, draw: 0.8 }, req: { staff: { role: "guard", skill: 60 } }, art: { floors: 3, style: "corporate", sign: "GUARD", color: NEON.white }, pros: "Vertragswerte +60 %.", cons: "Endstufe, Wachleute mit F\xE4higkeit 60." }]
});
var lab = buildTree("research_lab", "lab.base", {
  "lab.base": ["Forschungslabor", 1, { desc: "Forscher, Techniker, Reagenzien.", next: ["lab.center"], art: { floors: 5, style: "chrome", sign: "LAB", color: NEON.acid }, pros: "Technologien.", cons: "Kosten ohne Umsatz." }],
  "lab.center": ["Forschungszentrum", 2, { desc: "Mehr Labore, Reinraum.", next: ["lab.institute"], art: { floors: 6, style: "chrome", sign: "CENTER", color: NEON.acid }, pros: "Forschung +20 %.", cons: "Betriebskosten \xD71,5." }],
  "lab.institute": ["Technologieinstitut", 3, { desc: "Stipendiaten, Patente.", next: ["lab.campus"], unl: { upgrades: ["security"] }, art: { floors: 7, style: "chrome", sign: "INSTITUT", color: NEON.acid }, pros: "Forschung +45 %.", cons: "Industriespionage." }],
  "lab.campus": ["Forschungs-Campus", 4, { desc: "Mehrere Geb\xE4ude, ein Ziel.", next: ["lab.corp"], req: { staff: { role: "researcher", skill: 70 } }, art: { floors: 9, style: "skyline", sign: "CAMPUS", color: NEON.acid }, pros: "Forschung +75 %.", cons: "Forscher mit F\xE4higkeit 70." }],
  "lab.corp": ["Konzernforschung", 5, { desc: "Geheimprojekte, eigene Fertigung.", next: ["lab.complex"], art: { floors: 12, style: "skyline", sign: "R&D", color: NEON.acid }, pros: "Forschung \xD72,1.", cons: "Kosten \xD74,5." }],
  "lab.complex": ["Internationaler Forschungskomplex", 6, { desc: "Die Stadt lernt von dir.", feat: ["group"], req: { ageDays: 25 }, art: { floors: 14, style: "skyline", sign: "NEXUS", color: NEON.acid }, pros: "Forschung \xD72,4.", cons: "Kosten \xD75,5." }]
});
function factoryTree(defId, prefix, sign) {
  return buildTree(defId, `${prefix}.workshop`, {
    [`${prefix}.workshop`]: ["Produktionshalle", 1, { desc: "Eine Halle, wenige Linien.", next: [`${prefix}.factory`], art: { floors: 3, style: "docks", sign, color: NEON.orange }, pros: "Eigene Versorgung.", cons: "Begrenzte Linien." }],
    [`${prefix}.factory`]: ["Fabrik", 2, { desc: "Schichtbetrieb, mehr Maschinen.", next: [`${prefix}.automated`], art: { floors: 4, style: "docks", sign, color: NEON.orange }, pros: "Maschinenleistung +30 %.", cons: "Verschmutzung." }],
    [`${prefix}.automated`]: ["Automatisierte Fabrik", 3, { desc: "Roboterlinien, Techniker statt Arbeiter.", next: [`${prefix}.complex`], feat: ["automation"], eff: { wage: 0.8, throughput: 1.8 }, req: { research: "kitchen_automation" }, art: { floors: 4, style: "chrome", sign, color: NEON.cyan }, pros: "Eine Linie mehr, L\xF6hne \u221220 %.", cons: "Forschung n\xF6tig." }],
    [`${prefix}.complex`]: ["Industriekomplex", 4, { desc: "Mehrere Hallen, eigenes Umspannwerk.", next: [`${prefix}.campus`], feat: ["automation"], eff: { wage: 0.8, throughput: 2 }, req: { revenuePerDay: 3e3 }, art: { floors: 5, style: "docks", sign, color: NEON.orange }, pros: "Maschinenleistung \xD72,2.", cons: "Kosten \xD73,2." }],
    [`${prefix}.campus`]: ["Hochautomatisierter Produktionscampus", 5, { desc: "Fast menschenleer.", next: [`${prefix}.mega`], feat: ["automation"], eff: { wage: 0.7, throughput: 2.4 }, art: { floors: 6, style: "chrome", sign, color: NEON.cyan }, pros: "Zwei Linien mehr.", cons: "Kosten \xD74,5." }],
    [`${prefix}.mega`]: ["Industriemegakonzern", 6, { desc: "Produktion als Marke.", feat: ["automation", "group"], eff: { wage: 0.7, throughput: 2.6 }, req: { ageDays: 25 }, art: { floors: 7, style: "corporate", sign, color: NEON.orange }, pros: "H\xF6chste Leistung.", cons: "Kosten \xD75,5." }]
  });
}
var bank = buildTree("bank", "bank.office", {
  "bank.office": ["Privates Kreditb\xFCro", 1, { desc: "Ein Schalter, ein Tresor.", next: ["bank.broker"], art: { floors: 3, style: "corporate", sign: "KREDIT", color: NEON.amber }, pros: "Einstieg ins Zinsgesch\xE4ft.", cons: "Kleine Bilanz." }],
  "bank.broker": ["Kreditvermittlung", 2, { desc: "Vermittelt Kredite, nimmt Einlagen.", next: ["bank.small"], art: { floors: 4, style: "corporate", sign: "FINANZ", color: NEON.amber }, pros: "Bilanz +20 %.", cons: "Mehr Ausf\xE4lle." }],
  "bank.small": ["Kleine Bank", 3, { desc: "Filiale mit Analysten.", next: ["bank.commercial"], unl: { upgrades: ["security"] }, art: { floors: 5, style: "corporate", sign: "BANK", color: NEON.amber }, pros: "Bilanz +50 %.", cons: "Aufsicht schaut genauer hin." }],
  "bank.commercial": ["Gesch\xE4ftsbank", 4, { desc: "Konzernkunden, Gro\xDFkredite.", next: ["bank.investment"], req: { staff: { role: "analyst", skill: 65 } }, art: { floors: 8, style: "corporate", sign: "COMMERZ", color: NEON.amber }, pros: "Bilanz \xD71,9.", cons: "Analyst mit F\xE4higkeit 65." }],
  "bank.investment": ["Investmentbank", 5, { desc: "Hochfrequenz, Hochrisiko.", next: ["bank.group"], eff: { draw: 2.6 }, req: { revenuePerDay: 4e3 }, art: { floors: 12, style: "skyline", sign: "INVEST", color: NEON.white }, pros: "Bilanz \xD72,4.", cons: "Kosten \xD74,5." }],
  "bank.group": ["Internationale Finanzgruppe", 6, { desc: "Die Stadt rechnet in deiner W\xE4hrung.", feat: ["group"], req: { ageDays: 25 }, art: { floors: 16, style: "skyline", sign: "FINANCE GROUP", color: NEON.white }, pros: "Bilanz \xD73.", cons: "Kosten \xD75,5." }]
});
var farm = buildTree("farm", "farm.small", {
  "farm.small": ["Bauernhof", 1, { desc: "Felder, zwei Arbeiter, ein Traktor.", next: ["farm.greenhouse"], art: { floors: 1, style: "rural", sign: "HOF", color: NEON.acid }, pros: "Regionale Produkte.", cons: "Wetterabh\xE4ngig, kleine Mengen." }],
  "farm.greenhouse": ["Gew\xE4chshaus-Betrieb", 2, { desc: "Glas, Hydroponik, Ernte das ganze Jahr.", next: ["farm.vertical"], eff: { throughput: 1.5 }, art: { floors: 1, style: "rural", sign: "GLASHAUS", color: NEON.acid }, pros: "Mehr Ertrag, drei Linien.", cons: "Energiekosten." }],
  "farm.vertical": ["Vertikale Farm", 3, { desc: "Stockwerke aus Licht und N\xE4hrl\xF6sung.", next: ["farm.agro"], feat: ["automation"], eff: { throughput: 2.2, wage: 0.85 }, req: { research: "demand_forecast" }, art: { floors: 3, style: "chrome", sign: "VERTIFARM", color: NEON.acid }, pros: "Gro\xDFe Mengen auf kleiner Fl\xE4che.", cons: "Forschung Nachfrageprognose n\xF6tig." }],
  "farm.agro": ["Automatisierter Agrarbetrieb", 4, { desc: "Drohnen s\xE4en, Roboter ernten.", next: ["farm.park"], feat: ["automation"], eff: { throughput: 2.6, wage: 0.75 }, art: { floors: 3, style: "chrome", sign: "AGRO", color: NEON.acid }, pros: "L\xF6hne \u221225 %.", cons: "Kosten \xD73,2." }],
  "farm.park": ["Agrarindustriepark", 5, { desc: "Die Versorgung der Stadt kommt von hier.", next: ["farm.corp"], feat: ["automation"], eff: { throughput: 3 }, req: { revenuePerDay: 2500 }, art: { floors: 4, style: "docks", sign: "AGRO PARK", color: NEON.acid }, pros: "Zwei Linien mehr.", cons: "Kosten \xD74,5." }],
  "farm.corp": ["Lebensmittelproduktionskonzern", 6, { desc: "Marke, Export, Vertr\xE4ge mit Konzernen.", feat: ["automation", "group"], eff: { throughput: 3.2 }, req: { ageDays: 25 }, art: { floors: 5, style: "corporate", sign: "AGRO CORP", color: NEON.acid }, pros: "H\xF6chste Ertr\xE4ge.", cons: "Kosten \xD75,5." }]
});
var inn = buildTree("inn", "inn.pension", {
  "inn.pension": ["Landgasthof", 1, { desc: "Zehn Zimmer, Garten, Fr\xFChst\xFCck vom Hof.", next: ["inn.hotel"], art: { floors: 2, style: "rural", sign: "GASTHOF", color: NEON.amber }, pros: "Ruhe zieht St\xE4dter an.", cons: "Wenige Zimmer." }],
  "inn.hotel": ["Kleines Landhotel", 2, { desc: "Anbau, Restaurant, Fahrradverleih.", next: ["inn.wellness", "inn.theme"], eff: { quality: 10 }, unl: { upgrades: ["conference_rooms"] }, art: { floors: 2, style: "rural", sign: "LANDHOTEL", color: NEON.amber }, pros: "Komfort +10.", cons: "Mehr Reinigung." }],
  "inn.wellness": ["Wellness-Landhotel", 3, { desc: "Sauna am See, Spa mit Kr\xE4utern aus dem Garten.", next: ["inn.resort"], feat: ["wellness"], eff: { quality: 24, price: 1.4, extraPerStay: 35 }, unl: { upgrades: ["wellness_spa"], roles: ["concierge"] }, req: { satisfaction: 68 }, art: { floors: 3, style: "rural", sign: "SPA AM SEE", color: NEON.acid }, pros: "Spa-Umsatz je Nacht.", cons: "Zufriedenheit 68 n\xF6tig." }],
  "inn.resort": ["Exklusives Landresort", 5, { desc: "Reiche G\xE4ste aus der Megacity, Hubschrauberlandeplatz.", feat: ["wellness", "vip"], eff: { quality: 40, price: 2.4, extraPerStay: 90, capacity: 1.6, upkeep: 5, wage: 1.5 }, req: { satisfaction: 78, staff: { role: "reception", skill: 65 } }, art: { floors: 3, style: "skyline", sign: "GREEN RESORT", color: NEON.white }, pros: "H\xF6chste Preise, auch im Umland.", cons: "Wenige Zimmer, hohe Kosten." }],
  "inn.theme": ["Themen-Gasthof", 3, { desc: "Jedes Zimmer ein M\xE4rchen mit Hologramm.", spec: "thema", eff: { draw: 1.8, quality: 12, price: 1.25 }, art: { floors: 2, style: "old", sign: "M\xC4RCHENHOF", color: NEON.pink }, pros: "Starke Anziehung.", cons: "Endstufe." }]
});
var farmShop = buildTree("farm_shop", "fshop.stand", {
  "fshop.stand": ["Hofladen", 1, { desc: "Kisten, Waage, Kasse aus Holz.", next: ["fshop.store", "fshop.organic"], art: { floors: 1 }, pros: "Regionale Ware.", cons: "Klein." }],
  "fshop.store": ["Dorfmarkt", 2, { desc: "Regale, K\xFChltheke, Lieferung ins Dorf.", next: ["fshop.chain"], feat: ["delivery"], eff: { capacity: 1.6, draw: 1.4 }, art: { floors: 2, style: "rural", sign: "DORFMARKT", color: NEON.acid }, pros: "Lieferdienst.", cons: "Mehr Schwund." }],
  "fshop.organic": ["Bio-Feinkost", 3, { desc: "Kr\xE4uter, K\xE4se, Honig: teuer und gefragt.", spec: "feinkost", eff: { price: 1.5, quality: 12, draw: 1.1 }, req: { reputation: 40 }, art: { floors: 2, style: "rural", sign: "FEINKOST", color: NEON.amber }, pros: "Preisniveau +50 %.", cons: "Endstufe." }],
  "fshop.chain": ["Regionalmarkt-Kette", 4, { desc: "Dein Hofladen in jeder Vorstadt.", feat: ["delivery", "franchise"], eff: { capacity: 2.2, draw: 1.9 }, req: { revenuePerDay: 1500 }, art: { floors: 2, style: "suburb", sign: "REGIONAL", color: NEON.acid }, pros: "Franchise-Geb\xFChren.", cons: "Kosten \xD73,2." }]
});
var EVOLUTION = {
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
  food_factory: factoryTree("food_factory", "food", "FOOD WERK"),
  tech_factory: factoryTree("tech_factory", "tech", "TECH WERK"),
  bank
};
var BASE_EFFECTS = levelDefaults(1);

// src/sim/data/research.ts
var RESEARCH = {
  kitchen_automation: { id: "kitchen_automation", tree: "automation", name: "K\xFCchenautomation", description: "Robotische Kochstationen in allen Lokalen.", effect: "Kochleistung +15 %", cost: 9e3, points: 60, requires: [] },
  robotic_housekeeping: { id: "robotic_housekeeping", tree: "automation", name: "Robotisches Housekeeping", description: "Reinigungsdrohnen f\xFCr Hotels.", effect: "Zimmerkosten \u221220 %", cost: 12e3, points: 80, requires: ["kitchen_automation"] },
  autonomous_assist: { id: "autonomous_assist", tree: "automation", name: "Fahrassistenz", description: "Teilautonome Taxis entlasten die Fahrer.", effect: "Fahrten je Fahrer +25 %", cost: 15e3, points: 100, requires: ["kitchen_automation"] },
  autonomous_driving: { id: "autonomous_driving", tree: "automation", name: "Autonomes Fahren", description: "Robotaxis fahren ohne Fahrer.", effect: "Schaltet autonome Flotten und Flugtaxis im Entwicklungsbaum frei", cost: 26e3, points: 180, requires: ["autonomous_assist"] },
  ai_concierge: { id: "ai_concierge", tree: "ai", name: "KI-Concierge", description: "Ein Butler, der jeden Gast kennt.", effect: "Schaltet F\xFCnf-Sterne-Hotels im Entwicklungsbaum frei, Hotelkomfort +4", cost: 22e3, points: 150, requires: ["demand_forecast"] },
  microgrid: { id: "microgrid", tree: "energy", name: "Microgrid", description: "Eigene Energiezellen in jedem Betrieb.", effect: "Betriebskosten \u221215 %, Fabrik-Energie \u221230 %", cost: 11e3, points: 80, requires: [] },
  fusion_cells: { id: "fusion_cells", tree: "energy", name: "Fusionszellen", description: "Kompakte Fusionszellen machen unabh\xE4ngig vom Netz.", effect: "Energiekrisen treffen dich nur halb", cost: 24e3, points: 160, requires: ["microgrid"] },
  wellness_implants: { id: "wellness_implants", tree: "medtech", name: "Wellness-Implantate", description: "Komfortmodule f\xFCr Hotelg\xE4ste.", effect: "Hotelkomfort +8", cost: 1e4, points: 70, requires: [] },
  stim_license: { id: "stim_license", tree: "medtech", name: "Stim-Lizenz", description: "Lizenzierte Stims und Medikamente im Einzelhandel.", effect: "Warenkorb im Einzelhandel +15 %", cost: 8e3, points: 60, requires: [] },
  drone_delivery: { id: "drone_delivery", tree: "logistics", name: "Lieferdrohnen", description: "Drohnen \xFCbernehmen die Zustellung von Lieferanten.", effect: "Lieferzeiten \u221240 %", cost: 9e3, points: 60, requires: [] },
  cold_chain: { id: "cold_chain", tree: "logistics", name: "K\xFChlkette", description: "Durchgehende K\xFChlung von Lieferung bis Lager.", effect: "Haltbarkeit +2 Tage", cost: 7e3, points: 50, requires: [] },
  synth_cuisine: { id: "synth_cuisine", tree: "gastronomy", name: "Synth-K\xFCche", description: "Neue Gerichte aus Laborprotein.", effect: "Rezepte Synth-Sushi und Labor-Steak", cost: 6e3, points: 45, requires: [] },
  flavor_profiling: { id: "flavor_profiling", tree: "gastronomy", name: "Geschmacksprofile", description: "G\xE4ste bekommen, was sie m\xF6gen.", effect: "Zufriedenheit +5 in Lokalen", cost: 1e4, points: 70, requires: ["synth_cuisine"] },
  surveillance_ai: { id: "surveillance_ai", tree: "security", name: "\xDCberwachungs-KI", description: "Kameras werten Muster aus.", effect: "Streifeneffekt +30 %, Schwund \u221250 %", cost: 12e3, points: 90, requires: [] },
  credit_scoring: { id: "credit_scoring", tree: "fintech", name: "Kreditscoring", description: "Bessere Bonit\xE4tsmodelle der Banken.", effect: "Kreditzins \u22122 Punkte, Pr\xE4mien \u221220 %", cost: 8e3, points: 60, requires: [] },
  prefab: { id: "prefab", tree: "construction", name: "Modulbau", description: "Vorgefertigte Module beschleunigen Neubauten.", effect: "Bauzeit \u221230 %, Baukosten \u221210 %", cost: 1e4, points: 70, requires: [] },
  demand_forecast: { id: "demand_forecast", tree: "ai", name: "Nachfrageprognose", description: "KI plant Einkauf und Produktion.", effect: "Verderb \u221250 %, Nachbestellung passt sich an", cost: 14e3, points: 100, requires: [] },
  dynamic_pricing: { id: "dynamic_pricing", tree: "ai", name: "Dynamische Preise", description: "Preise folgen der Nachfrage in Echtzeit.", effect: "Umsatz +6 % in allen Betrieben", cost: 2e4, points: 140, requires: ["demand_forecast"] }
};
var RESEARCH_IDS = Object.keys(RESEARCH);

// src/sim/data/upgrades.ts
var UPGRADES = {
  seating: {
    id: "seating",
    name: "Gastraum",
    description: "Mehr Sitzpl\xE4tze und Theke. Erh\xF6ht die G\xE4ste pro Stunde.",
    levels: [
      { cost: 2200, hours: 10, effect: "+6 Pl\xE4tze" },
      { cost: 4200, hours: 14, effect: "+6 Pl\xE4tze" },
      { cost: 7500, hours: 20, effect: "+8 Pl\xE4tze" }
    ]
  },
  kitchen: {
    id: "kitchen",
    name: "K\xFCche",
    description: "Bessere Kochstationen: schneller und h\xF6here Qualit\xE4t.",
    levels: [
      { cost: 2800, hours: 12, effect: "+25 % Kochleistung, +5 Qualit\xE4t" },
      { cost: 5600, hours: 16, effect: "+25 % Kochleistung, +5 Qualit\xE4t" },
      { cost: 9800, hours: 24, effect: "+30 % Kochleistung, +8 Qualit\xE4t" }
    ]
  },
  storage: {
    id: "storage",
    name: "Lager",
    description: "K\xFChlzellen und Regale: mehr Platz, langsameres Verderben.",
    levels: [
      { cost: 1500, hours: 8, effect: "+80 Einheiten, +1 Tag Haltbarkeit" },
      { cost: 3200, hours: 12, effect: "+120 Einheiten, +1 Tag Haltbarkeit" }
    ]
  },
  decor: {
    id: "decor",
    name: "Ausstattung",
    description: "Neonlicht, Hologramme, bessere Sitze. Steigert Zufriedenheit und Anziehung.",
    levels: [
      { cost: 1800, hours: 8, effect: "+6 Zufriedenheit, +8 % Anziehung" },
      { cost: 3600, hours: 10, effect: "+6 Zufriedenheit, +8 % Anziehung" },
      { cost: 7200, hours: 14, effect: "+8 Zufriedenheit, +10 % Anziehung" }
    ]
  },
  hygiene_station: {
    id: "hygiene_station",
    name: "Hygienestation",
    description: "Automatische Reinigung: Hygiene f\xE4llt langsamer.",
    levels: [
      { cost: 1200, hours: 6, effect: "\u221240 % Hygieneverlust" },
      { cost: 2600, hours: 8, effect: "\u221230 % Hygieneverlust" }
    ]
  },
  staff_room: {
    id: "staff_room",
    name: "Personalraum",
    description: "Pausenraum und Spinde. H\xE4lt die Moral oben.",
    levels: [
      { cost: 1400, hours: 8, effect: "+8 Moral" },
      { cost: 3e3, hours: 10, effect: "+8 Moral" }
    ]
  },
  marketing: {
    id: "marketing",
    name: "Leuchtreklame",
    description: "Hologramm-Werbung an der Fassade zieht Laufkundschaft an.",
    levels: [
      { cost: 1600, hours: 6, effect: "+12 % Anziehung" },
      { cost: 3400, hours: 8, effect: "+12 % Anziehung" }
    ]
  }
};
UPGRADES.rooms = {
  id: "rooms",
  name: "Zimmerausbau",
  description: "Weitere Etagen werden hergerichtet: mehr Zimmer.",
  levels: [
    { cost: 9e3, hours: 24, effect: "+8 Zimmer" },
    { cost: 16e3, hours: 30, effect: "+8 Zimmer" },
    { cost: 26e3, hours: 40, effect: "+12 Zimmer" }
  ]
};
UPGRADES.lobby = {
  id: "lobby",
  name: "Lobby & Bar",
  description: "Empfangsbereich mit Bar: h\xF6herer Komfort und bessere Bewertungen.",
  levels: [
    { cost: 6e3, hours: 16, effect: "+8 Komfort" },
    { cost: 12e3, hours: 20, effect: "+8 Komfort" }
  ]
};
UPGRADES.housekeeping_tech = {
  id: "housekeeping_tech",
  name: "Reinigungsroboter",
  description: "Automatisierte Reinigung senkt die Kosten je Zimmernacht und h\xE4lt die Sauberkeit hoch.",
  levels: [
    { cost: 7e3, hours: 12, effect: "\u221225 % Zimmerkosten, Sauberkeit +" },
    { cost: 14e3, hours: 14, effect: "\u221225 % Zimmerkosten, Sauberkeit ++" }
  ]
};
UPGRADES.security = {
  id: "security",
  name: "Sicherheitssystem",
  description: "Kameras, Schleusen, Wachpersonal-Terminals. Sch\xFCtzt vor Diebstahl und beruhigt G\xE4ste.",
  levels: [
    { cost: 4e3, hours: 10, effect: "\u221250 % Schwund und Zwischenf\xE4lle" },
    { cost: 8e3, hours: 12, effect: "\u221275 % Schwund und Zwischenf\xE4lle" }
  ]
};
UPGRADES.charging = {
  id: "charging",
  name: "Ladestation",
  description: "Eigene Schnelllader senken die Energiekosten je Fahrt.",
  levels: [
    { cost: 8e3, hours: 16, effect: "\u221230 % Energiekosten" },
    { cost: 15e3, hours: 20, effect: "\u221250 % Energiekosten" }
  ]
};
UPGRADES.workshop = {
  id: "workshop",
  name: "Werkstatt",
  description: "Eigene Mechaniker: g\xFCnstigere Reparaturen, Fahrzeuge halten l\xE4nger.",
  levels: [
    { cost: 9e3, hours: 20, effect: "Verschlei\xDF \u221230 %, Reparaturen \u221240 %" },
    { cost: 17e3, hours: 24, effect: "Verschlei\xDF \u221250 %, Reparaturen \u221260 %" }
  ]
};
UPGRADES.dispatch = {
  id: "dispatch",
  name: "Dispatch-KI",
  description: "Routenoptimierung: mehr Fahrten je Fahrer und Stunde.",
  levels: [
    { cost: 6e3, hours: 8, effect: "+20 % Fahrten" },
    { cost: 12e3, hours: 10, effect: "+40 % Fahrten" }
  ]
};
UPGRADES.shelves = {
  id: "shelves",
  name: "Regalsystem",
  description: "Mehr Regalfl\xE4che: mehr Kunden je Stunde und gr\xF6\xDFerer Warenkorb.",
  levels: [
    { cost: 2500, hours: 8, effect: "+30 % Kundenkapazit\xE4t, Warenkorb +10 %" },
    { cost: 5e3, hours: 10, effect: "+30 % Kundenkapazit\xE4t, Warenkorb +10 %" }
  ]
};
UPGRADES.machines = {
  id: "machines",
  name: "Maschinenpark",
  description: "Mehr und bessere Maschinen: h\xF6here Tagesleistung und Qualit\xE4t.",
  levels: [
    { cost: 15e3, hours: 24, effect: "+40 % Maschinenleistung, +5 Qualit\xE4t" },
    { cost: 28e3, hours: 30, effect: "+40 % Maschinenleistung, +5 Qualit\xE4t" },
    { cost: 45e3, hours: 40, effect: "+50 % Maschinenleistung, +5 Qualit\xE4t" }
  ]
};
UPGRADES.filters = {
  id: "filters",
  name: "Filteranlage",
  description: "Abgasfilter und Wasseraufbereitung senken die Verschmutzung.",
  levels: [
    { cost: 9e3, hours: 16, effect: "\u221240 % Verschmutzung" },
    { cost: 17e3, hours: 20, effect: "\u221280 % Verschmutzung" }
  ]
};
var UPGRADE_IDS = Object.keys(UPGRADES);
UPGRADES.delivery_kitchen = {
  id: "delivery_kitchen",
  name: "Lieferk\xFCche",
  description: "Packstation und Kuriere: Bestellungen au\xDFer Haus, unabh\xE4ngig von den Sitzpl\xE4tzen.",
  levels: [
    { cost: 3e3, hours: 10, effect: "+25 % Liefernachfrage" },
    { cost: 6e3, hours: 14, effect: "+20 % Liefernachfrage" }
  ]
};
UPGRADES.vip_lounge = {
  id: "vip_lounge",
  name: "VIP-Lounge",
  description: "Separee mit eigenem Service: zufriedenere G\xE4ste, die h\xF6here Preise akzeptieren.",
  levels: [
    { cost: 9e3, hours: 18, effect: "+8 Zufriedenheit, Preisakzeptanz +5 %" },
    { cost: 18e3, hours: 24, effect: "+6 Zufriedenheit, Preisakzeptanz +5 %" }
  ]
};
UPGRADES.robot_kitchen = {
  id: "robot_kitchen",
  name: "Roboterk\xFCche",
  description: "Kochroboter \xFCbernehmen Standardgerichte.",
  levels: [
    { cost: 12e3, hours: 20, effect: "+40 % Kochleistung" },
    { cost: 22e3, hours: 26, effect: "+40 % Kochleistung" }
  ]
};
UPGRADES.wellness_spa = {
  id: "wellness_spa",
  name: "Spa",
  description: "Thermen, Massagen, Synth-Sauna.",
  levels: [
    { cost: 2e4, hours: 30, effect: "+6 Komfort, +15 \xA2 Zusatzumsatz je Nacht" },
    { cost: 36e3, hours: 36, effect: "+6 Komfort, +15 \xA2 Zusatzumsatz je Nacht" }
  ]
};
UPGRADES.conference_rooms = {
  id: "conference_rooms",
  name: "Konferenzr\xE4ume",
  description: "Tagungen bringen G\xE4ste unter der Woche.",
  levels: [
    { cost: 14e3, hours: 24, effect: "+10 % Nachfrage" },
    { cost: 26e3, hours: 30, effect: "+10 % Nachfrage" }
  ]
};

// src/sim/data/training.ts
var TRAINING_COURSES = {
  workshop: { id: "workshop", name: "Tageskurs", description: "Ein Tag Praxisschulung im Haus.", days: 1, baseCost: 250, costPerSkill: 6, gain: 7, morale: 4, minSkill: 0 },
  seminar: { id: "seminar", name: "Fachseminar", description: "Drei Tage externes Seminar mit Zertifikat.", days: 3, baseCost: 900, costPerSkill: 18, gain: 16, morale: 8, minSkill: 25 },
  master: { id: "master", name: "Meisterkurs", description: "Eine Woche Intensivkurs bei den Besten der Stadt.", days: 7, baseCost: 3200, costPerSkill: 40, gain: 28, morale: 12, minSkill: 50 }
};
var TRAINING_IDS = Object.keys(TRAINING_COURSES);

// src/sim/data/recipes.ts
var RECIPES = {
  herb_bowl: { id: "herb_bowl", name: "Kr\xE4uter-Bowl", description: "Regionales Gem\xFCse mit frischen Premium-Kr\xE4utern aus Greenhaven.", ingredients: { vegetables: 1.2, herbs: 0.4, noodles: 0.3 }, basePrice: 14, appeal: 66, complexity: 35, prepLoad: 0.8 },
  // --- unlocked by evolution stages (data/evolution.ts)
  tonkotsu_ramen: { id: "tonkotsu_ramen", name: "Tonkotsu-Ramen", description: "Zw\xF6lf Stunden gekochte Knochenbr\xFChe, cremig und schwer.", ingredients: { noodles: 1, broth: 1.6, synthmeat: 1.2, spices: 0.3 }, basePrice: 24, appeal: 78, complexity: 60, prepLoad: 1.2 },
  peking_duck: { id: "peking_duck", name: "Peking-Ente", description: "Knusprige Synth-Ente mit Pfannkuchen.", ingredients: { synthmeat: 2, vegetables: 0.8, spices: 0.6, noodles: 0.3 }, basePrice: 42, appeal: 80, complexity: 70, prepLoad: 1.6 },
  tasting_menu: { id: "tasting_menu", name: "Tasting-Men\xFC", description: "Sieben G\xE4nge, jeder ein Statement.", ingredients: { synthmeat: 1.5, vegetables: 1.5, broth: 0.6, spices: 0.8, drinks: 0.5 }, basePrice: 95, appeal: 85, complexity: 85, prepLoad: 2.4 },
  yakitori: { id: "yakitori", name: "Yakitori", description: "Spie\xDFe vom Holzkohlegrill, Tare-Sauce.", ingredients: { synthmeat: 0.7, spices: 0.3 }, basePrice: 11, appeal: 60, complexity: 35, prepLoad: 0.7 },
  sake_set: { id: "sake_set", name: "Sake-Set", description: "Drei Sorten, warm und kalt.", ingredients: { drinks: 1.5 }, basePrice: 16, appeal: 55, complexity: 20, prepLoad: 0.3 },
  sashimi_plate: { id: "sashimi_plate", name: "Sashimi-Platte", description: "Zuchttankfisch, messerscharf geschnitten.", ingredients: { synthmeat: 1.4, vegetables: 0.3, spices: 0.2 }, basePrice: 38, appeal: 76, complexity: 75, prepLoad: 1.1 },
  omakase_menu: { id: "omakase_menu", name: "Omakase", description: "Der Meister entscheidet. Zw\xF6lf St\xFCcke.", ingredients: { synthmeat: 2.2, vegetables: 0.5, spices: 0.5, drinks: 0.4 }, basePrice: 160, appeal: 90, complexity: 92, prepLoad: 3 },
  dan_dan_noodles: { id: "dan_dan_noodles", name: "Dan-Dan-Nudeln", description: "Sesam, Chili, Hackfleisch.", ingredients: { noodles: 1, synthmeat: 0.5, spices: 0.6 }, basePrice: 15, appeal: 66, complexity: 42, prepLoad: 0.9 },
  dim_sum: { id: "dim_sum", name: "Dim Sum", description: "Dampfk\xF6rbe mit Teigtaschen.", ingredients: { noodles: 0.6, synthmeat: 0.5, vegetables: 0.5, spices: 0.2 }, basePrice: 19, appeal: 72, complexity: 55, prepLoad: 1.3 },
  dim_sum_premium: { id: "dim_sum_premium", name: "Premium-Dim-Sum", description: "Tr\xFCffel, Goldblatt, Teewagen.", ingredients: { noodles: 0.6, synthmeat: 0.9, vegetables: 0.6, spices: 0.6 }, basePrice: 48, appeal: 82, complexity: 78, prepLoad: 1.8 },
  tteokbokki: { id: "tteokbokki", name: "Tteokbokki", description: "Reiskuchen in scharfer Sauce.", ingredients: { noodles: 1, vegetables: 0.4, spices: 0.7 }, basePrice: 10, appeal: 62, complexity: 30, prepLoad: 0.7 },
  korean_bbq: { id: "korean_bbq", name: "Korean BBQ", description: "Tischgrill, Marinaden, Beilagen ohne Ende.", ingredients: { synthmeat: 1.6, vegetables: 1, spices: 0.6, drinks: 0.3 }, basePrice: 34, appeal: 80, complexity: 50, prepLoad: 1.2 },
  bibimbap: { id: "bibimbap", name: "Bibimbap", description: "Reis, Gem\xFCse, Ei, Gochujang.", ingredients: { noodles: 0.8, vegetables: 1.2, synthmeat: 0.4, spices: 0.4 }, basePrice: 17, appeal: 68, complexity: 45, prepLoad: 1 },
  hanwoo_set: { id: "hanwoo_set", name: "Hanwoo-Set", description: "Edelstes Synth-Rind, am Tisch gegrillt.", ingredients: { synthmeat: 2.4, vegetables: 0.8, spices: 0.6, drinks: 0.5 }, basePrice: 88, appeal: 86, complexity: 80, prepLoad: 2 },
  doener: { id: "doener", name: "D\xF6ner", description: "Drehspie\xDF, Fladenbrot, alles mit So\xDFe.", ingredients: { synthmeat: 0.9, vegetables: 0.6, noodles: 0.4, spices: 0.3 }, basePrice: 9, appeal: 74, complexity: 28, prepLoad: 0.6 },
  lahmacun: { id: "lahmacun", name: "Lahmacun", description: "D\xFCnner Fladen mit Hack und Kr\xE4utern.", ingredients: { noodles: 0.5, synthmeat: 0.5, vegetables: 0.5, spices: 0.3 }, basePrice: 8, appeal: 60, complexity: 32, prepLoad: 0.7 },
  adana_grill: { id: "adana_grill", name: "Adana-Grill", description: "Scharfe Hackspie\xDFe vom Holzkohlegrill.", ingredients: { synthmeat: 1.3, vegetables: 0.6, spices: 0.6 }, basePrice: 22, appeal: 74, complexity: 50, prepLoad: 1.1 },
  meze_plate: { id: "meze_plate", name: "Meze-Platte", description: "Kleine Teller zum Teilen.", ingredients: { vegetables: 1.4, spices: 0.5, noodles: 0.3 }, basePrice: 18, appeal: 64, complexity: 40, prepLoad: 0.9 },
  grill_platter: { id: "grill_platter", name: "Gro\xDFe Grillplatte", description: "F\xFCr den Tisch: Lamm, Rind, H\xE4hnchen aus dem Tank.", ingredients: { synthmeat: 2.4, vegetables: 1, spices: 0.8 }, basePrice: 52, appeal: 80, complexity: 62, prepLoad: 1.8 },
  tomahawk: { id: "tomahawk", name: "Tomahawk-Steak", description: "Ein Kilo, dry-aged im Synth-Reifeschrank.", ingredients: { synthmeat: 3.2, vegetables: 0.6, spices: 0.6 }, basePrice: 110, appeal: 84, complexity: 72, prepLoad: 2 },
  synth_burger: { id: "synth_burger", name: "Synth-Burger", description: "Patty, Br\xF6tchen, K\xE4se aus dem Fermenter.", ingredients: { synthmeat: 0.8, noodles: 0.4, vegetables: 0.3, spices: 0.1 }, basePrice: 9, appeal: 72, complexity: 25, prepLoad: 0.6 },
  fries: { id: "fries", name: "Pommes", description: "Knusprig, salzig, immer.", ingredients: { vegetables: 0.6, spices: 0.1 }, basePrice: 4, appeal: 50, complexity: 10, prepLoad: 0.3 },
  menu_box: { id: "menu_box", name: "Men\xFC-Box", description: "Burger, Pommes, Getr\xE4nk. Standardisiert.", ingredients: { synthmeat: 0.8, noodles: 0.4, vegetables: 0.8, drinks: 1, spices: 0.1 }, basePrice: 14, appeal: 70, complexity: 20, prepLoad: 0.8 },
  currywurst: { id: "currywurst", name: "Currywurst", description: "Synth-Wurst, Ketchup, Curry, Pappschale.", ingredients: { synthmeat: 0.8, spices: 0.5 }, basePrice: 7, appeal: 70, complexity: 15, prepLoad: 0.5 },
  falafel_wrap: { id: "falafel_wrap", name: "Falafel-Wrap", description: "Kichererbsen, Tahini, viel Gr\xFCn.", ingredients: { vegetables: 1.2, noodles: 0.4, spices: 0.4 }, basePrice: 9, appeal: 64, complexity: 30, prepLoad: 0.6 },
  vegan_bowl: { id: "vegan_bowl", name: "Vegan Bowl", description: "Getreide, Gem\xFCse, fermentierte Saucen.", ingredients: { vegetables: 1.6, noodles: 0.5, spices: 0.5 }, basePrice: 16, appeal: 66, complexity: 40, prepLoad: 0.9 },
  pizza: { id: "pizza", name: "Pizza", description: "Steinofen, d\xFCnner Boden, Synth-Salami.", ingredients: { noodles: 1, vegetables: 0.6, synthmeat: 0.4, spices: 0.3 }, basePrice: 13, appeal: 76, complexity: 35, prepLoad: 0.9 },
  synth_coffee: { id: "synth_coffee", name: "Synth-Kaffee", description: "Ger\xF6stet im Fermenter, serviert wie echter.", ingredients: { drinks: 0.6, spices: 0.1 }, basePrice: 5, appeal: 58, complexity: 20, prepLoad: 0.3 },
  pastry: { id: "pastry", name: "Geb\xE4ck", description: "Croissant, Zimtschnecke, Protein-Donut.", ingredients: { noodles: 0.5, spices: 0.2 }, basePrice: 4, appeal: 52, complexity: 25, prepLoad: 0.4 },
  cake: { id: "cake", name: "Kuchen", description: "Ein St\xFCck Nachmittag.", ingredients: { noodles: 0.6, vegetables: 0.2, spices: 0.3, drinks: 0.2 }, basePrice: 7, appeal: 60, complexity: 35, prepLoad: 0.5 },
  cocktail: { id: "cocktail", name: "Cocktail", description: "Synth-Gin, Tonic, Neon-Eis.", ingredients: { drinks: 1.2, spices: 0.2 }, basePrice: 12, appeal: 66, complexity: 30, prepLoad: 0.4 },
  bar_snacks: { id: "bar_snacks", name: "Bar-Snacks", description: "N\xFCsse, Chips, Wings.", ingredients: { synthmeat: 0.4, spices: 0.3, vegetables: 0.2 }, basePrice: 6, appeal: 48, complexity: 15, prepLoad: 0.3 },
  signature_cocktail: { id: "signature_cocktail", name: "Signature-Cocktail", description: "Die Kreation des Hauses, mit Show.", ingredients: { drinks: 1.6, spices: 0.4, vegetables: 0.2 }, basePrice: 22, appeal: 76, complexity: 55, prepLoad: 0.6 },
  shoyu_ramen: {
    id: "shoyu_ramen",
    name: "Shoyu-Ramen",
    description: "Der Klassiker: klare Sojabr\xFChe, Nudeln, Synth-Chashu.",
    ingredients: { noodles: 1, broth: 1, synthmeat: 1, vegetables: 0.5, spices: 0.2 },
    basePrice: 18,
    appeal: 70,
    complexity: 45,
    prepLoad: 1
  },
  miso_ramen: {
    id: "miso_ramen",
    name: "Miso-Ramen",
    description: "Kr\xE4ftige Misobr\xFChe, viel Gem\xFCse, etwas sch\xE4rfer.",
    ingredients: { noodles: 1, broth: 1, vegetables: 1, spices: 0.4 },
    basePrice: 16,
    appeal: 62,
    complexity: 40,
    prepLoad: 1
  },
  veggie_ramen: {
    id: "veggie_ramen",
    name: "Gem\xFCse-Ramen",
    description: "G\xFCnstig und beliebt bei Pendlern aus der Old City.",
    ingredients: { noodles: 1, broth: 0.8, vegetables: 1.2, spices: 0.2 },
    basePrice: 13,
    appeal: 50,
    complexity: 25,
    prepLoad: 0.8
  },
  spicy_synth_ramen: {
    id: "spicy_synth_ramen",
    name: "Spicy Synth-Ramen",
    description: "Doppelt Fleisch, Chili-\xD6l, Signature-Gericht f\xFCr Nachtschw\xE4rmer.",
    ingredients: { noodles: 1.2, broth: 1, synthmeat: 1.6, vegetables: 0.4, spices: 0.8 },
    basePrice: 26,
    appeal: 80,
    complexity: 70,
    prepLoad: 1.4
  },
  gyoza: {
    id: "gyoza",
    name: "Gyoza",
    description: "Gebratene Teigtaschen als Beilage.",
    ingredients: { noodles: 0.4, synthmeat: 0.5, vegetables: 0.4, spices: 0.1 },
    basePrice: 9,
    appeal: 45,
    complexity: 35,
    prepLoad: 0.6
  },
  synth_beer: {
    id: "synth_beer",
    name: "Synth-Bier",
    description: "Kaltes Bier aus dem Fermenter. Hohe Marge.",
    ingredients: { drinks: 1 },
    basePrice: 6,
    appeal: 40,
    complexity: 0,
    prepLoad: 0.2
  },
  noodle_box: {
    id: "noodle_box",
    name: "Nudelbox",
    description: "Gebratene Nudeln zum Mitnehmen.",
    ingredients: { noodles: 1, vegetables: 0.6, spices: 0.3 },
    basePrice: 7,
    appeal: 55,
    complexity: 20,
    prepLoad: 0.7
  },
  synth_sushi: {
    id: "synth_sushi",
    name: "Synth-Sushi",
    description: "Laborprotein in Reisrollen. Nur mit Synth-K\xFCche (Forschung).",
    ingredients: { noodles: 0.3, synthmeat: 1, vegetables: 0.5, spices: 0.3 },
    basePrice: 24,
    appeal: 72,
    complexity: 55,
    prepLoad: 1.1
  },
  lab_steak: {
    id: "lab_steak",
    name: "Labor-Steak",
    description: "Gewachsenes Steak mit Chrome-Glasur. Nur mit Synth-K\xFCche (Forschung).",
    ingredients: { synthmeat: 2, vegetables: 0.6, spices: 0.5 },
    basePrice: 32,
    appeal: 85,
    complexity: 75,
    prepLoad: 1.5
  },
  synth_skewer: {
    id: "synth_skewer",
    name: "Synth-Spie\xDF",
    description: "Gegrillter Spie\xDF vom Stand, mit scharfer So\xDFe.",
    ingredients: { synthmeat: 0.8, spices: 0.3 },
    basePrice: 8,
    appeal: 60,
    complexity: 25,
    prepLoad: 0.6
  }
};

// src/sim/data/ingredients.ts
var INGREDIENTS = {
  noodles: { id: "noodles", name: "Nudeln", basePrice: 1.2, shelfLifeDays: 6, category: "food" },
  broth: { id: "broth", name: "Br\xFChe", basePrice: 1.6, shelfLifeDays: 3, category: "food" },
  vegetables: { id: "vegetables", name: "Gem\xFCse", basePrice: 1, shelfLifeDays: 2, category: "food" },
  synthmeat: { id: "synthmeat", name: "Synth-Fleisch", basePrice: 2.4, shelfLifeDays: 4, category: "food" },
  spices: { id: "spices", name: "Gew\xFCrze", basePrice: 0.6, shelfLifeDays: 30, category: "food" },
  drinks: { id: "drinks", name: "Getr\xE4nke", basePrice: 1.1, shelfLifeDays: 60, category: "food" },
  herbs: { id: "herbs", name: "Premium-Kr\xE4uter", basePrice: 3.2, shelfLifeDays: 3, category: "food", retailMarkup: 2.4 },
  snacks: { id: "snacks", name: "Snacks", basePrice: 1.4, shelfLifeDays: 20, category: "retail", retailMarkup: 2.2 },
  stims: { id: "stims", name: "Stims", basePrice: 3.5, shelfLifeDays: 90, category: "retail", retailMarkup: 2.6 },
  cyber_parts: { id: "cyber_parts", name: "Cyber-Ersatzteile", basePrice: 9, shelfLifeDays: 365, category: "retail", retailMarkup: 1.9 },
  meds: { id: "meds", name: "Medikamente", basePrice: 4.2, shelfLifeDays: 120, category: "retail", retailMarkup: 2 },
  protein_base: { id: "protein_base", name: "Proteinbasis", basePrice: 1.1, shelfLifeDays: 15, category: "raw" },
  grain: { id: "grain", name: "Synth-Getreide", basePrice: 0.5, shelfLifeDays: 60, category: "raw" },
  chemicals: { id: "chemicals", name: "Chemikalien", basePrice: 2, shelfLifeDays: 180, category: "raw" },
  electronics: { id: "electronics", name: "Elektronikmodule", basePrice: 6, shelfLifeDays: 365, category: "raw" }
};
var RAW_IDS = Object.values(INGREDIENTS).filter((i) => i.category === "raw").map((i) => i.id);
var INGREDIENT_IDS = Object.values(INGREDIENTS).filter((i) => i.category === "food").map((i) => i.id);
var RETAIL_GOOD_IDS = Object.values(INGREDIENTS).filter((i) => i.category === "retail" || i.id === "drinks").map((i) => i.id);
var CATALOGUE_IDS = Object.keys(INGREDIENTS);

// src/sim/data/crises.ts
var CRISES = {
  energy_shortage: { id: "energy_shortage", name: "Energieknappheit", description: "Das Netz rationiert Strom. Energieversorgung aller Bezirke \u221230, Baustellen langsamer, Fabriken drosseln.", days: [4, 8], chance: 0.012 },
  supply_chain: { id: "supply_chain", name: "Lieferkettenkrise", description: "H\xE4fen gesperrt: Einkaufspreise +50 %, Lieferungen doppelt so lang.", days: [5, 9], chance: 0.012 },
  recession: { id: "recession", name: "Rezession", description: "Kaufkraft \u221215 % in allen Bezirken, weniger G\xE4ste und Reisende.", days: [8, 14], chance: 8e-3 },
  property_bubble: { id: "property_bubble", name: "Immobilienblase", description: "Grundst\xFCckspreise +60 %. Am Ende platzt die Blase: \u221235 %.", days: [10, 16], chance: 6e-3 },
  labor_shortage: { id: "labor_shortage", name: "Arbeitskr\xE4ftemangel", description: "Weniger Bewerber, Lohnerwartungen +25 %.", days: [6, 10], chance: 0.01 },
  cyber_wave: { id: "cyber_wave", name: "Cyberangriffswelle", description: "Ungesicherte Betriebe verlieren jeden Tag mit 30 % Chance einen Tagesumsatz.", days: [3, 5], chance: 0.01 },
  general_strike: { id: "general_strike", name: "Generalstreik", description: "Stadtweiter Streik: Personal arbeitet mit halber Leistung.", days: [2, 3], chance: 6e-3 },
  hyperinflation: { id: "hyperinflation", name: "Hyperinflation", description: "Alle Einkaufspreise und Lohnerwartungen +35 %.", days: [6, 10], chance: 5e-3 },
  financial_scandal: { id: "financial_scandal", name: "Finanzskandal", description: "Banken verdoppeln Zinsen, Investoren ziehen 20 % ihres Kapitals ab.", days: [5, 8], chance: 6e-3 },
  // Regional events
  village_fair: { id: "village_fair", name: "Dorffest in Greenhaven", description: "Wochenmarkt und Fest: Betriebe in Greenhaven haben 40 % mehr Nachfrage.", days: [2, 3], chance: 0.02, region: "greenhaven" },
  harvest_failure: { id: "harvest_failure", name: "Ernteausfall", description: "Unwetter \xFCber den Feldern: Gem\xFCse, Kr\xE4uter und Getreide kosten 50 % mehr, H\xF6fe ernten weniger.", days: [4, 7], chance: 0.01, region: "greenhaven" },
  traffic_jam: { id: "traffic_jam", name: "Verkehrschaos in Silverbrook", description: "Baustellen auf allen Ausfallstra\xDFen: Taxis schaffen 30 % weniger Fahrten, L\xE4den 10 % weniger Kunden.", days: [2, 4], chance: 0.015, region: "silverbrook" },
  chain_competition: { id: "chain_competition", name: "Handelskette er\xF6ffnet", description: "Eine gro\xDFe Kette er\xF6ffnet in Silverbrook: Einzelhandel dort verliert 20 % Kunden.", days: [6, 10], chance: 8e-3, region: "silverbrook" },
  corp_scandal: { id: "corp_scandal", name: "Konzernskandal", description: "Entlassungswelle in Neon Central: Kaufkraft dort \u221212 %, Demonstrationen.", days: [5, 8], chance: 0.01, region: "neon_central" },
  megacity_blackout: { id: "megacity_blackout", name: "Megacity-Blackout", description: "Nova Eclipse ohne Strom: Energieversorgung dort \u221240, Flugtaxis bleiben am Boden.", days: [2, 4], chance: 0.01, region: "nova_eclipse" }
};
var CRISIS_IDS = Object.keys(CRISES);

// src/sim/data/suppliers.ts
var SUPPLIERS = {
  docks_wholesale: {
    id: "docks_wholesale",
    name: "Rust Docks Gro\xDFmarkt",
    description: "G\xFCnstig und in gro\xDFen Mengen, aber die Ware ist Durchschnitt und der Lieferwagen oft sp\xE4t.",
    priceFactor: 0.85,
    quality: 45,
    deliveryHours: 10,
    delayChance: 0.25,
    delayHours: 8,
    minOrder: 150,
    excludes: ["stims", "cyber_parts", "meds"]
  },
  market_runner: {
    id: "market_runner",
    name: "Neon Market Kurier",
    description: "Schnelle Lieferung aus den Markthallen zu fairen Preisen.",
    priceFactor: 1,
    quality: 60,
    deliveryHours: 4,
    delayChance: 0.08,
    delayHours: 3,
    minOrder: 60,
    excludes: ["electronics"]
  },
  chrome_fresh: {
    id: "chrome_fresh",
    name: "Chrome Fresh Logistics",
    description: "Laborfrische Premiumware mit K\xFChlkette. Teuer, zuverl\xE4ssig, exzellente Qualit\xE4t.",
    priceFactor: 1.45,
    quality: 88,
    deliveryHours: 6,
    delayChance: 0.02,
    delayHours: 2,
    minOrder: 200,
    excludes: ["snacks", "grain"]
  },
  undercity_dealer: {
    id: "undercity_dealer",
    name: "Undercity-H\xE4ndler",
    description: "Fragw\xFCrdige Herkunft, Spottpreise, schwankende Qualit\xE4t. Keine Getr\xE4nke.",
    priceFactor: 0.6,
    quality: 30,
    deliveryHours: 3,
    delayChance: 0.35,
    delayHours: 12,
    minOrder: 30,
    excludes: ["drinks", "meds", "protein_base", "grain"]
  }
};
var SUPPLIER_IDS = Object.keys(SUPPLIERS);

// src/sim/data/underworld.ts
var OPERATIONS = {
  show_presence: {
    id: "show_presence",
    name: "Pr\xE4senz zeigen",
    description: "Vollstrecker patrouillieren im Bezirk. Baut Gebietskontrolle auf, bringt kein Geld.",
    crew: { enforcer: 1, any: 1 },
    hours: 12,
    payout: 0,
    risk: 0.08,
    heat: 3,
    control: 12,
    minControl: 0,
    kind: "job"
  },
  smuggling_run: {
    id: "smuggling_run",
    name: "Schmuggel-Lauf",
    description: "Ware aus den Rust Docks in den Bezirk bringen. Fahrer und Muskeln n\xF6tig.",
    crew: { driver: 1, enforcer: 1 },
    hours: 8,
    payout: 2600,
    risk: 0.2,
    heat: 8,
    control: 3,
    minControl: 10,
    kind: "job"
  },
  data_heist: {
    id: "data_heist",
    name: "Datendiebstahl",
    description: "Ein Hacker zieht Konzern-Datens\xE4tze, ein Informant liefert den Zugang. Hoher Ertrag, hohes Risiko.",
    crew: { hacker: 1, informant: 1 },
    hours: 16,
    payout: 7500,
    risk: 0.3,
    heat: 14,
    control: 0,
    minControl: 0,
    kind: "job"
  },
  fencing: {
    id: "fencing",
    name: "Hehlerei",
    description: "Gestohlene Ware \xFCber einen Mittelsmann verkaufen. Braucht kaum Leute.",
    crew: { any: 1 },
    hours: 6,
    payout: 900,
    risk: 0.12,
    heat: 4,
    control: 1,
    minControl: 0,
    kind: "job"
  },
  protection: {
    id: "protection",
    name: "Schutzgeld",
    description: "Lokale im kontrollierten Gebiet zahlen t\xE4glich. Konkurrenz leidet, Polizei wird aufmerksam.",
    crew: { enforcer: 1 },
    hours: 24,
    payout: 0,
    risk: 0.05,
    heat: 2,
    control: 2,
    minControl: 30,
    kind: "standing"
  },
  black_market: {
    id: "black_market",
    name: "Schwarzmarkt",
    description: "Ein fester Umschlagplatz im Bezirk. T\xE4glicher Ertrag nach Kaufkraft und Kontrolle.",
    crew: { captain: 1, any: 2 },
    hours: 24,
    payout: 1400,
    risk: 0.1,
    heat: 5,
    control: 1,
    minControl: 40,
    kind: "standing"
  },
  casino: {
    id: "casino",
    name: "Illegales Casino",
    description: "Hinterzimmer-Casino in einer eigenen Gewerbeimmobilie des Bezirks. Hoher Ertrag, Razzia-Risiko.",
    crew: { accountant: 1, enforcer: 1 },
    hours: 24,
    payout: 2400,
    risk: 0.08,
    heat: 7,
    control: 0,
    minControl: 25,
    kind: "standing"
  }
};
var OPERATION_IDS = Object.keys(OPERATIONS);

// src/sim/data/production.ts
var PRODUCTION = {
  synthmeat_plant: { id: "synthmeat_plant", name: "Synth-Fleisch-Kultur", output: "synthmeat", inputs: { protein_base: 0.6, chemicals: 0.1 }, energyPerUnit: 0.5, laborPerUnit: 0.05, pollutionPer100: 0.6 },
  noodle_works: { id: "noodle_works", name: "Nudelwerk", output: "noodles", inputs: { grain: 0.7 }, energyPerUnit: 0.15, laborPerUnit: 0.03, pollutionPer100: 0.2 },
  broth_kettles: { id: "broth_kettles", name: "Br\xFChkessel", output: "broth", inputs: { protein_base: 0.2, grain: 0.2, chemicals: 0.05 }, energyPerUnit: 0.3, laborPerUnit: 0.04, pollutionPer100: 0.3 },
  fermenter: { id: "fermenter", name: "Getr\xE4nkefermenter", output: "drinks", inputs: { grain: 0.3, chemicals: 0.05 }, energyPerUnit: 0.2, laborPerUnit: 0.02, pollutionPer100: 0.2 },
  snack_line: { id: "snack_line", name: "Snack-Linie", output: "snacks", inputs: { grain: 0.4, chemicals: 0.1 }, energyPerUnit: 0.2, laborPerUnit: 0.03, pollutionPer100: 0.3 },
  stim_lab: { id: "stim_lab", name: "Stim-Synthese", output: "stims", inputs: { chemicals: 0.8 }, energyPerUnit: 0.6, laborPerUnit: 0.08, pollutionPer100: 1 },
  parts_assembly: { id: "parts_assembly", name: "Teilemontage", output: "cyber_parts", inputs: { electronics: 0.9, chemicals: 0.1 }, energyPerUnit: 0.9, laborPerUnit: 0.12, pollutionPer100: 0.8 },
  // Farms (Greenhaven): no raw inputs, labour and water instead.
  vegetable_field: { id: "vegetable_field", name: "Gem\xFCsefeld", output: "vegetables", inputs: {}, energyPerUnit: 0.02, laborPerUnit: 0.07, pollutionPer100: 0 },
  herb_garden: { id: "herb_garden", name: "Kr\xE4utergarten", output: "herbs", inputs: {}, energyPerUnit: 0.03, laborPerUnit: 0.16, pollutionPer100: 0 },
  grain_field: { id: "grain_field", name: "Getreidefeld", output: "grain", inputs: {}, energyPerUnit: 0.02, laborPerUnit: 0.04, pollutionPer100: 0 }
};
var PRODUCTION_IDS = Object.keys(PRODUCTION);

// src/persistence/serializer.ts
var SaveValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SaveValidationError";
  }
};
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNumberArray(v, length) {
  if (!Array.isArray(v)) return false;
  if (length !== void 0 && v.length !== length) return false;
  for (const n of v) if (typeof n !== "number" || !Number.isFinite(n)) return false;
  return true;
}
function expectNumber(obj, key, path) {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new SaveValidationError(`${path}.${key} fehlt oder ist keine Zahl.`);
  return v;
}
function expectString(obj, key, path) {
  const v = obj[key];
  if (typeof v !== "string") throw new SaveValidationError(`${path}.${key} fehlt oder ist kein Text.`);
  return v;
}
function validateSaveFile(parsed) {
  if (!isObject(parsed)) throw new SaveValidationError("Der Spielstand ist kein Objekt.");
  if (parsed.magic !== "NEON_DYNASTY_SAVE") throw new SaveValidationError("Das ist keine Neon-Dynasty-Speicherdatei.");
  const version = expectNumber(parsed, "version", "save");
  const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
  const name = typeof parsed.name === "string" ? parsed.name.slice(0, 60) : "Importiert";
  if (!isObject(parsed.state)) throw new SaveValidationError("save.state fehlt.");
  validateState(parsed.state, version);
  return { magic: "NEON_DYNASTY_SAVE", version, savedAt, name, state: parsed.state };
}
var MAX_CITY_SIZE = 256;
function validateState(s, version) {
  expectNumber(s, "seed", "state");
  expectNumber(s, "tick", "state");
  expectNumber(s, "speed", "state");
  expectNumber(s, "nextBuildingId", "state");
  if (!isObject(s.rng)) throw new SaveValidationError("state.rng fehlt.");
  expectNumber(s.rng, "seed", "state.rng");
  expectNumber(s.rng, "state", "state.rng");
  if (!isObject(s.grid)) throw new SaveValidationError("state.grid fehlt.");
  const width = expectNumber(s.grid, "width", "state.grid");
  const height = expectNumber(s.grid, "height", "state.grid");
  if (width < 8 || height < 8 || width > MAX_CITY_SIZE || height > MAX_CITY_SIZE || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new SaveValidationError("state.grid hat eine ung\xFCltige Gr\xF6\xDFe.");
  }
  const n = width * height;
  for (const key of ["kind", "district", "variant", "occupant"]) {
    if (!isNumberArray(s.grid[key], n)) throw new SaveValidationError(`state.grid.${key} ist ung\xFCltig.`);
  }
  if (!Array.isArray(s.districts) || s.districts.length === 0) throw new SaveValidationError("state.districts fehlt.");
  for (const [i, d] of s.districts.entries()) {
    if (!isObject(d)) throw new SaveValidationError(`state.districts[${i}] ist ung\xFCltig.`);
    expectNumber(d, "id", `state.districts[${i}]`);
    const archetype = expectString(d, "archetype", `state.districts[${i}]`);
    if (!(archetype in DISTRICT_ARCHETYPES)) throw new SaveValidationError(`Unbekannter Bezirkstyp: ${archetype}`);
    if (!isObject(d.stats)) throw new SaveValidationError(`state.districts[${i}].stats fehlt.`);
    for (const key of Object.keys(DISTRICT_ARCHETYPES.old_city.stats)) expectNumber(d.stats, key, `state.districts[${i}].stats`);
  }
  for (const d of s.grid.district) {
    if (d < 0 || d >= s.districts.length) throw new SaveValidationError("state.grid.district verweist auf unbekannten Bezirk.");
  }
  if (!isObject(s.buildings)) throw new SaveValidationError("state.buildings fehlt.");
  for (const [key, b] of Object.entries(s.buildings)) {
    if (!isObject(b)) throw new SaveValidationError(`state.buildings[${key}] ist ung\xFCltig.`);
    const path = `state.buildings[${key}]`;
    const id = expectNumber(b, "id", path);
    if (String(id) !== key) throw new SaveValidationError(`${path}.id passt nicht zum Schl\xFCssel.`);
    expectString(b, "defId", path);
    expectString(b, "label", path);
    if (typeof b.owner !== "string" || b.owner.length === 0 || version < 12 && b.owner !== "player" && b.owner !== "city") throw new SaveValidationError(`${path}.owner ist ung\xFCltig.`);
    const x = expectNumber(b, "x", path);
    const y = expectNumber(b, "y", path);
    const w = expectNumber(b, "w", path);
    const h = expectNumber(b, "h", path);
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new SaveValidationError(`${path} liegt au\xDFerhalb der Karte.`);
    expectNumber(b, "districtId", path);
    if (b.status !== "construction" && b.status !== "operational") throw new SaveValidationError(`${path}.status ist ung\xFCltig.`);
    expectNumber(b, "progress", path);
    expectNumber(b, "buildTime", path);
    expectNumber(b, "investment", path);
    if (b.business !== void 0) {
      if (!isObject(b.business)) throw new SaveValidationError(`${path}.business ist ung\xFCltig.`);
      const kind = b.business.kind;
      if (kind === "gastronomy") {
        if (version >= 2) validateGastronomyV2(b.business, `${path}.business`);
        else {
          for (const k of ["price", "quality", "reputation", "staff", "lifetimeGuests", "lifetimeRevenue"]) expectNumber(b.business, k, `${path}.business`);
        }
      } else if (kind === "hotel") {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ["pricePerNight", "cleanliness", "reputation", "rating", "reviewCount", "lifetimeGuests", "lifetimeRevenue"]) expectNumber(b.business, k, `${path}.business`);
        if (!Array.isArray(b.business.stays)) throw new SaveValidationError(`${path}.business.stays fehlt.`);
      } else if (kind === "transport") {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ["fare", "reputation", "lifetimeRides", "lifetimeRevenue"]) expectNumber(b.business, k, `${path}.business`);
        if (!Array.isArray(b.business.vehicles)) throw new SaveValidationError(`${path}.business.vehicles fehlt.`);
      } else if (kind === "lab") {
        validateStaffed(b.business, `${path}.business`);
        expectNumber(b.business, "progress", `${path}.business`);
      } else if (kind === "industry") {
        validateStaffed(b.business, `${path}.business`);
        if (!Array.isArray(b.business.lines) || !Array.isArray(b.business.inventory) || !Array.isArray(b.business.orders)) throw new SaveValidationError(`${path}.business: Fabrik unvollst\xE4ndig.`);
      } else if (kind === "security") {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ["reputation", "lifetimeRevenue"]) expectNumber(b.business, k, `${path}.business`);
        if (!isObject(b.business.patrols)) throw new SaveValidationError(`${path}.business.patrols fehlt.`);
      } else if (kind === "retail") {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ["reputation", "lifetimeCustomers", "lifetimeRevenue", "todayPurchases"]) expectNumber(b.business, k, `${path}.business`);
        if (!isObject(b.business.prices) || !Array.isArray(b.business.inventory) || !Array.isArray(b.business.orders)) throw new SaveValidationError(`${path}.business: Laden unvollst\xE4ndig.`);
      } else if (kind === "bank") {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ["reserve", "deposits", "loansOut", "depositRate", "loanRate", "reputation"]) expectNumber(b.business, k, `${path}.business`);
      } else {
        throw new SaveValidationError(`${path}.business.kind ist unbekannt.`);
      }
      if (!Array.isArray(b.business.history)) throw new SaveValidationError(`${path}.business.history fehlt.`);
    }
    if (b.property !== void 0) {
      if (!isObject(b.property)) throw new SaveValidationError(`${path}.property ist ung\xFCltig.`);
      for (const k of ["purchasePrice", "rentLevel", "condition", "renovationUntilTick", "lifetimeRent"]) expectNumber(b.property, k, `${path}.property`);
    }
  }
  const slices = [];
  if (version >= 12) {
    if (!isObject(s.players)) throw new SaveValidationError("state.players fehlt.");
    if (!Array.isArray(s.playerOrder)) throw new SaveValidationError("state.playerOrder fehlt.");
    for (const id of s.playerOrder) {
      if (typeof id !== "string" || !isObject(s.players[id])) throw new SaveValidationError(`state.players[${String(id)}] fehlt.`);
      slices.push([`state.players.${id}`, s.players[id]]);
    }
    for (const b of Object.values(s.buildings)) {
      if (b.owner !== "city" && !isObject(s.players[b.owner])) throw new SaveValidationError(`Geb\xE4ude ${String(b.id)} geh\xF6rt einem unbekannten Spieler.`);
    }
  } else {
    slices.push(["state", s]);
  }
  for (const [path, slice] of slices) {
    validatePlayerSlice(slice, path, version);
  }
  if (version < 12) {
    if (!Array.isArray(s.log)) throw new SaveValidationError("state.log fehlt.");
    expectNumber(s, "nextLogId", "state");
    if (!Array.isArray(s.tasks)) throw new SaveValidationError("state.tasks fehlt.");
    if (!Array.isArray(s.undoStack)) throw new SaveValidationError("state.undoStack fehlt.");
  }
  if (!isObject(s.meta)) throw new SaveValidationError("state.meta fehlt.");
  if (version >= 3) {
    if (!isObject(s.population) || !Array.isArray(s.population.citizens)) throw new SaveValidationError("state.population fehlt.");
    for (const [i, c] of s.population.citizens.entries()) {
      if (!isObject(c)) throw new SaveValidationError(`state.population.citizens[${i}] ist ung\xFCltig.`);
      expectNumber(c, "id", `citizens[${i}]`);
      expectNumber(c, "districtId", `citizens[${i}]`);
      expectNumber(c, "homeBuildingId", `citizens[${i}]`);
      expectNumber(c, "wealth", `citizens[${i}]`);
      if (!Array.isArray(c.favorites)) throw new SaveValidationError(`citizens[${i}].favorites fehlt.`);
    }
    if (!isObject(s.competitors)) throw new SaveValidationError("state.competitors fehlt.");
    for (const [key, c] of Object.entries(s.competitors)) {
      if (!isObject(c)) throw new SaveValidationError(`state.competitors[${key}] ist ung\xFCltig.`);
      expectNumber(c, "buildingId", `competitors[${key}]`);
      expectNumber(c, "priceLevel", `competitors[${key}]`);
      expectNumber(c, "reputation", `competitors[${key}]`);
      expectNumber(c, "cash", `competitors[${key}]`);
    }
    if (!isObject(s.market) || !isObject(s.market.index)) throw new SaveValidationError("state.market fehlt.");
    expectNumber(s, "lastCompetitorExpansionDay", "state");
    if (version >= 5 && version < 12) {
      if (!isObject(s.underworld)) throw new SaveValidationError("state.underworld fehlt.");
      const uw = s.underworld;
      expectNumber(uw, "heat", "state.underworld");
      if (!Array.isArray(uw.rivals)) throw new SaveValidationError("state.underworld.rivals fehlt.");
      if (uw.org !== null) {
        if (!isObject(uw.org)) throw new SaveValidationError("state.underworld.org ist ung\xFCltig.");
        expectString(uw.org, "name", "state.underworld.org");
        for (const k of ["members", "candidates", "operations"]) if (!Array.isArray(uw.org[k])) throw new SaveValidationError(`state.underworld.org.${k} fehlt.`);
        if (!isObject(uw.org.control)) throw new SaveValidationError("state.underworld.org.control fehlt.");
      }
      expectNumber(s.ledger, "dirtyBalance", "state.ledger");
    }
    if (version >= 12) {
      if (!Array.isArray(s.rivals)) throw new SaveValidationError("state.rivals fehlt.");
      if (!Array.isArray(s.factions)) throw new SaveValidationError("state.factions fehlt.");
      if (!isObject(s.politics) || !isObject(s.politics.laws) || !isObject(s.politics.council)) throw new SaveValidationError("state.politics fehlt.");
    }
    if (version >= 6 && version < 12) {
      if (!Array.isArray(s.factions)) throw new SaveValidationError("state.factions fehlt.");
      if (!isObject(s.politics) || !isObject(s.politics.laws) || !isObject(s.politics.council)) throw new SaveValidationError("state.politics fehlt.");
      expectNumber(s.politics, "influence", "state.politics");
      if (!isObject(s.decisions) || !Array.isArray(s.decisions.pending)) throw new SaveValidationError("state.decisions fehlt.");
    }
    if (version >= 7 && version < 12) {
      if (!isObject(s.corporate) || !Array.isArray(s.corporate.loans)) throw new SaveValidationError("state.corporate fehlt.");
      expectNumber(s.corporate, "sharesSold", "state.corporate");
      if (!isObject(s.research) || !Array.isArray(s.research.unlocked)) throw new SaveValidationError("state.research fehlt.");
    }
    if (version >= 7 && !isObject(s.crisis)) throw new SaveValidationError("state.crisis fehlt.");
    if (version >= 8) {
      if (!isObject(s.weather) || typeof s.weather.kind !== "string") throw new SaveValidationError("state.weather fehlt.");
    }
    for (const [i, d] of s.districts.entries()) {
      if (!isObject(d.economy)) throw new SaveValidationError(`state.districts[${i}].economy fehlt.`);
    }
  }
}
var GASTRONOMY_NUMBERS = [
  "reputation",
  "quality",
  "hygiene",
  "rating",
  "reviewCount",
  "nextEntityId",
  "todayGuests",
  "todayRevenue",
  "todayCogs",
  "todayCosts",
  "todayPurchases",
  "todayTurnedAway",
  "todayLostNoIngredients",
  "todayWasteUnits",
  "todaySatisfactionSum",
  "todaySatisfactionCount",
  "todayQualitySum",
  "lifetimeGuests",
  "lifetimeRevenue"
];
function validateStaffed(biz, path) {
  for (const k of ["employees", "candidates"]) if (!Array.isArray(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  if (!isObject(biz.upgrades)) throw new SaveValidationError(`${path}.upgrades fehlt.`);
  expectNumber(biz, "nextEntityId", path);
  for (const [i, e] of biz.employees.entries()) {
    if (!isObject(e)) throw new SaveValidationError(`${path}.employees[${i}] ist ung\xFCltig.`);
    expectNumber(e, "id", `${path}.employees[${i}]`);
    expectString(e, "role", `${path}.employees[${i}]`);
    for (const k of ["skill", "wage", "morale"]) expectNumber(e, k, `${path}.employees[${i}]`);
  }
}
function validateGastronomyV2(biz, path) {
  for (const k of GASTRONOMY_NUMBERS) expectNumber(biz, k, path);
  for (const k of ["menu", "inventory", "orders", "employees", "candidates"]) {
    if (!Array.isArray(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  }
  for (const k of ["upgrades", "reorderTargets", "todayConsumed"]) {
    if (!isObject(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  }
  if (typeof biz.autoReorder !== "boolean") throw new SaveValidationError(`${path}.autoReorder fehlt.`);
  const supplier = expectString(biz, "preferredSupplierId", path);
  if (!(supplier in SUPPLIERS)) throw new SaveValidationError(`${path}: unbekannter Lieferant ${supplier}.`);
  for (const [i, m] of biz.menu.entries()) {
    if (!isObject(m)) throw new SaveValidationError(`${path}.menu[${i}] ist ung\xFCltig.`);
    const recipeId = expectString(m, "recipeId", `${path}.menu[${i}]`);
    if (!(recipeId in RECIPES)) throw new SaveValidationError(`${path}.menu[${i}]: unbekanntes Rezept ${recipeId}.`);
    expectNumber(m, "price", `${path}.menu[${i}]`);
  }
  for (const [i, e] of biz.employees.entries()) {
    if (!isObject(e)) throw new SaveValidationError(`${path}.employees[${i}] ist ung\xFCltig.`);
    expectNumber(e, "id", `${path}.employees[${i}]`);
    expectString(e, "name", `${path}.employees[${i}]`);
    if (typeof e.role !== "string") throw new SaveValidationError(`${path}.employees[${i}].role ist ung\xFCltig.`);
    for (const k of ["skill", "wage", "morale"]) expectNumber(e, k, `${path}.employees[${i}]`);
  }
  for (const [i, l] of biz.inventory.entries()) {
    if (!isObject(l)) throw new SaveValidationError(`${path}.inventory[${i}] ist ung\xFCltig.`);
    expectString(l, "ingredientId", `${path}.inventory[${i}]`);
    for (const k of ["units", "boughtDay", "quality", "unitCost"]) expectNumber(l, k, `${path}.inventory[${i}]`);
  }
  if (biz.upgradeInProgress !== null && biz.upgradeInProgress !== void 0 && !isObject(biz.upgradeInProgress)) {
    throw new SaveValidationError(`${path}.upgradeInProgress ist ung\xFCltig.`);
  }
}
function validatePlayerSlice(slice, path, version) {
  if (!isObject(slice.ledger)) throw new SaveValidationError(`${path}.ledger fehlt.`);
  expectNumber(slice.ledger, "balance", `${path}.ledger`);
  if (!Array.isArray(slice.ledger.transactions)) throw new SaveValidationError(`${path}.ledger.transactions fehlt.`);
  if (!Array.isArray(slice.ledger.balanceHistory)) throw new SaveValidationError(`${path}.ledger.balanceHistory fehlt.`);
  for (const key of ["todayIncome", "todayExpenses", "yesterdayIncome", "yesterdayExpenses", "daysInDebt"]) expectNumber(slice.ledger, key, `${path}.ledger`);
  if (!isObject(slice.player)) throw new SaveValidationError(`${path}.player fehlt.`);
  expectString(slice.player, "name", `${path}.player`);
  const difficulty = expectString(slice.player, "difficulty", `${path}.player`);
  if (!(difficulty in DIFFICULTIES)) throw new SaveValidationError(`Unbekannter Schwierigkeitsgrad: ${difficulty}`);
  const background = expectString(slice.player, "background", `${path}.player`);
  if (!(background in BACKGROUNDS)) throw new SaveValidationError(`Unbekannter Hintergrund: ${background}`);
  expectNumber(slice.player, "apartmentRent", `${path}.player`);
  expectNumber(slice.player, "homeDistrictId", `${path}.player`);
  expectNumber(slice.player, "reputation", `${path}.player`);
  if (version >= 12) {
    expectString(slice, "id", path);
    if (!Array.isArray(slice.log) || !Array.isArray(slice.tasks) || !Array.isArray(slice.undoStack)) throw new SaveValidationError(`${path}: Protokoll, Aufgaben oder R\xFCckg\xE4ngig-Stapel fehlen.`);
    if (!isObject(slice.underworld) || !isObject(slice.factions) || !isObject(slice.politics)) throw new SaveValidationError(`${path}: Unterwelt, Fraktionen oder Politik fehlen.`);
    expectNumber(slice.underworld, "heat", `${path}.underworld`);
    expectNumber(slice.politics, "influence", `${path}.politics`);
    if (!isObject(slice.decisions) || !isObject(slice.corporate) || !isObject(slice.research)) throw new SaveValidationError(`${path}: Entscheidungen, Konzern oder Forschung fehlen.`);
    expectNumber(slice.ledger, "dirtyBalance", `${path}.ledger`);
  }
  if (version >= 13) {
    if (!isObject(slice.casino) || !isObject(slice.casino.stats) || !Array.isArray(slice.casino.history)) throw new SaveValidationError(`${path}.casino fehlt.`);
  }
  if (version >= 14) {
    const p = slice.progression;
    if (!isObject(p) || !Array.isArray(p.unlockedRegions) || !Array.isArray(p.milestones)) throw new SaveValidationError(`${path}.progression fehlt.`);
    expectNumber(p, "level", `${path}.progression`);
    expectNumber(p, "xp", `${path}.progression`);
  }
}

// src/net/cloudProtocol.ts
var CLOUD_MAX_BYTES = 8 * 1024 * 1024;

// server/cloud.ts
var TOKEN_DAYS = 90;
var NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;
var MIN_PASSWORD = 6;
var CloudService = class {
  store;
  secret;
  constructor(store, secret) {
    if (!secret || secret.length < 16) throw new Error("CLOUD_SECRET muss mindestens 16 Zeichen haben.");
    this.store = store;
    this.secret = secret;
  }
  /** Users are addressed by a keyed hash of the lower-cased name (no name list needed). */
  userKey(name) {
    return createHmac("sha256", this.secret).update(`user:${name.trim().toLowerCase()}`).digest("hex");
  }
  async register(name, password) {
    const trimmed = name.trim();
    if (!NAME_RE.test(trimmed)) return { ok: false, status: 400, error: "Der Name braucht 2 bis 24 Zeichen (Buchstaben, Ziffern, Leerzeichen, _ . -)." };
    if (password.length < MIN_PASSWORD) return { ok: false, status: 400, error: `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.` };
    const key = this.userKey(trimmed);
    if (await this.store.readUser(key)) return { ok: false, status: 400, error: "Dieser Name ist bereits vergeben. Melde dich an." };
    const salt = randomBytes(16).toString("hex");
    const user = { id: randomBytes(12).toString("hex"), name: trimmed, salt, hash: scryptSync(password, salt, 32).toString("hex"), createdAt: Date.now() };
    await this.store.writeUser(key, user);
    return { ok: true, value: this.issue(user) };
  }
  passwordMatches(user, password) {
    const hash = scryptSync(password, user.salt, 32);
    const stored = Buffer.from(user.hash, "hex");
    return hash.length === stored.length && timingSafeEqual(hash, stored);
  }
  async login(name, password) {
    const user = await this.store.readUser(this.userKey(name));
    if (!user || !this.passwordMatches(user, password)) return { ok: false, status: 401, error: "Unbekannter Name oder falsches Passwort." };
    return { ok: true, value: this.issue(user) };
  }
  /** Token = userId.expiry.name.epoch.signature; the signature is checked without any session storage. */
  issue(user) {
    const expiresAt = Date.now() + TOKEN_DAYS * 864e5;
    const payload = `${user.id}.${expiresAt}.${encodeURIComponent(user.name)}.${user.tokenEpoch ?? 0}`;
    const signature = createHmac("sha256", this.secret).update(payload).digest("hex");
    return { token: `${payload}.${signature}`, name: user.name, expiresAt };
  }
  /** Checks signature and expiry only (no storage access). */
  verify(token) {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 5) return null;
    const [userId, expiry, encodedName, epoch, signature] = parts;
    const payload = `${userId}.${expiry}.${encodedName}.${epoch}`;
    const expected = createHmac("sha256", this.secret).update(payload).digest("hex");
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    if (Number(expiry) < Date.now()) return null;
    return { userId, name: decodeURIComponent(encodedName), epoch: Number(epoch), expiresAt: Number(expiry) };
  }
  /**
   * Full check for authenticated requests: signature, expiry and the user's
   * current token epoch, so a password change signs every other device out.
   */
  async authenticate(token) {
    const claim = this.verify(token);
    if (!claim) return null;
    const user = await this.store.readUser(this.userKey(claim.name));
    if (!user || user.id !== claim.userId || (user.tokenEpoch ?? 0) !== claim.epoch) return null;
    return { user, expiresAt: claim.expiresAt };
  }
  account(user, expiresAt) {
    return { name: user.name, createdAt: user.createdAt, passwordChangedAt: user.passwordChangedAt ?? null, expiresAt };
  }
  /** Sets a new password after checking the current one; returns a fresh token (all older tokens expire). */
  async changePassword(user, current, next) {
    if (!this.passwordMatches(user, current)) return { ok: false, status: 401, error: "Das aktuelle Passwort ist falsch." };
    if (next.length < MIN_PASSWORD) return { ok: false, status: 400, error: `Das neue Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.` };
    if (next === current) return { ok: false, status: 400, error: "Das neue Passwort ist dasselbe wie das alte." };
    const salt = randomBytes(16).toString("hex");
    const updated = { ...user, salt, hash: scryptSync(next, salt, 32).toString("hex"), tokenEpoch: (user.tokenEpoch ?? 0) + 1, passwordChangedAt: Date.now() };
    await this.store.writeUser(this.userKey(user.name), updated);
    return { ok: true, value: this.issue(updated) };
  }
  async deleteSave(userId) {
    await this.store.deleteSave(userId);
  }
  /** Deletes the save and the account after checking the password. */
  async deleteAccount(user, password) {
    if (!this.passwordMatches(user, password)) return { ok: false, status: 401, error: "Das Passwort ist falsch." };
    await this.store.deleteSave(user.id);
    await this.store.deleteUser(this.userKey(user.name));
    return { ok: true, value: true };
  }
  async meta(userId) {
    const record = await this.store.readSave(userId);
    return record?.meta ?? null;
  }
  async load(userId) {
    return this.store.readSave(userId);
  }
  /** Validates the uploaded save before storing it; returns the stored meta. */
  async save(userId, data, name, device) {
    if (typeof data !== "string" || data.length === 0) return { ok: false, status: 400, error: "Kein Spielstand \xFCbermittelt." };
    const bytes = Buffer.byteLength(data, "utf8");
    if (bytes > CLOUD_MAX_BYTES) return { ok: false, status: 413, error: `Der Spielstand ist zu gro\xDF (${Math.round(bytes / 1024)} KB, erlaubt ${Math.round(CLOUD_MAX_BYTES / 1024)} KB).` };
    let file;
    try {
      file = validateSaveFile(JSON.parse(data));
    } catch (err) {
      return { ok: false, status: 400, error: `Der Spielstand ist ung\xFCltig: ${err.message}` };
    }
    const state = file.state;
    const first = state.playerOrder?.[0];
    const slice = first ? state.players?.[first] : void 0;
    const meta = {
      savedAt: Date.now(),
      tick: state.tick,
      name: String(name ?? file.name).slice(0, 60),
      device: String(device ?? "Unbekannt").slice(0, 40),
      version: file.version,
      playerName: slice?.player.name ?? state.player?.name ?? "Unbekannt",
      balance: slice?.ledger.balance ?? state.ledger?.balance ?? 0,
      bytes
    };
    await this.store.writeSave(userId, { meta, data });
    return { ok: true, value: meta };
  }
};
async function handleCloudRequest(service2, action, method, authorization, body) {
  const json = (status, value) => ({ status, body: value });
  const input = body ?? {};
  if (action === "register" && method === "POST") {
    const r = await service2.register(String(input.name ?? ""), String(input.password ?? ""));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  if (action === "login" && method === "POST") {
    const r = await service2.login(String(input.name ?? ""), String(input.password ?? ""));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  const auth = await service2.authenticate(authorization?.replace(/^Bearer\s+/i, ""));
  if (!auth) return json(401, { error: "Nicht angemeldet oder Anmeldung abgelaufen. Bitte neu anmelden." });
  const userId = auth.user.id;
  if (action === "meta" && method === "GET") return json(200, { meta: await service2.meta(userId) });
  if (action === "account" && method === "GET") return json(200, { account: service2.account(auth.user, auth.expiresAt), meta: await service2.meta(userId) });
  if (action === "password" && method === "POST") {
    const r = await service2.changePassword(auth.user, String(input.current ?? ""), String(input.next ?? ""));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  if (action === "save" && method === "GET") {
    const record = await service2.load(userId);
    return record ? json(200, record) : json(404, { error: "Noch kein Cloud-Spielstand vorhanden." });
  }
  if (action === "save" && method === "PUT") {
    const r = await service2.save(userId, String(input.data ?? ""), String(input.name ?? ""), String(input.device ?? ""));
    return r.ok ? json(200, { meta: r.value }) : json(r.status, { error: r.error });
  }
  if (action === "save" && method === "DELETE") {
    await service2.deleteSave(userId);
    return json(200, { ok: true });
  }
  if (action === "account" && method === "DELETE") {
    const r = await service2.deleteAccount(auth.user, String(input.password ?? ""));
    return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.error });
  }
  return json(404, { error: "Unbekannter Cloud-Endpunkt." });
}

// server/blobStore.ts
var BlobCloudStore = class {
  api;
  access;
  /** Set once a call has succeeded in the current mode; no more fallbacks after that. */
  confirmed = false;
  log;
  constructor(api, access = "private", log = () => {
  }) {
    this.api = api;
    this.access = access;
    this.log = log;
  }
  get mode() {
    return this.access;
  }
  /** Runs `fn` in the current access mode; on failure in an unconfirmed mode, retries once in the other mode. */
  async withAccess(fn) {
    try {
      const result = await fn(this.access);
      this.confirmed = true;
      return result;
    } catch (err) {
      if (this.confirmed) throw err;
      const other = this.access === "private" ? "public" : "private";
      this.log(`Blob-Zugriff als ${this.access} fehlgeschlagen (${err.message}); versuche ${other}.`);
      const result = await fn(other);
      this.access = other;
      this.confirmed = true;
      return result;
    }
  }
  async readJson(pathname) {
    return this.withAccess(async (access) => {
      const result = await this.api.get(pathname, { access, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    });
  }
  writeJson(pathname, value) {
    return this.withAccess(async (access) => {
      await this.api.put(pathname, JSON.stringify(value), { access, addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
    });
  }
  async remove(pathname) {
    try {
      await this.api.del(pathname);
    } catch (err) {
      if (err.statusCode === 404) return;
      throw err;
    }
  }
  readUser(key) {
    return this.readJson(`cloud/users/${key}.json`);
  }
  writeUser(key, user) {
    return this.writeJson(`cloud/users/${key}.json`, user);
  }
  readSave(userId) {
    return this.readJson(`cloud/saves/${userId}.json`);
  }
  writeSave(userId, record) {
    return this.writeJson(`cloud/saves/${userId}.json`, record);
  }
  deleteUser(key) {
    return this.remove(`cloud/users/${key}.json`);
  }
  deleteSave(userId) {
    return this.remove(`cloud/saves/${userId}.json`);
  }
};

// server/vercelCloud.ts
var service = null;
function getService() {
  if (service) return service;
  const secret = process.env.CLOUD_SECRET;
  if (!secret || secret.length < 16) return { error: "Cloud-Spielst\xE4nde sind auf diesem Server nicht eingerichtet (CLOUD_SECRET fehlt oder ist k\xFCrzer als 16 Zeichen)." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: "Cloud-Spielst\xE4nde sind auf diesem Server nicht eingerichtet (Blob-Speicher nicht verbunden, BLOB_READ_WRITE_TOKEN fehlt)." };
  const access = process.env.BLOB_ACCESS === "public" ? "public" : "private";
  const store = new BlobCloudStore({ get, put, del }, access, (m) => console.warn(`[cloud] ${m}`));
  service = new CloudService(store, secret);
  return service;
}
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(request.url);
    const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const svc = getService();
    if ("error" in svc) return Response.json({ error: svc.error }, { status: 503, headers: CORS });
    let body = null;
    if (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        return Response.json({ error: "Ung\xFCltiges JSON." }, { status: 400, headers: CORS });
      }
    }
    const result = await handleCloudRequest(svc, action, request.method, request.headers.get("authorization"), body);
    return Response.json(result.body, { status: result.status, headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloud] Fehler:", err);
    return Response.json({ error: `Cloud-Server-Fehler: ${message}` }, { status: 500, headers: CORS });
  }
}
var GET = handler;
var POST = handler;
var PUT = handler;
var DELETE = handler;
var OPTIONS = handler;
export {
  DELETE,
  GET,
  OPTIONS,
  POST,
  PUT,
  handler
};
