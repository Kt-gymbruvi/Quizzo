-- Quizzo – Etappe 8: Aufgaben ohne Live-Spiel (Selbstlernen, Hausaufgaben, Prüfung)
-- Die Lehrkraft erstellt aus einem Quiz eine Aufgabe mit Link-Code. Schüler bearbeiten sie
-- in eigenem Tempo auf dem Handy, ohne Countdown.
--
-- Datenschutz (von der Lehrkraft so entschieden):
--   * Selbstlernen: völlig anonym. Gespeichert werden nur Zahlen pro Frage (Versuche, richtig).
--   * Hausaufgabe:  Spitzname, Antworten, Punkte. Abgabefrist höchstens 14 Tage,
--                   7 Tage nach der Frist wird alles automatisch gelöscht.
--   * Prüfung:      Quizzo erzeugt Pseudonym-Codes (z. B. K7F-2QM). Die Zuordnung zu Namen
--                   kennt nur die Lehrkraft (auf Papier). Code, Antworten, Punkte werden
--                   spätestens 30 Tage nach dem Erstellen automatisch gelöscht.
--   * Die Lehrkraft kann jede Aufgabe jederzeit vorher löschen.
--   * Bilder/Audio/Video werden in Aufgaben nicht gezeigt (es gibt keinen Beamer).
-- Schüler haben KEINEN Tabellenzugriff, nur über die Funktionen unten.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.aufgaben (
  id           uuid primary key default gen_random_uuid(),
  besitzer_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  modus        text not null check (modus in ('selbstlernen', 'hausaufgabe', 'pruefung')),
  titel        text not null check (char_length(titel) between 1 and 200),
  -- Kopie der Fragen beim Erstellen: Spätere Änderungen am Quiz ändern die Aufgabe nicht.
  fragen       jsonb not null check (jsonb_typeof(fragen) = 'array' and jsonb_array_length(fragen) between 1 and 200),
  erstellt_am  timestamptz not null default now(),
  frist        timestamptz,
  loeschen_am  timestamptz,
  geschlossen  boolean not null default false,
  check (modus = 'selbstlernen' or (frist is not null and loeschen_am is not null)),
  check (modus <> 'hausaufgabe' or loeschen_am <= frist + interval '7 days'),
  check (modus <> 'pruefung' or loeschen_am <= erstellt_am + interval '30 days')
);
create index aufgaben_besitzer_idx on public.aufgaben (besitzer_id);
create index aufgaben_loeschen_idx on public.aufgaben (loeschen_am);

-- Selbstlernen: nur anonyme Zahlen pro Frage
create table public.aufgabe_statistik (
  aufgabe_id    uuid not null references public.aufgaben (id) on delete cascade,
  frage_nr      integer not null,
  versuche      integer not null default 0,
  richtig       integer not null default 0,
  anteil_summe  real not null default 0,
  primary key (aufgabe_id, frage_nr)
);

-- Hausaufgabe (Spitzname) und Prüfung (Pseudonym-Code)
create table public.aufgabe_teilnehmer (
  id            uuid primary key default gen_random_uuid(),
  aufgabe_id    uuid not null references public.aufgaben (id) on delete cascade,
  spitzname     text check (char_length(spitzname) between 1 and 20),
  code          text check (code ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$'),
  token         uuid,
  punkte        integer not null default 0,
  begonnen_am   timestamptz,
  abgegeben_am  timestamptz,
  check ((spitzname is null) <> (code is null))
);
create unique index aufgabe_teilnehmer_name_idx on public.aufgabe_teilnehmer (aufgabe_id, lower(spitzname));
create unique index aufgabe_teilnehmer_code_idx on public.aufgabe_teilnehmer (aufgabe_id, code);

create table public.aufgabe_antworten (
  teilnehmer_id   uuid not null references public.aufgabe_teilnehmer (id) on delete cascade,
  aufgabe_id      uuid not null references public.aufgaben (id) on delete cascade,
  frage_nr        integer not null,
  antwort         jsonb not null,
  anteil          real not null,
  punkte          integer not null,
  beantwortet_am  timestamptz not null default now(),
  primary key (teilnehmer_id, frage_nr)
);
create index aufgabe_antworten_aufgabe_idx on public.aufgabe_antworten (aufgabe_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: Lehrkraft liest und löscht nur Eigenes, alles andere über Funktionen.
-- ---------------------------------------------------------------------------
alter table public.aufgaben enable row level security;
alter table public.aufgabe_statistik enable row level security;
alter table public.aufgabe_teilnehmer enable row level security;
alter table public.aufgabe_antworten enable row level security;

revoke all on public.aufgaben, public.aufgabe_statistik, public.aufgabe_teilnehmer, public.aufgabe_antworten
  from anon, authenticated;
grant select, delete on public.aufgaben to authenticated;
grant select on public.aufgabe_statistik to authenticated;
-- Den geheimen Schlüssel (token) darf auch die Lehrkraft nicht lesen.
grant select (id, aufgabe_id, spitzname, code, punkte, begonnen_am, abgegeben_am), delete
  on public.aufgabe_teilnehmer to authenticated;
grant select on public.aufgabe_antworten to authenticated;

create policy "Lehrkraft liest eigene Aufgaben" on public.aufgaben
  for select to authenticated using (besitzer_id = (select auth.uid()));
create policy "Lehrkraft löscht eigene Aufgaben" on public.aufgaben
  for delete to authenticated using (besitzer_id = (select auth.uid()));
create policy "Lehrkraft liest Statistik eigener Aufgaben" on public.aufgabe_statistik
  for select to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id and a.besitzer_id = (select auth.uid())));
create policy "Lehrkraft liest Teilnehmer eigener Aufgaben" on public.aufgabe_teilnehmer
  for select to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id and a.besitzer_id = (select auth.uid())));
create policy "Lehrkraft entfernt Teilnehmer eigener Aufgaben" on public.aufgabe_teilnehmer
  for delete to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id and a.besitzer_id = (select auth.uid())));
create policy "Lehrkraft liest Antworten eigener Aufgaben" on public.aufgabe_antworten
  for select to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id and a.besitzer_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (nur intern)
-- ---------------------------------------------------------------------------

-- Zufallscode aus 32 gut lesbaren Zeichen (ohne 0/O, 1/I)
create function public.zufallscode(n integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) x, generate_series(0, least(n, 6) - 1) i;
$$;
revoke execute on function public.zufallscode(integer) from public, anon, authenticated;

-- Eingegebene Codes vereinheitlichen: Großbuchstaben, ohne Leerzeichen und Bindestriche
create function public.code_normal(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Abgelaufene Aufgaben samt allen Daten löschen
create function public.aufgaben_aufraeumen()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.aufgaben where loeschen_am < now();
$$;
revoke execute on function public.aufgaben_aufraeumen() from public, anon, authenticated;

-- Das bestehende Aufräumen der Live-Spiele räumt ab jetzt auch Aufgaben mit auf.
create or replace function public.spiele_aufraeumen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.spiele where erstellt_am < now() - interval '6 hours';
  perform public.aufgaben_aufraeumen();
end;
$$;
revoke execute on function public.spiele_aufraeumen() from public, anon, authenticated;

-- Kann man die Aufgabe gerade bearbeiten?
create function public.aufgabe_offen(a public.aufgaben)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not a.geschlossen and (a.frist is null or now() <= a.frist)
         and (a.loeschen_am is null or now() < a.loeschen_am);
$$;
revoke execute on function public.aufgabe_offen(public.aufgaben) from public, anon, authenticated;

-- Fragen so, wie Schüler sie sehen (ohne Lösung, gemischt wie im Live-Spiel)
create function public.aufgabe_fragen_schueler(a public.aufgaben)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'typ', f ->> 'typ', 'text', f ->> 'text', 'zeitlimit', 0, 'punkte', (f ->> 'punkte')::integer,
    'ansicht', public.frage_fuer_schueler(f ->> 'typ', f -> 'inhalt', a.id::text || ':' || (nr - 1)))
    order by nr), '[]'::jsonb)
  from jsonb_array_elements(a.fragen) with ordinality as t(f, nr);
$$;
revoke execute on function public.aufgabe_fragen_schueler(public.aufgaben) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funktionen für die Lehrkraft
-- ---------------------------------------------------------------------------

-- Aufgabe aus einem eigenen Quiz erstellen. Liefert {id, code}.
--   p_frist: Selbstlernen optional; Hausaufgabe höchstens 14 Tage; Prüfung höchstens 30 Tage
--   p_codes: nur Prüfung, Anzahl der Pseudonym-Codes (1 bis 60)
create function public.aufgabe_erstellen(p_quiz_id uuid, p_modus text, p_frist timestamptz default null, p_codes integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titel   text;
  v_fragen  jsonb;
  v_code    text;
  v_loeschen timestamptz;
  v_id      uuid;
  v_neu     text;
  i         integer;
begin
  if auth.uid() is null then
    raise exception 'QUIZZO: Bitte melde dich an.';
  end if;
  perform public.aufgaben_aufraeumen();

  select titel into v_titel from public.quizze where id = p_quiz_id and besitzer_id = auth.uid();
  if not found then
    raise exception 'QUIZZO: Quiz nicht gefunden.';
  end if;
  select jsonb_agg(jsonb_build_object('typ', typ, 'text', text, 'inhalt', inhalt, 'punkte', punkte) order by position)
    into v_fragen from public.fragen where quiz_id = p_quiz_id;
  if v_fragen is null then
    raise exception 'QUIZZO: Das Quiz hat noch keine Fragen.';
  end if;

  if p_modus not in ('selbstlernen', 'hausaufgabe', 'pruefung') then
    raise exception 'QUIZZO: Unbekannter Modus.';
  end if;
  if p_frist is not null and p_frist <= now() then
    raise exception 'QUIZZO: Die Frist muss in der Zukunft liegen.';
  end if;
  if p_modus = 'selbstlernen' then
    if p_frist is not null and p_frist > now() + interval '1 year' then
      raise exception 'QUIZZO: Die Frist darf höchstens ein Jahr entfernt sein.';
    end if;
    v_loeschen := null;
  elsif p_modus = 'hausaufgabe' then
    if p_frist is null or p_frist > now() + interval '14 days' then
      raise exception 'QUIZZO: Bitte eine Abgabefrist von höchstens 14 Tagen wählen.';
    end if;
    v_loeschen := p_frist + interval '7 days';
  else
    if p_frist is null or p_frist > now() + interval '30 days' then
      raise exception 'QUIZZO: Bitte ein Prüfungsende innerhalb von 30 Tagen wählen.';
    end if;
    if p_codes is null or p_codes < 1 or p_codes > 60 then
      raise exception 'QUIZZO: Bitte 1 bis 60 Codes wählen.';
    end if;
    v_loeschen := now() + interval '30 days';
  end if;

  loop
    v_code := public.zufallscode(6);
    exit when not exists (select 1 from public.aufgaben where code = v_code);
  end loop;

  insert into public.aufgaben (besitzer_id, code, modus, titel, fragen, frist, loeschen_am)
    values (auth.uid(), v_code, p_modus, v_titel, v_fragen, p_frist, v_loeschen)
    returning id into v_id;

  if p_modus = 'pruefung' then
    i := 0;
    while i < p_codes loop
      v_neu := public.zufallscode(3) || '-' || public.zufallscode(3);
      insert into public.aufgabe_teilnehmer (aufgabe_id, code) values (v_id, v_neu) on conflict do nothing;
      if found then i := i + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;
revoke execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer) to authenticated;

-- Übersicht aller eigenen Aufgaben
create function public.aufgaben_liste()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.aufgaben_aufraeumen();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'code', a.code, 'modus', a.modus, 'titel', a.titel,
      'erstellt_am', a.erstellt_am, 'frist', a.frist, 'loeschen_am', a.loeschen_am,
      'offen', public.aufgabe_offen(a),
      'teilnehmer', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.begonnen_am is not null),
      'abgegeben', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.abgegeben_am is not null),
      'versuche', (select coalesce(sum(versuche), 0) from public.aufgabe_statistik s where s.aufgabe_id = a.id))
      order by a.erstellt_am desc)
    from public.aufgaben a where a.besitzer_id = auth.uid()), '[]'::jsonb);
end;
$$;
revoke execute on function public.aufgaben_liste() from public, anon;
grant execute on function public.aufgaben_liste() to authenticated;

-- Ergebnisse einer eigenen Aufgabe (mit Lösungen, Antworten und Codes)
create function public.aufgabe_ergebnisse(p_aufgabe uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.aufgaben;
begin
  perform public.aufgaben_aufraeumen();
  select * into a from public.aufgaben where id = p_aufgabe and besitzer_id = auth.uid();
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', a.id, 'code', a.code, 'modus', a.modus, 'titel', a.titel,
    'erstellt_am', a.erstellt_am, 'frist', a.frist, 'loeschen_am', a.loeschen_am,
    'offen', public.aufgabe_offen(a), 'geschlossen', a.geschlossen,
    'fragen', a.fragen,
    'statistik', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', frage_nr, 'versuche', versuche,
                    'richtig', richtig, 'anteil_summe', anteil_summe) order by frage_nr)
                  from public.aufgabe_statistik where aufgabe_id = a.id), '[]'::jsonb),
    'teilnehmer', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'spitzname', t.spitzname, 'code', t.code, 'punkte', t.punkte,
        'aktiv', t.token is not null, 'begonnen_am', t.begonnen_am, 'abgegeben_am', t.abgegeben_am,
        'antworten', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', x.frage_nr, 'antwort', x.antwort,
                        'anteil', x.anteil, 'punkte', x.punkte) order by x.frage_nr)
                      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb))
        order by coalesce(t.code, lower(t.spitzname)))
      from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.aufgabe_ergebnisse(uuid) from public, anon;
grant execute on function public.aufgabe_ergebnisse(uuid) to authenticated;

-- Aufgabe vorzeitig beenden (danach keine Antworten mehr)
create function public.aufgabe_schliessen(p_aufgabe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.aufgaben set geschlossen = true where id = p_aufgabe and besitzer_id = auth.uid();
  if not found then
    raise exception 'QUIZZO: Aufgabe nicht gefunden.';
  end if;
end;
$$;
revoke execute on function public.aufgabe_schliessen(uuid) from public, anon;
grant execute on function public.aufgabe_schliessen(uuid) to authenticated;

-- Prüfung: Code wieder freigeben (z. B. Handy-Akku leer). Bisherige Antworten bleiben.
create function public.pruefung_code_freigeben(p_teilnehmer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.aufgabe_teilnehmer t set token = null
   where t.id = p_teilnehmer and t.code is not null
     and exists (select 1 from public.aufgaben a where a.id = t.aufgabe_id and a.besitzer_id = auth.uid());
  if not found then
    raise exception 'QUIZZO: Code nicht gefunden.';
  end if;
end;
$$;
revoke execute on function public.pruefung_code_freigeben(uuid) from public, anon;
grant execute on function public.pruefung_code_freigeben(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funktionen für Schüler (ohne Konto)
-- ---------------------------------------------------------------------------

-- Aufgabe per Link-Code öffnen. Fragen gibt es hier nur beim Selbstlernen;
-- bei Hausaufgabe und Prüfung erst nach dem Beitreten.
create function public.aufgabe_oeffnen(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.aufgaben;
begin
  select * into a from public.aufgaben where code = public.code_normal(p_code);
  if not found or (a.loeschen_am is not null and a.loeschen_am < now()) then
    raise exception 'QUIZZO: Diese Aufgabe gibt es nicht (mehr). Bitte prüfe den Code.';
  end if;
  return jsonb_build_object(
    'code', a.code, 'modus', a.modus, 'titel', a.titel, 'frist', a.frist,
    'offen', public.aufgabe_offen(a), 'anzahl_fragen', jsonb_array_length(a.fragen),
    'fragen', case when a.modus = 'selbstlernen' and public.aufgabe_offen(a) then public.aufgabe_fragen_schueler(a) end);
end;
$$;
revoke execute on function public.aufgabe_oeffnen(text) from public;
grant execute on function public.aufgabe_oeffnen(text) to anon, authenticated;

-- Hausaufgabe: mit Spitznamen beitreten. Prüfung: mit dem Pseudonym-Code vom Zettel.
-- Liefert {teilnehmer_id, token, name}.
create function public.aufgabe_beitreten(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      public.aufgaben;
  t      public.aufgabe_teilnehmer;
  v_name text := btrim(coalesce(p_name, ''));
  v_pc   text;
begin
  perform public.aufgaben_aufraeumen();
  select * into a from public.aufgaben where code = public.code_normal(p_code);
  if not found then
    raise exception 'QUIZZO: Diese Aufgabe gibt es nicht (mehr). Bitte prüfe den Code.';
  end if;
  if not public.aufgabe_offen(a) then
    raise exception 'QUIZZO: Diese Aufgabe ist schon beendet.';
  end if;

  if a.modus = 'hausaufgabe' then
    if char_length(v_name) < 1 or char_length(v_name) > 20 then
      raise exception 'QUIZZO: Der Spitzname muss 1 bis 20 Zeichen lang sein.';
    end if;
    insert into public.aufgabe_teilnehmer (aufgabe_id, spitzname, token, begonnen_am)
      values (a.id, v_name, gen_random_uuid(), now())
      on conflict do nothing
      returning * into t;
    if t.id is null then
      raise exception 'QUIZZO: Dieser Spitzname ist schon vergeben.';
    end if;
    return jsonb_build_object('teilnehmer_id', t.id, 'token', t.token, 'name', t.spitzname);

  elsif a.modus = 'pruefung' then
    v_pc := public.code_normal(v_name);
    if char_length(v_pc) <> 6 then
      raise exception 'QUIZZO: Bitte gib deinen Prüfungscode vom Zettel ein (z. B. K7F-2QM).';
    end if;
    v_pc := substr(v_pc, 1, 3) || '-' || substr(v_pc, 4, 3);
    update public.aufgabe_teilnehmer
       set token = gen_random_uuid(), begonnen_am = coalesce(begonnen_am, now())
     where aufgabe_id = a.id and code = v_pc and token is null
     returning * into t;
    if t.id is null then
      if exists (select 1 from public.aufgabe_teilnehmer where aufgabe_id = a.id and code = v_pc) then
        raise exception 'QUIZZO: Dieser Code wird schon auf einem anderen Gerät benutzt. Bitte melde dich bei deiner Lehrkraft.';
      end if;
      raise exception 'QUIZZO: Diesen Prüfungscode gibt es nicht. Bitte prüfe die Eingabe.';
    end if;
    return jsonb_build_object('teilnehmer_id', t.id, 'token', t.token, 'name', t.code);

  else
    raise exception 'QUIZZO: Beim Selbstlernen braucht man keinen Namen.';
  end if;
end;
$$;
revoke execute on function public.aufgabe_beitreten(text, text) from public;
grant execute on function public.aufgabe_beitreten(text, text) to anon, authenticated;

-- Stand eines Teilnehmers: Fragen und was schon beantwortet ist.
-- Bei der Hausaufgabe mit Ergebnis und Lösung je beantworteter Frage, bei der Prüfung ohne.
create function public.aufgabe_zustand(p_teilnehmer uuid, p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.aufgabe_teilnehmer;
  a public.aufgaben;
begin
  select * into t from public.aufgabe_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    return null;
  end if;
  select * into a from public.aufgaben where id = t.aufgabe_id;
  if a.loeschen_am < now() then
    return null;
  end if;
  return jsonb_build_object(
    'code', a.code, 'modus', a.modus, 'titel', a.titel, 'frist', a.frist,
    'offen', public.aufgabe_offen(a), 'name', coalesce(t.spitzname, t.code),
    'abgegeben', t.abgegeben_am is not null,
    'punkte', case when a.modus = 'hausaufgabe' then t.punkte end,
    'fragen', public.aufgabe_fragen_schueler(a),
    'antworten', coalesce((select jsonb_agg(case when a.modus = 'hausaufgabe' then
          jsonb_build_object('frage_nr', x.frage_nr, 'anteil', x.anteil, 'punkte', x.punkte,
            'loesung', public.frage_loesung(a.fragen -> x.frage_nr ->> 'typ', a.fragen -> x.frage_nr -> 'inhalt'))
        else jsonb_build_object('frage_nr', x.frage_nr) end order by x.frage_nr)
      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.aufgabe_zustand(uuid, uuid) from public;
grant execute on function public.aufgabe_zustand(uuid, uuid) to anon, authenticated;

-- Eine Frage beantworten.
--   Selbstlernen: ohne Teilnehmer; zählt anonym mit, liefert {anteil, loesung}. Beliebig oft.
--   Hausaufgabe:  einmal pro Frage; liefert {anteil, punkte, loesung}.
--   Prüfung:      einmal pro Frage; liefert nur {ok} (keine Lösung, kein Ergebnis).
-- Punkte: 1000 × Punktefaktor × Anteil richtig (ohne Zeitbonus).
create function public.aufgabe_antworten(p_code text, p_teilnehmer uuid, p_token uuid, p_frage_nr integer, p_antwort jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a        public.aufgaben;
  t        public.aufgabe_teilnehmer;
  f        jsonb;
  v_anteil real;
  v_punkte integer := 0;
  v_offen  integer;
begin
  select * into a from public.aufgaben where code = public.code_normal(p_code);
  if not found then
    raise exception 'QUIZZO: Diese Aufgabe gibt es nicht (mehr).';
  end if;
  if not public.aufgabe_offen(a) then
    raise exception 'QUIZZO: Diese Aufgabe ist schon beendet.';
  end if;
  if p_frage_nr is null or p_frage_nr < 0 or p_frage_nr >= jsonb_array_length(a.fragen) then
    raise exception 'QUIZZO: Diese Frage gibt es nicht.';
  end if;
  f := a.fragen -> p_frage_nr;
  v_anteil := public.antwort_bewerten(f ->> 'typ', f -> 'inhalt', p_antwort);

  if a.modus = 'selbstlernen' then
    insert into public.aufgabe_statistik as s (aufgabe_id, frage_nr, versuche, richtig, anteil_summe)
      values (a.id, p_frage_nr, 1, case when v_anteil >= 1 then 1 else 0 end, v_anteil)
      on conflict (aufgabe_id, frage_nr) do update
        set versuche = s.versuche + 1, richtig = s.richtig + excluded.richtig, anteil_summe = s.anteil_summe + excluded.anteil_summe;
    return jsonb_build_object('anteil', v_anteil, 'loesung', public.frage_loesung(f ->> 'typ', f -> 'inhalt'));
  end if;

  select * into t from public.aufgabe_teilnehmer
    where id = p_teilnehmer and token = p_token and aufgabe_id = a.id
    for update;
  if not found then
    raise exception 'QUIZZO: Du bist nicht (mehr) bei dieser Aufgabe angemeldet.';
  end if;

  if v_anteil > 0 then
    v_punkte := round(1000 * v_anteil * coalesce((f ->> 'punkte')::integer, 1))::integer;
  end if;
  insert into public.aufgabe_antworten (teilnehmer_id, aufgabe_id, frage_nr, antwort, anteil, punkte)
    values (t.id, a.id, p_frage_nr, p_antwort, v_anteil, v_punkte)
    on conflict do nothing;
  if not found then
    raise exception 'QUIZZO: Du hast diese Frage schon beantwortet.';
  end if;

  -- Alle Fragen (außer Präsentationsfolien) beantwortet? Dann gilt die Aufgabe als abgegeben.
  select count(*) into v_offen
    from jsonb_array_elements(a.fragen) with ordinality as q(x, nr)
    where x ->> 'typ' <> 'folie'
      and not exists (select 1 from public.aufgabe_antworten y where y.teilnehmer_id = t.id and y.frage_nr = nr - 1);
  update public.aufgabe_teilnehmer
     set punkte = punkte + v_punkte,
         abgegeben_am = case when v_offen = 0 then now() else abgegeben_am end
   where id = t.id;

  if a.modus = 'pruefung' then
    return jsonb_build_object('ok', true, 'abgegeben', v_offen = 0);
  end if;
  return jsonb_build_object('anteil', v_anteil, 'punkte', v_punkte, 'abgegeben', v_offen = 0,
                            'loesung', public.frage_loesung(f ->> 'typ', f -> 'inhalt'));
end;
$$;
revoke execute on function public.aufgabe_antworten(text, uuid, uuid, integer, jsonb) from public;
grant execute on function public.aufgabe_antworten(text, uuid, uuid, integer, jsonb) to anon, authenticated;
