import { useEffect, useRef } from 'react';
import { buildInteriorScene } from '../../render/interior/layouts';
import { session } from '../session';
import { useGameStore } from '../store/gameStore';

/**
 * Interior view of the business being managed. Mounted while
 * `interiorBuildingId` is set. The drawing happens in the city renderer's
 * interior layer; this component feeds it the scene, tells it which part of
 * the screen it may use, and shows the HTML controls on top.
 */
export function InteriorCanvas({ buildingId }: { buildingId: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tick = useGameStore((s) => s.tick);
  const leaveInterior = useGameStore((s) => s.leaveInterior);
  const zone = useGameStore((s) => s.interiorZone);
  const showZone = useGameStore((s) => s.showInteriorZone);

  // Viewport: the centre column between the panels, in canvas pixels.
  useEffect(() => {
    const host = hostRef.current;
    const renderer = session.renderer;
    if (!host || !renderer) return;
    const update = (): void => {
      const canvas = renderer.app.renderer ? renderer.app.canvas : null;
      if (!canvas) return;
      const c = canvas.getBoundingClientRect();
      const r = host.getBoundingClientRect();
      renderer.interior.setViewport(r.left - c.left, r.top - c.top, r.width, r.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      session.renderer?.interior.hide();
    };
  }, [buildingId]);

  // Scene: rebuilt from the simulation whenever the UI tick advances.
  useEffect(() => {
    const sim = session.sim;
    const renderer = session.renderer;
    if (!sim || !renderer) return;
    const b = sim.state.buildings[buildingId];
    if (!b) {
      useGameStore.getState().leaveInterior();
      return;
    }
    const scene = buildInteriorScene(b, sim.state, renderer.spriteIdFor(sim.state, b));
    if (scene) renderer.interior.show(scene);
    else useGameStore.getState().leaveInterior();
  }, [tick, buildingId]);

  const building = session.sim?.state.buildings[buildingId];
  return (
    <div ref={hostRef} className="interior-fade pointer-events-none absolute inset-0" data-testid="interior-view" role="application" aria-label={`Innenansicht: ${building?.label ?? 'Betrieb'}`}>
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-sm border border-line bg-ink/80 px-2 py-1 text-xs text-muted">
          {building?.business ? 'Innenansicht · Zonen anklicken, um den passenden Reiter zu öffnen' : 'Innenansicht · Bereiche anklicken für Details, Personen antippen für Namen'}
        </span>
      </div>
      <button type="button" className="btn pointer-events-auto absolute right-3 top-3" onClick={leaveInterior} aria-label="Innenansicht verlassen">
        Zur Stadt (Esc)
      </button>
      {zone && (
        <div className="pointer-events-auto absolute bottom-3 left-3 w-72 rounded-sm border border-line bg-ink p-3 text-sm shadow-lg" data-testid="interior-zone-card" role="dialog" aria-label={`Bereich: ${zone.label}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="panel-title">{zone.label}</p>
            <button type="button" className="text-muted hover:text-white" onClick={() => showZone(null)} aria-label="Bereich schließen">
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-cyan">{zone.status}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {zone.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
