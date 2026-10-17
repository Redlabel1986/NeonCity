import { useEffect, useRef } from 'react';
import { CityRenderer } from '../../render/CityRenderer';
import { session, pendingGroundRefresh, cameraListeners } from '../session';
import { useGameStore } from '../store/gameStore';
import { daylightFactor, tickToDate } from '../../sim/core/clock';

/** Mounts the PixiJS renderer and keeps it bound to the current simulation. */
export function CityCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const structureVersion = useGameStore((s) => s.structureVersion);
  const rendererReady = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useGameStore.getState();
    const renderer = new CityRenderer({
      onTileClick: (x, y, button, pointerType) => useGameStore.getState().handleTileClick(x, y, button, pointerType),
      onTileHover: (tile) => useGameStore.getState().setHover(tile),
      onCameraChange: () => cameraListeners.forEach((l) => l()),
      onInteriorTab: (tab) => useGameStore.getState().setDashboardTab(tab),
    });
    let cancelled = false;
    void renderer.init(host, { effects: store.settings.effects, reducedMotion: store.settings.reducedMotion, traffic: store.settings.traffic }).then(() => {
      if (cancelled) return;
      session.renderer = renderer;
      rendererReady.current = true;
      const sim = session.sim;
      if (sim) {
        renderer.loadWorld(sim.state);
        renderer.setDaylight(daylightFactor(tickToDate(sim.state.tick).minuteOfDay));
        const home = sim.state.districts[sim.state.player.homeDistrictId]!;
        renderer.focusTile(home.cx, home.cy, 1);
      }
      useGameStore.getState().bumpTick();
    });
    return () => {
      cancelled = true;
      rendererReady.current = false;
      if (session.renderer === renderer) session.renderer = null;
      renderer.destroy();
    };
  }, []);

  // Structural changes that the loop did not already forward (e.g. undo via UI).
  useEffect(() => {
    const sim = session.sim;
    const renderer = session.renderer;
    if (!sim || !renderer || !rendererReady.current) return;
    renderer.syncBuildings(sim.state);
    // Removed buildings leave lots behind that need ground sprites again.
    for (const [x, y, w, h] of pendingGroundRefresh.splice(0)) renderer.refreshGround(sim.state, x, y, w, h);
  }, [structureVersion]);

  return <div ref={hostRef} className="absolute inset-0" aria-label="Stadtkarte von Nova Eclipse" role="application" />;
}
