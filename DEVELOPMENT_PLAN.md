# Entwicklungsplan

Jede Phase hinterlässt einen lauffähigen Stand. Eine Phase gilt erst als abgeschlossen, wenn ihre Akzeptanzkriterien geprüft sind (Unit-/E2E-Tests oder dokumentierte manuelle Prüfung).

## Minimaler spielbarer Kern (Definition)

Stadtkarte erkunden → Grundstück wählen → Betrieb bauen → Zeit vergeht → Betrieb verdient Geld → Spielstand sichern. Alles weitere baut auf dieser Schleife auf.

## Phase 1 – Spielbares Fundament ✅ abgeschlossen

Umfang: Projektstruktur, React/TS/Vite, PixiJS-Stadtkarte, isometrisches Raster, Kamera und Zoom, platzierbare Gebäude, Spielzeit, Geldsystem, Baumenü, Objektselektion, Speichern und Laden.

Akzeptanzkriterien und Nachweis:

| Kriterium | Nachweis |
|---|---|
| Stadt wird deterministisch aus Seed erzeugt, 8 Bezirke, Straßen, Wasser, freie Lots | `tests/unit/sim.test.ts` (City generator) |
| Kamera: Pan (Maus, WASD), Zoom (Rad, +/−) mit Grenzen, Fokus auf Ereignisse/Bezirke | manuell + `visual.spec.ts` (focusTile) |
| Gebäude anklicken, Grundstück anklicken, Inspektor zeigt Kontext | `smoke.spec.ts` |
| Baumenü mit echten Kosten, Bauzeit, Vorschau (Geisterbild), Fehlermeldungen | `smoke.spec.ts`, Unit-Tests Construction |
| Ungültige Bauaktionen (Straße, Wasser, belegt, außerhalb, ohne Geld, gesperrt) werden abgelehnt, ohne Geld zu verändern | Unit-Tests Construction, `smoke.spec.ts` |
| Baustelle braucht Zeit, Rückgängig erstattet voll, Abriss nicht | Unit-Tests Construction |
| Ramenbar erwirtschaftet Umsatz nur zu Öffnungszeiten; Buchungen stimmen mit Tageswerten überein | Unit-Tests Economy |
| Miete, Löhne, Betriebskosten werden täglich gebucht; negativer Saldo möglich und sichtbar | Unit-Tests Economy, Warnungen-Tab |
| Speichern/Laden in IndexedDB, Export/Import, Validierung, Migration, Reparatur | `serializer.test.ts`, `smoke.spec.ts` (F5/F9) |
| Deterministische Fortsetzung nach Laden | `serializer.test.ts` (round-trip) |
| Keine Konsolenfehler im Spielfluss | `smoke.spec.ts` (pageerror-Check) |

## Phase 2 – Erstes vollständiges Unternehmen (Ramenbar als vertikaler Slice) ✅ abgeschlossen

Umfang: Räume als Ausbauten (Gastraum, Küche, Lager, Ausstattung, Hygienestation, Personalraum, Leuchtreklame), Mitarbeiter mit Fähigkeit, Lohn und Moral, Zutatenlager mit Haltbarkeit, Lieferanten mit Lieferzeiten, Rezepte und Speisekarte, Hygiene, Bewertungen, Tagesabrechnung je Betrieb, Dashboard und Personal-Panel.

| Kriterium | Nachweis |
|---|---|
| Ohne Zutaten keine Gäste, verlorene Gäste werden gezählt und gemeldet | `phase2.test.ts` (Inventory) |
| Bestellungen werden sofort bezahlt, respektieren Mindestbestellwert, Lager und Kontostand, treffen zeitverzögert ein | `phase2.test.ts`, `dashboard.spec.ts` |
| Verderb am Tagesende, automatische Nachbestellung bis Zielmenge | `phase2.test.ts` |
| Ohne Koch keine Kapazität; Einstellen stellt sie wieder her; Löhne je Mitarbeiter; Abfindung; Kündigung bei schlechter Moral | `phase2.test.ts` (Staff) |
| Speisekarte: mindestens ein Gericht, nur angebotene Gerichte verkaufen sich; Preisgrenzen | `phase2.test.ts`, `sim.test.ts` |
| Zufriedenheit → Ruf und Sterne; Hygiene fällt und erholt sich | `phase2.test.ts` |
| Ausbau kostet, dauert, wirkt auf Kapazität und Nachfrage; nur ein Umbau gleichzeitig | `phase2.test.ts` |
| Alte Spielstände (v1) werden migriert; v2 ist deterministisch reproduzierbar | `phase2.test.ts` (Save compatibility) |
| Dashboard-Flüsse im Browser: Bestellen, Einstellen, Ausbauen, Speisekarte, Tagesabrechnung | `dashboard.spec.ts` |

Bewusst verschoben: Werbekampagnen als laufende Ausgaben (Phase 4 mit Medien), bezirksabhängige Stoßzeiten (Phase 3 mit NPC-Tagesabläufen).

## Phase 3 – Wirtschaft und Bevölkerung ✅ abgeschlossen

Umfang: Bürger als Agenten (Wohnung, Job, Einkommen, Bedürfnisse, Tagesablauf, Lokalwahl, Loyalität) über der aggregierten Bevölkerung; Bezirksökonomie mit Löhnen, Mieten und Konsum; KI-Konkurrenz (Utility-Regeln); Zutatenmarkt; Passanten und Fahrzeuge.

| Kriterium | Nachweis |
|---|---|
| Bürger werden deterministisch mit Wohnung, Job und Einkommen erzeugt | `phase3.test.ts` (Population) |
| Tagesablauf: Arbeit tagsüber, Schlaf nachts; Besuche zu Mahlzeiten werden echte Gäste; Loyalität entsteht | `phase3.test.ts` |
| Löhne und Mieten werden täglich gebucht, Zensus je Bezirk stimmt | `phase3.test.ts` |
| Konkurrenten bedienen Gäste, ändern Preise, schließen bei Pleite, expandieren mit Ereignis | `phase3.test.ts` (Competitors) |
| Marktindex bleibt in Grenzen und wirkt auf Einkaufspreise | `phase3.test.ts` (Market) |
| Spielstand v2 wird migriert; v3 ist deterministisch | `phase3.test.ts` (Save format v3) |
| Leistung: ein Spieltag mit > 1.000 Bürgern in < 400 ms (Hauptthread ausreichend) | `phase3.test.ts` |

Abweichung vom ursprünglichen Plan: Der Web Worker wurde nicht eingeführt, weil die gemessene Last keinen rechtfertigt; die Engine bleibt per Kommando-/Event-Schnittstelle worker-fähig. 5.000 NPCs sind möglich (Agentendichte in `population.ts`), der Standard liegt bei bis zu 2.400.

## Phase 4 – Weitere Branchen ✅ abgeschlossen

Umfang: Hotel (Kapsel, Business), Taxiunternehmen, Einzelhandel (Nachtkiosk) und Immobilienverwaltung mit Übernahmen, alle auf dem gemeinsamen Framework (Personal, Ausbauten, Lager) mit eigener strategischer Identität und eigenem Dashboard.

| Kriterium | Nachweis |
|---|---|
| Hotel: Check-ins, Umsatz, Zimmerkosten, Bewertungen; Preisgrenzen; Zimmerausbau erhöht Kapazität | `phase4.test.ts` (Hotel), `phase4.spec.ts` |
| Taxi: Fahrten nur mit Fahrer und Fahrzeug; Energie- und Wartungskosten; Fahrzeuge kaufen/verkaufen; Tarifgrenzen | `phase4.test.ts` (Transport), `phase4.spec.ts` |
| Einzelhandel: Verkauf aus Lager, Wareneinsatz, Nachbestellung; leere Regale verlieren Kunden; Preisgrenzen | `phase4.test.ts` (Retail), `phase4.spec.ts` |
| Immobilien: Kauf, Mieteinnahmen, Mietniveau, Renovierung blockiert Miete, Verkauf; keine Käufe ohne Geld oder doppelt | `phase4.test.ts` (Real estate), `phase4.spec.ts` |
| Übernahme eines Konkurrenzlokals wird zum eigenen Betrieb | `phase4.test.ts` |
| Spielstand v4 mit allen Branchen und Immobilien deterministisch | `phase4.test.ts` |

Strategische Identität: Gastronomie lebt von Zutaten, Speisekarte und Stammgästen; Hotels von Attraktivität, Komfort und Sauberkeit über mehrere Nächte; Taxis vom Verhältnis Fahrzeuge zu Fahrern, Verschleiß und Radius; Einzelhandel von Sortiment, Marge und Schwund; Immobilien von Mietniveau, Zustand und Mieterbewegung.

## Phase 5 – Kriminalität und Sicherheit ✅ abgeschlossen

Umfang: Kriminelle Organisation mit Rollen, Operationen, Territorium, Schwarzgeld und Geldwäsche; Rivalenfamilien; Fahndung in sieben Stufen mit Razzien; Bestechung und Korruption; Sicherheitszentrale mit Streifen, Verträgen und Ermittlungen; Interessenkonflikt zwischen beiden Seiten.

| Kriterium | Nachweis |
|---|---|
| Gründung kostet Geld, nur eine Organisation, Kandidaten vorhanden | `phase5.test.ts` |
| Jobs brauchen Crew und Kontrolle, erzeugen Schwarzgeld (nicht legal ausgebbar) und Aufmerksamkeit | `phase5.test.ts`, `phase5.spec.ts` |
| Geldwäsche nur über legale Umsätze, mit Gebühr und Obergrenze | `phase5.test.ts` |
| Fahndungsstufen aus Aufmerksamkeit, Razzien mit Verhaftung, Beschlagnahme und Bußgeld, stadtweite Sperre, Bestechung senkt Aufmerksamkeit | `phase5.test.ts` |
| Schutzgeld braucht Territorium und belastet Konkurrenten; Casino braucht Gewerbe-Fassade | `phase5.test.ts` |
| Rivalen kämpfen um Gebiete; Tribut kauft Waffenstillstand | `phase5.test.ts` |
| Sicherheitsfirma: Streifen verdienen Verträge und senken Kriminalität; Ermittlung schwächt Familie; Interessenkonflikt bei Fahndung | `phase5.test.ts`, `phase5.spec.ts` |
| Spielstand v5 mit Migration | `phase5.test.ts` |

Bewusst abweichend: Die „Polizeibehörde“ ist als private Sicherheitszentrale mit Stadtverträgen umgesetzt (Streifen, Ermittlungen, Verträge, Interessenkonflikt). Eine öffentliche Behörde mit Budget, Gefängnissen und Wahlen folgt mit Phase 6 (Politik).

## Phase 6 – Fraktionen und Politik ✅ abgeschlossen

Umfang: Zwölf Fraktionen mit Beziehungen und eigenen Aktionen, Entscheidungen mit Folgen, Stadtrat mit Wahlen, Gesetze mit echten Wirkungen, Einfluss und Bezirksinitiativen, dynamische Bezirksentwicklung.

| Kriterium | Nachweis |
|---|---|
| Fraktionen haben Beziehung und Einfluss; Unterstützung hebt Beziehung, Gegner reagieren | `phase6.test.ts` (Factions), `phase6.spec.ts` |
| Unterbezahlung führt zur Streikdrohung; Aushalten halbiert Kapazität; Entscheidungen verfallen mit letzter Option, Abklingzeiten verhindern Spam | `phase6.test.ts` |
| Übernahmeangebot verkauft den Betrieb bei Annahme | `phase6.test.ts` |
| Umsatzsteuer wird täglich zum Gesetzessatz abgeführt | `phase6.test.ts` |
| Anträge brauchen Einfluss und Lobbykosten, werden abgestimmt und ändern Gesetze; Mindestlohn, Mietdeckel, Bauordnung wirken | `phase6.test.ts`, `phase6.spec.ts` |
| Wahlen verteilen Sitze; Initiativen verändern Bezirkswerte mit Abklingzeit | `phase6.test.ts` |
| Attraktivität treibt Mieten (Gentrifizierung) | `phase6.test.ts` |
| Spielstand v6 mit Migration | `phase6.test.ts` |

## Phase 7 – Erweiterte Simulation ✅ abgeschlossen

Umfang: Forschung mit Laboren und Technologien, Industrie mit Rohstoffen, Linien und interner Lieferkette, Konzernfinanzen (Bewertung, Kredite, Investoren, Versicherungen, Insolvenz) und Wirtschaftskrisen.

| Kriterium | Nachweis |
|---|---|
| Forschung braucht ein Labor, kostet, sammelt Punkte, prüft Voraussetzungen, schaltet Effekte und Rezepte frei | `phase7.test.ts` (Research), `phase7.spec.ts` |
| Fabrik produziert aus Rohstoffen mit Arbeit, Maschinen und Energie, beliefert eigene Betriebe, verkauft Überschuss; ohne Arbeiter nichts | `phase7.test.ts` (Industry), `phase7.spec.ts` |
| Kredite mit Rahmen, Zins, Raten, Tilgung; Anteile mit Dividenden und Rückkauf; Versicherungen mit Prämien | `phase7.test.ts` (Corporate finance), `phase7.spec.ts` |
| Tiefe Schulden führen zu Zwangsverkauf und Insolvenz | `phase7.test.ts` |
| Krisen wirken und enden mit Rücknahme; Krisen starten von selbst | `phase7.test.ts` (Crises) |
| Spielstand v7 mit Migration | `phase7.test.ts` |

Abweichung: Baumaterialien und Bauarbeitskräfte bleiben abstrahiert (Credits, Zeit, Energie, Bauordnung, Modulbau-Forschung); ein eigener Baustoffkreislauf ist nicht umgesetzt. Megakonzerne wirken als Fraktionen (Übernahmeangebote, Konkurrenz, Politik); ein eigener Konzernstatus mit Konzernaktionen steht in TASKS.md.

## Phase 8 – Polish ✅ abgeschlossen

Umfang: Wetter mit Simulationswirkung und Darstellung, prozedurales Audio, Heatmaps, belegbare Tasten, Kontrastmodus, Einstiegshinweis, Balancing-Tests.

| Kriterium | Nachweis |
|---|---|
| Wetter wechselt deterministisch und wirkt auf Nachfrage; wird gespeichert und migriert | `phase8.test.ts` (Weather) |
| Standardlauf profitabel, Schwierigkeitsgrade geordnet, weitere Branchen profitabel | `phase8.test.ts` (Balancing) |
| Einstieg, Gewitterdarstellung, Heatmap, Kontrastmodus, Tastenbelegung mit Konfliktprüfung im Browser ohne Fehler | `phase8.spec.ts` |
| Alle Navigationseinträge öffnen funktionierende Panels | `smoke.spec.ts` |

Nicht umgesetzt und in TASKS.md geführt: Innenraum-Modus, Screenreader-Beschreibung der Kartenkacheln, Pinch-Zoom.

## Phase 9 – Konzern und Karriere ✅ abgeschlossen (über den Plan hinaus)

Umfang: Megakonzern-Status mit Kettenübernahmen und Lieferverträgen, Verkauf der Unternehmensgruppe mit neuer Karriere, bezirksabhängige Musik.

| Kriterium | Nachweis |
|---|---|
| Status nur bei Bewertung, Größe und Branchenvielfalt; Kettenübernahme kauft alle Lokale eines Bezirks als eine Buchung; Lieferverträge bringen Fabrikumsatz | `phase9.test.ts` |
| Verkauf tilgt Kredite, löst Organisation auf, blockiert mit Investoren; neue Karriere setzt Hintergrund, Beziehungen und Aufgaben | `phase9.test.ts`, `phase9.spec.ts` |
| Spielstand v9 mit Migration | `phase9.test.ts` |

## Phase 10 – Grafik und Gebäudeausrichtung ✅ abgeschlossen (über den Plan hinaus)

Umfang: offenere Stadt (Gehweg um jedes Gebäude, freie Plätze), variierte und beleuchtete Fassaden und Neonschilder, isometrische Fahrzeuge, Gebäudeausrichtung mit Drehung bei der Platzierung.

| Kriterium | Nachweis |
|---|---|
| Jedes Stadtgebäude zeigt mit seiner Fassade zu einer Straße, sichtbare Seiten bevorzugt | `phase10.test.ts` |
| Platzierung wählt automatisch eine Straßenseite; eine Kante ohne Straße wird abgelehnt; gewählte Ausrichtung wird gespeichert | `phase10.test.ts`, `phase10.spec.ts` |
| Drehen per `Q`/`E` und Knöpfen im Baumenü, Hinweistext bei falscher Ausrichtung | `phase10.spec.ts` |
| Spielstand v10 mit Migration aus dem Straßennetz | `phase10.test.ts` |
| Sichtprüfung Tag/Nacht, Makro/Meso (Screenshots in `tests/e2e/output/`) | `visual.spec.ts` |

## Gesamtstand

Alle acht Phasen sind abgeschlossen, mit Version 0.8.1 auditiert und mit Phase 9 und 10 erweitert. Stand der Prüfung: 105 Unit-Tests (Vitest) und 15 E2E-Tests (Playwright) laufen fehlerfrei; Typecheck strict und Lint sind sauber bis auf zwei dokumentierte Hinweise.
