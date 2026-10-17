import { useGameStore, useSimState } from '../store/gameStore';
import { ROLE_LABELS } from '../../sim/systems/staff';
import { credits, integer } from '../format';

/** All employees across the player's businesses. */
export function StaffPanel() {
  const state = useSimState();
  const openDashboard = useGameStore((s) => s.openDashboard);
  if (!state) return null;
  const businesses = Object.values(state.buildings).filter((b) => b.owner === 'player' && b.business);
  const employees = businesses.flatMap((b) => b.business!.employees.map((e) => ({ e, b })));
  const candidates = businesses.reduce((n, b) => n + b.business!.candidates.length, 0);
  const wages = employees.reduce((s, x) => s + x.e.wage, 0);
  if (businesses.length === 0) return <p className="text-sm text-muted">Noch keine Betriebe, also auch kein Personal.</p>;
  return (
    <div className="text-sm">
      <div className="num mb-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Mitarbeiter</span>
          <span className="block font-medium text-white">{employees.length}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Lohnkosten / Tag</span>
          <span className="block font-medium text-white">{credits(wages)}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Bewerber</span>
          <span className="block font-medium text-white">{integer(candidates)}</span>
        </div>
      </div>
      <table className="w-full text-xs">
        <caption className="sr-only">Mitarbeiter</caption>
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal">Name</th>
            <th className="py-1 text-left font-normal">Rolle</th>
            <th className="py-1 text-left font-normal">Betrieb</th>
            <th className="num py-1 text-right font-normal">Fähigkeit</th>
            <th className="num py-1 text-right font-normal">Moral</th>
            <th className="num py-1 text-right font-normal">Lohn</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(({ e, b }) => (
            <tr key={`${b.id}-${e.id}`} className="border-t border-line/60">
              <td className="py-1 text-white">{e.name}</td>
              <td className="py-1">{ROLE_LABELS[e.role]}</td>
              <td className="py-1">
                <button type="button" className="text-cyan hover:underline" onClick={() => openDashboard(b.id)}>
                  {b.label}
                </button>
              </td>
              <td className="num py-1 text-right">{Math.round(e.skill)}</td>
              <td className={`num py-1 text-right ${e.morale < 25 ? 'text-blood' : ''}`}>{Math.round(e.morale)}</td>
              <td className="num py-1 text-right">{credits(e.wage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Einstellen, entlassen und Löhne anpassen im Dashboard des jeweiligen Betriebs.</p>
    </div>
  );
}
