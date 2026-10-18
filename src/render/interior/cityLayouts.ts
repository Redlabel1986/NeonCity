/**
 * Interiors of the pre-rendered city buildings (houses, shops, clinics,
 * depots, harbour cranes ...). The catalogue (cityCatalog.ts) names the
 * rooms of every building; this module furnishes them per archetype and
 * fills them with the citizens the simulation really places there:
 * residents who are at home, employees who are at work, and the guests a
 * competitor venue registers this hour. Zone texts only show simulation
 * values (people, district statistics, property condition), never made-up
 * numbers. Pure; no Pixi.
 */

import type { Building, Citizen, GameState } from '../../sim/state';
import type { RegionId } from '../../sim/data/regions';
import { regionOfDistrict } from '../../sim/systems/progression';
import type { FigureRole, FloorPattern, InteriorScene, Prop, PropKind, WallStyle, Zone } from './layouts';
import { cityInterior, type CityInteriorEntry, type InteriorArchetype } from './cityCatalog';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a zone's status line reports. */
type Topic = 'work' | 'home' | 'guests' | 'public' | 'tech' | 'safety' | 'goods' | 'money' | 'environment' | 'civic' | 'condition';

interface Spot {
  x: number;
  y: number;
  role: FigureRole;
  seated?: boolean;
  lying?: boolean;
}

interface Ctx {
  s: InteriorScene;
  staff: Spot[];
  home: Spot[];
  beds: Spot[];
  seats: Spot[];
  accent: number;
  region: RegionId;
}

type Recipe = [topic: Topic, run: (r: Rect, c: Ctx) => void];

// ------------------------------------------------------------------ helpers

function put(c: Ctx, kind: PropKind, x: number, y: number, o: Partial<Prop> = {}): void {
  c.s.props.push({ kind, x: round(x), y: round(y), ...o });
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Positions on a grid inside the rect (at least its centre). */
function cells(r: Rect, sx: number, sy: number, pad = 0.6): [number, number][] {
  const out: [number, number][] = [];
  for (let y = r.y + pad; y <= r.y + r.h - pad + 1e-6; y += sy) for (let x = r.x + pad; x <= r.x + r.w - pad + 1e-6; x += sx) out.push([x, y]);
  if (out.length === 0) out.push([r.x + r.w / 2, r.y + r.h / 2]);
  return out;
}

/** Positions along the rect's back edge (low y). */
function backRow(r: Rect, step: number): number[] {
  const out: number[] = [];
  for (let x = r.x + 0.6; x <= r.x + r.w - 0.5 + 1e-6; x += step) out.push(x);
  if (out.length === 0) out.push(r.x + r.w / 2);
  return out;
}

function staff(c: Ctx, x: number, y: number, role: FigureRole): void {
  c.staff.push({ x: round(x), y: round(y), role });
}

function seat(c: Ctx, x: number, y: number): void {
  c.seats.push({ x: round(x), y: round(y), role: 'guest', seated: true });
}

const cx = (r: Rect): number => r.x + r.w / 2;
const cy = (r: Rect): number => r.y + r.h / 2;
const far = (r: Rect): number => r.y + r.h - 0.6;

// ------------------------------------------------------------------ recipes

const WOOD = 0x7a5a3c;
const STEEL = 0x8a8a96;
const WHITE = 0xd8dce4;

const R: Record<string, Recipe> = {
  // food
  dining: ['guests', (r, c) => {
    for (const [x, y] of cells(r, 2, 1.9, 0.9)) {
      put(c, 'table', x, y);
      seat(c, x - 0.45, y);
      seat(c, x + 0.45, y);
    }
    put(c, 'plant', r.x + 0.35, far(r) + 0.2);
    staff(c, cx(r), cy(r), 'service');
  }],
  kitchen: ['work', (r, c) => {
    const xs = backRow(r, 1);
    xs.forEach((x, i) => put(c, i === xs.length - 1 ? 'sink' : 'stove', x, r.y + 0.55, { active: true, label: i === xs.length - 1 ? 'Spüle' : 'Herd mit Abzug' }));
    put(c, 'shelf', r.x + r.w - 0.4, far(r), { fill: 0.7 });
    staff(c, r.x + 1, r.y + 1.4, 'cook');
    staff(c, r.x + 2.2, r.y + 1.4, 'cook');
  }],
  bar: ['guests', (r, c) => {
    for (const x of backRow(r, 1)) {
      put(c, 'counter', x, r.y + 0.9, { color: 0x4a2a34, label: 'Theke' });
      put(c, 'barstool', x, r.y + 1.7);
      seat(c, x, r.y + 1.7);
    }
    put(c, 'monitor', r.x + r.w - 0.5, r.y + 0.9, { active: true, color: c.accent, label: 'Kasse' });
    staff(c, r.x + 1, r.y + 0.35, 'service');
  }],
  cold: ['goods', (r, c) => {
    for (const x of backRow(r, 0.9)) put(c, 'coldcell', x, r.y + 0.5, { label: 'Kühlung' });
    put(c, 'rack', r.x + 0.5, far(r), { fill: 0.6, label: 'Trockenlager' });
    if (r.w > 2) put(c, 'sack', r.x + 1.6, far(r));
  }],
  checkout: ['guests', (r, c) => {
    put(c, 'counter', cx(r), cy(r) - 0.3, { label: 'Kasse' });
    put(c, 'monitor', cx(r) + 0.4, cy(r) - 0.3, { active: true, color: c.accent, label: 'Kassensystem' });
    put(c, 'mat', cx(r), far(r) + 0.1);
    staff(c, cx(r), cy(r) - 0.9, 'clerk');
  }],
  staffroom: ['work', (r, c) => {
    for (const x of backRow(r, 0.55).slice(0, 4)) put(c, 'locker', x, r.y + 0.35, { label: 'Spind' });
    put(c, 'table', cx(r), far(r));
    if (r.w > 2.2) put(c, 'sofa', r.x + r.w - 0.8, cy(r) + 0.3);
  }],
  stallcounter: ['guests', (r, c) => {
    for (const x of backRow(r, 1)) put(c, 'counter', x, cy(r), { color: 0x8a5a34, label: 'Verkaufstheke' });
    put(c, 'awning', cx(r), r.y + 0.2, { color: c.accent, w: r.w });
    staff(c, cx(r), r.y + 0.5, 'cook');
    seat(c, cx(r) - 0.6, far(r) + 0.2);
    seat(c, cx(r) + 0.6, far(r) + 0.2);
  }],
  prep: ['work', (r, c) => {
    put(c, 'stove', r.x + 0.6, r.y + 0.6, { active: true, label: 'Kochstelle' });
    put(c, 'desk', cx(r) + 0.3, cy(r) + 0.2, { color: STEEL, label: 'Arbeitsplatte' });
    staff(c, cx(r), cy(r) - 0.5, 'cook');
  }],
  bread: ['public', (r, c) => {
    for (const x of backRow(r, 0.8)) put(c, 'shelf', x, r.y + 0.45, { fill: 0.85, color: 0xd8a050, label: 'Brotregal' });
    put(c, 'display', cx(r), far(r) - 0.2, { color: 0xd8a050, label: 'Theke mit Gebäck' });
    staff(c, cx(r), cy(r), 'clerk');
  }],
  oven: ['work', (r, c) => {
    for (const x of backRow(r, 1.2)) put(c, 'oven', x, r.y + 0.55, { active: true, label: 'Backofen' });
    staff(c, cx(r), cy(r) + 0.4, 'cook');
  }],
  dough: ['work', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: STEEL, label: 'Teigtisch' });
    put(c, 'machine', r.x + 0.7, far(r), { color: 0xffb020, active: true, label: 'Knetmaschine' });
    staff(c, cx(r) + 0.6, cy(r) + 0.8, 'cook');
  }],
  flourstore: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 0.9, 1, 0.5).slice(0, 6)) put(c, 'sack', x, y, { label: 'Mehlsack' });
    put(c, 'rack', r.x + r.w - 0.4, r.y + 0.5, { fill: 0.7 });
  }],
  espresso: ['guests', (r, c) => {
    put(c, 'counter', cx(r), r.y + 0.8, { color: 0x4a3024 });
    put(c, 'espresso', cx(r) - 0.3, r.y + 0.75, { active: true, label: 'Siebträgermaschine' });
    for (const x of [cx(r) - 0.8, cx(r) + 0.6]) {
      put(c, 'barstool', x, r.y + 1.6);
      seat(c, x, r.y + 1.6);
    }
    staff(c, cx(r), r.y + 0.3, 'service');
  }],
  cakes: ['public', (r, c) => {
    put(c, 'display', cx(r), cy(r), { color: 0xffb0c8, label: 'Kuchenvitrine' });
    staff(c, cx(r), r.y + 0.4, 'clerk');
  }],
  scullery: ['goods', (r, c) => {
    put(c, 'sink', r.x + 0.5, r.y + 0.5, { active: true, label: 'Spüle' });
    put(c, 'rack', r.x + r.w - 0.4, cy(r), { fill: 0.5, label: 'Vorräte' });
  }],
  seating: ['guests', (r, c) => {
    for (const [x, y] of cells(r, 1.7, 1.7, 0.8)) {
      put(c, 'table', x, y);
      seat(c, x - 0.45, y);
      seat(c, x + 0.45, y);
    }
    put(c, 'sofa', r.x + 0.8, r.y + 0.35);
    put(c, 'plant', r.x + r.w - 0.3, far(r));
  }],
  // healthcare
  reception: ['public', (r, c) => {
    put(c, 'counter', r.x + 1, r.y + 0.8, { label: 'Empfang' });
    put(c, 'monitor', r.x + 1.3, r.y + 0.8, { active: true, color: c.accent });
    staff(c, r.x + 1, r.y + 0.3, 'reception');
    for (const [x, y] of cells({ x: r.x, y: r.y + 1.4, w: r.w, h: r.h - 1.4 }, 1.4, 1.2, 0.6).slice(0, 4)) put(c, 'bench', x, y, { label: 'Wartebank' });
    put(c, 'plant', r.x + r.w - 0.3, r.y + 0.3);
  }],
  exam: ['work', (r, c) => {
    put(c, 'bed', cx(r), cy(r), { color: WHITE, label: 'Untersuchungsliege' });
    put(c, 'monitor', r.x + 0.5, r.y + 0.4, { active: true, color: 0x8cff3a, label: 'Vitalwerte' });
    put(c, 'sink', r.x + r.w - 0.4, r.y + 0.4);
    staff(c, cx(r) + 0.6, cy(r) - 0.4, 'researcher');
  }],
  treatment: ['work', (r, c) => {
    put(c, 'bed', cx(r) - 0.3, cy(r), { color: WHITE, label: 'Behandlungsliege' });
    put(c, 'scanner', r.x + r.w - 0.7, r.y + 0.7, { active: true, color: 0x19e6ff, label: 'Diagnosegerät' });
    put(c, 'lamp', cx(r) - 0.3, cy(r) - 0.6, { label: 'OP-Leuchte' });
    staff(c, cx(r) + 0.4, cy(r) + 0.6, 'researcher');
  }],
  pharmacy: ['goods', (r, c) => {
    for (const x of backRow(r, 0.8)) put(c, 'shelf', x, r.y + 0.45, { fill: 0.75, color: WHITE, label: 'Medikamentenregal' });
    put(c, 'coldcell', r.x + r.w - 0.4, far(r), { label: 'Kühlschrank für Impfstoffe' });
  }],
  nursestation: ['work', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: 0xd8d8e0, label: 'Stationstresen' });
    put(c, 'monitor', cx(r) + 0.3, cy(r), { active: true, color: 0x19e6ff });
    put(c, 'locker', r.x + 0.3, r.y + 0.3);
    staff(c, cx(r), cy(r) - 0.6, 'researcher');
  }],
  // homes
  living: ['home', (r, c) => {
    put(c, 'sofa', cx(r), r.y + 0.5, { color: 0x6a4a38 });
    put(c, 'table', cx(r), cy(r) + 0.3);
    put(c, 'tv', r.x + 0.3, cy(r), { active: true, color: 0x7fa8d8, label: 'Fernseher' });
    put(c, 'plant', r.x + r.w - 0.3, far(r));
    c.home.push({ x: cx(r) - 0.4, y: r.y + 0.9, role: 'resident', seated: true }, { x: cx(r) + 0.4, y: r.y + 0.9, role: 'resident', seated: true }, { x: cx(r), y: far(r), role: 'resident' });
  }],
  kitchenette: ['home', (r, c) => {
    put(c, 'stove', r.x + 0.6, r.y + 0.5, { label: 'Herd' });
    put(c, 'sink', r.x + 1.5, r.y + 0.5);
    put(c, 'table', cx(r) + 0.3, cy(r) + 0.5, { label: 'Esstisch' });
    c.home.push({ x: cx(r) - 0.2, y: cy(r) + 0.5, role: 'resident', seated: true }, { x: r.x + 1, y: r.y + 1.2, role: 'resident' });
  }],
  bedroom: ['home', (r, c) => {
    put(c, 'bed', cx(r), cy(r), { color: 0x8a7ab0, label: 'Bett' });
    put(c, 'locker', r.x + 0.3, r.y + 0.3, { label: 'Kleiderschrank' });
    c.beds.push({ x: cx(r) - 0.15, y: cy(r) - 0.1, role: 'resident', lying: true }, { x: cx(r) + 0.2, y: cy(r) + 0.15, role: 'resident', lying: true });
  }],
  bath: ['home', (r, c) => {
    put(c, 'bathtub', cx(r), r.y + 0.55, { label: 'Badewanne' });
    put(c, 'toilet', r.x + 0.4, far(r));
    put(c, 'sink', r.x + r.w - 0.4, far(r));
  }],
  entrance: ['home', (r, c) => {
    put(c, 'mat', cx(r), far(r) + 0.1);
    for (const x of backRow(r, 0.5).slice(0, 5)) put(c, 'mailbox', x, r.y + 0.3, { label: 'Briefkästen' });
    put(c, 'plant', r.x + 0.3, far(r));
  }],
  units: ['home', (r, c) => {
    for (const [x, y] of cells(r, 1.8, 1.6, 0.8)) {
      put(c, 'bed', x, y, { color: 0x7a8ab0, label: 'Wohneinheit' });
      c.beds.push({ x: x - 0.1, y: y - 0.05, role: 'resident', lying: true });
      c.home.push({ x: x + 0.7, y: y + 0.5, role: 'resident' });
    }
  }],
  commons: ['home', (r, c) => {
    put(c, 'sofa', cx(r), r.y + 0.5);
    put(c, 'table', cx(r), cy(r) + 0.3);
    put(c, 'plant', r.x + 0.3, far(r));
    c.home.push({ x: cx(r) - 0.5, y: cy(r) + 0.3, role: 'resident', seated: true }, { x: cx(r) + 0.5, y: cy(r) + 0.3, role: 'resident', seated: true });
  }],
  hotelrooms: ['home', (r, c) => {
    for (const [x, y] of cells(r, 1.6, 1.7, 0.8)) {
      put(c, 'bed', x, y, { color: 0xc8b090, label: 'Gästezimmer' });
      c.beds.push({ x, y, role: 'resident', lying: true });
    }
    staff(c, cx(r), far(r), 'housekeeping');
  }],
  breakfast: ['guests', (r, c) => {
    put(c, 'counter', r.x + 0.8, r.y + 0.6, { color: 0x8a6a48, label: 'Frühstücksbuffet' });
    for (const [x, y] of cells({ x: r.x, y: r.y + 1, w: r.w, h: r.h - 1 }, 1.8, 1.6, 0.8)) {
      put(c, 'table', x, y);
      seat(c, x - 0.45, y);
    }
  }],
  laundry: ['work', (r, c) => {
    for (const x of backRow(r, 0.9).slice(0, 3)) put(c, 'washer', x, r.y + 0.45, { active: true, label: 'Waschmaschine' });
    put(c, 'cart', cx(r), far(r), { label: 'Wäschewagen' });
    staff(c, cx(r), cy(r), 'housekeeping');
  }],
  lobby: ['public', (r, c) => {
    put(c, 'counter', r.x + 1.1, r.y + 0.8, { color: 0x8a6a48, label: 'Rezeption' });
    put(c, 'monitor', r.x + 1.4, r.y + 0.8, { active: true, color: c.accent });
    staff(c, r.x + 1.1, r.y + 0.3, 'reception');
    put(c, 'sofa', r.x + r.w - 1, cy(r) + 0.5);
    put(c, 'plant', r.x + 0.3, far(r));
    put(c, 'mat', cx(r), far(r) + 0.1);
  }],
  // technical
  techroom: ['tech', (r, c) => {
    put(c, 'filter', r.x + 0.5, r.y + 0.5, { active: true, color: 0x8cff3a, label: 'Heizung / Lüftung' });
    put(c, 'pipes', cx(r) + 0.3, r.y + 0.35, { w: r.w - 1 });
    put(c, 'machine', cx(r), far(r), { active: true, color: 0xffb020, label: 'Haustechnik' });
    staff(c, r.x + r.w - 0.5, cy(r), 'technician');
  }],
  servers: ['tech', (r, c) => {
    for (const [x, y] of cells(r, 0.75, 1.5, 0.5)) put(c, 'server', x, y, { active: true, color: 0x19e6ff, label: 'Serverrack' });
    staff(c, cx(r), far(r) + 0.15, 'technician');
  }],
  network: ['tech', (r, c) => {
    put(c, 'rack', r.x + 0.4, r.y + 0.5, { fill: 1, color: 0x19e6ff, label: 'Netzwerkschrank' });
    put(c, 'console', cx(r), cy(r), { active: true, color: 0x19e6ff, label: 'Netzwerküberwachung' });
    staff(c, cx(r), cy(r) + 0.6, 'technician');
  }],
  cooling: ['tech', (r, c) => {
    put(c, 'tank', r.x + 0.7, r.y + 0.7, { color: 0x8aa0b0, label: 'Kältespeicher' });
    put(c, 'pump', cx(r) + 0.5, far(r), { active: true, label: 'Kühlmittelpumpe' });
    put(c, 'pipes', cx(r), r.y + 0.3, { w: r.w - 1 });
  }],
  secdesk: ['safety', (r, c) => {
    put(c, 'console', cx(r), cy(r), { active: true, color: 0xff3a5a, label: 'Sicherheitsleitstand' });
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: 0xff3a5a, w: Math.min(3, r.w - 0.4), label: 'Kamerabilder' });
    staff(c, cx(r), cy(r) + 0.6, 'guard');
  }],
  generators: ['tech', (r, c) => {
    for (const [x, y] of cells(r, 1.6, 1.8, 0.9)) put(c, 'generator', x, y, { active: true, color: 0xffb020, label: 'Generator / Umrichter' });
    staff(c, r.x + 0.5, far(r), 'technician');
  }],
  switchroom: ['tech', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: c.accent, w: Math.min(3, r.w - 0.4), label: 'Netzschema' });
    put(c, 'console', cx(r), cy(r) + 0.2, { active: true, color: c.accent, label: 'Schaltpult' });
    staff(c, cx(r), cy(r) + 0.8, 'technician');
  }],
  maintenance: ['condition', (r, c) => {
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4), label: 'Werkzeugwand' });
    put(c, 'cart', r.x + 0.6, far(r), { active: true, color: 0xffb020, label: 'Werkzeugwagen' });
    staff(c, cx(r), cy(r), 'technician');
  }],
  // industry & logistics
  production: ['work', (r, c) => {
    put(c, 'conveyor', cx(r), cy(r), { w: r.w - 0.8, active: true, label: 'Produktionslinie' });
    for (const x of backRow(r, 1.6)) put(c, 'machine', x, r.y + 0.6, { active: true, color: 0xff8a1f, label: 'Fertigungsstation' });
    for (const x of backRow(r, 1.6)) staff(c, x, cy(r) + 0.7, 'worker');
  }],
  feed: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1, 1.2, 0.5).slice(0, 4)) put(c, 'pallet', x, y, { fill: 0.75, color: 0x7a8a9a, label: 'Rohmaterial' });
    staff(c, cx(r), far(r), 'worker');
  }],
  qc: ['work', (r, c) => {
    put(c, 'labbench', cx(r), cy(r), { label: 'Prüftisch' });
    put(c, 'scanner', r.x + 0.5, r.y + 0.5, { active: true, color: 0x8cff3a, label: 'Messgerät' });
    staff(c, cx(r), cy(r) + 0.6, 'technician');
  }],
  controlstand: ['environment', (r, c) => {
    put(c, 'console', cx(r), cy(r), { active: true, color: c.accent, label: 'Leitstand' });
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: c.accent, w: Math.min(3, r.w - 0.4) });
    staff(c, cx(r), cy(r) + 0.6, 'technician');
  }],
  warehouse: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1.1, 1.6, 0.5)) put(c, 'rack', x, y, { fill: 0.7, label: 'Hochregal' });
    put(c, 'forklift', cx(r), far(r) + 0.1, { color: 0xffb020, label: 'Gabelstapler' });
    staff(c, cx(r) + 0.6, far(r), 'worker');
  }],
  receiving: ['goods', (r, c) => {
    put(c, 'vehicle', r.x + 0.7, cy(r), { fill: 0.5, label: 'Lieferwagen' });
    for (const [x, y] of cells({ x: r.x + 1.3, y: r.y, w: r.w - 1.3, h: r.h }, 1, 1.2, 0.5).slice(0, 4)) put(c, 'pallet', x, y, { fill: 0.6, label: 'Anlieferung' });
    staff(c, cx(r), far(r), 'worker');
  }],
  picking: ['work', (r, c) => {
    for (const x of backRow(r, 1)) put(c, 'shelf', x, r.y + 0.45, { fill: 0.7 });
    put(c, 'cart', cx(r), cy(r) + 0.4, { label: 'Kommissionierwagen' });
    staff(c, cx(r) - 0.4, cy(r) + 0.4, 'worker');
  }],
  shipping: ['goods', (r, c) => {
    put(c, 'console', r.x + 0.8, r.y + 0.6, { active: true, color: c.accent, label: 'Versandleitstand' });
    for (const [x, y] of cells({ x: r.x, y: r.y + 1.2, w: r.w, h: r.h - 1.2 }, 1, 1, 0.5).slice(0, 3)) put(c, 'pallet', x, y, { fill: 0.9, color: 0x8a6a3a, label: 'Versandbereit' });
    staff(c, r.x + 0.8, r.y + 1.2, 'dispatcher');
  }],
  stable: ['work', (r, c) => {
    for (const [x, y] of cells(r, 1.3, 1.4, 0.7)) put(c, 'animal', x, y, { color: 0x8a6a4a, label: 'Stallbox' });
    staff(c, cx(r), far(r), 'worker');
  }],
  harvest: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 0.9, 1, 0.5).slice(0, 6)) put(c, 'crate', x, y, { color: 0xc8a040, label: 'Erntekiste' });
  }],
  machineshop: ['tech', (r, c) => {
    put(c, 'tractor', cx(r), cy(r), { color: 0x3a8a3a, label: 'Traktor' });
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4) });
    staff(c, cx(r) + 0.8, cy(r) + 0.5, 'technician');
  }],
  admin: ['money', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: WOOD, label: 'Schreibtisch' });
    put(c, 'monitor', cx(r) + 0.3, cy(r), { active: true, color: c.accent });
    put(c, 'bookshelf', r.x + 0.3, r.y + 0.4, { label: 'Akten' });
    staff(c, cx(r), cy(r) - 0.6, 'analyst');
  }],
  sortline: ['environment', (r, c) => {
    put(c, 'conveyor', cx(r), cy(r), { w: r.w - 0.8, active: true, label: 'Sortierband' });
    put(c, 'container', r.x + 0.8, r.y + 0.6, { color: 0x3a8a5a, label: 'Anlieferung' });
    staff(c, cx(r) - 0.5, cy(r) + 0.7, 'worker');
    staff(c, cx(r) + 0.7, cy(r) + 0.7, 'worker');
  }],
  processing: ['work', (r, c) => {
    put(c, 'press', cx(r), cy(r) - 0.2, { active: true, color: c.accent, label: 'Presse / Schredder' });
    staff(c, cx(r) + 0.8, cy(r) + 0.8, 'worker');
  }],
  matstore: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1, 1.1, 0.5).slice(0, 6)) put(c, 'pallet', x, y, { fill: 0.6, color: 0x7a7a8a, label: 'Material' });
  }],
  controlroom: ['tech', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: c.accent, w: Math.min(3, r.w - 0.4), label: 'Prozessbild' });
    put(c, 'console', cx(r), cy(r) + 0.2, { active: true, color: c.accent, label: 'Kontrollpult' });
    staff(c, cx(r), cy(r) + 0.8, 'technician');
  }],
  pipefield: ['environment', (r, c) => {
    put(c, 'pipes', cx(r), r.y + 0.5, { w: r.w - 0.8 });
    put(c, 'pipes', cx(r), cy(r) + 0.4, { w: r.w - 0.8 });
    for (const x of backRow(r, 1.8)) put(c, 'pump', x, far(r), { active: true, label: 'Pumpe' });
    put(c, 'tank', r.x + r.w - 0.8, cy(r) - 0.3, { color: 0xb0b0b8, label: 'Prozesstank' });
  }],
  samplelab: ['work', (r, c) => {
    put(c, 'labbench', cx(r), cy(r), { label: 'Probentisch' });
    put(c, 'coldcell', r.x + 0.4, r.y + 0.5, { label: 'Probenkühlung' });
    staff(c, cx(r), cy(r) + 0.6, 'researcher');
  }],
  labbenches: ['work', (r, c) => {
    for (const [x, y] of cells(r, 1.6, 1.5, 0.8)) {
      put(c, 'labbench', x, y, { label: 'Laborarbeitsplatz' });
      staff(c, x, y + 0.6, 'researcher');
    }
  }],
  analyzers: ['tech', (r, c) => {
    for (const x of backRow(r, 1.2)) put(c, 'scanner', x, r.y + 0.6, { active: true, color: 0x8cff3a, label: 'Analysegerät' });
    staff(c, cx(r), far(r), 'researcher');
  }],
  samples: ['goods', (r, c) => {
    for (const x of backRow(r, 0.8)) put(c, 'coldcell', x, r.y + 0.45, { label: 'Probenlager' });
    put(c, 'rack', r.x + r.w - 0.4, far(r), { fill: 0.8, color: 0x8cff3a });
  }],
  // shops
  storefloor: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.2, 1.6, 0.6)) put(c, 'shelf', x, y, { fill: 0.8, color: c.accent, label: 'Warenregal' });
    staff(c, cx(r), far(r), 'clerk');
  }],
  consult: ['public', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: WOOD, label: 'Beratungstisch' });
    put(c, 'sofa', cx(r), far(r));
    staff(c, cx(r), cy(r) - 0.6, 'clerk');
  }],
  showroom: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.5, 1.5, 0.8)) put(c, 'display', x, y, { color: 0x19e6ff, active: true, label: 'Smartphones & PCs' });
    staff(c, cx(r), far(r), 'clerk');
  }],
  gaming: ['public', (r, c) => {
    for (const x of backRow(r, 1.1)) {
      put(c, 'desk', x, r.y + 0.6, { color: 0x2a2a38 });
      put(c, 'monitor', x, r.y + 0.6, { active: true, color: 0xc08aff, label: 'Gaming-Teststation' });
    }
  }],
  service: ['work', (r, c) => {
    put(c, 'counter', cx(r), cy(r), { label: 'Service-Theke' });
    put(c, 'monitor', cx(r) + 0.3, cy(r), { active: true, color: c.accent });
    staff(c, cx(r), cy(r) - 0.6, 'clerk');
  }],
  flowers: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.3, 1.3, 0.6)) put(c, 'flowerstand', x, y, { color: [0xff5a8a, 0xffd04a, 0xc08aff, 0xff8a3a][Math.round(x + y) % 4], label: 'Blumen' });
  }],
  binding: ['work', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: WOOD, label: 'Bindetisch' });
    put(c, 'plant', cx(r) - 0.3, cy(r) - 0.1);
    staff(c, cx(r), cy(r) - 0.6, 'clerk');
  }],
  flowercold: ['goods', (r, c) => {
    put(c, 'coldcell', r.x + 0.4, r.y + 0.5, { label: 'Blumenkühlung' });
    for (const x of backRow({ ...r, x: r.x + 0.8, w: r.w - 0.8 }, 0.7)) put(c, 'plant', x, far(r));
  }],
  produce: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.3, 1.3, 0.6)) put(c, 'flowerstand', x, y, { color: [0x5ac83a, 0xff5a3a, 0xffb020, 0x8a3a8a][Math.round(x * 2 + y) % 4], label: 'Gemüseauslage' });
  }],
  scale: ['public', (r, c) => {
    put(c, 'counter', cx(r), cy(r), { label: 'Kasse' });
    put(c, 'scale', cx(r) - 0.2, cy(r) - 0.05, { label: 'Waage' });
    staff(c, cx(r), cy(r) - 0.6, 'clerk');
  }],
  fresh: ['goods', (r, c) => {
    put(c, 'coldcell', r.x + 0.4, r.y + 0.5, { label: 'Frischelager' });
    for (const [x, y] of cells({ ...r, x: r.x + 0.9, w: r.w - 0.9 }, 0.9, 1, 0.5).slice(0, 4)) put(c, 'crate', x, y, { color: 0x5ac83a });
  }],
  delivery: ['goods', (r, c) => {
    put(c, 'vehicle', cx(r), cy(r), { fill: 0.3, label: 'Lieferwagen' });
    put(c, 'pallet', r.x + 0.5, far(r), { fill: 0.5 });
  }],
  // garages & vehicles
  lifts: ['work', (r, c) => {
    for (const x of backRow(r, 1.6)) put(c, 'lift', x, cy(r), { fill: (x * 7) % 1, label: 'Hebebühne' });
    staff(c, cx(r), far(r), 'technician');
  }],
  toolcart: ['work', (r, c) => {
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4), label: 'Werkzeugwand' });
    put(c, 'cart', cx(r), cy(r) + 0.3, { active: true, color: 0xff3a5a, label: 'Werkzeugwagen' });
  }],
  parts: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1, 1.6, 0.5)) put(c, 'rack', x, y, { fill: 0.8, color: 0xffb020, label: 'Ersatzteile' });
  }],
  intake: ['public', (r, c) => {
    put(c, 'counter', cx(r), cy(r), { label: 'Annahme' });
    put(c, 'monitor', cx(r) + 0.3, cy(r), { active: true, color: c.accent });
    staff(c, cx(r), cy(r) - 0.6, 'clerk');
  }],
  bikestand: ['work', (r, c) => {
    for (const x of backRow(r, 1.1)) put(c, 'bike', x, cy(r), { color: [0xff3a5a, 0x19e6ff, 0x8cff3a][Math.round(x) % 3], label: 'Fahrrad im Montageständer' });
    staff(c, cx(r), far(r), 'technician');
  }],
  bikebench: ['work', (r, c) => {
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4) });
    put(c, 'desk', cx(r), cy(r) + 0.2, { color: WOOD, label: 'Werkbank' });
  }],
  stalls: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.1, 2, 0.7)) put(c, 'vehicle', x, y, { fill: (x * 3 + y) % 1, label: 'Stellplatz' });
    put(c, 'lanes', cx(r), cy(r), { w: r.w, h: r.h });
  }],
  paymachine: ['public', (r, c) => {
    put(c, 'kiosk', cx(r), cy(r), { active: true, color: c.accent, label: 'Kassenautomat' });
  }],
  charging: ['tech', (r, c) => {
    for (const x of backRow(r, 1.2)) {
      put(c, 'charger', x, r.y + 0.4, { active: true });
      put(c, 'vehicle', x, cy(r) + 0.4, { fill: 0.8, label: 'Ladeplatz' });
    }
  }],
  truckhall: ['safety', (r, c) => {
    for (const x of backRow(r, 1.5)) put(c, 'firetruck', x, cy(r), { label: 'Einsatzfahrzeug' });
    staff(c, cx(r), far(r), 'driver');
  }],
  lockers: ['work', (r, c) => {
    for (const x of backRow(r, 0.5)) put(c, 'locker', x, r.y + 0.3, { label: 'Spind' });
    put(c, 'bench', cx(r), cy(r) + 0.3);
  }],
  dispatch: ['safety', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: 0xff3a5a, w: Math.min(3, r.w - 0.4), label: 'Einsatzkarte' });
    put(c, 'console', cx(r), cy(r) + 0.2, { active: true, color: 0xff3a5a, label: 'Leitstelle' });
    staff(c, cx(r), cy(r) + 0.8, 'dispatcher');
  }],
  restroom: ['work', (r, c) => {
    for (const x of backRow(r, 1.2)) put(c, 'bunk', x, r.y + 0.6, { label: 'Etagenbett' });
    put(c, 'sofa', cx(r), far(r));
  }],
  pumps: ['public', (r, c) => {
    for (const x of backRow(r, 1.4)) put(c, 'fuelpump', x, cy(r) - 0.3, { active: true, color: c.accent, label: 'Zapfsäule' });
    put(c, 'vehicle', r.x + 1, far(r), { fill: 0.6 });
  }],
  tankwatch: ['tech', (r, c) => {
    put(c, 'tank', r.x + 0.8, cy(r), { color: 0xd8d8d8, label: 'Erdtank (Füllstand)' });
    put(c, 'console', r.x + r.w - 0.7, cy(r), { active: true, color: 0xffb020, label: 'Tanküberwachung' });
  }],
  securityzone: ['safety', (r, c) => {
    put(c, 'turnstile', cx(r), cy(r), { active: true, color: 0xff3a5a, label: 'Zugangskontrolle' });
    put(c, 'fence', cx(r), r.y + 0.2, { w: r.w - 0.4 });
    staff(c, cx(r) + 0.7, cy(r) + 0.4, 'guard');
  }],
  // offices & public
  desks: ['work', (r, c) => {
    for (const [x, y] of cells(r, 1.5, 1.4, 0.8)) {
      put(c, 'desk', x, y, { color: 0xb8b0a0 });
      put(c, 'monitor', x + 0.2, y, { active: true, color: c.accent });
      staff(c, x, y + 0.55, 'analyst');
    }
  }],
  meeting: ['work', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: WOOD, label: 'Besprechungstisch' });
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: c.accent, w: Math.min(2, r.w - 0.4), label: 'Präsentation' });
  }],
  serverbreak: ['tech', (r, c) => {
    put(c, 'server', r.x + 0.4, r.y + 0.5, { active: true, color: 0x19e6ff, label: 'Serverschrank' });
    put(c, 'espresso', r.x + r.w - 0.5, r.y + 0.5, { active: true, label: 'Kaffeemaschine' });
    put(c, 'sofa', cx(r), far(r));
  }],
  citizenservice: ['civic', (r, c) => {
    for (const x of backRow(r, 1.4)) {
      put(c, 'counter', x, r.y + 0.8, { label: 'Bürgerschalter' });
      staff(c, x, r.y + 0.3, 'clerk');
    }
    for (const [x, y] of cells({ x: r.x, y: r.y + 1.5, w: r.w, h: r.h - 1.5 }, 1.5, 1.2, 0.6).slice(0, 4)) put(c, 'bench', x, y, { label: 'Wartebereich' });
  }],
  offices: ['work', (r, c) => {
    for (const [x, y] of cells(r, 1.5, 1.4, 0.8)) {
      put(c, 'desk', x, y, { color: WOOD });
      staff(c, x, y + 0.55, 'analyst');
    }
  }],
  council: ['civic', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: 0x5a3a2a, w: Math.min(3, r.w - 1), label: 'Sitzungstisch' });
    put(c, 'flag', r.x + 0.4, r.y + 0.4, { color: c.accent });
  }],
  archive: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1, 1.5, 0.5)) put(c, 'bookshelf', x, y, { label: 'Archivregal' });
  }],
  workstations: ['safety', (r, c) => {
    for (const [x, y] of cells(r, 1.5, 1.4, 0.8)) {
      put(c, 'desk', x, y, { color: 0x3a4a68 });
      put(c, 'monitor', x + 0.2, y, { active: true, color: 0x19e6ff });
      staff(c, x, y + 0.55, 'guard');
    }
  }],
  briefing: ['safety', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: 0x3a3a48, label: 'Einsatzplanung' });
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: 0x19e6ff, w: Math.min(2, r.w - 0.4), label: 'Lagebild' });
  }],
  cells: ['safety', (r, c) => {
    for (const x of backRow(r, 1.3)) put(c, 'bars', x, r.y + 0.7, { label: 'Gewahrsamszelle' });
    staff(c, cx(r), far(r), 'guard');
  }],
  classroom: ['public', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.15, { color: 0x2a4a3a, w: Math.min(3, r.w - 0.4), label: 'Tafel' });
    for (const [x, y] of cells({ x: r.x, y: r.y + 1, w: r.w, h: r.h - 1 }, 1.1, 1.1, 0.6)) put(c, 'desk', x, y, { color: 0xb89a72, w: 0.7 });
    staff(c, cx(r), r.y + 0.7, 'clerk');
  }],
  teachers: ['work', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: WOOD });
    put(c, 'locker', r.x + 0.3, r.y + 0.3);
  }],
  library: ['public', (r, c) => {
    for (const x of backRow(r, 0.9)) put(c, 'bookshelf', x, r.y + 0.4, { label: 'Bücherregal' });
    put(c, 'table', cx(r), cy(r) + 0.5, { label: 'Lesetisch' });
  }],
  sanitary: ['condition', (r, c) => {
    put(c, 'toilet', r.x + 0.4, r.y + 0.4);
    put(c, 'sink', r.x + 1.2, r.y + 0.4);
    put(c, 'locker', r.x + r.w - 0.3, cy(r));
  }],
  lecture: ['public', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.15, { active: true, color: 0x7fa8d8, w: Math.min(4, r.w - 0.4), label: 'Projektion' });
    for (let y = r.y + 1.2; y <= r.y + r.h - 0.5; y += 0.9) put(c, 'seats', cx(r), y, { w: r.w - 0.8, label: 'Sitzreihe' });
    staff(c, cx(r), r.y + 0.7, 'researcher');
  }],
  seminars: ['public', (r, c) => {
    put(c, 'meetingtable', cx(r), cy(r), { color: 0xb89a72, label: 'Seminartisch' });
    put(c, 'screenwall', cx(r), r.y + 0.15, { color: 0x2a4a3a, w: Math.min(2, r.w - 0.4) });
  }],
  research: ['work', (r, c) => {
    put(c, 'labbench', cx(r), cy(r), { label: 'Forschung' });
    put(c, 'desk', r.x + 0.6, far(r), { color: WOOD, label: 'Verwaltung' });
    staff(c, cx(r), cy(r) + 0.6, 'researcher');
  }],
  // leisure & culture
  cinemahall: ['public', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.15, { active: true, color: 0xd8e8ff, w: Math.min(5, r.w - 0.4), label: 'Leinwand' });
    for (let y = r.y + 1.5; y <= r.y + r.h - 0.5; y += 0.8) put(c, 'seats', cx(r), y, { w: r.w - 0.8, color: 0x8a1a2a, label: 'Kinosessel' });
  }],
  foyer: ['public', (r, c) => {
    put(c, 'counter', r.x + 1, r.y + 0.8, { label: 'Kasse & Garderobe' });
    staff(c, r.x + 1, r.y + 0.3, 'reception');
    put(c, 'plant', r.x + r.w - 0.3, r.y + 0.3);
    put(c, 'mat', cx(r), far(r) + 0.1);
  }],
  snackbar: ['guests', (r, c) => {
    put(c, 'counter', cx(r), cy(r), { color: 0x8a2a3a, label: 'Snacktheke' });
    put(c, 'popcorn', cx(r) - 0.4, cy(r) - 0.6, { active: true, label: 'Popcornmaschine' });
    staff(c, cx(r) + 0.3, cy(r) - 0.6, 'service');
  }],
  stagehall: ['public', (r, c) => {
    put(c, 'stage', cx(r), r.y + 1, { w: r.w - 1, color: c.accent, label: 'Bühne / Ausstellung' });
    for (const [x, y] of cells({ x: r.x, y: r.y + 2.2, w: r.w, h: r.h - 2.2 }, 1.5, 1.2, 0.7)) put(c, 'pedestal', x, y, { color: c.accent, label: 'Exponat' });
  }],
  backstage: ['tech', (r, c) => {
    put(c, 'rack', r.x + 0.4, r.y + 0.5, { fill: 0.6, label: 'Requisiten' });
    put(c, 'console', cx(r), cy(r) + 0.3, { active: true, color: c.accent, label: 'Licht- & Tonpult' });
    staff(c, cx(r), cy(r) + 0.9, 'technician');
  }],
  servicearea: ['guests', (r, c) => {
    put(c, 'counter', cx(r), cy(r), { label: 'Bar' });
    put(c, 'coldcell', r.x + 0.4, r.y + 0.4);
    staff(c, cx(r), cy(r) - 0.6, 'service');
  }],
  cardio: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.1, 1.4, 0.6)) put(c, 'treadmill', x, y, { active: true, color: c.accent, label: 'Laufband' });
  }],
  weights: ['public', (r, c) => {
    for (const [x, y] of cells(r, 1.4, 1.4, 0.7)) put(c, 'weights', x, y, { label: 'Kraftstation' });
  }],
  field: ['public', (r, c) => {
    put(c, 'pitch', cx(r), cy(r) + 0.3, { w: r.w - 0.6, h: r.h - 1.6, label: 'Spielfläche' });
    put(c, 'seats', cx(r), r.y + 0.5, { w: r.w - 0.6, color: c.accent, label: 'Tribüne' });
    put(c, 'goal', r.x + 0.6, cy(r) + 0.3);
    put(c, 'goal', r.x + r.w - 0.6, cy(r) + 0.3);
  }],
  regie: ['tech', (r, c) => {
    put(c, 'console', cx(r), cy(r), { active: true, color: c.accent, label: 'Regiepult' });
    staff(c, cx(r), cy(r) + 0.6, 'technician');
  }],
  // transport hubs
  ticket: ['public', (r, c) => {
    put(c, 'counter', r.x + 0.9, r.y + 0.8, { label: 'Fahrkarten' });
    staff(c, r.x + 0.9, r.y + 0.3, 'clerk');
    for (const x of backRow({ ...r, x: r.x + 1.8, w: r.w - 1.8 }, 0.9)) put(c, 'turnstile', x, cy(r) + 0.5, { active: true, color: c.accent, label: 'Zugangssperre' });
  }],
  platform: ['public', (r, c) => {
    put(c, 'tracks', cx(r), far(r), { w: r.w, label: 'Gleis' });
    for (const x of backRow(r, 1.6)) put(c, 'bench', x, cy(r) - 0.3, { label: 'Wartebank' });
    put(c, 'screenwall', cx(r), r.y + 0.15, { active: true, color: 0xffb020, w: Math.min(3, r.w - 0.4), label: 'Abfahrtstafel' });
  }],
  opscontrol: ['tech', (r, c) => {
    put(c, 'screenwall', cx(r), r.y + 0.2, { active: true, color: c.accent, w: Math.min(3, r.w - 0.4), label: 'Streckenbild' });
    put(c, 'console', cx(r), cy(r) + 0.2, { active: true, color: c.accent, label: 'Betriebsleitung' });
    staff(c, cx(r), cy(r) + 0.8, 'dispatcher');
  }],
  kiosks: ['public', (r, c) => {
    put(c, 'shelf', r.x + 0.4, r.y + 0.5, { fill: 0.8, color: 0xffb020 });
    put(c, 'counter', cx(r) + 0.3, cy(r) + 0.2, { label: 'Kiosk' });
    staff(c, cx(r) + 0.3, cy(r) - 0.4, 'clerk');
  }],
  checkin: ['public', (r, c) => {
    for (const x of backRow(r, 1.4)) {
      put(c, 'counter', x, r.y + 0.8, { label: 'Abfertigungsschalter' });
      staff(c, x, r.y + 0.3, 'reception');
    }
    put(c, 'conveyor', cx(r), r.y + 1.5, { w: r.w - 0.6, active: true, label: 'Gepäckband' });
  }],
  hangar: ['tech', (r, c) => {
    put(c, 'shuttle', cx(r), cy(r), { color: 0xd8dce4, label: 'Raumfähre in Wartung' });
    put(c, 'lift', r.x + 0.6, far(r), { fill: 0.2 });
    staff(c, cx(r) + 1, far(r), 'technician');
  }],
  securitycheck: ['safety', (r, c) => {
    put(c, 'scanner', cx(r) - 0.5, cy(r), { active: true, color: 0xff3a5a, label: 'Körperscanner' });
    put(c, 'turnstile', cx(r) + 0.6, cy(r), { active: true, color: 0xff3a5a });
    staff(c, cx(r), cy(r) + 0.8, 'guard');
  }],
  shops: ['public', (r, c) => {
    for (const x of backRow(r, 1.6)) {
      put(c, 'shopfront', x + 0.2, r.y + 0.5, { color: [0xff2bd6, 0x19e6ff, 0x8cff3a, 0xffb020][Math.round(x) % 4], label: 'Ladenfläche' });
      staff(c, x + 0.2, r.y + 1.3, 'clerk');
    }
  }],
  foodcourt: ['guests', (r, c) => {
    put(c, 'counter', r.x + 0.8, r.y + 0.6, { label: 'Imbisstheke' });
    staff(c, r.x + 0.8, r.y + 0.2, 'cook');
    for (const [x, y] of cells({ x: r.x, y: r.y + 1.2, w: r.w, h: r.h - 1.2 }, 1.7, 1.5, 0.8)) {
      put(c, 'table', x, y);
      seat(c, x - 0.45, y);
      seat(c, x + 0.45, y);
    }
  }],
  concourse: ['public', (r, c) => {
    put(c, 'escalator', r.x + 1, cy(r), { label: 'Rolltreppe' });
    for (const x of backRow({ ...r, x: r.x + 2, w: r.w - 2 }, 1.8)) put(c, 'bench', x, cy(r) + 0.4);
    put(c, 'hologram', r.x + r.w - 0.8, r.y + 0.8, { color: c.accent, label: 'Wegweiser' });
    put(c, 'plant', cx(r), far(r));
  }],
  backarea: ['goods', (r, c) => {
    put(c, 'pallet', r.x + 0.6, r.y + 0.6, { fill: 0.7 });
    put(c, 'machine', cx(r) + 0.4, cy(r) + 0.3, { active: true, color: 0xffb020, label: 'Haustechnik' });
  }],
  // harbour & space
  dispo: ['goods', (r, c) => {
    put(c, 'console', cx(r), cy(r), { active: true, color: 0xffb020, label: 'Disposition' });
    put(c, 'desk', r.x + 0.6, far(r), { color: 0x4a5058 });
    staff(c, cx(r), cy(r) + 0.6, 'dispatcher');
  }],
  containers: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 1.3, 1.7, 0.8)) put(c, 'container', x, y, { color: [0xff8a1f, 0x19a0c8, 0xc83a3a, 0x3a8a5a][Math.round(x + y * 2) % 4], label: 'Container' });
    put(c, 'lanes', cx(r), cy(r), { w: r.w, h: r.h, color: 0xffd040 });
  }],
  cranecontrol: ['tech', (r, c) => {
    put(c, 'crane', cx(r), cy(r), { label: 'Portalkran' });
    put(c, 'console', r.x + 0.6, far(r), { active: true, color: 0xffb020, label: 'Kransteuerung' });
    staff(c, r.x + 1.1, far(r), 'technician');
  }],
  hullhall: ['work', (r, c) => {
    put(c, 'hull', cx(r), cy(r), { w: r.w - 1.2, label: 'Schiffsrumpf in Montage' });
    staff(c, r.x + 0.7, far(r), 'worker');
    staff(c, r.x + r.w - 0.7, far(r), 'worker');
  }],
  welding: ['work', (r, c) => {
    put(c, 'welder', cx(r), cy(r), { active: true, color: 0x7fd8ff, label: 'Schweißstation' });
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4) });
    staff(c, cx(r) + 0.6, cy(r) + 0.4, 'worker');
  }],
  yardcontrol: ['tech', (r, c) => {
    put(c, 'console', cx(r), cy(r), { active: true, color: c.accent, label: 'Werftleitstand' });
    staff(c, cx(r), cy(r) + 0.6, 'dispatcher');
  }],
  // water
  pumpsfilter: ['tech', (r, c) => {
    for (const x of backRow(r, 1.2)) put(c, 'pump', x, r.y + 0.6, { active: true, label: 'Pumpe' });
    put(c, 'filter', cx(r), far(r), { active: true, color: 0x19e6ff, label: 'Filterstufe' });
  }],
  basins: ['environment', (r, c) => {
    put(c, 'pool', cx(r), cy(r), { w: r.w - 0.8, h: r.h - 0.8, label: 'Wasserbecken' });
  }],
  measure: ['tech', (r, c) => {
    put(c, 'labbench', cx(r), cy(r), { label: 'Wasseranalyse' });
    put(c, 'console', r.x + 0.6, r.y + 0.6, { active: true, color: 0x19e6ff, label: 'Messwarte' });
    staff(c, cx(r), cy(r) + 0.6, 'technician');
  }],
  // farm & greenhouse
  plantrows: ['work', (r, c) => {
    for (let y = r.y + 0.6; y <= r.y + r.h - 0.4; y += 1) put(c, 'plantbed', cx(r), y, { w: r.w - 0.6, label: 'Pflanzreihe' });
    staff(c, r.x + 0.4, cy(r), 'worker');
  }],
  irrigation: ['tech', (r, c) => {
    put(c, 'tank', r.x + 0.7, r.y + 0.7, { color: 0x5a8ab0, label: 'Wassertank' });
    put(c, 'pump', cx(r) + 0.4, far(r), { active: true, label: 'Bewässerungspumpe' });
    put(c, 'pipes', cx(r), r.y + 0.3, { w: r.w - 1 });
  }],
  seedlings: ['work', (r, c) => {
    for (const x of backRow(r, 0.9)) put(c, 'rack', x, r.y + 0.45, { fill: 0.9, color: 0x5ac83a, label: 'Setzlinge' });
    put(c, 'desk', cx(r), far(r), { color: WOOD, label: 'Pikiertisch' });
  }],
  fertilizer: ['goods', (r, c) => {
    for (const [x, y] of cells(r, 0.9, 1, 0.5).slice(0, 4)) put(c, 'sack', x, y, { color: 0x6a8a3a, label: 'Dünger' });
    put(c, 'toolwall', cx(r), r.y + 0.15, { w: Math.min(2, r.w - 0.4) });
  }],
  // vet
  vetreception: ['public', (r, c) => {
    put(c, 'counter', r.x + 1, r.y + 0.8, { label: 'Empfang' });
    staff(c, r.x + 1, r.y + 0.3, 'reception');
    put(c, 'bench', cx(r) + 0.5, far(r), { label: 'Wartebank' });
  }],
  vettreat: ['work', (r, c) => {
    put(c, 'labbench', cx(r), cy(r), { color: WHITE, label: 'Behandlungstisch' });
    put(c, 'lamp', cx(r), cy(r) - 0.5, { label: 'Untersuchungsleuchte' });
    staff(c, cx(r) + 0.6, cy(r) + 0.4, 'researcher');
  }],
  kennels: ['work', (r, c) => {
    for (const x of backRow(r, 0.9)) put(c, 'cage', x, r.y + 0.5, { label: 'Tierbox' });
    put(c, 'labbench', cx(r), far(r), { label: 'Labor' });
  }],
  // bank
  counters: ['money', (r, c) => {
    for (const x of backRow(r, 1.5)) {
      put(c, 'counter', x, r.y + 0.8, { color: 0x4a3a20, label: 'Kundenschalter' });
      staff(c, x, r.y + 0.3, 'banker');
    }
    put(c, 'mat', cx(r), far(r) + 0.1);
  }],
  advice: ['money', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: WOOD, label: 'Beratungstisch' });
    put(c, 'plant', r.x + 0.3, r.y + 0.3);
    staff(c, cx(r), cy(r) - 0.6, 'banker');
  }],
  vault: ['money', (r, c) => {
    put(c, 'vaultdoor', r.x + 0.3, cy(r), { label: 'Tresortür' });
    for (const x of backRow({ ...r, x: r.x + 0.8, w: r.w - 0.8 }, 0.5)) put(c, 'locker', x, r.y + 0.3, { color: 0x9a9aa8, label: 'Schließfach' });
  }],
  backoffice: ['money', (r, c) => {
    put(c, 'desk', cx(r), cy(r), { color: 0x3a3a48 });
    put(c, 'monitor', cx(r) + 0.3, cy(r), { active: true, color: 0xffb020, label: 'Buchhaltung' });
    staff(c, cx(r), cy(r) - 0.6, 'analyst');
  }],
};

// ------------------------------------------------------------- archetypes

type Plan = 'grid' | 'hall' | 'side' | 'strip' | 'back' | 'center';

interface Design {
  plan: Plan;
  floor: FloorPattern;
  walls?: WallStyle;
  /** Recipes in the catalogue's zone order (generic maintenance zones excluded). */
  recipes: string[];
  /** Index (in `recipes`) of the room that gets the large area. */
  main?: number;
}

const D: Record<InteriorArchetype, Design> = {
  apartment: { plan: 'side', floor: 'planks', recipes: ['entrance', 'units', 'commons', 'techroom'], main: 1 },
  bakery: { plan: 'back', floor: 'tiles', recipes: ['bread', 'oven', 'dough', 'flourstore'], main: 0 },
  bank: { plan: 'hall', floor: 'terrazzo', recipes: ['counters', 'advice', 'vault', 'backoffice'] },
  bike: { plan: 'side', floor: 'concrete', recipes: ['bikestand', 'bikebench', 'parts', 'intake'] },
  cafe: { plan: 'hall', floor: 'planks', recipes: ['seating', 'espresso', 'cakes', 'scullery'] },
  cinema: { plan: 'center', floor: 'carpet', recipes: ['foyer', 'snackbar', 'cinemahall', 'techroom'], main: 2 },
  clinic: { plan: 'side', floor: 'tiles', recipes: ['reception', 'exam', 'treatment', 'pharmacy', 'nursestation'] },
  culture: { plan: 'center', floor: 'terrazzo', recipes: ['foyer', 'stagehall', 'backstage', 'servicearea'], main: 1 },
  data: { plan: 'strip', floor: 'metal', walls: 'metal', recipes: ['servers', 'network', 'cooling', 'secdesk'] },
  electronics: { plan: 'hall', floor: 'terrazzo', recipes: ['showroom', 'gaming', 'service', 'warehouse'] },
  energy: { plan: 'strip', floor: 'metal', walls: 'metal', recipes: ['generators', 'switchroom', 'maintenance', 'secdesk'] },
  factory: { plan: 'strip', floor: 'concrete', walls: 'metal', recipes: ['production', 'feed', 'qc', 'controlstand'] },
  farm: { plan: 'grid', floor: 'straw', walls: 'wood', recipes: ['stable', 'harvest', 'machineshop', 'admin'] },
  fire: { plan: 'side', floor: 'concrete', recipes: ['truckhall', 'lockers', 'dispatch', 'restroom'] },
  fitness: { plan: 'hall', floor: 'rubber', recipes: ['cardio', 'weights', 'lockers', 'reception'] },
  flower: { plan: 'hall', floor: 'tiles', recipes: ['flowers', 'binding', 'flowercold', 'checkout'] },
  food_stall: { plan: 'back', floor: 'planks', walls: 'wood', recipes: ['stallcounter', 'prep', 'cold', 'checkout'] },
  fuel: { plan: 'side', floor: 'asphalt', recipes: ['pumps', 'tankwatch', 'kiosks', 'securityzone'] },
  garage: { plan: 'side', floor: 'concrete', walls: 'metal', recipes: ['lifts', 'toolcart', 'parts', 'intake'] },
  government: { plan: 'hall', floor: 'terrazzo', recipes: ['citizenservice', 'offices', 'council', 'archive'] },
  greenhouse: { plan: 'strip', floor: 'soil', walls: 'glass', recipes: ['plantrows', 'irrigation', 'seedlings', 'fertilizer'] },
  hotel: { plan: 'side', floor: 'carpet', recipes: ['lobby', 'hotelrooms', 'breakfast', 'laundry'], main: 1 },
  house: { plan: 'grid', floor: 'planks', recipes: ['living', 'kitchenette', 'bedroom', 'bath'] },
  logistics: { plan: 'strip', floor: 'concrete', walls: 'metal', recipes: ['receiving', 'warehouse', 'picking', 'shipping'], main: 1 },
  mall: { plan: 'hall', floor: 'terrazzo', walls: 'glass', recipes: ['shops', 'foodcourt', 'concourse', 'backarea'], main: 2 },
  office: { plan: 'side', floor: 'carpet', walls: 'glass', recipes: ['reception', 'desks', 'meeting', 'serverbreak'], main: 1 },
  outdoor: { plan: 'side', floor: 'grass', recipes: ['maintenance'] },
  parking: { plan: 'side', floor: 'asphalt', walls: 'metal', recipes: ['stalls', 'paymachine', 'charging', 'maintenance'] },
  police: { plan: 'grid', floor: 'tiles', recipes: ['dispatch', 'workstations', 'briefing', 'cells'] },
  port: { plan: 'strip', floor: 'asphalt', walls: 'metal', recipes: ['dispo', 'containers', 'cranecontrol', 'securityzone'], main: 1 },
  recycling: { plan: 'strip', floor: 'concrete', walls: 'metal', recipes: ['sortline', 'processing', 'matstore', 'controlroom'] },
  refinery: { plan: 'side', floor: 'metal', walls: 'metal', recipes: ['pipefield', 'controlroom', 'samplelab', 'maintenance'] },
  research: { plan: 'grid', floor: 'tiles', walls: 'glass', recipes: ['labbenches', 'analyzers', 'samples', 'controlroom'] },
  restaurant: { plan: 'hall', floor: 'planks', recipes: ['dining', 'kitchen', 'bar', 'cold', 'staffroom'] },
  retail: { plan: 'hall', floor: 'tiles', recipes: ['storefloor', 'checkout', 'warehouse', 'consult'] },
  school: { plan: 'side', floor: 'planks', recipes: ['classroom', 'teachers', 'library', 'sanitary'] },
  shipyard: { plan: 'side', floor: 'concrete', walls: 'metal', recipes: ['hullhall', 'welding', 'matstore', 'yardcontrol'] },
  spaceport: { plan: 'center', floor: 'metal', walls: 'metal', recipes: ['checkin', 'controlroom', 'hangar', 'securitycheck'], main: 2 },
  sports: { plan: 'center', floor: 'rubber', recipes: ['field', 'lockers', 'regie', 'snackbar'] },
  station: { plan: 'hall', floor: 'terrazzo', recipes: ['ticket', 'platform', 'opscontrol', 'kiosks'], main: 1 },
  university: { plan: 'side', floor: 'planks', recipes: ['lecture', 'seminars', 'library', 'research'] },
  vegetables: { plan: 'hall', floor: 'tiles', walls: 'wood', recipes: ['produce', 'scale', 'fresh', 'delivery'] },
  vet: { plan: 'side', floor: 'tiles', recipes: ['vetreception', 'vettreat', 'kennels', 'pharmacy'] },
  water: { plan: 'strip', floor: 'concrete', walls: 'metal', recipes: ['pumpsfilter', 'basins', 'measure', 'maintenance'], main: 1 },
};

/** Catalogue zones that every archetype may carry on top of its rooms. */
const GENERIC_ZONES = new Set(['objektzustand_wartung', 'technik_inspektionspunkt', 'wartung_technik']);

const REGION_LOOK: Record<RegionId, { accent: number; wall: number; walls: WallStyle; tint: number }> = {
  greenhaven: { accent: 0xffb020, wall: 0x8a4a38, walls: 'brick', tint: 0xc89060 },
  silverbrook: { accent: 0x19e6ff, wall: 0x9a948a, walls: 'plaster', tint: 0xd8d0c0 },
  neon_central: { accent: 0xff2bd6, wall: 0x34304a, walls: 'glass', tint: 0x6a4aa8 },
  nova_eclipse: { accent: 0xff8a1f, wall: 0x4a5058, walls: 'metal', tint: 0x5a7088 },
};

const FLOOR_BASE: Record<FloorPattern, number> = {
  planks: 0x7a5a3c,
  tiles: 0x9a9890,
  concrete: 0x6a6a6e,
  carpet: 0x4a3448,
  terrazzo: 0x5a5660,
  metal: 0x4a5058,
  asphalt: 0x3a3a40,
  grass: 0x3a7a3a,
  soil: 0x5a4030,
  straw: 0x9a8040,
  rubber: 0x34343c,
};

function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Room size for a footprint. */
function roomSize(b: Building): [number, number] {
  const area = b.w * b.h;
  if (area <= 1) return [7, 6];
  if (area <= 2) return [9, 6];
  if (area <= 4) return [10, 8];
  if (area <= 9) return [12, 9];
  return [14, 10];
}

/** Splits the room into one rectangle per zone; index 0 gets the main area. */
function planRects(plan: Plan, W: number, H: number, n: number): Rect[] {
  const g = 0.15;
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  const split = (r: Rect, k: number, along: 'x' | 'y'): Rect[] =>
    Array.from({ length: k }, (_, i) =>
      along === 'x'
        ? { x: r.x + (r.w / k) * i + (i > 0 ? g : 0), y: r.y, w: r.w / k - (i > 0 ? g : 0), h: r.h }
        : { x: r.x, y: r.y + (r.h / k) * i + (i > 0 ? g : 0), w: r.w, h: r.h / k - (i > 0 ? g : 0) },
    );
  switch (plan) {
    case 'hall': {
      const back = Math.max(2.2, H * 0.36);
      return [{ x: 0, y: back + g, w: W, h: H - back - g }, ...split({ x: 0, y: 0, w: W, h: back }, n - 1, 'x')];
    }
    case 'side': {
      const main = W * 0.56;
      return [{ x: 0, y: 0, w: main, h: H }, ...split({ x: main + g, y: 0, w: W - main - g, h: H }, n - 1, 'y')];
    }
    case 'strip': {
      const main = W / n + W * 0.12;
      return [{ x: 0, y: 0, w: main, h: H }, ...split({ x: main + g, y: 0, w: W - main - g, h: H }, n - 1, 'x')];
    }
    case 'back': {
      const front = H * 0.55;
      return [{ x: 0, y: H - front, w: W, h: front }, ...split({ x: 0, y: 0, w: W, h: H - front - g }, n - 1, 'x')];
    }
    case 'center': {
      const mw = W * 0.66;
      const mh = H * 0.7;
      const rest = n - 1;
      const right = Math.ceil(rest / 2);
      const out: Rect[] = [{ x: 0, y: 0, w: mw, h: mh }];
      out.push(...split({ x: mw + g, y: 0, w: W - mw - g, h: H }, right, 'y'));
      if (rest - right > 0) out.push(...split({ x: 0, y: mh + g, w: mw, h: H - mh - g }, rest - right, 'x'));
      return out;
    }
    case 'grid':
    default: {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const out: Rect[] = [];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
        const col = i - row * cols;
        const w = W / inRow;
        const h = H / rows;
        out.push({ x: col * w + (col > 0 ? g : 0), y: row * h + (row > 0 ? g : 0), w: w - (col > 0 ? g : 0), h: h - (row > 0 ? g : 0) });
      }
      return out;
    }
  }
}

// ------------------------------------------------------------- people

const ROLE_OF_TOPIC: Partial<Record<Topic, FigureRole>> = { work: 'worker' };

interface People {
  residents: Citizen[];
  athome: Citizen[];
  workers: Citizen[];
  atwork: Citizen[];
  guests: number;
}

function peopleOf(b: Building, state: GameState): People {
  const residents: Citizen[] = [];
  const workers: Citizen[] = [];
  for (const c of state.population.citizens) {
    if (c.homeBuildingId === b.id) residents.push(c);
    if (c.workBuildingId === b.id) workers.push(c);
  }
  return {
    residents,
    athome: residents.filter((c) => c.activity === 'home' || c.activity === 'sleep'),
    workers,
    atwork: workers.filter((c) => c.activity === 'work'),
    guests: state.competitors[b.id] ? (state.population.pendingVisits[b.id] ?? 0) : 0,
  };
}

const ACTIVITY_LABEL: Record<Citizen['activity'], string> = { sleep: 'schläft', commute: 'unterwegs', work: 'arbeitet', eat: 'isst auswärts', leisure: 'in der Freizeit', home: 'zu Hause' };

// ------------------------------------------------------------- scene

/** Interior of a city building from its catalogue entry; null when the sprite id has none. */
export function cityInteriorScene(b: Building, state: GameState, spriteId: string | null | undefined): InteriorScene | null {
  if (!spriteId) return null;
  const entry = cityInterior(spriteId);
  if (!entry) return null;
  const district = state.districts[b.districtId];
  if (!district) return null;
  const region = regionOfDistrict(state, district.id);
  return entry.technical ? technicalScene(b, state, entry, region) : roomScene(b, state, entry, region);
}

function newScene(b: Building, entry: CityInteriorEntry, region: RegionId, W: number, H: number, floor: FloorPattern, walls: WallStyle | null, subtitle: string): InteriorScene {
  const look = REGION_LOOK[region];
  return {
    width: W,
    height: H,
    title: b.owner === 'city' ? entry.name : b.label,
    subtitle,
    floorColor: mixColor(FLOOR_BASE[floor], look.tint, floor === 'grass' || floor === 'soil' ? 0.1 : 0.22),
    wallColor: look.wall,
    accent: look.accent,
    facing: b.facing,
    open: true,
    zones: [],
    props: [],
    figures: [],
    cleanliness: b.property ? b.property.condition / 100 : 0.9,
    floorPattern: floor,
    wallStyle: walls ?? undefined,
    openAir: walls === null,
    hazard: region === 'nova_eclipse',
    lighting: region,
  };
}

function statusOf(topic: Topic, b: Building, state: GameState, p: People): { status: string; details: string[] } {
  const d = state.districts[b.districtId]!;
  const st = d.stats;
  const comp = state.competitors[b.id];
  switch (topic) {
    case 'home':
      return p.residents.length > 0
        ? { status: `${p.athome.length} von ${p.residents.length} Bewohnern zu Hause`, details: [`Bewohner: ${p.residents.length}`, `Zu Hause: ${p.athome.length}`, `Mietindex im Bezirk: ${Math.round(st.rentIndex)} ¢`] }
        : { status: 'Keine gemeldeten Bewohner', details: [`Bewohner: 0`, `Mietindex im Bezirk: ${Math.round(st.rentIndex)} ¢`] };
    case 'work':
      return { status: `${p.atwork.length} von ${p.workers.length} Beschäftigten im Dienst`, details: [`Beschäftigte: ${p.workers.length}`, `Gerade im Dienst: ${p.atwork.length}`, `Beschäftigte im Bezirk: ${d.economy.employed}`] };
    case 'guests':
      return comp
        ? { status: `${p.guests} Gäste diese Stunde · Ruf ${Math.round(comp.reputation)}`, details: [`Betrieb: ${comp.name}`, `Gäste diese Stunde: ${p.guests}`, `Bedient heute: ${comp.servedToday}`, `Qualität ${Math.round(comp.quality)} · Preisniveau ×${comp.priceLevel.toFixed(2)}`] }
        : { status: `Laufkundschaft ${Math.round(st.traffic)}/100`, details: [`Verkehr im Bezirk: ${Math.round(st.traffic)}/100`, `Kaufkraft: ${Math.round(st.purchasingPower)}/100`] };
    case 'public':
      return { status: `Kaufkraft ${Math.round(st.purchasingPower)} · Verkehr ${Math.round(st.traffic)}`, details: [`Kaufkraft im Bezirk: ${Math.round(st.purchasingPower)}/100`, `Verkehr: ${Math.round(st.traffic)}/100`, `Attraktivität: ${Math.round(st.attractiveness)}/100`] };
    case 'tech':
      return { status: `Strom ${Math.round(st.energySupply)} · Wasser ${Math.round(st.water)}`, details: [`Stromversorgung: ${Math.round(st.energySupply)}/100`, `Wasser: ${Math.round(st.water)}/100`, `Infrastruktur: ${Math.round(st.infrastructure)}/100`] };
    case 'safety':
      return { status: `Kriminalität ${Math.round(st.crime)} · Polizei ${Math.round(st.policePresence)}`, details: [`Kriminalität im Bezirk: ${Math.round(st.crime)}/100`, `Polizeipräsenz: ${Math.round(st.policePresence)}/100`] };
    case 'goods':
      return { status: `Infrastruktur ${Math.round(st.infrastructure)}/100`, details: [`Infrastruktur im Bezirk: ${Math.round(st.infrastructure)}/100`, `Verkehr: ${Math.round(st.traffic)}/100`] };
    case 'money':
      return { status: `Kaufkraft ${Math.round(st.purchasingPower)} · Ausgaben ${Math.round(d.economy.dailySpending).toLocaleString('de-DE')} ¢/Tag`, details: [`Kaufkraft im Bezirk: ${Math.round(st.purchasingPower)}/100`, `Ausgaben der Bürger: ${Math.round(d.economy.dailySpending).toLocaleString('de-DE')} ¢ pro Tag`, `Löhne: ${Math.round(d.economy.dailyWages).toLocaleString('de-DE')} ¢ pro Tag`] };
    case 'environment':
      return { status: `Umweltbelastung ${Math.round(st.pollution)}/100`, details: [`Umweltbelastung im Bezirk: ${Math.round(st.pollution)}/100`, `Stromversorgung: ${Math.round(st.energySupply)}/100`] };
    case 'civic':
      return { status: `Einfluss ${Math.round(st.politicalInfluence)} · Korruption ${Math.round(st.corruption)}`, details: [`Politischer Einfluss: ${Math.round(st.politicalInfluence)}/100`, `Korruption: ${Math.round(st.corruption)}/100`, `Einwohner im Bezirk: ${Math.round(st.population)}`] };
    case 'condition':
    default:
      return b.property
        ? { status: `Zustand ${Math.round(b.property.condition)}/100`, details: [`Zustand: ${Math.round(b.property.condition)}/100`, `${b.floors} Etagen · ${b.w}×${b.h} Felder`] }
        : { status: `${b.floors} ${b.floors === 1 ? 'Etage' : 'Etagen'} · ${b.w}×${b.h} Felder`, details: [`${b.floors} ${b.floors === 1 ? 'Etage' : 'Etagen'}, ${b.w}×${b.h} Felder`, `Infrastruktur im Bezirk: ${Math.round(st.infrastructure)}/100`, 'Zustandswerte gibt es nach dem Kauf.'] };
  }
}

function roomScene(b: Building, state: GameState, entry: CityInteriorEntry, region: RegionId): InteriorScene {
  const design = D[entry.archetype];
  const look = REGION_LOOK[region];
  const [W, H] = roomSize(b);
  const people = peopleOf(b, state);
  const counts = [people.residents.length > 0 ? `${people.residents.length} Bewohner` : null, people.workers.length > 0 ? `${people.workers.length} Beschäftigte` : null].filter(Boolean).join(' · ');
  const district = state.districts[b.districtId]!;
  const outdoor = entry.archetype === 'outdoor';
  const s = newScene(b, entry, region, W, H, design.floor, outdoor ? null : (design.walls ?? look.walls), `${district.name}${counts ? ` · ${counts}` : ''}`);
  const c: Ctx = { s, staff: [], home: [], beds: [], seats: [], accent: look.accent, region };

  // Zones: the archetype's rooms first (main room leading), generic zones after.
  const rooms = entry.zones.filter((z) => !GENERIC_ZONES.has(z.id));
  const generic = entry.zones.filter((z) => GENERIC_ZONES.has(z.id));
  const assigned = rooms.map((z, i) => ({ zone: z, recipe: outdoor ? 'interaction' : (design.recipes[i] ?? 'maintenance') }));
  for (const z of generic) assigned.push({ zone: z, recipe: 'maintenance' });
  const main = Math.min(design.main ?? 0, Math.max(0, rooms.length - 1));
  const order = [main, ...assigned.map((_, i) => i).filter((i) => i !== main)];
  const rects = planRects(outdoor ? 'side' : design.plan, W, H, assigned.length);
  const zoneRects: { idx: number; rect: Rect; topic: Topic }[] = [];
  order.forEach((idx, k) => {
    const a = assigned[idx]!;
    const rect = rects[k]!;
    if (a.recipe === 'interaction') {
      outdoorObject(c, rect, entry, spriteKey(entry));
      zoneRects.push({ idx, rect, topic: 'public' });
      return;
    }
    const recipe = R[a.recipe] ?? R.maintenance!;
    recipe[1](rect, c);
    zoneRects.push({ idx, rect, topic: recipe[0] });
  });

  placePeople(c, people);

  for (const { idx, rect, topic } of zoneRects.sort((x, y) => x.idx - y.idx)) {
    const a = assigned[idx]!;
    const { status, details } = statusOf(topic, b, state, people);
    const here = s.figures.filter((f) => f.x >= rect.x && f.x <= rect.x + rect.w && f.y >= rect.y && f.y <= rect.y + rect.h && f.role !== 'guest').map((f) => f.name);
    if (here.length) details.push(`Hier: ${here.slice(0, 6).join(', ')}${here.length > 6 ? ` und ${here.length - 6} weitere` : ''}`);
    const zone: Zone = { label: a.zone.name, x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h), color: zoneColor(topic, look.accent), status, details, interactive: a.zone.interactive };
    s.zones.push(zone);
  }
  if (!outdoor) put(c, 'neon', W * 0.55, 0, { color: look.accent });
  return s;
}

function zoneColor(topic: Topic, accent: number): number {
  switch (topic) {
    case 'home':
      return 0xffd27a;
    case 'work':
      return 0xff8a1f;
    case 'guests':
      return 0xff2bd6;
    case 'tech':
      return 0x19e6ff;
    case 'safety':
      return 0xff3a5a;
    case 'goods':
      return 0x8cff3a;
    case 'money':
      return 0xffb020;
    case 'environment':
      return 0x5ac83a;
    case 'civic':
      return 0xc08aff;
    default:
      return accent;
  }
}

/** Puts the real people on the spots the furniture offers. */
function placePeople(c: Ctx, p: People): void {
  const MAX = 18;
  const fig = (spot: Spot, name: string, note: string, role: FigureRole, offset: number): void => {
    if (c.s.figures.length >= MAX) return;
    c.s.figures.push({ role, x: round(spot.x + offset * 0.5), y: round(spot.y + offset * 0.3), seated: spot.seated, lying: spot.lying, wander: spot.seated || spot.lying ? 0 : 0.5, name, note });
  };
  const staffSpots = c.staff.length ? c.staff : [{ x: c.s.width / 2, y: c.s.height / 2, role: ROLE_OF_TOPIC.work ?? 'worker' }];
  p.atwork.forEach((w, i) => {
    const spot = staffSpots[i % staffSpots.length]!;
    fig(spot, w.name, ACTIVITY_LABEL[w.activity], spot.role, Math.floor(i / staffSpots.length));
  });
  const sleeping = p.athome.filter((r) => r.activity === 'sleep');
  const awake = p.athome.filter((r) => r.activity !== 'sleep');
  const bedSpots = c.beds.length ? c.beds : c.home;
  sleeping.forEach((r, i) => {
    const spot = bedSpots[i % Math.max(1, bedSpots.length)] ?? { x: 1, y: 1, role: 'resident' as FigureRole };
    fig({ ...spot, lying: c.beds.length > 0 }, r.name, ACTIVITY_LABEL.sleep, 'resident', Math.floor(i / Math.max(1, bedSpots.length)));
  });
  const homeSpots = c.home.length ? c.home : [{ x: c.s.width - 1, y: c.s.height - 1, role: 'resident' as FigureRole }];
  awake.forEach((r, i) => {
    const spot = homeSpots[i % homeSpots.length]!;
    fig(spot, r.name, ACTIVITY_LABEL.home, 'resident', Math.floor(i / homeSpots.length));
  });
  for (let i = 0; i < Math.min(p.guests, c.seats.length); i++) {
    const spot = c.seats[i]!;
    fig(spot, `Gast ${i + 1}`, 'Gast in diesem Lokal', 'guest', 0);
  }
}

function spriteKey(entry: CityInteriorEntry): string {
  return entry.name.toLowerCase();
}

/** The object of an open-air or technical entry, picked by its name. */
function outdoorObject(c: Ctx, r: Rect, entry: CityInteriorEntry, key: string): void {
  const x = cx(r);
  const y = cy(r);
  const label = entry.name;
  const has = (...words: string[]): boolean => words.some((w) => key.includes(w));
  if (has('wasserturm')) put(c, 'tank', x, y, { color: 0x8a9aa8, w: 1.6, label });
  else if (has('windrad')) put(c, 'turbine', x, y, { label });
  else if (has('solar')) {
    for (const [px, py] of cells(r, 1.2, 1.2, 0.8).slice(0, 6)) put(c, 'solarpanel', px, py, { label });
  } else if (has('brunnen')) put(c, 'pool', x, y, { w: Math.min(2.4, r.w - 1), h: Math.min(2.4, r.h - 1), label, active: true });
  else if (has('baum', 'grün', 'gruen', 'park', 'garten')) {
    for (const [px, py] of cells(r, 1.3, 1.3, 0.8).slice(0, 7)) put(c, 'tree', px, py, { label });
  } else if (has('briefkasten')) put(c, 'mailbox', x, y, { label });
  else if (has('spielplatz')) {
    put(c, 'swing', x - 0.6, y, { label });
    put(c, 'pitch', x + 0.8, y + 0.4, { w: 1.4, h: 1.4, color: 0xd8c080, label: 'Sandkasten' });
  } else if (has('werbe', 'fernseh', 'turm', 'medien')) put(c, 'screenwall', x, y, { active: true, color: c.accent, w: Math.min(3, r.w - 0.4), label });
  else if (has('sitzbank', 'bank')) put(c, 'bench', x, y, { label });
  else if (has('skulptur', 'denkmal', 'statue')) put(c, 'pedestal', x, y, { color: c.accent, label });
  else if (has('container')) put(c, 'container', x, y, { color: 0xff8a1f, label });
  else if (has('kiste', 'palette', 'material')) {
    for (const [px, py] of cells(r, 1, 1, 0.8).slice(0, 4)) put(c, 'pallet', px, py, { fill: 0.7, color: 0x8a6a3a, label });
  } else if (has('mast', 'flutlicht', 'laterne')) put(c, 'lamp', x, y, { label, w: 2 });
  else if (has('kran')) put(c, 'crane', x, y, { label });
  else if (has('pumpe')) put(c, 'pump', x, y, { active: true, label });
  else if (has('fässer', 'faesser', 'fass')) {
    for (const [px, py] of cells(r, 0.7, 0.7, 0.9).slice(0, 6)) put(c, 'barrel', px, py, { label });
  } else if (has('zaun', 'mauer')) put(c, 'fence', x, y, { w: r.w - 0.6, label });
  else if (has('gleis')) put(c, 'tracks', x, y, { w: r.w, label });
  else if (has('dock')) put(c, 'hull', x, y, { w: r.w - 1.2, label });
  else if (has('werkzeug')) {
    put(c, 'container', x, y, { color: 0x4a6a8a, label });
    put(c, 'toolwall', x, r.y + 0.15, { w: Math.min(2, r.w - 0.4) });
  } else {
    put(c, 'bench', x - 0.7, y, { label: 'Sitzbank' });
    put(c, 'tree', x + 0.8, y - 0.4, { label });
    put(c, 'lamp', x, y + 0.9, { w: 1 });
  }
}

/** Technical detail: one object on an inspection pad, no rooms. */
function technicalScene(b: Building, state: GameState, entry: CityInteriorEntry, region: RegionId): InteriorScene {
  const W = b.w * b.h >= 4 ? 8 : 6;
  const H = b.w * b.h >= 4 ? 7 : 5;
  const key = spriteKey(entry);
  const floor: FloorPattern = /baum|grün|gruen|brunnen|spielplatz|skulptur|sitzbank/.test(key) ? 'grass' : region === 'nova_eclipse' ? 'asphalt' : 'concrete';
  const district = state.districts[b.districtId]!;
  const s = newScene(b, entry, region, W, H, floor, null, `${district.name} · Objektansicht`);
  const look = REGION_LOOK[region];
  const c: Ctx = { s, staff: [], home: [], beds: [], seats: [], accent: look.accent, region };
  const rect: Rect = { x: 0.6, y: 0.6, w: W - 1.2, h: H - 1.2 };
  outdoorObject(c, rect, entry, key);
  const people = peopleOf(b, state);
  const zone = entry.zones[0];
  const { status, details } = statusOf('condition', b, state, people);
  s.zones.push({ label: zone?.name ?? 'Objektzustand / Wartung', x: rect.x, y: rect.y, w: rect.w, h: rect.h, color: look.accent, status, details, interactive: zone?.interactive ?? false });
  return s;
}

/** For tests and the inspector: true when the sprite id has an interior. */
export function hasCityInterior(spriteId: string | null | undefined): boolean {
  return !!spriteId && cityInterior(spriteId) !== null;
}
