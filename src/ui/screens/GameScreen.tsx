import { useGameStore, useSimState } from '../store/gameStore';
import { CityCanvas } from '../components/CityCanvas';
import { TopBar } from '../components/TopBar';
import { LeftRail } from '../components/LeftRail';
import { PanelHost } from '../panels/PanelHost';
import { Inspector } from '../components/Inspector';
import { BottomDock } from '../components/BottomDock';
import { Minimap } from '../components/Minimap';
import { SavesDialog } from '../dialogs/SavesDialog';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { HelpDialog } from '../dialogs/HelpDialog';
import { CareerDialog } from '../dialogs/CareerDialog';
import { useHotkeys } from '../hooks/useHotkeys';
import { useState } from 'react';
import { WEATHER_LABELS } from '../../sim/systems/weather';

export function GameScreen() {
  const dialog = useGameStore((s) => s.dialog);
  const setDialog = useGameStore((s) => s.setDialog);
  const showMinimap = useGameStore((s) => s.settings.showMinimap);
  const busy = useGameStore((s) => s.busy);
  const quitToMenu = useGameStore((s) => s.quitToMenu);
  const simState = useSimState();
  const bankrupt = simState?.corporate.bankrupt ?? false;
  const [intro, setIntro] = useState<boolean>(() => {
    try {
      return localStorage.getItem('neon-dynasty.seenIntro') !== '1';
    } catch {
      return true;
    }
  });
  const setPanel = useGameStore((s) => s.setPanel);
  const dismissIntro = (): void => {
    setIntro(false);
    try {
      localStorage.setItem('neon-dynasty.seenIntro', '1');
    } catch {
      /* storage unavailable */
    }
  };
  useHotkeys();

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <CityCanvas />
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <LeftRail />
          <PanelHost />
          <div className="flex-1" />
          <div className="flex w-80 shrink-0 flex-col items-end justify-end">
            <Inspector />
            {showMinimap && <Minimap />}
          </div>
        </div>
        <BottomDock />
      </div>
      {dialog === 'saves' && <SavesDialog onClose={() => setDialog(null)} mode="game" />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'career' && <CareerDialog onClose={() => setDialog(null)} />}
      {intro && !bankrupt && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-30 w-[30rem] max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <section className="panel p-4 text-sm" aria-label="Einstieg">
            <h2 className="font-medium text-white">Willkommen in Nova Eclipse</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-text/90">
              <li>
                <button type="button" className="underline" onClick={() => setPanel('build')}>
                  Baumenü (B)
                </button>{' '}
                öffnen und eine Ramenbar oder einen Streetfood-Stand an eine Straße setzen.
              </li>
              <li>Zeit laufen lassen (1, 2, 3) und die Baustelle fertig werden sehen.</li>
              <li>Nach der Eröffnung im Dashboard Speisekarte, Einkauf und Personal steuern. Die Aufgaben im Dock unten führen weiter.</li>
            </ol>
            <p className="mt-2 text-xs text-muted">
              Wetter gerade: {simState ? WEATHER_LABELS[simState.weather.kind] : '–'}. Regen bringt weniger Laufkundschaft und mehr Taxifahrten.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => useGameStore.getState().setDialog('help')}>
                Hilfe (H)
              </button>
              <button type="button" className="btn btn-primary" onClick={dismissIntro}>
                Los geht’s
              </button>
            </div>
          </section>
        </div>
      )}
      {bankrupt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/80" role="alertdialog" aria-label="Insolvenz">
          <div className="panel max-w-md p-6 text-center">
            <h2 className="text-xl font-semibold text-blood">Insolvenz</h2>
            <p className="mt-2 text-sm text-text/90">Alle Vermögenswerte sind zwangsverkauft, die Schulden bleiben. Diese Karriere ist beendet. Du kannst einen alten Spielstand laden oder neu beginnen.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" className="btn" onClick={() => setDialog('saves')}>
                Spielstand laden
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void quitToMenu()}>
                Hauptmenü
              </button>
            </div>
          </div>
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/60" role="alert">
          <div className="panel px-6 py-4 text-sm">{busy}</div>
        </div>
      )}
    </div>
  );
}
