import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { onlineRequest } from '../../net/client';
import type { AuthResponse, StatusResponse } from '../../net/protocol';
import { BACKGROUNDS, type BackgroundId } from '../../sim/data/difficulty';

const STORAGE_KEY = 'neon-dynasty.online';

interface Remembered {
  url: string;
  token: string;
  name: string;
  playerId: string;
}

function remembered(): Remembered | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

function remember(value: Remembered | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Account form and server status for the shared online world. */
export function OnlineSection({ background }: { background: BackgroundId }) {
  const connectOnline = useGameStore((s) => s.connectOnline);
  const [url, setUrl] = useState(() => remembered()?.url ?? (typeof window !== 'undefined' ? window.location.origin : ''));
  const [name, setName] = useState(() => remembered()?.name ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = remembered();

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setStatusError(null);
    const timer = setTimeout(() => {
      onlineRequest<StatusResponse>(url, '/api/status')
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch((err: Error) => {
          if (!cancelled) setStatusError(err.message);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  const start = async (auth: AuthResponse): Promise<void> => {
    remember({ url, token: auth.token, name: auth.name, playerId: auth.playerId });
    await connectOnline({ url, token: auth.token, playerId: auth.playerId, name: auth.name });
  };

  const submit = async (mode: 'register' | 'login'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const auth =
        mode === 'register'
          ? await onlineRequest<AuthResponse>(url, '/api/register', { name, password, background })
          : await onlineRequest<AuthResponse>(url, '/api/login', { name, password });
      await start(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resume = async (): Promise<void> => {
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      await connectOnline({ url: saved.url, token: saved.token, playerId: saved.playerId, name: saved.name });
    } catch (err) {
      remember(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel mt-8 p-4 text-sm" aria-label="Online spielen">
      <h2 className="font-medium text-white">Online spielen</h2>
      <p className="mt-1 text-xs text-muted">Alle Spieler teilen sich dieselbe Stadt zur selben Zeit. Der Server speichert die Welt automatisch; die Zeit läuft für alle gleich.</p>
      <label className="mt-3 block">
        <span className="text-muted">Server</span>
        <input className="input mt-1 font-mono" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Server-Adresse" />
      </label>
      <p className="num mt-1 text-xs text-muted" aria-live="polite">
        {status ? `${status.cityName}: Tag ${Math.floor((status.tick + 7 * 60) / 1440) + 1}, ${status.players} Spieler, ${status.online} online, ${status.speed}×` : statusError ? `Kein Server erreichbar (${statusError})` : 'Prüfe Server …'}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-muted">Spielername</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Online-Name" autoComplete="username" />
        </label>
        <label className="block">
          <span className="text-muted">Passwort</span>
          <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Passwort" autoComplete="current-password" />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Beim Registrieren gilt der oben gewählte Hintergrund: {BACKGROUNDS[background].name}.</p>
      {error && (
        <p className="mt-2 text-xs text-blood" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy || !status} onClick={() => void submit('register')}>
          Registrieren und beitreten
        </button>
        <button type="button" className="btn" disabled={busy || !status} onClick={() => void submit('login')}>
          Anmelden
        </button>
        {saved && (
          <button type="button" className="btn" disabled={busy} onClick={() => void resume()}>
            Weiter als {saved.name}
          </button>
        )}
      </div>
    </section>
  );
}
