# Supabase einrichten (Etappe 2: Lehrkraft-Login und Quizze)

Alle Schritte finden im Supabase-Dashboard deines Projekts statt. Den secret-Schlüssel brauchst du dafür nicht.

## 1. Tabellen anlegen
1. Links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von [`migrations/001_quizze.sql`](migrations/001_quizze.sql) einfügen.
3. **Run** klicken. Erwartet: „Success. No rows returned“.

Danach gibt es unter **Table Editor** die Tabellen `quizze` und `fragen`, beide mit dem Hinweis „RLS enabled“.

## 2. Selbst-Registrierung abschalten
**Authentication → Sign In / Providers** (bzw. „Providers“):
- **Allow new users to sign up**: **aus**.
- Der Anbieter **Email** bleibt **an**.

Damit können nur noch Konten angelegt werden, die du im Dashboard erstellst oder einlädst.

## 3. Adressen eintragen
**Authentication → URL Configuration**:
- **Site URL**: `https://kt-gymbruvi.github.io/Quizzo/` (mit Schrägstrich am Ende)
- **Redirect URLs** → Add URL: `http://localhost:5173/Quizzo/`

## 4. E-Mail-Vorlagen anpassen
Die App nutzt Links, die direkt auf die Seite „Passwort festlegen“ führen.
**Authentication → Emails** (bzw. „Email Templates“):

**Invite user** – den Link im Text ersetzen durch:
```html
<p><a href="{{ .SiteURL }}#/passwort?token_hash={{ .TokenHash }}&type=invite">Einladung annehmen und Passwort festlegen</a></p>
```

**Reset password** – den Link ersetzen durch:
```html
<p><a href="{{ .SiteURL }}#/passwort?token_hash={{ .TokenHash }}&type=recovery">Neues Passwort festlegen</a></p>
```

## 5. Dein eigenes Lehrkraft-Konto anlegen
**Authentication → Users → Add user → Create new user**:
- E-Mail-Adresse und ein Passwort (mindestens 8 Zeichen) eintragen.
- **Auto Confirm User** anhaken.

Dann kannst du dich sofort unter „Quiz leiten“ anmelden. Eine E-Mail wird dafür nicht verschickt.

## 6. Live-Spiel (Etappe 3)
Wie in Schritt 1: Inhalt von [`migrations/002_spiel.sql`](migrations/002_spiel.sql) im **SQL Editor** ausführen.
Danach gibt es die Tabellen `spiele`, `spieler` und `antworten` (alle mit RLS).

Echtzeit: Die App nutzt Supabase Realtime (Broadcast), um Handys sofort über den nächsten Schritt zu informieren.
Falls das in den Realtime-Einstellungen gesperrt ist, funktioniert das Spiel trotzdem – die Geräte fragen
zusätzlich alle 1,5–2 Sekunden nach.

## 7. Fragetypen (Etappe 4)
Inhalt von [`migrations/003_fragetypen.sql`](migrations/003_fragetypen.sql) im **SQL Editor** ausführen.
Bestehende Fragen werden automatisch zu Multiple-Choice-Fragen umgewandelt; laufende Spiele werden beendet.
Wichtig: Erst danach die neue App-Version veröffentlichen (die alte App passt nicht zum neuen Format und umgekehrt).

## 8. Medien (Etappe 5)
Inhalt von [`migrations/004_medien.sql`](migrations/004_medien.sql) im **SQL Editor** ausführen.
Das legt unter **Storage** den Speicher `quizzo-medien` an (öffentlich lesbar über die Dateiadresse, höchstens 50 MB pro Datei,
nur Bild-, Ton- und Videoformate). Hochladen und Löschen darf jede Lehrkraft nur in ihrem eigenen Ordner.
Diesmal ist die Reihenfolge egal: Die alte App-Version funktioniert auch mit der neuen Datenbank weiter.
Im kostenlosen Supabase-Tarif steht 1 GB Speicher zur Verfügung; Bilder werden beim Hochladen automatisch verkleinert.

## 9. Spielmodi (Etappe 6)
Inhalt von [`migrations/005_spielmodi.sql`](migrations/005_spielmodi.sql) im **SQL Editor** ausführen.
Danach kann beim Spielstart „Klassisch“ oder „Team“ gewählt werden. Die alte App-Version funktioniert weiter
(sie startet einfach klassische Spiele).

## 10. Turnier (Etappe 7)
Inhalt von [`migrations/006_turnier.sql`](migrations/006_turnier.sql) im **SQL Editor** ausführen.
Danach erscheint im Endstand der Knopf „Turnier: Runde 2 mit anderem Quiz“. Die alte App-Version funktioniert weiter.
(Die Wiederholung für Schüler braucht keine Datenbank-Änderung – sie läuft nur auf dem Handy.)

## 11. Aufgaben: Selbstlernen, Hausaufgabe, Prüfung (Etappe 8)
Inhalt von [`migrations/007_aufgaben.sql`](migrations/007_aufgaben.sql) im **SQL Editor** ausführen.
Danach gibt es bei jedem Quiz den Knopf „📝 Als Aufgabe verteilen“. Die alte App-Version funktioniert weiter.
Abgelaufene Aufgaben (Hausaufgabe: 7 Tage nach der Frist, Prüfung: 30 Tage nach dem Erstellen) werden gelöscht,
sobald irgendjemand Quizzo benutzt (Spiel starten, beitreten, Aufgaben öffnen). Wer das zusätzlich zeitgesteuert möchte,
kann unter **Integrations → Cron** einen nächtlichen Job mit `select public.spiele_aufraeumen();` anlegen (optional).

## 12. Ordner und Zeitlimit (Etappe 9)
Inhalt von [`migrations/008_ordner_zeitlimit.sql`](migrations/008_ordner_zeitlimit.sql) im **SQL Editor** ausführen –
**bevor** die neue App-Version veröffentlicht wird. Die alte App-Version funktioniert danach weiter.
Neu: Quizze lassen sich in Ordner legen; Hausaufgaben und Prüfungen können ein Zeitlimit pro Frage haben
(die Zeit läuft auf dem Server, Neuladen setzt sie nicht zurück).

## 13. Lernangebote auf der Webseite ordnen (Etappe 10)
Inhalt von [`migrations/009_lernangebote.sql`](migrations/009_lernangebote.sql) im **SQL Editor** ausführen.
Danach kann die Lehrkraft auf `kt-gymbruvi.github.io/lernen/#bearbeiten` die Lernangebote umsortieren, umbenennen
und verstecken. Besucher können nur lesen. Ohne diese Tabelle zeigt die Seite einfach den Stand aus `angebote.js`.

## Weitere Lehrkräfte
- **Am einfachsten:** wie in Schritt 5 ein Konto mit Startpasswort anlegen. Die Lehrkraft ändert es nach der ersten Anmeldung über „Passwort ändern“.
- **Per E-Mail-Einladung** (Users → Add user → Send invitation): Der eingebaute E-Mail-Versand von Supabase schickt nur an Mitglieder deines Supabase-Teams und nur wenige Mails pro Stunde. Für Einladungen an Kolleginnen und Kollegen muss vorher ein eigener SMTP-Server eingetragen werden (Authentication → Emails → SMTP Settings). Das gilt genauso für „Passwort vergessen?“.
