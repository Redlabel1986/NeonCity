import { useGameStore, useSimState } from '../store/gameStore';
import { REGION_ORDER, REGIONS } from '../../sim/data/regions';
import { isRegionUnlocked } from '../../sim/systems/progression';

/** One tab per map (level); locked maps show the level that opens them. */
export function MapTabs({ compact = false }: { compact?: boolean }) {
  const state = useSimState();
  const activeMap = useGameStore((s) => s.activeMap);
  const switchMap = useGameStore((s) => s.switchMap);
  const interior = useGameStore((s) => s.interiorBuildingId);
  if (!state || interior !== null) return null;
  return (
    <nav className={`panel pointer-events-auto flex ${compact ? 'gap-0.5 p-0.5' : 'gap-1 p-1'}`} aria-label="Karten">
      {REGION_ORDER.map((id, i) => {
        const region = REGIONS[id];
        const unlocked = isRegionUnlocked(state, id);
        const active = activeMap === id;
        return (
          <button
            key={id}
            type="button"
            className={`btn ${compact ? 'px-1.5 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs'} ${active ? 'border-cyan bg-cyan/15 text-white' : ''} ${unlocked ? '' : 'opacity-50'}`}
            aria-pressed={active}
            aria-label={unlocked ? `Karte ${region.name}` : `Karte ${region.name}, gesperrt bis Level ${region.requiredLevel}`}
            title={unlocked ? region.tagline : `Ab Level ${region.requiredLevel}: ${region.tagline}`}
            onClick={() => switchMap(id)}
            data-testid={`map-tab-${id}`}
          >
            <span className="mr-1 text-muted">{i + 1}</span>
            {compact ? region.name.split(' ')[0] : region.name}
            {!unlocked && <span className="ml-1" aria-hidden>🔒</span>}
          </button>
        );
      })}
    </nav>
  );
}
