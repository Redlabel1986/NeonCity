/**
 * Simulation engine: owns the state, applies commands, advances time in
 * fixed one-minute ticks. No React, no rendering, no persistence here.
 */

import { Rng, hashSeed } from './core/rng';
import { EventBus, type SimEvent } from './core/events';
import type { SimContext } from './core/context';
import { isDayBoundary, isHourBoundary, tickToDate } from './core/clock';
import { generateCity } from './world/generator';
import { createLedger, book, closeDay } from './economy/finance';
import { BACKGROUNDS, DIFFICULTIES, type BackgroundId, type DifficultyId } from './data/difficulty';
import { BUILDING_DEFINITIONS } from './data/buildings';
import { placeBuilding, removeBuilding, stepConstruction, PLACEMENT_ERROR_TEXT } from './systems/construction';
import { stepBusinessHour, closeBusinessDay, priceBounds, clamp, startUpgrade, stepUpgrades } from './systems/business';
import { placeOrder } from './systems/inventory';
import { hire, fire, setWage } from './systems/staff';
import { SUPPLIERS } from './data/suppliers';
import { INGREDIENTS } from './data/ingredients';
import { createTaskStates, stepTasks } from './systems/tasks';
import { createPopulation, generateCitizens, stepPopulationHour, closePopulationDay } from './systems/population';
import { createCompetitorsForCity, stepCompetitorsHour, closeCompetitorsDay } from './systems/competitors';
import { createMarket, closeMarketDay } from './systems/market';
import { stepHotelsHour, closeHotelsDay, hotelPriceBounds } from './systems/hotel';
import { stepTransportHour, closeTransportDay, buyVehicle, sellVehicle, fareBounds } from './systems/transport';
import { stepRetailHour, closeRetailDay, retailPriceBounds } from './systems/retail';
import { buyProperty, sellProperty, setRentLevel, renovate, takeoverCompetitor, closePropertyDay } from './systems/property';
import { stockHolderOf } from './systems/inventory';
import { createUnderworld, foundOrganisation, recruit, dismiss, startOperation, cancelOperation, bribe, negotiateTruce, setLaunderingRate, stepUnderworldHour, closeUnderworldDay } from './systems/underworld';
import { closeSecurityDay, assignPatrol, startInvestigation } from './systems/security';
import { createFactions, closeFactionsDay, supportFaction, activeEffect } from './systems/factions';
import { createPolitics, closePoliticsDay, proposeLaw, districtInitiative } from './systems/politics';
import { createDecisionState, resolveDecision, expireDecisions } from './systems/decisions';
import { laborState } from './systems/staff';
import { createResearchState, startResearch, closeLabsDay } from './systems/research';
import { closeIndustryDay, setLine, removeLine, setSurplusPolicy } from './systems/industry';
import { createCorporateState, closeCorporateDay, takeLoan, repayLoan, sellShares, buyBackShares, setInsurance, chainTakeover, sellCompany, stepMegacorp } from './systems/corporate';
import { createCrisisState, closeCrisisDay, crisisFactors, activeCrisis } from './systems/crises';
import { createWeather, stepWeatherHour } from './systems/weather';
import type { FactionId } from './data/factions';
import { wantedLevelFor } from './data/underworld';
import { LOG_LIMIT, type GameState } from './state';

export const SAVE_FORMAT_VERSION = 9;
export const SPEEDS = [0, 1, 3, 8] as const;
export type Speed = (typeof SPEEDS)[number];

export interface NewGameOptions {
  seed: string | number;
  playerName: string;
  difficulty: DifficultyId;
  background: BackgroundId;
  citySize?: number;
}

export type Command =
  | { type: 'placeBuilding'; defId: string; x: number; y: number }
  | { type: 'undoPlacement' }
  | { type: 'demolish'; buildingId: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setMenuPrice'; buildingId: number; recipeId: string; price: number }
  | { type: 'toggleMenuItem'; buildingId: number; recipeId: string; enabled: boolean }
  | { type: 'placeOrder'; buildingId: number; supplierId: string; items: { ingredientId: string; units: number }[] }
  | { type: 'setAutoReorder'; buildingId: number; enabled: boolean; supplierId?: string; targets?: Record<string, number> }
  | { type: 'hire'; buildingId: number; candidateId: number }
  | { type: 'fire'; buildingId: number; employeeId: number }
  | { type: 'setWage'; buildingId: number; employeeId: number; wage: number }
  | { type: 'startUpgrade'; buildingId: number; upgradeId: string }
  | { type: 'setRoomPrice'; buildingId: number; price: number }
  | { type: 'setFare'; buildingId: number; fare: number }
  | { type: 'buyVehicle'; buildingId: number }
  | { type: 'sellVehicle'; buildingId: number; vehicleId: number }
  | { type: 'setGoodPrice'; buildingId: number; goodId: string; price: number }
  | { type: 'buyProperty'; buildingId: number }
  | { type: 'sellProperty'; buildingId: number }
  | { type: 'setRentLevel'; buildingId: number; level: number }
  | { type: 'renovate'; buildingId: number }
  | { type: 'takeoverCompetitor'; buildingId: number }
  | { type: 'foundOrganisation'; name: string }
  | { type: 'recruitCrew'; candidateId: number }
  | { type: 'dismissCrew'; memberId: number }
  | { type: 'startOperation'; operationId: string; districtId: number; frontBuildingId?: number }
  | { type: 'cancelOperation'; operationId: number }
  | { type: 'bribe'; amount: number }
  | { type: 'negotiateTruce'; familyIndex: number; tribute: number }
  | { type: 'setLaunderingRate'; rate: number }
  | { type: 'assignPatrol'; buildingId: number; districtId: number; guards: number }
  | { type: 'startInvestigation'; buildingId: number; familyIndex: number }
  | { type: 'supportFaction'; factionId: FactionId; amount: number }
  | { type: 'proposeLaw'; lawId: string; value: number }
  | { type: 'districtInitiative'; districtId: number; kind: 'infrastructure' | 'safety' | 'beauty' }
  | { type: 'resolveDecision'; decisionId: number; optionId: string }
  | { type: 'startResearch'; buildingId: number; nodeId: string }
  | { type: 'setLine'; buildingId: number; lineId: number | null; recipeId: string; targetPerDay: number }
  | { type: 'removeLine'; buildingId: number; lineId: number }
  | { type: 'setSurplusPolicy'; buildingId: number; sellSurplus: boolean; reserve?: Record<string, number> }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; loanId: number; amount: number }
  | { type: 'sellShares'; share: number }
  | { type: 'buyBackShares'; share: number }
  | { type: 'setInsurance'; policyId: string; active: boolean }
  | { type: 'chainTakeover'; districtId: number }
  | { type: 'sellCompany' }
  | { type: 'newCareer'; background: BackgroundId; name: string }
  | { type: 'rename'; buildingId: number; label: string };

export type CommandResult = { ok: true } | { ok: false; error: string };

export function createNewGame(options: NewGameOptions): GameState {
  const seed = typeof options.seed === 'string' ? hashSeed(options.seed.trim() || 'nova') : options.seed >>> 0;
  const rng = new Rng(seed);
  const city = generateCity(seed, options.citySize);
  const difficulty = DIFFICULTIES[options.difficulty];
  const background = BACKGROUNDS[options.background];
  const homeDistrict = city.districts.find((d) => d.archetype === background.homeDistrict) ?? city.districts[0]!;
  const startingCredits = Math.max(2000, difficulty.startingCredits + background.creditsBonus);

  const state: GameState = {
    version: SAVE_FORMAT_VERSION,
    seed,
    rng: rng.toJSON(),
    tick: 0,
    speed: 1,
    grid: city.grid,
    districts: city.districts,
    buildings: city.buildings,
    nextBuildingId: city.nextBuildingId,
    ledger: createLedger(startingCredits),
    player: {
      name: options.playerName.trim() || 'Unbekannt',
      background: background.id,
      difficulty: difficulty.id,
      apartmentRent: Math.round(background.apartmentRent * difficulty.rentMultiplier),
      homeDistrictId: homeDistrict.id,
      reputation: 10,
      wantedLevel: 0,
    },
    log: [],
    nextLogId: 1,
    tasks: createTaskStates(),
    undoStack: [],
    population: createPopulation(),
    competitors: {},
    market: createMarket(),
    lastCompetitorExpansionDay: 0,
    underworld: { org: null, heat: 0, lockdownUntilDay: 0, rivals: [], recentBribes: 0 },
    factions: createFactions(),
    politics: createPolitics(),
    decisions: createDecisionState(),
    corporate: createCorporateState(`${options.playerName.trim() || 'Unbekannt'} Holdings`),
    research: createResearchState(),
    crisis: createCrisisState(),
    weather: createWeather(),
    meta: { createdAt: Date.now(), cityName: 'Nova Eclipse' },
  };
  const worldRng = rng.fork('population');
  createCompetitorsForCity(state, worldRng, 0);
  generateCitizens(state, worldRng);
  state.underworld = createUnderworld(state, worldRng);
  const perks = background.perks;
  if (perks) {
    if (perks.startDirty) state.ledger.dirtyBalance = perks.startDirty;
    if (perks.startInfluence) state.politics.influence = perks.startInfluence;
    for (const [id, value] of Object.entries(perks.relations ?? {})) {
      const f = state.factions.find((x) => x.id === id);
      if (f && value !== undefined) f.relation = value;
    }
  }
  state.rng = rng.toJSON();
  return state;
}

/** Starts a new career in the same city: new background, perks and home; money and city state stay. */
function startNewCareer(ctx: SimContext, backgroundId: BackgroundId, name: string): CommandResult {
  const { state, events } = ctx;
  const background = BACKGROUNDS[backgroundId];
  if (!background) return { ok: false, error: 'Unbekannter Hintergrund.' };
  const assets = Object.values(state.buildings).filter((b) => b.owner === 'player' && (b.business || b.property));
  if (assets.length > 0) return { ok: false, error: 'Verkaufe zuerst die Unternehmensgruppe.' };
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const home = state.districts.find((d) => d.archetype === background.homeDistrict) ?? state.districts[0]!;
  state.player.name = name.trim() || state.player.name;
  state.player.background = backgroundId;
  state.player.apartmentRent = Math.round(background.apartmentRent * difficulty.rentMultiplier);
  state.player.homeDistrictId = home.id;
  state.player.reputation = 10;
  state.ledger.balance = Math.round(state.ledger.balance + background.creditsBonus * 0.5);
  state.corporate = { ...createCorporateState(`${state.player.name} Holdings`), careers: state.corporate.careers + 1 };
  state.research.progress = {};
  state.underworld.heat = Math.max(0, state.underworld.heat - 30);
  for (const f of state.factions) f.relation = Math.round(f.relation * 0.3);
  const perks = background.perks;
  if (perks) {
    if (perks.startDirty) state.ledger.dirtyBalance = perks.startDirty;
    if (perks.startInfluence) state.politics.influence = Math.max(state.politics.influence * 0.5, perks.startInfluence);
    for (const [id, value] of Object.entries(perks.relations ?? {})) {
      const f = state.factions.find((x) => x.id === id);
      if (f && value !== undefined) f.relation = value;
    }
  }
  for (const t of state.tasks) if (t.id !== 'reserve') t.completedTick = null;
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Neue Karriere als ${background.name} in ${home.name}. Karriere Nr. ${state.corporate.careers}.` });
  return { ok: true };
}

export class Simulation {
  readonly state: GameState;
  readonly events: EventBus;
  private readonly rng: Rng;
  private readonly ctx: SimContext;

  constructor(state: GameState) {
    this.state = state;
    this.events = new EventBus();
    this.rng = Rng.fromJSON(state.rng);
    this.ctx = { state, events: this.events, rng: this.rng };
    this.events.on('log', (e) => this.appendLog(e));
  }

  /** Advances the simulation by exactly one minute. */
  step(): void {
    const state = this.state;
    state.tick += 1;
    stepConstruction(this.ctx);
    stepUpgrades(this.ctx);
    if (isHourBoundary(state.tick)) {
      const date = tickToDate(state.tick);
      stepWeatherHour(this.ctx);
      laborState.strike = activeEffect(state, 'strike', date.day) || activeCrisis(state, 'general_strike');
      const cf = crisisFactors(state);
      laborState.wageFactor = cf.wages;
      laborState.candidateFactor = cf.candidates;
      stepPopulationHour(this.ctx, date.hour);
      stepBusinessHour(this.ctx, date.hour, date.day);
      stepRetailHour(this.ctx, date.hour);
      stepHotelsHour(this.ctx, date.hour, date.day);
      stepTransportHour(this.ctx, date.hour);
      stepCompetitorsHour(this.ctx, date.hour);
      stepUnderworldHour(this.ctx);
      state.player.wantedLevel = wantedLevelFor(state.underworld.heat);
    }
    if (isDayBoundary(state.tick)) this.closeDay();
    if (state.tick % 15 === 0) stepTasks(this.ctx);
    state.rng.state = this.rng.toJSON().state;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  drainEvents(): SimEvent[] {
    return this.events.drain();
  }

  apply(command: Command): CommandResult {
    const result = this.applyInner(command);
    if (result.ok) {
      this.state.player.wantedLevel = wantedLevelFor(this.state.underworld.heat);
      stepTasks(this.ctx);
      this.syncRng();
    }
    return result;
  }

  private applyInner(command: Command): CommandResult {
    const state = this.state;
    switch (command.type) {
      case 'placeBuilding': {
        const result = placeBuilding(this.ctx, command.defId, command.x, command.y);
        this.syncRng();
        if (!result.ok) return { ok: false, error: PLACEMENT_ERROR_TEXT[result.error] };
        return { ok: true };
      }
      case 'undoPlacement': {
        const last = state.undoStack[state.undoStack.length - 1];
        if (!last) return { ok: false, error: 'Nichts zum Rückgängigmachen.' };
        const result = removeBuilding(this.ctx, last.buildingId, 'undo');
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case 'demolish': {
        const result = removeBuilding(this.ctx, command.buildingId, 'demolish');
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case 'setSpeed': {
        if (!SPEEDS.includes(command.speed)) return { ok: false, error: 'Ungültige Geschwindigkeit.' };
        state.speed = command.speed;
        return { ok: true };
      }
      case 'setMenuPrice': {
        const b = this.ownBusiness(command.buildingId);
        if (!b || b.business!.kind !== 'gastronomy') return { ok: false, error: 'Kein eigenes Lokal.' };
        const entry = b.business!.menu.find((m) => m.recipeId === command.recipeId);
        const bounds = priceBounds(command.recipeId);
        if (!entry || !bounds || !Number.isFinite(command.price)) return { ok: false, error: 'Ungültiger Preis.' };
        entry.price = clamp(Math.round(command.price), bounds.min, bounds.max);
        return { ok: true };
      }
      case 'toggleMenuItem': {
        const b = this.ownBusiness(command.buildingId);
        if (!b || b.business!.kind !== 'gastronomy') return { ok: false, error: 'Kein eigenes Lokal.' };
        const entry = b.business!.menu.find((m) => m.recipeId === command.recipeId);
        if (!entry) return { ok: false, error: 'Gericht nicht auf der Karte.' };
        if (!command.enabled && b.business!.menu.filter((m) => m.enabled).length <= 1 && entry.enabled) {
          return { ok: false, error: 'Mindestens ein Gericht muss angeboten werden.' };
        }
        entry.enabled = command.enabled;
        return { ok: true };
      }
      case 'placeOrder': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        if (b.status !== 'operational') return { ok: false, error: 'Der Betrieb ist noch nicht eröffnet.' };
        const result = placeOrder(this.ctx, b, command.supplierId, command.items);
        this.syncRng();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case 'setAutoReorder': {
        const b = this.ownBusiness(command.buildingId);
        const biz = b ? stockHolderOf(b) : null;
        if (!b || !biz) return { ok: false, error: 'Dieser Betrieb hat kein Lager.' };
        biz.autoReorder = command.enabled;
        if (command.supplierId) {
          if (!SUPPLIERS[command.supplierId]) return { ok: false, error: 'Unbekannter Lieferant.' };
          biz.preferredSupplierId = command.supplierId;
        }
        if (command.targets) {
          for (const [ing, units] of Object.entries(command.targets)) {
            if (!INGREDIENTS[ing] || !Number.isFinite(units)) continue;
            biz.reorderTargets[ing] = clamp(Math.round(units), 0, 999);
          }
        }
        return { ok: true };
      }
      case 'hire': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return hire(this.ctx, b, command.candidateId);
      }
      case 'fire': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return fire(this.ctx, b, command.employeeId);
      }
      case 'setWage': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return setWage(b, command.employeeId, command.wage);
      }
      case 'startUpgrade': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return startUpgrade(this.ctx, b, command.upgradeId);
      }
      case 'setRoomPrice': {
        const b = this.ownBusiness(command.buildingId);
        if (!b || b.business!.kind !== 'hotel') return { ok: false, error: 'Kein eigenes Hotel.' };
        const bounds = hotelPriceBounds(b.defId);
        if (!bounds || !Number.isFinite(command.price)) return { ok: false, error: 'Ungültiger Preis.' };
        b.business!.pricePerNight = clamp(Math.round(command.price), bounds.min, bounds.max);
        return { ok: true };
      }
      case 'setFare': {
        const b = this.ownBusiness(command.buildingId);
        if (!b || b.business!.kind !== 'transport') return { ok: false, error: 'Kein eigenes Taxiunternehmen.' };
        const bounds = fareBounds(b.defId);
        if (!bounds || !Number.isFinite(command.fare)) return { ok: false, error: 'Ungültiger Tarif.' };
        b.business!.fare = clamp(Math.round(command.fare), bounds.min, bounds.max);
        return { ok: true };
      }
      case 'buyVehicle': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return buyVehicle(this.ctx, b);
      }
      case 'sellVehicle': {
        const b = this.ownBusiness(command.buildingId);
        if (!b) return { ok: false, error: 'Kein eigenes Unternehmen.' };
        return sellVehicle(this.ctx, b, command.vehicleId);
      }
      case 'setGoodPrice': {
        const b = this.ownBusiness(command.buildingId);
        if (!b || b.business!.kind !== 'retail') return { ok: false, error: 'Kein eigener Laden.' };
        const bounds = retailPriceBounds(command.goodId);
        if (!bounds || !Number.isFinite(command.price) || !(command.goodId in b.business!.prices)) return { ok: false, error: 'Ungültiger Preis.' };
        b.business!.prices[command.goodId] = clamp(Math.round(command.price * 10) / 10, bounds.min, bounds.max);
        return { ok: true };
      }
      case 'buyProperty':
        return buyProperty(this.ctx, command.buildingId);
      case 'sellProperty':
        return sellProperty(this.ctx, command.buildingId);
      case 'setRentLevel':
        return setRentLevel(state, command.buildingId, command.level);
      case 'renovate':
        return renovate(this.ctx, command.buildingId);
      case 'takeoverCompetitor':
        return takeoverCompetitor(this.ctx, command.buildingId);
      case 'foundOrganisation':
        return foundOrganisation(this.ctx, command.name);
      case 'recruitCrew':
        return recruit(this.ctx, command.candidateId);
      case 'dismissCrew':
        return dismiss(this.ctx, command.memberId);
      case 'startOperation':
        return startOperation(this.ctx, command.operationId, command.districtId, command.frontBuildingId ?? null);
      case 'cancelOperation':
        return cancelOperation(this.ctx, command.operationId);
      case 'bribe':
        return bribe(this.ctx, command.amount);
      case 'negotiateTruce':
        return negotiateTruce(this.ctx, command.familyIndex, command.tribute);
      case 'setLaunderingRate':
        return setLaunderingRate(state, command.rate);
      case 'assignPatrol':
        return assignPatrol(state, command.buildingId, command.districtId, command.guards);
      case 'startInvestigation':
        return startInvestigation(state, command.buildingId, command.familyIndex);
      case 'supportFaction':
        return supportFaction(this.ctx, command.factionId, command.amount);
      case 'proposeLaw':
        return proposeLaw(this.ctx, command.lawId, command.value);
      case 'districtInitiative':
        return districtInitiative(this.ctx, command.districtId, command.kind);
      case 'resolveDecision':
        return resolveDecision(this.ctx, command.decisionId, command.optionId);
      case 'startResearch':
        return startResearch(this.ctx, command.buildingId, command.nodeId);
      case 'setLine':
        return setLine(state, command.buildingId, command.lineId, command.recipeId, command.targetPerDay);
      case 'removeLine':
        return removeLine(state, command.buildingId, command.lineId);
      case 'setSurplusPolicy':
        return setSurplusPolicy(state, command.buildingId, command.sellSurplus, command.reserve);
      case 'takeLoan':
        return takeLoan(this.ctx, command.amount);
      case 'repayLoan':
        return repayLoan(this.ctx, command.loanId, command.amount);
      case 'sellShares':
        return sellShares(this.ctx, command.share);
      case 'buyBackShares':
        return buyBackShares(this.ctx, command.share);
      case 'setInsurance':
        return setInsurance(state, command.policyId, command.active);
      case 'chainTakeover':
        return chainTakeover(this.ctx, command.districtId);
      case 'sellCompany': {
        const r = sellCompany(this.ctx);
        return r.ok ? { ok: true } : r;
      }
      case 'newCareer':
        return startNewCareer(this.ctx, command.background, command.name);
      case 'rename': {
        const b = state.buildings[command.buildingId];
        if (!b || b.owner !== 'player') return { ok: false, error: 'Kein eigenes Gebäude.' };
        const label = command.label.trim().slice(0, 40);
        if (!label) return { ok: false, error: 'Der Name darf nicht leer sein.' };
        b.label = label;
        return { ok: true };
      }
      default: {
        const never: never = command;
        return { ok: false, error: `Unbekanntes Kommando: ${JSON.stringify(never)}` };
      }
    }
  }

  private ownBusiness(buildingId: number) {
    const b = this.state.buildings[buildingId];
    if (!b || b.owner !== 'player' || !b.business) return null;
    return b;
  }

  private closeDay(): void {
    const state = this.state;
    const date = tickToDate(state.tick);
    const day = date.day; // the day that just started; the closed day is day - 1
    book(state, this.events, -state.player.apartmentRent, {
      category: 'rent',
      description: 'Miete: deine Wohnung',
    });
    closeBusinessDay(this.ctx, day - 1);
    closeRetailDay(this.ctx, day - 1);
    closeHotelsDay(this.ctx, day - 1);
    closeTransportDay(this.ctx, day - 1);
    closePropertyDay(this.ctx);
    closeSecurityDay(this.ctx, day - 1);
    closeUnderworldDay(this.ctx, day - 1);
    closePopulationDay(this.ctx);
    closeLabsDay(this.ctx, day - 1);
    closeIndustryDay(this.ctx, day - 1);
    closeFactionsDay(this.ctx, day);
    closePoliticsDay(this.ctx, day);
    closeCrisisDay(this.ctx, day);
    closeCorporateDay(this.ctx);
    stepMegacorp(this.ctx, day);
    expireDecisions(this.ctx, day);
    closeCompetitorsDay(this.ctx, day - 1);
    closeMarketDay(this.ctx);
    const totals = closeDay(state, day);
    this.events.emit({ type: 'day:ended', tick: state.tick, day: day - 1, income: totals.income, expenses: totals.expenses });
    const net = totals.income - totals.expenses;
    this.events.emit({
      type: 'log',
      tick: state.tick,
      level: net >= 0 ? 'info' : 'warning',
      message: `Tagesabschluss Tag ${day}: ${net >= 0 ? '+' : ''}${Math.round(net)} ¢ (Einnahmen ${Math.round(totals.income)} ¢, Ausgaben ${Math.round(totals.expenses)} ¢).`,
    });
    if (state.ledger.balance < 0) {
      this.events.emit({
        type: 'log',
        tick: state.tick,
        level: 'danger',
        message: `Konto überzogen: ${Math.round(state.ledger.balance)} ¢. Seit ${state.ledger.daysInDebt} Tag(en) in den roten Zahlen.`,
      });
    }
    // Company reputation follows the average business reputation, slowly.
    const businesses = Object.values(state.buildings).filter((b) => b.owner === 'player' && b.business && b.status === 'operational');
    if (businesses.length > 0) {
      const avg = businesses.reduce((s, b) => s + (b.business?.reputation ?? 0), 0) / businesses.length;
      state.player.reputation = clamp(state.player.reputation + (avg - state.player.reputation) * 0.1, 0, 100);
    }
  }

  private appendLog(e: Extract<SimEvent, { type: 'log' }>): void {
    const state = this.state;
    state.log.push({
      id: state.nextLogId++,
      tick: e.tick,
      level: e.level,
      message: e.message,
      buildingId: e.buildingId !== undefined ? Number(e.buildingId) : undefined,
    });
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }

  private syncRng(): void {
    this.state.rng.state = this.rng.toJSON().state;
  }
}

export { BUILDING_DEFINITIONS };
