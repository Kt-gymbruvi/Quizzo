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

## Weitere Lehrkräfte
- **Am einfachsten:** wie in Schritt 5 ein Konto mit Startpasswort anlegen. Die Lehrkraft ändert es nach der ersten Anmeldung über „Passwort ändern“.
- **Per E-Mail-Einladung** (Users → Add user → Send invitation): Der eingebaute E-Mail-Versand von Supabase schickt nur an Mitglieder deines Supabase-Teams und nur wenige Mails pro Stunde. Für Einladungen an Kolleginnen und Kollegen muss vorher ein eigener SMTP-Server eingetragen werden (Authentication → Emails → SMTP Settings). Das gilt genauso für „Passwort vergessen?“.
