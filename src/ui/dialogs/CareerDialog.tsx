import { useState } from 'react';
import { Dialog } from './Dialog';
import { useGameStore, useSimState } from '../store/gameStore';
import { BACKGROUNDS, type BackgroundId } from '../../sim/data/difficulty';
import { credits } from '../format';

/** After selling the group: choose a new background and continue in the same city. */
export function CareerDialog({ onClose }: { onClose: () => void }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [background, setBackground] = useState<BackgroundId>('restaurateur');
  const [name, setName] = useState(state?.player.name ?? '');
  if (!state) return null;
  return (
    <Dialog title="Neue Karriere" onClose={onClose} width="max-w-2xl">
      <p className="text-sm text-text/90">
        Du hast {credits(state.ledger.balance)} auf dem Konto und kennst die Stadt. Wähle einen neuen Hintergrund: Wohnung, Vorteile und Startbeziehungen ändern sich, das
        Kapital bleibt (plus die Hälfte des Hintergrund-Bonus).
      </p>
      <label className="mt-3 block text-sm">
        <span className="text-muted">Name</span>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Name" />
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.values(BACKGROUNDS).map((b) => (
          <button key={b.id} type="button" aria-pressed={background === b.id} onClick={() => setBackground(b.id)} className={`rounded-sm border p-3 text-left ${background === b.id ? 'border-cyan bg-cyan/10' : 'border-line hover:border-line-strong'}`}>
            <span className="block font-medium text-white">{b.name}</span>
            <span className="mt-1 block text-xs leading-snug text-muted">{b.description}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Später
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (dispatch({ type: 'newCareer', background, name })) onClose();
          }}
        >
          Karriere starten
        </button>
      </div>
    </Dialog>
  );
}
