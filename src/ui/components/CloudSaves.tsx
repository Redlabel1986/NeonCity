import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { cloudLogin, cloudLogout, cloudMeta, cloudRegister, cloudSession, type CloudSession } from '../../net/cloud';
import type { CloudMeta } from '../../net/cloudProtocol';
import { credits, relativeTime } from '../format';
import { tickToDate } from '../../sim/core/clock';

/**
 * Account box for cloud saves: log in once per device, then the save
 * travels between phone and PC. Used in the main menu and the saves dialog.
 */
export function CloudSaves({ mode, onLoaded }: { mode: 'menu' | 'game'; onLoaded?: () => void }) {
  const cloud = useGameStore((s) => s.cloud);
  const setCloud = useGameStore((s) => s.setCloud);
  const cloudUploadNow = useGameStore((s) => s.cloudUploadNow);
  const cloudLoad = useGameStore((s) => s.cloudLoad);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [meta, setMeta] = useState<CloudMeta | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cloudSavedAt = useGameStore((s) => s.cloudSavedAt);

  useEffect(() => {
    if (!cloud) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    setMeta('loading');
    cloudMeta(cloud)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setMeta(null);
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, cloudSavedAt]);

  const submit = async (fn: (n: string, p: string) => Promise<CloudSession>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const session = await fn(name, password);
      setCloud(session);
      setPassword('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-sm border border-cyan/40 bg-cyan/5 p-3 text-sm" aria-label="Cloud-Spielstand">
      <h3 className="font-medium text-white">Cloud-Spielstand (Handy ↔ PC)</h3>
      {!cloud ? (
        <>
          <p className="mt-1 text-xs text-muted">Mit einem Konto wandert dein Spielstand zwischen den Geräten: Auf dem Handy spielen, am PC weitermachen und zurück.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kontoname" maxLength={24} aria-label="Cloud-Kontoname" autoComplete="username" />
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" aria-label="Cloud-Passwort" autoComplete="current-password" />
          </div>
          {error && (
            <p className="mt-2 text-xs text-blood" role="alert">
              {error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={busy} onClick={() => void submit(cloudLogin)}>
              Anmelden
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void submit(cloudRegister)}>
              Konto anlegen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Angemeldet als <span className="text-white">{cloud.name}</span>.
          </p>
          <p className="num mt-1 text-xs" data-testid="cloud-meta">
            {meta === 'loading'
              ? 'Prüfe Cloud …'
              : meta
                ? `Cloud: ${meta.playerName}, Tag ${tickToDate(meta.tick).day + 1}, ${credits(meta.balance)} · ${meta.device} · ${relativeTime(meta.savedAt)}`
                : 'Noch kein Spielstand in der Cloud.'}
          </p>
          {error && (
            <p className="mt-1 text-xs text-blood" role="alert">
              {error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {mode === 'game' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await cloudUploadNow();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Jetzt in die Cloud speichern
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !meta || meta === 'loading'}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await cloudLoad();
                  onLoaded?.();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === 'game' ? 'Cloud-Spielstand laden' : 'Weiter aus der Cloud'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                cloudLogout();
                setCloud(null);
              }}
            >
              Abmelden
            </button>
          </div>
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#19e6ff]" checked={settings.cloudSync} onChange={(e) => updateSettings({ cloudSync: e.target.checked })} />
            <span>
              <span className="text-text">Automatisch synchronisieren</span>
              <span className="block text-muted">Lädt den Spielstand bei jedem Tagesabschluss, beim Verlassen und beim Wechsel ins Hauptmenü in die Cloud hoch.</span>
            </span>
          </label>
        </>
      )}
      {!cloud && cloudSession() === null && <p className="sr-only">Nicht angemeldet.</p>}
    </section>
  );
}
