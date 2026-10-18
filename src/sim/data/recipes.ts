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
  herb_bowl: { id: 'herb_bowl', name: 'Kräuter-Bowl', description: 'Regionales Gemüse mit frischen Premium-Kräutern aus Greenhaven.', ingredients: { vegetables: 1.2, herbs: 0.4, noodles: 0.3 }, basePrice: 14, appeal: 66, complexity: 35, prepLoad: 0.8 },
  // --- unlocked by evolution stages (data/evolution.ts)
  tonkotsu_ramen: { id: 'tonkotsu_ramen', name: 'Tonkotsu-Ramen', description: 'Zwölf Stunden gekochte Knochenbrühe, cremig und schwer.', ingredients: { noodles: 1, broth: 1.6, synthmeat: 1.2, spices: 0.3 }, basePrice: 24, appeal: 78, complexity: 60, prepLoad: 1.2 },
  peking_duck: { id: 'peking_duck', name: 'Peking-Ente', description: 'Knusprige Synth-Ente mit Pfannkuchen.', ingredients: { synthmeat: 2, vegetables: 0.8, spices: 0.6, noodles: 0.3 }, basePrice: 42, appeal: 80, complexity: 70, prepLoad: 1.6 },
  tasting_menu: { id: 'tasting_menu', name: 'Tasting-Menü', description: 'Sieben Gänge, jeder ein Statement.', ingredients: { synthmeat: 1.5, vegetables: 1.5, broth: 0.6, spices: 0.8, drinks: 0.5 }, basePrice: 95, appeal: 85, complexity: 85, prepLoad: 2.4 },
  yakitori: { id: 'yakitori', name: 'Yakitori', description: 'Spieße vom Holzkohlegrill, Tare-Sauce.', ingredients: { synthmeat: 0.7, spices: 0.3 }, basePrice: 11, appeal: 60, complexity: 35, prepLoad: 0.7 },
  sake_set: { id: 'sake_set', name: 'Sake-Set', description: 'Drei Sorten, warm und kalt.', ingredients: { drinks: 1.5 }, basePrice: 16, appeal: 55, complexity: 20, prepLoad: 0.3 },
  sashimi_plate: { id: 'sashimi_plate', name: 'Sashimi-Platte', description: 'Zuchttankfisch, messerscharf geschnitten.', ingredients: { synthmeat: 1.4, vegetables: 0.3, spices: 0.2 }, basePrice: 38, appeal: 76, complexity: 75, prepLoad: 1.1 },
  omakase_menu: { id: 'omakase_menu', name: 'Omakase', description: 'Der Meister entscheidet. Zwölf Stücke.', ingredients: { synthmeat: 2.2, vegetables: 0.5, spices: 0.5, drinks: 0.4 }, basePrice: 160, appeal: 90, complexity: 92, prepLoad: 3 },
  dan_dan_noodles: { id: 'dan_dan_noodles', name: 'Dan-Dan-Nudeln', description: 'Sesam, Chili, Hackfleisch.', ingredients: { noodles: 1, synthmeat: 0.5, spices: 0.6 }, basePrice: 15, appeal: 66, complexity: 42, prepLoad: 0.9 },
  dim_sum: { id: 'dim_sum', name: 'Dim Sum', description: 'Dampfkörbe mit Teigtaschen.', ingredients: { noodles: 0.6, synthmeat: 0.5, vegetables: 0.5, spices: 0.2 }, basePrice: 19, appeal: 72, complexity: 55, prepLoad: 1.3 },
  dim_sum_premium: { id: 'dim_sum_premium', name: 'Premium-Dim-Sum', description: 'Trüffel, Goldblatt, Teewagen.', ingredients: { noodles: 0.6, synthmeat: 0.9, vegetables: 0.6, spices: 0.6 }, basePrice: 48, appeal: 82, complexity: 78, prepLoad: 1.8 },
  tteokbokki: { id: 'tteokbokki', name: 'Tteokbokki', description: 'Reiskuchen in scharfer Sauce.', ingredients: { noodles: 1, vegetables: 0.4, spices: 0.7 }, basePrice: 10, appeal: 62, complexity: 30, prepLoad: 0.7 },
  korean_bbq: { id: 'korean_bbq', name: 'Korean BBQ', description: 'Tischgrill, Marinaden, Beilagen ohne Ende.', ingredients: { synthmeat: 1.6, vegetables: 1, spices: 0.6, drinks: 0.3 }, basePrice: 34, appeal: 80, complexity: 50, prepLoad: 1.2 },
  bibimbap: { id: 'bibimbap', name: 'Bibimbap', description: 'Reis, Gemüse, Ei, Gochujang.', ingredients: { noodles: 0.8, vegetables: 1.2, synthmeat: 0.4, spices: 0.4 }, basePrice: 17, appeal: 68, complexity: 45, prepLoad: 1 },
  hanwoo_set: { id: 'hanwoo_set', name: 'Hanwoo-Set', description: 'Edelstes Synth-Rind, am Tisch gegrillt.', ingredients: { synthmeat: 2.4, vegetables: 0.8, spices: 0.6, drinks: 0.5 }, basePrice: 88, appeal: 86, complexity: 80, prepLoad: 2 },
  doener: { id: 'doener', name: 'Döner', description: 'Drehspieß, Fladenbrot, alles mit Soße.', ingredients: { synthmeat: 0.9, vegetables: 0.6, noodles: 0.4, spices: 0.3 }, basePrice: 9, appeal: 74, complexity: 28, prepLoad: 0.6 },
  lahmacun: { id: 'lahmacun', name: 'Lahmacun', description: 'Dünner Fladen mit Hack und Kräutern.', ingredients: { noodles: 0.5, synthmeat: 0.5, vegetables: 0.5, spices: 0.3 }, basePrice: 8, appeal: 60, complexity: 32, prepLoad: 0.7 },
  adana_grill: { id: 'adana_grill', name: 'Adana-Grill', description: 'Scharfe Hackspieße vom Holzkohlegrill.', ingredients: { synthmeat: 1.3, vegetables: 0.6, spices: 0.6 }, basePrice: 22, appeal: 74, complexity: 50, prepLoad: 1.1 },
  meze_plate: { id: 'meze_plate', name: 'Meze-Platte', description: 'Kleine Teller zum Teilen.', ingredients: { vegetables: 1.4, spices: 0.5, noodles: 0.3 }, basePrice: 18, appeal: 64, complexity: 40, prepLoad: 0.9 },
  grill_platter: { id: 'grill_platter', name: 'Große Grillplatte', description: 'Für den Tisch: Lamm, Rind, Hähnchen aus dem Tank.', ingredients: { synthmeat: 2.4, vegetables: 1, spices: 0.8 }, basePrice: 52, appeal: 80, complexity: 62, prepLoad: 1.8 },
  tomahawk: { id: 'tomahawk', name: 'Tomahawk-Steak', description: 'Ein Kilo, dry-aged im Synth-Reifeschrank.', ingredients: { synthmeat: 3.2, vegetables: 0.6, spices: 0.6 }, basePrice: 110, appeal: 84, complexity: 72, prepLoad: 2 },
  synth_burger: { id: 'synth_burger', name: 'Synth-Burger', description: 'Patty, Brötchen, Käse aus dem Fermenter.', ingredients: { synthmeat: 0.8, noodles: 0.4, vegetables: 0.3, spices: 0.1 }, basePrice: 9, appeal: 72, complexity: 25, prepLoad: 0.6 },
  fries: { id: 'fries', name: 'Pommes', description: 'Knusprig, salzig, immer.', ingredients: { vegetables: 0.6, spices: 0.1 }, basePrice: 4, appeal: 50, complexity: 10, prepLoad: 0.3 },
  menu_box: { id: 'menu_box', name: 'Menü-Box', description: 'Burger, Pommes, Getränk. Standardisiert.', ingredients: { synthmeat: 0.8, noodles: 0.4, vegetables: 0.8, drinks: 1, spices: 0.1 }, basePrice: 14, appeal: 70, complexity: 20, prepLoad: 0.8 },
  currywurst: { id: 'currywurst', name: 'Currywurst', description: 'Synth-Wurst, Ketchup, Curry, Pappschale.', ingredients: { synthmeat: 0.8, spices: 0.5 }, basePrice: 7, appeal: 70, complexity: 15, prepLoad: 0.5 },
  falafel_wrap: { id: 'falafel_wrap', name: 'Falafel-Wrap', description: 'Kichererbsen, Tahini, viel Grün.', ingredients: { vegetables: 1.2, noodles: 0.4, spices: 0.4 }, basePrice: 9, appeal: 64, complexity: 30, prepLoad: 0.6 },
  vegan_bowl: { id: 'vegan_bowl', name: 'Vegan Bowl', description: 'Getreide, Gemüse, fermentierte Saucen.', ingredients: { vegetables: 1.6, noodles: 0.5, spices: 0.5 }, basePrice: 16, appeal: 66, complexity: 40, prepLoad: 0.9 },
  pizza: { id: 'pizza', name: 'Pizza', description: 'Steinofen, dünner Boden, Synth-Salami.', ingredients: { noodles: 1, vegetables: 0.6, synthmeat: 0.4, spices: 0.3 }, basePrice: 13, appeal: 76, complexity: 35, prepLoad: 0.9 },
  synth_coffee: { id: 'synth_coffee', name: 'Synth-Kaffee', description: 'Geröstet im Fermenter, serviert wie echter.', ingredients: { drinks: 0.6, spices: 0.1 }, basePrice: 5, appeal: 58, complexity: 20, prepLoad: 0.3 },
  pastry: { id: 'pastry', name: 'Gebäck', description: 'Croissant, Zimtschnecke, Protein-Donut.', ingredients: { noodles: 0.5, spices: 0.2 }, basePrice: 4, appeal: 52, complexity: 25, prepLoad: 0.4 },
  cake: { id: 'cake', name: 'Kuchen', description: 'Ein Stück Nachmittag.', ingredients: { noodles: 0.6, vegetables: 0.2, spices: 0.3, drinks: 0.2 }, basePrice: 7, appeal: 60, complexity: 35, prepLoad: 0.5 },
  cocktail: { id: 'cocktail', name: 'Cocktail', description: 'Synth-Gin, Tonic, Neon-Eis.', ingredients: { drinks: 1.2, spices: 0.2 }, basePrice: 12, appeal: 66, complexity: 30, prepLoad: 0.4 },
  bar_snacks: { id: 'bar_snacks', name: 'Bar-Snacks', description: 'Nüsse, Chips, Wings.', ingredients: { synthmeat: 0.4, spices: 0.3, vegetables: 0.2 }, basePrice: 6, appeal: 48, complexity: 15, prepLoad: 0.3 },
  signature_cocktail: { id: 'signature_cocktail', name: 'Signature-Cocktail', description: 'Die Kreation des Hauses, mit Show.', ingredients: { drinks: 1.6, spices: 0.4, vegetables: 0.2 }, basePrice: 22, appeal: 76, complexity: 55, prepLoad: 0.6 },
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
