-- Quizzo – Etappe 10: Ordnung der Lernangebote auf kt-gymbruvi.github.io/lernen/ selbst ändern
--
-- Die Lernangebote (übernommene Claude-Artefakte) liegen als Dateien auf der Webseite. Wie sie einsortiert
-- sind (Fach, Jahrgänge, Thema, Reihenfolge, sichtbar oder nicht) und wie Titel und Erklärung lauten,
-- kann die angemeldete Lehrkraft direkt auf der Seite ändern. Gespeichert wird das hier.
--
-- Datenschutz: Die Tabelle enthält nur Beschreibungen von Unterrichtsmaterial, keine Schülerdaten.
-- Besucher der Seite dürfen die Einträge lesen (ohne Konto), aber nichts ändern.
-- Ändern darf nur die Lehrkraft, die einen Eintrag angelegt hat.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

create table public.lernangebote (
  ordner        text primary key check (ordner ~ '^[a-z0-9-]{1,60}$'),
  besitzer_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel         text not null check (char_length(titel) between 1 and 200),
  text          text not null default '' check (char_length(text) <= 600),
  fach          text not null check (fach ~ '^[a-z0-9-]{1,30}$'),
  stufen        text[] not null default '{}'
                check (coalesce(array_length(stufen, 1), 0) <= 12
                       and array_to_string(stufen, ',') ~ '^([a-z0-9-]{1,10}(,[a-z0-9-]{1,10})*)?$'),
  thema         text check (thema is null or thema ~ '^[a-z0-9-]{1,30}$'),
  position      integer not null default 0 check (position between 0 and 100000),
  sichtbar      boolean not null default true,
  datum         date,
  geaendert_am  timestamptz not null default now()
);
create index lernangebote_besitzer_idx on public.lernangebote (besitzer_id);

alter table public.lernangebote enable row level security;

revoke all on public.lernangebote from anon, authenticated;
-- Besucher lesen nur die Beschreibung, nicht wem der Eintrag gehört
grant select (ordner, titel, text, fach, stufen, thema, position, sichtbar, datum, geaendert_am) on public.lernangebote to anon;
grant select on public.lernangebote to authenticated;
grant insert, update, delete on public.lernangebote to authenticated;

-- Alle dürfen die Einträge lesen – auch versteckte, damit die Seite sie zuverlässig ausblenden kann
-- („versteckt“ heißt nur: nicht aufgelistet; die Dateien selbst liegen ohnehin öffentlich auf der Seite).
create policy "Alle lesen Lernangebote" on public.lernangebote
  for select to anon, authenticated using (true);
create policy "Lehrkraft legt eigene Lernangebote an" on public.lernangebote
  for insert to authenticated with check (besitzer_id = (select auth.uid()));
create policy "Lehrkraft ändert eigene Lernangebote" on public.lernangebote
  for update to authenticated
  using (besitzer_id = (select auth.uid()))
  with check (besitzer_id = (select auth.uid()));
create policy "Lehrkraft löscht eigene Lernangebote" on public.lernangebote
  for delete to authenticated using (besitzer_id = (select auth.uid()));
