# Quizzo – Fahrplan

Stand: November 2026. ✅ = fertig, 🔨 = in Arbeit, ⏳ = geplant

## Grundlagen
- ✅ Etappe 1: Startseite, Supabase-Verbindung, Deployment auf GitHub Pages
- ✅ Etappe 2: Lehrkraft-Login (nur eingeladen), Quizze anlegen/bearbeiten
- ✅ Etappe 3: Live-Spiel (PIN, Lobby, Countdown, Auswertung, Endstand, Daten löschen)
- ✅ Etappe 4: neun Fragetypen, Import/Export, Wieder-Einsteigen nach „Zurück“, Handy-Ansicht ohne Scrollen

## Frageneditor (Etappe 4 ✅ veröffentlicht · Etappe 5 Medien ✅ veröffentlicht)
| Nr. | Fragetyp | Interner Name | Punkte | Etappe |
|---|---|---|---|---|
| 1 | Multiple Choice (eine oder mehrere richtig, 2–6 Antworten) | `auswahl` | ja | 4 |
| 2 | Richtig/Falsch | `wahrfalsch` | ja | 4 |
| 3 | Freitext (Antwort eintippen, mehrere akzeptierte Lösungen) | `freitext` | ja | 4 |
| 4 | Puzzle/Sortieren (richtige Reihenfolge) | `reihenfolge` | ja | 4 |
| 5 | Zuordnung (Paare verbinden, Teilpunkte) | `zuordnung` | ja | 4 |
| 6 | Umfrage und Wortwolke | `umfrage`, `wortwolke` | nein | 4 |
| 7 | Offene Frage (längere Antwort) | `offen` | nein | 4 |
| 8 | Schieberegler (Zahl schätzen, je näher desto mehr Punkte) | `schieberegler` | ja | 4 |
| 9 | Präsentationsfolie (Info ohne Antwort) | `folie` | nein | 4 |
| 10 | Audio und Video (sowie Bilder zu Fragen) – nur am Beamer | Spalte `medium` | – | 5 |

Etappe 5: Bild, Audio, Video hochladen (Supabase Storage, Bilder automatisch verkleinert) oder YouTube-Link (datensparsam über youtube-nocookie), jeweils mit optionalem Ausschnitt (von/bis). Unbenutzte Dateien werden automatisch gelöscht.
Ideen für später: Medien auch auf den Handys anzeigen (Schalter pro Frage), Countdown erst nach dem Abspielen starten, Bilder als Antworten.

Außerdem in Etappe 4: Punkte pro Frage (keine/normal/doppelt), Quiz importieren/exportieren (JSON, siehe `docs/QUIZ-DATEIFORMAT.md`), Quiz und einzelne Fragen kopieren.

## Kleinigkeiten ⏳
- Schieberegler: Jahreszahlen ohne Tausenderpunkt anzeigen (1975 statt 1.975)
- „Passwort vergessen?“ braucht einen eigenen SMTP-Server in Supabase

## Spielmodi (ab Etappe 6 ⏳)
- Classic (= heutiges Live-Spiel)
- Team
- Selbstlernen
- Hausaufgaben
- Prüfung
- Turnier
- Wiederholung

### Vor den Spielmodi zu klären (Datenschutz)
Die aktuellen Regeln in `CLAUDE.md` sagen: keine Klarnamen, Spieldaten werden nach Spielende gelöscht.
- **Selbstlernen / Hausaufgaben** laufen über Tage – Antworten müssen bis zur Abgabefrist gespeichert bleiben (danach löschen).
- **Prüfung** braucht eine Zuordnung zu einzelnen Schülern – widerspricht „keine Klarnamen“ (Idee: Pseudonym-Codes, deren Zuordnung nur die Lehrkraft offline kennt).
- **Turnier** fasst mehrere Spiele zusammen – Punkte müssen spielübergreifend gespeichert werden.
- **Wiederholung** braucht frühere Fehler – Idee: nur auf dem Gerät des Schülers speichern.
