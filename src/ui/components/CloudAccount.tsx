import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { cloudAccount, cloudChangePassword, cloudDeleteAccount, cloudDeleteSave, type CloudSession } from '../../net/cloud';
import type { CloudAccountResponse } from '../../net/cloudProtocol';
import { relativeTime } from '../format';

/**
 * Account management for the cloud account: password change, deleting the
 * cloud save and deleting the account. Lives inside the cloud box.
 */
export function CloudAccount({ cloud, onClose }: { cloud: CloudSession; onClose: () => void }) {
  const setCloud = useGameStore((s) => s.setCloud);
  const notify = useGameStore((s) => s.notify);
  const cloudSavedAt = useGameStore((s) => s.cloudSavedAt);
  const [info, setInfo] = useState<CloudAccountResponse | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cloudAccount(cloud)
      .then((r) => {
        if (!cancelled) setInfo(r);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, cloudSavedAt]);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = (): Promise<void> =>
    run(async () => {
      if (next !== repeat) throw new Error('Die Wiederholung stimmt nicht mit dem neuen Passwort überein.');
      const session = await cloudChangePassword(cloud, current, next);
      setCloud(session);
      setCurrent('');
      setNext('');
      setRepeat('');
      notify('success', 'Passwort geändert. Andere Geräte müssen sich neu anmelden.');
    });

  const deleteSave = (): Promise<void> =>
    run(async () => {
      await cloudDeleteSave(cloud);
      setConfirmSave(false);
      useGameStore.setState({ cloudSavedAt: Date.now() });
      notify('info', 'Cloud-Spielstand gelöscht. Lokale Spielstände bleiben erhalten.');
    });

  const deleteAccount = (): Promise<void> =>
    run(async () => {
      await cloudDeleteAccount(cloud, deletePassword);
      setCloud(null);
      notify('info', `Konto „${cloud.name}“ und Cloud-Spielstand gelöscht.`);
      onClose();
    });

  return (
    <div className="mt-3 space-y-3 border-t border-cyan/30 pt-3" data-testid="cloud-account">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted">
          <p>
            Konto <span className="text-white">{cloud.name}</span>
            {info && <> · angelegt {relativeTime(info.account.createdAt)}</>}
            {info?.account.passwordChangedAt && <> · Passwort geändert {relativeTime(info.account.passwordChangedAt)}</>}
          </p>
          <p>Anmeldung auf diesem Gerät gültig bis {new Date(cloud.expiresAt).toLocaleDateString('de-DE')}.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Fertig
        </button>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void changePassword();
        }}
      >
        <p className="panel-title">Passwort ändern</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Aktuelles Passwort" aria-label="Aktuelles Passwort" autoComplete="current-password" required />
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Neues Passwort" aria-label="Neues Passwort" autoComplete="new-password" minLength={6} required />
          <input className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Neues Passwort wiederholen" aria-label="Neues Passwort wiederholen" autoComplete="new-password" minLength={6} required />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          Passwort ändern
        </button>
      </form>

      <div className="space-y-2">
        <p className="panel-title">Gefahrenzone</p>
        <div className="flex flex-wrap items-center gap-2">
          {!confirmSave ? (
            <button type="button" className="btn" disabled={busy || !info?.meta} onClick={() => setConfirmSave(true)}>
              Cloud-Spielstand löschen
            </button>
          ) : (
            <>
              <span className="text-xs text-amber">Den Spielstand in der Cloud wirklich löschen?</span>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void deleteSave()}>
                Ja, löschen
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmSave(false)}>
                Abbrechen
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!confirmAccount ? (
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmAccount(true)}>
              Konto löschen
            </button>
          ) : (
            <>
              <input className="input" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Passwort zur Bestätigung" aria-label="Passwort zur Bestätigung" autoComplete="current-password" />
              <button type="button" className="btn btn-danger" disabled={busy || !deletePassword} onClick={() => void deleteAccount()}>
                Konto endgültig löschen
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmAccount(false)}>
                Abbrechen
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-muted">Das Löschen des Kontos entfernt auch den Cloud-Spielstand. Spielstände in diesem Browser bleiben erhalten.</p>
      </div>
      {error && (
        <p className="text-xs text-blood" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
