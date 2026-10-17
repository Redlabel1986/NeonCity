# Aufgaben

## Erledigt (Phase 9)

- [x] Megakonzern-Status mit Kettenübernahmen und Lieferverträgen
- [x] Verkauf der Unternehmensgruppe und neue Karriere
- [x] Bezirksabhängige Musik

## Audit 0.8.1

- [x] Abgleich mit GAME_DESIGN.md: zehn Hintergründe ergänzt, veraltete Phasenverweise entfernt
- [x] UI-Simulation-Verknüpfung: Kapazitäten mit Technologieeffekten, Entscheidungs-Knopf, Laborauswahl, Hilfe mit aktueller Belegung
- [x] Wirtschaft: Einzelhandels-Abrechnung, Dividendenbasis, Abriss-Folgen
- [x] Leistung gemessen (siehe CHANGELOG 0.8.1); keine Speicherlecks in begrenzten Verläufen gefunden

## Erledigt (Phase 8)

- [x] Wetter in Simulation und Darstellung
- [x] Prozedurales Audio mit Kategorien
- [x] Heatmaps, belegbare Tasten, Kontrastmodus, Einstiegshinweis
- [x] Balancing-Tests, Spielstand v8

## Erledigt (Phase 7)

- [x] Forschungslabor, Forschungsbäume, Technologie-Effekte in allen Systemen
- [x] Fabriken, Rohstoffe, Produktionslinien, interne Lieferkette, Großmarkt
- [x] Bewertung, Kredite, Investoren und Dividenden, Versicherungen, Insolvenz
- [x] Neun Wirtschaftskrisen mit Wirkungen und Ende
- [x] Panels, Spielstand v7, Tests

## Erledigt (Phase 6)

- [x] Fraktionen mit Zielen, Einfluss, Beziehungen und eigenen Aktionen
- [x] Entscheidungssystem mit neun Ereignisarten, Optionen, Folgen und Verfall
- [x] Stadtrat, Wahlen, Einfluss, Gesetzesanträge, Parteianträge
- [x] Sechs Gesetze mit Wirkung in Finanzen, Personal, Immobilien, Bau, Gastronomie, Polizei
- [x] Bezirksinitiativen und dynamische Bezirksentwicklung (Gentrifizierung, Verfall, Verdrängung)
- [x] Panels, Dock-Tab, Spielstand v6, Tests

## Erledigt (Phase 5)

- [x] Organisation, Rollen, Kandidaten, Loyalität, Verrat
- [x] Operationen (Jobs und laufende Geschäfte), Erfolgsmodell, Verhaftungen
- [x] Territorium, Rivalenfamilien, Revierkämpfe, Tribut
- [x] Fahndungsstufen, Razzien, Stadtweite Operation, Bestechung, Geldwäsche
- [x] Sicherheitszentrale mit Streifen, Verträgen, Ermittlungen, Interessenkonflikt
- [x] Panels, Spielstand v5, Tests

## Erledigt (Phase 4)

- [x] Branchenmodelle Hotel, Transport, Einzelhandel; Personal und Lager verallgemeinert
- [x] Hotelsystem (Ankünfte, Aufenthalte, Sauberkeit, Bewertungen, VIPs, Zwischenfälle)
- [x] Taxisystem (Flotte, Fahrer, Tarif, Unfälle, Wartung)
- [x] Einzelhandel (Sortiment, Regalpreise, Warenkörbe, Schwund)
- [x] Immobilien (Kauf, Miete, Mietniveau, Zustand, Renovierung, Verkauf, Mieterbewegung) und Übernahmen
- [x] Dashboards, Immobilien-Panel, Inspektor-Angebote, Spielstand v4, Tests

## Erledigt (Phase 3)

- [x] Bürgergenerierung, Tagesablauf, Lokalwahl, Loyalität
- [x] Bezirksökonomie (Beschäftigung, Löhne, Mieten, Ausgaben, Betriebe) und Kaufkraftdrift
- [x] KI-Konkurrenz mit Preispolitik, Investitionen, Insolvenz, Expansion
- [x] Zutatenmarkt mit Index je Zutat
- [x] Passanten und Fahrzeuge im Renderer
- [x] Panels erweitert, Spielstand v3, Tests

## Erledigt (Phase 2)

- [x] Zutaten, Rezepte, Lieferanten, Ausbauten als Daten
- [x] Lager mit Losen, Qualität, Haltbarkeit, Verderb, Kapazität
- [x] Bestellungen mit Lieferzeit und Verspätung, automatische Nachbestellung, Manager-Logik
- [x] Mitarbeiter: Rollen, Fähigkeit, Lohn, Moral, Kündigung, Bewerber, Einstellen/Entlassen/Lohn
- [x] Kapazität aus Plätzen, Küche, Service; Gerichtsqualität; Zufriedenheit; Ruf; Sterne
- [x] Hygiene und Kontrollen
- [x] Ausbauten mit Stufen und Umbauzeit
- [x] Dashboard (fünf Reiter), Personal-Panel, Inspektor-Zusammenfassung
- [x] Spielstandformat v2 mit Migration
- [x] Unit-Tests (39) und E2E-Tests (8)

## Erledigt (Phase 1)

- [x] Projektstruktur, Vite/React/TypeScript strict, Tailwind 4, Vitest, Playwright
- [x] Seed-basierter RNG, Spieluhr, EventBus, Stadtgenerator, Finanzsystem, Bausystem
- [x] PixiJS-Renderer, UI-Grundgerüst, Speichern/Laden, Dokumentation

## Offen

- [ ] Web Worker für die Simulation, sobald NPC-Zahlen oder Branchen die Last spürbar erhöhen (Engine ist vorbereitet)
- [ ] Bürger per Klick auf Passanten inspizieren
- [ ] Innenraum-Modus (Räume und Einrichtung sichtbar) und Gebäudetransparenz
- [ ] Interne Fabriklieferungen mit Verrechnungspreis statt Nullbuchung (derzeit bewusst ohne Geldfluss)
- [ ] Screenreader-Beschreibung der Kartenkacheln (Tastatur-Cursor über die Karte)
- [ ] Pinch-Zoom auf Tablets
- [ ] Shift-gedrückt halten für mehrfaches Platzieren
- [ ] Screenshot-Regressionstests mit festen Referenzbildern
- [ ] Service Worker für Offline-Start nach Neuladen
- [ ] Werbung/Marketing als laufende Kampagnen (bisher nur Leuchtreklame als Ausbau)
- [ ] Hotel-Gäste und Taxifahrten aus einzelnen Bürgern statt aus Bezirksaggregaten
- [ ] Polizeibehörde als spielbare öffentliche Institution (Budget, Gefängnisse, öffentliche Zufriedenheit) über die private Sicherheitsfirma hinaus
- [ ] Wahlkampf-Unterstützung mit sichtbarem Stimmenanteil je Bezirk; Fraktionen untereinander (Bündnisse und Konflikte ohne Spielerbeteiligung)
- [ ] Weitere Fabriktypen (Robotik, Recycling, Energie) und Forschung mit mehreren parallelen Laboren an einem Thema
- [ ] Sichtbare Straßenkriminalität und Polizeisperren auf der Karte
- [ ] Flugtaxis, Kurierdienste, Filialketten als weitere Varianten der Branchenmodelle
- [ ] Stoßzeiten je Bezirk (bisher ein globales Stundenprofil)

## Bekannte Fehler und Einschränkungen

- Die E2E-Tests laufen gegen den Produktionsbuild (`vite preview`); Fehler, die nur im Dev-Modus mit StrictMode auftreten, werden dort nicht erfasst. Vor Auslieferung immer auch `npm run dev` manuell prüfen.

- Laden eines Spielstands schließt offene Panels und bricht eine laufende Platzierung ab (beabsichtigt, aber ohne Hinweis).
- Bei sehr hohem Zoom-Out (0,28) und 1.500 Gebäuden fällt die Bildrate auf schwacher Hardware; Straßenleben wird dort automatisch ausgeblendet, ein Chunk-Culling ist nicht umgesetzt.
- oxlint-Hinweis in `SavesDialog.tsx` (setState in Effekt beim Laden der Liste): harmlos.
- Der Lohn-Slider im Dashboard schreibt bei jeder Bewegung ein Kommando; bei sehr vielen Mitarbeitern könnte das stocken (bisher max. 10 je Betrieb).

## Stand

Alle acht Phasen des Entwicklungsplans plus Phase 9 (Konzern und Karriere) sind umgesetzt. Offene Punkte oben sind Erweiterungen über den Plan hinaus; als nächste Phase bietet sich die öffentliche Polizeibehörde oder der Innenraum-Modus an.
