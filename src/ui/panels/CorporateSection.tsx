import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { INSURANCE_POLICIES, loanLimit, loanRate, valuation, megacorpProgress, MEGACORP_VALUATION, MEGACORP_BUSINESSES, MEGACORP_KINDS } from '../../sim/systems/corporate';
import { CRISES } from '../../sim/data/crises';
import { credits, percent } from '../format';
import { Row } from '../components/Inspector';
import { tickToDate } from '../../sim/core/clock';

/** Loans, investors, insurance, valuation and crises inside the finance panel. */
export function CorporateSection() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [loanAmount, setLoanAmount] = useState(5000);
  const [share, setShare] = useState(10);
  const [chainDistrict, setChainDistrict] = useState(0);
  const [confirmSell, setConfirmSell] = useState(false);
  const setDialog = useGameStore((s) => s.setDialog);
  if (!state) return null;
  const progress = megacorpProgress(state);
  const corp = state.corporate;
  const value = valuation(state);
  const limit = loanLimit(state);
  const rate = loanRate(state);
  const day = tickToDate(state.tick).day;
  const crisis = state.crisis.active ? CRISES[state.crisis.active.id] : null;
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="panel-title">{corp.name}</p>
        <dl className="num mt-1 text-xs">
          <Row label="Unternehmensbewertung" value={credits(value)} />
          <Row label="Anteile bei Investoren" value={percent(corp.sharesSold * 100)} />
          <Row label="Dividenden gezahlt" value={credits(corp.lifetimeDividends)} />
          {corp.insolvencyDays > 0 && <Row label="Insolvenzverfahren" value={`Tag ${corp.insolvencyDays} von 3`} />}
          <Row label="Karriere" value={`Nr. ${corp.careers}`} />
        </dl>
      </div>
      <div>
        <p className="panel-title">{corp.megacorp ? 'Megakonzern' : 'Weg zum Megakonzern'}</p>
        {corp.megacorp ? (
          <div className="mt-1 text-xs">
            <p className="text-acid">Seit Tag {corp.megacorpSinceDay + 1}. Fabriken beliefern Konkurrenten über Lieferverträge (95 % statt 85 %); Kettenübernahmen sind möglich.</p>
            <div className="mt-1 flex items-center gap-2">
              <select className="input w-auto py-0" value={chainDistrict} onChange={(e) => setChainDistrict(Number(e.target.value))} aria-label="Bezirk für Kettenübernahme">
                {state.districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {Object.values(state.competitors).filter((c) => c.districtId === d.id).length} Lokale
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary px-2 py-0.5" onClick={() => dispatch({ type: 'chainTakeover', districtId: chainDistrict })}>
                Kette übernehmen
              </button>
            </div>
            {corp.chainTakeoverCooldownDay > day && <p className="text-amber">Kartellprüfung bis Tag {corp.chainTakeoverCooldownDay + 1}.</p>}
          </div>
        ) : (
          <dl className="num mt-1 text-xs">
            <Row label="Bewertung" value={`${credits(progress.valuation)} / ${credits(MEGACORP_VALUATION)}`} />
            <Row label="Betriebe in Betrieb" value={`${progress.businesses} / ${MEGACORP_BUSINESSES}`} />
            <Row label="Branchen" value={`${progress.kinds} / ${MEGACORP_KINDS}`} />
          </dl>
        )}
      </div>
      <div>
        <p className="panel-title">Karriere</p>
        <p className="text-xs text-muted">Verkauft alle Betriebe und Immobilien zu 90 % ihres Werts, tilgt Kredite und löst die Organisation auf. Danach kannst du mit neuem Hintergrund in derselben Stadt neu beginnen.</p>
        {confirmSell ? (
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="btn btn-danger px-2 py-0.5"
              onClick={() => {
                if (dispatch({ type: 'sellCompany' })) setDialog('career');
                setConfirmSell(false);
              }}
            >
              Wirklich alles verkaufen
            </button>
            <button type="button" className="btn px-2 py-0.5" onClick={() => setConfirmSell(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button type="button" className="btn mt-1 px-2 py-0.5" onClick={() => setConfirmSell(true)}>
            Unternehmensgruppe verkaufen
          </button>
        )}
      </div>
      {crisis && (
        <p className="rounded-sm border border-blood/50 bg-blood/10 px-3 py-2 text-xs text-blood">
          Krise: {crisis.name} (bis Tag {state.crisis.active!.endDay + 1}). {crisis.description}
        </p>
      )}
      <div>
        <p className="panel-title">Kredite</p>
        <p className="num text-xs text-muted">
          Rahmen {credits(limit)} · Zins {(rate * 100).toFixed(2)} % pro Tag · Rate 1/40 des Betrags pro Tag
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <input type="number" min={1000} step={1000} className="input w-28" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} aria-label="Kreditbetrag" />
          <button type="button" className="btn" onClick={() => dispatch({ type: 'takeLoan', amount: loanAmount })}>
            Kredit aufnehmen
          </button>
        </div>
        <ul className="mt-1 text-xs">
          {corp.loans.map((l) => (
            <li key={l.id} className="flex items-center justify-between border-t border-line/40 py-1">
              <span className="num">
                Rest {credits(l.remaining)} von {credits(l.principal)} · {(l.dailyRate * 100).toFixed(2)} %/Tag · Rate {credits(l.installment)}
              </span>
              <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'repayLoan', loanId: l.id, amount: l.remaining })}>
                Ablösen
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="panel-title">Investoren</p>
        <p className="text-xs text-muted">Anteile verkaufen bringt sofort Kapital (90 % des Werts); Investoren bekommen ihren Anteil am täglichen Gewinn. Rückkauf kostet 110 %.</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <input type="number" min={1} max={49} className="input w-20" value={share} onChange={(e) => setShare(Number(e.target.value))} aria-label="Anteil in Prozent" />
          <span className="text-muted">%</span>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'sellShares', share: share / 100 })}>
            Verkaufen (≈ {credits(Math.round((value * share) / 100 * 0.9))})
          </button>
          <button type="button" className="btn" disabled={corp.sharesSold <= 0} onClick={() => dispatch({ type: 'buyBackShares', share: Math.min(corp.sharesSold, share / 100) })}>
            Zurückkaufen
          </button>
        </div>
      </div>
      <div>
        <p className="panel-title">Versicherungen</p>
        <ul className="mt-1 space-y-1 text-xs">
          {Object.values(INSURANCE_POLICIES).map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 accent-[#19e6ff]" checked={!!corp.insurance[p.id]} onChange={(e) => dispatch({ type: 'setInsurance', policyId: p.id, active: e.target.checked })} aria-label={p.name} />
              <span>
                <span className="text-white">{p.name}</span> <span className="num text-muted">{credits(p.premiumPerDay)}/Tag</span>
                <span className="block text-muted">{p.description}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="num mt-1 text-xs text-muted">
          Prämien gezahlt {credits(corp.lifetimePremiums)} · Leistungen erhalten {credits(corp.lifetimeClaims)}
        </p>
      </div>
      {state.crisis.history.length > 0 && (
        <p className="text-xs text-muted">
          Vergangene Krisen: {state.crisis.history.map((h) => `${CRISES[h.id]?.name} (Tag ${h.startDay + 1}–${h.endDay + 1})`).join(', ')}
        </p>
      )}
      <p className="text-xs text-muted">Tag {day + 1}: Zahlungsunfähigkeit droht ab {credits(-(5000 + corp.lastValuation * 0.2))}; nach drei Tagen werden Vermögenswerte zwangsverkauft.</p>
    </div>
  );
}
