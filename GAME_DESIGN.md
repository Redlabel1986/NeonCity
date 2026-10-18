# Game Design – Neon Dynasty

## Vision

Eine offene Sandbox in Nova Eclipse, 2187. Der Spieler beginnt mit wenig Geld in einem gemieteten Zimmer und kann legale und illegale Geschäfte, Immobilien, Sicherheit, Politik und Konzerne aufbauen. Es gibt keinen vorgeschriebenen Siegzustand. Die Stadt lebt auch ohne den Spieler.

Dieses Dokument beschreibt das Zielbild; der Abschnitt „Stand“ je Kapitel markiert, was umgesetzt ist.

## Welt

Acht Bezirksarchetypen mit eigenen Werten (Einwohner, Kaufkraft, Mieten, Grundstückspreise, Kriminalität, Polizei, Attraktivität, Infrastruktur, Verkehr, Energie, Wasser, Verschmutzung, Korruption, politischer Einfluss, Nachfrage, Konkurrenz):

Corporate Heights, Neon Market, Rust Docks, Ghost Quarter, Old City, Chrome District, The Undercity, Skyline Gardens.

**Stand:** Alle acht Bezirke werden prozedural erzeugt (verrauschte Voronoi-Regionen, Hafenfront im Osten, Straßenraster mit bezirksabhängiger Blockteilung, Stadtgebäude im Bezirksstil, Parks, Plätze, freie Grundstücke). Werte sind im Stadt-Panel sichtbar und wirken auf Baukosten, Bauzeit, Nachfrage, Hotelgäste, Taxifahrten, Schwund und Operationen; sie driften mit Bürgern, Betrieben, Politik und Kriminalität (siehe Fraktionen und Politik).

## Online-Welt

Alle Spieler eines Servers teilen sich Nova Eclipse zur selben Zeit: dieselben Grundstücke, Bürger, Konkurrenten, Fraktionen, Gesetze und Krisen. Jeder hat eigene Credits, Betriebe, Immobilien, Ruf, Organisation und Beziehungen. Wer ein Grundstück zuerst bebaut, hat es; fremde Betriebe sind sichtbar und im Inspektor als „Gebäude von …“ ausgewiesen, aber nicht steuerbar. Die Zeit läuft für alle gleich (Standard 1×, ein Spieltag in zwölf Minuten) und auch ohne Verbundene weiter; der Server speichert automatisch. Konten bestehen aus Name und Passwort; beim Registrieren wählt man seinen Hintergrund.

## Weiterlaufen

Die Stadt steht nicht still, wenn der Browser zu ist: Beim nächsten Laden (auch aus der Cloud) und nach einem Hintergrund-Tab wird die vergangene reale Zeit mit der echten Simulation nachgerechnet, gedeckelt auf 1 bis 90 Spieltage (Standard 30, abschaltbar). Ein Bericht zeigt Tage, Einnahmen, Ausgaben, Ergebnis und wichtige Ereignisse. Pausierte Spiele bleiben pausiert. In der Online-Welt übernimmt das der Server.

## Level und Regionen

Die Stadt ist eine Reise von West nach Ost: Greenhaven (ländlich, grün, Felder, Wälder, Seen, Solardächer; billig, ruhig, weniger Kunden, Nachfrage nach regionalen Produkten), Silverbrook (Vorstadt; Familien, Pendler, Supermärkte, Transport), Neon Central (dichte Stadt; hohe Preise, viele Kunden, starker Wettbewerb, Cyberpunk) und Nova Eclipse (Megacity; extreme Preise, Konzerne, höchstes Potenzial). Alle Regionen gehören zur selben Simulation; nichts wird zweimal gerechnet, ein Regionswechsel ist eine Kamerafahrt.

Der Spieler hat ein Level mit Erfahrungspunkten. Level 1 Greenhaven (0 XP), Level 2 Silverbrook (1.000), Level 3 Neon Central (5.000), Level 4 Nova Eclipse (20.000), konfigurierbar in `src/sim/data/regions.ts`. XP kommen aus Meilensteinen mit festen IDs (erstes Gebäude, erste Eröffnung, erste 100 Kunden, Gewinntag, zweiter Betrieb, erste Bestellung, erste Einstellung, erster Raumausbau, vier Sterne, zweite Branche, Immobilie, Rücklage, erstes Unternehmens-Upgrade, erste Filiale, Lieferkette, Übernahme, Gewinn 10k/100k/1M, Umsatz 10k bis 5M, Ruf 50/75/90), aus Entwicklungsstufen (40 XP je Stufenlevel, je Stufen-ID einmal), Forschung (60 je Knoten) und erschlossenen Regionen (150 je Region). Jede ID zählt genau einmal: Verkaufen und Neubauen bringt nichts. Der Aufstieg kommt sofort, öffnet die Region, zeigt den Level-Up-Dialog mit „Neuen Bezirk entdecken“.

Gesperrte Regionen: dort kein Bauen, Kaufen, Übernehmen; auf der Karte abgedunkelt. Gebäude haben Mindestlevel und teils Regionen (Bauernhof und Landgasthof nur Greenhaven, Hofladen Greenhaven und Silverbrook, Bank Neon Central und Nova Eclipse, Elektronikwerk Neon Central und Nova Eclipse). Höhere Entwicklungsstufen sind in jeder Region möglich: ein Landresort in Greenhaven, ein Sternerestaurant in der Vorstadt. Regionen wirken über die Bezirkswerte (Kaufkraft, Nachfrage, Grundstückspreise, Verkehr, Kriminalität) auf Nachfrage, Preise und Kosten. Regionale Ereignisse (Dorffest, Ernteausfall, Verkehrschaos, Handelskette, Konzernskandal, Megacity-Blackout) treffen nur ihre Region.

Logistik: Lieferanten sitzen in Neon Central, jede Region dazwischen kostet zwei Stunden. Eigene Fabriken und Höfe beliefern eigene Betriebe gegen 0,2 ¢ je Einheit und Region; über zwei Regionen kommt nur die halbe Tagesmenge. Greenhaven liefert Gemüse, Premium-Kräuter und Bio-Getreide, Silverbrook verarbeitet (Lebensmittelfabrik ab Level 2), die Stadt verkauft.

„Aufstieg“ lässt sich im Hauptmenü abschalten: freies Spiel mit allen Regionen und Stufen; dann startet der Hintergrund in seinem eigenen Bezirk.

## Entwicklungsbaum

Jeder Betriebstyp besitzt einen gerichteten Graphen aus Entwicklungsstufen (`src/sim/data/evolution.ts`, stabile IDs wie `asia.izakaya`). Eine Stufe hat Level 1 bis 6, eine Spezialisierung, Kosten, Umbauzeit, Voraussetzungen (Ruf, Zufriedenheit, Tagesumsatz, Betriebsalter, Mitarbeiter mit Fähigkeit, Forschung, Raumausbau, Spielerlevel), Freischaltungen (Rezepte, Rollen, Räume), Mechaniken und Effekte. Effekte wirken in der Wirtschaft: Kapazität (Plätze, Zimmer, Maschinen, Bankbilanz), Durchsatz (Koch-, Verkaufs-, Fahr-, Forschungsleistung), Anziehung, Qualität, Preisniveau (verschiebt die Preisakzeptanz und die Preisgrenzen), Betriebskosten, Lohnerwartung, Öffnungszeiten, Zusatzumsatz je Nacht, Radius, Produktionslinien, Bankhebel. Mechaniken: Lieferdienst, Reservierungen, Kritiker und Sterne, Franchise, Automatisierung, Nachtgeschäft, VIP, Wellness, Casino, Konferenzen, fahrerlos, Flugtaxi, gesicherte Transporte, Disposition, Gruppe. Prestige ist nicht Gewinn: Luxusstufen haben weniger Plätze, höhere Kosten, höhere Lohnerwartung und anspruchsvollere Voraussetzungen; eine Fastfood-Kette verdient über Masse und Lizenzgebühren.

Ein Ausbau ist atomar: Prüfung, Buchung, Umbauzeit mit −20 % Kapazität, Anwendung, Freischaltung genau einmal (die Historie der Stufen wird gespeichert). Abbruch erstattet 70 %. Der Name folgt der Stufe, solange der Spieler ihn nicht geändert hat; ab Stufe 3 wächst das Gebäude sichtbar zu einem größeren Bau im Stil der Stufe mit eigenem Schild. Ketten mit Franchise sind Organisationsebene: Lizenzgebühren ohne eigenes Gebäude, aber mit Rufrisiko.

## Banken

Ab Level 3 in Neon Central und Nova Eclipse. Gründungskapital wird zur Rücklage; die Bank sammelt Einlagen der Bevölkerung (Bevölkerung, Kaufkraft, Einlagenzins, Ruf, Bankkaufleute) und reicht Kredite aus (Kreditzins, Analysten). Zinseinnahmen minus Einlagenzinsen minus Ausfälle (Kriminalität, Korruption, Analystenfähigkeit, zu hohe Zinsen) sind das Ergebnis; Löhne und Betriebskosten kommen dazu. Die Bilanz ist auf Rücklage × Hebel begrenzt, die Rücklage muss 10 % der Einlagen decken, sonst stoppt die Aufsicht neue Einlagen. Kapital lässt sich ein- und auszahlen, beim Schließen kommt die Rücklage zurück, Kredite werden mit Abschlag verkauft, Einlagen ausgezahlt.

## Cheat

Wer eine Ramen-Bar in „McNoodle69“ umbenennt (Inspektor → Umbenennen, Groß-/Kleinschreibung egal), bekommt beim Tagesabschluss den Tagesgewinn dieser Bar auf genau +10.000 ¢ aufgefüllt: Die Differenz zu Umsatz minus Löhnen, Betriebskosten, Einkäufen und Strafen wird als Verkauf „Geheimrezept“ gebucht und erscheint in Finanzen und Betriebshistorie. Umbenennen zurück schaltet den Cheat ab. In der Online-Welt gilt er für jeden, der die Bar so nennt.

Zweiter Cheat: Eine Ramen-Bar namens „McNoodle6969“ bucht jede Spielstunde 2.500 ¢ Umsatz (Verkauf „Stammkundschaft“), auch außerhalb der Öffnungszeiten, also 60.000 ¢ am Tag zusätzlich zum normalen Geschäft. Die beiden Namen sind getrennte Cheats; eine Bar hat immer nur einen Namen.

## Casino

Das Royal Nova Casino im Neon Market steht jedem Spieler offen (`J`): Slots, Roulette und Blackjack um die eigenen Credits, Einsätze von 10 bis 5.000 ¢. Das Haus hat einen Vorteil (Slots 12,5 %, Roulette 2,7 %, Blackjack je nach Spielweise wenige Prozent), die Ergebnisse kommen aus dem Zufallsgenerator der Simulation und sind online für alle gleich. Gewinne und Verluste erscheinen als Buchungen in den Finanzen.

## Spielerfreiheit und Hintergründe

Zehn Hintergründe (Straßenkind, Ex-Konzernangestellter, Gastronom, Immobilienerbe, Mechaniker, Ehemaliger Polizist, Hacker, Schmuggler, Unternehmensberater, Gangmitglied) beeinflussen Startkapital, Miete, Heimatbezirk, Startbeziehungen zu Fraktionen und je einen Vorteil im passenden System (Fahrzeugverschleiß, Forschung, Gründungskosten, Schwarzgeld, politischer Einfluss, Crew-Fähigkeit, Abklingen der Aufmerksamkeit).

## Bau und Immobilien

Grundstück kaufen, bauen, Bauzeit abwarten, Rückgängig bei laufender Baustelle, Abriss. Jedes Gebäude hat eine Ausrichtung: Eingang und Beschriftung liegen auf einer Grundstückskante, die an eine Straße grenzen muss. Beim Platzieren wird automatisch eine Straßenseite gewählt; `Q`/`E` dreht das Gebäude, eine Kante ohne Straße wird abgelehnt. Räume sind als Ausbauten je Branche umgesetzt (Gastraum, Küche, Lager, Lobby, Zimmer, Werkstatt, Regale, Maschinenpark, Filter); Vermietung und Renovierung über die Immobilienverwaltung. Beim Verwalten eines Betriebs fliegt die Kamera ins Gebäude und zeigt den Innenraum: Zonen je Branche, Einrichtung aus den Ausbauten, Personal an den Stationen, Gäste und Kunden aus der laufenden Stunde, Lagerfüllstände; Zonen öffnen per Klick den passenden Reiter des Dashboards.

**Stand:** Alle elf Gebäudetypen baubar. Bau benötigt Credits, Zeit, Straßenanschluss an der Eingangskante und Energie; Baukosten und -zeit werden von Gesetzen und Forschung beeinflusst.

## Unternehmen

Generisches Unternehmensframework: Gebäude mit optionalem `BusinessState`, branchenspezifische Modelle als Discriminated Union.

**Stand Phase 2 (Gastronomie):**
- Speisekarte aus Rezepten mit Zutatenbedarf, Beliebtheit und Anspruch; Preise je Gericht; Gäste wählen nach Beliebtheit und Preis.
- Zutatenlager mit Losen (Qualität, Kaufdatum, Einstandspreis), Haltbarkeit und Verderb; Kapazität durch Lagerausbau.
- Vier Lieferanten mit Preisfaktor, Qualität, Lieferzeit, Verspätungsrisiko und Mindestbestellwert; automatische Nachbestellung; Manager optimiert Ziele.
- Mitarbeiter (Koch, Service, Manager) mit Fähigkeit, Lohn, Moral; Bewerber; Kündigungen bei Unzufriedenheit.
- Kapazität = min(Plätze, Küchenleistung, Serviceleistung); Ausbauten erhöhen die Engpässe.
- Zufriedenheit je Gast aus Gerichtsqualität, Preis-Leistung, Hygiene, Service, Ausstattung und Andrang; daraus Ruf und Sternebewertungen.
- Hygiene sinkt mit Gästen, wird nachts gereinigt; Kontrollen verhängen Bußgelder.
- Tagesabrechnung je Betrieb: Gäste, Umsatz, Wareneinsatz, Einkäufe, Löhne, Verderb, Zufriedenheit.

Die Ramenbar, der Streetfood-Stand und der Imbiss nutzen dasselbe Modell mit unterschiedlichen Daten (Rezepte, Plätze, Ausbauten).

**Stand Phase 4 (weitere Branchen):**
- Hotellerie: Kapselhotel und Businesshotel mit Zimmern, Zimmerpreis, Komfort, Sauberkeit, Rezeption, Housekeeping, Sicherheit, VIP-Gästen, Bewertungen und Zwischenfällen.
- Transport: Taxidepot mit Flotte (Zustand, Kilometer, Werkstatt, Unfälle), Fahrern, Tarif, Radius und Nachfrage aus Verkehr und Bürgern.
- Einzelhandel: Nachtkiosk mit Sortiment, Regalpreisen, Warenkörben, Bürgerbesuchen, Schwund und Sicherheitspersonal.
- Immobilienverwaltung: Stadtgebäude kaufen, Miete von Bewohnern oder Pacht von Gewerbe, Mietniveau, Zustand, Renovierung, Verkauf, Abriss für Bauland; Übernahme von Konkurrenzlokalen.

## Wirtschaft

Siehe [ECONOMY.md](ECONOMY.md). Grundregel: kein Geld ohne Transaktion, nachvollziehbare Finanzberichte (Finanzen-Panel: Tagessummen, Kategorien, Buchungen; Statistik-Panel: Zeitreihen).

## NPCs und Bevölkerung

**Stand Phase 3:** Mehrstufige Simulation: Bezirkswerte (aggregiert) liefern Laufkundschaft; bis zu 2.400 Bürger als Agenten haben Wohnung, Arbeitsplatz, Einkommen, Vermögen, Präferenzen, Hunger und einen Tagesablauf. Zu Mahlzeiten wählen sie ein Lokal (Spieler oder Konkurrenz) nach Ruf, Preis, Loyalität und Entfernung. Gute Erfahrungen machen sie zu Stammgästen, Abweisungen und schlechtes Essen vertreiben sie. Bürger zahlen Miete, verdienen Lohn, verlieren und finden Jobs. Beschäftigung treibt die Kaufkraft des Bezirks.

**KI-Konkurrenz:** Rund 20 Lokale in Stadtgebäuden mit eigener Kasse. Sie heben Preise bei Auslastung, senken sie bei Leere, investieren in Qualität, schließen nach anhaltenden Verlusten und eröffnen neue Lokale dort, wo viele Bürger auf wenige Betriebe kommen.

## Kriminalität und Sicherheit

**Stand Phase 5:** Der Spieler kann eine Organisation gründen (Stellvertreter, Berater, Bezirksleiter, Vollstrecker, Fahrer, Informanten, Buchhalter, Hacker, Rekruten) und mit ihr Jobs (Präsenz, Schmuggel, Datendiebstahl, Hehlerei) und laufende Geschäfte (Schutzgeld, Schwarzmarkt, Casino) betreiben. Erträge sind Schwarzgeld und müssen über legale Betriebe gewaschen werden. Territorium verfällt ohne Präsenz; drei Familien kämpfen um Bezirke, Tribut kauft Frieden. Die Polizeiaufmerksamkeit bestimmt sieben Fahndungsstufen mit Razzien, Beschlagnahmungen und einer stadtweiten Operation. Bestechung hilft, mit abnehmender Wirkung.

Die Sicherheitszentrale ist die legale Gegenseite: Streifen verdienen Verträge von Stadt und Betrieben, senken Kriminalität und Gebietskontrolle aller Organisationen; Ermittler schwächen Familien. Wer beides betreibt, bekommt interne Ermittlungen und verliert Verträge.

## Fraktionen und Politik

**Stand Phase 6:** Zwölf Fraktionen mit Zielen, Einfluss, Verbündeten und Gegnern handeln selbstständig: Die Gewerkschaft droht mit Streik bei Unterbezahlung, der Bürgerrat protestiert gegen hohe Mieten, Kōsei bietet Übernahmen an, Null Sect erpresst ungesicherte Betriebe, NovaNet berichtet, die Grüne Zelle blockiert in verschmutzten Bezirken, die Kirche sammelt, die Polizei bietet Kooperation. Jede dieser Situationen ist eine Entscheidung mit Optionen und Folgen.

Der Stadtrat aus Fortschrittsblock und Sozialer Allianz wird alle 30 Tage gewählt und beschließt Gesetze (Umsatzsteuer, Mindestlohn, Mietdeckel, Polizeibudget, Bauordnung, Sperrstunde), die in Finanzen, Personal, Immobilien, Bau, Gastronomie und Fahndung wirken. Politischer Einfluss entsteht aus Betrieben, Immobilien, Spenden und Beziehungen und erlaubt Anträge und Bezirksinitiativen.

Bezirke entwickeln sich dynamisch: gute Betriebe und gepflegte Gebäude heben die Attraktivität, Mieten und Grundstückspreise steigen, einkommensschwache Bürger werden verdrängt; Arbeitslosigkeit, Gebietskontrolle und Polizeibudget bewegen die Kriminalität.

## Forschung, Industrie, Konzernfinanzen, Krisen

**Stand Phase 7:** Forschungslabore erforschen 16 Technologien in neun Bäumen; jede verändert konkrete Zahlen in den Betrieben. Fabriken verarbeiten Rohstoffe zu Lebensmitteln, Getränken, Snacks, Stims und Ersatzteilen, beliefern die eigenen Betriebe zu Herstellkosten und verkaufen Überschuss an den Großmarkt. Das Unternehmen hat eine Bewertung, kann Kredite aufnehmen, Anteile an Investoren verkaufen (Dividenden) und sich versichern. Wer zu tief ins Minus rutscht, erlebt Zwangsverkäufe und schließlich die Insolvenz. Neun Krisenarten treffen die Stadt mit zeitlich begrenzten, konkreten Folgen.

**Stand Phase 9:** Ab 400.000 ¢ Bewertung, sechs Betrieben und drei Branchen wird die Gruppe zum Megakonzern: Kettenübernahmen ganzer Bezirke, Lieferverträge der eigenen Fabriken mit Konkurrenten, mehr politischer Einfluss, dafür Rivalität der anderen Konzerne. Wer genug hat, verkauft die ganze Gruppe und beginnt mit neuem Hintergrund eine neue Karriere in derselben Stadt.

Das Endgame entsteht aus dem Zusammenspiel: Fabriken sichern Lieferketten gegen Krisen, Forschung senkt Kosten, Immobilien und Politik formen Bezirke, Fraktionen und Familien reagieren auf Macht, und Investoren oder Kredite hebeln das Wachstum mit Risiko. Die Datengrundlage (Bezirkswerte für Kriminalität, Polizeipräsenz, Korruption, Einfluss; Fahndungsstufen 0–6 im Spielerzustand) ist bereits angelegt, damit spätere Systeme ohne Formatbruch andocken.

## Spielablauf

1. Spielstart: Name, Seed, Hintergrund, Schwierigkeit (Story, Casual, Standard, Hardcore, Sandbox).
2. Einstieg in den Heimatbezirk; Aufgabenliste führt ohne Zwang: erste Baustelle, erste Eröffnung, 100 Gäste, Gewinntag, zweiter Standort, Reserve.
3. Mittelfristiges Ziel: mehrere Standorte, Preise je Bezirk, Reserven für Phase-2-Inhalte.

## Interface

Futuristisches Betriebssystem auf schwarzem Grund: Stadt im Zentrum, schmale Kopfleiste (Credits, Tagesergebnis, Uhrzeit, Datum, Geschwindigkeit, Ruf, Fahndung), linke Navigation (Stadt, Bauen, Unternehmen, Immobilien, Personal, Finanzen, Forschung, Fraktionen, Politik, Unterwelt, Statistik; gesperrte Punkte tragen ihre Phase), rechter Inspektor für die Auswahl, unteres Dock (Ereignisse, Aufgaben, Warnungen, Bauwerkzeuge), Übersichtskarte. Beim Verwalten eines Betriebs liegt die Innenansicht in der Mitte zwischen Dashboard und Inspektor; `Esc` oder „Zur Stadt“ kehrt zur Karte zurück.

Neon wird nur für Beleuchtung, Daten und Interaktion eingesetzt; Textflächen bleiben ruhig und kontrastreich.

Auf Telefonen (unter 768 px) weicht das Layout: kompakte Kopfleiste, Bottom-Navigation (Stadt, Bauen, Betriebe, Finanzen, Mehr), Panels als Sheets von unten; Dashboard und Inspektor nehmen die untere Hälfte, damit Karte und Innenansicht sichtbar bleiben. Ein Finger schwenkt, zwei Finger zoomen, Platzieren bestätigt man in einer Leiste nach dem ersten Tipp.

### Barrierefreiheit (Ziel WCAG 2.2 AA)
Umgesetzt: Tastaturbedienung aller Panels und Dialoge, sichtbarer Fokus, semantische Rollen (banner, navigation, complementary, dialog, meter), Beschriftungen, skalierbare UI (85–140 %), reduzierte Bewegung (Systemeinstellung und Schalter), tabellarische Daten in Panels, keine reine Farbcodierung (Text und Symbole begleiten Farbe). Offen: frei belegbare Tasten, Screenreader-Beschreibung der Kartenkacheln.

## Visueller Stil

Isometrisches 2,5D, prozedural gezeichnet: Straßen mit Bordsteinen, Markierungen und Laternen; Gebäude mit Gehweg rundherum, je Gebäude variierter Palette, Fenstermustern, Erdgeschossen (Lobby, Laden mit Markise, Rolltor), Dachaufbauten, Antennen; Neonschilder je Gebäude unterschiedlich (Hängeschilder, Leuchtkästen mit Wortmarke, Logos, LED-Wände, Dachtafeln) und auch am Tag an; bezirksabhängige Paletten; Tag-/Nachtzyklus mit Fensterlicht, Lichtkegeln vor Eingängen, Leuchtreklame und Flackern; Passanten und isometrische Fahrzeuge mit Scheinwerfern; Regen, Nebel und Gewitter mit Reflexen auf nassen Straßen. Alle Effekte sind abschaltbar.

## Audio

Prozedural erzeugt: Regenrauschen, Stadtbrummen nach Verkehr und Tageszeit, Donner, ein generativer Synth-Pad als Musik, Bedienklänge und Benachrichtigungstöne. Getrennte Lautstärken, Start erst nach Benutzereingabe.
