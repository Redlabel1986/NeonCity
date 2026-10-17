import { Dialog } from './Dialog';
import { useGameStore } from '../store/gameStore';
import { credits, signedCredits } from '../format';
import { describeElapsed } from '../../sim/catchup';
import { MINUTES_PER_DAY } from '../../sim/core/clock';

/** "While you were away": what the catch-up simulation produced. */
export function CatchUpDialog({ onClose }: { onClose: () => void }) {
  const report = useGameStore((s) => s.catchUpReport);
  const days = useGameStore((s) => s.settings.offlineProgressDays);
  if (!report) return null;
  const net = report.income - report.expenses;
  const simulatedDays = report.ticks / MINUTES_PER_DAY;
  return (
    <Dialog title="Während du weg warst" onClose={onClose}>
      <div className="space-y-3 text-sm" data-testid="catchup-report">
        <p className="text-muted">
          Du warst {describeElapsed(report.elapsedMs)} weg. Die Stadt lief weiter: {simulatedDays >= 1 ? `${simulatedDays.toFixed(simulatedDays % 1 === 0 ? 0 : 1)} Spieltage` : `${report.ticks} Spielminuten`} wurden nachgerechnet
          {report.capped ? `, begrenzt auf ${days} Tage (Einstellungen → Weiterlaufen).` : '.'}
        </p>
        <dl className="num grid grid-cols-2 gap-x-6 gap-y-1">
          <dt className="text-muted">Abgeschlossene Tage</dt>
          <dd className="text-right text-white">{report.days}</dd>
          <dt className="text-muted">Einnahmen</dt>
          <dd className="text-right text-acid">{credits(report.income)}</dd>
          <dt className="text-muted">Ausgaben</dt>
          <dd className="text-right text-blood">{credits(report.expenses)}</dd>
          <dt className="text-muted">Ergebnis</dt>
          <dd className={`text-right ${net >= 0 ? 'text-acid' : 'text-blood'}`}>{signedCredits(net)}</dd>
          <dt className="text-muted">Kontostand</dt>
          <dd className="text-right text-white">
            {credits(report.startBalance)} → {credits(report.endBalance)}
          </dd>
          {report.completedBuildings > 0 && (
            <>
              <dt className="text-muted">Fertiggestellte Gebäude</dt>
              <dd className="text-right text-white">{report.completedBuildings}</dd>
            </>
          )}
        </dl>
        {report.notable.length > 0 && (
          <div>
            <p className="panel-title">Wichtige Ereignisse</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {report.notable.map((n, i) => (
                <li key={i} className={n.level === 'danger' ? 'text-blood' : n.level === 'warning' ? 'text-amber' : 'text-acid'}>
                  {n.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            Weiter
          </button>
        </div>
      </div>
    </Dialog>
  );
}
