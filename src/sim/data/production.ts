/** Production recipes for factories: inputs per output unit, energy, labour. */

export interface ProductionRecipe {
  id: string;
  name: string;
  output: string; // catalogue id
  /** Input units per output unit. */
  inputs: Record<string, number>;
  /** Energy credits per output unit before research. */
  energyPerUnit: number;
  /** Worker-hours per output unit at skill 50. */
  laborPerUnit: number;
  /** Pollution added to the district per 100 units. */
  pollutionPer100: number;
}

export const PRODUCTION: Record<string, ProductionRecipe> = {
  synthmeat_plant: { id: 'synthmeat_plant', name: 'Synth-Fleisch-Kultur', output: 'synthmeat', inputs: { protein_base: 0.6, chemicals: 0.1 }, energyPerUnit: 0.5, laborPerUnit: 0.05, pollutionPer100: 0.6 },
  noodle_works: { id: 'noodle_works', name: 'Nudelwerk', output: 'noodles', inputs: { grain: 0.7 }, energyPerUnit: 0.15, laborPerUnit: 0.03, pollutionPer100: 0.2 },
  broth_kettles: { id: 'broth_kettles', name: 'Brühkessel', output: 'broth', inputs: { protein_base: 0.2, grain: 0.2, chemicals: 0.05 }, energyPerUnit: 0.3, laborPerUnit: 0.04, pollutionPer100: 0.3 },
  fermenter: { id: 'fermenter', name: 'Getränkefermenter', output: 'drinks', inputs: { grain: 0.3, chemicals: 0.05 }, energyPerUnit: 0.2, laborPerUnit: 0.02, pollutionPer100: 0.2 },
  snack_line: { id: 'snack_line', name: 'Snack-Linie', output: 'snacks', inputs: { grain: 0.4, chemicals: 0.1 }, energyPerUnit: 0.2, laborPerUnit: 0.03, pollutionPer100: 0.3 },
  stim_lab: { id: 'stim_lab', name: 'Stim-Synthese', output: 'stims', inputs: { chemicals: 0.8 }, energyPerUnit: 0.6, laborPerUnit: 0.08, pollutionPer100: 1.0 },
  parts_assembly: { id: 'parts_assembly', name: 'Teilemontage', output: 'cyber_parts', inputs: { electronics: 0.9, chemicals: 0.1 }, energyPerUnit: 0.9, laborPerUnit: 0.12, pollutionPer100: 0.8 },
  // Farms (Greenhaven): no raw inputs, labour and water instead.
  vegetable_field: { id: 'vegetable_field', name: 'Gemüsefeld', output: 'vegetables', inputs: {}, energyPerUnit: 0.02, laborPerUnit: 0.07, pollutionPer100: 0 },
  herb_garden: { id: 'herb_garden', name: 'Kräutergarten', output: 'herbs', inputs: {}, energyPerUnit: 0.03, laborPerUnit: 0.16, pollutionPer100: 0 },
  grain_field: { id: 'grain_field', name: 'Getreidefeld', output: 'grain', inputs: {}, energyPerUnit: 0.02, laborPerUnit: 0.04, pollutionPer100: 0 },
};

export const PRODUCTION_IDS: readonly string[] = Object.keys(PRODUCTION);
