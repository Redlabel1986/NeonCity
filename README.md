# Neon Dynasty – Build an Empire, Own the Night

Browserbasierte Cyberpunk-Aufbau-, Wirtschafts- und Lebenssimulation. Nova Eclipse, 2187.

**Entwicklungsstand: alle acht Phasen abgeschlossen, Audit 0.8.1, Phase 9 Konzern und Karriere, Phase 10 Grafik und Gebäudeausrichtung, Phase 11 Innenansicht, Phase 12 Online-Welt, Phase 13 Casino (0.13.0).**
Die Stadt wird prozedural aus einem Seed erzeugt und von bis zu 2.400 simulierten Bürgern bevölkert. Du führst Lokale, Hotels, Taxiflotten, Läden, Sicherheitsfirmen, Labore und Fabriken, kaufst Immobilien, übernimmst Konkurrenten oder gründest eine kriminelle Organisation. Zwölf Fraktionen reagieren auf dich, der Stadtrat beschließt Gesetze, Forschung und Lieferketten senken Kosten, Kredite und Investoren hebeln das Wachstum, Krisen treffen die ganze Stadt. Jeder Credit entsteht aus einer Transaktion.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run build      # Produktionsbuild nach dist/
npm run preview    # Produktionsbuild lokal ausliefern
```

Das Spiel läuft nach dem Laden vollständig offline. Spielstände liegen in IndexedDB des Browsers und können als JSON exportiert und importiert werden.

## Online spielen (gemeinsame Stadt)

```bash
npm run build      # Client bauen (der Server liefert dist/ mit aus)
npm run server     # Online-Welt auf http://localhost:8787, Welt und Konten in data/
```

Im Hauptmenü unter „Online spielen“ die Server-Adresse eintragen (bei `npm run dev` genügt die eigene Adresse, der Dev-Server leitet `/api` und `/ws` weiter), registrieren oder anmelden. Alle Konten spielen auf derselben Karte zur selben Zeit; der Server speichert automatisch. Betrieb auf einem eigenen Server, Vercel und Co.: siehe [DEPLOY.md](DEPLOY.md).

## Prüfen

```bash
npm run typecheck  # TypeScript strict
npm run lint       # oxlint
npm test           # Vitest: Simulation, Wirtschaft, Bau, Serializer
npm run test:e2e   # Playwright: Spielstart, Bau, Betrieb, Speichern/Laden (benötigt: npx playwright install chromium)
```

## Spielen

1. Name, Seed, Hintergrund und Schwierigkeit wählen, Stadt betreten.
2. `B` öffnet das Baumenü. Ramenbar oder Streetfood-Stand wählen und auf ein freies Grundstück an einer Straße setzen. `Q`/`E` dreht das Gebäude, damit der Eingang zur Straße zeigt. Grundstückspreis hängt vom Bezirk ab.
3. Zeit laufen lassen (`1`, `2`, `3`, Leertaste für Pause). Die Baustelle braucht 6 bis 18 Stunden; `Strg+Z` nimmt sie kostenlos zurück.
4. Nach der Eröffnung „Dashboard öffnen“: Die Kamera fliegt ins Gebäude und zeigt den Innenraum mit Küche, Lager, Theke, Personal und Gästen; Zonen anklicken öffnet den passenden Reiter. Speisekarte und Preise, Einkauf bei vier Lieferanten, Personal einstellen und bezahlen, Ausbau starten. Tagesabrechnung um Mitternacht. `Esc` führt zurück zur Stadt.
5. Weitere Branchen im Baumenü (Hotel, Taxidepot, Nachtkiosk, Sicherheitszentrale), Immobilien per Klick auf Stadtgebäude im Inspektor kaufen (`I` für die Übersicht).
6. `X` öffnet die Unterwelt: Organisation gründen, Operationen fahren, Schwarzgeld waschen, Fahndung im Auge behalten.
7. `K` Fraktionen und `O` Politik: Beziehungen pflegen, Anträge stellen, Initiativen finanzieren. Entscheidungen erscheinen in der Kopfleiste und im Dock.
8. `R` Forschung (braucht ein Labor), Fabriken im Baumenü, Kredite, Investoren und Versicherungen unter Finanzen.
9. Einstellungen: Effekte, Audio, Kontrastmodus, Tastenbelegung; Heatmaps über die Übersichtskarte. `J` öffnet das Royal Nova Casino (Slots, Roulette, Blackjack um eigene Credits).
10. `F5` / `F9` Schnellspeichern und -laden, Spielstände-Dialog für Slots, Export und Import.

Alle Tastenkombinationen: `H` im Spiel.

## Dokumentation

- [GAME_DESIGN.md](GAME_DESIGN.md) – Spielkonzept und Mechaniken (umgesetzt und geplant)
- [ARCHITECTURE.md](ARCHITECTURE.md) – Technische Architektur und Entscheidungen
- [ECONOMY.md](ECONOMY.md) – Wirtschaftsmodell mit Formeln
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) – Phasenplan mit Akzeptanzkriterien
- [TASKS.md](TASKS.md) – Offene, laufende und erledigte Aufgaben
- [CHANGELOG.md](CHANGELOG.md) – Änderungshistorie
- [DEPLOY.md](DEPLOY.md) – Veröffentlichung von Client und Online-Welt

## Technik

React 19, TypeScript (strict), Vite 8, Zustand, PixiJS 8, Tailwind CSS 4, Dexie (IndexedDB), Web Audio, Vitest, Playwright. Keine externen Grafik-, Font- oder Audio-Assets: alle Kacheln, Gebäude und Klänge entstehen zur Laufzeit prozedural.
