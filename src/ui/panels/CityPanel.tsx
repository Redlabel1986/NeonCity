import { useSimState } from '../store/gameStore';
import { session } from '../session';
import { DISTRICT_ARCHETYPES } from '../../sim/data/districts';
import { credits, integer, percent } from '../format';

export function CityPanel() {
  const state = useSimState();
  if (!state) return null;
  const population = state.districts.reduce((s, d) => s + d.stats.population, 0);
  const citizens = state.population.citizens.length;
  const competitors = Object.keys(state.competitors).length;
  const mine = Object.values(state.buildings).filter((b) => b.owner === 'player');
  return (
    <div className="text-sm">
      <p className="text-xs text-muted">
        Nova Eclipse, {integer(population)} Einwohner in acht Bezirken, davon {integer(citizens)} als Bürger mit Wohnung, Job und Tagesablauf simuliert.
        {competitors} Gastronomiebetriebe der Konkurrenz kämpfen um dieselben Gäste. Bezirkswerte fließen direkt in Gästezahlen und Baukosten ein.
      </p>
      <ul className="mt-3 space-y-2">
        {state.districts.map((d) => {
          const arch = DISTRICT_ARCHETYPES[d.archetype];
          const owned = mine.filter((b) => b.districtId === d.id).length;
          const isHome = d.id === state.player.homeDistrictId;
          return (
            <li key={d.id} className="rounded-sm border border-line p-3">
              <div className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: `#${arch.color.toString(16).padStart(6, '0')}` }} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">
                    {d.name}
                    {isHome && <span className="ml-2 text-xs text-cyan">dein Zuhause</span>}
                  </h3>
                  <p className="text-xs text-muted">{arch.tagline}</p>
                </div>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => session.renderer?.focusTile(d.cx, d.cy, 0.9)}>
                  Anzeigen
                </button>
              </div>
              <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <dt className="text-muted">Einwohner</dt>
                <dd className="text-right">{integer(d.stats.population)}</dd>
                <dt className="text-muted">Kaufkraft</dt>
                <dd className="text-right">{percent(d.stats.purchasingPower)}</dd>
                <dt className="text-muted">Grundstück / Feld</dt>
                <dd className="text-right">{credits(d.stats.landPrice)}</dd>
                <dt className="text-muted">Nachfrage Gastro</dt>
                <dd className="text-right">{percent(d.stats.demandFood)}</dd>
                <dt className="text-muted">Verkehr</dt>
                <dd className="text-right">{percent(d.stats.traffic)}</dd>
                <dt className="text-muted">Konkurrenz</dt>
                <dd className="text-right">{percent(d.stats.competition)}</dd>
                <dt className="text-muted">Kriminalität</dt>
                <dd className={`text-right ${d.stats.crime > 60 ? 'text-blood' : ''}`}>{percent(d.stats.crime)}</dd>
                <dt className="text-muted">Polizeipräsenz</dt>
                <dd className="text-right">{percent(d.stats.policePresence)}</dd>
                <dt className="text-muted">Energie</dt>
                <dd className={`text-right ${d.stats.energySupply < 50 ? 'text-amber' : ''}`}>{percent(d.stats.energySupply)}</dd>
                <dt className="text-muted">Attraktivität</dt>
                <dd className="text-right">{percent(d.stats.attractiveness)}</dd>
                <dt className="text-muted">Bürger (simuliert)</dt>
                <dd className="text-right">{integer(d.economy.citizens)}</dd>
                <dt className="text-muted">Beschäftigung</dt>
                <dd className="text-right">{d.economy.citizens > 0 ? percent((d.economy.employed / d.economy.citizens) * 100) : '–'}</dd>
                <dt className="text-muted">Löhne / Mieten pro Tag</dt>
                <dd className="text-right">
                  {credits(d.economy.dailyWages)} / {credits(d.economy.dailyRent)}
                </dd>
                <dt className="text-muted">Gastro-Betriebe</dt>
                <dd className="text-right">{d.economy.venues}</dd>
                {owned > 0 && (
                  <>
                    <dt className="text-muted">Deine Standorte</dt>
                    <dd className="text-right text-magenta">{owned}</dd>
                  </>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
