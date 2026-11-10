# Projektstand – Quizzo

Stand: 10.11.2026 · live unter https://kt-gymbruvi.github.io/Quizzo/ · `main` = `origin/main` (`71e8deb`, Etappe 13)
Tests: 15 Testdateien, 282 Tests grün (`npm test`); Build grün.

## Implementiert (alles veröffentlicht)
- **Lehrkraft:** Anmeldung nur für eingeladene Konten, Passwort ändern/setzen (Einladungs-/Reset-Link `#/passwort`).
- **Quizze:** Editor mit neun Fragetypen (`auswahl`, `wahrfalsch`, `freitext`, `reihenfolge`, `zuordnung`, `umfrage`/`wortwolke`, `offen`, `schieberegler`, `folie`), Punkte pro Frage, Zeitlimit, Schwierigkeit (leicht/mittel/schwer), Medien (Bild/Audio/Video hochladen oder YouTube, optional Ausschnitt; nur am Beamer). Import/Export als JSON (`docs/QUIZ-DATEIFORMAT.md`), Kopieren von Quizzen und Fragen. „Meine Quizze“ mit Ordnern/Unterordnern, Suche, Sortierung.
- **Live-Spiel:** PIN + QR, Lobby, Countdown, Auswertung, Endstand; Modi klassisch und Team (2–6 Teams, Durchschnittswertung); Turnier (weitere Runde mit anderem Quiz); Wieder-Einsteigen nach „Zurück“; Beamer und Handy ohne Scrollen (`<Einpassen>`).
- **Aufgaben ohne Live-Spiel:** Selbstlernen (anonym), Hausaufgabe (Spitzname, Frist ≤ 14 Tage, CSV-Export), Prüfung (Pseudonym-Codes zum Ausdrucken); optional Zeitlimit pro Frage.
- **Wiederholung:** falsch beantwortete Fragen nur auf dem Schülerhandy (`#/wiederholen`).
- **Klassen-Duell** (Jeopardy): 2–6 Quizze als Kategorien, 2–6 Teams, Spielstand nur auf dem Lehrkraft-Gerät; optionaler Buzzer (ein Handy pro Team, `#/buzzer?pin=`).
- **Datenbank** (`supabase/migrations/001`–`010`): Tabelle `lernangebote` (009) für die Startseite. 001–009 laufen in Produktion (008 und 009 lesend geprüft am 10.11.2026); 010 ist veröffentlicht und wird von der App genutzt, ohne Anmeldung aber nicht nachprüfbar.

## Struktur
```
src/App.tsx, main.tsx, components.tsx, einpassen.tsx, index.css
src/pages/            Startseite, Mitspielen, Aufgabe, Wiederholen, Buzzer, QuizLeiten
src/pages/lehrkraft/  Anmelden, Passwort, QuizListe, QuizEditor (+ editor/), SpielStarten, SpielLeiten,
                      Aufgabe*, Duell, DuellEinrichten
src/spiel/            Beamer.tsx, Handy.tsx
src/lib/              supabase, auth, quizze, spiel, aufgaben, fragetypen, medien, ordner, teams,
                      wiederholung, duell, buzzer, antwortStil, schluessel
src/test/             UI-Tests (fakeSupabase), sql/ (PGlite)
supabase/             EINRICHTUNG.md, migrations/001–010
docs/                 QUIZ-DATEIFORMAT.md, PROJECT-STATUS.md, DECISIONS.md
beispiele/            alle-fragetypen.quizzo.json
```

## Bekannte Probleme / offen
- „Passwort vergessen?“ und Einladungen an andere Lehrkräfte brauchen einen eigenen SMTP-Server in Supabase (eingebauter Versand nur fürs Supabase-Team, wenige Mails/Stunde).
- `.claude/launch.json` ist lokal geändert (Vorschau-Einträge für Startseite und Klassenfunk) und bewusst nicht committet.
- Prüfungsmodus für benotete Prüfungen: Abstimmung mit der/dem Datenschutzbeauftragten der Schule empfohlen (nicht dokumentiert, ob erfolgt).

## Nächste Schritte (Ideen aus `FAHRPLAN.md`, nichts davon begonnen)
1. SMTP in Supabase einrichten (Voraussetzung für Kolleg:innen-Einladungen).
2. Medien optional auch auf den Handys (Schalter pro Frage); Countdown erst nach dem Abspielen.
3. Team-Modus: Teams selbst wählen lassen.
4. Prüfung: Fragen in zufälliger Reihenfolge, Frist verlängern.
