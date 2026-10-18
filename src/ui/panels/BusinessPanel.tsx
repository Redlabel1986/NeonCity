import { useGameStore, useSimState } from '../store/gameStore';
import { credits, integer } from '../format';

export function BusinessPanel() {
  const state = useSimState();
  const focusBuilding = useGameStore((s) => s.focusBuilding);
  const openDashboard = useGameStore((s) => s.openDashboard);
  const setPanel = useGameStore((s) => s.setPanel);
  if (!state) return null;
  const mine = Object.values(state.buildings).filter((b) => b.owner === state.playerId);
  const competitors = Object.values(state.competitors).sort((a, b) => b.reputation - a.reputation);
  if (mine.length === 0) {
    return (
      <div className="text-sm">
        <p className="text-muted">Du besitzt noch kein Unternehmen.</p>
        <button type="button" className="btn btn-primary mt-3" onClick={() => setPanel('build')}>
          Erstes Gebäude bauen
        </button>
      </div>
    );
  }
  const totals = mine.reduce(
    (acc, b) => {
      if (!b.business) return acc;
      acc.guests += activityOf(b.business);
      acc.revenue += 'todayRevenue' in b.business ? b.business.todayRevenue : 0;
      return acc;
    },
    { guests: 0, revenue: 0 },
  );
  return (
    <div className="text-sm">
      <div className="num mb-3 grid grid-cols-3 gap-2 text-center">
        <Tile label="Standorte" value={String(mine.length)} />
        <Tile label="Gäste/Kunden/Fahrten heute" value={integer(totals.guests)} />
        <Tile label="Umsatz heute" value={credits(totals.revenue)} />
      </div>
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Eigene Unternehmen</caption>
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-normal">Name</th>
            <th className="py-1 font-normal">Status</th>
            <th className="num py-1 text-right font-normal">Gäste</th>
            <th className="num py-1 text-right font-normal">Sterne</th>
            <th className="num py-1 text-right font-normal">Ruf</th>
          </tr>
        </thead>
        <tbody>
          {mine.map((b) => (
            <tr key={b.id} className="border-t border-line/60">
              <td className="py-1.5">
                <button type="button" className="text-left text-white hover:underline" onClick={() => focusBuilding(b.id)}>
                  {b.label}
                </button>
                {b.status === 'operational' && b.business && (
                  <button type="button" className="ml-2 text-cyan hover:underline" onClick={() => openDashboard(b.id)}>
                    Verwalten
                  </button>
                )}
                <span className="block text-muted">{state.districts[b.districtId]!.name}</span>
              </td>
              <td className="py-1.5">
                {b.status === 'construction' ? (
                  <span className="text-amber">Bau {Math.round((b.progress / b.buildTime) * 100)} %</span>
                ) : (
                  <span className="text-acid">in Betrieb</span>
                )}
              </td>
              <td className="num py-1.5 text-right">{b.business ? integer(activityOf(b.business)) : '–'}</td>
              <td className="num py-1.5 text-right">{b.business && 'reviewCount' in b.business && b.business.reviewCount > 0 ? b.business.rating.toFixed(1) : '–'}</td>
              <td className="num py-1.5 text-right">{b.business ? Math.round(b.business.reputation) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Wähle einen Standort, um Preis, Nachfrage und Tageszahlen im Inspektor zu sehen.</p>
      <CompetitorList competitors={competitors} />
    </div>
  );
}

function CompetitorList({ competitors }: { competitors: import('../../sim/state').Competitor[] }) {
  const state = useSimState();
  const focusBuilding = useGameStore((s) => s.focusBuilding);
  if (!state || competitors.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="panel-title">Konkurrenz ({competitors.length} Betriebe)</p>
      <table className="mt-1 w-full text-xs">
        <caption className="sr-only">Konkurrenzbetriebe</caption>
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal">Name</th>
            <th className="py-1 text-left font-normal">Bezirk</th>
            <th className="num py-1 text-right font-normal">Preisniveau</th>
            <th className="num py-1 text-right font-normal">Ruf</th>
            <th className="num py-1 text-right font-normal">Gäste gestern</th>
          </tr>
        </thead>
        <tbody>
          {competitors.slice(0, 15).map((c) => (
            <tr key={c.buildingId} className="border-t border-line/40">
              <td className="py-1">
                <button type="button" className="text-left hover:underline" onClick={() => focusBuilding(c.buildingId)}>
                  {c.name}
                </button>
              </td>
              <td className="py-1 text-muted">{state.districts[c.districtId]?.name}</td>
              <td className="num py-1 text-right">×{c.priceLevel.toFixed(2)}</td>
              <td className="num py-1 text-right">{Math.round(c.reputation)}</td>
              <td className="num py-1 text-right">{c.history[c.history.length - 1]?.served ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Today's guests, customers, check-ins or rides depending on the business kind. */
function activityOf(biz: import('../../sim/state').BusinessState): number {
  switch (biz.kind) {
    case 'gastronomy':
      return biz.todayGuests;
    case 'hotel':
      return biz.todayCheckIns;
    case 'transport':
      return biz.todayRides;
    case 'retail':
      return biz.todayCustomers;
    case 'security':
      return Object.values(biz.patrols).reduce((s, n) => s + n, 0);
    case 'lab':
      return biz.history[biz.history.length - 1]?.points ?? 0;
    case 'industry':
      return Object.values(biz.todayProduced).reduce((s, n) => s + n, 0);
    case 'bank':
      return Math.round(biz.deposits);
  }
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line px-2 py-1.5">
      <span className="block text-[0.65rem] text-muted">{label}</span>
      <span className="block font-medium text-white">{value}</span>
    </div>
  );
}
