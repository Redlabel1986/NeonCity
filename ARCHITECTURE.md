# Architektur

## Schichten

```
src/
  sim/            Simulation. Reines TypeScript, kein React, kein Pixi, kein DOM.
    core/         Rng (mulberry32), Uhr, EventBus, SimContext
    data/         Datengetriebene Definitionen: Bezirke, Gebäude, Schwierigkeit, Hintergründe
    world/        Tile-Grid (typed arrays) und prozeduraler Stadtgenerator
    economy/      Finanzen: Ledger, Buchungen, Tagesabschluss
    systems/      Bau, Gastronomie, Hotel, Transport, Einzelhandel, Immobilien, Sicherheit, Unterwelt, Fraktionen, Politik, Entscheidungen, Forschung, Industrie, Konzernfinanzen, Krisen, Lager/Einkauf, Personal, Bevölkerung, Konkurrenz, Markt, Aufgaben
    state.ts      Vollständiger serialisierbarer Spielzustand
    engine.ts     Simulation: step(), apply(command), createNewGame()
  persistence/    Serializer (Validierung, Reparatur), Migrationen, Dexie-DB, Save-Service
  render/         PixiJS: Isometrie, prozedurale Texturen (ArtCache), CityRenderer (Kamera, Culling, Licht), Straßenleben (traffic), Wetter (weather)
  ui/             React + Zustand: Store, Game-Loop, Screens, Panels, Dialoge, Hotkeys (belegbar), Audio (Web Audio, prozedural)
tests/unit/       Vitest (Simulation und Persistenz)
tests/e2e/        Playwright (vollständige Spielflüsse im Browser)
```

Abhängigkeitsrichtung: `ui → render → sim`, `ui → persistence → sim`. `sim` importiert nichts aus den anderen Schichten.

## Grundsätze und Entscheidungen

### Deterministische Simulation mit festen Schritten
Ein Tick ist eine Spielminute. `Simulation.step()` ist die einzige Stelle, an der Zeit vergeht. Alle Zufallsentscheidungen laufen über einen seed-basierten `Rng`, dessen Zustand Teil des Spielstands ist. Gleicher Seed und gleiche Kommandofolge ergeben byteidentische Zustände (Test: „is fully deterministic“).

### Kommandos statt direkter Mutation
Die UI verändert den Zustand ausschließlich über `Simulation.apply(command)`. Jedes Kommando gibt `{ ok } | { ok, error }` zurück; Fehlertexte sind verständliche deutsche Sätze. React-Komponenten enthalten keine Spielregeln.

### Events statt Kopplung
Systeme emittieren typisierte Events (`building:completed`, `day:ended`, `log`, …) in einen `EventBus`. Die Engine sammelt sie pro Schritt; der Game-Loop leitet sie an Store und Renderer weiter. Das Protokoll (`state.log`) wird in der Engine aus `log`-Events gefüllt und ist Teil des Spielstands.

### Zustand als einfache Daten, Grid als typed arrays
`GameState` ist ein JSON-fähiges Objekt. Nur das `CityGrid` nutzt zur Laufzeit `Uint8Array`/`Int32Array` (Kachelart, Bezirk, Variante, belegendes Gebäude) und serialisiert sich zu Zahlenarrays. Das Belegungsraster ist gleichzeitig der räumliche Index: Tile → Gebäude in O(1); Gebäude kennen ihre Grundfläche.

### Schrittreihenfolge pro Stunde und Tag
Stunde: Bevölkerung (Aktivitäten, Lokalwahl → `pendingVisits`) → Spielerbetriebe (bedienen Besuche + Laufkundschaft, Loyalität zurückschreiben) → Konkurrenz (bedienen, Kasse). Tag: Betriebe (Löhne, Verderb, Ruf) → Bevölkerung (Einkommen, Miete, Zensus, Drift) → Konkurrenz (Preise, Investition, Insolvenz, Expansion) → Markt (Index) → Ledger.

### Entscheidungen
`systems/decisions.ts` hält offene Entscheidungen im Zustand (`decisions.pending`) mit Optionen und Kontext; `resolveDecision` wendet die Folgen je `kind` an. Fraktionen erzeugen Entscheidungen über `createDecision` mit Abklingzeiten; unbeantwortete verfallen täglich mit der letzten Option. Gesetze liegen als Werte in `politics.laws` und werden von den betroffenen Systemen gelesen (Steuer im Politiksystem, Mindestlohn im Personal, Mietdeckel in Immobilien, Bauordnung im Bau, Sperrstunde in der Gastronomie, Polizeibudget in Unterwelt und Bezirksentwicklung). Der Streik wirkt über ein Modul-Flag (`laborState`) auf den Einsatz aller Mitarbeiter, das die Engine stündlich setzt.

### Querschnittseffekte
Forschung (`techFactors`) und Krisen (`crisisFactors`) liefern Multiplikatoren, die die betroffenen Systeme an der jeweiligen Stelle lesen (Kochleistung, Zimmerkosten, Fahrten, Warenkorb, Lieferzeit, Haltbarkeit, Streifen, Zins, Bau, Verderb, Umsatz, Betriebskosten). Versicherungen werden an den Verluststellen über `insuranceClaim` angesprochen. So bleiben die Systeme unabhängig und die Effekte nachvollziehbar.

### Game-Loop in der UI-Schicht, Worker-bereit
`ui/loop.ts` rechnet Wandzeit mit `requestAnimationFrame` in Ticks um (2 Spielminuten pro Sekunde bei 1×; 3× und 8× als Stufen; maximal 240 Ticks pro Frame). Die Engine ist zustandsvoll, aber frei von DOM-Abhängigkeiten und per JSON übertragbar; die Verlagerung in einen Web Worker (Phase 3, bei tausenden NPCs) erfordert nur einen Message-Adapter um `apply`/`run`/`drainEvents`.

### Rendering liest, schreibt nie
`CityRenderer` erhält den Zustand (`loadWorld`, `syncBuildings`) und baut Sprites. Pro Kachel ein Bodensprite, pro Gebäude ein Tag-Sprite (tiefensortiert, `zIndex = x+w+y+h`) und ein additives Nacht-Sprite. Tag/Nacht: Tint der Tag-Ebenen plus Alpha der Licht-Ebene aus `daylightFactor(minuteOfDay)`.

Culling: eigene AABB-Liste in Weltkoordinaten; nur bei Kamerabewegung neu ausgewertet. Sichtbare Kacheln/Gebäude werden ein- bzw. ausgeblendet.

### Prozedurale Grafik
`render/art.ts` zeichnet alle Kacheln und Gebäude mit Pixi-Graphics und rendert sie einmalig in Texturen (`ArtCache`). Schlüssel: Art, Stil, Grundfläche, Etagen (ab 5 auf gerade Zahlen gebündelt), Variante (0–3), Baustelle, Tag/Nacht. Dadurch bleibt die Texturzahl bei wenigen hundert. Keine Fremd-Assets, kein Copyright-Risiko.

### Persistenz
- Format: `{ magic: 'NEON_DYNASTY_SAVE', version, savedAt, name, state }` als JSON.
- `validateSaveFile` prüft Struktur, Wertebereiche, Grid-Größe, Gebäude-Grundflächen und Referenzen, bevor etwas die Engine erreicht. Kein `eval`, kein Code im Spielstand.
- `persistence/migrations.ts`: `MIGRATIONS[fromVersion]` hebt ältere Formate schrittweise an (v1 → v2 erzeugt Speisekarte, Lager und Personal aus den alten Pauschalwerten); neuere Formate werden abgelehnt.
- `tryRepair` stellt transiente Felder (Protokoll, Undo-Verlauf, Tageswerte) wieder her, wenn der Kern intakt ist.
- Dexie-Tabelle `saves` mit Slots: `autosave`, `quick`, `manual-*`. Autosave jeden Spieltag, beim Ausblenden des Tabs und beim Wechsel ins Hauptmenü.

### Erweiterbarkeit
- Neue Gebäude: Eintrag in `data/buildings.ts` (+ optional Art-Key in `render/art.ts`).
- Neue Branchen: weiteres `BusinessModel`/`BusinessState` als Discriminated Union, Fabrik in `businessFactory.ts`, System in `sim/systems/` mit Stunden- und Tageshook in `engine.ts`, Dashboard in `ui/panels/KindDashboards.tsx`. `StaffedBusiness` (Personal, Ausbauten) und `StockHolder` (Lager, Einkauf) sind die geteilten Bausteine; Hotel, Transport und Einzelhandel nutzen sie bereits.
- Neue Rezepte, Zutaten, Lieferanten, Ausbauten: reine Dateneinträge in `sim/data/`.
- Neue Bezirke: `data/districts.ts` und Layout in `world/generator.ts`.
- Save-Format ändern: `SAVE_FORMAT_VERSION` erhöhen und Migration ergänzen.

## Schnittstellen (Auszug)

```ts
// Engine
createNewGame(options): GameState
class Simulation { step(); run(n); apply(cmd): CommandResult; drainEvents(): SimEvent[] }
type Command = placeBuilding | undoPlacement | demolish | setSpeed | setPrice | rename

// Bau
checkPlacement(state, defId, x, y): { ok, error?, quote?, tiles[] }
quotePlacement(state, def, districtId): { landCost, constructionCost, total, buildTime }

// Betrieb
explainDemand(state, building): DemandBreakdown   // für UI und Tests

// Renderer
loadWorld(state); syncBuildings(state); setDaylight(d); setGhost(g, state); setSelection(s); focusTile(x,y,zoom)
```

## Leistung

- 96×96 Kacheln, ca. 1.500 Stadtgebäude: Sprite-Culling hält die Zeichenlast proportional zum Sichtbereich.
- Simulationskosten pro Tick: Baustellen-Iteration über Gebäude (Record), Geschäftslogik nur zu vollen Stunden, Aufgaben alle 15 Ticks. Keine Neuberechnung pro Frame.
- Begrenzte Verläufe: 200 Protokolleinträge, 300 Transaktionen, 365 Kontostände, 30 Tagessätze je Betrieb.

## Bekannte Einschränkungen (Phase 1)

- Simulation läuft im Hauptthread; mit bis zu 2.400 Bürgern kostet ein Spieltag unter 400 ms (Test), also unter 0,3 ms pro Tick.
- Touch: Ein-Finger-Pan funktioniert, Pinch-Zoom fehlt.
- Keine Service-Worker-Installation; offline nur innerhalb einer geladenen Sitzung.
