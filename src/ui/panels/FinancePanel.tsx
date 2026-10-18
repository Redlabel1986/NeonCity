import { useSimState } from '../store/gameStore';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { formatClock, tickToDate, MINUTES_PER_DAY, START_MINUTE_OF_DAY } from '../../sim/core/clock';
import { credits, signedCredits } from '../format';
import type { TransactionCategory } from '../../sim/state';
import { CorporateSection } from './CorporateSection';

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  construction: 'Bau',
  land: 'Grundstücke',
  refund: 'Erstattungen',
  demolition: 'Abriss',
  rent: 'Miete',
  wages: 'Löhne',
  upkeep: 'Betriebskosten',
  sales: 'Verkäufe',
  ingredients: 'Zutaten',
  upgrade: 'Ausbau',
  fine: 'Strafen',
  tax: 'Steuern',
  donation: 'Spenden',
  loan: 'Kredite',
  capital: 'Kapital (Anteile, Bankrücklage)',
  interest: 'Zinsen',
  insurance: 'Versicherung',
  dividend: 'Dividenden',
  research: 'Forschung',
  gambling: 'Casino',
  other: 'Sonstiges',
};

export function FinancePanel() {
  const state = useSimState();
  if (!state) return null;
  const ledger = state.ledger;
  const date = tickToDate(state.tick);
  const dayStartTick = date.day * MINUTES_PER_DAY - START_MINUTE_OF_DAY;
  const todayByCategory = new Map<TransactionCategory, number>();
  for (const t of ledger.transactions) {
    if (t.tick < dayStartTick) continue;
    todayByCategory.set(t.category, (todayByCategory.get(t.category) ?? 0) + t.amount);
  }
  const fixedCosts = Object.values(state.buildings).reduce((sum, b) => {
    if (b.owner !== state.playerId || b.status !== 'operational') return sum;
    const def = BUILDING_DEFINITIONS[b.defId];
    const wages = b.business ? b.business.employees.reduce((w, e) => w + e.wage, 0) : 0;
    return sum + (def?.upkeepPerDay ?? 0) + wages;
  }, 0);
  const net = ledger.todayIncome - ledger.todayExpenses;
  const yesterdayNet = ledger.yesterdayIncome - ledger.yesterdayExpenses;

  return (
    <div className="text-sm">
      <dl>
        <Row label="Kontostand" value={credits(ledger.balance)} strong negative={ledger.balance < 0} />
        {ledger.dirtyBalance > 0 && <Row label="Schwarzgeld (nicht ausgebbar)" value={credits(ledger.dirtyBalance)} />}
        <Row label="Heute: Einnahmen" value={credits(ledger.todayIncome)} />
        <Row label="Heute: Ausgaben" value={credits(ledger.todayExpenses)} />
        <Row label="Heute: Ergebnis" value={signedCredits(net)} negative={net < 0} />
        <Row label="Gestern: Ergebnis" value={ledger.balanceHistory.length > 1 ? signedCredits(yesterdayNet) : '–'} negative={yesterdayNet < 0} />
        <Row label="Tägliche Fixkosten" value={credits(fixedCosts + state.player.apartmentRent)} />
        <Row label="davon Wohnungsmiete" value={credits(state.player.apartmentRent)} muted />
        {ledger.daysInDebt > 0 && <Row label="Tage im Minus" value={String(ledger.daysInDebt)} negative />}
      </dl>

      {todayByCategory.size > 0 && (
        <div className="mt-4">
          <p className="panel-title">Heute nach Kategorie</p>
          <dl className="mt-1">
            {[...todayByCategory.entries()]
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .map(([cat, amount]) => (
                <Row key={cat} label={CATEGORY_LABELS[cat]} value={signedCredits(amount)} negative={amount < 0} />
              ))}
          </dl>
        </div>
      )}

      <div className="mt-4">
        <p className="panel-title">Letzte Buchungen</p>
        <ul className="mt-1 text-xs">
          {ledger.transactions.length === 0 && <li className="text-muted">Noch keine Buchungen.</li>}
          {[...ledger.transactions]
            .reverse()
            .slice(0, 60)
            .map((t, i) => {
              const d = tickToDate(t.tick);
              return (
                <li key={`${t.tick}-${i}`} className="flex gap-2 border-b border-line/40 py-1">
                  <span className="num shrink-0 text-muted">
                    T{d.day + 1} {formatClock(d)}
                  </span>
                  <span className="flex-1 truncate" title={t.description}>
                    {t.description}
                  </span>
                  <span className={`num shrink-0 ${t.amount < 0 ? 'text-blood' : 'text-acid'}`}>{signedCredits(t.amount)}</span>
                </li>
              );
            })}
        </ul>
      </div>
      <CorporateSection />
    </div>
  );
}

function Row({ label, value, strong, negative, muted }: { label: string; value: string; strong?: boolean; negative?: boolean; muted?: boolean }) {
  return (
    <div className="stat-row">
      <dt className={muted ? 'text-muted/70' : 'text-muted'}>{label}</dt>
      <dd className={`num text-right ${negative ? 'text-blood' : strong ? 'font-medium text-white' : muted ? 'text-muted' : ''}`}>{value}</dd>
    </div>
  );
}
