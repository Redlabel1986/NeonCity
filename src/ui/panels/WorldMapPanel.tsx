import { useGameStore, useSimState } from '../store/gameStore';
import { session } from '../session';
import { REGION_ORDER, REGIONS, XP_MILESTONES, PLAYER_LEVELS } from '../../sim/data/regions';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { progressionStatus, regionCentre, regionOfDistrict } from '../../sim/systems/progression';
import { integer } from '../format';

/** World map: the four regions from the countryside to the megacity, the player's level and XP, milestones. */
export function WorldMapPanel() {
  const state = useSimState();
  const setPanel = useGameStore((s) => s.setPanel);
  if (!state) return null;
  const status = progressionStatus(state);
  const p = state.progression;
  const mine = Object.values(state.buildings).filter((b) => b.owner === state.playerId);
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  const milestones = p.milestones
    .map((id) => XP_MILESTONES[id]?.title ?? (id.startsWith('stage:') ? null : id.startsWith('research:') ? `Forschung ${id.slice(9)}` : id.startsWith('region:') ? `${REGIONS[id.slice(7) as keyof typeof REGIONS]?.name ?? id} erschlossen` : null))
    .filter((t): t is string => !!t);

  return (
    <div className="space-y-4 text-sm" data-testid="world-map">
      {p.enabled ? (
        <div className="rounded-sm border border-line p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-white">
              Level {status.level}: {status.name}
            </span>
            <span className="num text-xs text-muted" data-testid="xp-text">
              {integer(status.xp)} XP{status.nextThreshold !== null ? ` / ${integer(status.nextThreshold)}` : ' · Höchstes Level'}
            </span>
          </div>
          <div className="meter mt-2" aria-label="Fortschritt zum nächsten Level">
            <span style={{ width: `${status.progress * 100}%`, background: 'var(--color-cyan)' }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {status.nextRegion ? `Mit Level ${status.level + 1} öffnet sich ${REGIONS[status.nextRegion].name}.` : 'Alle Regionen stehen dir offen.'} XP gibt es für Meilensteine: Eröffnungen, Umsatz- und Gewinnmarken, Entwicklungsstufen, Forschung, Lieferketten, Übernahmen, Filialen. Jeder Meilenstein zählt nur einmal.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Freies Spiel: alle Regionen offen, keine Level. Neue Spiele mit Aufstieg starten in Greenhaven.</p>
      )}

      <div className="grid gap-2" data-testid="regions">
        {REGION_ORDER.map((id) => {
          const region = REGIONS[id];
          const unlocked = status.regions.find((r) => r.id === id)?.unlocked ?? true;
          const owned = mine.filter((b) => regionOfDistrict(state, b.districtId) === id).length;
          const districts = state.districts.filter((d) => regionOfDistrict(state, d.id) === id);
          const exclusive = Object.values(BUILDING_DEFINITIONS).filter((d) => d.regions?.includes(id) && d.id !== 'city');
          const centre = regionCentre(state, id);
          return (
            <section key={id} className={`rounded-sm border p-3 ${unlocked ? 'border-line' : 'border-line/60 opacity-80'}`} aria-label={region.name} data-testid={`region-${id}`}>
              <div className="flex items-start gap-2">
                <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: hex(region.color) }} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">
                    {region.name}
                    <span className="ml-2 text-xs font-normal text-muted">{unlocked ? `offen · ${districts.length} Bezirk${districts.length === 1 ? '' : 'e'} · ${owned} eigene Gebäude` : `gesperrt · ab Level ${region.requiredLevel}`}</span>
                  </h3>
                  <p className="text-xs text-muted">{region.tagline}</p>
                </div>
                {unlocked ? (
                  <button
                    type="button"
                    className="btn px-2 py-0.5 text-xs"
                    onClick={() => {
                      session.renderer?.flyTo(centre.x, centre.y, 0.9, 0.8);
                      setPanel(null);
                    }}
                  >
                    Hinfliegen
                  </button>
                ) : (
                  <span className="rounded-sm border border-line px-2 py-0.5 text-xs text-muted">Level {region.requiredLevel}</span>
                )}
              </div>
              <p className="mt-2 text-xs text-text/80">{region.description}</p>
              <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <dt className="text-muted">Grundstückswert</dt>
                <dd className="text-right">×{region.landValueModifier.toFixed(1)}</dd>
                <dt className="text-muted">Betriebskosten</dt>
                <dd className="text-right">×{region.operatingCostModifier.toFixed(2)}</dd>
                <dt className="text-muted">Verkehr</dt>
                <dd className="text-right">{Math.round(region.trafficDensity * 100)} %</dd>
                <dt className="text-muted">Grün</dt>
                <dd className="text-right">{Math.round(region.vegetationDensity * 100)} %</dd>
              </dl>
              <p className="mt-2 text-xs">
                <span className="text-muted">Besonderheiten:</span> {region.specialties.join(', ')}
                {exclusive.length > 0 && <span className="text-muted"> · nur hier: {exclusive.map((d) => d.name).join(', ')}</span>}
              </p>
              <p className="text-xs">
                <span className="text-muted">Produkte:</span> {region.resources.join(', ')}
              </p>
              <p className="text-xs text-muted">{region.goal}</p>
              {!unlocked && (
                <p className="mt-1 text-xs text-cyan">
                  Freischaltung: {integer(PLAYER_LEVELS[region.requiredLevel - 1]?.xp ?? 0)} XP (Level {region.requiredLevel}).
                </p>
              )}
            </section>
          );
        })}
      </div>

      {p.enabled && (
        <div className="rounded-sm border border-line p-3">
          <p className="panel-title">Meilensteine ({milestones.length})</p>
          {milestones.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Noch keine. Eröffne deinen ersten Betrieb.</p>
          ) : (
            <ul className="mt-1 columns-2 text-xs text-text/80">
              {milestones.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
