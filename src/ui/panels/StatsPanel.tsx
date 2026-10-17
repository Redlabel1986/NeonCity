import { useSimState } from '../store/gameStore';
import { Sparkline } from '../components/Sparkline';
import { credits, integer } from '../format';

export function StatsPanel() {
  const state = useSimState();
  if (!state) return null;
  const history = state.ledger.balanceHistory;
  const businesses = Object.values(state.buildings).filter((b) => b.owner === state.playerId && b.business?.kind === 'gastronomy' && b.business.history.length > 0);
  const others = Object.values(state.buildings).filter((b) => b.owner === state.playerId && b.business && b.business.kind !== 'gastronomy' && b.business.history.length > 1);
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="panel-title">Kontostand je Tag</h3>
        <div className="mt-2">
          <Sparkline values={history.map((h) => h.balance)} labels={history.map((h) => `Tag ${h.day + 1}`)} format={credits} ariaLabel="Kontostand" />
        </div>
      </section>
      {businesses.map((b) => {
        const biz = b.business as import('../../sim/state').GastronomyState;
        return (
          <section key={b.id}>
            <h3 className="panel-title">{b.label}: Gäste je Tag</h3>
            <div className="mt-2">
              <Sparkline values={biz.history.map((h) => h.guests)} labels={biz.history.map((h) => `Tag ${h.day + 1}`)} format={integer} color="var(--color-magenta)" ariaLabel={`Gäste ${b.label}`} />
            </div>
            <table className="num mt-2 w-full text-xs">
              <caption className="sr-only">Tageswerte {b.label}</caption>
              <thead className="text-muted">
                <tr>
                  <th className="text-left font-normal">Tag</th>
                  <th className="text-right font-normal">Gäste</th>
                  <th className="text-right font-normal">Umsatz</th>
                  <th className="text-right font-normal">Kosten</th>
                  <th className="text-right font-normal">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {[...biz.history]
                  .reverse()
                  .slice(0, 7)
                  .map((h) => (
                    <tr key={h.day} className="border-t border-line/40">
                      <td className="py-0.5">{h.day + 1}</td>
                      <td className="py-0.5 text-right">{integer(h.guests)}</td>
                      <td className="py-0.5 text-right">{credits(h.revenue)}</td>
                      <td className="py-0.5 text-right">{credits(h.costs)}</td>
                      <td className={`py-0.5 text-right ${h.revenue - h.costs < 0 ? 'text-blood' : 'text-acid'}`}>{credits(h.revenue - h.costs)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {others.map((b) => {
        const h = b.business!.history as { day: number; revenue: number; costs: number }[];
        return (
          <section key={b.id}>
            <h3 className="panel-title">{b.label}: Tagesergebnis</h3>
            <div className="mt-2">
              <Sparkline values={h.map((x) => x.revenue - x.costs)} labels={h.map((x) => `Tag ${x.day + 1}`)} format={credits} color="var(--color-amber)" ariaLabel={`Ergebnis ${b.label}`} />
            </div>
          </section>
        );
      })}
      {businesses.length === 0 && others.length === 0 && <p className="text-xs text-muted">Sobald ein Betrieb seinen ersten Tag abgeschlossen hat, erscheinen hier seine Zeitreihen.</p>}
    </div>
  );
}
