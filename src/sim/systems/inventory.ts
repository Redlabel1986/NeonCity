/**
 * Ingredient inventory: FIFO lots with quality and shelf life, supply orders
 * with delivery times, spoilage and automatic reorders.
 */

import type { SimContext } from '../core/context';
import type { Building, GastronomyState, IndustryState, InventoryLot, RetailState, SupplyOrder } from '../state';
import { techFactors } from './research';
import { crisisFactors } from './crises';

/** Businesses with a stock room (gastronomy, retail, industry). */
export type StockHolder = GastronomyState | RetailState | IndustryState;

export function stockHolderOf(b: Building): StockHolder | null {
  const biz = b.business;
  if (!biz) return null;
  return biz.kind === 'gastronomy' || biz.kind === 'retail' || biz.kind === 'industry' ? biz : null;
}
import { INGREDIENTS, getIngredient } from '../data/ingredients';
import { SUPPLIERS } from '../data/suppliers';
import { RECIPES } from '../data/recipes';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulty';
import { upgradeEffects } from '../data/upgrades';
import { book, canAfford } from '../economy/finance';
import { marketFactor } from './market';
import type { MarketState } from '../state';

export function stockOf(biz: StockHolder, ingredientId: string): number {
  let total = 0;
  for (const lot of biz.inventory) if (lot.ingredientId === ingredientId) total += lot.units;
  return total;
}

export function totalUnits(biz: StockHolder): number {
  return biz.inventory.reduce((s, l) => s + l.units, 0);
}

export function storageCapacity(b: Building): number {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  if (!model || !b.business) return 0;
  if (model.kind !== 'gastronomy' && model.kind !== 'retail' && model.kind !== 'industry') return 0;
  return model.storage + upgradeEffects(b.business.upgrades).storage;
}

/** Removes `units` of a good FIFO; returns quality and cost, or null when short. */
export function takeUnits(biz: StockHolder, ingredientId: string, units: number): { quality: number; cost: number } | null {
  if (stockOf(biz, ingredientId) < units) return null;
  let remaining = units;
  let qualitySum = 0;
  let cost = 0;
  for (const lot of biz.inventory) {
    if (lot.ingredientId !== ingredientId || lot.units <= 0) continue;
    const take = Math.min(lot.units, remaining);
    lot.units -= take;
    remaining -= take;
    qualitySum += lot.quality * take;
    cost += lot.unitCost * take;
    if (remaining <= 1e-9) break;
  }
  biz.inventory = biz.inventory.filter((l) => l.units > 1e-6);
  return { quality: units > 0 ? qualitySum / units : 50, cost };
}

/** Can one serving of the recipe be made from stock? */
export function canMake(biz: StockHolder, recipeId: string): boolean {
  const recipe = RECIPES[recipeId];
  if (!recipe) return false;
  for (const [ing, units] of Object.entries(recipe.ingredients)) {
    if (stockOf(biz, ing) < units) return false;
  }
  return true;
}

/** How many servings of the recipe the stock allows. */
export function servingsPossible(biz: StockHolder, recipeId: string): number {
  const recipe = RECIPES[recipeId];
  if (!recipe) return 0;
  let min = Infinity;
  for (const [ing, units] of Object.entries(recipe.ingredients)) {
    min = Math.min(min, Math.floor(stockOf(biz, ing) / units));
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * Consumes ingredients FIFO. Returns average quality and ingredient cost
 * of the serving, or null when stock is insufficient.
 */
export function consumeForRecipe(biz: StockHolder, recipeId: string): { quality: number; cost: number } | null {
  if (!canMake(biz, recipeId)) return null;
  const recipe = RECIPES[recipeId]!;
  let qualitySum = 0;
  let unitSum = 0;
  let cost = 0;
  for (const [ing, needed] of Object.entries(recipe.ingredients)) {
    let remaining = needed;
    for (const lot of biz.inventory) {
      if (lot.ingredientId !== ing || lot.units <= 0) continue;
      const take = Math.min(lot.units, remaining);
      lot.units -= take;
      remaining -= take;
      qualitySum += lot.quality * take;
      unitSum += take;
      cost += lot.unitCost * take;
      if (remaining <= 1e-9) break;
    }
  }
  biz.inventory = biz.inventory.filter((l) => l.units > 1e-6);
  return { quality: unitSum > 0 ? qualitySum / unitSum : 50, cost };
}

export function addLot(biz: StockHolder, lot: InventoryLot): void {
  biz.inventory.push(lot);
}

export function quoteOrder(
  state: { player: { difficulty: keyof typeof DIFFICULTIES }; market?: MarketState; crisis?: { active: { id: string } | null } },
  supplierId: string,
  items: { ingredientId: string; units: number }[],
): { ok: true; cost: number; lines: { ingredientId: string; units: number; unitPrice: number }[] } | { ok: false; error: string } {
  const supplier = SUPPLIERS[supplierId];
  if (!supplier) return { ok: false, error: 'Unbekannter Lieferant.' };
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const lines: { ingredientId: string; units: number; unitPrice: number }[] = [];
  let cost = 0;
  for (const item of items) {
    if (!INGREDIENTS[item.ingredientId]) return { ok: false, error: `Unbekannte Zutat: ${item.ingredientId}` };
    if (supplier.excludes.includes(item.ingredientId)) return { ok: false, error: `${supplier.name} liefert keine ${getIngredient(item.ingredientId).name}.` };
    const units = Math.max(0, Math.floor(item.units));
    if (units === 0) continue;
    const market = state.market ? marketFactor(state.market, item.ingredientId) : 1;
    const crisis = state.crisis ? crisisFactors(state as unknown as import('../state').GameState).purchase : 1;
    const unitPrice = Math.round(getIngredient(item.ingredientId).basePrice * supplier.priceFactor * difficulty.costMultiplier * market * crisis * 100) / 100;
    lines.push({ ingredientId: item.ingredientId, units, unitPrice });
    cost += unitPrice * units;
  }
  cost = Math.round(cost * 100) / 100;
  if (lines.length === 0) return { ok: false, error: 'Die Bestellung ist leer.' };
  if (cost < supplier.minOrder) return { ok: false, error: `${supplier.name} liefert erst ab ${supplier.minOrder} ¢ Bestellwert.` };
  return { ok: true, cost, lines };
}

export function placeOrder(
  ctx: SimContext,
  b: Building,
  supplierId: string,
  items: { ingredientId: string; units: number }[],
  label = 'Bestellung',
): { ok: true; order: SupplyOrder } | { ok: false; error: string } {
  const { state, events, rng } = ctx;
  const biz = stockHolderOf(b);
  if (!biz) return { ok: false, error: 'Dieser Betrieb hat kein Lager.' };
  const quote = quoteOrder(state, supplierId, items);
  if (!quote.ok) return quote;
  const supplier = SUPPLIERS[supplierId]!;
  const incoming = quote.lines.reduce((s, l) => s + l.units, 0);
  const pending = biz.orders.reduce((s, o) => s + o.items.reduce((t, i) => t + i.units, 0), 0);
  if (totalUnits(biz) + pending + incoming > storageCapacity(b)) {
    return { ok: false, error: `Das Lager fasst nur ${storageCapacity(b)} Einheiten (inklusive offener Lieferungen).` };
  }
  if (!canAfford(state, quote.cost)) return { ok: false, error: `Nicht genug Credits für die Bestellung (${Math.round(quote.cost)} ¢).` };
  const delayed = rng.chance(supplier.delayChance);
  const hours = Math.max(1, Math.round((supplier.deliveryHours + (delayed ? supplier.delayHours : 0)) * techFactors(state).delivery * crisisFactors(state).delivery));
  const order: SupplyOrder = {
    id: biz.nextEntityId++,
    supplierId,
    items: quote.lines.map((l) => ({ ingredientId: l.ingredientId, units: l.units })),
    cost: quote.cost,
    placedTick: state.tick,
    arrivesTick: state.tick + hours * 60,
    delayed,
  };
  biz.orders.push(order);
  biz.todayPurchases += quote.cost;
  book(state, events, -quote.cost, { category: 'ingredients', description: `${label} bei ${supplier.name}: ${b.label}`, buildingId: b.id });
  return { ok: true, order };
}

/** Delivers arrived orders. */
export function stepDeliveries(ctx: SimContext, b: Building, day: number): void {
  const { state, events, rng } = ctx;
  const biz = stockHolderOf(b);
  if (!biz || biz.orders.length === 0) return;
  if (state.factions?.some((f) => f.activeEffect === 'blockade' && f.activeUntilDay > day)) return;
  const remaining: SupplyOrder[] = [];
  for (const order of biz.orders) {
    if (order.arrivesTick > state.tick) {
      remaining.push(order);
      continue;
    }
    const supplier = SUPPLIERS[order.supplierId]!;
    for (const item of order.items) {
      const unitPrice = order.items.length > 0 ? order.cost / order.items.reduce((s, i) => s + i.units, 0) : 0;
      addLot(biz, {
        ingredientId: item.ingredientId,
        units: item.units,
        boughtDay: day,
        quality: Math.max(5, Math.min(100, Math.round(supplier.quality + rng.gaussian() * (supplier.id === 'undercity_dealer' ? 18 : 6)))),
        unitCost: Math.round(unitPrice * 100) / 100,
      });
    }
    events.emit({
      type: 'log',
      tick: state.tick,
      level: order.delayed ? 'warning' : 'info',
      message: `${b.label}: Lieferung von ${supplier.name} eingetroffen${order.delayed ? ' (verspätet)' : ''}.`,
      buildingId: String(b.id),
    });
  }
  biz.orders = remaining;
}

/** Discards spoiled lots at day close; returns wasted units. */
export function spoilInventory(b: Building, day: number, state?: import('../state').GameState): number {
  const biz = stockHolderOf(b);
  if (!biz) return 0;
  const extraDays = upgradeEffects(biz.upgrades).shelfLife + (state ? techFactors(state).shelfLife : 0);
  let waste = 0;
  biz.inventory = biz.inventory.filter((lot) => {
    const shelf = getIngredient(lot.ingredientId).shelfLifeDays + extraDays;
    if (day - lot.boughtDay >= shelf) {
      waste += lot.units;
      return false;
    }
    return true;
  });
  return waste;
}

/** Automatic reorder up to the configured targets (manager or auto setting). */
export function autoReorder(ctx: SimContext, b: Building): void {
  const biz = stockHolderOf(b);
  if (!biz || !biz.autoReorder) return;
  const items: { ingredientId: string; units: number }[] = [];
  const pendingByIngredient = new Map<string, number>();
  for (const o of biz.orders) for (const i of o.items) pendingByIngredient.set(i.ingredientId, (pendingByIngredient.get(i.ingredientId) ?? 0) + i.units);
  for (const [ingredientId, target] of Object.entries(biz.reorderTargets)) {
    const have = stockOf(biz, ingredientId) + (pendingByIngredient.get(ingredientId) ?? 0);
    const need = Math.ceil(target - have);
    if (need >= 5) items.push({ ingredientId, units: need });
  }
  if (items.length === 0) return;
  const supplier = SUPPLIERS[biz.preferredSupplierId];
  if (!supplier) return;
  let filtered = items.filter((i) => !supplier.excludes.includes(i.ingredientId));
  // Scale the order down to the free storage space.
  const pending = biz.orders.reduce((s, o) => s + o.items.reduce((t, i) => t + i.units, 0), 0);
  const free = storageCapacity(b) - totalUnits(biz) - pending;
  const incoming = filtered.reduce((s, i) => s + i.units, 0);
  if (incoming > free) {
    const scale = Math.max(0, free / incoming);
    filtered = filtered.map((i) => ({ ...i, units: Math.floor(i.units * scale) })).filter((i) => i.units >= 1);
  }
  if (filtered.length === 0) return;
  const result = placeOrder(ctx, b, biz.preferredSupplierId, filtered, 'Nachbestellung');
  if (!result.ok) {
    ctx.events.emit({ type: 'log', tick: ctx.state.tick, level: 'warning', message: `${b.label}: Nachbestellung fehlgeschlagen. ${result.error}`, buildingId: String(b.id) });
  }
}
