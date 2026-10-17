/**
 * Non-reactive session objects. React components read these through the
 * store's tick counter; the objects themselves are mutable singletons.
 */

import type { Simulation } from '../sim/engine';
import type { CityRenderer } from '../render/CityRenderer';
import type { OnlineClient } from '../net/client';

export const session: { sim: Simulation | null; renderer: CityRenderer | null; online: OnlineClient | null } = {
  sim: null,
  renderer: null,
  online: null,
};

/** Footprints whose ground tiles must be re-drawn after a building was removed. */
export const pendingGroundRefresh: [number, number, number, number][] = [];

/** Listeners notified whenever the camera moves (minimap viewport). */
export const cameraListeners = new Set<() => void>();
