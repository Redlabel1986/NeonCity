import type { EventBus } from './events';
import type { Rng } from './rng';
import type { GameState } from '../state';

/** Everything a simulation system needs. Systems never touch anything else. */
export interface SimContext {
  state: GameState;
  events: EventBus;
  rng: Rng;
}
