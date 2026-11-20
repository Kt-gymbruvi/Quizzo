# Projektstand – Quizzo

Stand: 19.11.2026 · live unter https://kt-gymbruvi.github.io/Quizzo/ · `main` lokal 5 Etappen vor `origin/main` (Etappen 14–18, `e6b956e`), **nicht veröffentlicht**
Tests: 21 Testdateien, 373 Tests grün (`npm test`); Build grün.

## Implementiert und veröffentlicht
- **Lehrkraft:** Anmeldung nur für eingeladene Konten, Passwort ändern/setzen (Einladungs-/Reset-Link `#/passwort`).
- **Quizze:** Editor mit neun Fragetypen (`auswahl`, `wahrfalsch`, `freitext`, `reihenfolge`, `zuordnung`, `umfrage`/`wortwolke`, `offen`, `schieberegler`, `folie`), Punkte pro Frage, Zeitlimit, Schwierigkeit (leicht/mittel/schwer), Medien (Bild/Audio/Video hochladen oder YouTube, optional Ausschnitt; nur am Beamer). Import/Export als JSON (`docs/QUIZ-DATEIFORMAT.md`), Kopieren von Quizzen und Fragen. „Meine Quizze“ mit Ordnern/Unterordnern, Suche, Sortierung.
- **Live-Spiel:** PIN + QR, Lobby, Countdown, Auswertung, Endstand; Modi klassisch und Team (2–6 Teams, Durchschnittswertung); Turnier (weitere Runde mit anderem Quiz); Wieder-Einsteigen nach „Zurück“; Beamer und Handy ohne Scrollen (`<Einpassen>`).
- **Aufgaben ohne Live-Spiel:** Selbstlernen (anonym), Hausaufgabe (Spitzname, Frist ≤ 14 Tage, CSV-Export), Prüfung (Pseudonym-Codes zum Ausdrucken); optional Zeitlimit pro Frage.
- **Wiederholung:** falsch beantwortete Fragen nur auf dem Schülerhandy (`#/wiederholen`).
- **Klassen-Duell** (Jeopardy): 2–6 Quizze als Kategorien, 2–6 Teams, Spielstand nur auf dem Lehrkraft-Gerät; optionaler Buzzer (ein Handy pro Team, `#/buzzer?pin=`).
- **Datenbank** (`supabase/migrations/001`–`012`): 001–010 laufen in Produktion; 011 (Tresore für den Lehrraum) laut `EINRICHTUNG.md` am 14.11.2026 ausgeführt, 012 (Tafeln) liegt im Repo – Ausführung hier nicht dokumentiert.

## Fertig, aber noch nicht veröffentlicht (Etappen 14–18, nur lokal committet)
- **Etappe 14 – Mischen** (SQL `013`): Fragen und Antworten bei Hausaufgabe/Prüfung pro Person gemischt.
- **Etappe 15 – Neue Fragetypen** (SQL `014`): Kategorisieren, Lückentext (eintippen/auswählen), Bild-Hotspot; Teilpunkte.
- **Etappe 16 – Diagnose** (ohne SQL): nach dem Live-Spiel schwere Fragen, häufigste Fehler, Wiederholungs-Quiz anlegen.
- **Etappe 17 – Klassen-Challenge** (SQL `015`): alle gemeinsam, Klassenfortschritt in % mit Medaillen statt Rangliste.
- **Etappe 18 – Von Hand bewerten** (SQL `016`): offene Fragen (optional 1000 Zeichen) in Hausaufgabe/Prüfung mit ✗ / ½ / ✓ bewerten, Freitext umbewerten.
- **Etappe 19 – Wortwolke neu + Ton** (ohne SQL, noch nicht committet): Wortwolke mit der Frage in der Mitte und schwebenden Wörtern (`src/wortwolke.tsx`); Musik und Effekte am Beamer (`src/klang/`): Quizzo im Kahoot-Stil, Klassen-Duell im Jeopardy-Stil, 🔊/🔇-Schalter. Gleiches in Klassenfunk (Lounge). Nur per Test und Vorschau der Wolke geprüft – **Klang noch nicht gehört**, Lautstärke/Geschmack bitte am Beamer prüfen.
- **Vor dem Veröffentlichen:** Migrationen `013`–`016` der Reihe nach im SQL Editor ausführen (`supabase/EINRICHTUNG.md`, Abschnitte 16–19), dann pushen.

## Struktur
```
src/App.tsx, main.tsx, components.tsx, einpassen.tsx, wortwolke.tsx, index.css
src/klang/            motor (Web Audio), noten, hooks (Ton-Schalter), quizzo (Kahoot-Stil), duell (Jeopardy-Stil)
src/pages/            Startseite, Mitspielen, Aufgabe, Wiederholen, Buzzer, QuizLeiten
src/pages/lehrkraft/  Anmelden, Passwort, QuizListe, QuizEditor (+ editor/), SpielStarten, SpielLeiten,
                      SpielDiagnose, Aufgabe*, Duell, DuellEinrichten
src/spiel/            Beamer.tsx, Handy.tsx, HotspotBild.tsx, KlassenBalken.tsx
src/lib/              supabase, auth, quizze, spiel, aufgaben, fragetypen, medien, ordner, teams,
                      wiederholung, duell, buzzer, antwortStil, schluessel, mischen, diagnose
src/test/             UI-Tests (fakeSupabase), sql/ (PGlite)
supabase/             EINRICHTUNG.md, migrations/001–016
docs/                 QUIZ-DATEIFORMAT.md, PROJECT-STATUS.md, DECISIONS.md
beispiele/            alle-fragetypen.quizzo.json (public/beispiele/zelle.svg für das Hotspot-Beispiel)
```

## Bekannte Probleme / offen
- Migrationen 013–016 sind noch nicht in Produktion ausgeführt; die neue App-Version braucht sie (die alte läuft auch danach weiter).
- „Passwort vergessen?“ und Einladungen an andere Lehrkräfte brauchen einen eigenen SMTP-Server in Supabase (eingebauter Versand nur fürs Supabase-Team, wenige Mails/Stunde).
- `.claude/launch.json` ist lokal geändert (Vorschau-Einträge für Startseite und Klassenfunk) und bewusst nicht committet; `beispiele/beispiel-import.quizzo.json` liegt unversioniert im Ordner (nicht Teil der Etappen).
- Prüfungsmodus für benotete Prüfungen: Abstimmung mit der/dem Datenschutzbeauftragten der Schule empfohlen (nicht dokumentiert, ob erfolgt).
- Nicht im echten Browser geprüft: Klassen-Challenge am Beamer, Bewerten-Knöpfe in der Ergebnistabelle (nur Tests); Hotspot und neue Fragetypen am Handy wurden im Browser angesehen.

## Nächste Schritte
1. Migrationen 013–016 ausführen, veröffentlichen, kurz im Unterricht ausprobieren.
2. SMTP in Supabase einrichten (Voraussetzung für Kolleg:innen-Einladungen).
3. Ideen aus `FAHRPLAN.md`: Medien optional auf den Handys, Teams selbst wählen, Prüfungsfrist verlängern.
