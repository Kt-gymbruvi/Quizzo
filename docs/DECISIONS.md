# Entscheidungen – Quizzo

Neue Entscheidungen oben anfügen: Datum/Etappe, Entscheidung, Grund, verworfene Alternativen.

## Etappen 14–18 (November 2026)
- **Mischen nur in der Anzeige** (Etappe 14): Reihenfolge wird auf dem Handy aus der Teilnehmer-ID berechnet (fester Zufall), der Server speichert und bewertet weiter mit den Original-Nummern. Grund: keine Änderung an Bewertung/Ergebnissen nötig, Neuladen ändert nichts. Nur Hausaufgabe/Prüfung (beim Selbstlernen ohne Nutzen). Folien bleiben an ihrem Platz, weil sie meist die nächste Frage einleiten.

- **Neue Fragetypen** (Etappe 15): Lücken im Lückentext als `[Lösung|Schreibweise]` im Text statt eigener Felder – schnell zu tippen, gut zu importieren; zerlegt wird gleich in SQL und TypeScript. Antworten bei Kategorisieren als Objekt `{Begriff: Gruppe}` (unabhängig von der gemischten Reihenfolge). Hotspot-Ziel als Rechteck in Prozent des Bildes (passt auf jeder Bildschirmgröße).
- **Ausnahme „Medien nur am Beamer“** (Etappe 15): Das Bild einer Hotspot-Frage ist Teil der Frage und erscheint auch auf den Handys (und in Aufgaben). Grund: ohne Bild keine Antwort möglich. Es bleiben Dateien aus dem eigenen Speicher (oder https-Adressen der Lehrkraft); `medium` bleibt Beamer-only.

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
