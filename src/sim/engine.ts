/**
 * Simulation engine: owns the state, applies commands, advances time in
 * fixed one-minute ticks. No React, no rendering, no persistence here.
 */

import { Rng, hashSeed } from './core/rng';
import { EventBus, type SimEvent } from './core/events';
import type { SimContext } from './core/context';
import { isDayBoundary, isHourBoundary, tickToDate } from './core/clock';
import { generateCity } from './world/generator';
import { book, closeDay } from './economy/finance';
import { BACKGROUNDS, DIFFICULTIES, type BackgroundId, type DifficultyId } from './data/difficulty';
import { addPlayer, withPlayer, SYSTEM_PLAYER_ID, type NewPlayerOptions } from './players';
import { BUILDING_DEFINITIONS } from './data/buildings';
import { placeBuilding, removeBuilding, stepConstruction, PLACEMENT_ERROR_TEXT } from './systems/construction';
import { stepBusinessHour, closeBusinessDay, priceBounds, clamp, startUpgrade, stepUpgrades } from './systems/business';
import { placeOrder } from './systems/inventory';
import { hire, fire, setWage } from './systems/staff';
import { SUPPLIERS } from './data/suppliers';
import { INGREDIENTS } from './data/ingredients';
import { stepTasks } from './systems/tasks';
import { createPopulation, generateCitizens, stepPopulationHour, closePopulationDay } from './systems/population';
import { createCompetitorsForCity, stepCompetitorsHour, closeCompetitorsDay } from './systems/competitors';
import { createMarket, closeMarketDay } from './systems/market';
import { stepHotelsHour, closeHotelsDay, hotelPriceBounds } from './systems/hotel';
import { stepTransportHour, closeTransportDay, buyVehicle, sellVehicle, fareBounds } from './systems/transport';
import { stepRetailHour, closeRetailDay, retailPriceBounds } from './systems/retail';
import { buyProperty, sellProperty, setRentLevel, renovate, takeoverCompetitor, closePropertyDay } from './systems/property';
import { stockHolderOf } from './systems/inventory';
import { createRivals, foundOrganisation, recruit, dismiss, startOperation, cancelOperation, bribe, negotiateTruce, setLaunderingRate, stepUnderworldHour, closeUnderworldDay, closeRivalsDay } from './systems/underworld';
import { closeSecurityDay, assignPatrol, startInvestigation } from './systems/security';
import { createFactions, closeFactionsSharedDay, closeFactionsPlayerDay, supportFaction, activeEffect } from './systems/factions';
import { createPolitics, closePoliticsSharedDay, closePoliticsPlayerDay, proposeLaw, districtInitiative } from './systems/politics';
import { resolveDecision, expireDecisions } from './systems/decisions';
import { laborState } from './systems/staff';
import { startResearch, closeLabsDay } from './systems/research';
import { closeIndustryDay, setLine, removeLine, setSurplusPolicy } from './systems/industry';
import { createCorporateState, closeCorporateDay, takeLoan, repayLoan, sellShares, buyBackShares, setInsurance, chainTakeover, sellCompany, stepMegacorp } from './systems/corporate';
import { createCrisisState, closeCrisisDay, crisisFactors, activeCrisis } from './systems/crises';
import { createWeather, stepWeatherHour } from './systems/weather';
import { playSlots, playRoulette, blackjackDeal, blackjackHit, blackjackStand, blackjackDouble } from './systems/casino';
import type { RouletteBet } from './data/casino';
import type { FactionId } from './data/factions';
import { wantedLevelFor } from './data/underworld';
import { LOG_LIMIT, LOCAL_PLAYER_ID, type Facing, type GameState, type WorldState } from './state';

export const SAVE_FORMAT_VERSION = 13;
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
  | { type: 'placeBuilding'; defId: string; x: number; y: number; facing?: Facing }
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
  | { type: 'rename'; buildingId: number; label: string }
  | { type: 'casinoSlots'; bet: number }
  | { type: 'casinoRoulette'; bets: RouletteBet[] }
  | { type: 'blackjackDeal'; bet: number }
  | { type: 'blackjackHit' }
  | { type: 'blackjackStand' }
  | { type: 'blackjackDouble' };

export type CommandResult = { ok: true } | { ok: false; error: string };

export interface NewWorldOptions {
  seed: string | number;
  citySize?: number;
}

/** Creates the shared world: city, citizens, competitors, rival families, council. No players yet. */
export function createWorld(options: NewWorldOptions): WorldState {
  const seed = typeof options.seed === 'string' ? hashSeed(options.seed.trim() || 'nova') : options.seed >>> 0;
  const rng = new Rng(seed);
  const city = generateCity(seed, options.citySize);
  const world: WorldState = {
    version: SAVE_FORMAT_VERSION,
    seed,
    rng: rng.toJSON(),
    tick: 0,
    speed: 1,
    grid: city.grid,
    districts: city.districts,
    buildings: city.buildings,
    nextBuildingId: city.nextBuildingId,
    population: createPopulation(),
    competitors: {},
    market: createMarket(),
    lastCompetitorExpansionDay: 0,
    rivals: [],
    factions: createFactions(),
    politics: createPolitics(),
    crisis: createCrisisState(),
    weather: createWeather(),
    meta: { createdAt: Date.now(), cityName: 'Nova Eclipse' },
    players: {},
    playerOrder: [],
  };
  const worldRng = rng.fork('population');
  const system = withPlayer(world, SYSTEM_PLAYER_ID);
  createCompetitorsForCity(system, worldRng, 0);
  generateCitizens(system, worldRng);
  world.rivals = createRivals(system, worldRng);
  world.rng = rng.toJSON();
  return world;
}

/** Single-player start: a fresh world with one local player. */
export function createNewGame(options: NewGameOptions): WorldState {
  const world = createWorld({ seed: options.seed, citySize: options.citySize });
  addPlayer(world, { id: LOCAL_PLAYER_ID, name: options.playerName, background: options.background, difficulty: options.difficulty });
  return world;
}

/** Starts a new career in the same city: new background, perks and home; money and city state stay. */
function startNewCareer(ctx: SimContext, backgroundId: BackgroundId, name: string): CommandResult {
  const { state, events } = ctx;
  const background = BACKGROUNDS[backgroundId];
  if (!background) return { ok: false, error: 'Unbekannter Hintergrund.' };
  const assets = Object.values(state.buildings).filter((b) => b.owner === state.playerId && (b.business || b.property));
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
  /** The shared world (what gets saved). */
  readonly world: WorldState;
  readonly events: EventBus;
  private readonly rng: Rng;
  private readonly ctx: SimContext;
  private primary: string;
  /** Player whose pass is running (log routing); null = shared pass. */
  private currentPlayer: string | null = null;

  constructor(world: WorldState, primaryPlayerId?: string) {
    this.world = world;
    this.events = new EventBus();
    this.rng = Rng.fromJSON(world.rng);
    this.primary = primaryPlayerId ?? world.playerOrder[0] ?? SYSTEM_PLAYER_ID;
    this.ctx = { state: withPlayer(world, this.primary), events: this.events, rng: this.rng };
    this.events.on('log', (e) => this.appendLog(e));
  }

  /** The world as seen by the primary player (the local player, or the logged-in one online). */
  get state(): GameState {
    return withPlayer(this.world, this.primary);
  }

  get primaryPlayerId(): string {
    return this.primary;
  }

  setPrimaryPlayer(id: string): void {
    if (!this.world.players[id]) throw new Error(`Unbekannter Spieler: ${id}`);
    this.primary = id;
    this.ctx.state = withPlayer(this.world, id);
  }

  /** View of any player of this world. */
  view(playerId: string): GameState {
    return withPlayer(this.world, playerId);
  }

  get playerIds(): readonly string[] {
    return this.world.playerOrder;
  }

  /** Lets a new player join the world (used by the online server and by new games). */
  addPlayer(options: NewPlayerOptions): CommandResult {
    if (this.world.players[options.id]) return { ok: false, error: 'Dieser Spieler ist bereits in der Welt.' };
    if (!BACKGROUNDS[options.background] || !DIFFICULTIES[options.difficulty]) return { ok: false, error: 'Unbekannter Hintergrund oder Schwierigkeitsgrad.' };
    addPlayer(this.world, options);
    if (this.primary === SYSTEM_PLAYER_ID) this.setPrimaryPlayer(options.id);
    const home = this.world.districts[this.world.players[options.id]!.player.homeDistrictId]!;
    this.runAs(null, () => this.events.emit({ type: 'log', tick: this.world.tick, level: 'info', message: `${options.name.trim() || 'Unbekannt'} ist der Stadt beigetreten und wohnt in ${home.name}.` }));
    return { ok: true };
  }

  /** Runs `fn` with the context switched to a player's view (null = shared pass). */
  private runAs<T>(id: string | null, fn: (state: GameState) => T): T {
    const prevState = this.ctx.state;
    const prevPlayer = this.currentPlayer;
    this.currentPlayer = id;
    this.ctx.state = withPlayer(this.world, id ?? SYSTEM_PLAYER_ID);
    try {
      return fn(this.ctx.state);
    } finally {
      this.ctx.state = prevState;
      this.currentPlayer = prevPlayer;
    }
  }

  /** Advances the simulation by exactly one minute. */
  step(): void {
    const world = this.world;
    world.tick += 1;
    this.runAs(null, () => {
      stepConstruction(this.ctx);
      stepUpgrades(this.ctx);
    });
    if (isHourBoundary(world.tick)) {
      const date = tickToDate(world.tick);
      this.runAs(null, (shared) => {
        stepWeatherHour(this.ctx);
        const cf = crisisFactors(shared);
        laborState.wageFactor = cf.wages;
        laborState.candidateFactor = cf.candidates;
        stepPopulationHour(this.ctx, date.hour);
      });
      for (const id of world.playerOrder) {
        this.runAs(id, (state) => {
          laborState.strike = activeEffect(state, 'strike', date.day) || activeCrisis(state, 'general_strike');
          stepBusinessHour(this.ctx, date.hour, date.day);
          stepRetailHour(this.ctx, date.hour);
          stepHotelsHour(this.ctx, date.hour, date.day);
          stepTransportHour(this.ctx, date.hour);
          stepUnderworldHour(this.ctx);
          state.player.wantedLevel = wantedLevelFor(state.underworld.heat);
        });
      }
      this.runAs(null, () => stepCompetitorsHour(this.ctx, date.hour));
    }
    if (isDayBoundary(world.tick)) this.closeDay();
    if (world.tick % 15 === 0) for (const id of world.playerOrder) this.runAs(id, () => stepTasks(this.ctx));
    world.rng.state = this.rng.toJSON().state;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  drainEvents(): SimEvent[] {
    return this.events.drain();
  }

  /** Applies a command for a player (default: the primary player). */
  apply(command: Command, playerId: string = this.primary): CommandResult {
    if (!this.world.players[playerId]) return { ok: false, error: 'Unbekannter Spieler.' };
    return this.runAs(playerId, (state) => {
      const result = this.applyInner(command);
      if (result.ok) {
        state.player.wantedLevel = wantedLevelFor(state.underworld.heat);
        stepTasks(this.ctx);
        this.syncRng();
      }
      return result;
    });
  }

  private applyInner(command: Command): CommandResult {
    const state = this.ctx.state;
    switch (command.type) {
      case 'placeBuilding': {
        const result = placeBuilding(this.ctx, command.defId, command.x, command.y, command.facing);
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
      case 'casinoSlots':
        return playSlots(this.ctx, command.bet);
      case 'casinoRoulette':
        return playRoulette(this.ctx, command.bets);
      case 'blackjackDeal':
        return blackjackDeal(this.ctx, command.bet);
      case 'blackjackHit':
        return blackjackHit(this.ctx);
      case 'blackjackStand':
        return blackjackStand(this.ctx);
      case 'blackjackDouble':
        return blackjackDouble(this.ctx);
      case 'rename': {
        const b = state.buildings[command.buildingId];
        if (!b || b.owner !== state.playerId) return { ok: false, error: 'Kein eigenes Gebäude.' };
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
    const state = this.ctx.state;
    const b = state.buildings[buildingId];
    if (!b || b.owner !== state.playerId || !b.business) return null;
    return b;
  }

  private closeDay(): void {
    const world = this.world;
    const date = tickToDate(world.tick);
    const day = date.day; // the day that just started; the closed day is day - 1
    const players = world.playerOrder;
    for (const id of players) {
      this.runAs(id, (state) => {
        laborState.strike = activeEffect(state, 'strike', day) || activeCrisis(state, 'general_strike');
        book(state, this.events, -state.player.apartmentRent, { category: 'rent', description: 'Miete: deine Wohnung' });
        closeBusinessDay(this.ctx, day - 1);
        closeRetailDay(this.ctx, day - 1);
        closeHotelsDay(this.ctx, day - 1);
        closeTransportDay(this.ctx, day - 1);
        closePropertyDay(this.ctx);
        closeSecurityDay(this.ctx, day - 1);
        closeUnderworldDay(this.ctx, day - 1);
        closeLabsDay(this.ctx, day - 1);
        closeIndustryDay(this.ctx, day - 1);
      });
    }
    this.runAs(null, () => {
      closeRivalsDay(this.ctx);
      closePopulationDay(this.ctx);
      closeFactionsSharedDay(this.ctx, day);
    });
    for (const id of players) {
      this.runAs(id, () => {
        closeFactionsPlayerDay(this.ctx, day);
        closePoliticsPlayerDay(this.ctx, day);
      });
    }
    this.runAs(null, () => {
      closePoliticsSharedDay(this.ctx, day);
      closeCrisisDay(this.ctx, day);
    });
    for (const id of players) {
      this.runAs(id, () => {
        closeCorporateDay(this.ctx);
        stepMegacorp(this.ctx, day);
        expireDecisions(this.ctx, day);
      });
    }
    this.runAs(null, () => {
      closeCompetitorsDay(this.ctx, day - 1);
      closeMarketDay(this.ctx);
    });
    let income = 0;
    let expenses = 0;
    for (const id of players) {
      this.runAs(id, (state) => {
        const totals = closeDay(state, day);
        income += totals.income;
        expenses += totals.expenses;
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
        const businesses = Object.values(state.buildings).filter((b) => b.owner === state.playerId && b.business && b.status === 'operational');
        if (businesses.length > 0) {
          const avg = businesses.reduce((sum, b) => sum + (b.business?.reputation ?? 0), 0) / businesses.length;
          state.player.reputation = clamp(state.player.reputation + (avg - state.player.reputation) * 0.1, 0, 100);
        }
      });
    }
    this.events.emit({ type: 'day:ended', tick: world.tick, day: day - 1, income, expenses });
  }

  /** Routes a log line to the right players: the building's owner, else the player whose pass is running, else everyone. */
  private appendLog(e: Extract<SimEvent, { type: 'log' }>): void {
    const world = this.world;
    let targets: readonly string[];
    const owner = e.buildingId !== undefined ? world.buildings[Number(e.buildingId)]?.owner : undefined;
    if (owner && owner !== 'city' && world.players[owner]) targets = [owner];
    else if (this.currentPlayer && world.players[this.currentPlayer]) targets = [this.currentPlayer];
    else targets = world.playerOrder;
    for (const id of targets) {
      const slice = world.players[id]!;
      slice.log.push({
        id: slice.nextLogId++,
        tick: e.tick,
        level: e.level,
        message: e.message,
        buildingId: e.buildingId !== undefined ? Number(e.buildingId) : undefined,
      });
      if (slice.log.length > LOG_LIMIT) slice.log.splice(0, slice.log.length - LOG_LIMIT);
    }
  }

  private syncRng(): void {
    this.world.rng.state = this.rng.toJSON().state;
  }
}

export { BUILDING_DEFINITIONS };
