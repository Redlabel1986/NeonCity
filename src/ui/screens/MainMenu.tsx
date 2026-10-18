import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES, BACKGROUNDS, type DifficultyId, type BackgroundId } from '../../sim/data/difficulty';
import { SavesDialog } from '../dialogs/SavesDialog';
import { credits } from '../format';
import { OnlineSection } from './OnlineSection';
import { CloudSaves } from '../components/CloudSaves';

const SEED_WORDS = ['nova', 'eclipse', 'chrome', 'ghost', 'rust', 'neon', 'skyline', 'undercity', 'amber', 'cyan', 'dynasty', 'night'];

function randomSeed(): string {
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
  return `${a}-${b}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function MainMenu() {
  const newGame = useGameStore((s) => s.newGame);
  const importSave = useGameStore((s) => s.importSave);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [difficulty, setDifficulty] = useState<DifficultyId>('standard');
  const [background, setBackground] = useState<BackgroundId>('restaurateur');
  const [showSaves, setShowSaves] = useState(false);
  const [progression, setProgression] = useState(true);

  const preset = DIFFICULTIES[difficulty];
  const bg = BACKGROUNDS[background];
  const startCredits = Math.max(2000, preset.startingCredits + bg.creditsBonus);

  return (
    <div className="relative h-full w-full overflow-auto bg-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 500px at 70% -10%, rgba(255,43,214,0.16), transparent 60%), radial-gradient(900px 500px at 10% 110%, rgba(25,230,255,0.14), transparent 60%), linear-gradient(180deg, #07060b 0%, #0d0b14 60%, #120c1c 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(180deg, transparent, black 40%, black 70%, transparent)',
        }}
      />
      <main className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start lg:gap-12">
        <section className="flex-1 lg:sticky lg:top-10">
          <p className="mb-3 text-sm text-muted">Nova Eclipse, 2187</p>
          <h1 className="title-glow text-5xl font-semibold tracking-tight text-white md:text-6xl">
            Neon
            <br />
            Dynasty
          </h1>
          <p className="mt-4 max-w-md text-lg text-text/90">Build an Empire. Own the Night.</p>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted">
            Du beginnst mit wenig Geld und einem gemieteten Zimmer. Kaufe Grundstücke, baue Betriebe, setze Preise und überlebe den
            ersten Monat. Jeder Credit kommt aus einer echten Transaktion: Gäste zahlen, Lieferanten kassieren, die Miete ist fällig.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setShowSaves(true)}>
              Spielstand laden
            </button>
            <button type="button" className="btn" onClick={() => void importSave()}>
              Aus Datei importieren
            </button>
          </div>
          <div className="mt-6">
            <CloudSaves mode="menu" />
          </div>
          <div className="hidden lg:block">
            <OnlineSection background={background} />
          </div>
          <p className="mt-10 hidden text-xs text-muted lg:block">Version 0.19.0 – Vier Karten, Schulungen, Entwicklungsbaum.</p>
        </section>

        <form
          className="panel flex-1 p-6 lg:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            newGame({ seed, playerName: name || 'Namenlos', difficulty, background, progression });
          }}
        >
          <h2 className="text-lg font-medium text-white">Neues Spiel</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Dein Name</span>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kai Moreno" maxLength={32} autoFocus />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Stadt-Seed</span>
              <div className="mt-1 flex gap-2">
                <input className="input font-mono" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={40} aria-describedby="seed-help" />
                <button type="button" className="btn" onClick={() => setSeed(randomSeed())} aria-label="Zufälligen Seed erzeugen">
                  ↻
                </button>
              </div>
              <span id="seed-help" className="mt-1 block text-xs text-muted">
                Gleicher Seed, gleiche Stadt.
              </span>
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm text-muted">Hintergrund</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.values(BACKGROUNDS).map((b) => (
                <button
                  type="button"
                  key={b.id}
                  aria-pressed={background === b.id}
                  onClick={() => setBackground(b.id)}
                  className={`rounded-sm border p-3 text-left transition-colors ${background === b.id ? 'border-cyan bg-cyan/10' : 'border-line hover:border-line-strong'}`}
                >
                  <span className="block font-medium text-white">{b.name}</span>
                  <span className="mt-1 block text-xs leading-snug text-muted">{b.description}</span>
                  <span className="num mt-2 block text-xs text-text/80">
                    Kapital {b.creditsBonus >= 0 ? '+' : '−'}
                    {credits(Math.abs(b.creditsBonus))}, Miete {credits(b.apartmentRent)}/Tag
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm text-muted">Schwierigkeit</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.values(DIFFICULTIES).map((d) => (
                <button
                  type="button"
                  key={d.id}
                  aria-pressed={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`btn ${difficulty === d.id ? 'border-magenta bg-magenta/15 text-white' : ''}`}
                >
                  {d.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{preset.description}</p>
          </fieldset>

          <label className="mt-5 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#19e6ff]" checked={progression} onChange={(e) => setProgression(e.target.checked)} aria-label="Aufstieg durch Regionen" />
            <span>
              <span className="text-white">Aufstieg: von Greenhaven bis Nova Eclipse</span>
              <span className="block text-xs text-muted">Du startest im grünen Umland. Mit Erfahrungspunkten steigst du auf und öffnest die Vorstadt, die Stadt und die Megacity. Aus: alle Regionen sofort offen.</span>
            </span>
          </label>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-4">
            <div className="text-sm">
              <span className="text-muted">Startkapital</span>
              <span className="num ml-2 font-medium text-white">{credits(startCredits)}</span>
            </div>
            <button type="submit" className="btn btn-primary px-5 py-2.5">
              Stadt betreten
            </button>
          </div>
        </form>
        <div className="lg:hidden">
          <OnlineSection background={background} />
          <p className="mt-6 text-xs text-muted">Version 0.19.0 – Vier Karten, Schulungen, Entwicklungsbaum.</p>
        </div>
      </main>
      {showSaves && <SavesDialog onClose={() => setShowSaves(false)} mode="menu" />}
    </div>
  );
}
