# Quizzo – Projektregeln

Quizzo ist eine Live-Quiz-Web-App für den Schulunterricht (eigener Name, eigenes Design).

## Technik
- Statische Web-App: Vite + React + TypeScript + Tailwind CSS.
- Hosting: GitHub Pages unter https://kt-gymbruvi.github.io/Quizzo/ (Basis-Pfad `/Quizzo/`).
- Deployment automatisch per GitHub Actions (`.github/workflows/deploy.yml`) bei Push auf `main`.
- Daten, Lehrkraft-Login und Echtzeit über Supabase (Region Frankfurt). Kein eigener Server.

## Oberfläche
- Oberfläche komplett auf Deutsch.
- Schüleransicht: für Handys optimiert (Hochformat, große Tippflächen).
- Lehrkraft-Ansicht: für iPad im Querformat am Beamer, große Schrift, gut lesbar aus der Ferne.
- Design: Dunkelblau und Gelb (Farben `quizzo-navy` / `quizzo-yellow` im `@theme`-Block von `src/index.css`, Tailwind v4).
- Routing per HashRouter (URLs wie `…/Quizzo/#/mitspielen`), damit GitHub Pages ohne Weiterleitungen funktioniert.
- Supabase-URL und publishable-Schlüssel stehen in `.env.production` (eingecheckt) bzw. `.env.local` (lokal); Vorlage: `.env.example`.

## Lehrkraft-Konten und Datenbank
- Nur eingeladene Lehrkräfte (Selbst-Registrierung in Supabase abgeschaltet), Anmeldung mit E-Mail und Passwort.
- Datenbank-Änderungen als nummerierte SQL-Dateien in `supabase/migrations/`; die Lehrkraft führt sie im SQL Editor aus (Anleitung: `supabase/EINRICHTUNG.md`).
- In Tests wird Supabase durch eine Attrappe ersetzt (`src/test/fakeSupabase.ts`), Tests sprechen nie mit dem echten Server.

## Datenschutz
- Schüler brauchen kein Konto, nur PIN und Spitzname.
- Keine Klarnamen, keine E-Mail-Adressen von Schülern erfassen oder speichern.
- Spieldaten (Spitznamen, Antworten, Punkte) werden nach Spielende gelöscht.
- Dauerhaft gespeichert werden nur die Quizze der Lehrkraft.

## Sicherheit
- Im Code steht nur der öffentliche Supabase-Schlüssel (publishable / anon).
- Niemals den secret- oder service_role-Schlüssel verwenden – weder im Code, noch in Workflows, noch in `.env`-Dateien.
- Alle Tabellen haben Row Level Security (RLS) aktiviert, mit expliziten Policies.

## Arbeitsweise
- Nach jeder Etappe: Tests ausführen (`npm test`, `npm run build` – enthält die TypeScript-Prüfung) und zusammenfassen, was getestet wurde und was nicht.
- Nichts veröffentlichen (Push auf `main`, Deployment, Supabase-Änderungen an Produktivdaten) und nichts löschen ohne ausdrückliche Zustimmung der Lehrkraft (Projektinhaber).
