import { useGameStore, useSimState } from '../store/gameStore';
import { credits, signedCredits } from '../format';
import { formatClock, formatDate, tickToDate } from '../../sim/core/clock';
import { SPEEDS, type Speed } from '../../sim/engine';
import { CRISES } from '../../sim/data/crises';
import { WEATHER_LABELS } from '../../sim/systems/weather';

const WANTED_LABELS = ['Unauffällig', 'Verdächtig', 'Unter Beobachtung', 'Ermittlungen', 'Razzien', 'Organisierte Fahndung', 'Stadtweite Operation'];

const SPEED_LABELS: Record<Speed, string> = { 0: '⏸', 1: '1×', 3: '3×', 8: '8×' };

export function TopBar() {
  const state = useSimState();
  const setSpeed = useGameStore((s) => s.setSpeed);
  const setDialog = useGameStore((s) => s.setDialog);
  const quitToMenu = useGameStore((s) => s.quitToMenu);
  const saveName = useGameStore((s) => s.saveName);
  const requestDockTab = useGameStore((s) => s.requestDockTab);
  const online = useGameStore((s) => s.online);
  if (!state) return null;
  const date = tickToDate(state.tick);
  const net = state.ledger.todayIncome - state.ledger.todayExpenses;
  const balanceClass = state.ledger.balance < 0 ? 'text-blood' : 'text-white';
  const netClass = net > 0 ? 'text-acid' : net < 0 ? 'text-blood' : 'text-muted';

  return (
    <header className="panel pointer-events-auto flex h-12 shrink-0 items-center gap-5 border-x-0 border-t-0 px-4 text-sm" role="banner">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tracking-wide text-white">NEON DYNASTY</span>
        <span className="hidden text-xs text-muted lg:inline" title={saveName}>
          {state.player.name}
        </span>
      </div>
      <Stat label="Credits" value={credits(state.ledger.balance)} valueClass={balanceClass} title="Kontostand" />
      <Stat label="Heute" value={signedCredits(net)} valueClass={netClass} title="Gewinn oder Verlust seit Tagesbeginn" />
      <div className="num flex items-center gap-2" title="Spielzeit">
        <span className="text-white">{formatClock(date)}</span>
        <span className="text-muted">{formatDate(date)}</span>
        <span className="hidden text-muted xl:inline">Tag {date.day + 1}</span>
      </div>
      {online ? (
        <span
          className={`rounded-sm border px-2 py-0.5 text-xs ${online.connected ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-blood/60 bg-blood/15 text-blood'}`}
          title={online.players.map((p) => `${p.name}${p.online ? ' (online)' : ''}`).join(', ') || 'Online-Welt'}
          data-testid="online-badge"
        >
          {online.connected ? `Online · ${state.speed}× · ${online.players.filter((p) => p.online).length} verbunden` : 'Online · getrennt'}
        </span>
      ) : (
      <div className="flex items-center gap-1" role="group" aria-label="Spielgeschwindigkeit">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            className={`btn px-2 py-1 ${state.speed === sp ? 'border-cyan bg-cyan/15 text-white' : ''}`}
            aria-pressed={state.speed === sp}
            aria-label={sp === 0 ? 'Pause' : `Geschwindigkeit ${sp}-fach`}
            onClick={() => setSpeed(sp)}
          >
            {SPEED_LABELS[sp]}
          </button>
        ))}
      </div>
      )}
      <Stat label="Ruf" value={`${Math.round(state.player.reputation)}`} title="Unternehmensreputation (0–100)" />
      <Stat label="Fahndung" value={WANTED_LABELS[state.player.wantedLevel] ?? '–'} valueClass={state.player.wantedLevel >= 4 ? 'text-blood' : state.player.wantedLevel >= 2 ? 'text-amber' : 'text-white'} title={`Polizeiaufmerksamkeit ${Math.round(state.underworld.heat)} / 100`} />
      <Stat label="Wetter" value={WEATHER_LABELS[state.weather.kind]} title={`Intensität ${Math.round(state.weather.intensity * 100)} %. Regen: weniger Laufkundschaft, mehr Taxis.`} />
      {state.crisis.active && (
        <span className="rounded-sm border border-blood/60 bg-blood/15 px-2 py-0.5 text-xs text-blood" title="Aktive Wirtschaftskrise, Details im Finanzen-Panel">
          Krise: {CRISES[state.crisis.active.id]?.name}
        </span>
      )}
      {state.decisions.pending.length > 0 && (
        <button type="button" className="btn btn-primary px-2 py-1 text-xs" onClick={() => requestDockTab('decisions')} title="Offene Entscheidungen im Dock unten">
          {state.decisions.pending.length} Entscheidung{state.decisions.pending.length > 1 ? 'en' : ''}
        </button>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button type="button" className="btn btn-ghost" onClick={() => setDialog('saves')} title="Speichern und laden (F5 Schnellspeichern)">
          Spielstände
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setDialog('settings')}>
          Einstellungen
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setDialog('help')} title="Steuerung und Hilfe (H)">
          Hilfe
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void quitToMenu()} title="Speichert automatisch und kehrt zum Hauptmenü zurück">
          Hauptmenü
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value, valueClass = 'text-white', title }: { label: string; value: string; valueClass?: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <span className="text-xs text-muted">{label}</span>
      <span className={`num font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
