import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { FACTIONS, type FactionId } from '../../sim/data/factions';
import { credits } from '../format';
import { Meter } from '../components/Inspector';
import { tickToDate } from '../../sim/core/clock';

const KIND_LABELS: Record<string, string> = {
  corporation: 'Megakonzern',
  union: 'Gewerkschaft',
  civic: 'Bürgerinitiative',
  police: 'Polizei',
  hackers: 'Hackergruppe',
  media: 'Medien',
  party: 'Partei',
  administration: 'Stadtverwaltung',
  activists: 'Aktivisten',
  religion: 'Religiöse Bewegung',
};

export function FactionsPanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [amount, setAmount] = useState(1000);
  const [open, setOpen] = useState<FactionId | null>(null);
  if (!state) return null;
  const day = tickToDate(state.tick).day;
  return (
    <div className="text-sm">
      <p className="text-xs text-muted">
        Fraktionen handeln selbstständig: Sie reagieren auf deine Löhne, Mieten, Sicherheit und Verwicklungen, stellen Forderungen und machen Angebote. Beziehungen verblassen
        langsam Richtung neutral.
      </p>
      <div className="my-2 flex items-center gap-2 text-xs">
        <input type="number" min={500} step={500} className="input w-28" value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Unterstützungsbetrag" />
        <span className="text-muted">Unterstützung (Spende, Sponsoring); Gegner nehmen es übel.</span>
      </div>
      <ul className="space-y-1">
        {state.factions.map((f) => {
          const def = FACTIONS[f.id];
          const expanded = open === f.id;
          return (
            <li key={f.id} className="rounded-sm border border-line p-2">
              <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : f.id)}>
                <span>
                  <span className="font-medium text-white">{def.name}</span> <span className="text-xs text-muted">{KIND_LABELS[def.kind]}</span>
                  {f.activeEffect && f.activeUntilDay > day && <span className="ml-2 text-xs text-blood">{f.activeEffect === 'strike' ? 'Streik' : 'Blockade'} bis Tag {f.activeUntilDay + 1}</span>}
                </span>
                <span className={`num text-xs ${f.relation < -20 ? 'text-blood' : f.relation > 20 ? 'text-acid' : 'text-muted'}`}>
                  {f.relation > 0 ? '+' : ''}
                  {Math.round(f.relation)}
                </span>
              </button>
              <div className="mt-1 grid grid-cols-2 gap-3 text-xs">
                <Meter label="Beziehung" value={f.relation + 100} color={f.relation < -20 ? 'var(--color-blood)' : f.relation > 20 ? 'var(--color-acid)' : 'var(--color-cyan)'} />
                <Meter label="Einfluss" value={f.influence} color="var(--color-magenta)" />
              </div>
              {expanded && (
                <div className="mt-2 text-xs">
                  <p className="text-text/90">{def.description}</p>
                  <p className="mt-1 text-muted">Ziele: {def.goals.join(' · ')}</p>
                  <p className="text-muted">
                    Verbündet: {def.allies.map((a) => FACTIONS[a].name).join(', ') || '–'} · Gegner: {def.enemies.map((a) => FACTIONS[a].name).join(', ') || '–'}
                  </p>
                  <p className="text-muted">Stark in: {def.homeDistricts.map((d) => state.districts.find((x) => x.archetype === d)?.name ?? d).join(', ')}</p>
                  <button type="button" className="btn mt-2 px-2 py-0.5" onClick={() => dispatch({ type: 'supportFaction', factionId: f.id, amount })}>
                    {credits(amount)} unterstützen
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
