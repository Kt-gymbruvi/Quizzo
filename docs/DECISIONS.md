# Entscheidungen – Quizzo

Neue Entscheidungen oben anfügen: Datum/Etappe, Entscheidung, Grund, verworfene Alternativen.

## Etappen 14–18 (November 2026)
- **Mischen nur in der Anzeige** (Etappe 14): Reihenfolge wird auf dem Handy aus der Teilnehmer-ID berechnet (fester Zufall), der Server speichert und bewertet weiter mit den Original-Nummern. Grund: keine Änderung an Bewertung/Ergebnissen nötig, Neuladen ändert nichts. Nur Hausaufgabe/Prüfung (beim Selbstlernen ohne Nutzen). Folien bleiben an ihrem Platz, weil sie meist die nächste Frage einleiten.

- **Neue Fragetypen** (Etappe 15): Lücken im Lückentext als `[Lösung|Schreibweise]` im Text statt eigener Felder – schnell zu tippen, gut zu importieren; zerlegt wird gleich in SQL und TypeScript. Antworten bei Kategorisieren als Objekt `{Begriff: Gruppe}` (unabhängig von der gemischten Reihenfolge). Hotspot-Ziel als Rechteck in Prozent des Bildes (passt auf jeder Bildschirmgröße).
- **Ausnahme „Medien nur am Beamer“** (Etappe 15): Das Bild einer Hotspot-Frage ist Teil der Frage und erscheint auch auf den Handys (und in Aufgaben). Grund: ohne Bild keine Antwort möglich. Es bleiben Dateien aus dem eigenen Speicher (oder https-Adressen der Lehrkraft); `medium` bleibt Beamer-only.

- **Klassen-Challenge** (Etappe 17): Fortschritt rechnet der Server (`klassen_fortschritt`, nur intern, über die Zustandsfunktionen), damit Handys keine fremden Punkte sehen; Schüler bekommen dort `platz = null`. Maß = Durchschnitt des Anteils richtig über alle aufgelösten Fragen mit Wertung, wer nicht antwortet zählt 0 (sonst lohnt Nicht-Antworten). Umfrage/Wortwolke/offen/Folie und Fragen mit 0 Punkten zählen nicht. Feste Medaillen-Stufen statt Ziel-Eingabe: weniger Einstellungen.
- **Von Hand bewerten** (Etappe 18): nur in Hausaufgabe und Prüfung (dort bleiben die Antworten ohnehin gespeichert); im Live-Spiel wäre keine Zeit dafür und Antworten werden beim Beenden gelöscht. Stufen ✗ / ½ / ✓ statt freier Punktzahl: schnell am iPad, passt zum Anteil-Modell (`anteil` 0/0.5/1). Die Punkte rechnet weiter der Server (`aufgabe_bewerten`, nur Besitzerin der Aufgabe), Umentscheiden ersetzt statt addiert. Freitext ist ebenfalls umbewertbar (Tippfehler), automatische Typen nicht. Der Schalter liegt in `inhalt` der offenen Frage (`von_hand`, `lang`) – keine Tabellenänderung an `fragen`.
- **Diagnose ohne neue SQL-Funktion** (Etappe 16): Die Lehrkraft darf Spieler und Antworten ihres eigenen Spiels schon per RLS lesen (002); die Auswertung rechnet der Client. Keine zusätzliche Speicherung – die Diagnose gibt es nur bis zum Beenden des Spiels. Eigene Seite statt Beamer-Ansicht, weil Spitznamen mit Ergebnissen nicht an die Wand gehören.

## Plattform
- **Statische App auf GitHub Pages + Supabase (Frankfurt), kein eigener Server.** Kostenlos, wartungsarm, Daten in der EU. Logik, die nicht manipulierbar sein darf (Punkte, Prüfung von Fragen/Antworten, Rechte), liegt in SQL-Funktionen (`antwort_bewerten`, `frage_gueltig`, RLS).
- **HashRouter** statt BrowserRouter: GitHub Pages kann keine Weiterleitungen für Unterseiten.
- **Nur publishable-Schlüssel im Code**, `.env.production` eingecheckt; secret/service_role nie (auch nicht in Workflows).
- **Eine Supabase-Datenbank für drei Projekte:** Quizzo, Klassenfunk (Präfix `kf_`) und Startseite (`lernangebote`) teilen Konten und Datenbank; Lehrkräfte melden sich überall gleich an.

## Schüler ohne Konto
- Schüler treten mit PIN und Spitzname bei und bekommen ein Spieler-Token; sie haben **keinen Tabellenzugriff**, nur security-definer-Funktionen (`spiel_beitreten`, `spiel_zustand_schueler`, `antwort_abgeben`, `aufgabe_*`).

## Datensparsamkeit
- Live-Spiele werden beim Beenden gelöscht, Reste nach 6 Stunden (`spiele_aufraeumen()`).
- Aufgaben (Etappe 8): Ausnahmen bewusst eng gefasst – Selbstlernen nur anonyme Zahlen, Hausaufgabe mit Frist und Löschung, Prüfung mit **Pseudonym-Codes** (Zuordnung nur auf Papier). Verworfen: Klarnamen bei Prüfungen (widerspricht „keine Klarnamen“).
- **Wiederholung** und **Klassen-Duell** speichern nichts auf dem Server (localStorage des jeweiligen Geräts). Buzzer nur über Realtime-Broadcast.
- Medien nur am Beamer, nie im Schülerzustand; YouTube über youtube-nocookie.

## Oberfläche
- **Kein Scrollen im Spiel** (Etappe 9): `<Einpassen>` verkleinert den Inhalt gleichmäßig, statt Teile außerhalb des Bildschirms zu lassen (am Beamer scrollt niemand).
- Lehrkraft-Ansicht für iPad quer am Beamer, Schüleransicht für Handy hoch.

## Daten- und Codeentscheidungen
- **Ordner als Textpfad** (`quizze.ordner`, „/“ für Unterordner) statt eigener Tabelle: einfacher, keine neue SQL-Datei für Unterordner nötig; leere Ordner merkt sich nur das Gerät.
- **Fragen als `typ` + JSON `inhalt`**, geprüft von `frage_gueltig()`: neue Fragetypen ohne Tabellenumbau.
- **Teamwertung = Durchschnitt** der Mitglieder: fair bei ungleich großen Teams.
- **Schwierigkeit optional** (ohne Angabe = mittel), damit alte Quizze unverändert funktionieren.
- **Dateinamen per `crypto.getRandomValues`** statt `crypto.randomUUID`: Letzteres fehlt auf http-Seiten (Test im WLAN).
- **Bilder vor dem Hochladen verkleinern** (WebP, max. 1600 px); unbenutzte Dateien räumt `raeumeMedienAuf()` auf.

## Qualität
- Tests sprechen nie mit dem echten Server: UI mit `fakeSupabase`, SQL-Migrationen mit PGlite gegen einen Supabase-Nachbau inkl. RLS und Rechten von `anon`/`authenticated`.
- SQL-Änderungen nur als nummerierte Dateien; die Lehrkraft führt sie selbst im SQL Editor aus.

## Wortwolke und Ton (Etappe 19, nur lokal)
- **Wortwolke:** Die Frage steht in der Mitte (`src/wortwolke.tsx`), die Wörter liegen spiralförmig darum (häufigste am nächsten, Größe = Häufigkeit), überlappungsfrei und ohne Zufall berechnet; jedes Wort kreist per CSS-Animation (`wolke-schweben`) leicht um seinen Platz und bleibt in Bewegung (aus bei „Bewegung reduzieren“). Alles in `cqw`, daher gleichmäßig skalierbar. Dieselbe Datei liegt in Klassenfunk (Repos bleiben getrennt).
- **Ton nur am Beamer**, Handys bleiben stumm (Klassenzimmer!). Keine Audiodateien: `src/klang/motor.ts` erzeugt alles mit der Web-Audio-API, die Stücke sind eigene Kompositionen *im Stil* von Kahoot (`quizzo.ts`: Lobby, Frage, Endspurt, Auflösung, Fanfare) und Jeopardy (`duell.ts`: Denkpause, Buzzer, Ding, Summer) – bewusst keine nachgebauten Originalmelodien (Urheberrecht).
- **Klassen-Duell: 60 Sekunden automatisch.** Sobald eine Frage geöffnet wird, laufen 60 s ab (`DUELL_ZEIT` in `Duell.tsx`, unabhängig vom Zeitlimit der Frage) und die Denkpause-Musik startet von selbst; „↻ Neu starten“ setzt die Zeit zurück. Bei Fragen mit Audio/Video/YouTube bleibt die Musik aus.
- Musik läuft nicht, wenn die Frage selbst Audio/Video hat (sonst Überlagerung). 🔊/🔇-Schalter in der Kopfzeile, Wahl im localStorage (`ton-an`), Standard: an. Browser starten Audio erst nach einer Berührung (Motor wacht beim ersten Tippen auf).

## Einheitliche Farben (Dunkelgrün und Orange, lokal)
- Startseite, Quizzo, Klassenfunk, Tafel (Lehrraum) und Notenbuch nutzen dieselbe Palette: Dunkelgrün `#0f5c47`, Orange `#ff8a14`. Quizzo und Klassenfunk behalten ihre Token-Namen (`quizzo-navy`, `funk-petrol` …), nur die Werte wurden getauscht. Logos von Quizzo (`public/logo*.png`) sind per Farbtausch umgefärbt. Beim Schriftzug in `logo.png` wurde das Weiß nachträglich bereinigt (Maske geglättet, reines #fff, türkiser Randschleier in die dunkle Kontur überführt).
