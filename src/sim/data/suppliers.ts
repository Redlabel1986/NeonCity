/** Ingredient suppliers. Price multipliers apply to ingredient base prices. */

export interface SupplierDefinition {
  id: string;
  name: string;
  description: string;
  /** Multiplier on ingredient base prices. */
  priceFactor: number;
  /** Quality of delivered goods (0-100). */
  quality: number;
  /** Delivery time in game hours. */
  deliveryHours: number;
  /** Probability that a delivery is delayed by `delayHours`. */
  delayChance: number;
  delayHours: number;
  /** Minimum order value in credits. */
  minOrder: number;
  /** Ingredients this supplier does not carry. */
  excludes: readonly string[];
}

export const SUPPLIERS: Record<string, SupplierDefinition> = {
  docks_wholesale: {
    id: 'docks_wholesale',
    name: 'Rust Docks Großmarkt',
    description: 'Günstig und in großen Mengen, aber die Ware ist Durchschnitt und der Lieferwagen oft spät.',
    priceFactor: 0.85,
    quality: 45,
    deliveryHours: 10,
    delayChance: 0.25,
    delayHours: 8,
    minOrder: 150,
    excludes: ['stims', 'cyber_parts', 'meds'],
  },
  market_runner: {
    id: 'market_runner',
    name: 'Neon Market Kurier',
    description: 'Schnelle Lieferung aus den Markthallen zu fairen Preisen.',
    priceFactor: 1.0,
    quality: 60,
    deliveryHours: 4,
    delayChance: 0.08,
    delayHours: 3,
    minOrder: 60,
    excludes: ['electronics'],
  },
  chrome_fresh: {
    id: 'chrome_fresh',
    name: 'Chrome Fresh Logistics',
    description: 'Laborfrische Premiumware mit Kühlkette. Teuer, zuverlässig, exzellente Qualität.',
    priceFactor: 1.45,
    quality: 88,
    deliveryHours: 6,
    delayChance: 0.02,
    delayHours: 2,
    minOrder: 200,
    excludes: ['snacks', 'grain'],
  },
  undercity_dealer: {
    id: 'undercity_dealer',
    name: 'Undercity-Händler',
    description: 'Fragwürdige Herkunft, Spottpreise, schwankende Qualität. Keine Getränke.',
    priceFactor: 0.6,
    quality: 30,
    deliveryHours: 3,
    delayChance: 0.35,
    delayHours: 12,
    minOrder: 30,
    excludes: ['drinks', 'meds', 'protein_base', 'grain'],
  },
};

export const SUPPLIER_IDS: readonly string[] = Object.keys(SUPPLIERS);
