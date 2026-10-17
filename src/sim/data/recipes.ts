/** Recipes: what a gastronomy business can put on its menu. */

export interface RecipeDefinition {
  id: string;
  name: string;
  description: string;
  /** Ingredient units consumed per serving. */
  ingredients: Record<string, number>;
  basePrice: number;
  /** How attractive the dish is to guests (0-100). */
  appeal: number;
  /** Cook skill at which the dish reaches full quality (0-100). */
  complexity: number;
  /** Kitchen load relative to a standard dish (1 = standard). */
  prepLoad: number;
}

export const RECIPES: Record<string, RecipeDefinition> = {
  shoyu_ramen: {
    id: 'shoyu_ramen',
    name: 'Shoyu-Ramen',
    description: 'Der Klassiker: klare Sojabrühe, Nudeln, Synth-Chashu.',
    ingredients: { noodles: 1, broth: 1, synthmeat: 1, vegetables: 0.5, spices: 0.2 },
    basePrice: 18,
    appeal: 70,
    complexity: 45,
    prepLoad: 1,
  },
  miso_ramen: {
    id: 'miso_ramen',
    name: 'Miso-Ramen',
    description: 'Kräftige Misobrühe, viel Gemüse, etwas schärfer.',
    ingredients: { noodles: 1, broth: 1, vegetables: 1, spices: 0.4 },
    basePrice: 16,
    appeal: 62,
    complexity: 40,
    prepLoad: 1,
  },
  veggie_ramen: {
    id: 'veggie_ramen',
    name: 'Gemüse-Ramen',
    description: 'Günstig und beliebt bei Pendlern aus der Old City.',
    ingredients: { noodles: 1, broth: 0.8, vegetables: 1.2, spices: 0.2 },
    basePrice: 13,
    appeal: 50,
    complexity: 25,
    prepLoad: 0.8,
  },
  spicy_synth_ramen: {
    id: 'spicy_synth_ramen',
    name: 'Spicy Synth-Ramen',
    description: 'Doppelt Fleisch, Chili-Öl, Signature-Gericht für Nachtschwärmer.',
    ingredients: { noodles: 1.2, broth: 1, synthmeat: 1.6, vegetables: 0.4, spices: 0.8 },
    basePrice: 26,
    appeal: 80,
    complexity: 70,
    prepLoad: 1.4,
  },
  gyoza: {
    id: 'gyoza',
    name: 'Gyoza',
    description: 'Gebratene Teigtaschen als Beilage.',
    ingredients: { noodles: 0.4, synthmeat: 0.5, vegetables: 0.4, spices: 0.1 },
    basePrice: 9,
    appeal: 45,
    complexity: 35,
    prepLoad: 0.6,
  },
  synth_beer: {
    id: 'synth_beer',
    name: 'Synth-Bier',
    description: 'Kaltes Bier aus dem Fermenter. Hohe Marge.',
    ingredients: { drinks: 1 },
    basePrice: 6,
    appeal: 40,
    complexity: 0,
    prepLoad: 0.2,
  },
  noodle_box: {
    id: 'noodle_box',
    name: 'Nudelbox',
    description: 'Gebratene Nudeln zum Mitnehmen.',
    ingredients: { noodles: 1, vegetables: 0.6, spices: 0.3 },
    basePrice: 7,
    appeal: 55,
    complexity: 20,
    prepLoad: 0.7,
  },
  synth_sushi: {
    id: 'synth_sushi',
    name: 'Synth-Sushi',
    description: 'Laborprotein in Reisrollen. Nur mit Synth-Küche (Forschung).',
    ingredients: { noodles: 0.3, synthmeat: 1.0, vegetables: 0.5, spices: 0.3 },
    basePrice: 24,
    appeal: 72,
    complexity: 55,
    prepLoad: 1.1,
  },
  lab_steak: {
    id: 'lab_steak',
    name: 'Labor-Steak',
    description: 'Gewachsenes Steak mit Chrome-Glasur. Nur mit Synth-Küche (Forschung).',
    ingredients: { synthmeat: 2.0, vegetables: 0.6, spices: 0.5 },
    basePrice: 32,
    appeal: 85,
    complexity: 75,
    prepLoad: 1.5,
  },
  synth_skewer: {
    id: 'synth_skewer',
    name: 'Synth-Spieß',
    description: 'Gegrillter Spieß vom Stand, mit scharfer Soße.',
    ingredients: { synthmeat: 0.8, spices: 0.3 },
    basePrice: 8,
    appeal: 60,
    complexity: 25,
    prepLoad: 0.6,
  },
};

export function getRecipe(id: string): RecipeDefinition {
  const def = RECIPES[id];
  if (!def) throw new Error(`Unknown recipe: ${id}`);
  return def;
}
