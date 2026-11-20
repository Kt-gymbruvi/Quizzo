-- Plattform – Schülerseiten per QR-Code (Lehrraum, SPEC „Schülerseiten“, Etappe 2)
--
-- Die Lehrkraft gibt eine Klasse für kurze Zeit frei. Die Schüler scannen einen QR-Code, wählen ihren Namen und
-- schreiben auf einer eigenen Seite. Verschlüsselt wird AUF DEN GERÄTEN (AES-256-GCM) mit einem Sitzungsschlüssel,
-- der nur im QR-Code steht (hinter dem „#“ der Adresse, geht nie an einen Server). Hier liegen nur:
--   lr_sitzungen – eine Zeile je Freigabe: Code, Zeitraum, verschlüsselte Namensliste (und Vorlage)
--   lr_abgaben   – eine Zeile je Platz (zufällige Kennung, nie der Name): belegt ja/nein, verschlüsselte Seite
--
-- Schüler haben kein Konto. Sie dürfen NUR über die Funktionen lr_mitmachen_laden, lr_platz_belegen,
-- lr_abgabe_laden und lr_abgabe_speichern an die Daten – nie an die Tabellen. Jede Funktion verlangt den
-- Sitzungscode (128 Bit, zufällig); Schreiben außerdem das Geheimnis des Platzes (der Server kennt nur dessen Hash)
-- und eine noch offene Zeit. Die Lehrkraft sieht und löscht nur ihre eigenen Sitzungen.
--
-- Löschen: 48 Stunden nach dem Ende (loeschen_am). lr_sitzungen_aufraeumen() löscht alles Abgelaufene; es läuft
-- alle 15 Minuten über pg_cron (wenn die Erweiterung verfügbar ist, sonst Hinweis unten) und bei jeder neuen Freigabe.
-- Abgelaufene Sitzungen sind für Schüler sofort unsichtbar, auch bevor das Aufräumen lief.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

create table public.lr_sitzungen (
  code          text primary key check (code ~ '^[A-Za-z0-9_-]{22}$'),
  lehrkraft     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  beginn        timestamptz not null default now(),
  ende          timestamptz not null,
  loeschen_am   timestamptz not null,
  iv            text not null check (char_length(iv) between 12 and 32),
  daten         text not null check (char_length(daten) <= 4000000),
  constraint lr_sitzung_zeitraum check (ende > beginn and ende <= beginn + interval '6 hours' and loeschen_am between ende and ende + interval '48 hours')
);
create index lr_sitzungen_lehrkraft on public.lr_sitzungen (lehrkraft);
create index lr_sitzungen_loeschen on public.lr_sitzungen (loeschen_am);

create table public.lr_abgaben (
  code            text not null references public.lr_sitzungen (code) on delete cascade,
  platz           text not null check (platz ~ '^[0-9A-Za-z_-]{1,64}$'),
  geheimnis_hash  text check (geheimnis_hash ~ '^[0-9a-f]{64}$'),
  belegt          boolean generated always as (geheimnis_hash is not null) stored,
  stand           integer not null default 0 check (stand >= 0),
  iv              text check (char_length(iv) between 12 and 32),
  daten           text check (char_length(daten) <= 3000000),
  geaendert_am    timestamptz not null default now(),
  primary key (code, platz)
);

alter table public.lr_sitzungen enable row level security;
alter table public.lr_abgaben enable row level security;

revoke all on public.lr_sitzungen from anon, authenticated;
revoke all on public.lr_abgaben from anon, authenticated;

-- Lehrkraft: eigene Sitzungen lesen, anlegen, löschen; Zeit nur über lr_sitzung_zeit ändern
grant select, delete on public.lr_sitzungen to authenticated;
grant insert (code, ende, loeschen_am, iv, daten) on public.lr_sitzungen to authenticated;
grant update (ende, loeschen_am) on public.lr_sitzungen to authenticated;

create policy "Lehrkraft liest eigene Sitzungen" on public.lr_sitzungen
  for select to authenticated using (lehrkraft = (select auth.uid()));
create policy "Lehrkraft legt eigene Sitzungen an" on public.lr_sitzungen
  for insert to authenticated with check (lehrkraft = (select auth.uid()));
create policy "Lehrkraft ändert eigene Sitzungen" on public.lr_sitzungen
  for update to authenticated using (lehrkraft = (select auth.uid())) with check (lehrkraft = (select auth.uid()));
create policy "Lehrkraft löscht eigene Sitzungen" on public.lr_sitzungen
  for delete to authenticated using (lehrkraft = (select auth.uid()));

-- Lehrkraft: Plätze der eigenen Sitzungen lesen (ohne das Geheimnis-Hash), anlegen, freigeben
grant select (code, platz, belegt, stand, iv, daten, geaendert_am) on public.lr_abgaben to authenticated;
grant insert (code, platz) on public.lr_abgaben to authenticated;
grant update (geheimnis_hash) on public.lr_abgaben to authenticated;

create policy "Lehrkraft liest Plätze eigener Sitzungen" on public.lr_abgaben
  for select to authenticated
  using (exists (select 1 from public.lr_sitzungen s where s.code = lr_abgaben.code and s.lehrkraft = (select auth.uid())));
create policy "Lehrkraft legt Plätze eigener Sitzungen an" on public.lr_abgaben
  for insert to authenticated
  with check (exists (select 1 from public.lr_sitzungen s where s.code = lr_abgaben.code and s.lehrkraft = (select auth.uid())));
create policy "Lehrkraft gibt Plätze eigener Sitzungen frei" on public.lr_abgaben
  for update to authenticated
  using (exists (select 1 from public.lr_sitzungen s where s.code = lr_abgaben.code and s.lehrkraft = (select auth.uid())))
  with check (exists (select 1 from public.lr_sitzungen s where s.code = lr_abgaben.code and s.lehrkraft = (select auth.uid())));

-- ---------- Lehrkraft: Freigabe anlegen, Zeit ändern, Platz freigeben ----------
-- Legt Sitzung und alle Plätze zusammen an. Höchstens 3 Stunden ab jetzt, 60 Plätze, 10 offene Freigaben.
create or replace function public.lr_sitzung_anlegen(p_code text, p_ende timestamptz, p_iv text, p_daten text, p_plaetze text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ich uuid := auth.uid();
begin
  if ich is null then raise exception 'nicht angemeldet'; end if;
  perform public.lr_sitzungen_aufraeumen();
  if p_ende <= now() or p_ende > now() + interval '3 hours' then raise exception 'QUIZZO: Die Dauer muss zwischen 1 Minute und 3 Stunden liegen.'; end if;
  if coalesce(array_length(p_plaetze, 1), 0) not between 1 and 60 then raise exception 'QUIZZO: Eine Freigabe braucht 1 bis 60 Plätze.'; end if;
  if (select count(*) from public.lr_sitzungen where lehrkraft = ich and ende > now()) >= 10 then
    raise exception 'QUIZZO: Es laufen schon 10 Freigaben. Bitte erst welche beenden.';
  end if;
  insert into public.lr_sitzungen (code, ende, loeschen_am, iv, daten) values (p_code, p_ende, p_ende + interval '48 hours', p_iv, p_daten);
  insert into public.lr_abgaben (code, platz) select p_code, p from unnest(p_plaetze) as p;
end;
$$;

-- Ändert das Ende (verlängern oder vorzeitig beenden); das Löschen folgt 48 Stunden danach.
create or replace function public.lr_sitzung_zeit(p_code text, p_ende timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b timestamptz;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select beginn into b from public.lr_sitzungen where code = p_code and lehrkraft = auth.uid() for update;
  if b is null then raise exception 'QUIZZO: Diese Freigabe gibt es nicht.'; end if;
  if p_ende <= b or p_ende > now() + interval '3 hours' then raise exception 'QUIZZO: Das Ende ist nicht möglich (höchstens 3 Stunden ab jetzt).'; end if;
  update public.lr_sitzungen set ende = p_ende, loeschen_am = p_ende + interval '48 hours' where code = p_code and lehrkraft = auth.uid();
end;
$$;

-- Gibt einen Platz wieder frei (z. B. wenn ein Gerät wechselt); die Seite darauf bleibt erhalten.
create or replace function public.lr_platz_freigeben(p_code text, p_platz text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.lr_abgaben set geheimnis_hash = null where code = p_code and platz = p_platz;
$$;

-- ---------- Aufräumen ----------
create or replace function public.lr_sitzungen_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.lr_sitzungen where loeschen_am <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.lr_sitzungen_aufraeumen() from public, anon, authenticated;
grant execute on function public.lr_sitzungen_aufraeumen() to authenticated;  -- jede Lehrkraft räumt beim Anlegen mit auf

-- ---------- Schüler (ohne Konto): nur diese vier Funktionen ----------
-- Code und Hash werden vor jeder Abfrage auf ihre Form geprüft; Meldungen sind für die Schüler schon deutsch.

create or replace function public.lr_mitmachen_laden(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.lr_sitzungen%rowtype;
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'QUIZZO: Diese Freigabe gibt es nicht (mehr).'; end if;
  select * into s from public.lr_sitzungen where code = p_code and loeschen_am > now();
  if not found then raise exception 'QUIZZO: Diese Freigabe gibt es nicht (mehr).'; end if;
  if now() >= s.ende then raise exception 'QUIZZO: Die Zeit ist um.'; end if;
  return jsonb_build_object(
    'iv', s.iv, 'daten', s.daten, 'beginn', s.beginn, 'ende', s.ende,
    'plaetze', (select coalesce(jsonb_agg(jsonb_build_object('platz', a.platz, 'belegt', a.belegt) order by a.platz), '[]'::jsonb)
                from public.lr_abgaben a where a.code = p_code)
  );
end;
$$;

-- Belegt einen freien Platz (oder bestätigt, dass er schon diesem Gerät gehört). true = gehört jetzt dir.
create or replace function public.lr_platz_belegen(p_code text, p_platz text, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_platz !~ '^[0-9A-Za-z_-]{1,64}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and ende > now() and loeschen_am > now()) then
    raise exception 'QUIZZO: Die Zeit ist um.';
  end if;
  update public.lr_abgaben set geheimnis_hash = p_hash, geaendert_am = now()
    where code = p_code and platz = p_platz and (geheimnis_hash is null or geheimnis_hash = p_hash);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Holt die eigene Seite wieder (z. B. nach einem Neuladen); null, wenn der Platz einem anderen Gerät gehört.
create or replace function public.lr_abgabe_laden(p_code text, p_platz text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.lr_abgaben%rowtype;
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_platz !~ '^[0-9A-Za-z_-]{1,64}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and ende > now() and loeschen_am > now()) then
    raise exception 'QUIZZO: Die Zeit ist um.';
  end if;
  select * into a from public.lr_abgaben where code = p_code and platz = p_platz and geheimnis_hash = p_hash;
  if not found then return null; end if;
  return jsonb_build_object('stand', a.stand, 'iv', a.iv, 'daten', a.daten);
end;
$$;

-- Speichert die eigene Seite. Nur mit dem Geheimnis des Platzes, nur solange die Zeit läuft, nur ein höherer Stand
-- ersetzt einen niedrigeren (ein verspäteter älterer Stand ändert nichts). Liefert den gespeicherten Stand.
create or replace function public.lr_abgabe_speichern(p_code text, p_platz text, p_hash text, p_stand integer, p_iv text, p_daten text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  jetzt integer;
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_platz !~ '^[0-9A-Za-z_-]{1,64}$' or p_hash !~ '^[0-9a-f]{64}$' or p_stand < 0 then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if char_length(p_iv) not between 12 and 32 or char_length(p_daten) > 3000000 then raise exception 'QUIZZO: Die Seite ist zu groß.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and ende > now() and loeschen_am > now()) then
    raise exception 'QUIZZO: Die Zeit ist um.';
  end if;
  select stand into jetzt from public.lr_abgaben where code = p_code and platz = p_platz and geheimnis_hash = p_hash for update;
  if not found then raise exception 'QUIZZO: Dieser Platz gehört einem anderen Gerät.'; end if;
  if p_stand <= jetzt and exists (select 1 from public.lr_abgaben where code = p_code and platz = p_platz and daten is not null) then return jetzt; end if;
  update public.lr_abgaben set stand = p_stand, iv = p_iv, daten = p_daten, geaendert_am = now() where code = p_code and platz = p_platz;
  return p_stand;
end;
$$;

revoke all on function public.lr_sitzung_anlegen(text, timestamptz, text, text, text[]) from public, anon;
revoke all on function public.lr_sitzung_zeit(text, timestamptz) from public, anon;
revoke all on function public.lr_platz_freigeben(text, text) from public, anon;
grant execute on function public.lr_sitzung_anlegen(text, timestamptz, text, text, text[]) to authenticated;
grant execute on function public.lr_sitzung_zeit(text, timestamptz) to authenticated;
grant execute on function public.lr_platz_freigeben(text, text) to authenticated;

revoke all on function public.lr_mitmachen_laden(text) from public;
revoke all on function public.lr_platz_belegen(text, text, text) from public;
revoke all on function public.lr_abgabe_laden(text, text, text) from public;
revoke all on function public.lr_abgabe_speichern(text, text, text, integer, text, text) from public;
grant execute on function public.lr_mitmachen_laden(text) to anon, authenticated;
grant execute on function public.lr_platz_belegen(text, text, text) to anon, authenticated;
grant execute on function public.lr_abgabe_laden(text, text, text) to anon, authenticated;
grant execute on function public.lr_abgabe_speichern(text, text, text, integer, text, text) to anon, authenticated;

-- ---------- Automatisches Löschen alle 15 Minuten (pg_cron) ----------
-- Ist pg_cron nicht verfügbar, bleibt es bei dem Aufräumen beim Anlegen; abgelaufene Sitzungen sind für Schüler
-- trotzdem sofort unsichtbar. Dann: Dashboard → Database → Extensions → pg_cron einschalten und diesen Block wiederholen.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('lr-sitzungen-aufraeumen', '*/15 * * * *', 'select public.lr_sitzungen_aufraeumen()');
  else
    raise notice 'pg_cron ist nicht verfügbar: Abgelaufene Schülerseiten werden nur beim Anlegen einer neuen Freigabe gelöscht.';
  end if;
end;
$$;
