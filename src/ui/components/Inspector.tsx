import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { session } from '../session';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { DISTRICT_ARCHETYPES } from '../../sim/data/districts';
import { TileKind } from '../../sim/world/grid';
import { effectiveCapacity, isOpen, openingHours } from '../../sim/systems/business';
import { stageLevel, stageName, treeOf } from '../../sim/data/evolution';
import { REGIONS } from '../../sim/data/regions';
import { regionOfDistrict } from '../../sim/systems/progression';
import { stockOf, totalUnits } from '../../sim/systems/inventory';
import { INGREDIENTS, INGREDIENT_IDS } from '../../sim/data/ingredients';
import { hotelRooms } from '../../sim/systems/hotel';
import { fleetCapacity } from '../../sim/systems/transport';
import { dailyRent, isResidential, propertyPrice } from '../../sim/systems/property';
import { quotePlacement } from '../../sim/systems/construction';
import { credits, duration, integer, percent, signedCredits } from '../format';
import { tickToDate } from '../../sim/core/clock';
import type { Building } from '../../sim/state';
import { hasCityInterior } from '../../render/interior/cityLayouts';

export function Inspector() {
  const state = useSimState();
  const selectedId = useGameStore((s) => s.selectedBuildingId);
  const selectedTile = useGameStore((s) => s.selectedTile);
  if (!state) return null;
  const building = selectedId !== null ? state.buildings[selectedId] : undefined;
  if (!building && !selectedTile) return null;

  return (
    <aside className="panel pointer-events-auto flex min-h-0 w-full flex-1 flex-col border-y-0 border-r-0" aria-label="Auswahl">
      <div className="scroll flex-1 p-4">
        {building ? <BuildingDetails b={building} /> : selectedTile ? <TileDetails x={selectedTile.x} y={selectedTile.y} /> : null}
      </div>
    </aside>
  );
}

function TileDetails({ x, y }: { x: number; y: number }) {
  const state = useSimState();
  const setPanel = useGameStore((s) => s.setPanel);
  const selectTile = useGameStore((s) => s.selectTile);
  if (!state) return null;
  const kind = state.grid.kindAt(x, y);
  const district = state.districts[state.grid.districtAt(x, y)]!;
  const arch = DISTRICT_ARCHETYPES[district.archetype];
  const kindLabel: Record<number, string> = {
    [TileKind.Road]: 'Straße',
    [TileKind.Lot]: 'Freies Grundstück',
    [TileKind.Park]: 'Grünfläche / Platz',
    [TileKind.Water]: 'Hafenbecken',
    [TileKind.Blocked]: 'Infrastruktur',
    [TileKind.Building]: 'Gebäude',
  };
  const quote = kind === TileKind.Lot ? quotePlacement(state, BUILDING_DEFINITIONS.ramen_bar!, district.id) : null;
  return (
    <div>
      <Header title={kindLabel[kind] ?? 'Fläche'} subtitle={`${district.name} · Feld ${x}/${y}`} color={arch.color} onClose={() => selectTile(null)} />
      <dl className="mt-3 text-sm">
        <Row label="Grundstückspreis" value={`${credits(district.stats.landPrice)} / Feld`} />
        <Row label="Straßenanschluss" value={state.grid.footprintTouchesRoad(x, y, 1, 1) ? 'ja' : 'nein'} />
        <Row label="Energieversorgung" value={percent(district.stats.energySupply)} />
        <Row label="Kaufkraft im Bezirk" value={percent(district.stats.purchasingPower)} />
        <Row label="Nachfrage Gastronomie" value={percent(district.stats.demandFood)} />
      </dl>
      {kind === TileKind.Lot && quote && (
        <div className="mt-4">
          <p className="text-xs text-muted">Ein Asia-Imbiss hier kostet {credits(quote.total)} und braucht {duration(quote.buildTime)}.</p>
          <button type="button" className="btn btn-primary mt-2 w-full" onClick={() => setPanel('build')}>
            Hier bauen
          </button>
        </div>
      )}
    </div>
  );
}

function BuildingDetails({ b }: { b: Building }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const selectBuilding = useGameStore((s) => s.selectBuilding);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const openDashboard = useGameStore((s) => s.openDashboard);
  const setDashboardTab = useGameStore((s) => s.setDashboardTab);
  const enterInterior = useGameStore((s) => s.enterInterior);
  if (!state) return null;
  const district = state.districts[b.districtId]!;
  const arch = DISTRICT_ARCHETYPES[district.archetype];
  const def = BUILDING_DEFINITIONS[b.defId];
  const isPlayer = b.owner === state.playerId;
  const otherOwner = !isPlayer && b.owner !== 'city' ? state.players[b.owner]?.player.name ?? 'anderer Spieler' : null;
  const date = tickToDate(state.tick);

  return (
    <div>
      <Header
        title={b.owner === 'city' ? (session.renderer?.spriteNameFor(b.id) ?? b.label) : b.label}
        subtitle={`${isPlayer ? (b.business ? stageName(b) : (def?.name ?? 'Eigenes Gebäude')) : otherOwner ? `Gebäude von ${otherOwner}` : 'Stadtgebäude'} · ${district.name}${REGIONS[regionOfDistrict(state, district.id)].name !== district.name ? ` · ${REGIONS[regionOfDistrict(state, district.id)].name}` : ''}`}
        color={isPlayer ? 0xff2bd6 : otherOwner ? 0xffb020 : arch.color}
        onClose={() => selectBuilding(null)}
      />
      {renaming !== null && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (dispatch({ type: 'rename', buildingId: b.id, label: renaming })) setRenaming(null);
          }}
        >
          <input className="input" value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} autoFocus aria-label="Neuer Name" />
          <button type="submit" className="btn btn-primary">
            OK
          </button>
        </form>
      )}
      <dl className="mt-3 text-sm">
        <Row label="Grundfläche" value={`${b.w} × ${b.h} Felder, ${b.floors} Etagen`} />
        <Row label="Eigentümer" value={isPlayer ? state.player.name : (otherOwner ?? 'Stadt Nova Eclipse')} />
        {otherOwner && b.business && <Row label="Betrieb" value={`${def?.name ?? b.label} (${b.status === 'operational' ? 'geöffnet' : 'im Bau'})`} />}
        {otherOwner && b.business && b.status === 'operational' && <Row label="Ruf" value={String(Math.round(b.business.reputation))} />}
        {otherOwner && b.property && <Row label="Nutzung" value="Immobilie eines anderen Spielers" />}
        {!isPlayer && state.competitors[b.id] && (
          <>
            <Row label="Betrieb" value={state.competitors[b.id]!.name} />
            <Row label="Preisniveau" value={`×${state.competitors[b.id]!.priceLevel.toFixed(2)}`} />
            <Row label="Ruf" value={String(Math.round(state.competitors[b.id]!.reputation))} />
            <Row label="Gäste gestern" value={String(state.competitors[b.id]!.history[state.competitors[b.id]!.history.length - 1]?.served ?? '–')} />
          </>
        )}
        {isPlayer && <Row label="Investiert" value={credits(b.investment)} />}
        {isPlayer && b.business && b.status === 'operational' && (
          <Row label="Entwicklungsstufe" value={`${stageName(b)} (Stufe ${stageLevel(b)})${b.stageUpgrade ? ' · Ausbau läuft' : ''}${b.stars ? ` · ${'★'.repeat(b.stars)}` : ''}`} />
        )}
      </dl>
      {isPlayer && b.business && b.status === 'operational' && treeOf(b.defId) && (
        <button
          type="button"
          className="btn mt-3 w-full"
          onClick={() => {
            openDashboard(b.id);
            setDashboardTab('evolution');
          }}
        >
          Entwicklungsbaum öffnen
        </button>
      )}
      {!b.business && b.status === 'operational' && hasCityInterior(session.renderer?.spriteIdFor(state, b)) && (
        <button type="button" className="btn mt-3 w-full" onClick={() => enterInterior(b.id)} data-testid="enter-city-interior">
          Innenansicht betreten
        </button>
      )}
      {!isPlayer && !otherOwner && <PurchaseOffer b={b} />}
      {isPlayer && b.property && <PropertyDetails b={b} />}

      {isPlayer && b.status === 'construction' && (
        <div className="mt-4">
          <p className="panel-title">Baustelle</p>
          <div className="meter mt-2">
            <span style={{ width: `${(b.progress / b.buildTime) * 100}%`, background: 'var(--color-amber)' }} />
          </div>
          <p className="num mt-1 text-xs text-muted">
            {Math.round((b.progress / b.buildTime) * 100)} % · noch {duration(b.buildTime - b.progress)}
          </p>
        </div>
      )}

      {isPlayer && b.business && def?.business && b.status === 'operational' && b.business.kind === 'gastronomy' && <BusinessDetails b={b} hour={date.hour} />}
      {isPlayer && b.business && def?.business && b.status === 'operational' && b.business.kind !== 'gastronomy' && <OtherBusinessDetails b={b} />}

      {isPlayer && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="button" className="btn" onClick={() => session.renderer?.focusTile(b.x, b.y, Math.max(session.renderer.zoom, 1.4))}>
            Kamera hierher
          </button>
          <button type="button" className="btn" onClick={() => setRenaming(b.label)}>
            Umbenennen
          </button>
          {b.status === 'construction' && state.undoStack.some((u) => u.buildingId === b.id) && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'undoPlacement' })} title="Volle Erstattung, solange die Baustelle läuft">
              Bau abbrechen
            </button>
          )}
          {b.status === 'operational' &&
            (confirmDemolish ? (
              <>
                <button type="button" className="btn btn-danger" onClick={() => dispatch({ type: 'demolish', buildingId: b.id })}>
                  Wirklich abreißen
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDemolish(false)}>
                  Behalten
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDemolish(true)} title="Grundstück wird zu 70 % erstattet, Abriss kostet">
                Abreißen
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function PurchaseOffer({ b }: { b: Building }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [confirm, setConfirm] = useState(false);
  if (!state) return null;
  const price = propertyPrice(state, b);
  const competitor = state.competitors[b.id];
  const residential = isResidential(b);
  const tenants = state.population.citizens.filter((c) => c.homeBuildingId === b.id).length;
  const rentEstimate = residential ? Math.round(tenants * (state.districts[b.districtId]!.stats.rentIndex * 0.9 + 10) * 0.8) : Math.round(state.districts[b.districtId]!.stats.rentIndex * b.w * b.h * b.floors * 0.6 * 0.8 * (competitor ? 1.3 : 1));
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="panel-title">{competitor ? 'Übernahme' : 'Kaufen'}</p>
      <dl className="mt-1 text-sm">
        <Row label="Preis" value={credits(price)} />
        <Row label={residential ? 'Bewohner (Mieter)' : 'Nutzung'} value={residential ? String(tenants) : competitor ? 'Konkurrenzlokal (Pacht)' : 'Gewerbe (Pacht)'} />
        <Row label="Mietschätzung" value={`${credits(rentEstimate)} / Tag`} />
      </dl>
      {confirm ? (
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => dispatch(competitor ? { type: 'takeoverCompetitor', buildingId: b.id } : { type: 'buyProperty', buildingId: b.id })}>
            {competitor ? 'Lokal übernehmen' : 'Jetzt kaufen'}
          </button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>
            Abbrechen
          </button>
        </div>
      ) : (
        <button type="button" className="btn mt-2 w-full" onClick={() => setConfirm(true)}>
          {competitor ? `${competitor.name} übernehmen` : 'Immobilie kaufen'}
        </button>
      )}
      {competitor && <p className="mt-1 text-xs text-muted">Eine Übernahme macht das Lokal zu deinem Imbiss samt Ruf.</p>}
    </div>
  );
}

function PropertyDetails({ b }: { b: Building }) {
  const state = useSimState();
  const setPanel = useGameStore((s) => s.setPanel);
  if (!state || !b.property) return null;
  const p = b.property;
  return (
    <div className="mt-4">
      <p className="panel-title">Immobilie</p>
      <dl className="mt-1 text-sm">
        <Row label="Miete / Tag" value={credits(dailyRent(state, b))} />
        <Row label={isResidential(b) ? 'Mieter' : 'Nutzung'} value={isResidential(b) ? String(p.tenants) : 'Gewerbe'} />
        <Row label="Mietniveau" value={`×${p.rentLevel.toFixed(2)}`} />
        <Row label="Zustand" value={`${Math.round(p.condition)} / 100`} />
        {p.renovationUntilTick > state.tick && <Row label="Renovierung" value={`noch ${duration(p.renovationUntilTick - state.tick)}`} />}
      </dl>
      <button type="button" className="btn mt-2 w-full" onClick={() => setPanel('realestate')}>
        Immobilien verwalten
      </button>
    </div>
  );
}

function OtherBusinessDetails({ b }: { b: Building }) {
  const state = useSimState();
  const openDashboard = useGameStore((s) => s.openDashboard);
  if (!state || !b.business) return null;
  const biz = b.business;
  return (
    <div className="mt-4">
      <p className="panel-title">Betrieb</p>
      <dl className="mt-2 text-sm">
        {biz.kind === 'hotel' && (
          <>
            <Row label="Belegung" value={`${biz.stays.length} / ${hotelRooms(b)} Zimmer`} />
            <Row label="Zimmerpreis" value={credits(biz.pricePerNight)} />
            <Row label="Bewertung" value={biz.reviewCount > 0 ? `${biz.rating.toFixed(1)} ★ (${biz.reviewCount})` : 'noch keine'} />
            <Row label="Umsatz heute" value={credits(biz.todayRevenue)} />
          </>
        )}
        {biz.kind === 'transport' && (
          <>
            <Row label="Fahrten heute" value={`${integer(biz.todayRides)}${biz.todayMissed > 0 ? ` (+${biz.todayMissed} verpasst)` : ''}`} />
            <Row label="Flotte" value={`${fleetCapacity(b, state)?.available ?? 0} / ${biz.vehicles.length} einsatzbereit`} />
            <Row label="Tarif" value={credits(biz.fare)} />
            <Row label="Umsatz heute" value={credits(biz.todayRevenue)} />
          </>
        )}
        {biz.kind === 'lab' && (
          <>
            <Row label="Forschungsziel" value={biz.activeNodeId ?? 'keins'} />
            <Row label="Punkte gestern" value={String(biz.history[biz.history.length - 1]?.points ?? 0)} />
          </>
        )}
        {biz.kind === 'industry' && (
          <>
            <Row label="Linien" value={String(biz.lines.length)} />
            <Row label="Produziert gestern" value={String(biz.history[biz.history.length - 1]?.produced ?? 0)} />
            <Row label="Lager" value={`${Math.round(totalUnits(biz))} Einheiten`} />
          </>
        )}
        {biz.kind === 'security' && (
          <>
            <Row label="Wachleute auf Streife" value={String(Object.values(biz.patrols).reduce((s, n) => s + n, 0))} />
            <Row label="Umsatz gestern" value={credits(biz.history[biz.history.length - 1]?.revenue ?? 0)} />
          </>
        )}
        {biz.kind === 'bank' && (
          <>
            <Row label="Einlagen" value={credits(biz.deposits)} />
            <Row label="Kredite" value={credits(biz.loansOut)} />
            <Row label="Rücklage" value={credits(biz.reserve)} />
          </>
        )}
        {biz.kind === 'retail' && (
          <>
            <Row label="Kunden heute" value={integer(biz.todayCustomers)} />
            <Row label="Umsatz heute" value={credits(biz.todayRevenue)} />
            <Row label="Lager" value={`${Math.round(totalUnits(biz))} Einheiten`} />
          </>
        )}
        <Row label="Personal" value={String(biz.employees.length)} />
      </dl>
      <div className="mt-3 text-xs">
        <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
      </div>
      <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => openDashboard(b.id)}>
        Dashboard öffnen
      </button>
    </div>
  );
}

function BusinessDetails({ b, hour }: { b: Building; hour: number }) {
  const state = useSimState();
  const openDashboard = useGameStore((s) => s.openDashboard);
  if (!state || !b.business || b.business.kind !== 'gastronomy') return null;
  const biz = b.business;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'gastronomy') return null;
  const open = isOpen(model, hour, b);
  const hours = openingHours(model, b);
  const cap = effectiveCapacity(b, state);
  const last = biz.history[biz.history.length - 1];
  const lowStock = INGREDIENT_IDS.filter((id) => stockOf(biz, id) < 8).map((id) => INGREDIENTS[id]!.name);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="panel-title">Betrieb</p>
        <span className={`text-xs ${open ? 'text-acid' : 'text-muted'}`}>{open ? 'geöffnet' : 'geschlossen'}</span>
      </div>
      <dl className="mt-2 text-sm">
        <Row label="Öffnungszeiten" value={hours.open === 0 && hours.close === 24 ? 'rund um die Uhr' : `${pad(hours.open)}:00 – ${pad(hours.close % 24)}:00`} />
        <Row label="Gäste heute" value={`${integer(biz.todayGuests)}${biz.todayTurnedAway > 0 ? ` (+${integer(biz.todayTurnedAway)} abgewiesen)` : ''}`} />
        <Row label="Umsatz heute" value={credits(biz.todayRevenue)} />
        {last && <Row label="Gestern" value={`${integer(last.guests)} Gäste, ${signedCredits(last.revenue - last.costs)}`} />}
        <Row label="Bewertung" value={biz.reviewCount > 0 ? `${biz.rating.toFixed(1)} ★ (${biz.reviewCount})` : 'noch keine'} />
        <Row label="Personal" value={cap ? `${cap.cooks} Koch, ${cap.service} Service, ${cap.managers} Manager` : '–'} />
        <Row label="Kapazität" value={cap ? `${cap.capacity} Gäste/h` : '–'} />
        <Row label="Lager" value={`${Math.round(totalUnits(biz))} Einheiten`} />
      </dl>
      {lowStock.length > 0 && <p className="mt-2 text-xs text-amber">Knapp: {lowStock.join(', ')}</p>}
      {biz.employees.length === 0 && <p className="mt-2 text-xs text-blood">Kein Personal. Stelle einen Koch ein.</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
        <Meter label="Hygiene" value={biz.hygiene} color={biz.hygiene < 40 ? 'var(--color-blood)' : 'var(--color-cyan)'} />
      </div>
      <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => openDashboard(b.id)}>
        Dashboard öffnen
      </button>
    </div>
  );
}

function Header({ title, subtitle, color, onClose }: { title: string; subtitle: string; color: number; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: `#${color.toString(16).padStart(6, '0')}` }} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-medium text-white">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <button type="button" className="btn btn-ghost -mr-2 px-2 py-0.5" aria-label="Auswahl schließen" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="stat-row">
      <dt className="text-muted">{label}</dt>
      <dd className={`num text-right ${muted ? 'text-muted' : 'text-text'}`}>{value}</dd>
    </div>
  );
}

export function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-muted">{label}</span>
        <span className="num">{Math.round(value)}</span>
      </div>
      <div className="meter mt-1" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
