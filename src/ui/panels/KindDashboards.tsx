import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import type { Building, HotelState, RetailState, TransportState, SecurityState } from '../../sim/state';
import { assignedGuards, guardsOf } from '../../sim/systems/security';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { INGREDIENTS } from '../../sim/data/ingredients';
import { SUPPLIERS } from '../../sim/data/suppliers';
import { explainHotelDemand, hotelPriceBounds, hotelRooms } from '../../sim/systems/hotel';
import { explainRideDemand, fareBounds, fleetCapacity } from '../../sim/systems/transport';
import { explainRetailDemand, isRetailOpen, retailPriceBounds } from '../../sim/systems/retail';
import { quoteOrder, stockOf, storageCapacity, totalUnits } from '../../sim/systems/inventory';
import { credits, decimal, duration, integer, percent, signedCredits } from '../format';
import { tickToDate } from '../../sim/core/clock';
import { Meter, Row } from '../components/Inspector';
import { DIFFICULTIES } from '../../sim/data/difficulty';
import { stageEffects } from '../../sim/data/evolution';

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-line px-2 py-1.5">
      <span className="block text-[0.65rem] text-muted">{label}</span>
      <span className="block font-medium text-white">{value}</span>
      {sub && <span className="block text-[0.65rem] text-muted">{sub}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ hotel

export function HotelOverview({ b, biz }: { b: Building; biz: HotelState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'hotel') return null;
  const rooms = hotelRooms(b);
  const demand = explainHotelDemand(state, b)!;
  const bounds = hotelPriceBounds(b.defId, stageEffects(b).price)!;
  const last = biz.history[biz.history.length - 1];
  const occupancy = rooms > 0 ? biz.stays.length / rooms : 0;
  const reception = biz.employees.filter((e) => e.role === 'reception').length;
  const housekeeping = biz.employees.filter((e) => e.role === 'housekeeping').length;
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Belegung" value={`${biz.stays.length} / ${rooms}`} sub={percent(occupancy * 100)} />
        <Kpi label="Check-ins heute" value={integer(biz.todayCheckIns)} sub={biz.todayTurnedAway > 0 ? `${biz.todayTurnedAway} abgewiesen` : undefined} />
        <Kpi label="Umsatz heute" value={credits(biz.todayRevenue)} />
        <Kpi label="Bewertung" value={biz.reviewCount > 0 ? `${biz.rating.toFixed(1)} ★` : '–'} sub={`${biz.reviewCount} Bewertungen`} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
        <Meter label="Sauberkeit" value={biz.cleanliness} color={biz.cleanliness < 40 ? 'var(--color-blood)' : 'var(--color-cyan)'} />
      </div>
      <label className="block text-sm">
        <span className="flex justify-between">
          <span className="text-muted">Zimmerpreis pro Nacht</span>
          <span className="num text-white">{credits(biz.pricePerNight)}</span>
        </span>
        <input type="range" min={bounds.min} max={bounds.max} step={1} value={biz.pricePerNight} onChange={(e) => dispatch({ type: 'setRoomPrice', buildingId: b.id, price: Number(e.target.value) })} className="mt-1 w-full accent-[#ff2bd6]" aria-label="Zimmerpreis" />
        <span className="num block text-xs text-muted">Zimmerkosten {credits(model.costPerRoomNight)} je Nacht · Komfort {model.comfort}</span>
      </label>
      <dl className="text-xs">
        <Row label="Erwartete Ankünfte pro Tag" value={demand.expectedArrivals.toFixed(1)} />
        <Row label="Rezeption / Housekeeping" value={`${reception} / ${housekeeping}`} />
        {reception === 0 && <Row label="Hinweis" value="Ohne Rezeption nur Selbst-Check-in (2 Gäste/h)" />}
        <Row label="Nachfrage-Faktoren" value={`Bezirk ×${demand.district.toFixed(2)} · Preis ×${demand.price.toFixed(2)} · Ruf ×${demand.reputation.toFixed(2)} · Komfort ×${demand.comfort.toFixed(2)}`} />
      </dl>
      {last && (
        <div>
          <p className="panel-title">Letzte Tagesabrechnung (Tag {last.day + 1})</p>
          <dl className="num mt-1 text-xs">
            <Row label="Belegung" value={percent(last.occupancy * 100)} />
            <Row label="Check-ins" value={integer(last.checkIns)} />
            <Row label="Umsatz" value={credits(last.revenue)} />
            <Row label="Kosten (Zimmer, Löhne, Betrieb)" value={credits(last.costs)} />
            <Row label="Ergebnis" value={signedCredits(last.revenue - last.costs)} />
            <Row label="Gästezufriedenheit" value={last.satisfaction !== undefined ? `${Math.round(last.satisfaction)} / 100` : '–'} />
          </dl>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- transport

export function TransportOverview({ b, biz }: { b: Building; biz: TransportState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [confirmSell, setConfirmSell] = useState<number | null>(null);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'transport') return null;
  const demand = explainRideDemand(state, b)!;
  const cap = fleetCapacity(b, state)!;
  const bounds = fareBounds(b.defId, stageEffects(b).price)!;
  const last = biz.history[biz.history.length - 1];
  const vehiclePrice = Math.round(model.vehiclePrice * DIFFICULTIES[state.player.difficulty].costMultiplier);
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Fahrten heute" value={integer(biz.todayRides)} sub={biz.todayMissed > 0 ? `${biz.todayMissed} verpasst` : undefined} />
        <Kpi label="Umsatz heute" value={credits(biz.todayRevenue)} />
        <Kpi label="Fahrzeuge" value={`${cap.available} / ${biz.vehicles.length}`} sub="einsatzbereit" />
        <Kpi label="Fahrer" value={String(cap.drivers)} sub={`${cap.ridesPerHour.toFixed(1)} Fahrten/h`} />
      </div>
      <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
      <label className="block text-sm">
        <span className="flex justify-between">
          <span className="text-muted">Tarif pro Fahrt</span>
          <span className="num text-white">{credits(biz.fare)}</span>
        </span>
        <input type="range" min={bounds.min} max={bounds.max} step={1} value={biz.fare} onChange={(e) => dispatch({ type: 'setFare', buildingId: b.id, fare: Number(e.target.value) })} className="mt-1 w-full accent-[#ffb020]" aria-label="Tarif" />
        <span className="num block text-xs text-muted">Energie {decimal(model.energyPerRide)} ¢ je Fahrt · Radius {model.radius} Felder</span>
      </label>
      <dl className="text-xs">
        <Row label="Erwartete Fahrten zur Stoßzeit" value={`${demand.expectedPeakRides.toFixed(1)} / h`} />
        <Row label="Nachfrage-Faktoren" value={`Bezirke ×${demand.districts.toFixed(2)} · Bürger ${Math.round(demand.citizens)} · Preis ×${demand.price.toFixed(2)} · Ruf ×${demand.reputation.toFixed(2)}`} />
        {cap.drivers > cap.available && <Row label="Hinweis" value="Mehr Fahrer als Fahrzeuge: Fahrzeuge kaufen" />}
        {cap.available > cap.drivers && <Row label="Hinweis" value="Mehr Fahrzeuge als Fahrer: Fahrer einstellen" />}
      </dl>
      <div>
        <div className="flex items-center justify-between">
          <p className="panel-title">Flotte</p>
          <button type="button" className="btn btn-primary px-2 py-0.5" onClick={() => dispatch({ type: 'buyVehicle', buildingId: b.id })}>
            Fahrzeug kaufen ({credits(vehiclePrice)})
          </button>
        </div>
        <ul className="mt-1 space-y-1 text-xs">
          {biz.vehicles.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-sm border border-line px-2 py-1">
              <span className="w-16 text-white">Taxi {v.id}</span>
              <span className="flex-1">
                <Meter label="Zustand" value={v.condition} color={v.condition < 30 ? 'var(--color-blood)' : 'var(--color-acid)'} />
              </span>
              <span className="num w-24 text-muted">{integer(v.mileage)} km</span>
              <span className="w-24 text-muted">{v.repairUntilTick > state.tick ? `Werkstatt ${duration(v.repairUntilTick - state.tick)}` : 'unterwegs'}</span>
              {confirmSell === v.id ? (
                <button type="button" className="btn btn-danger px-2 py-0.5" onClick={() => dispatch({ type: 'sellVehicle', buildingId: b.id, vehicleId: v.id })}>
                  Wirklich verkaufen
                </button>
              ) : (
                <button type="button" className="btn px-2 py-0.5" onClick={() => setConfirmSell(v.id)}>
                  Verkaufen
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {last && (
        <div>
          <p className="panel-title">Letzte Tagesabrechnung (Tag {last.day + 1})</p>
          <dl className="num mt-1 text-xs">
            <Row label="Fahrten / verpasst" value={`${integer(last.rides)} / ${integer(last.missed)}`} />
            <Row label="Umsatz" value={credits(last.revenue)} />
            <Row label="Kosten (Energie, Löhne, Wartung, Betrieb)" value={credits(last.costs)} />
            <Row label="Ergebnis" value={signedCredits(last.revenue - last.costs)} />
          </dl>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- retail

export function RetailOverview({ b, biz }: { b: Building; biz: RetailState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'retail') return null;
  const demand = explainRetailDemand(state, b)!;
  const hour = tickToDate(state.tick).hour;
  const last = biz.history[biz.history.length - 1];
  const clerks = biz.employees.filter((e) => e.role === 'clerk').length;
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Kunden heute" value={integer(biz.todayCustomers)} sub={biz.todayLostNoStock > 0 ? `${biz.todayLostNoStock} ohne Ware` : undefined} />
        <Kpi label="Umsatz heute" value={credits(biz.todayRevenue)} sub={`Wareneinsatz ${credits(biz.todayCogs)}`} />
        <Kpi label="Lager" value={`${Math.round(totalUnits(biz))} / ${storageCapacity(b)}`} />
        <Kpi label="Status" value={isRetailOpen(model, hour) ? 'geöffnet' : 'geschlossen'} sub={`${model.openHour}–${model.closeHour} Uhr`} />
      </div>
      <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
      <dl className="text-xs">
        <Row label="Erwartete Kunden zur Stoßzeit" value={`${demand.expectedPeakCustomers.toFixed(1)} / h`} />
        <Row label="Verkäufer" value={String(clerks)} />
        <Row label="Bürgerbesuche heute" value={String(biz.todayCitizenVisits)} />
        <Row label="Schwund heute" value={`${biz.todayShrinkage.toFixed(1)} Einheiten`} />
        <Row label="Nachfrage-Faktoren" value={`Bezirk ×${demand.district.toFixed(2)} · Preis ×${demand.price.toFixed(2)} · Ruf ×${demand.reputation.toFixed(2)} · Ausbau ×${demand.upgrades.toFixed(2)}`} />
      </dl>
      <div>
        <p className="panel-title">Sortiment und Preise</p>
        <div className="mt-1 space-y-2">
          {model.goods.map((g) => {
            const def = INGREDIENTS[g]!;
            const bounds = retailPriceBounds(g, stageEffects(b).price)!;
            const price = biz.prices[g] ?? bounds.min;
            const units = stockOf(biz, g);
            return (
              <label key={g} className="block text-xs">
                <span className="flex justify-between">
                  <span>
                    <span className="text-white">{def.name}</span> <span className={units < 5 ? 'text-amber' : 'text-muted'}>Bestand {units.toFixed(0)}</span>
                  </span>
                  <span className="num text-white">{decimal(price)} ¢</span>
                </span>
                <input type="range" min={bounds.min} max={bounds.max} step={0.1} value={price} onChange={(e) => dispatch({ type: 'setGoodPrice', buildingId: b.id, goodId: g, price: Number(e.target.value) })} className="w-full accent-[#8cff3a]" aria-label={`Preis ${def.name}`} />
              </label>
            );
          })}
        </div>
      </div>
      {last && (
        <div>
          <p className="panel-title">Letzte Tagesabrechnung (Tag {last.day + 1})</p>
          <dl className="num mt-1 text-xs">
            <Row label="Kunden" value={integer(last.customers)} />
            <Row label="Umsatz" value={credits(last.revenue)} />
            <Row label="Wareneinsatz" value={credits(last.cogs ?? 0)} />
            <Row label="Einkäufe" value={credits(last.purchases ?? 0)} />
            <Row label="Kosten gesamt" value={credits(last.costs)} />
            <Row label="Ergebnis" value={signedCredits(last.revenue - last.costs)} />
            <Row label="Schwund" value={`${Math.round(last.shrinkage ?? 0)} Einheiten`} />
          </dl>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- security

export function SecurityOverview({ b, biz }: { b: Building; biz: SecurityState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'security') return null;
  const guards = guardsOf(biz);
  const assigned = assignedGuards(biz);
  const investigators = biz.employees.filter((e) => e.role === 'investigator').length;
  const last = biz.history[biz.history.length - 1];
  const conflict = state.player.wantedLevel >= 3;
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Wachleute" value={`${assigned} / ${guards}`} sub="auf Streife" />
        <Kpi label="Ermittler" value={String(investigators)} />
        <Kpi label="Umsatz gestern" value={last ? credits(last.revenue) : '–'} sub={last ? `${last.patrols} Streifen` : undefined} />
        <Kpi label="Ruf" value={String(Math.round(biz.reputation))} />
      </div>
      {conflict && <p className="rounded-sm border border-blood/50 bg-blood/10 px-3 py-2 text-xs text-blood">Interessenkonflikt: Du stehst unter Fahndung. Ruf sinkt, bei organisierter Fahndung kündigt die Stadt alle Verträge.</p>}
      <div>
        <p className="panel-title">Streifen je Bezirk</p>
        <p className="text-xs text-muted">Die Stadt zahlt {credits(model.cityRatePerGuard)} je Wachmann und Tag (mehr in unsicheren Bezirken), Betriebe im Bezirk zahlen Verträge. Streifen senken Kriminalität und Gebietskontrolle aller Organisationen.</p>
        <ul className="mt-1 space-y-1 text-xs">
          {state.districts.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-sm border border-line px-2 py-1">
              <span className="w-36 text-white">{d.name}</span>
              <span className="num flex-1 text-muted">
                Kriminalität {Math.round(d.stats.crime)} · Polizei {Math.round(d.stats.policePresence)} · Betriebe {d.economy.venues}
              </span>
              <input type="number" min={0} max={guards} className="input w-16 px-1 py-0 text-right" value={biz.patrols[d.id] ?? 0} onChange={(e) => dispatch({ type: 'assignPatrol', buildingId: b.id, districtId: d.id, guards: Number(e.target.value) })} aria-label={`Wachleute in ${d.name}`} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="panel-title">Ermittlungen</p>
        {biz.investigation ? (
          <div className="mt-1 text-xs">
            <Meter label={`Gegen ${state.underworld.rivals[biz.investigation.familyIndex]?.name ?? '?'}`} value={Math.min(100, biz.investigation.progress)} color="var(--color-cyan)" />
          </div>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {state.underworld.rivals.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-sm border border-line px-2 py-1">
                <span>
                  <span className="text-white">{f.name}</span> <span className="num text-muted">Stärke {Math.round(f.strength)}</span>
                </span>
                <button type="button" className="btn px-2 py-0.5" disabled={investigators === 0} onClick={() => dispatch({ type: 'startInvestigation', buildingId: b.id, familyIndex: i })}>
                  Ermitteln
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">Eine abgeschlossene Ermittlung schwächt die Familie, bringt eine Prämie von 4.000 ¢ und hebt den Ruf.</p>
      </div>
    </div>
  );
}

/** Generic stock & ordering tab for gastronomy and retail. */
export function StockTab({ b, biz, goods }: { b: Building; biz: { inventory: RetailState['inventory']; orders: RetailState['orders']; autoReorder: boolean; preferredSupplierId: string; reorderTargets: Record<string, number>; upgrades: Record<string, number> }; goods: readonly string[] }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [supplierId, setSupplierId] = useState(biz.preferredSupplierId);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(goods.map((id) => [id, 0])));
  if (!state) return null;
  const supplier = SUPPLIERS[supplierId]!;
  const items = goods.map((id) => ({ ingredientId: id, units: qty[id] ?? 0 })).filter((i) => i.units > 0);
  const quote = items.length > 0 ? quoteOrder(state, supplierId, items) : null;
  const day = tickToDate(state.tick).day;
  const capacity = storageCapacity(b);
  const stock = (id: string): number => biz.inventory.filter((l) => l.ingredientId === id).reduce((s, l) => s + l.units, 0);
  const total = biz.inventory.reduce((s, l) => s + l.units, 0);
  return (
    <div className="space-y-4">
      <div>
        <p className="panel-title">
          Lager ({Math.round(total)} / {capacity})
        </p>
        <table className="num mt-1 w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="text-left font-normal">Ware</th>
              <th className="text-right font-normal">Bestand</th>
              <th className="text-right font-normal">Qualität</th>
              <th className="text-right font-normal">Ältestes Los</th>
              <th className="text-right font-normal">Nachbestellziel</th>
            </tr>
          </thead>
          <tbody>
            {goods.map((id) => {
              const lots = biz.inventory.filter((l) => l.ingredientId === id);
              const units = stock(id);
              const q = units > 0 ? lots.reduce((s, l) => s + l.quality * l.units, 0) / units : 0;
              const oldest = lots.length > 0 ? Math.min(...lots.map((l) => l.boughtDay)) : null;
              const shelf = INGREDIENTS[id]!.shelfLifeDays;
              const daysLeft = oldest !== null ? shelf - (day - oldest) : null;
              return (
                <tr key={id} className="border-t border-line/40">
                  <td className="py-1">{INGREDIENTS[id]!.name}</td>
                  <td className={`py-1 text-right ${units < 10 ? 'text-amber' : ''}`}>{units.toFixed(1)}</td>
                  <td className="py-1 text-right">{units > 0 ? Math.round(q) : '–'}</td>
                  <td className={`py-1 text-right ${daysLeft !== null && daysLeft <= 1 ? 'text-blood' : ''}`}>{daysLeft !== null ? `noch ${daysLeft} T` : '–'}</td>
                  <td className="py-1 text-right">
                    <input type="number" className="input w-20 px-1 py-0 text-right" min={0} max={999} value={biz.reorderTargets[id] ?? 0} onChange={(e) => dispatch({ type: 'setAutoReorder', buildingId: b.id, enabled: biz.autoReorder, targets: { [id]: Number(e.target.value) } })} aria-label={`Nachbestellziel ${INGREDIENTS[id]!.name}`} />
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
          {goods.map((id) => {
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
              if (dispatch({ type: 'placeOrder', buildingId: b.id, supplierId, items })) setQty(Object.fromEntries(goods.map((id) => [id, 0])));
            }}
          >
            Bestellen
          </button>
        </div>
      </div>
    </div>
  );
}
