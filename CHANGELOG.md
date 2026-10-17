# Changelog

## 0.9.0 – Phase 9: Konzern und Karriere (2026-10-16)

### Hinzugefügt

- Megakonzern-Status ab 400.000 ¢ Bewertung, sechs Betrieben und drei Branchen: Konzerne werden zu Rivalen, Medien und Verwaltung freundlicher, politischer Einfluss steigt. Verlust des Status bei halbierter Bewertung.
- Kettenübernahme: Als Megakonzern alle Konkurrenzlokale eines Bezirks in einem Zug kaufen (90 % der Einzelpreise, zehn Tage Kartellprüfung, Kōsei und Gewerkschaft reagieren).
- Lieferverträge: Fabriken eines Megakonzerns verkaufen Nudeln, Brühe, Synth-Fleisch und Getränke an Konkurrenzlokale im Umkreis zu 95 % des Basispreises, bevor der Überschuss an den Großmarkt geht.
- Unternehmensgruppe verkaufen: alle Betriebe und Immobilien zu 90 % ihres Werts, Kredite werden getilgt, die Organisation löst sich auf; danach neue Karriere mit neuem Hintergrund, Wohnung, Vorteilen und Startbeziehungen in derselben Stadt (Kapital bleibt, Aufgaben beginnen neu).
- Bezirksabhängige Musik: Tonhöhe und Helligkeit des Pads folgen dem Bezirk unter der Kamera.
- Spielstandformat Version 9 mit Migration; 3 neue Unit-Tests und ein Phase-9-E2E-Test.

## 0.8.1 – Audit und Konsolidierung (2026-10-16)

### Behoben

- Im Entwicklungsmodus (`npm run dev`, React StrictMode) startete das Spiel nicht: Die Stadtkarte wurde beim doppelten Mount abgebaut, bevor PixiJS initialisiert war, und warf einen Fehler. Der Renderer prüft den Zustand jetzt vor dem Abbau. Der Produktionsbuild war nicht betroffen.
- Einzelhandel berechnete Umsatz für die gewünschte statt der tatsächlich entnommenen Menge; bei knappem Bestand wurde zu viel kassiert.
- Dividenden wurden auf das Tagesergebnis inklusive Kreditauszahlungen und Anteilsverkäufen gezahlt; jetzt zählt nur das operative Ergebnis (neue Buchungskategorie „Kapital (Anteile)“).
- Abriss eines Gebäudes ließ Bürger mit ungültiger Wohnung oder Arbeitsplatz zurück und behielt Konkurrenzlokal- und Casino-Referenzen; Bürger ziehen jetzt um, Referenzen werden entfernt.
- Küchen- und Fahrassistenz-Forschung wirkten in der Simulation, aber Inspektor und Dashboards zeigten die Kapazität ohne Technologieeffekt.
- Übernommene Konkurrenzlokale mit größerer Grundfläche wurden als 1×1-Imbiss gezeichnet.
- Der Entscheidungs-Knopf in der Kopfleiste schloss nur das Panel; er öffnet jetzt den Entscheidungen-Tab im Dock.
- Forschung ließ sich nur mit dem ersten Labor starten; bei mehreren Laboren gibt es eine Auswahl.
- Die Hilfe zeigte feste Tasten statt der aktuellen Belegung; veraltete Texte im Hauptmenü und in Warnungen.
- Statistik zeigte nur Gastronomie-Verläufe; jetzt Tagesergebnisse aller Betriebe. Fabriken weisen interne Lieferungen an eigene Betriebe aus.
- Lokalen gingen ab dem Nachmittag die Zutaten aus, weil die Nachbestellziele nur dem Startbestand entsprachen: Ziele werden jetzt aus Kapazität, Öffnungszeit und angebotenen Gerichten abgeleitet (etwa 1,3 Tage Vollauslastung), Lager und Startbestände der Lokale sind entsprechend größer.

### Hinzugefügt

- Sechs weitere Hintergründe (Mechaniker, Ehemaliger Polizist, Hacker, Schmuggler, Unternehmensberater, Gangmitglied) mit Startbeziehungen zu Fraktionen und je einem konkreten Vorteil (Fahrzeugverschleiß, Forschungstempo, Gründungskosten und Schwarzgeld, politischer Einfluss, Crew-Fähigkeit, Abklingen der Aufmerksamkeit).
- Audit-Tests für die behobenen Fehler sowie ein Leistungstest, der Simulationskosten, Spielstandgröße und Speicherzuwachs ausgibt.

### Geprüft

- Leistung (Node, 96×96 Stadt, über 1.000 Bürger, eine Ramenbar): rund 200 ms je Spieltag, Spielstand rund 1,1 MB JSON, Speicherzuwachs über drei Tage rund 11 MB; Protokoll und Buchungen bleiben begrenzt (200 bzw. 300 Einträge).

## 0.8.0 – Phase 8: Polish (2026-10-16)

### Hinzugefügt

- Wetter in der Simulation (klar, Regen, Nebel, Gewitter; seed-deterministisch, Verschmutzung erhöht Regen und Nebel) mit Wirkung auf Laufkundschaft, Einkaufsbummel und Taxinachfrage; Wetteranzeige in der Kopfleiste.
- Wetterdarstellung: Regenstreifen, Nebelschleier, Blitze, stärkere Neonreflexe bei Nässe; abschaltbar über Effekte und reduzierte Bewegung.
- Prozedurales Audio ohne Sample-Dateien: Regenrauschen, Stadtbrummen nach Verkehr und Nacht, Donner, generativer Synth-Pad als Musik, Bedienklänge und Benachrichtigungstöne; getrennte Lautstärken für Gesamt, Umgebung, Musik und Bedienung; startet erst nach einer Benutzereingabe.
- Heatmaps auf der Übersichtskarte (Kriminalität, Polizei, Kaufkraft, Attraktivität, Mieten, Verschmutzung, Nachfrage, Gebietskontrolle).
- Frei belegbare Tastenkombinationen für Pause, Geschwindigkeiten, Panels und Hilfe, mit Konfliktprüfung und reservierten Kameratasten.
- Kontrastmodus (folgt der Systemeinstellung, umschaltbar), größere Fokusrahmen.
- Einstiegshinweis beim ersten Start mit den ersten drei Schritten.
- Balancing-Tests: Standardlauf mit Ramenbar über zwölf Tage profitabel, Schwierigkeitsgrade geordnet, Kiosk und Kapselhotel in passenden Bezirken profitabel.
- Spielstandformat Version 8 mit Migration; 5 neue Unit-Tests und ein Phase-8-E2E-Test.

### Geändert

- Einstellungen in zwei Spalten (Darstellung und Audio, Tastenbelegung).

## 0.7.0 – Phase 7: Erweiterte Simulation (2026-10-16)

### Hinzugefügt

- Forschung: Forschungslabor als neue Branche (Forscher, Techniker), neun Forschungsbäume mit 16 Technologien, die alle Betriebe verändern (Kochleistung, Zimmerkosten, Fahrten, Warenkörbe, Lieferzeiten, Haltbarkeit, Streifeneffekt, Kreditzins, Bauzeit und -kosten, Verderb, Umsatz, Betriebskosten, Komfort, Zufriedenheit); neue Rezepte Synth-Sushi und Labor-Steak.
- Industrie: Lebensmittelfabrik und Elektronikwerk mit Produktionslinien, Rohstoffen (Proteinbasis, Synth-Getreide, Chemikalien, Elektronikmodule), Arbeitern, Technikern, Maschinenpark, Energiekosten, Verschmutzung und Filteranlagen. Fertigware beliefert zuerst die eigenen Betriebe (interne Lieferkette zu Herstellkosten) und geht dann als Überschuss an den Großmarkt, was den Marktindex senkt.
- Konzernfinanzen: Unternehmensbewertung, Bankkredite mit Rahmen, Tageszins und Raten, Investoren (Anteile bis 49 % verkaufen, Dividenden aus dem Tagesgewinn, Rückkauf), vier Versicherungen mit Prämien und Leistungen bei Unfällen, Zwischenfällen, Cyberangriffen, Bußgeldern und Schwund, Zahlungsunfähigkeit mit Zwangsverkäufen und Insolvenz (Spielende mit Laden/Neustart).
- Wirtschaftskrisen: Energieknappheit, Lieferkettenkrise, Rezession, Immobilienblase mit Platzen, Arbeitskräftemangel, Cyberangriffswelle, Generalstreik, Hyperinflation, Finanzskandal; alle mit konkreten, zeitlich begrenzten Wirkungen, Krisenanzeige in der Kopfleiste.
- Panels Forschung (Taste R), Finanzen mit Konzernbereich, Dashboards für Labor und Fabrik; Insolvenz-Dialog.
- Spielstandformat Version 7 mit Migration; 10 neue Unit-Tests und ein Phase-7-E2E-Test.

## 0.6.0 – Phase 6: Fraktionen und Politik (2026-10-16)

### Hinzugefügt

- Zwölf Fraktionen (zwei Megakonzerne, Gewerkschaft, Bürgerrat, Polizei, Hackerkollektiv, Medien, zwei Parteien, Stadtverwaltung, Aktivisten, religiöse Bewegung) mit Zielen, Einfluss, Verbündeten, Gegnern, Heimatbezirken und Beziehung zum Spieler. Beziehungen driften mit Löhnen, Mieten, Sicherheit, Verwicklungen und Spenden; Unterstützung verärgert Gegner.
- Entscheidungen mit Ursache, Optionen und Folgen: Streikdrohung (Löhne erhöhen, zahlen, aushalten), Mieterprotest, Übernahmeangebot eines Konzerns, Cyberangriff mit Lösegeld, NovaNet-Berichterstattung, Prominentenbesuch, Umweltblockade, Kirchenspende, Polizeikooperation. Offene Entscheidungen erscheinen in der Kopfleiste und im Dock; unbeantwortete verfallen mit der passiven Option.
- Stadtrat mit zwei Parteien und Wahlen alle 30 Tage (Stimmen aus Kaufkraft, Beschäftigung und Parteibeziehungen); politischer Einfluss des Spielers aus Betrieben, Immobilien, Spenden und Beziehungen; Gesetzesanträge mit Lobbykosten und Zustimmungsschätzung; Parteien stellen eigene Anträge.
- Sechs Gesetze mit echten Wirkungen: Umsatzsteuer (täglich auf Verkäufe), Mindestlohn (Lohnuntergrenze, Lohnerwartung), Mietdeckel (Mietniveau), Polizeibudget (Polizeipräsenz, Abklingen der Aufmerksamkeit), Bauordnung (Baukosten, Bauzeit, Attraktivität), Sperrstunde (Gastronomie schließt früher, weniger Kriminalität).
- Bezirksinitiativen (Infrastruktur, Sicherheit, Aufwertung) ab 15 Bezirkseinfluss; politischer Einfluss je Bezirk.
- Dynamische Bezirksentwicklung: Attraktivität folgt Betriebsqualität, Gebäudezustand, Kriminalität, Verschmutzung und Bauordnung; Mieten und Grundstückspreise folgen der Attraktivität (Gentrifizierung); Kriminalität folgt Arbeitslosigkeit, Polizei, Sperrstunde und Gebietskontrolle; Verdrängung einkommensschwacher Bürger in günstigere Bezirke.
- Panels Fraktionen (Taste K) und Politik (Taste O), Entscheidungen-Tab im Dock, Steuern und Spenden als Buchungskategorien.
- Spielstandformat Version 6 mit Migration; 10 neue Unit-Tests und ein Phase-6-E2E-Test.

## 0.5.0 – Phase 5: Kriminalität und Sicherheit (2026-10-16)

### Hinzugefügt

- Kriminelle Organisation: Gründung, Anwerben aus einem Kandidatenpool (neun Rollen), Loyalität, Ambition, Anteile in Schwarzgeld, Verrat, Unterschlagung, Verhaftungen.
- Operationen: Präsenz zeigen, Schmuggel-Lauf, Datendiebstahl, Hehlerei (Jobs mit Dauer und Erfolgschance aus Fähigkeit, Polizeipräsenz, Korruption und Fahndungsstufe) sowie Schutzgeld, Schwarzmarkt und Casino als laufende Geschäfte; Casino braucht eine eigene Gewerbeimmobilie als Fassade.
- Territorium je Bezirk mit Verfall ohne Präsenz; drei rivalisierende Familien mit Stärke, Gebieten, Beziehung, Revierkämpfen, Verletzten und Tribut-Waffenstillständen.
- Fahndung in sieben Stufen aus der Polizeiaufmerksamkeit: Beobachtung senkt Erfolgschancen, Ermittlungen halbieren die Geldwäsche, Razzien verhaften und beschlagnahmen, organisierte Fahndung hebt laufende Geschäfte aus, stadtweite Operation stoppt alles für vier Tage.
- Schwarzgeld als eigener Kontostand, Geldwäsche als Anteil der legalen Umsätze mit Gebühr, Bestechung mit abnehmender Wirkung und Korruptionsfolgen.
- Sicherheitszentrale als neue Branche: Wachleute auf Streife (Stadtverträge und Betriebsverträge, senken Kriminalität und Gebietskontrolle aller Organisationen), Ermittler mit Ermittlungen gegen Familien (Prämie), Interessenkonflikt bei eigener Fahndung (Rufverlust, Vertragskündigung).
- Unterwelt-Panel (Taste X) mit Übersicht, Leuten, Operationen, Territorium und Rivalen; Fahndungsstatus in der Kopfleiste; Schwarzgeld in den Finanzen.
- Spielstandformat Version 5 mit Migration; 11 neue Unit-Tests und ein Phase-5-E2E-Test.

## 0.4.0 – Phase 4: Weitere Branchen (2026-10-16)

### Hinzugefügt

- Gemeinsames Unternehmensframework: Personal (Rollen je Branche, Löhne, Moral, Bewerber), Ausbauten und Lager sind geteilte Module; jede Branche hat ein eigenes Modell, eigene Tageslogik und ein eigenes Dashboard.
- Hotels (Kapselhotel, Businesshotel): Zimmer, Zimmerpreis, Ankünfte aus Attraktivität, Verkehr und Einfluss des Bezirks, Aufenthalte über ein bis drei Nächte, VIP-Gäste, Rezeption als Check-in-Kapazität, Housekeeping und Sauberkeit, Zimmerkosten, Zwischenfälle je nach Kriminalität, Bewertungen; Ausbauten Zimmer, Lobby, Reinigungsroboter, Sicherheit, Werbung.
- Taxiunternehmen (Taxidepot): Fahrzeuge kaufen und verkaufen, Zustand, Kilometer, Werkstattaufenthalte, Unfälle, Fahrer als Personal, Tarif, Nachfrage aus Bezirksverkehr und Bürgern im Radius, Energiekosten, Wartung; Ausbauten Ladestation, Werkstatt, Dispatch-KI.
- Einzelhandel (Nachtkiosk): Sortiment mit Regalpreisen, gemeinsames Lager- und Einkaufssystem mit neuen Waren (Snacks, Stims, Cyber-Ersatzteile, Medikamente), Warenkörbe, Bürger gehen einkaufen, Schwund durch Ladendiebstahl, Sicherheitspersonal; Ausbauten Regalsystem, Lager, Ausstattung, Sicherheit, Werbung.
- Immobilienverwaltung: Stadtgebäude kaufen (Preis aus Grundstück, Etagen, Attraktivität), Miete von den dort lebenden Bürgern oder Pacht von Gewerbe, Mietniveau, Zustand mit Verfall, Renovierung, Verkauf; Mieter ziehen bei hoher Miete oder schlechtem Zustand aus und bei günstigen Angeboten ein. Eigene Immobilien lassen sich abreißen, um Bauland zu gewinnen.
- Übernahme von Konkurrenzlokalen: wird zum eigenen Imbiss samt Ruf.
- Neuer Gebäudetyp Imbiss; Stadtgenerator reserviert größere Baulücken (2×1, 1×2, 2×2).
- Panels: Immobilien (Taste I), branchenspezifische Dashboards, Inspektor mit Kauf- und Übernahmeangebot, Unternehmen-Panel über alle Branchen.
- Spielstandformat Version 4; 11 neue Unit-Tests und ein Phase-4-E2E-Test.

### Geändert

- Lieferanten führen unterschiedliche Sortimente (nicht jeder liefert Stims, Medikamente oder Snacks).
- Hilfe beschreibt alle Branchen und Immobilien.

## 0.3.0 – Phase 3: Wirtschaft und Bevölkerung (2026-10-16)

### Hinzugefügt

- Bürger als Agentenschicht (bis 2.400 je Stadt) mit Wohnung, Arbeitsplatz, Einkommen, Vermögen, Preis- und Qualitätspräferenz, Hunger und Tagesablauf (Schlafen, Pendeln, Arbeiten, Essen, Freizeit). Zu Mahlzeiten wählen sie ein Lokal nach Ruf, Preis, Loyalität und Entfernung; ihre Besuche sind echte Gäste.
- Stammkundschaft: Zufriedenheit und abgewiesene Besuche verändern die Loyalität je Bürger.
- Einkommen, Mieten und Konsum der Bürger als Bezirksökonomie (Beschäftigung, Löhne, Mieten, Ausgaben, Betriebe); Kaufkraft driftet langsam mit der Beschäftigung, Konkurrenzdruck folgt der Betriebsdichte.
- KI-Konkurrenz: Gastronomiebetriebe in Stadtgebäuden mit Preisniveau, Qualität, Ruf, Kasse und Tagesbilanz. Sie passen Preise an, investieren in Qualität, melden Insolvenz an und expandieren in unterversorgte Bezirke (Ereignismeldungen, auch „direkt neben deinem Lokal“).
- Zutatenmarkt: Preisindex je Zutat mit Nachfragedruck, Mittelwertrückkehr und gelegentlichen Lieferengpässen; wirkt auf alle Lieferantenpreise.
- Straßenleben: Passanten und Fahrzeuge auf den Straßen, Dichte nach Tageszeit und Anteil unterwegs befindlicher Bürger, Scheinwerfer bei Nacht; abschaltbar.
- Stadt-Panel mit Bürgerzahl, Beschäftigung, Löhnen, Mieten und Betrieben je Bezirk; Unternehmen-Panel mit Konkurrenzliste; Inspektor zeigt Konkurrenzbetriebe; Dashboard zeigt Bürgerbesuche und Marktpreise.
- Spielstandformat Version 3 mit Migration (erzeugt Bürger, Konkurrenz und Markt für alte Stände).
- 9 neue Unit-Tests inklusive Leistungstest (ein Spieltag mit über 1.000 Bürgern in unter 400 ms).

### Geändert

- Laufkundschaft aus dem aggregierten Modell liefert nur noch 55 % der früheren Nachfrage; der Rest kommt aus Bürgerbesuchen.
- Simulation bleibt im Hauptthread: Die gemessene Last (ein Tag < 400 ms) rechtfertigt keinen Worker; die Engine bleibt worker-fähig.

## 0.2.0 – Phase 2: Ramenbar als vollständiger Slice (2026-10-16)

### Hinzugefügt
- Speisekarte mit acht Rezepten (Zutatenbedarf, Beliebtheit, Anspruch), Preisen je Gericht und Ein-/Ausschalten; Gäste wählen nach Beliebtheit und Preis und kaufen nur, was aus dem Lager gekocht werden kann.
- Zutatenlager mit FIFO-Losen, Qualität, Haltbarkeit und Verderb; Lagerkapazität mit Ausbau.
- Vier Lieferanten (Preis, Qualität, Lieferzeit, Verspätungsrisiko, Mindestbestellwert, Sortiment), manuelle Bestellungen mit sofortiger Bezahlung und späterer Lieferung, automatische Nachbestellung bis zu Zielmengen, Manager passt Ziele an den Verbrauch an.
- Mitarbeiter als Entitäten (Koch, Service, Manager) mit Fähigkeit, Lohn, Moral, Kündigungen; Bewerberpool pro Betrieb und Tag; Einstellen, Entlassen (Abfindung), Lohn anpassen. Ohne Koch kein Umsatz.
- Kapazität aus Sitzplätzen, Küchen- und Serviceleistung; Engpassanzeige.
- Zufriedenheit pro Gast aus Gerichtsqualität, Preis-Leistung, Hygiene, Service, Ausstattung und Andrang; Ruf und Sternebewertungen folgen daraus.
- Hygiene mit nächtlicher Reinigung und Kontrollen (Bußgeld).
- Sieben Ausbauten mit Stufen, Kosten und Umbauzeit (Gastraum, Küche, Lager, Ausstattung, Hygienestation, Personalraum, Leuchtreklame).
- Betriebs-Dashboard mit Übersicht, Speisekarte, Einkauf, Personal und Ausbau; Personal-Panel über alle Betriebe; Tagesabrechnung je Betrieb mit Wareneinsatz, Einkäufen, Löhnen, Verderb und Zufriedenheit.
- Neue Aufgaben (Nachbestellen, Einstellen, Ausbauen, vier Sterne).
- Spielstandformat Version 2 mit Migration von Version 1.
- 14 neue Unit-Tests (Lager, Lieferungen, Personal, Speisekarte, Ausbau, Hygiene, Migration) und ein Dashboard-E2E-Test.

### Geändert
- Zutatenkosten entstehen beim Einkauf statt pauschal pro Gast; der Wareneinsatz wird je Gericht aus den tatsächlichen Losen berechnet.
- Löhne werden pro Mitarbeiter gezahlt statt pauschal.
- Meldungen erscheinen über dem Dock statt unter der Kopfleiste.

## 0.1.0 – Phase 1: Spielbares Fundament (2026-10-16)

### Hinzugefügt
- Prozedurale Stadt Nova Eclipse (96×96) mit acht Bezirken, Hafen, Straßenraster, ca. 1.500 Stadtgebäuden im Bezirksstil, Parks und freien Grundstücken.
- Isometrischer PixiJS-Renderer mit prozeduraler Grafik, Tag-/Nachtzyklus, Straßenlaternen, Fensterlicht, Neonreklame, Baustellengrafik, Culling, Kamera (Maus, Tastatur, Zoom zum Cursor), Bezirksbeschriftung bei Makro-Zoom, Übersichtskarte.
- Simulation mit festen Minuten-Ticks, seed-basiertem Zufall, Kommandos (bauen, rückgängig, abreißen, Preis, Geschwindigkeit, umbenennen) und typisierten Events.
- Bausystem mit Grundstückspreisen je Bezirk, Bauzeit, Energieabhängigkeit, Straßenanschluss, Geisterbild-Vorschau und verständlichen Fehlermeldungen.
- Gastronomiebetriebe (Ramenbar, Streetfood-Stand) mit stündlicher Nachfrage, Kapazität, Preiselastizität, Ruf, Zutaten, Löhnen und Betriebskosten; tägliche Wohnungsmiete.
- Finanzen: Ledger, Kategorien, Tagesabschluss, Kontoverlauf, Schuldenwarnungen; Statistik mit Zeitreihen.
- Speichern/Laden: IndexedDB-Slots, Autosave, Schnellspeichern (F5/F9), Export/Import als JSON mit Validierung, Migration und Reparatur.
- Oberfläche im Stil eines futuristischen Betriebssystems: Hauptmenü mit Hintergründen und Schwierigkeiten, Kopfleiste, Navigation mit Phasenkennzeichnung gesperrter Systeme, Inspektor, Dock mit Ereignissen/Aufgaben/Warnungen, Einstellungen (Effekte, reduzierte Bewegung, UI-Skalierung, Autosave), Hilfe.
- Tests: 25 Unit-Tests (Vitest) für RNG, Uhr, Generator, Bau, Wirtschaft, Determinismus, Serializer; Playwright-E2E für Spielstart, Bau, Betrieb, Speichern/Laden, Fehlerfälle und Sperren.
