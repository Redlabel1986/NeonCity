import { useGameStore } from '../store/gameStore';
import { RAIL_ENTRIES } from '../navigation';

export function LeftRail() {
  const panel = useGameStore((s) => s.panel);
  const setPanel = useGameStore((s) => s.setPanel);
  return (
    <nav className="panel pointer-events-auto flex w-40 shrink-0 flex-col gap-0.5 border-y-0 border-l-0 p-2" aria-label="Hauptnavigation">
      {RAIL_ENTRIES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="rail-item"
          aria-pressed={panel === entry.id}
          onClick={() => setPanel(entry.id)}
          title={entry.phase > 1 ? `${entry.label}: verfügbar ab Entwicklungsphase ${entry.phase}` : entry.label}
        >
          <span className={entry.phase > 1 ? 'opacity-60' : ''}>{entry.label}</span>
          {entry.key && <kbd className="rail-key">{entry.key}</kbd>}
          {entry.phase > 1 && <span className="ml-auto text-[0.65rem] text-muted">P{entry.phase}</span>}
        </button>
      ))}
    </nav>
  );
}
