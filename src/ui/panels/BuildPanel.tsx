import { useGameStore, useSimState } from '../store/gameStore';
import { BUILDING_DEFINITIONS, CURRENT_PHASE } from '../../sim/data/buildings';
import { PLACEMENT_ERROR_TEXT } from '../../sim/systems/construction';
import { DIFFICULTIES, BACKGROUNDS } from '../../sim/data/difficulty';
import { credits, duration } from '../format';

const CATEGORY_LABELS: Record<string, string> = {
  gastronomy: 'Gastronomie',
  hotel: 'Hotellerie',
  transport: 'Transport',
  retail: 'Einzelhandel',
  industry: 'Industrie',
  residential: 'Wohnen',
  office: 'Büro',
  civic: 'Öffentlich',
};

export function BuildPanel() {
  const state = useSimState();
  const placementDefId = useGameStore((s) => s.placementDefId);
  const placementCheck = useGameStore((s) => s.placementCheck);
  const startPlacement = useGameStore((s) => s.startPlacement);
  const cancelPlacement = useGameStore((s) => s.cancelPlacement);
  if (!state) return null;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const background = BACKGROUNDS[state.player.background];
  const home = state.districts[state.player.homeDistrictId]!;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Wähle ein Gebäude und klicke auf ein freies Grundstück mit Straßenanschluss. Grundstückspreise unterscheiden sich je Bezirk, in{' '}
        {home.name} kostet ein Feld {credits(difficulty.costMultiplier * home.stats.landPrice)}.
      </p>
      {placementDefId && (
        <div className="rounded-sm border border-cyan/50 bg-cyan/10 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white">Platzierung aktiv: {BUILDING_DEFINITIONS[placementDefId]?.name}</span>
            <button type="button" className="btn px-2 py-0.5" onClick={cancelPlacement}>
              Abbrechen
            </button>
          </div>
          <p className={`num mt-1 text-xs ${placementCheck?.ok ? 'text-acid' : 'text-amber'}`}>
            {placementCheck
              ? placementCheck.ok && placementCheck.quote
                ? `Grundstück ${credits(placementCheck.quote.landCost)} + Bau ${credits(placementCheck.quote.constructionCost)} = ${credits(placementCheck.quote.total)}, Bauzeit ${duration(placementCheck.quote.buildTime)}`
                : PLACEMENT_ERROR_TEXT[placementCheck.error ?? 'tile_occupied']
              : 'Bewege die Maus über die Karte.'}
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {Object.values(BUILDING_DEFINITIONS).map((def) => {
          const locked = def.availability > CURRENT_PHASE;
          const cost = Math.round(def.cost * difficulty.costMultiplier * background.constructionBonus);
          const selected = placementDefId === def.id;
          return (
            <li key={def.id} className={`rounded-sm border p-3 ${selected ? 'border-cyan' : 'border-line'} ${locked ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-white">{def.name}</h3>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABELS[def.category] ?? def.category} · {def.footprint.w}×{def.footprint.h} Felder · {def.floors} Etagen
                  </p>
                </div>
                {locked ? (
                  <span className="shrink-0 rounded-sm border border-line px-2 py-0.5 text-xs text-muted">Phase {def.availability}</span>
                ) : (
                  <button type="button" className={`btn shrink-0 ${selected ? 'btn-primary' : ''}`} onClick={() => (selected ? cancelPlacement() : startPlacement(def.id))} aria-pressed={selected}>
                    {selected ? 'Aktiv' : 'Platzieren'}
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs leading-snug text-text/80">{def.description}</p>
              <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <dt className="text-muted">Baukosten</dt>
                <dd className="text-right">{credits(cost)}</dd>
                <dt className="text-muted">Bauzeit</dt>
                <dd className="text-right">{difficulty.instantBuild ? 'sofort' : duration(def.buildTimeMinutes)}</dd>
                <dt className="text-muted">Betriebskosten</dt>
                <dd className="text-right">{credits(def.upkeepPerDay)} / Tag</dd>
                {def.business && (
                  <>
                    <dt className="text-muted">Startpersonal</dt>
                    <dd className="text-right">{def.business.kind === 'transport' ? `${def.business.startingStaff.length} Fahrer, ${def.business.startingVehicles} Fahrzeuge` : `${def.business.startingStaff.length} Mitarbeiter`}</dd>
                    <dt className="text-muted">{def.business.kind === 'gastronomy' ? 'Plätze / Gerichte' : def.business.kind === 'hotel' ? 'Zimmer / Preis' : def.business.kind === 'retail' ? 'Waren' : 'Tarif / Radius'}</dt>
                    <dd className="text-right">
                      {def.business.kind === 'gastronomy' && `${def.business.seats} · ${def.business.recipes.length}`}
                      {def.business.kind === 'hotel' && `${def.business.rooms} · ${credits(def.business.basePricePerNight)}`}
                      {def.business.kind === 'retail' && def.business.goods.length}
                      {def.business.kind === 'transport' && `${credits(def.business.baseFare)} · ${def.business.radius}`}
                    </dd>
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
