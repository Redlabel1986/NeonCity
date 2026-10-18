/**
 * The complete, serializable simulation state. Everything the engine needs
 * to continue a game must live here (plus the definitions, which are code).
 */

import type { RngState } from './core/rng';
import type { GridJSON } from './world/grid';
import { CityGrid } from './world/grid';
import type { DistrictArchetypeId, DistrictStats } from './data/districts';
import type { DifficultyId, BackgroundId } from './data/difficulty';
import type { LogLevel } from './core/events';

/** Owner of a building: the city or a player id. The local single player uses LOCAL_PLAYER_ID. */
export type OwnerId = string;
export const CITY_OWNER = 'city';
export const LOCAL_PLAYER_ID = 'player';

export type BuildingStatus = 'construction' | 'operational';

export type EmployeeRole = 'cook' | 'service' | 'manager' | 'reception' | 'housekeeping' | 'driver' | 'clerk' | 'security' | 'guard' | 'investigator' | 'researcher' | 'worker' | 'technician' | 'banker' | 'analyst' | 'sommelier' | 'concierge' | 'dispatcher';

export interface Employee {
  id: number;
  name: string;
  role: EmployeeRole;
  skill: number; // 0-100
  wage: number; // credits per day
  morale: number; // 0-100
  hiredTick: number;
  lowMoraleDays: number;
  /** Running training course (data/training.ts); the employee does not work meanwhile. */
  training?: { courseId: string; untilTick: number; gain: number; morale: number };
}

export interface Candidate {
  id: number;
  name: string;
  role: EmployeeRole;
  skill: number;
  wageAsk: number;
  expiresDay: number;
}

export interface InventoryLot {
  ingredientId: string;
  units: number;
  boughtDay: number;
  quality: number; // 0-100
  unitCost: number;
}

export interface SupplyOrder {
  id: number;
  supplierId: string;
  items: { ingredientId: string; units: number }[];
  cost: number;
  placedTick: number;
  arrivesTick: number;
  delayed: boolean;
}

export interface MenuEntry {
  recipeId: string;
  price: number;
  enabled: boolean;
  /** Servings sold today (reset at day close). */
  soldToday: number;
}

export interface GastronomyState {
  kind: 'gastronomy';
  reputation: number; // 0-100, moves slowly towards guest satisfaction
  /** Average dish quality of the last day (display). */
  quality: number;
  hygiene: number; // 0-100
  rating: number; // 1-5 stars, from reviews
  reviewCount: number;
  menu: MenuEntry[];
  inventory: InventoryLot[];
  orders: SupplyOrder[];
  autoReorder: boolean;
  preferredSupplierId: string;
  /** Target stock per ingredient for automatic reorders. */
  reorderTargets: Record<string, number>;
  employees: Employee[];
  candidates: Candidate[];
  upgrades: Record<string, number>;
  upgradeInProgress: { id: string; level: number; readyTick: number } | null;
  nextEntityId: number;
  /** Guests served in the current hour (interior view, display only). */
  hourGuests: number;
  todayGuests: number;
  todayRevenue: number;
  /** Cost of goods sold today (ingredient value of served dishes). */
  todayCogs: number;
  todayCosts: number;
  todayPurchases: number;
  todayTurnedAway: number;
  todayLostNoIngredients: number;
  todayWasteUnits: number;
  todaySatisfactionSum: number;
  todaySatisfactionCount: number;
  todayQualitySum: number;
  todayConsumed: Record<string, number>;
  todayCitizenVisits: number;
  lifetimeGuests: number;
  lifetimeRevenue: number;
  /** Rolling history of the last 30 days. */
  history: DayRecord[];
}

export interface DayRecord {
  day: number;
  guests: number;
  revenue: number;
  costs: number;
  cogs?: number;
  wages?: number;
  purchases?: number;
  satisfaction?: number;
  turnedAway?: number;
  lostNoIngredients?: number;
  waste?: number;
}

/** Shared staff and upgrade fields of every business type. */
export interface StaffedBusiness {
  employees: Employee[];
  candidates: Candidate[];
  upgrades: Record<string, number>;
  upgradeInProgress: { id: string; level: number; readyTick: number } | null;
  nextEntityId: number;
}

export interface HotelState extends StaffedBusiness {
  kind: 'hotel';
  pricePerNight: number;
  /** Rooms currently occupied, with the day of checkout. */
  stays: { checkoutDay: number; vip: boolean }[];
  cleanliness: number; // 0-100
  reputation: number; // 0-100
  rating: number;
  reviewCount: number;
  todayCheckIns: number;
  todayTurnedAway: number;
  todayRevenue: number;
  todayCosts: number;
  lifetimeGuests: number;
  lifetimeRevenue: number;
  history: { day: number; occupancy: number; revenue: number; costs: number; checkIns: number; satisfaction?: number }[];
}

export interface Vehicle {
  id: number;
  condition: number; // 0-100
  mileage: number;
  /** Tick until which the vehicle is in the workshop (0 = available). */
  repairUntilTick: number;
}

export interface TransportState extends StaffedBusiness {
  kind: 'transport';
  fare: number;
  vehicles: Vehicle[];
  reputation: number;
  todayRides: number;
  todayMissed: number;
  todayRevenue: number;
  todayCosts: number;
  lifetimeRides: number;
  lifetimeRevenue: number;
  history: { day: number; rides: number; missed: number; revenue: number; costs: number }[];
}

export interface RetailState extends StaffedBusiness {
  kind: 'retail';
  /** Shelf prices per good. */
  prices: Record<string, number>;
  inventory: InventoryLot[];
  orders: SupplyOrder[];
  autoReorder: boolean;
  preferredSupplierId: string;
  reorderTargets: Record<string, number>;
  reputation: number;
  /** Customers served in the current hour (interior view, display only). */
  hourCustomers: number;
  todayCustomers: number;
  todayLostNoStock: number;
  todayRevenue: number;
  todayCogs: number;
  todayPurchases: number;
  todayShrinkage: number;
  todayCitizenVisits: number;
  lifetimeCustomers: number;
  lifetimeRevenue: number;
  history: { day: number; customers: number; revenue: number; costs: number; cogs?: number; purchases?: number; shrinkage?: number }[];
}

export interface SecurityState extends StaffedBusiness {
  kind: 'security';
  /** Guards assigned per district id. */
  patrols: Record<number, number>;
  reputation: number;
  todayRevenue: number;
  todayCosts: number;
  lifetimeRevenue: number;
  /** Rival family currently investigated (name) with progress 0-100. */
  investigation: { familyIndex: number; progress: number } | null;
  history: { day: number; revenue: number; costs: number; patrols: number; contracts: number }[];
}

export interface ResearchLabState extends StaffedBusiness {
  kind: 'lab';
  /** Research node currently worked on. */
  activeNodeId: string | null;
  progress: number;
  reputation: number;
  todayCosts: number;
  history: { day: number; revenue: number; costs: number; points: number }[];
}

export interface ProductionLine {
  id: number;
  recipeId: string; // production recipe id
  /** Target output units per day the line is configured for (bounded by capacity). */
  targetPerDay: number;
}

export interface IndustryState extends StaffedBusiness {
  kind: 'industry';
  lines: ProductionLine[];
  /** Raw materials and finished goods share one stock room. */
  inventory: InventoryLot[];
  orders: SupplyOrder[];
  autoReorder: boolean;
  preferredSupplierId: string;
  reorderTargets: Record<string, number>;
  /** Sell finished goods beyond this reserve to the wholesale market each night. */
  sellSurplus: boolean;
  reserve: Record<string, number>;
  reputation: number;
  todayProduced: Record<string, number>;
  todayRevenue: number;
  todayCogs: number;
  todayPurchases: number;
  todayEnergy: number;
  /** Units handed to own venues today (internal supply chain). */
  todayInternal?: number;
  lifetimeRevenue: number;
  history: { day: number; revenue: number; costs: number; produced: number; purchases?: number; energy?: number; internal?: number }[];
}

export interface BankState extends StaffedBusiness {
  kind: 'bank';
  /** The owner's capital locked in the bank. */
  reserve: number;
  /** Customer deposits (not the player's money). */
  deposits: number;
  /** Loans handed out to the district. */
  loansOut: number;
  /** Daily interest paid on deposits (fraction). */
  depositRate: number;
  /** Daily interest charged on loans (fraction). */
  loanRate: number;
  reputation: number;
  /** The supervisor stopped new deposits (reserve too low). */
  supervised: boolean;
  todayRevenue: number;
  todayCosts: number;
  todayDefaults: number;
  lifetimeProfit: number;
  history: { day: number; deposits: number; loansOut: number; revenue: number; costs: number; defaults: number }[];
}

export type BusinessState = GastronomyState | HotelState | TransportState | RetailState | SecurityState | ResearchLabState | IndustryState | BankState;

// ---------------------------------------------------------------- corporate finance

export interface Loan {
  id: number;
  principal: number;
  remaining: number;
  /** Daily interest rate (e.g. 0.004 = 0.4 % per day). */
  dailyRate: number;
  /** Daily repayment. */
  installment: number;
  takenTick: number;
}

export interface CorporateState {
  name: string;
  loans: Loan[];
  nextLoanId: number;
  /** Share of the company sold to investors (0-0.49). */
  sharesSold: number;
  /** Capital raised from investors over time. */
  investorCapital: number;
  lifetimeDividends: number;
  /** Insurance policies: id -> active. */
  insurance: Record<string, boolean>;
  lifetimePremiums: number;
  lifetimeClaims: number;
  /** Consecutive days in insolvency proceedings; 0 when solvent. */
  insolvencyDays: number;
  bankrupt: boolean;
  lastValuation: number;
  /** Megacorp status: unlocked when the group is large and diverse enough. */
  megacorp: boolean;
  megacorpSinceDay: number;
  /** Number of careers in this city (sold company and restarted). */
  careers: number;
  /** Day until which a new career cannot start another chain takeover. */
  chainTakeoverCooldownDay: number;
}

export interface ResearchState {
  unlocked: string[];
  /** Points accumulated towards the node currently researched by any lab (node id -> points). */
  progress: Record<string, number>;
  lifetimeSpent: number;
}

export interface WeatherState {
  kind: 'clear' | 'rain' | 'fog' | 'storm';
  untilTick: number;
  intensity: number; // 0-1
}

export interface CrisisState {
  active: { id: string; startDay: number; endDay: number; severity: number } | null;
  lastCrisisEndDay: number;
  history: { id: string; startDay: number; endDay: number }[];
  /** Market index multiplier applied during supply crises (stored to undo). */
  bubbleApplied: boolean;
}

// ---------------------------------------------------------------- underworld

export interface CrewMember {
  id: number;
  name: string;
  role: import('./data/underworld').CrewRole;
  skill: number; // 0-100
  loyalty: number; // 0-100
  ambition: number; // 0-100
  cut: number; // daily pay (dirty credits)
  joinedTick: number;
  /** Tick until which the member is unavailable (operation, jail). 0 = free. */
  busyUntilTick: number;
  jailed: boolean;
}

export interface CrewCandidate {
  id: number;
  name: string;
  role: import('./data/underworld').CrewRole;
  skill: number;
  cut: number;
  expiresDay: number;
}

export interface ActiveOperation {
  id: number;
  operationId: string;
  districtId: number;
  memberIds: number[];
  startedTick: number;
  endsTick: number;
  /** For standing operations: the building used as a front (casino). */
  frontBuildingId: number | null;
}

export interface RivalFamily {
  name: string;
  strength: number; // 0-100
  /** Territory control per district id (0-100). */
  control: Record<number, number>;
  relation: number; // -100 hostile .. 100 allied
  truceUntilDay: number;
}

// ---------------------------------------------------------------- factions & politics

/** City-wide part of a faction (shared by all players). */
export interface SharedFactionState {
  id: import('./data/factions').FactionId;
  influence: number; // 0-100
}

/** A faction's stance towards one player. */
export interface PlayerFactionState {
  relation: number; // -100 .. 100 towards the player
  /** Day of the last action this faction took against / for this player. */
  lastActionDay: number;
  /** Active effect on the player, e.g. a strike, until day. */
  activeUntilDay: number;
  activeEffect: string | null;
}

/** Merged faction view a player sees (shared influence + own relation). */
export interface FactionState extends SharedFactionState, PlayerFactionState {}

export interface LawProposal {
  id: number;
  lawId: string;
  value: number;
  /** Who proposed it: player or faction id. */
  by: string;
  voteDay: number;
  support: number; // 0-1 estimated
}

/** City council, laws and proposals (shared by all players). */
export interface SharedPoliticsState {
  council: Record<string, number>; // party id -> seats
  laws: Record<string, number>;
  proposals: LawProposal[];
  nextProposalId: number;
  nextElectionDay: number;
}

/** One player's political standing. */
export interface PlayerPoliticsState {
  /** Player's political influence 0-100. */
  influence: number;
  /** Player influence per district (0-100). */
  districtInfluence: Record<number, number>;
  /** Day until which a district initiative blocks another one. */
  initiativeCooldownDay: Record<number, number>;
  lifetimeTaxes: number;
  lifetimeDonations: number;
}

/** Merged politics view a player sees. */
export interface PoliticsState extends SharedPoliticsState, PlayerPoliticsState {}

export interface DecisionOption {
  id: string;
  label: string;
  hint: string;
}

export interface PendingDecision {
  id: number;
  kind: string;
  title: string;
  text: string;
  options: DecisionOption[];
  createdTick: number;
  expiresDay: number;
  /** Context for the effect handlers (building id, faction id, amount, ...). */
  context: Record<string, number | string>;
}

export interface DecisionState {
  pending: PendingDecision[];
  nextId: number;
  /** Day keyed cooldowns per decision kind so the same event does not spam. */
  cooldowns: Record<string, number>;
  resolvedCount: number;
}

/** One player's criminal side (organisation, police attention). */
export interface PlayerUnderworldState {
  org: {
    name: string;
    foundedTick: number;
    members: CrewMember[];
    candidates: CrewCandidate[];
    nextId: number;
    control: Record<number, number>;
    operations: ActiveOperation[];
    nextOperationId: number;
    /** Laundering share of legal revenue (0-0.4). */
    launderingRate: number;
    todayDirtyIncome: number;
    todayLaundered: number;
    lifetimeDirty: number;
    lifetimeLaundered: number;
  } | null;
  /** Police attention 0-100. */
  heat: number;
  /** Day until which all operations are blocked (city-wide operation). */
  lockdownUntilDay: number;
  /** Bribes paid in the last days reduce heat decay effects (diminishing returns). */
  recentBribes: number;
}

/** Merged underworld view a player sees: own organisation plus the city's rival families. */
export interface UnderworldState extends PlayerUnderworldState {
  rivals: RivalFamily[];
}

/** A city building the player owns as real estate. */
export interface PropertyState {
  purchasePrice: number;
  purchasedTick: number;
  /** Rent multiplier applied to the district base rent (0.6 .. 1.6). */
  rentLevel: number;
  condition: number; // 0-100
  /** Tick until which a renovation blocks rent collection. */
  renovationUntilTick: number;
  todayRent: number;
  lifetimeRent: number;
  tenants: number;
}

/**
 * Which footprint edge carries the entrance and signage.
 * 0 = +x edge (front-right wall on screen, south-east), 1 = +y edge (front-left wall, south-west),
 * 2 = -x edge (back, north-west), 3 = -y edge (back, north-east).
 */
export type Facing = 0 | 1 | 2 | 3;

export const FACING_LABELS: Record<Facing, string> = {
  0: 'Südost (vorne rechts)',
  1: 'Südwest (vorne links)',
  2: 'Nordwest (hinten links)',
  3: 'Nordost (hinten rechts)',
};

export interface Building {
  id: number;
  defId: string;
  /** Edge of the footprint with entrance and signs; must border a road. */
  facing: Facing;
  /** For city buildings: style + label; for player buildings: the definition id. */
  cityStyle?: string;
  label: string;
  owner: OwnerId;
  x: number;
  y: number;
  w: number;
  h: number;
  floors: number;
  /** Visual variant seed (0-255). */
  variant: number;
  districtId: number;
  status: BuildingStatus;
  /** Construction progress in game minutes. */
  progress: number;
  buildTime: number;
  /** Tick at which the building was placed. */
  placedTick: number;
  /** Total money spent on construction and land (for undo refunds and valuation). */
  investment: number;
  business?: BusinessState;
  property?: PropertyState;
  /** Current evolution stage (stable id, see data/evolution.ts); missing = the type's initial stage. */
  stageId?: string;
  /** Stages passed on the way here (unlocks accumulate once). */
  stageHistory?: string[];
  /** Running conversion to another stage; `paid` is refunded in part on cancel. */
  stageUpgrade?: { toStageId: string; readyTick: number; paid: number };
  /** Critics' stars 0-3 (stages with the critics mechanic). */
  stars?: number;
  /** Signed franchise contracts (stages with the franchise mechanic). */
  franchises?: number;
}

export interface DistrictEconomy {
  citizens: number;
  employed: number;
  dailyWages: number;
  dailyRent: number;
  dailySpending: number;
  /** Visits of citizens to gastronomy venues (player and competitors) yesterday. */
  dailyVisits: number;
  /** Number of gastronomy venues in the district (player and competitors). */
  venues: number;
}

export interface District {
  id: number;
  archetype: DistrictArchetypeId;
  name: string;
  /** Centre tile of the district (used for camera focus and labels). */
  cx: number;
  cy: number;
  tileCount: number;
  stats: DistrictStats;
  economy: DistrictEconomy;
}

export type Activity = 'sleep' | 'commute' | 'work' | 'eat' | 'leisure' | 'home';

/** A simulated citizen (agent layer). Thousands of these exist; keep it flat. */
export interface Citizen {
  id: number;
  name: string;
  age: number;
  districtId: number;
  homeBuildingId: number;
  workBuildingId: number | null;
  /** Daily income in credits (0 when unemployed). */
  income: number;
  wealth: number;
  priceSensitivity: number; // 0-1
  qualityPreference: number; // 0-1
  hunger: number; // 0-1
  workStart: number;
  workEnd: number;
  activity: Activity;
  /** Favourite venues with loyalty score (bounded to 3). */
  favorites: { venueId: number; score: number }[];
  visitsToday: number;
  spentToday: number;
}

/** AI-run gastronomy venue occupying a city building. */
export interface Competitor {
  buildingId: number;
  name: string;
  districtId: number;
  priceLevel: number; // 1 = base prices
  quality: number; // 0-100
  reputation: number; // 0-100
  capacityPerHour: number;
  cash: number;
  visitsToday: number;
  servedToday: number;
  revenueToday: number;
  lossDays: number;
  openedDay: number;
  history: { day: number; served: number; profit: number }[];
}

export interface PopulationState {
  citizens: Citizen[];
  nextCitizenId: number;
  /** Visits registered this hour per venue building id. */
  pendingVisits: Record<number, number>;
}

export interface MarketState {
  /** Price index per ingredient (1 = base). */
  index: Record<string, number>;
  /** Units consumed city-wide today per ingredient. */
  demandToday: Record<string, number>;
}

export type TransactionCategory =
  | 'construction'
  | 'land'
  | 'refund'
  | 'demolition'
  | 'rent'
  | 'wages'
  | 'upkeep'
  | 'sales'
  | 'ingredients'
  | 'upgrade'
  | 'fine'
  | 'tax'
  | 'donation'
  | 'loan'
  | 'capital'
  | 'interest'
  | 'insurance'
  | 'dividend'
  | 'research'
  | 'gambling'
  | 'other';

export interface Transaction {
  tick: number;
  amount: number; // positive = income, negative = expense
  category: TransactionCategory;
  description: string;
  buildingId?: number;
}

export interface Ledger {
  balance: number;
  /** Illegally earned credits that must be laundered before they can be spent legally. */
  dirtyBalance: number;
  /** Most recent transactions (bounded). */
  transactions: Transaction[];
  todayIncome: number;
  todayExpenses: number;
  yesterdayIncome: number;
  yesterdayExpenses: number;
  /** Balance at the end of each day (bounded history for charts). */
  balanceHistory: { day: number; balance: number }[];
  /** Consecutive days with negative balance. */
  daysInDebt: number;
}

export interface LogEntry {
  id: number;
  tick: number;
  level: LogLevel;
  message: string;
  buildingId?: number;
}

export interface TaskState {
  id: string;
  completedTick: number | null;
}

export interface PlayerProfile {
  name: string;
  background: BackgroundId;
  difficulty: DifficultyId;
  apartmentRent: number;
  homeDistrictId: number;
  reputation: number; // 0-100 company reputation
  wantedLevel: number; // 0-6, see docs
}

/** @deprecated name kept for older imports; use PlayerProfile. */
export type PlayerState = PlayerProfile;

export interface UndoEntry {
  buildingId: number;
  tick: number;
}

// ---------------------------------------------------------------- casino

export interface BlackjackHand {
  bet: number;
  player: import('./data/casino').Card[];
  dealer: import('./data/casino').Card[];
  doubled: boolean;
  phase: 'player' | 'done';
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | null;
  /** Total returned to the player when the hand ended (0 = lost). */
  payout: number;
}

export interface CasinoState {
  blackjack: BlackjackHand | null;
  lastSlots: { reels: import('./data/casino').SlotSymbol[]; bet: number; payout: number; tick: number } | null;
  lastRoulette: { number: number; bets: import('./data/casino').RouletteBet[]; payout: number; tick: number } | null;
  stats: { rounds: number; wagered: number; returned: number; biggestWin: number };
  /** Last 20 rounds, newest first. */
  history: { tick: number; game: 'slots' | 'roulette' | 'blackjack'; wagered: number; returned: number; text: string }[];
}

/** Everything that belongs to one player: finances, company, standing, log. */
/** Player level, experience and the regions it opened (see data/regions.ts). */
export interface ProgressionState {
  /** Off = free play: every region open, every evolution level allowed. */
  enabled: boolean;
  level: number;
  xp: number;
  /** Ids of every XP source already granted (milestones, stage ids, research nodes, regions). */
  milestones: string[];
  unlockedRegions: import('./data/regions').RegionId[];
  levelReachedTick: number;
  /** Set by a level-up until the player acknowledges it (level-up dialog). */
  pendingLevelUp: { level: number; region: import('./data/regions').RegionId } | null;
  stats: { lifetimeIncome: number; lifetimeExpenses: number };
}

export interface PlayerSlice {
  id: string;
  player: PlayerProfile;
  progression: ProgressionState;
  ledger: Ledger;
  log: LogEntry[];
  nextLogId: number;
  tasks: TaskState[];
  undoStack: UndoEntry[];
  underworld: PlayerUnderworldState;
  factions: Record<string, PlayerFactionState>;
  politics: PlayerPoliticsState;
  decisions: DecisionState;
  corporate: CorporateState;
  research: ResearchState;
  casino: CasinoState;
  /** Tick at which the player joined the world. */
  joinedTick: number;
}

/**
 * The shared world: city, population, market, factions' influence, council,
 * crises, weather and every player's slice. This is what gets saved.
 */
export interface WorldState {
  /** Save format version. */
  version: number;
  seed: number;
  rng: RngState;
  tick: number;
  speed: number; // 0 = paused, otherwise multiplier
  grid: CityGrid;
  districts: District[];
  buildings: Record<number, Building>;
  nextBuildingId: number;
  population: PopulationState;
  competitors: Record<number, Competitor>;
  market: MarketState;
  /** Day index of the last AI expansion check. */
  lastCompetitorExpansionDay: number;
  rivals: RivalFamily[];
  factions: SharedFactionState[];
  politics: SharedPoliticsState;
  crisis: CrisisState;
  weather: WeatherState;
  /** Real-world creation timestamp and name shown in save slots. */
  meta: { createdAt: number; cityName: string };
  players: Record<string, PlayerSlice>;
  /** Deterministic iteration order of players (join order). */
  playerOrder: string[];
}

/**
 * The state as one player sees it: the shared world plus that player's own
 * slice merged in (ledger, company, relations, ...). Created with
 * `withPlayer(world, id)` from sim/players.ts; writes go to the right place.
 * Systems, commands and the UI work on this view.
 */
export interface GameState extends Omit<WorldState, 'rivals' | 'factions' | 'politics'> {
  /** Id of the player this view belongs to. */
  playerId: string;
  /** The underlying shared world. */
  world: WorldState;
  ledger: Ledger;
  player: PlayerProfile;
  progression: ProgressionState;
  log: LogEntry[];
  nextLogId: number;
  tasks: TaskState[];
  undoStack: UndoEntry[];
  underworld: UnderworldState;
  factions: FactionState[];
  politics: PoliticsState;
  decisions: DecisionState;
  corporate: CorporateState;
  research: ResearchState;
  casino: CasinoState;
}

/** JSON-friendly shape of the world (grid as plain arrays). */
export interface GameStateJSON extends Omit<WorldState, 'grid'> {
  grid: GridJSON;
}

export function stateToJSON(state: WorldState): GameStateJSON {
  return { ...state, grid: state.grid.toJSON() };
}

export function stateFromJSON(json: GameStateJSON): WorldState {
  return { ...json, grid: CityGrid.fromJSON(json.grid) };
}

export const LOG_LIMIT = 200;
export const TRANSACTION_LIMIT = 300;
export const BALANCE_HISTORY_LIMIT = 365;
export const BUSINESS_HISTORY_LIMIT = 30;
