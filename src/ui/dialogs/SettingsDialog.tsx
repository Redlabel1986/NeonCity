import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { DEFAULT_KEYBINDINGS, useGameStore, type KeyBindings } from '../store/gameStore';
import { audio } from '../audio';

const BINDING_LABELS: Record<keyof KeyBindings, string> = {
  pause: 'Pause',
  speed1: 'Geschwindigkeit 1×',
  speed2: 'Geschwindigkeit 3×',
  speed3: 'Geschwindigkeit 8×',
  build: 'Bauen',
  business: 'Unternehmen',
  finance: 'Finanzen',
  city: 'Stadt',
  stats: 'Statistik',
  staff: 'Personal',
  realestate: 'Immobilien',
  underworld: 'Unterwelt',
  factions: 'Fraktionen',
  politics: 'Politik',
  research: 'Forschung',
  help: 'Hilfe',
};

const RESERVED = new Set(['w', 'a', 's', 'd', 'escape', 'f5', 'f9', '+', '-', '=', '_', 'home', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

function keyLabel(key: string): string {
  if (key === ' ') return 'Leertaste';
  return key.length === 1 ? key.toUpperCase() : key;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);
  const notify = useGameStore((s) => s.notify);
  const [listening, setListening] = useState<keyof KeyBindings | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        setListening(null);
        return;
      }
      if (RESERVED.has(key)) {
        notify('warning', `${keyLabel(e.key)} ist für Kamera oder System reserviert.`);
        return;
      }
      const taken = (Object.entries(settings.keybindings) as [keyof KeyBindings, string][]).find(([id, k]) => k === key && id !== listening);
      if (taken) {
        notify('warning', `${keyLabel(e.key)} ist bereits mit „${BINDING_LABELS[taken[0]]}“ belegt.`);
        return;
      }
      update({ keybindings: { ...settings.keybindings, [listening]: key } });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, settings.keybindings, update, notify]);

  return (
    <Dialog title="Einstellungen" onClose={onClose} width="max-w-2xl">
      <div className="grid gap-6 text-sm md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="panel-title">Darstellung</h3>
          <Toggle label="Neon-, Licht- und Wettereffekte" hint="Nachtbeleuchtung, Leuchtreklamen, Regen, Nebel, Gewitter. Abschalten spart Leistung." checked={settings.effects} onChange={(v) => update({ effects: v })} />
          <Toggle label="Passanten und Fahrzeuge" hint="Straßenleben auf der Karte." checked={settings.traffic} onChange={(v) => update({ traffic: v })} />
          <Toggle label="Reduzierte Bewegung" hint="Keine Pulsanimationen, kein Flackern, kein Regen und keine Blitze." checked={settings.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
          <Toggle label="Hoher Kontrast" hint="Kräftigere Rahmen, hellerer Text, keine Transparenz." checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} />
          <Toggle label="Innenansicht beim Verwalten" hint="Beim Öffnen eines Dashboards ins Gebäude hineinfliegen und den Innenraum mit Personal, Gästen und Lager zeigen." checked={settings.interiorView} onChange={(v) => update({ interiorView: v })} />
          <Toggle label="Übersichtskarte anzeigen" hint="Kleine Karte unten rechts mit Heatmaps." checked={settings.showMinimap} onChange={(v) => update({ showMinimap: v })} />
          <Toggle label="Automatisch speichern" hint="Jeden Spieltag, beim Verlassen und beim Wechsel ins Hauptmenü." checked={settings.autosave} onChange={(v) => update({ autosave: v })} />
          <label className="block">
            <span className="flex justify-between">
              <span>Oberflächengröße</span>
              <span className="num text-muted">{Math.round(settings.uiScale * 100)} %</span>
            </span>
            <input type="range" min={0.85} max={1.4} step={0.05} value={settings.uiScale} onChange={(e) => update({ uiScale: Number(e.target.value) })} className="mt-1 w-full accent-[#19e6ff]" aria-label="Oberflächengröße" />
          </label>
          <h3 className="panel-title">Audio</h3>
          <Toggle label="Audio" hint="Prozedurale Stadtgeräusche, Wetter, Musik und Bedienklänge. Startet nach der ersten Eingabe." checked={settings.audioEnabled} onChange={(v) => update({ audioEnabled: v })} />
          {(
            [
              ['volumeMaster', 'Gesamt'],
              ['volumeAmbient', 'Umgebung und Wetter'],
              ['volumeMusic', 'Musik'],
              ['volumeUi', 'Bedienklänge'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="flex justify-between">
                <span>{label}</span>
                <span className="num text-muted">{Math.round(settings[key] * 100)} %</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={settings[key]} onChange={(e) => update({ [key]: Number(e.target.value) })} className="mt-1 w-full accent-[#ff2bd6]" aria-label={label} />
            </label>
          ))}
          <button type="button" className="btn" onClick={() => audio.click('success')}>
            Testton
          </button>
        </div>
        <div>
          <h3 className="panel-title">Tastenbelegung</h3>
          <p className="mt-1 text-xs text-muted">Klicke eine Taste an und drücke die neue Taste. W, A, S, D, Pfeile, Esc, F5, F9 und +/− sind reserviert.</p>
          <ul className="mt-2 space-y-1 text-xs">
            {(Object.keys(BINDING_LABELS) as (keyof KeyBindings)[]).map((id) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span>{BINDING_LABELS[id]}</span>
                <button type="button" className={`btn min-w-24 px-2 py-0.5 font-mono ${listening === id ? 'border-magenta text-white' : ''}`} onClick={() => setListening(listening === id ? null : id)} aria-label={`Taste für ${BINDING_LABELS[id]} ändern`}>
                  {listening === id ? 'Taste drücken…' : keyLabel(settings.keybindings[id])}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn mt-3" onClick={() => update({ keybindings: { ...DEFAULT_KEYBINDINGS } })}>
            Standard wiederherstellen
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#19e6ff]" />
      <span>
        <span className="block text-white">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
