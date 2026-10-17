/** Ingredient definitions for gastronomy. Prices are base credits per unit. */

export interface IngredientDefinition {
  id: string;
  name: string;
  basePrice: number;
  /** Days until a lot spoils (counted from purchase day). */
  shelfLifeDays: number;
  /** Catalogue section: kitchen ingredients, retail goods or raw materials for factories. */
  category: 'food' | 'retail' | 'raw';
  /** Retail only: typical shelf price factor on top of purchase price. */
  retailMarkup?: number;
}

export const INGREDIENTS: Record<string, IngredientDefinition> = {
  noodles: { id: 'noodles', name: 'Nudeln', basePrice: 1.2, shelfLifeDays: 6, category: 'food' },
  broth: { id: 'broth', name: 'Brühe', basePrice: 1.6, shelfLifeDays: 3, category: 'food' },
  vegetables: { id: 'vegetables', name: 'Gemüse', basePrice: 1.0, shelfLifeDays: 2, category: 'food' },
  synthmeat: { id: 'synthmeat', name: 'Synth-Fleisch', basePrice: 2.4, shelfLifeDays: 4, category: 'food' },
  spices: { id: 'spices', name: 'Gewürze', basePrice: 0.6, shelfLifeDays: 30, category: 'food' },
  drinks: { id: 'drinks', name: 'Getränke', basePrice: 1.1, shelfLifeDays: 60, category: 'food' },
  snacks: { id: 'snacks', name: 'Snacks', basePrice: 1.4, shelfLifeDays: 20, category: 'retail', retailMarkup: 2.2 },
  stims: { id: 'stims', name: 'Stims', basePrice: 3.5, shelfLifeDays: 90, category: 'retail', retailMarkup: 2.6 },
  cyber_parts: { id: 'cyber_parts', name: 'Cyber-Ersatzteile', basePrice: 9, shelfLifeDays: 365, category: 'retail', retailMarkup: 1.9 },
  meds: { id: 'meds', name: 'Medikamente', basePrice: 4.2, shelfLifeDays: 120, category: 'retail', retailMarkup: 2.0 },
  protein_base: { id: 'protein_base', name: 'Proteinbasis', basePrice: 1.1, shelfLifeDays: 15, category: 'raw' },
  grain: { id: 'grain', name: 'Synth-Getreide', basePrice: 0.5, shelfLifeDays: 60, category: 'raw' },
  chemicals: { id: 'chemicals', name: 'Chemikalien', basePrice: 2.0, shelfLifeDays: 180, category: 'raw' },
  electronics: { id: 'electronics', name: 'Elektronikmodule', basePrice: 6.0, shelfLifeDays: 365, category: 'raw' },
};

/** Raw materials for factories. */
export const RAW_IDS: readonly string[] = Object.values(INGREDIENTS)
  .filter((i) => i.category === 'raw')
  .map((i) => i.id);

/** Kitchen ingredients (gastronomy). */
export const INGREDIENT_IDS: readonly string[] = Object.values(INGREDIENTS)
  .filter((i) => i.category === 'food')
  .map((i) => i.id);

/** Retail goods (drinks are sold in both worlds). */
export const RETAIL_GOOD_IDS: readonly string[] = Object.values(INGREDIENTS)
  .filter((i) => i.category === 'retail' || i.id === 'drinks')
  .map((i) => i.id);

/** Every catalogue entry. */
export const CATALOGUE_IDS: readonly string[] = Object.keys(INGREDIENTS);

export function getIngredient(id: string): IngredientDefinition {
  const def = INGREDIENTS[id];
  if (!def) throw new Error(`Unknown ingredient: ${id}`);
  return def;
}
