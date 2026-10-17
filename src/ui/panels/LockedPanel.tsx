import type { Panel } from '../store/gameStore';

const DESCRIPTIONS: Partial<Record<NonNullable<Panel>, string>> = {
  realestate: 'Grundstücke pachten, Gebäude kaufen, vermieten und verkaufen. Kommt mit dem Immobiliensystem.',
  staff: 'Mitarbeiter mit Fähigkeiten, Löhnen und Zufriedenheit einstellen, befördern und entlassen. Kommt mit dem vollständigen Ramenbar-Slice.',
};

export function LockedPanel({ panel, phase }: { panel: NonNullable<Panel>; phase: number }) {
  return (
    <div className="text-sm">
      <p className="rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-amber">Noch nicht verfügbar – geplant für Entwicklungsphase {phase}.</p>
      <p className="mt-3 text-muted">{DESCRIPTIONS[panel] ?? 'Dieses System ist in Vorbereitung.'}</p>
      <p className="mt-3 text-xs text-muted">Die Architektur ist dafür vorbereitet; die Daten des Bezirks (Kriminalität, Korruption, politischer Einfluss) werden bereits simuliert und im Stadt-Panel angezeigt.</p>
    </div>
  );
}
