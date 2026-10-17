# Game Design – Neon Dynasty

## Vision

Eine offene Sandbox in Nova Eclipse, 2187. Der Spieler beginnt mit wenig Geld in einem gemieteten Zimmer und kann legale und illegale Geschäfte, Immobilien, Sicherheit, Politik und Konzerne aufbauen. Es gibt keinen vorgeschriebenen Siegzustand. Die Stadt lebt auch ohne den Spieler.

Dieses Dokument beschreibt das Zielbild; der Abschnitt „Stand“ je Kapitel markiert, was umgesetzt ist.

## Welt

Acht Bezirksarchetypen mit eigenen Werten (Einwohner, Kaufkraft, Mieten, Grundstückspreise, Kriminalität, Polizei, Attraktivität, Infrastruktur, Verkehr, Energie, Wasser, Verschmutzung, Korruption, politischer Einfluss, Nachfrage, Konkurrenz):

Corporate Heights, Neon Market, Rust Docks, Ghost Quarter, Old City, Chrome District, The Undercity, Skyline Gardens.

**Stand:** Alle acht Bezirke werden prozedural erzeugt (verrauschte Voronoi-Regionen, Hafenfront im Osten, Straßenraster mit bezirksabhängiger Blockteilung, Stadtgebäude im Bezirksstil, Parks, Plätze, freie Grundstücke). Werte sind im Stadt-Panel sichtbar und wirken auf Baukosten, Bauzeit, Nachfrage, Hotelgäste, Taxifahrten, Schwund und Operationen; sie driften mit Bürgern, Betrieben, Politik und Kriminalität (siehe Fraktionen und Politik).

## Spielerfreiheit und Hintergründe

Zehn Hintergründe (Straßenkind, Ex-Konzernangestellter, Gastronom, Immobilienerbe, Mechaniker, Ehemaliger Polizist, Hacker, Schmuggler, Unternehmensberater, Gangmitglied) beeinflussen Startkapital, Miete, Heimatbezirk, Startbeziehungen zu Fraktionen und je einen Vorteil im passenden System (Fahrzeugverschleiß, Forschung, Gründungskosten, Schwarzgeld, politischer Einfluss, Crew-Fähigkeit, Abklingen der Aufmerksamkeit).

## Bau und Immobilien

Grundstück kaufen, bauen, Bauzeit abwarten, Rückgängig bei laufender Baustelle, Abriss. Jedes Gebäude hat eine Ausrichtung: Eingang und Beschriftung liegen auf einer Grundstückskante, die an eine Straße grenzen muss. Beim Platzieren wird automatisch eine Straßenseite gewählt; `Q`/`E` dreht das Gebäude, eine Kante ohne Straße wird abgelehnt. Räume sind als Ausbauten je Branche umgesetzt (Gastraum, Küche, Lager, Lobby, Zimmer, Werkstatt, Regale, Maschinenpark, Filter); Vermietung und Renovierung über die Immobilienverwaltung. Ein sichtbarer Innenraum-Modus ist nicht umgesetzt (TASKS.md).

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

Futuristisches Betriebssystem auf schwarzem Grund: Stadt im Zentrum, schmale Kopfleiste (Credits, Tagesergebnis, Uhrzeit, Datum, Geschwindigkeit, Ruf, Fahndung), linke Navigation (Stadt, Bauen, Unternehmen, Immobilien, Personal, Finanzen, Forschung, Fraktionen, Politik, Unterwelt, Statistik; gesperrte Punkte tragen ihre Phase), rechter Inspektor für die Auswahl, unteres Dock (Ereignisse, Aufgaben, Warnungen, Bauwerkzeuge), Übersichtskarte.

Neon wird nur für Beleuchtung, Daten und Interaktion eingesetzt; Textflächen bleiben ruhig und kontrastreich.

### Barrierefreiheit (Ziel WCAG 2.2 AA)
Umgesetzt: Tastaturbedienung aller Panels und Dialoge, sichtbarer Fokus, semantische Rollen (banner, navigation, complementary, dialog, meter), Beschriftungen, skalierbare UI (85–140 %), reduzierte Bewegung (Systemeinstellung und Schalter), tabellarische Daten in Panels, keine reine Farbcodierung (Text und Symbole begleiten Farbe). Offen: frei belegbare Tasten, Screenreader-Beschreibung der Kartenkacheln.

## Visueller Stil

Isometrisches 2,5D, prozedural gezeichnet: Straßen mit Bordsteinen, Markierungen und Laternen; Gebäude mit Gehweg rundherum, je Gebäude variierter Palette, Fenstermustern, Erdgeschossen (Lobby, Laden mit Markise, Rolltor), Dachaufbauten, Antennen; Neonschilder je Gebäude unterschiedlich (Hängeschilder, Leuchtkästen mit Wortmarke, Logos, LED-Wände, Dachtafeln) und auch am Tag an; bezirksabhängige Paletten; Tag-/Nachtzyklus mit Fensterlicht, Lichtkegeln vor Eingängen, Leuchtreklame und Flackern; Passanten und isometrische Fahrzeuge mit Scheinwerfern; Regen, Nebel und Gewitter mit Reflexen auf nassen Straßen. Alle Effekte sind abschaltbar.

## Audio

Prozedural erzeugt: Regenrauschen, Stadtbrummen nach Verkehr und Tageszeit, Donner, ein generativer Synth-Pad als Musik, Bedienklänge und Benachrichtigungstöne. Getrennte Lautstärken, Start erst nach Benutzereingabe.
