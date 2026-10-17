import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { dailyRent, isResidential, propertyPrice } from '../../sim/systems/property';
import { credits, duration, integer, signedCredits } from '../format';
import { Meter } from '../components/Inspector';

export function RealEstatePanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const focusBuilding = useGameStore((s) => s.focusBuilding);
  const [confirmSell, setConfirmSell] = useState<number | null>(null);
  if (!state) return null;
  const owned = Object.values(state.buildings).filter((b) => b.owner === 'player' && b.property);
  const totalRent = owned.reduce((s, b) => s + dailyRent(state, b), 0);
  const totalUpkeep = owned.reduce((s, b) => s + b.floors * b.w * b.h * 4, 0);
  const competitors = Object.values(state.competitors).slice(0, 8);
  return (
    <div className="text-sm">
      <p className="text-xs text-muted">
        Klicke ein Stadtgebäude an und kaufe es im Inspektor. Wohngebäude bringen Miete von den Bürgern, die dort leben; Gewerbe zahlt Pacht. Zustand und Mietniveau
        entscheiden, ob Mieter bleiben.
      </p>
      <div className="num my-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Immobilien</span>
          <span className="block font-medium text-white">{owned.length}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Miete / Tag</span>
          <span className="block font-medium text-white">{credits(totalRent)}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Instandhaltung / Tag</span>
          <span className="block font-medium text-white">{credits(totalUpkeep)}</span>
        </div>
      </div>
      {owned.length === 0 && <p className="text-muted">Du besitzt noch keine Immobilie.</p>}
      <ul className="space-y-2">
        {owned.map((b) => {
          const p = b.property!;
          const rent = dailyRent(state, b);
          const renovating = p.renovationUntilTick > state.tick;
          return (
            <li key={b.id} className="rounded-sm border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button type="button" className="font-medium text-white hover:underline" onClick={() => focusBuilding(b.id)}>
                    {b.label}
                  </button>
                  <p className="text-xs text-muted">
                    {state.districts[b.districtId]!.name} · {isResidential(b) ? `${p.tenants} Mieter` : 'Gewerbe'} · gekauft für {credits(p.purchasePrice)}
                  </p>
                </div>
                <span className={`num text-sm ${rent > 0 ? 'text-acid' : 'text-muted'}`}>{renovating ? `Renovierung ${duration(p.renovationUntilTick - state.tick)}` : `${signedCredits(rent)}/Tag`}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <Meter label="Zustand" value={p.condition} color={p.condition < 40 ? 'var(--color-blood)' : 'var(--color-cyan)'} />
                <label className="block">
                  <span className="flex justify-between text-muted">
                    <span>Mietniveau</span>
                    <span className="num">×{p.rentLevel.toFixed(2)}</span>
                  </span>
                  <input type="range" min={0.6} max={1.6} step={0.05} value={p.rentLevel} onChange={(e) => dispatch({ type: 'setRentLevel', buildingId: b.id, level: Number(e.target.value) })} className="w-full accent-[#ffb020]" aria-label={`Mietniveau ${b.label}`} />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button type="button" className="btn px-2 py-0.5" disabled={renovating || p.condition >= 95} onClick={() => dispatch({ type: 'renovate', buildingId: b.id })}>
                  Renovieren ({credits(b.floors * b.w * b.h * 120)})
                </button>
                {confirmSell === b.id ? (
                  <button type="button" className="btn btn-danger px-2 py-0.5" onClick={() => dispatch({ type: 'sellProperty', buildingId: b.id })}>
                    Wirklich verkaufen
                  </button>
                ) : (
                  <button type="button" className="btn px-2 py-0.5" onClick={() => setConfirmSell(b.id)}>
                    Verkaufen
                  </button>
                )}
                <span className="num self-center text-muted">Lebenszeit-Miete {credits(p.lifetimeRent)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {competitors.length > 0 && (
        <div className="mt-4">
          <p className="panel-title">Übernahmekandidaten (Konkurrenzlokale)</p>
          <ul className="mt-1 text-xs">
            {competitors.map((c) => {
              const b = state.buildings[c.buildingId];
              if (!b) return null;
              return (
                <li key={c.buildingId} className="flex items-center justify-between gap-2 border-t border-line/40 py-1">
                  <span>
                    <button type="button" className="text-white hover:underline" onClick={() => focusBuilding(c.buildingId)}>
                      {c.name}
                    </button>
                    <span className="block text-muted">
                      {state.districts[c.districtId]!.name} · Ruf {Math.round(c.reputation)} · Gäste gestern {integer(c.history[c.history.length - 1]?.served ?? 0)}
                    </span>
                  </span>
                  <button type="button" className="btn btn-primary px-2 py-0.5" onClick={() => dispatch({ type: 'takeoverCompetitor', buildingId: c.buildingId })}>
                    Übernehmen ({credits(propertyPrice(state, b))})
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
