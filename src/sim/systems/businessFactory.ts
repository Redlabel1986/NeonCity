/** Creates the matching business state for a building definition. */

import type { Rng } from '../core/rng';
import type { BuildingDefinition } from '../data/buildings';
import type { BusinessState } from '../state';
import { createBusinessState } from './business';
import { createHotelState } from './hotel';
import { createTransportState } from './transport';
import { createRetailState } from './retail';
import { createSecurityState } from './security';
import { createLabState } from './research';
import { createIndustryState } from './industry';

export function createBusinessStateFor(def: BuildingDefinition, rng: Rng, day: number, tick: number, districtSkillBias: number): BusinessState | undefined {
  const model = def.business;
  if (!model) return undefined;
  switch (model.kind) {
    case 'gastronomy':
      return createBusinessState(model, rng, day, tick, districtSkillBias);
    case 'hotel':
      return createHotelState(model, rng, day, tick, districtSkillBias);
    case 'transport':
      return createTransportState(model, rng, day, tick, districtSkillBias);
    case 'retail':
      return createRetailState(model, rng, day, tick, districtSkillBias);
    case 'security':
      return createSecurityState(model, rng, day, tick, districtSkillBias);
    case 'lab':
      return createLabState(model, rng, day, tick, districtSkillBias);
    case 'industry':
      return createIndustryState(model, rng, day, tick, districtSkillBias);
    default:
      return undefined;
  }
}
