# Wirtschaftsmodell

Grundsatz: Geld entsteht nur durch Transaktionen (`economy/finance.ts: book()`), jede mit Kategorie, Beschreibung und Zeitstempel. Ausgaben für Bau und Grundstück werden vorab geprüft (`canAfford`); laufende Kosten (Miete, Löhne, Betrieb) werden immer gebucht und können das Konto ins Minus treiben. `daysInDebt` zählt Tage mit negativem Saldo (Insolvenzfolgen: Phase 3).

## Start

| Schwierigkeit | Startkapital | Kostenfaktor | Nachfragefaktor | Mietfaktor | Besonderheit |
|---|---|---|---|---|---|
| Story | 60.000 | 0,8 | 1,3 | 0,6 | |
| Casual | 35.000 | 0,9 | 1,15 | 0,8 | |
| Standard | 22.000 | 1,0 | 1,0 | 1,0 | |
| Hardcore | 12.000 | 1,2 | 0,85 | 1,4 | |
| Sandbox | 1.000.000 | 1,0 | 1,0 | 1,0 | Sofortbau, keine Geldprüfung |

Hintergründe verschieben Startkapital (−4.000 bis +15.000), Wohnungsmiete (40 bis 260 ¢/Tag), Heimatbezirk und einen Gastronomie- bzw. Baukostenbonus.

## Bau

```
Grundstück   = landPrice(Bezirk) × Felder × Kostenfaktor
Bau          = cost(Gebäude) × Kostenfaktor × Baubonus(Hintergrund)
Bauzeit      = buildTimeMinutes × (1,5 falls Energieversorgung des Bezirks < 50)
Voraussetzung: freie Felder, Straßenanschluss (4er-Nachbarschaft), Energie ≥ 20
```

Rückgängig (nur Baustellen): volle Erstattung. Abriss (Betrieb): 70 % des Grundstückswerts zurück, 8 % der Baukosten als Abrisskosten.

| Gebäude | Bau | Zeit | Betrieb/Tag | Startpersonal | Plätze | Lager | Rezepte |
|---|---|---|---|---|---|---|---|
| Ramenbar | 6.500 | 18 h | 90 | Koch 48, Service 42 | 12 | 640 | 6 |
| Streetfood-Stand | 1.800 | 6 h | 35 | Koch 40 | 6 | 300 | 3 |

## Gastronomie (stündlich, nur zu Öffnungszeiten)

```
erwartetePeakGäste = baseDraw × Bezirk × Konkurrenz × Sicherheit × Preis × Ruf × Ausbau × Modifikatoren
Bezirk       = (demandFood/60) × (0,4 + 0,6 × traffic/100) × min(1,5; 0,3 + 0,7 × √(population/30000))
Konkurrenz   = (1 − competition/250) × 0,92 je eigenem Betrieb im Umkreis von 6 Feldern
Sicherheit   = (1 − crime/300) × (0,9 + 0,2 × attractiveness/100)
Preis        = (Ø Preisverhältnis der Karte)^(−(1,6 − purchasingPower/100))   // beliebtheitsgewichtet
Ruf          = 0,6 + 0,8 × reputation/100
Ausbau       = Ausstattung (1,08/1,16/1,26) × Leuchtreklame (1,12/1,24)
Modifikatoren = Nachfragefaktor(Schwierigkeit) × Gastronomiebonus(Hintergrund)

wollen(h)    = round(erwartetePeakGäste × Stundenprofil[h] × U(0,85; 1,15))
Kapazität    = min(Plätze × 2,2; Küchenleistung; Serviceleistung) × (0,8 bei laufendem Umbau)
Küchenleistung = Σ Köche: cookRate × Küchenfaktor × (0,6 + 0,8 × Fähigkeit/100) × (0,7 + 0,4 × Moral/100)
Serviceleistung = Σ Service analog mit serviceRate; ohne Service: 55 % der Küchenleistung
Versuche     = min(wollen, Kapazität); abgewiesen = Rest
```

Je Gast:

```
Gericht      = gewichtete Wahl unter angebotenen, kochbaren Gerichten: Beliebtheit × (basePrice/Preis)^1,2
             → kein kochbares Gericht: Gast verloren (lostNoIngredients, Rufabzug)
Zutaten      = FIFO aus Losen; Wareneinsatz = Σ Einheiten × Einstandspreis des Loses
Qualität     = 0,5 × Ø Losqualität + 50 × min(1; (Kochfähigkeit+15)/(Anspruch+15)) + 0,6 × Küchenbonus
Wert         = (basePrice/Preis)^0,6
Zufriedenheit = 0,55 × Qualität + 22 × Wert + 0,15 × Hygiene + Ausstattungsbonus + Servicebonus − Andrangstrafe ± N(0,3)
             Servicebonus = 0,12 × (Servicefähigkeit − 50), ohne Service −8
             Andrangstrafe = 60 × max(0; Auslastung − 0,85)
Umsatz      += Preis (Kategorie sales)
Hygiene     −= hygieneLossPerGuest × Hygienestationsfaktor
```

## Einkauf und Lager

```
Stückpreis   = basePrice(Zutat) × Preisfaktor(Lieferant) × Kostenfaktor(Schwierigkeit)
Bestellung   : Mindestbestellwert, Sortiment, Lagerkapazität (inkl. offener Lieferungen), Kontostand; Zahlung sofort (ingredients)
Lieferung    = Bestellzeit + deliveryHours (+ delayHours mit delayChance); Losqualität = Lieferantenqualität ± N(0,6) (Undercity ± 18)
Verderb      : Lose mit Alter ≥ Haltbarkeit (+ Lagerausbau) werden um Mitternacht vernichtet
Nachbestellung: nachts bis Zielmenge beim bevorzugten Lieferanten, auf freien Lagerplatz skaliert; Startziele ≈ 1,3 Tage Vollauslastung der angebotenen Gerichte (auf 90 % des Lagers skaliert); Manager setzt Ziele auf 1,6 × Tagesverbrauch
```

| Lieferant | Preis | Qualität | Lieferzeit | Verspätung | Mindestwert |
|---|---|---|---|---|---|
| Rust Docks Großmarkt | ×0,85 | 45 | 10 h | 25 % (+8 h) | 150 |
| Neon Market Kurier | ×1,00 | 60 | 4 h | 8 % (+3 h) | 60 |
| Chrome Fresh Logistics | ×1,45 | 88 | 6 h | 2 % (+2 h) | 200 |
| Undercity-Händler | ×0,60 | 30 | 3 h | 35 % (+12 h) | 30, keine Getränke |

## Personal

```
erwarteter Lohn = Basis(Koch 80, Service 65, Manager 140) + Fähigkeit × (1,1 bzw. 1,6 Manager)
Moralziel    = 50 + 80 × (Lohn/erwartet − 1) + Personalraum + 6 (Manager) − 60 × max(0; Auslastung − 0,9) − 10 (Hygiene < 40)
Moral       += 0,25 × (Ziel − Moral) ± N(0,2) pro Tag; Fähigkeit +0,15 pro Tag
Kündigung    : Moral < 18 an drei Tagen → 50 % pro Tag
Entlassung   : Abfindung = 3 Tageslöhne; Bewerber: 4 je Betrieb, Fähigkeit ~ N(35 + 0,25 × Kaufkraft, 18)
```

## Tagesabschluss (00:00)

1. Wohnungsmiete des Spielers (`rent`).
2. Je Betrieb: Betriebskosten (`upkeep`), Löhne je Mitarbeiter (`wages`), Moral und Kündigungen.
3. Reinigung: Hygiene += 8 + 6 × Service + 0,12 × Servicefähigkeit + 4 (Manager) + 5 × Hygienestation. Hygiene < 35 → 25 % Kontrolle, Bußgeld 400 ¢ (`fine`).
4. Verderb, Nachbestellung.
5. Ruf += 0,2 × (Ø Zufriedenheit − Ruf); Sterne = gleitender Mittelwert von 1 + 4 × Zufriedenheit/100 über Bewertungen (Gäste/8 pro Tag); Rufabzug bis 6 für verlorene Gäste.
6. Tagessatz in die Historie (30 Tage): Gäste, Umsatz, Wareneinsatz, Einkäufe, Löhne, Kosten, Zufriedenheit, Abgewiesene, Verlorene, Verderb.
7. Kontostand in `balanceHistory`; Unternehmensreputation folgt dem Mittel der Betriebe mit Faktor 0,1.

## Ausbauten

| Ausbau | Stufen | Kosten | Wirkung |
|---|---|---|---|
| Gastraum | 3 | 2.200 / 4.200 / 7.500 | +6 / +12 / +20 Plätze |
| Küche | 3 | 2.800 / 5.600 / 9.800 | ×1,25 / ×1,5 / ×1,8 Küchenleistung, +5 / +10 / +18 Qualität |
| Lager | 2 | 1.500 / 3.200 | +80 / +200 Einheiten, +1 / +2 Tage Haltbarkeit |
| Ausstattung | 3 | 1.800 / 3.600 / 7.200 | +6 / +12 / +20 Zufriedenheit, Anziehung ×1,08 / ×1,16 / ×1,26 |
| Hygienestation | 2 | 1.200 / 2.600 | Hygieneverlust ×0,6 / ×0,3 |
| Personalraum | 2 | 1.400 / 3.000 | +8 / +16 Moral |
| Leuchtreklame | 2 | 1.600 / 3.400 | Anziehung ×1,12 / ×1,24 |

Umbauzeit 6 bis 24 Stunden, währenddessen Kapazität −20 %, nur ein Umbau je Betrieb.

## Bevölkerung (Phase 3)

```
Bürger je Bezirk   = population/1000 × 7 (gedeckelt auf 2.400 je Stadt)
Beschäftigung      ≈ 0,55 + Kaufkraft/250; Einkommen = (40 + 1,6 × Kaufkraft) × U(0,6; 1,5) pro Tag
Miete je Bürger    = 0,9 × rentIndex + 10 pro Tag; Vermögen += Einkommen − Miete − 12
Essen gehen        : P(h) = Mahlzeitfaktor(h) × (0,12 + Kaufkraft/300 + 0,1 bei Mittag am Arbeitsplatz) × (0,5 + Hunger) × (0,3 falls Vermögen < 40)
Lokalwahl          : Score = Ruf/100 × (0,6 + 0,8 × Qualitätspräferenz) − 1,2 × Preissensibilität × (Preisniveau − 1) + 0,5 × Loyalität − Entfernung/45 ± N(0; 0,18); Umkreis 30 Felder
Loyalität          : += (Zufriedenheit − 55)/100 bei Bedienung, −0,25 bei Abweisung; verblasst ×0,97 pro Tag; max. 3 Favoriten
Nachfrage Spieler  = Bürgerbesuche + 0,55 × Laufkundschaft (Formel oben)
Kaufkraftdrift     : Ziel = Basis × (0,75 + 0,3 × Beschäftigung), max. ±1 pro Tag; Konkurrenzdruck = 10 + 9 × Betriebe im Bezirk
```

## Konkurrenz (KI)

```
Umsatz je Gast     = 15 × Preisniveau; Kosten 6 je Gast + 260 pro Tag; Kapazität 14–26 Gäste/h
Preispolitik       : Auslastung > 75 % → +0,05; < 45 % → −0,05; sonst 15 % Chance ±0,03 (0,65 … 1,6)
Investition        : Kasse > 4.000 und Qualität < 92 → 50 % Chance: −1.500 ¢, Qualität +4
Insolvenz          : 10 Verlusttage und Kasse < 500, oder Kasse < −2.500 → Gebäude wird „Leerstand“
Expansion          : alle 5 Tage im Bezirk mit den meisten Bürgern je Betrieb (≥ 40), bis 40 Betriebe
```

## Zutatenmarkt

```
Index je Zutat (0,6 … 1,9): += 0,12 × (1 − Index) + 0,03 × (Tagesnachfrage/900 − 1) ± N(0; 0,025); 2 % Chance auf Engpass (+0,25 … 0,5)
Einkaufspreis = basePrice × Lieferantenfaktor × Kostenfaktor × Index
```

## Hotel

```
Ankünfte/Tag  = baseDemand × (0,4 + Attraktivität/100) × (0,5 + Verkehr/150) × (0,6 + Einfluss/200) × Preis^(−(1,5 − Kaufkraft/150)) × (0,55 + 0,9 × Ruf/100) × (0,8 + 0,4 × Komfort/100) × Werbung × Nachfragefaktor
Check-ins/h   = min(Ankünfte, freie Zimmer, 6 × Rezeptionsleistung); ohne Rezeption 2/h; Aufenthalt 1–3 Nächte, Zahlung bei Check-in; VIP (3 % + Komfort/2000) zahlt +60 %
Kosten        = Zimmerkosten × belegte Zimmer × Reinigungsroboter-Faktor + Löhne + Betrieb
Sauberkeit    −= 0,9 × belegte Zimmer; += 6 + 9 × Housekeeping + 0,1 × Fähigkeit + 8 × Robotikstufe
Zufriedenheit = 0,35 × Komfort + 0,3 × Sauberkeit + 22 × (basePrice/Preis)^0,6 + 0,15 × (Rezeptionsfähigkeit − 50) + Sicherheit − 15 bei Zwischenfall (Chance = 0,08 × Kriminalität × Sicherheitsfaktor)
```

## Taxi

```
Fahrten/h (Spitze) = (6 × Σ Bezirke im Radius: Verkehr/100 × (0,4 + Kaufkraft/120) × Reichweite + 0,02 × Bürger) × (Tarif/Basis)^(−1,3) × (0,6 + 0,8 × Ruf/100)
Kapazität/h        = Σ aktive Fahrer (≤ einsatzbereite Fahrzeuge): ridesPerDriverHour × (0,6 + 0,8 × Fähigkeit/100) × Einsatz × Dispatch; nachts 60 %
Kosten je Fahrt    = Energie × Ladestationsfaktor; Verschleiß 0,35 × Fahrten je Fahrzeug × Werkstattfaktor; Unfallchance 0,0015 × Fahrten × (1,5 − Zustand/100) → 1.500–4.000 ¢ und 12–36 h Ausfall
Wartung            : Zustand < 30 → 900 ¢ × Werkstattfaktor, 10 h Ausfall; Fahrzeugkauf 9.500 ¢, Verkauf 45 % × Zustand
```

## Einzelhandel

```
Kunden/h (Spitze) = baseDraw × (0,5 + Verkehr/100) × Bevölkerungsfaktor × (0,7 + Kaufkraft/200) × Preisverhältnis^(−(1,4 − Kaufkraft/150)) × (0,6 + 0,8 × Ruf/100) × Werbung
Kapazität/h       = Σ Verkäufer: clerkRate × Regalfaktor × Fähigkeitsfaktor × Einsatz
Warenkorb         = 1–3 verfügbare Waren × 1–2 Einheiten × Regalfaktor; Umsatz = Regalpreise, Wareneinsatz FIFO
Schwund           = 0,04 × Kunden × Kriminalität × Sicherheitsfaktor × (0,4 mit Sicherheitspersonal)
```

## Immobilien

```
Kaufpreis      = (Grundstück × Felder + Etagen × Felder × (180 + 4 × Attraktivität) + Konkurrenzprämie) × Kostenfaktor
Miete/Tag      = Mieter × (0,9 × rentIndex + 10) × Mietniveau × (0,5 + Zustand/200)   // Wohngebäude
               = rentIndex × Felder × Etagen × 0,6 × Mietniveau × (0,5 + Zustand/200) × 1,3 bei Konkurrenzlokal   // Gewerbe
Instandhaltung = 4 ¢ × Etagen × Felder pro Tag; Zustand −0,4 − Verschmutzung/400 pro Tag
Renovierung    = 120 ¢ × Etagen × Felder, 36 h ohne Miete, Zustand 100
Mieterbewegung : Auszug P = 0,08 × (Mietniveau − 1)⁺ + (40 − Zustand)⁺/400; Zuzug bei Mietniveau < 1 und Zustand > 60
Verkauf        = 85 % des aktuellen Kaufpreises × (0,7 + Zustand/333)
```

## Unterwelt

```
Erfolgschance   = 1 − Risiko × (0,6 + 0,9 × Polizei/100) × (1 − 0,35 × Korruption/100) × (1,2 − Ø Fähigkeit/250) − 0,12 × (Fahndungsstufe − 1)⁺   (5 % … 97 %)
Job-Ertrag      = Basis × (0,6 + Kaufkraft/120) × U(0,85; 1,2) als Schwarzgeld; Misserfolg: Aufmerksamkeit ×1,5, 35 % Verhaftung je Mitglied (3–8 Tage)
Schutzgeld      = Σ Konkurrenten im Bezirk: 60 + 2 % Kasse × Kontrolle/100 pro Tag
Schwarzmarkt/Casino = Basis × (0,5 + Kaufkraft/100) × (0,5 + Kontrolle/100) pro Tag
Kontrolle       : +Operationswert bei Erfolg, −1,2 pro Tag ohne Präsenz, −Streifeneffekt
Aufmerksamkeit  : +heat je Operation (laufende ×0,6), +10 × Wäscheanteil, −2,5 pro Tag, Bestechung −4 je 500 ¢ / (1 + 0,5 × jüngste Bestechungen)
Geldwäsche      = min(Schwarzgeld, legale Tagesumsätze × Anteil (≤ 40 %) × 0,5 ab Stufe 3 × 0 ab Stufe 5); 80 % werden legal
Razzia (Stufe ≥ 4): Chance 0,3 + 0,25 je Stufe; Verhaftung 20–35 %, Beschlagnahme 25–50 % Schwarzgeld, Bußgeld 1.500 + 800 × Stufe; Stufe 6: vier Tage Stillstand
Revierkampf     : 25 % pro Tag je gemeinsamem Bezirk; Gewinnchance = (12 × Vollstrecker + Kontrolle) / (… + Stärke + Rivalenkontrolle)
```

## Sicherheitszentrale

```
Umsatz/Tag     = Σ Streifen: Wachleute × 95 ¢ × (0,7 + Kriminalität/120) + Betriebe im Bezirk × 18 ¢ × min(1, Wachleute/3)
Streifeneffekt = Wachleute × (0,3 + Ø Fähigkeit/200) × (0,5 + Ruf/200): Polizei +0,6 ×, Kriminalität −0,5 ×, Gebietskontrolle −0,8 × (eigene) bzw. −0,5 × (Familien)
Ermittlung     = Σ Ermittler (4 + Fähigkeit/10) pro Tag bis 100 → Familie −20 Stärke, Gebiete ×0,6, Prämie 4.000 ¢
Interessenkonflikt: Fahndungsstufe ≥ 3 → Ruf −6 pro Tag; ≥ 5 → alle Streifenverträge gekündigt
```

## Politik und Fraktionen

```
Umsatzsteuer     = Satz × Σ Verkäufe des Tages (4/8/12/16 %), Kategorie tax
Mindestlohn      : Löhne < Minimum werden angehoben; Lohnerwartung = max(Minimum, erwarteter Lohn)
Mietdeckel       : Mietniveau ≤ 1,6 / 1,3 / 1,1
Polizeibudget    : Polizeipräsenz-Ziel = Basis × Budget; Aufmerksamkeit −2,5/Budget pro Tag
Bauordnung       : Baukosten und Bauzeit × 0,85 / 1 / 1,25; Attraktivität +20 × (Faktor − 1)
Sperrstunde      : Gastronomie geschlossen 01–06 Uhr bzw. 23–06 Uhr; Kriminalitätsziel −4 je Stufe
Zustimmung       = 0,8 × Sitzanteil der begünstigten Partei + 0,35 × Einfluss/100 (5 … 95 %); Antrag 2.000 ¢, Abstimmung nach drei Tagen
Wahl (alle 30 Tage): Fortschritt ∝ Σ Bürger × Kaufkraft × (1 + Beziehung/400); Sozial ∝ Σ Bürger × (1 − Kaufkraft) × (1 + Arbeitslosigkeit)
Einfluss-Ziel    = 2,5 × Assets + 0,2 × max(0, Medienbeziehung) + 0,2 × max(0, Verwaltungsbeziehung) + Spenden/2000; Bezirkseinfluss-Ziel = 12 × Assets im Bezirk + Einfluss/4
Beziehung        : −2 % pro Tag Richtung 0; Gewerkschaft −1,5 bei > 30 % Unterbezahlten; Bürgerrat −1,2 bei Mietniveau > 130 %; Polizei −2 ab Fahndungsstufe 2, +0,8 mit Streifen; Unterstützung +3 je 500 ¢ × (1 − Einfluss/250), Gegner −30 % davon
Bezirksentwicklung: Attraktivitätsziel = Basis + 12 × (Ø Betriebsruf − 50)/50 + 8 × (Ø Zustand − 60)/60 − 0,3 × (Kriminalität − Basis) + 20 × (Bauordnung − 1) − 0,2 × (Verschmutzung − Basis), ±0,6/Tag
                   Miete/Grundstück-Ziel = Basis × (0,7 + Attraktivität/125), 3 %/Tag; Kriminalitätsziel = Basis × (0,6 + Arbeitslosigkeit) − 0,4 × (Polizei − Basis) − 4 × Sperrstunde + 0,15 × Gebietskontrolle
```

## Forschung

```
Punkte/Tag     = Σ Forscher (4 + Fähigkeit/8) × Einsatz × (1 + min(0,5; 0,15 × Techniker)); Kosten bei Start, 45–160 Punkte je Technologie
Effekte        : Kochleistung ×1,15 · Zimmerkosten ×0,8 · Fahrten ×1,25 · Warenkorb ×1,15 · Lieferzeit ×0,6 · Haltbarkeit +2 · Streifen ×1,3, Schwund ×0,5 · Zins −0,05 %-Punkte, Prämien ×0,8 · Bauzeit ×0,7, Baukosten ×0,9 · Verderb ×0,5 · Umsatz ×1,06 · Betriebskosten ×0,85, Fabrikenergie ×0,7 · Komfort +8 · Zufriedenheit +5 · Energiekrisen halb
```

## Industrie

```
Maschinen/Tag   = Basis × Maschinenpark × (1 + min(0,4; 0,1 × Techniker)) × min(1; 0,4 + 0,7 × Energie/100) × 0,6 bei Energiekrise
Arbeit/Tag      = Σ Arbeiter 8 h × Fähigkeitsfaktor × Einsatz; Einheiten = min(Ziel, Maschinen, Arbeit/Arbeit je Einheit, Rohstoffe)
Herstellkosten  = Rohstoffe (FIFO) + Energie × Technologiefaktor (×1,5 bei Energiekrise); Qualität = 50 + 0,4 × Ø Arbeiterfähigkeit + 5 × Maschinenstufe
Interne Lieferung: eigene Betriebe füllen Nachbestellziele zuerst aus Fabrikbeständen zu Herstellkosten
Großmarkt       = 85 % Basispreis × Marktindex; jede verkaufte Einheit senkt den Index um 1/20.000
Verschmutzung  += Einheiten/100 × Rezeptwert × (1 − 0,4 × Filterstufe)
```

## Konzernfinanzen

```
Bewertung      = Σ (0,7 × Investition + 25 × Ø Tagesgewinn der letzten 7 Tage) + max(0, Kontostand) − offene Kredite
Kreditrahmen   = 0,5 × Bewertung + 5.000 − offene Kredite; Zins 0,4 %/Tag (+0,4 bei Finanzskandal, +0,2 im Minus, −0,05 mit Kreditscoring); Rate 1/40 pro Tag; max. vier Kredite
Anteile        : Verkauf zu 90 % der Bewertung (70 % im Finanzskandal), max. 49 %; Dividende = Anteil × positives Tagesergebnis; Rückkauf 110 %
Versicherung   : Gebäude 60 ¢/Tag (80 % Unfälle, Zwischenfälle), Cyber 45 ¢ (80 %), Haftpflicht 30 ¢ (70 % Bußgelder), Diebstahl 25 ¢ (60 % Schwund)
Insolvenz      : Kontostand < −(5.000 + 0,2 × Bewertung) an drei Tagen → täglich Zwangsverkauf des kleinsten Vermögenswerts zu 60 %; ohne Vermögen: Insolvenz, Spiel pausiert
```

## Krisen

```
Start          : täglich je Krise mit Grundchance × (1 + Ø Kriminalität/100 + 0,3 mit Organisation), frühestens Tag 5 und 6 Tage nach der letzten
Energieknappheit: Energie −30 (Fusionszellen: −15), Fabriken ×0,6, Lieferzeit ×1,2 · Lieferkette: Einkauf ×1,5, Lieferzeit ×2, Marktindex ×1,3 · Rezession: Kaufkraft ×0,85, Nachfrage ×0,85
Immobilienblase: Grundstücke ×1,6, am Ende ×0,65 · Arbeitskräftemangel: Bewerber ×0,5, Lohnerwartung ×1,25 · Cyberwelle: 30 %/Tag Tagesumsatz ungesicherter Betriebe · Generalstreik: Einsatz ×0,5 · Hyperinflation: Einkauf und Löhne ×1,35 · Finanzskandal: Zins +0,4 %, Investoren ziehen 20 % ab
```

## Bezirkswerte (Auszug der Wirkung)

| Wert | Wirkung in Phase 1 |
|---|---|
| landPrice | Grundstückskosten |
| demandFood, traffic, population | Grundnachfrage |
| purchasingPower | Preiselastizität |
| competition | Grundkonkurrenz |
| crime, attractiveness | Sicherheitsfaktor der Nachfrage |
| energySupply | Bauzeit (×1,5 unter 50), Bauverbot unter 20 |
| rentIndex, policePresence, corruption, politicalInfluence, pollution, water, infrastructure | Angezeigt, Wirkung ab Phase 3–6 |

Alle Werte werden pro Stadt um ±7 % gestreut, Einwohnerzahlen nach Bezirksgröße skaliert.

## Beispielrechnung (Standard, Gastronom, Ramenbar im Neon Market)

Grundstück ≈ 1.041 ¢ + Bau 6.500 ¢ = 7.541 ¢. Ein Shoyu-Ramen braucht ca. 3,7 Zutateneinheiten (≈ 6 ¢ beim Neon Market Kurier) und kostet 18 ¢. Bei rund 120 Gästen am Tag: ≈ 2.100 ¢ Umsatz, ≈ 700 ¢ Wareneinsatz, ≈ 245 ¢ Löhne (zwei Mitarbeiter), 90 ¢ Betrieb, 90 ¢ Miete → ≈ +950 ¢. Ein zweiter Koch hebt die Kapazität, kostet aber ≈ 130 ¢/Tag; Ausbauten amortisieren sich über Zufriedenheit und Anziehung.

## Casino

Royal Nova Casino, Einsatz je Runde 10 bis 5.000 ¢ (Roulette: Summe aller Wetten). Einsatz wird beim Setzen gebucht (Kategorie Casino, Ausgabe), die Rückzahlung inklusive Einsatz beim Rundenende (Einnahme).

- **Slots:** drei unabhängige Walzen, Symbolgewichte Kirsche 30, Zitrone 25, Glocke 18, Bar 12, Sieben 8, Neon 5, Diamant 2 (je 100). Dreier: ×3, ×4, ×6, ×10, ×20, ×40, ×100; genau zwei Kirschen ×2; jedes andere Paar ×1. Auszahlungsquote = Σ p(Kombination) · Faktor = 0,875.
- **Roulette:** europäisch, 0–36. Zahl 35:1, Rot/Schwarz, Gerade/Ungerade, 1–18/19–36 1:1, Dutzend/Kolonne 2:1. Jede Wette zahlt im Mittel 36/37 des Einsatzes (97,3 %).
- **Blackjack:** unendlicher Schuh (jede Karte unabhängig gleichverteilt), Dealer steht auf jeder 17, Blackjack 3:2, Verdoppeln nur mit zwei Karten, kein Teilen, keine Versicherung. Gewinn zahlt den doppelten Einsatz zurück, Unentschieden den Einsatz.
- Alle Ziehungen nutzen den Simulations-RNG; der Einsatz muss durch das Konto gedeckt sein (Sandbox: unbegrenzt).
