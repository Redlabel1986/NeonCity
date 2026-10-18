/**
 * Interior scenes: a pure description of what the inside of a business looks
 * like right now, derived from the simulation state. No Pixi here, so the
 * layouts can be unit tested. The InteriorRenderer draws the result.
 *
 * Coordinates are room tiles (x to the right-down, y to the left-down on
 * screen, like the city). The two back walls run along x = 0 and y = 0.
 */

import type { Building, EmployeeRole, Facing, GameState, GastronomyState, HotelState, IndustryState, ResearchLabState, RetailState, SecurityState, TransportState, BankState } from '../../sim/state';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { INGREDIENTS } from '../../sim/data/ingredients';
import { RESEARCH } from '../../sim/data/research';
import { PRODUCTION } from '../../sim/data/production';
import { effectiveCapacity, isOpen } from '../../sim/systems/business';
import { stockOf, storageCapacity, totalUnits } from '../../sim/systems/inventory';
import { hotelRooms } from '../../sim/systems/hotel';
import { ROLE_LABELS } from '../../sim/systems/staff';
import { tickToDate } from '../../sim/core/clock';
import { cityInteriorScene } from './cityLayouts';

export type DashboardTab = 'overview' | 'menu' | 'supply' | 'staff' | 'upgrades' | 'evolution';

export type PropKind =
  | 'table'
  | 'barstool'
  | 'counter'
  | 'stove'
  | 'shelf'
  | 'coldcell'
  | 'neon'
  | 'hologram'
  | 'plant'
  | 'desk'
  | 'monitor'
  | 'roomdoor'
  | 'cart'
  | 'sofa'
  | 'vehicle'
  | 'lift'
  | 'charger'
  | 'machine'
  | 'pallet'
  | 'rack'
  | 'bench'
  | 'board'
  | 'locker'
  | 'sink'
  | 'filter'
  | 'mat'
  | 'awning'
  | 'sack'
  | 'espresso'
  | 'display'
  | 'oven'
  | 'meetingtable'
  | 'bed'
  | 'scanner'
  | 'lamp'
  | 'tv'
  | 'bathtub'
  | 'toilet'
  | 'mailbox'
  | 'washer'
  | 'pipes'
  | 'server'
  | 'console'
  | 'tank'
  | 'pump'
  | 'screenwall'
  | 'generator'
  | 'toolwall'
  | 'conveyor'
  | 'forklift'
  | 'labbench'
  | 'animal'
  | 'crate'
  | 'tractor'
  | 'bookshelf'
  | 'container'
  | 'press'
  | 'scale'
  | 'flowerstand'
  | 'bike'
  | 'lanes'
  | 'kiosk'
  | 'firetruck'
  | 'bunk'
  | 'fuelpump'
  | 'turnstile'
  | 'fence'
  | 'flag'
  | 'bars'
  | 'seats'
  | 'popcorn'
  | 'stage'
  | 'pedestal'
  | 'treadmill'
  | 'weights'
  | 'pitch'
  | 'goal'
  | 'tracks'
  | 'escalator'
  | 'shopfront'
  | 'crane'
  | 'hull'
  | 'welder'
  | 'pool'
  | 'plantbed'
  | 'cage'
  | 'vaultdoor'
  | 'shuttle'
  | 'turbine'
  | 'solarpanel'
  | 'tree'
  | 'swing'
  | 'barrel';

export type FloorPattern = 'planks' | 'tiles' | 'concrete' | 'carpet' | 'terrazzo' | 'metal' | 'asphalt' | 'grass' | 'soil' | 'straw' | 'rubber';

export type WallStyle = 'brick' | 'plaster' | 'glass' | 'metal' | 'wood';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** 0..1 fill level for shelves, pallets, progress displays. */
  fill?: number;
  /** Lit / running / occupied. */
  active?: boolean;
  color?: number;
  label?: string;
  /** Size in tiles for props that stretch (rows of seats, pitches, conveyors). */
  w?: number;
  h?: number;
}

export type FigureRole = EmployeeRole | 'guest' | 'vip' | 'customer' | 'resident';

export interface Figure {
  role: FigureRole;
  x: number;
  y: number;
  seated?: boolean;
  /** Wander radius in tiles (0 = stays at its station). */
  wander: number;
  name: string;
  morale?: number;
  /** Lying in bed (asleep). */
  lying?: boolean;
  /** Extra tooltip text, e.g. what the citizen is doing. */
  note?: string;
}

export interface Zone {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Dashboard tab a click opens (player businesses); without one a click shows `details`. */
  tab?: DashboardTab;
  color: number;
  /** Short live status shown under the label. */
  status: string;
  /** Lines for the detail card (city buildings). */
  details?: string[];
  /** False: label only, not clickable (catalogue zones marked non-interactive). */
  interactive?: boolean;
}

export interface InteriorScene {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  floorColor: number;
  wallColor: number;
  accent: number;
  facing: Facing;
  open: boolean;
  zones: Zone[];
  props: Prop[];
  figures: Figure[];
  /** Hygiene / cleanliness / condition 0..1 (floor dirt overlay). */
  cleanliness: number;
  floorPattern?: FloorPattern;
  wallStyle?: WallStyle;
  /** No walls (yards, squares, technical objects). */
  openAir?: boolean;
  /** Yellow-black safety markings along the floor edge. */
  hazard?: boolean;
  /** Region whose light mood the room uses. */
  lighting?: string;
}

const ACCENT = { gastronomy: 0xff2bd6, hotel: 0x19e6ff, transport: 0xffb020, retail: 0x8cff3a, security: 0xff3a5a, lab: 0x8cff3a, industry: 0xff8a1f, bank: 0xffb020 } as const;

function staffFigures(employees: { name: string; role: EmployeeRole; morale: number }[], role: EmployeeRole, spots: [number, number][], wander: number): Figure[] {
  const out: Figure[] = [];
  let i = 0;
  for (const e of employees) {
    if (e.role !== role) continue;
    const spot = spots[i % Math.max(1, spots.length)] ?? [1, 1];
    out.push({ role: e.role, x: spot[0] + Math.floor(i / Math.max(1, spots.length)) * 0.6, y: spot[1], wander, name: e.name, morale: e.morale });
    i++;
  }
  return out;
}

function base(b: Building, kind: keyof typeof ACCENT, width: number, height: number, subtitle: string, open: boolean, cleanliness: number): InteriorScene {
  return {
    width,
    height,
    title: b.label,
    subtitle,
    floorColor: 0x2a2634,
    wallColor: 0x3a3448,
    accent: ACCENT[kind],
    facing: b.facing,
    open,
    zones: [],
    props: [],
    figures: [],
    cleanliness,
  };
}

/**
 * Builds the scene for a player business, or for a city building with a
 * catalogued interior (pass the id of the sprite it shows); null otherwise.
 */
export function buildInteriorScene(b: Building, state: GameState, spriteId?: string | null): InteriorScene | null {
  const biz = b.business;
  if (!biz) return b.status === 'operational' ? cityInteriorScene(b, state, spriteId) : null;
  if (b.status !== 'operational') return null;
  switch (biz.kind) {
    case 'gastronomy':
      return gastronomyScene(b, biz, state);
    case 'hotel':
      return hotelScene(b, biz, state);
    case 'transport':
      return transportScene(b, biz);
    case 'retail':
      return retailScene(b, biz, state);
    case 'security':
      return securityScene(b, biz, state);
    case 'lab':
      return labScene(b, biz);
    case 'industry':
      return industryScene(b, biz, state);
    case 'bank':
      return bankScene(b, biz);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------- bank

function bankScene(b: Building, biz: BankState): InteriorScene {
  const W = 10;
  const H = 7;
  const ratio = biz.deposits > 0 ? biz.reserve / biz.deposits : 1;
  const s = base(b, 'bank', W, H, `${Math.round(biz.deposits).toLocaleString('de-DE')} ¢ Einlagen · ${Math.round(biz.loansOut).toLocaleString('de-DE')} ¢ Kredite`, true, 0.95);
  s.floorColor = 0x2a2a30;
  s.wallColor = 0x3a3842;
  // Counters for the bankers along the top wall
  const bankers = biz.employees.filter((e) => e.role === 'banker').length;
  for (let i = 0; i < Math.max(2, Math.min(5, bankers)); i++) s.props.push({ kind: 'counter', x: 1.5 + i * 1.6, y: 0.5, color: 0x4a3a20, active: i < bankers, label: i < bankers ? 'Schalter' : 'Schalter (unbesetzt)' });
  s.zones.push({ label: 'Schalterhalle', x: 0, y: 0, w: W, h: 2.4, tab: 'overview', color: 0xffb020, status: `${bankers} Schalter · Ruf ${Math.round(biz.reputation)}` });
  // Analysts' desks
  const analysts = biz.employees.filter((e) => e.role === 'analyst').length;
  for (let i = 0; i < Math.max(1, Math.min(4, analysts)); i++) s.props.push({ kind: 'desk', x: 1 + i * 1.4, y: 3.8, color: 0x2a2a38, active: i < analysts, label: i < analysts ? 'Kreditprüfung' : 'Kreditprüfung (frei)' });
  s.zones.push({ label: 'Kreditabteilung', x: 0, y: 2.6, w: 6.5, h: 2.6, tab: 'overview', color: 0x19e6ff, status: `${analysts} Analysten` });
  // Vault with the reserve
  s.props.push({ kind: 'locker', x: W - 1, y: 4, color: 0x8a8a9a, label: `Tresor: ${Math.round(biz.reserve).toLocaleString('de-DE')} ¢ Rücklage` });
  s.props.push({ kind: 'board', x: W - 3.2, y: 2.9, fill: Math.min(1, ratio / 0.5), active: !biz.supervised, color: biz.supervised ? 0xff3a5a : 0x8cff3a, label: biz.supervised ? 'Bankenaufsicht: Einlagenstopp' : `Rücklagenquote ${Math.round(ratio * 100)} %` });
  s.zones.push({ label: 'Tresorraum', x: 6.7, y: 2.6, w: W - 6.7, h: 2.6, tab: 'staff', color: 0x8a8a9a, status: `${Math.round(biz.reserve).toLocaleString('de-DE')} ¢` });
  if ((biz.upgrades.security ?? 0) > 0) s.props.push({ kind: 'monitor', x: W - 0.6, y: 0.3, active: true, color: 0xff3a5a, label: 'Sicherheitssystem' });
  if ((biz.upgrades.decor ?? 0) > 0) s.props.push({ kind: 'plant', x: 0.5, y: H - 0.6 });
  if ((biz.upgrades.staff_room ?? 0) > 0) s.props.push({ kind: 'locker', x: 0.5, y: 5.6, label: 'Personalraum' });
  s.props.push({ kind: 'mat', x: W - 0.5, y: H / 2, label: 'Eingang' });
  s.figures.push(...staffFigures(biz.employees, 'banker', [[1.5, 1.3], [3.1, 1.3], [4.7, 1.3], [6.3, 1.3], [7.9, 1.3]], 0.1));
  s.figures.push(...staffFigures(biz.employees, 'analyst', [[1, 4.6], [2.4, 4.6], [3.8, 4.6], [5.2, 4.6]], 0.2));
  s.figures.push(...staffFigures(biz.employees, 'security', [[W - 1.5, 1.2]], 0.3));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[7.5, 4.6]], 0.4));
  return s;
}

// ---------------------------------------------------------------- gastronomy

function gastronomyScene(b: Building, biz: GastronomyState, state: GameState): InteriorScene {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const cap = effectiveCapacity(b, state);
  const seats = cap?.seats ?? (model?.kind === 'gastronomy' ? model.seats : 8);
  const small = seats <= 6;
  const W = small ? 7 : 10;
  const H = small ? 6 : 8;
  const hour = tickToDate(state.tick).hour;
  const open = model?.kind === 'gastronomy' ? isOpen(model, hour, b) : true;
  const s = base(b, 'gastronomy', W, H, `${biz.hourGuests} Gäste gerade · ${biz.todayGuests} heute · Hygiene ${biz.hygiene} %`, open, biz.hygiene / 100);
  s.floorColor = 0x33283a;
  const up = biz.upgrades;
  // Kitchen in the back-left corner
  const stoves = 1 + (up.kitchen ?? 0);
  for (let i = 0; i < stoves; i++) s.props.push({ kind: 'stove', x: 0.5, y: 0.5 + i, active: open && biz.hourGuests > 0 });
  s.props.push({ kind: 'sink', x: 0.5, y: 0.5 + stoves });
  if ((up.hygiene_station ?? 0) > 0) s.props.push({ kind: 'sink', x: 1.5, y: 0.5 + stoves, active: true, color: 0x19e6ff, label: 'Hygienestation' });
  s.zones.push({ label: 'Küche', x: 0, y: 0, w: 2.2, h: stoves + 1.6, tab: 'menu', color: 0xff8a1f, status: `${stoves} Kochstationen · Qualität ${Math.round(biz.quality)}` });
  // Storage next to the kitchen
  const storeLevel = up.storage ?? 0;
  const fill = Math.min(1, totalUnits(biz) / Math.max(1, storageCapacity(b)));
  const shelves = 1 + storeLevel;
  const storeY0 = stoves + 2.2;
  for (let i = 0; i < shelves; i++) s.props.push({ kind: i === 0 && storeLevel > 0 ? 'coldcell' : 'shelf', x: 0.5, y: storeY0 + i * 0.9, fill });
  s.zones.push({ label: 'Lager', x: 0, y: storeY0 - 0.5, w: 1.6, h: shelves * 0.9 + 0.6, tab: 'supply', color: 0x19e6ff, status: `${Math.round(totalUnits(biz))} / ${storageCapacity(b)} Einheiten` });
  // Counter along the back-right wall
  const counterX0 = 2.8;
  for (let x = counterX0; x < W - 0.5; x += 1) s.props.push({ kind: 'counter', x: x + 0.5, y: 0.5, color: 0x4a2a30 });
  const stools = Math.min(Math.floor(W - counterX0 - 1), Math.max(2, Math.round(seats * 0.2)));
  for (let i = 0; i < stools; i++) s.props.push({ kind: 'barstool', x: counterX0 + 1 + i, y: 1.5 });
  s.zones.push({ label: 'Theke', x: counterX0, y: 0, w: W - counterX0, h: 2, tab: 'staff', color: 0xffb020, status: `${biz.employees.length} Mitarbeiter` });
  // Dining tables
  const tableSeats = Math.max(0, seats - stools);
  const tables = Math.ceil(tableSeats / 4);
  const tableSpots: [number, number][] = [];
  for (let ty = 3; ty < H - 0.5 && tableSpots.length < tables; ty += 2) {
    for (let tx = 2.5; tx < W - 0.5 && tableSpots.length < tables; tx += 2) tableSpots.push([tx + 0.5, ty + 0.5]);
  }
  for (const [tx, ty] of tableSpots) s.props.push({ kind: 'table', x: tx, y: ty });
  s.zones.push({ label: 'Gastraum', x: 2.2, y: 2.4, w: W - 2.2, h: H - 2.4, tab: 'overview', color: 0xff2bd6, status: `${seats} Plätze · ${biz.rating > 0 ? `${biz.rating.toFixed(1)} Sterne` : 'noch keine Bewertung'}` });
  // Decor
  const decor = up.decor ?? 0;
  for (let i = 0; i < decor; i++) s.props.push({ kind: 'neon', x: 3 + i * 2.5, y: 0, color: [0xff2bd6, 0x19e6ff, 0x8cff3a][i % 3]! });
  if (decor >= 2) s.props.push({ kind: 'hologram', x: W - 1.2, y: H - 1.2, active: true, color: 0xff2bd6 });
  if (decor >= 1) s.props.push({ kind: 'plant', x: W - 0.6, y: 2.4 });
  if ((up.staff_room ?? 0) > 0) s.props.push({ kind: 'locker', x: 0.5, y: H - 0.6, label: 'Personalraum' });
  s.props.push({ kind: 'mat', x: W - 0.5, y: H / 2, label: 'Eingang' });
  s.zones.push({ label: 'Ausbau', x: 0, y: H - 1.4, w: 2, h: 1.4, tab: 'upgrades', color: 0xc08aff, status: biz.upgradeInProgress ? 'Umbau läuft' : `${Object.values(up).reduce((a, v) => a + v, 0)} Stufen` });
  // Staff
  const cookSpots: [number, number][] = Array.from({ length: stoves }, (_, i) => [1.4, 0.5 + i]);
  s.figures.push(...staffFigures(biz.employees, 'cook', cookSpots, 0.15));
  s.figures.push(...staffFigures(biz.employees, 'service', [[counterX0 + 1.5, 2.6], [W - 2, 3.2], [4, H - 1.6]], 1.2));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[W - 1.5, 1.6]], 0.3));
  // Guests seated at tables, then at the counter
  let guests = Math.min(seats, biz.hourGuests);
  if (!open) guests = 0;
  const seatOffsets: [number, number][] = [
    [-0.55, 0],
    [0.55, 0],
    [0, -0.55],
    [0, 0.55],
  ];
  let n = 0;
  for (const [tx, ty] of tableSpots) {
    for (const [ox, oy] of seatOffsets) {
      if (n >= guests) break;
      s.figures.push({ role: 'guest', x: tx + ox, y: ty + oy, seated: true, wander: 0, name: `Gast ${n + 1}` });
      n++;
    }
  }
  for (let i = 0; i < stools && n < guests; i++, n++) s.figures.push({ role: 'guest', x: counterX0 + 1 + i, y: 1.5, seated: true, wander: 0, name: `Gast ${n + 1}` });
  return s;
}

// --------------------------------------------------------------------- hotel

function hotelScene(b: Building, biz: HotelState, state: GameState): InteriorScene {
  const rooms = hotelRooms(b);
  const occupied = biz.stays.length;
  const W = 12;
  const H = 8;
  const s = base(b, 'hotel', W, H, `${occupied} / ${rooms} Zimmer belegt · Sauberkeit ${Math.round(biz.cleanliness)} %`, true, biz.cleanliness / 100);
  s.floorColor = 0x26303a;
  const up = biz.upgrades;
  // Reception
  s.props.push({ kind: 'desk', x: 3.5, y: 1, color: 0x2a3a4a, label: 'Rezeption' });
  s.props.push({ kind: 'desk', x: 4.5, y: 1, color: 0x2a3a4a });
  s.props.push({ kind: 'monitor', x: 4, y: 0.5, active: true, color: 0x19e6ff });
  s.zones.push({ label: 'Rezeption', x: 2.6, y: 0, w: 3, h: 2.2, tab: 'overview', color: 0x19e6ff, status: `${biz.todayCheckIns} Check-ins heute · ${biz.pricePerNight} ¢ / Nacht` });
  // Lounge
  const lobby = up.lobby ?? 0;
  s.props.push({ kind: 'sofa', x: 7.5, y: 2.5 }, { kind: 'sofa', x: 7.5, y: 4 }, { kind: 'plant', x: 9.5, y: 2 });
  for (let i = 0; i < lobby; i++) s.props.push({ kind: 'plant', x: 6 + i * 1.5, y: 6.5 }, { kind: 'neon', x: 6 + i * 2.5, y: 0, color: 0x19e6ff });
  if (lobby >= 2) s.props.push({ kind: 'hologram', x: 10.5, y: 5.5, active: true, color: 0x19e6ff });
  s.zones.push({ label: 'Lobby', x: 6, y: 1.5, w: W - 6, h: H - 2, tab: 'upgrades', color: 0xc08aff, status: lobby > 0 ? `Lobby-Ausbau Stufe ${lobby}` : 'einfache Lobby' });
  // Room corridor along the back-left wall: doors show occupancy
  const shown = Math.min(rooms, 14);
  const perRow = 7;
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const occupiedRoom = i < Math.round((occupied / Math.max(1, rooms)) * shown);
    const vip = occupiedRoom && biz.stays[Math.min(biz.stays.length - 1, i)]?.vip;
    s.props.push({ kind: 'roomdoor', x: 0.5 + row * 1.2, y: 0.8 + col, active: occupiedRoom, color: vip ? 0xffb020 : 0x19e6ff });
  }
  s.zones.push({ label: 'Zimmerflur', x: 0, y: 0, w: 2.6, h: H, tab: 'overview', color: 0xffb020, status: `${occupied} belegt · ${biz.stays.filter((st) => st.vip).length} VIP` });
  if ((up.housekeeping_tech ?? 0) > 0) s.props.push({ kind: 'cart', x: 2.2, y: H - 1, active: true, color: 0x8cff3a, label: 'Reinigungsroboter' });
  if ((up.security ?? 0) > 0) s.props.push({ kind: 'monitor', x: 3, y: H - 0.6, active: true, color: 0xff3a5a, label: 'Überwachung' });
  s.props.push({ kind: 'mat', x: W - 0.5, y: 4, label: 'Eingang' });
  s.zones.push({ label: 'Personal', x: 2.6, y: 2.4, w: 3.2, h: H - 2.4, tab: 'staff', color: 0xff2bd6, status: `${biz.employees.length} Mitarbeiter` });
  s.figures.push(...staffFigures(biz.employees, 'reception', [[4, 1.9], [3, 1.9]], 0.2));
  s.figures.push(...staffFigures(biz.employees, 'housekeeping', [[2.2, 3], [2.2, 5.5], [2.2, 7]], 1.0));
  s.figures.push(...staffFigures(biz.employees, 'security', [[W - 1.3, 3.2]], 0.4));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[4.5, 3]], 0.5));
  const lobbyGuests = Math.min(6, occupied);
  for (let i = 0; i < lobbyGuests; i++) {
    const vip = biz.stays[i]?.vip ?? false;
    s.figures.push({ role: vip ? 'vip' : 'guest', x: 6.5 + (i % 3) * 1.4, y: 2.2 + Math.floor(i / 3) * 2.2, wander: 0.8, name: vip ? 'VIP-Gast' : `Gast ${i + 1}` });
  }
  void state;
  return s;
}

// ----------------------------------------------------------------- transport

function transportScene(b: Building, biz: TransportState): InteriorScene {
  const W = 12;
  const H = 8;
  const inShop = biz.vehicles.filter((v) => v.repairUntilTick > 0).length;
  const drivers = biz.employees.filter((e) => e.role === 'driver').length;
  const s = base(b, 'transport', W, H, `${biz.vehicles.length} Fahrzeuge · ${inShop} in der Werkstatt · ${biz.todayRides} Fahrten heute`, true, 0.8);
  s.floorColor = 0x2a2a2e;
  const up = biz.upgrades;
  // Parking bays along the back-right wall
  const bays = Math.max(biz.vehicles.length, 4);
  for (let i = 0; i < bays; i++) {
    const v = biz.vehicles[i];
    const x = 1 + i * 1.3;
    if (x > W - 1) break;
    if (!v) continue;
    const broken = v.repairUntilTick > 0;
    s.props.push({ kind: broken ? 'lift' : 'vehicle', x, y: 1.2, fill: v.condition / 100, active: !broken, color: broken ? 0xff3a5a : 0xffb020, label: `Fahrzeug ${v.id} · Zustand ${Math.round(v.condition)} %` });
  }
  s.zones.push({ label: 'Flotte', x: 0, y: 0, w: W, h: 2.6, tab: 'overview', color: 0xffb020, status: `${biz.vehicles.length} Fahrzeuge · Tarif ${biz.fare} ¢` });
  // Charging stations and workshop
  const charging = up.charging ?? 0;
  for (let i = 0; i < 1 + charging; i++) s.props.push({ kind: 'charger', x: 0.5, y: 3.2 + i, active: true, color: 0x8cff3a });
  const workshop = up.workshop ?? 0;
  for (let i = 0; i < workshop; i++) s.props.push({ kind: 'rack', x: 0.5, y: 5 + i * 0.9, fill: 0.7, color: 0x8a8aa0, label: 'Werkstatt' });
  s.zones.push({ label: 'Werkstatt & Laden', x: 0, y: 2.6, w: 2, h: H - 2.6, tab: 'upgrades', color: 0xc08aff, status: `${charging} Ladestufen · ${workshop} Werkstattstufen` });
  // Dispatch desk
  const dispatch = up.dispatch ?? 0;
  s.props.push({ kind: 'desk', x: W - 2, y: H - 1.5, color: 0x2a2a38, label: 'Disposition' });
  for (let i = 0; i <= dispatch; i++) s.props.push({ kind: 'monitor', x: W - 2.6 + i * 0.6, y: H - 2.2, active: true, color: 0x19e6ff });
  s.zones.push({ label: 'Disposition', x: W - 4, y: H - 3, w: 4, h: 3, tab: 'staff', color: 0x19e6ff, status: `${drivers} Fahrer · ${biz.todayMissed} verpasste Fahrten` });
  s.props.push({ kind: 'mat', x: 6, y: H - 0.5, label: 'Tor' });
  const driverSpots: [number, number][] = biz.vehicles.map((_, i) => [1 + i * 1.3, 2.6]);
  s.figures.push(...staffFigures(biz.employees, 'driver', driverSpots.length ? driverSpots : [[3, 3]], 0.9));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[W - 2, H - 2.6]], 0.2));
  return s;
}

// -------------------------------------------------------------------- retail

function retailScene(b: Building, biz: RetailState, state: GameState): InteriorScene {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const goods = model?.kind === 'retail' ? model.goods : Object.keys(biz.prices);
  const W = 9;
  const H = 7;
  const s = base(b, 'retail', W, H, `${biz.hourCustomers} Kunden gerade · ${biz.todayCustomers} heute · ${biz.todayLostNoStock} ohne Ware`, true, 0.85);
  s.floorColor = 0x28302a;
  const shelfLevel = biz.upgrades.shelves ?? 0;
  let i = 0;
  for (const g of goods) {
    const target = biz.reorderTargets[g] ?? 40;
    const stock = stockOf(biz, g);
    s.props.push({ kind: 'shelf', x: 0.5 + (i % 2) * 2.2, y: 0.8 + Math.floor(i / 2) * 1.6, fill: Math.min(1, stock / Math.max(1, target)), color: stock === 0 ? 0xff3a5a : 0x8cff3a, label: `${INGREDIENTS[g]?.name ?? g}: ${Math.round(stock)}` });
    i++;
  }
  for (let k = 0; k < shelfLevel; k++) s.props.push({ kind: 'rack', x: 4.8, y: 1 + k * 1.4, fill: 0.6, color: 0x8cff3a, label: 'Regalausbau' });
  s.zones.push({ label: 'Regale', x: 0, y: 0, w: 5.6, h: H - 1.5, tab: 'supply', color: 0x8cff3a, status: `${Math.round(totalUnits(biz))} / ${storageCapacity(b)} Einheiten` });
  s.props.push({ kind: 'counter', x: W - 1.5, y: 1, color: 0x2a3a2a, label: 'Kasse' }, { kind: 'monitor', x: W - 1.5, y: 0.5, active: true, color: 0x8cff3a });
  s.zones.push({ label: 'Kasse', x: W - 3, y: 0, w: 3, h: 2.6, tab: 'overview', color: 0xffb020, status: `${biz.todayRevenue.toFixed(0)} ¢ Umsatz heute` });
  s.zones.push({ label: 'Personal', x: 5.6, y: 2.6, w: W - 5.6, h: H - 2.6, tab: 'staff', color: 0xff2bd6, status: `${biz.employees.length} Mitarbeiter` });
  s.props.push({ kind: 'mat', x: W - 0.5, y: H - 1.5, label: 'Eingang' });
  if ((biz.upgrades.security ?? 0) > 0) s.props.push({ kind: 'monitor', x: W - 0.8, y: H - 2.6, active: true, color: 0xff3a5a, label: 'Kamera' });
  s.zones.push({ label: 'Ausbau', x: 0, y: H - 1.5, w: 3, h: 1.5, tab: 'upgrades', color: 0xc08aff, status: biz.upgradeInProgress ? 'Umbau läuft' : `${shelfLevel} Regalstufen` });
  s.figures.push(...staffFigures(biz.employees, 'clerk', [[W - 2.6, 1.4], [3, 3]], 0.5));
  s.figures.push(...staffFigures(biz.employees, 'security', [[W - 1.4, H - 2.4]], 0.3));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[6.5, 4]], 0.4));
  const customers = Math.min(8, biz.hourCustomers);
  for (let c = 0; c < customers; c++) s.figures.push({ role: 'customer', x: 1.5 + (c % 3) * 1.6, y: 1.5 + Math.floor(c / 3) * 1.6, wander: 0.9, name: `Kunde ${c + 1}` });
  void state;
  return s;
}

// ------------------------------------------------------------------ security

function securityScene(b: Building, biz: SecurityState, state: GameState): InteriorScene {
  const W = 10;
  const H = 7;
  const patrols = Object.entries(biz.patrols).filter(([, n]) => n > 0);
  const assigned = patrols.reduce((sum, [, n]) => sum + n, 0);
  const s = base(b, 'security', W, H, `${assigned} Wachen auf Streife in ${patrols.length} Bezirken`, true, 0.9);
  s.floorColor = 0x262a34;
  // Monitor wall: one screen per patrolled district
  const screens = Math.max(3, patrols.length);
  for (let i = 0; i < Math.min(8, screens); i++) {
    const entry = patrols[i];
    const district = entry ? state.districts[Number(entry[0])] : undefined;
    s.props.push({ kind: 'monitor', x: 1 + i, y: 0.3, active: !!entry, color: entry ? 0xff3a5a : 0x3a3a48, label: district ? `${district.name}: ${entry![1]} Wachen` : 'kein Signal' });
  }
  s.zones.push({ label: 'Einsatzzentrale', x: 0, y: 0, w: W, h: 2.4, tab: 'overview', color: 0xff3a5a, status: `${patrols.length} Bezirke · Ruf ${Math.round(biz.reputation)}` });
  // Investigation board
  if (biz.investigation) {
    const family = state.underworld.rivals[biz.investigation.familyIndex];
    s.props.push({ kind: 'board', x: 0.5, y: 4, fill: biz.investigation.progress / 100, active: true, color: 0xffb020, label: `Ermittlung ${family?.name ?? ''}: ${Math.round(biz.investigation.progress)} %` });
  } else {
    s.props.push({ kind: 'board', x: 0.5, y: 4, fill: 0, active: false, color: 0x8a8aa0, label: 'keine Ermittlung' });
  }
  s.props.push({ kind: 'desk', x: 3, y: 4.5, color: 0x2a2a38 }, { kind: 'desk', x: 4.2, y: 4.5, color: 0x2a2a38 });
  const guards = biz.employees.filter((e) => e.role === 'guard').length;
  for (let i = 0; i < Math.min(6, guards); i++) s.props.push({ kind: 'locker', x: W - 0.5, y: 3 + i * 0.7 });
  s.zones.push({ label: 'Ermittlung & Büro', x: 0, y: 2.4, w: 6, h: H - 2.4, tab: 'staff', color: 0xffb020, status: `${guards} Wachen · ${biz.employees.filter((e) => e.role === 'investigator').length} Ermittler` });
  s.zones.push({ label: 'Ausrüstung', x: 6, y: 2.4, w: W - 6, h: H - 2.4, tab: 'upgrades', color: 0xc08aff, status: biz.upgradeInProgress ? 'Umbau läuft' : 'Spinde und Waffenkammer' });
  s.props.push({ kind: 'mat', x: 5, y: H - 0.5, label: 'Eingang' });
  const idleGuards = Math.max(0, guards - assigned);
  const guardSpots: [number, number][] = Array.from({ length: Math.max(1, idleGuards) }, (_, i) => [W - 1.6, 3.2 + i * 0.7]);
  s.figures.push(...staffFigures(biz.employees.filter((e) => e.role === 'guard').slice(0, idleGuards), 'guard', guardSpots, 0.4));
  s.figures.push(...staffFigures(biz.employees, 'investigator', [[3, 5.4], [4.2, 5.4]], 0.3));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[5, 1.5]], 0.5));
  return s;
}

// ----------------------------------------------------------------------- lab

function labScene(b: Building, biz: ResearchLabState): InteriorScene {
  const W = 10;
  const H = 7;
  const node = biz.activeNodeId ? RESEARCH[biz.activeNodeId] : null;
  const progress = node ? Math.min(1, biz.progress / node.cost) : 0;
  const s = base(b, 'lab', W, H, node ? `Forscht: ${node.name} (${Math.round(progress * 100)} %)` : 'Kein Forschungsziel gewählt', true, 0.95);
  s.floorColor = 0x263036;
  const researchers = biz.employees.filter((e) => e.role === 'researcher').length;
  const benches = Math.max(2, researchers);
  const benchSpots: [number, number][] = [];
  for (let i = 0; i < Math.min(8, benches); i++) {
    const x = 1 + (i % 4) * 2.2;
    const y = 1 + Math.floor(i / 4) * 2.4;
    s.props.push({ kind: 'bench', x, y, active: !!node, color: 0x8cff3a });
    benchSpots.push([x, y + 0.9]);
  }
  s.props.push({ kind: 'hologram', x: W - 1.5, y: 1, fill: progress, active: !!node, color: 0x8cff3a, label: node ? node.name : 'Forschung wählen' });
  s.zones.push({ label: 'Forschung', x: 0, y: 0, w: W, h: 4.2, tab: 'overview', color: 0x8cff3a, status: node ? `${Math.round(progress * 100)} % · ${Math.round(biz.progress)} / ${node.cost} Punkte` : 'kein Ziel' });
  const racks = 1 + Math.min(3, biz.employees.filter((e) => e.role === 'technician').length);
  for (let i = 0; i < racks; i++) s.props.push({ kind: 'rack', x: 0.5 + i * 0.9, y: H - 0.8, fill: 0.8, active: true, color: 0x19e6ff, label: 'Serverrack' });
  s.zones.push({ label: 'Technik', x: 0, y: 4.2, w: 5, h: H - 4.2, tab: 'staff', color: 0x19e6ff, status: `${researchers} Forscher · ${biz.employees.filter((e) => e.role === 'technician').length} Techniker` });
  s.zones.push({ label: 'Ausbau', x: 5, y: 4.2, w: W - 5, h: H - 4.2, tab: 'upgrades', color: 0xc08aff, status: biz.upgradeInProgress ? 'Umbau läuft' : 'Laborausstattung' });
  s.props.push({ kind: 'mat', x: W - 0.5, y: H - 1.5, label: 'Eingang' });
  s.figures.push(...staffFigures(biz.employees, 'researcher', benchSpots, 0.25));
  s.figures.push(...staffFigures(biz.employees, 'technician', [[1.4, H - 1.8], [2.6, H - 1.8]], 0.5));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[7, 5.5]], 0.5));
  return s;
}

// ------------------------------------------------------------------ industry

function industryScene(b: Building, biz: IndustryState, state: GameState): InteriorScene {
  const W = 12;
  const H = 8;
  const produced = Object.values(biz.todayProduced).reduce((a, v) => a + v, 0);
  const s = base(b, 'industry', W, H, `${biz.lines.length} Linien · ${produced} Einheiten heute · Energie ${Math.round(biz.todayEnergy)} ¢`, true, 0.7);
  s.floorColor = 0x2e2a26;
  const machinesLevel = biz.upgrades.machines ?? 0;
  const workers = biz.employees.filter((e) => e.role === 'worker').length;
  const lineSpots: [number, number][] = [];
  biz.lines.forEach((line, i) => {
    const recipe = PRODUCTION[line.recipeId];
    const y = 1 + i * 1.8;
    if (y > H - 1.5) return;
    for (let m = 0; m < 2 + machinesLevel; m++) {
      s.props.push({ kind: 'machine', x: 1 + m * 1.6, y, active: workers > 0, color: 0xff8a1f, label: m === 0 ? `${recipe?.name ?? line.recipeId}: ${line.targetPerDay} / Tag` : undefined });
      lineSpots.push([1 + m * 1.6, y + 0.9]);
    }
  });
  if (biz.lines.length === 0) s.props.push({ kind: 'machine', x: 1.5, y: 1.2, active: false, color: 0x6a6a7a, label: 'keine Produktionslinie' });
  s.zones.push({ label: 'Produktion', x: 0, y: 0, w: 8, h: H - 1.5, tab: 'overview', color: 0xff8a1f, status: `${biz.lines.length} Linien · ${workers} Arbeiter` });
  // Raw material pallets and finished goods rack
  const cap = storageCapacity(b);
  const lots = new Map<string, number>();
  for (const l of biz.inventory) lots.set(l.ingredientId, (lots.get(l.ingredientId) ?? 0) + l.units);
  let i = 0;
  for (const [id, units] of lots) {
    if (i >= 6) break;
    const raw = INGREDIENTS[id]?.category === 'raw';
    s.props.push({ kind: raw ? 'pallet' : 'rack', x: W - 1.2 - (i % 2) * 1.2, y: 0.8 + Math.floor(i / 2) * 1.5, fill: Math.min(1, units / Math.max(1, cap / 4)), color: raw ? 0xb08a5a : 0x8cff3a, label: `${INGREDIENTS[id]?.name ?? id}: ${Math.round(units)}` });
    i++;
  }
  s.zones.push({ label: 'Rohstofflager', x: 8, y: 0, w: W - 8, h: H - 1.5, tab: 'supply', color: 0x19e6ff, status: `${Math.round(totalUnits(biz))} / ${cap} Einheiten` });
  if ((biz.upgrades.filters ?? 0) > 0) s.props.push({ kind: 'filter', x: 0.5, y: H - 0.8, active: true, color: 0x8cff3a, label: 'Filteranlage' });
  s.zones.push({ label: 'Ausbau', x: 0, y: H - 1.5, w: 5, h: 1.5, tab: 'upgrades', color: 0xc08aff, status: `${machinesLevel} Maschinenstufen · ${biz.upgrades.filters ?? 0} Filterstufen` });
  s.zones.push({ label: 'Personal', x: 5, y: H - 1.5, w: W - 5, h: 1.5, tab: 'staff', color: 0xff2bd6, status: `${biz.employees.length} Mitarbeiter` });
  s.props.push({ kind: 'mat', x: 6, y: H - 0.5, label: 'Tor' });
  s.figures.push(...staffFigures(biz.employees, 'worker', lineSpots.length ? lineSpots : [[2, 2]], 0.3));
  s.figures.push(...staffFigures(biz.employees, 'technician', [[W - 2.5, H - 2.2], [W - 3.5, H - 2.2]], 0.6));
  s.figures.push(...staffFigures(biz.employees, 'manager', [[7, H - 2.2]], 0.4));
  void state;
  return s;
}

export const FIGURE_LABELS: Record<FigureRole, string> = {
  ...ROLE_LABELS,
  guest: 'Gast',
  vip: 'VIP-Gast',
  customer: 'Kunde',
  resident: 'Bewohner',
};
