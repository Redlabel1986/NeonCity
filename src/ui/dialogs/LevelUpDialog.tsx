import { Dialog } from './Dialog';
import { useGameStore, useSimState } from '../store/gameStore';
import { REGIONS, levelDef } from '../../sim/data/regions';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';

/** Shown once per level-up: the new region, what it offers, and a button to fly there. */
export function LevelUpDialog({ onClose }: { onClose: () => void }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const switchMap = useGameStore((s) => s.switchMap);
  const pending = state?.progression.pendingLevelUp;
  if (!state || !pending) return null;
  const region = REGIONS[pending.region];
  const level = levelDef(pending.level);
  const newBuildings = Object.values(BUILDING_DEFINITIONS).filter((d) => d.id !== 'city' && ((d.minLevel ?? 1) === pending.level || d.regions?.includes(pending.region)));
  const finish = (): void => {
    dispatch({ type: 'ackLevelUp' });
    onClose();
  };
  return (
    <Dialog title={`Level ${pending.level}: ${level.name}`} onClose={finish}>
      <div className="space-y-3 text-sm" data-testid="levelup">
        <div className="rounded-sm border p-3" style={{ borderColor: `#${region.color.toString(16).padStart(6, '0')}` }}>
          <p className="text-lg font-medium text-white">{region.name} ist jetzt offen</p>
          <p className="text-xs text-muted">{region.tagline}</p>
          <p className="mt-2 text-text/80">{region.description}</p>
        </div>
        <dl className="text-xs">
          <dt className="text-muted">Neue Gebäude</dt>
          <dd className="text-white">{newBuildings.length > 0 ? newBuildings.map((d) => d.name).join(', ') : 'keine neuen Typen, aber neue Standorte'}</dd>
          <dt className="mt-1 text-muted">Entwicklungsstufen</dt>
          <dd className="text-white">Betriebe können jetzt bis Stufe {level.maxBusinessTier} ausgebaut werden.</dd>
          <dt className="mt-1 text-muted">Besonderheiten der Region</dt>
          <dd className="text-white">{region.specialties.join(', ')}</dd>
          <dt className="mt-1 text-muted">Ereignisse</dt>
          <dd className="text-white">{region.eventPoolIds.length} regionale Ereignisse können hier auftreten.</dd>
        </dl>
        <p className="text-xs text-muted">Deine Betriebe in den anderen Regionen laufen weiter. Du kannst jederzeit zurück.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={finish}>
            Weiterspielen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            autoFocus
            onClick={() => {
              finish();
              switchMap(pending.region);
            }}
          >
            Neuen Bezirk entdecken
          </button>
        </div>
      </div>
    </Dialog>
  );
}
