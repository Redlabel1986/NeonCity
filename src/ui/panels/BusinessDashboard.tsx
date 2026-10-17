import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import type { Building, GastronomyState } from '../../sim/state';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { RECIPES } from '../../sim/data/recipes';
import { INGREDIENTS, INGREDIENT_IDS } from '../../sim/data/ingredients';
import { SUPPLIERS } from '../../sim/data/suppliers';
import { UPGRADES, upgradeEffects } from '../../sim/data/upgrades';
import { effectiveCapacity, explainDemand, isOpen, priceBounds } from '../../sim/systems/business';
import { quoteOrder, servingsPossible, stockOf, storageCapacity, totalUnits } from '../../sim/systems/inventory';
import { ROLE_LABELS, expectedWage } from '../../sim/systems/staff';
import { credits, decimal, duration, integer, signedCredits } from '../format';
import { tickToDate } from '../../sim/core/clock';
import { Meter, Row } from '../components/Inspector';
import { HotelOverview, RetailOverview, TransportOverview, StockTab, SecurityOverview } from './KindDashboards';
import { LabOverview, IndustryOverview } from './IndustryDashboards';
import type { HotelState, RetailState, TransportState, StaffedBusiness, SecurityState, ResearchLabState, IndustryState } from '../../sim/state';

import type { DashboardTab as Tab } from '../../render/interior/layouts';

const TABS_BY_KIND: Record<string, { id: Tab; label: string }[]> = {
  gastronomy: [
    { id: 'overview', label: 'Übersicht' },
    { id: 'menu', label: 'Speisekarte' },
    { id: 'supply', label: 'Einkauf' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  hotel: [
    { id: 'overview', label: 'Zimmer & Gäste' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  transport: [
    { id: 'overview', label: 'Flotte & Fahrten' },
    { id: 'staff', label: 'Fahrer' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  retail: [
    { id: 'overview', label: 'Verkauf' },
    { id: 'supply', label: 'Einkauf' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  security: [
    { id: 'overview', label: 'Streifen & Verträge' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  lab: [
    { id: 'overview', label: 'Forschung' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
  industry: [
    { id: 'overview', label: 'Produktion' },
    { id: 'supply', label: 'Rohstoffe' },
    { id: 'staff', label: 'Personal' },
    { id: 'upgrades', label: 'Ausbau' },
  ],
};

export function BusinessDashboard({ building }: { building: Building }) {
  const tab = useGameStore((s) => s.dashboardTab);
  const setTab = useGameStore((s) => s.setDashboardTab);
  const biz = building.business;
  if (!biz) return <p className="text-sm text-muted">Dieses Gebäude hat keinen Betrieb.</p>;
  if (building.status !== 'operational') return <p className="text-sm text-muted">Der Betrieb ist noch im Bau.</p>;
  const tabs = TABS_BY_KIND[biz.kind] ?? TABS_BY_KIND.gastronomy!;
  const active = tabs.some((t) => t.id === tab) ? tab : 'overview';
  const model = BUILDING_DEFINITIONS[building.defId]?.business;
  return (
    <div className="text-sm">
      <div className="mb-3 flex flex-wrap gap-1 border-b border-line pb-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`btn btn-ghost px-2 py-1 ${active === t.id ? 'border-b-cyan text-white' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {active === 'overview' && biz.kind === 'gastronomy' && <Overview b={building} biz={biz} />}
      {active === 'overview' && biz.kind === 'hotel' && <HotelOverview b={building} biz={biz as HotelState} />}
      {active === 'overview' && biz.kind === 'transport' && <TransportOverview b={building} biz={biz as TransportState} />}
      {active === 'overview' && biz.kind === 'retail' && <RetailOverview b={building} biz={biz as RetailState} />}
      {active === 'overview' && biz.kind === 'security' && <SecurityOverview b={building} biz={biz as SecurityState} />}
      {active === 'overview' && biz.kind === 'lab' && <LabOverview b={building} biz={biz as ResearchLabState} />}
      {active === 'overview' && biz.kind === 'industry' && <IndustryOverview b={building} biz={biz as IndustryState} />}
      {active === 'supply' && biz.kind === 'industry' && model?.kind === 'industry' && <StockTab b={building} biz={biz as IndustryState} goods={Object.keys(model.startingStock)} />}
      {active === 'menu' && biz.kind === 'gastronomy' && <MenuTab b={building} biz={biz} />}
      {active === 'supply' && biz.kind === 'gastronomy' && <SupplyTab b={building} biz={biz} />}
      {active === 'supply' && biz.kind === 'retail' && model?.kind === 'retail' && <StockTab b={building} biz={biz as RetailState} goods={model.goods} />}
      {active === 'staff' && <StaffTab b={building} biz={biz as StaffedBusiness} />}
      {active === 'upgrades' && <UpgradesTab b={building} biz={biz as StaffedBusiness} />}
    </div>
  );
}

function Overview({ b, biz }: { b: Building; biz: GastronomyState }) {
  const state = useSimState();
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'gastronomy') return null;
  const cap = effectiveCapacity(b, state)!;
  const demand = explainDemand(state, b)!;
  const hour = tickToDate(state.tick).hour;
  const last = biz.history[biz.history.length - 1];
  const avgSat = biz.todaySatisfactionCount > 0 ? biz.todaySatisfactionSum / biz.todaySatisfactionCount : null;
  const bottleneck =
    cap.capacity === 0
      ? 'Kein Koch: niemand kann kochen.'
      : cap.cookThroughput <= cap.serviceThroughput && cap.cookThroughput <= cap.seatCapacity
        ? 'Engpass: Küche'
        : cap.serviceThroughput <= cap.seatCapacity
          ? 'Engpass: Service'
          : 'Engpass: Sitzplätze';
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Gäste heute" value={integer(biz.todayGuests)} />
        <Kpi label="Umsatz heute" value={credits(biz.todayRevenue)} />
        <Kpi label="Bewertung" value={biz.reviewCount > 0 ? `${biz.rating.toFixed(1)} ★` : '–'} sub={`${biz.reviewCount} Bewertungen`} />
        <Kpi label="Status" value={isOpen(model, hour) ? 'geöffnet' : 'geschlossen'} sub={`${pad(model.openHour)}–${pad(model.closeHour)} Uhr`} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
        <Meter label="Hygiene" value={biz.hygiene} color={biz.hygiene < 40 ? 'var(--color-blood)' : 'var(--color-cyan)'} />
        <Meter label="Gerichtsqualität (letzter Tag)" value={biz.quality} color="var(--color-amber)" />
        <Meter label="Zufriedenheit heute" value={avgSat ?? 0} color="var(--color-acid)" />
      </div>
      <dl className="text-xs">
        <Row label="Kapazität" value={`${cap.capacity} Gäste/h (${bottleneck})`} />
        <Row label="Küche / Service / Plätze" value={`${cap.cookThroughput.toFixed(0)} / ${cap.serviceThroughput.toFixed(0)} / ${cap.seatCapacity.toFixed(0)} pro h`} />
        <Row label="Erwartung zur Stoßzeit" value={`${demand.expectedPeakGuests.toFixed(1)} Gäste/h`} />
        <Row label="Davon Bürgerbesuche (Stammkundschaft)" value={`${biz.todayCitizenVisits} von ${biz.todayGuests + biz.todayTurnedAway + biz.todayLostNoIngredients}`} />
        <Row label="Abgewiesen / ohne Zutaten heute" value={`${biz.todayTurnedAway} / ${biz.todayLostNoIngredients}`} />
        <Row label="Wareneinsatz heute" value={credits(biz.todayCogs)} />
        <Row label="Einkäufe heute" value={credits(biz.todayPurchases)} />
        <Row label="Lager" value={`${Math.round(totalUnits(biz))} / ${storageCapacity(b)} Einheiten`} />
        {biz.upgradeInProgress && (
          <Row label="Umbau läuft" value={`${UPGRADES[biz.upgradeInProgress.id]?.name} Stufe ${biz.upgradeInProgress.level}, noch ${duration(biz.upgradeInProgress.readyTick - state.tick)}`} />
        )}
      </dl>
      {last && (
        <div>
          <p className="panel-title">Letzte Tagesabrechnung (Tag {last.day + 1})</p>
          <dl className="num mt-1 text-xs">
            <Row label="Gäste" value={`${integer(last.guests)}${last.turnedAway ? ` (+${last.turnedAway} abgewiesen)` : ''}`} />
            <Row label="Umsatz" value={credits(last.revenue)} />
            <Row label="Wareneinsatz (verbraucht)" value={credits(last.cogs ?? 0)} />
            <Row label="Einkäufe (bezahlt)" value={credits(last.purchases ?? 0)} />
            <Row label="Löhne" value={credits(last.wages ?? 0)} />
            <Row label="Kosten gesamt" value={credits(last.costs)} />
            <Row label="Ergebnis (Umsatz − Kosten)" value={signedCredits(last.revenue - last.costs)} />
            <Row label="Zufriedenheit" value={last.satisfaction !== undefined ? `${Math.round(last.satisfaction)} / 100` : '–'} />
            <Row label="Verdorben" value={`${Math.round(last.waste ?? 0)} Einheiten`} />
          </dl>
        </div>
      )}
      <div className="text-xs text-muted">
        <p>Nachfrage-Faktoren: Bezirk ×{demand.district.toFixed(2)}, Konkurrenz ×{demand.competition.toFixed(2)}, Sicherheit ×{demand.safety.toFixed(2)}, Preis ×{demand.price.toFixed(2)}, Ruf ×{demand.reputation.toFixed(2)}, Ausbau ×{demand.upgrades.toFixed(2)}</p>
      </div>
    </div>
  );
}

function MenuTab({ b, biz }: { b: Building; biz: GastronomyState }) {
  const dispatch = useGameStore((s) => s.dispatch);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Gäste wählen nach Beliebtheit und Preis. Gerichte ohne Zutaten können nicht verkauft werden.</p>
      {biz.menu.map((m) => {
        const r = RECIPES[m.recipeId]!;
        const bounds = priceBounds(m.recipeId)!;
        const possible = servingsPossible(biz, m.recipeId);
        const cost = Object.entries(r.ingredients).reduce((s, [ing, u]) => s + u * (INGREDIENTS[ing]?.basePrice ?? 1), 0);
        return (
          <div key={m.recipeId} className={`rounded-sm border p-3 ${m.enabled ? 'border-line' : 'border-line/40 opacity-70'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-white">{r.name}</h3>
                <p className="text-xs text-muted">{r.description}</p>
                <p className="num mt-1 text-xs text-muted">
                  Beliebtheit {r.appeal} · Anspruch {r.complexity} · Zutaten ≈ {credits(cost)} · heute {m.soldToday}× · Vorrat für {possible}
                  {possible === 0 && m.enabled && <span className="ml-1 text-blood">keine Zutaten</span>}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-1 text-xs">
                <input type="checkbox" checked={m.enabled} onChange={(e) => dispatch({ type: 'toggleMenuItem', buildingId: b.id, recipeId: m.recipeId, enabled: e.target.checked })} className="accent-[#19e6ff]" />
                angeboten
              </label>
            </div>
            <label className="mt-2 block text-xs">
              <span className="flex justify-between">
                <span className="text-muted">Preis</span>
                <span className="num text-white">{credits(m.price)}</span>
              </span>
              <input type="range" min={bounds.min} max={bounds.max} step={1} value={m.price} onChange={(e) => dispatch({ type: 'setMenuPrice', buildingId: b.id, recipeId: m.recipeId, price: Number(e.target.value) })} className="w-full accent-[#ff2bd6]" aria-label={`Preis ${r.name}`} />
            </label>
          </div>
        );
      })}
    </div>
  );
}

function SupplyTab({ b, biz }: { b: Building; biz: GastronomyState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [supplierId, setSupplierId] = useState(biz.preferredSupplierId);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])));
  if (!state) return null;
  const supplier = SUPPLIERS[supplierId]!;
  const items = INGREDIENT_IDS.map((id) => ({ ingredientId: id, units: qty[id] ?? 0 })).filter((i) => i.units > 0);
  const quote = items.length > 0 ? quoteOrder(state, supplierId, items) : null;
  const day = tickToDate(state.tick).day;
  const capacity = storageCapacity(b);
  return (
    <div className="space-y-4">
      <div>
        <p className="panel-title">Lager ({Math.round(totalUnits(biz))} / {capacity})</p>
        <table className="num mt-1 w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="text-left font-normal">Zutat</th>
              <th className="text-right font-normal">Bestand</th>
              <th className="text-right font-normal">Qualität</th>
              <th className="text-right font-normal">Ältestes Los</th>
              <th className="text-right font-normal">Nachbestellziel</th>
            </tr>
          </thead>
          <tbody>
            {INGREDIENT_IDS.map((id) => {
              const lots = biz.inventory.filter((l) => l.ingredientId === id);
              const units = stockOf(biz, id);
              const q = units > 0 ? lots.reduce((s, l) => s + l.quality * l.units, 0) / units : 0;
              const oldest = lots.length > 0 ? Math.min(...lots.map((l) => l.boughtDay)) : null;
              const shelf = INGREDIENTS[id]!.shelfLifeDays + upgradeEffects(biz.upgrades).shelfLife;
              const daysLeft = oldest !== null ? shelf - (day - oldest) : null;
              return (
                <tr key={id} className="border-t border-line/40">
                  <td className="py-1">{INGREDIENTS[id]!.name}</td>
                  <td className={`py-1 text-right ${units < 10 ? 'text-amber' : ''}`}>{units.toFixed(1)}</td>
                  <td className="py-1 text-right">{units > 0 ? Math.round(q) : '–'}</td>
                  <td className={`py-1 text-right ${daysLeft !== null && daysLeft <= 1 ? 'text-blood' : ''}`}>{daysLeft !== null ? `noch ${daysLeft} T` : '–'}</td>
                  <td className="py-1 text-right">
                    <input
                      type="number"
                      className="input w-20 px-1 py-0 text-right"
                      min={0}
                      max={999}
                      value={biz.reorderTargets[id] ?? 0}
                      onChange={(e) => dispatch({ type: 'setAutoReorder', buildingId: b.id, enabled: biz.autoReorder, targets: { [id]: Number(e.target.value) } })}
                      aria-label={`Nachbestellziel ${INGREDIENTS[id]!.name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={biz.autoReorder} onChange={(e) => dispatch({ type: 'setAutoReorder', buildingId: b.id, enabled: e.target.checked })} className="accent-[#19e6ff]" />
          Jede Nacht automatisch bis zu den Zielen nachbestellen bei
          <select className="input w-auto py-0" value={biz.preferredSupplierId} onChange={(e) => dispatch({ type: 'setAutoReorder', buildingId: b.id, enabled: biz.autoReorder, supplierId: e.target.value })} aria-label="Lieferant für Nachbestellungen">
            {Object.values(SUPPLIERS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">Ein Manager passt die Ziele automatisch an den Verbrauch an.</p>
      </div>

      {biz.orders.length > 0 && (
        <div>
          <p className="panel-title">Offene Lieferungen</p>
          <ul className="mt-1 text-xs">
            {biz.orders.map((o) => (
              <li key={o.id} className="flex justify-between border-t border-line/40 py-1">
                <span>
                  {SUPPLIERS[o.supplierId]?.name}: {o.items.map((i) => `${i.units} ${INGREDIENTS[i.ingredientId]?.name}`).join(', ')}
                </span>
                <span className={`num ${o.delayed ? 'text-amber' : ''}`}>
                  {o.arrivesTick > state.tick ? `in ${duration(o.arrivesTick - state.tick)}` : 'trifft ein'} · {credits(o.cost)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="panel-title">Bestellen</p>
        <div className="mt-1 grid gap-1">
          {Object.values(SUPPLIERS).map((s) => (
            <button key={s.id} type="button" aria-pressed={supplierId === s.id} onClick={() => setSupplierId(s.id)} className={`rounded-sm border p-2 text-left text-xs ${supplierId === s.id ? 'border-cyan bg-cyan/10' : 'border-line'}`}>
              <span className="flex justify-between">
                <span className="font-medium text-white">{s.name}</span>
                <span className="num text-muted">
                  Preis ×{s.priceFactor.toFixed(2)} · Qualität {s.quality} · {s.deliveryHours} h · ab {s.minOrder} ¢
                </span>
              </span>
              <span className="block text-muted">{s.description}</span>
            </button>
          ))}
        </div>
        <div className="num mt-2 grid grid-cols-3 gap-2 text-xs">
          {INGREDIENT_IDS.map((id) => {
            const excluded = supplier.excludes.includes(id);
            const unit = INGREDIENTS[id]!.basePrice * supplier.priceFactor * (state.market.index[id] ?? 1);
            return (
              <label key={id} className={`block ${excluded ? 'opacity-40' : ''}`}>
                <span className="flex justify-between text-muted">
                  <span>{INGREDIENTS[id]!.name}</span>
                  <span>{decimal(unit)} ¢</span>
                </span>
                <input type="number" min={0} max={500} className="input mt-0.5 px-1 py-0.5" value={qty[id] ?? 0} disabled={excluded} onChange={(e) => setQty({ ...qty, [id]: Math.max(0, Number(e.target.value)) })} aria-label={`Menge ${INGREDIENTS[id]!.name}`} />
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className={`num text-xs ${quote && !quote.ok ? 'text-amber' : 'text-muted'}`}>
            {quote ? (quote.ok ? `Gesamt ${credits(quote.cost)}, Lieferung in ${supplier.deliveryHours} h` : quote.error) : 'Mengen eingeben.'}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!quote?.ok}
            onClick={() => {
              if (dispatch({ type: 'placeOrder', buildingId: b.id, supplierId, items })) {
                setQty(Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0])));
              }
            }}
          >
            Bestellen
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffTab({ b, biz }: { b: Building; biz: StaffedBusiness }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const [confirmFire, setConfirmFire] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <div>
        <p className="panel-title">Mitarbeiter ({biz.employees.length})</p>
        {biz.employees.length === 0 && <p className="text-xs text-blood">Ohne Koch kann niemand bedient werden.</p>}
        <ul className="mt-1 space-y-2">
          {biz.employees.map((e) => (
            <li key={e.id} className="rounded-sm border border-line p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-white">{e.name}</span> <span className="text-muted">{ROLE_LABELS[e.role]}</span>
                </span>
                {confirmFire === e.id ? (
                  <span className="flex gap-1">
                    <button type="button" className="btn btn-danger px-2 py-0.5" onClick={() => dispatch({ type: 'fire', buildingId: b.id, employeeId: e.id })}>
                      Wirklich entlassen
                    </button>
                    <button type="button" className="btn px-2 py-0.5" onClick={() => setConfirmFire(null)}>
                      Behalten
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn px-2 py-0.5" onClick={() => setConfirmFire(e.id)} title="Abfindung: drei Tageslöhne">
                    Entlassen
                  </button>
                )}
              </div>
              <div className="mt-1 grid grid-cols-3 gap-3">
                <Meter label="Fähigkeit" value={e.skill} color="var(--color-cyan)" />
                <Meter label="Moral" value={e.morale} color={e.morale < 25 ? 'var(--color-blood)' : 'var(--color-acid)'} />
                <label className="block">
                  <span className="flex justify-between text-muted">
                    <span>Lohn/Tag</span>
                    <span className="num">{credits(e.wage)}</span>
                  </span>
                  <input type="range" min={20} max={400} step={5} value={e.wage} onChange={(ev) => dispatch({ type: 'setWage', buildingId: b.id, employeeId: e.id, wage: Number(ev.target.value) })} className="w-full accent-[#ffb020]" aria-label={`Lohn ${e.name}`} />
                  <span className="block text-muted">erwartet {credits(expectedWage(e.role, e.skill))}</span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="panel-title">Bewerber</p>
        {biz.candidates.length === 0 && <p className="text-xs text-muted">Morgen melden sich neue Bewerber.</p>}
        <ul className="mt-1 space-y-1">
          {biz.candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-sm border border-line p-2 text-xs">
              <span>
                <span className="font-medium text-white">{c.name}</span> <span className="text-muted">{ROLE_LABELS[c.role]}</span>
                <span className="num block text-muted">
                  Fähigkeit {c.skill} · fordert {credits(c.wageAsk)}/Tag
                </span>
              </span>
              <button type="button" className="btn btn-primary px-2 py-0.5" onClick={() => dispatch({ type: 'hire', buildingId: b.id, candidateId: c.id })}>
                Einstellen
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {b.business?.kind === 'gastronomy' && 'Köche bestimmen Kapazität und Qualität, Service die Zufriedenheit und Hygiene, ein Manager Moral und Einkauf.'}
          {b.business?.kind === 'hotel' && 'Rezeption bestimmt die Check-in-Kapazität, Housekeeping die Sauberkeit, Sicherheit verhindert Zwischenfälle.'}
          {b.business?.kind === 'transport' && 'Jeder Fahrer braucht ein einsatzbereites Fahrzeug. Fähigkeit und Moral bestimmen Fahrten je Stunde.'}
          {b.business?.kind === 'retail' && 'Verkäufer bestimmen die Kundenkapazität, Sicherheitspersonal senkt den Schwund.'}
          {b.business?.kind === 'security' && 'Wachleute gehen auf Streife, Ermittler arbeiten gegen Familien, ein Manager hält die Moral.'}
          {b.business?.kind === 'lab' && 'Forscher liefern Punkte, Techniker steigern sie.'}
          {b.business?.kind === 'industry' && 'Arbeiter liefern Arbeitsstunden, Techniker heben die Maschinenleistung und Qualität.'}
        </p>
      </div>
    </div>
  );
}

function UpgradesTab({ b, biz }: { b: Building; biz: StaffedBusiness }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  return (
    <div className="space-y-2">
      {biz.upgradeInProgress && (
        <p className="rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          Umbau läuft: {UPGRADES[biz.upgradeInProgress.id]?.name} Stufe {biz.upgradeInProgress.level}, noch {duration(biz.upgradeInProgress.readyTick - state.tick)}. Kapazität −20 %.
        </p>
      )}
      {model.upgrades.map((id) => {
        const def = UPGRADES[id]!;
        const level = biz.upgrades[id] ?? 0;
        const next = def.levels[level];
        return (
          <div key={id} className="rounded-sm border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-white">
                  {def.name} <span className="num text-xs text-muted">Stufe {level} / {def.levels.length}</span>
                </h3>
                <p className="text-xs text-muted">{def.description}</p>
                {next && (
                  <p className="num mt-1 text-xs">
                    Nächste Stufe: {next.effect} · {credits(next.cost)} · {next.hours} h
                  </p>
                )}
              </div>
              {next ? (
                <button type="button" className="btn btn-primary shrink-0" disabled={!!biz.upgradeInProgress} onClick={() => dispatch({ type: 'startUpgrade', buildingId: b.id, upgradeId: id })}>
                  Ausbauen
                </button>
              ) : (
                <span className="shrink-0 text-xs text-acid">voll ausgebaut</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-line px-2 py-1.5">
      <span className="block text-[0.65rem] text-muted">{label}</span>
      <span className="block font-medium text-white">{value}</span>
      {sub && <span className="block text-[0.65rem] text-muted">{sub}</span>}
    </div>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
