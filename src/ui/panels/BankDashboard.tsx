import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import type { BankState, Building } from '../../sim/state';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { BANK_RATE_BOUNDS, balanceSheetLimit, explainBank, RESERVE_RATIO } from '../../sim/systems/bank';
import { credits, integer, percent, signedCredits } from '../format';
import { Meter, Row } from '../components/Inspector';
import { Kpi } from './KindDashboards';

function rate(v: number): string {
  return `${(v * 100).toFixed(3)} % / Tag`;
}

export function BankOverview({ b, biz }: { b: Building; biz: BankState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [amount, setAmount] = useState(10000);
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  if (!model || model.kind !== 'bank') return null;
  const outlook = explainBank(state, b)!;
  const limit = balanceSheetLimit(b, biz, model);
  const last = biz.history[biz.history.length - 1];
  const ratio = biz.deposits > 0 ? biz.reserve / biz.deposits : 1;
  return (
    <div className="space-y-4" data-testid="bank-overview">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Rücklage" value={credits(biz.reserve)} sub={`Quote ${percent(Math.min(999, ratio * 100))}`} />
        <Kpi label="Einlagen" value={credits(biz.deposits)} sub={`Limit ${credits(limit)}`} />
        <Kpi label="Kredite" value={credits(biz.loansOut)} sub={`Nachfrage ${credits(outlook.loanDemand)}`} />
        <Kpi label="Gestern" value={last ? signedCredits(last.revenue - last.costs) : '–'} sub={last ? `Ausfälle ${credits(last.defaults)}` : undefined} />
      </div>
      {biz.supervised && <p className="rounded-sm border border-blood/60 bg-blood/10 p-2 text-xs text-blood">Bankenaufsicht: Die Rücklage liegt unter {Math.round(RESERVE_RATIO * 100)} % der Einlagen. Neue Einlagen sind gestoppt, bis du Kapital einzahlst.</p>}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Meter label="Ruf" value={biz.reputation} color="var(--color-magenta)" />
        <Meter label="Auslastung der Bilanz" value={limit > 0 ? (biz.deposits / limit) * 100 : 0} color="var(--color-amber)" />
      </div>
      <label className="block text-sm">
        <span className="flex justify-between">
          <span className="text-muted">Einlagenzins</span>
          <span className="num text-white">{rate(biz.depositRate)}</span>
        </span>
        <input type="range" min={BANK_RATE_BOUNDS.deposit.min * 1e4} max={BANK_RATE_BOUNDS.deposit.max * 1e4} step={1} value={Math.round(biz.depositRate * 1e4)} onChange={(e) => dispatch({ type: 'setBankRates', buildingId: b.id, depositRate: Number(e.target.value) / 1e4, loanRate: biz.loanRate })} className="mt-1 w-full accent-[#19e6ff]" aria-label="Einlagenzins" />
        <span className="num block text-xs text-muted">Markt zahlt {rate(model.marketDepositRate)}. Mehr Zins zieht Einlagen an, kostet aber täglich.</span>
      </label>
      <label className="block text-sm">
        <span className="flex justify-between">
          <span className="text-muted">Kreditzins</span>
          <span className="num text-white">{rate(biz.loanRate)}</span>
        </span>
        <input type="range" min={BANK_RATE_BOUNDS.loan.min * 1e4} max={BANK_RATE_BOUNDS.loan.max * 1e4} step={1} value={Math.round(biz.loanRate * 1e4)} onChange={(e) => dispatch({ type: 'setBankRates', buildingId: b.id, depositRate: biz.depositRate, loanRate: Number(e.target.value) / 1e4 })} className="mt-1 w-full accent-[#ffb020]" aria-label="Kreditzins" />
        <span className="num block text-xs text-muted">Markt verlangt {rate(model.marketLoanRate)}. Hohe Zinsen bringen weniger Kreditnehmer und mehr Ausfälle.</span>
      </label>
      <dl className="text-xs">
        <Row label="Erwartete Zinseinnahmen" value={`${credits(outlook.dailyInterestIncome)} / Tag`} />
        <Row label="Erwartete Zinskosten" value={`${credits(outlook.dailyInterestCost)} / Tag`} />
        <Row label="Erwartete Ausfälle" value={`${credits(outlook.expectedDefaults)} / Tag`} />
        <Row label="Erwarteter Einlagenzufluss" value={`${credits(outlook.inflow)} / Tag (Abfluss ${credits(outlook.outflow)})`} />
        <Row label="Bankkaufleute / Analysten" value={`${integer(biz.employees.filter((e) => e.role === 'banker').length)} / ${integer(biz.employees.filter((e) => e.role === 'analyst').length)}`} />
      </dl>
      <div className="rounded-sm border border-line p-3 text-xs">
        <p className="panel-title">Kapital</p>
        <p className="mt-1 text-muted">Die Rücklage ist dein Geld in der Bank. Sie deckt {Math.round(RESERVE_RATIO * 100)} % der Einlagen und begrenzt mit dem Hebel ×{model.leverage} die Bilanz. Beim Schließen kommt sie zurück, Kredite werden mit Abschlag verkauft, Einlagen ausgezahlt.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="input w-32" type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Betrag" />
          <button type="button" className="btn" onClick={() => dispatch({ type: 'bankCapital', buildingId: b.id, amount })}>
            Einzahlen
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'bankCapital', buildingId: b.id, amount: -amount })}>
            Entnehmen
          </button>
        </div>
      </div>
    </div>
  );
}
