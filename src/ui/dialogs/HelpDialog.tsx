import { Dialog } from './Dialog';
import { useGameStore, type KeyBindings } from '../store/gameStore';

function label(key: string): string {
  return key === ' ' ? 'Leertaste' : key.length === 1 ? key.toUpperCase() : key;
}

const STATIC_KEYS: [string, string][] = [
  ['Linke Maustaste', 'Auswählen / Gebäude platzieren'],
  ['Ziehen', 'Karte verschieben'],
  ['Mausrad', 'Zoomen'],
  ['Rechte Maustaste', 'Platzierung abbrechen / Auswahl aufheben'],
  ['Q / E', 'Gebäude bei der Platzierung drehen (Eingang zur Straße)'],
  ['J', 'Royal Nova Casino: Slots, Roulette und Blackjack um eigene Credits'],
  ['Esc', 'Innenansicht verlassen, Platzierung abbrechen, Panel oder Dialog schließen'],
  ['Online', 'Zeit, Pause und Speichern übernimmt der Server; F5/F9 und Geschwindigkeit sind dann ohne Wirkung'],
  ['W A S D, Pfeile', 'Karte verschieben'],
  ['+ / −', 'Zoomen'],
  ['Pos1', 'Kamera zu deinem Wohnbezirk'],
  ['0', 'Pause'],
  ['Strg + Z', 'Letzte Baustelle rückgängig'],
  ['F5 / F9', 'Schnellspeichern / Schnellladen'],
  ['Esc', 'Abbrechen / Schließen'],
];

const BOUND: [keyof KeyBindings, string][] = [
  ['pause', 'Pause'],
  ['speed1', 'Geschwindigkeit 1×'],
  ['speed2', 'Geschwindigkeit 3×'],
  ['speed3', 'Geschwindigkeit 8×'],
  ['build', 'Bauen'],
  ['business', 'Unternehmen'],
  ['finance', 'Finanzen'],
  ['city', 'Stadt'],
  ['stats', 'Statistik'],
  ['staff', 'Personal'],
  ['realestate', 'Immobilien'],
  ['underworld', 'Unterwelt'],
  ['factions', 'Fraktionen'],
  ['politics', 'Politik'],
  ['research', 'Forschung'],
  ['help', 'Diese Hilfe'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const bindings = useGameStore((s) => s.settings.keybindings);
  const KEYS: [string, string][] = [...STATIC_KEYS, ...BOUND.map(([id, text]) => [label(bindings[id]), text] as [string, string])];
  return (
    <Dialog title="Hilfe" onClose={onClose}>
      <div className="grid gap-6 text-sm md:grid-cols-2">
        <section>
          <h3 className="panel-title">So funktioniert das Spiel</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-text/90">
            <li>Öffne das Baumenü und platziere einen Asia-Imbiss oder einen Streetfood-Stand auf einem freien Grundstück an einer Straße.</li>
            <li>Grundstück und Bau kosten sofort Credits; die Baustelle braucht Zeit. Solange sie läuft, kannst du sie kostenlos zurücknehmen.</li>
            <li>Nach der Eröffnung kommen Gäste zu den Öffnungszeiten. Bezirk, Verkehr, Kaufkraft, Konkurrenz, Preis und Ruf bestimmen, wie viele.</li>
            <li>Jede Stunde werden Verkäufe und Zutaten gebucht, um Mitternacht Löhne, Betriebskosten und deine Wohnungsmiete.</li>
            <li>Im Dashboard verwaltest du Speisekarte, Einkauf, Personal und Ausbau. Zu teuer kostet Gäste und Ruf, zu billig frisst die Marge.</li>
            <li>Bis zu 2.400 Bürger wählen Lokale nach Ruf, Preis, Loyalität und Entfernung. KI-Lokale konkurrieren, eröffnen und schließen.</li>
            <li>Weitere Branchen: Kapsel- und Businesshotel (Zimmer, Komfort, Housekeeping), Taxidepot (Fahrzeuge, Fahrer, Tarif), Nachtkiosk (Sortiment, Schwund).</li>
            <li>Immobilien: Stadtgebäude im Inspektor kaufen, Miete von Bewohnern kassieren, Mietniveau und Zustand steuern, Konkurrenzlokale übernehmen.</li>
            <li>Unterwelt: Organisation gründen, Leute anwerben, Gebiete kontrollieren, Operationen fahren. Schwarzgeld muss über legale Betriebe gewaschen werden; Aufmerksamkeit führt zu Razzien.</li>
            <li>Sicherheitszentrale: Wachleute auf Streife verdienen Verträge und senken Kriminalität, Ermittler schwächen Familien. Wer selbst gesucht wird, verliert die Verträge.</li>
            <li>Fraktionen reagieren auf dein Verhalten und stellen Forderungen; Entscheidungen erscheinen im Dock. Im Stadtrat beschließen zwei Parteien Gesetze (Steuern, Mindestlohn, Mietdeckel, Polizeibudget, Bauordnung, Sperrstunde), die du mit Einfluss beantragen kannst.</li>
            <li>Forschungslabore erforschen Technologien für alle Betriebe; Fabriken verarbeiten Rohstoffe und beliefern eigene Betriebe und den Großmarkt. In den Finanzen: Kredite, Investoren, Versicherungen und Bewertung. Krisen treffen die ganze Stadt; wer zu tief ins Minus rutscht, wird zwangsverkauft.</li>
          </ol>
        </section>
        <section>
          <h3 className="panel-title">Steuerung (in den Einstellungen änderbar)</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {KEYS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-xs text-white">{k}</kbd>
                </dt>
                <dd className="text-text/90">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
