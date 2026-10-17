import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { useGameStore } from '../store/gameStore';
import { deleteSave, listSaves, type SaveSummary } from '../../persistence/saveService';
import { credits, relativeTime } from '../format';
import { tickToDate } from '../../sim/core/clock';
import { CloudSaves } from '../components/CloudSaves';

export function SavesDialog({ onClose, mode }: { onClose: () => void; mode: 'menu' | 'game' }) {
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const saveName = useGameStore((s) => s.saveName);
  const saveManual = useGameStore((s) => s.saveManual);
  const loadSlot = useGameStore((s) => s.loadSlot);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);

  const refresh = async (): Promise<void> => {
    try {
      setSaves(await listSaves());
    } catch (err) {
      useGameStore.getState().notify('danger', `Spielstände konnten nicht gelesen werden: ${(err as Error).message}`);
      setSaves([]);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <Dialog title="Spielstände" onClose={onClose}>
      <div className="mb-4">
        <CloudSaves mode={mode} onLoaded={onClose} />
      </div>
      {mode === 'game' && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveManual(name);
            setName('');
            await refresh();
          }}
        >
          <input className="input" placeholder={`Name (Standard: ${saveName})`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name des Spielstands" />
          <button type="submit" className="btn btn-primary">
            Speichern
          </button>
          <button type="button" className="btn" onClick={exportSave} title="Als JSON-Datei herunterladen">
            Exportieren
          </button>
        </form>
      )}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">Gespeichert im Browser (IndexedDB). Exporte lassen sich auf jedem Gerät importieren.</p>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await importSave();
            onClose();
          }}
        >
          Importieren
        </button>
      </div>
      {saves === null ? (
        <p className="text-sm text-muted">Lade…</p>
      ) : saves.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Spielstände vorhanden.</p>
      ) : (
        <ul className="space-y-2">
          {saves.map((s) => {
            const date = tickToDate(s.tick);
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-sm border border-line p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{s.name}</p>
                  <p className="num text-xs text-muted">
                    {s.playerName} · Tag {date.day + 1} · {credits(s.balance)} · {relativeTime(s.updatedAt)}
                    {s.slot === 'autosave' && <span className="ml-2 text-cyan">Autosave</span>}
                    {s.slot === 'quick' && <span className="ml-2 text-cyan">Schnellspeicherung</span>}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await loadSlot(s.id);
                    onClose();
                  }}
                >
                  Laden
                </button>
                {confirmDelete === s.id ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      await deleteSave(s.id);
                      setConfirmDelete(null);
                      await refresh();
                    }}
                  >
                    Wirklich löschen
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => setConfirmDelete(s.id)} aria-label={`${s.name} löschen`}>
                    Löschen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
