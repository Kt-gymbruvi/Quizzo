-- Quizzo – Etappe 3: Live-Spiel
-- Spieldaten (Spitznamen, Antworten, Punkte) existieren nur während eines Spiels.
-- Beim Beenden löscht die Lehrkraft das Spiel samt allen Spieldaten (on delete cascade).
-- Liegengebliebene Spiele werden nach 6 Stunden automatisch gelöscht.
-- Schüler haben KEINEN Tabellenzugriff, nur über die Funktionen weiter unten.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.spiele (
  id           uuid primary key default gen_random_uuid(),
  pin          text not null unique check (pin ~ '^[0-9]{6}$'),
  quiz_id      uuid not null references public.quizze (id) on delete cascade,
  besitzer_id  uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'lobby' check (status in ('lobby', 'frage', 'auswertung', 'ende')),
  frage_nr     integer not null default -1,
  frage_start  timestamptz,
  erstellt_am  timestamptz not null default now()
);
create index spiele_besitzer_idx on public.spiele (besitzer_id);
create index spiele_erstellt_idx on public.spiele (erstellt_am);

create table public.spieler (
  id              uuid primary key default gen_random_uuid(),
  spiel_id        uuid not null references public.spiele (id) on delete cascade,
  spitzname       text not null check (char_length(spitzname) between 1 and 20),
  token           uuid not null default gen_random_uuid(),
  punkte          integer not null default 0,
  beigetreten_am  timestamptz not null default now()
);
create unique index spieler_spitzname_idx on public.spieler (spiel_id, lower(spitzname));

create table public.antworten (
  spieler_id  uuid not null references public.spieler (id) on delete cascade,
  spiel_id    uuid not null references public.spiele (id) on delete cascade,
  frage_nr    integer not null,
  antwort     smallint not null,
  richtig     boolean not null,
  punkte      integer not null,
  zeit_ms     integer not null,
  primary key (spieler_id, frage_nr)
);
create index antworten_spiel_idx on public.antworten (spiel_id, frage_nr);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Lehrkraft: darf eigene Spiele lesen und löschen, Spieler entfernen.
-- Alles andere läuft über die Funktionen unten.
-- ---------------------------------------------------------------------------
alter table public.spiele enable row level security;
alter table public.spieler enable row level security;
alter table public.antworten enable row level security;

revoke all on public.spiele, public.spieler, public.antworten from anon, authenticated;
grant select, delete on public.spiele to authenticated;
-- Den geheimen Spieler-Schlüssel (token) darf auch die Lehrkraft nicht lesen.
grant select (id, spiel_id, spitzname, punkte, beigetreten_am), delete on public.spieler to authenticated;
grant select on public.antworten to authenticated;

create policy "Lehrkraft liest eigene Spiele" on public.spiele
  for select to authenticated using (besitzer_id = (select auth.uid()));
create policy "Lehrkraft löscht eigene Spiele" on public.spiele
  for delete to authenticated using (besitzer_id = (select auth.uid()));

create policy "Lehrkraft liest Spieler eigener Spiele" on public.spieler
  for select to authenticated
  using (exists (select 1 from public.spiele s where s.id = spiel_id and s.besitzer_id = (select auth.uid())));
create policy "Lehrkraft entfernt Spieler eigener Spiele" on public.spieler
  for delete to authenticated
  using (exists (select 1 from public.spiele s where s.id = spiel_id and s.besitzer_id = (select auth.uid())));

create policy "Lehrkraft liest Antworten eigener Spiele" on public.antworten
  for select to authenticated
  using (exists (select 1 from public.spiele s where s.id = spiel_id and s.besitzer_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Aufräumen: Spiele älter als 6 Stunden löschen (nur intern aufrufbar)
-- ---------------------------------------------------------------------------
create function public.spiele_aufraeumen()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.spiele where erstellt_am < now() - interval '6 hours';
$$;
revoke execute on function public.spiele_aufraeumen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funktionen für die Lehrkraft
-- ---------------------------------------------------------------------------

-- Neues Spiel zu einem eigenen Quiz anlegen. Liefert {id, pin}.
create function public.spiel_erstellen(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pin text;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'QUIZZO: Bitte melde dich an.';
  end if;
  if not exists (select 1 from public.quizze where id = p_quiz_id and besitzer_id = v_uid) then
    raise exception 'QUIZZO: Quiz nicht gefunden.';
  end if;
  if not exists (select 1 from public.fragen where quiz_id = p_quiz_id) then
    raise exception 'QUIZZO: Das Quiz hat noch keine Fragen.';
  end if;

  perform public.spiele_aufraeumen();

  loop
    v_pin := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    begin
      insert into public.spiele (pin, quiz_id, besitzer_id)
        values (v_pin, p_quiz_id, v_uid)
        returning id into v_id;
      exit;
    exception when unique_violation then
      -- PIN schon vergeben: neue ziehen
    end;
  end loop;

  return jsonb_build_object('id', v_id, 'pin', v_pin);
end;
$$;

-- Spiel steuern: 'weiter' (nächste Frage bzw. Ende) oder 'aufloesen' (Frage beenden).
create function public.spiel_steuern(p_spiel uuid, p_aktion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spiele;
  v_anzahl integer;
begin
  select * into s from public.spiele
    where id = p_spiel and besitzer_id = auth.uid()
    for update;
  if not found then
    raise exception 'QUIZZO: Spiel nicht gefunden.';
  end if;

  if p_aktion = 'weiter' then
    if s.status not in ('lobby', 'auswertung') then
      return; -- doppelter Klick o. Ä.: nichts tun
    end if;
    select count(*) into v_anzahl from public.fragen where quiz_id = s.quiz_id;
    if s.frage_nr + 1 >= v_anzahl then
      update public.spiele set status = 'ende' where id = s.id;
    else
      update public.spiele
        set status = 'frage', frage_nr = s.frage_nr + 1, frage_start = now()
        where id = s.id;
    end if;
  elsif p_aktion = 'aufloesen' then
    if s.status = 'frage' then
      update public.spiele set status = 'auswertung' where id = s.id;
    end if;
  else
    raise exception 'QUIZZO: Unbekannte Aktion.';
  end if;
end;
$$;

-- Kompletter Spielzustand für die Lehrkraft-Ansicht (inkl. richtiger Antwort).
create function public.spiel_zustand_lehrkraft(p_spiel uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s             public.spiele;
  v_frage       public.fragen;
  v_anzahl      integer;
  v_spieler     jsonb;
  v_verteilung  jsonb;
  v_beantwortet integer := 0;
  v_rest        integer;
begin
  select * into s from public.spiele where id = p_spiel and besitzer_id = auth.uid();
  if not found then
    return null;
  end if;

  select count(*) into v_anzahl from public.fragen where quiz_id = s.quiz_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'spitzname', sp.spitzname, 'punkte', sp.punkte)
                            order by sp.punkte desc, sp.beigetreten_am), '[]'::jsonb)
    into v_spieler
    from public.spieler sp where sp.spiel_id = s.id;

  if s.frage_nr >= 0 then
    select * into v_frage from public.fragen where quiz_id = s.quiz_id and position = s.frage_nr;
    select count(*) into v_beantwortet from public.antworten where spiel_id = s.id and frage_nr = s.frage_nr;
    select jsonb_agg((select count(*) from public.antworten a
                       where a.spiel_id = s.id and a.frage_nr = s.frage_nr and a.antwort = i) order by i)
      into v_verteilung
      from generate_series(0, coalesce(array_length(v_frage.antworten, 1), 0) - 1) as i;
  end if;

  if s.status = 'frage' and v_frage.zeitlimit is not null then
    v_rest := greatest(0, v_frage.zeitlimit * 1000 - floor(extract(epoch from (now() - s.frage_start)) * 1000))::integer;
  end if;

  return jsonb_build_object(
    'id', s.id,
    'pin', s.pin,
    'status', s.status,
    'frage_nr', s.frage_nr,
    'anzahl_fragen', v_anzahl,
    'quiz_titel', (select q.titel from public.quizze q where q.id = s.quiz_id),
    'frage', case when v_frage.text is null then null else jsonb_build_object(
      'text', v_frage.text, 'antworten', to_jsonb(v_frage.antworten),
      'richtig', v_frage.richtig, 'zeitlimit', v_frage.zeitlimit) end,
    'restzeit_ms', v_rest,
    'spieler', v_spieler,
    'verteilung', coalesce(v_verteilung, '[]'::jsonb),
    'beantwortet', v_beantwortet
  );
end;
$$;

revoke execute on function public.spiel_erstellen(uuid) from public, anon;
revoke execute on function public.spiel_steuern(uuid, text) from public, anon;
revoke execute on function public.spiel_zustand_lehrkraft(uuid) from public, anon;
grant execute on function public.spiel_erstellen(uuid) to authenticated;
grant execute on function public.spiel_steuern(uuid, text) to authenticated;
grant execute on function public.spiel_zustand_lehrkraft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funktionen für Schüler (ohne Konto, nur PIN + Spitzname)
-- ---------------------------------------------------------------------------

-- Einem laufenden Spiel beitreten. Liefert {spiel_id, spieler_id, token, spitzname}.
create function public.spiel_beitreten(p_pin text, p_spitzname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_spitzname, ''), '\s+', ' ', 'g'));
  s      public.spiele;
  v_sp   public.spieler;
begin
  perform public.spiele_aufraeumen();

  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception 'QUIZZO: Der Spitzname muss 1 bis 20 Zeichen lang sein.';
  end if;

  select * into s from public.spiele where pin = btrim(coalesce(p_pin, ''));
  if not found or s.status = 'ende' then
    raise exception 'QUIZZO: Kein laufendes Spiel mit dieser PIN gefunden.';
  end if;

  if (select count(*) from public.spieler where spiel_id = s.id) >= 100 then
    raise exception 'QUIZZO: Das Spiel ist voll.';
  end if;

  begin
    insert into public.spieler (spiel_id, spitzname) values (s.id, v_name) returning * into v_sp;
  exception when unique_violation then
    raise exception 'QUIZZO: Dieser Spitzname ist schon vergeben.';
  end;

  return jsonb_build_object('spiel_id', s.id, 'spieler_id', v_sp.id, 'token', v_sp.token, 'spitzname', v_sp.spitzname);
end;
$$;

-- Spielzustand aus Sicht eines Schülers. Liefert null, wenn das Spiel (oder der Spieler) nicht mehr existiert.
-- Die richtige Antwort wird erst nach der Auflösung mitgeschickt.
create function public.spiel_zustand_schueler(p_spieler uuid, p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sp         public.spieler;
  s            public.spiele;
  v_frage      public.fragen;
  v_antwort    public.antworten;
  v_anzahl     integer;
  v_platz      integer;
  v_mitspieler integer;
  v_rest       integer;
begin
  select * into v_sp from public.spieler where id = p_spieler and token = p_token;
  if not found then
    return null;
  end if;
  select * into s from public.spiele where id = v_sp.spiel_id;

  select count(*) into v_anzahl from public.fragen where quiz_id = s.quiz_id;
  select count(*) + 1 into v_platz from public.spieler where spiel_id = s.id and punkte > v_sp.punkte;
  select count(*) into v_mitspieler from public.spieler where spiel_id = s.id;

  if s.status in ('frage', 'auswertung') then
    select * into v_frage from public.fragen where quiz_id = s.quiz_id and position = s.frage_nr;
    select * into v_antwort from public.antworten where spieler_id = v_sp.id and frage_nr = s.frage_nr;
  end if;

  if s.status = 'frage' and v_frage.zeitlimit is not null then
    v_rest := greatest(0, v_frage.zeitlimit * 1000 - floor(extract(epoch from (now() - s.frage_start)) * 1000))::integer;
  end if;

  return jsonb_build_object(
    'status', s.status,
    'frage_nr', s.frage_nr,
    'anzahl_fragen', v_anzahl,
    'spitzname', v_sp.spitzname,
    'punkte', v_sp.punkte,
    'platz', v_platz,
    'anzahl_spieler', v_mitspieler,
    'frage', case when v_frage.text is null then null else jsonb_build_object(
      'text', v_frage.text, 'antworten', to_jsonb(v_frage.antworten), 'zeitlimit', v_frage.zeitlimit) end,
    'restzeit_ms', v_rest,
    'meine_antwort', case
      when v_antwort.spieler_id is null then null
      when s.status = 'frage' then jsonb_build_object('antwort', v_antwort.antwort)
      else jsonb_build_object('antwort', v_antwort.antwort, 'richtig', v_antwort.richtig, 'punkte', v_antwort.punkte)
    end,
    'richtige_antwort', case when s.status = 'auswertung' then v_frage.richtig end
  );
end;
$$;

-- Antwort abgeben. Punkte berechnet der Server: richtig = 500 bis 1000 je nach Schnelligkeit, falsch = 0.
create function public.antwort_abgeben(p_spieler uuid, p_token uuid, p_frage_nr integer, p_antwort integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sp      public.spieler;
  s         public.spiele;
  v_frage   public.fragen;
  v_ms      integer;
  v_limit   integer;
  v_richtig boolean;
  v_punkte  integer;
begin
  select * into v_sp from public.spieler where id = p_spieler and token = p_token;
  if not found then
    raise exception 'QUIZZO: Du bist nicht (mehr) in diesem Spiel.';
  end if;
  select * into s from public.spiele where id = v_sp.spiel_id;

  if s.status <> 'frage' or s.frage_nr <> p_frage_nr then
    raise exception 'QUIZZO: Diese Frage ist schon vorbei.';
  end if;

  select * into v_frage from public.fragen where quiz_id = s.quiz_id and position = s.frage_nr;
  v_limit := v_frage.zeitlimit * 1000;
  v_ms := floor(extract(epoch from (now() - s.frage_start)) * 1000)::integer;
  if v_ms > v_limit + 1000 then -- 1 Sekunde Kulanz für langsame Verbindungen
    raise exception 'QUIZZO: Die Zeit ist abgelaufen.';
  end if;
  if p_antwort < 0 or p_antwort >= array_length(v_frage.antworten, 1) then
    raise exception 'QUIZZO: Ungültige Antwort.';
  end if;

  v_richtig := p_antwort = v_frage.richtig;
  v_punkte := case when v_richtig
    then greatest(500, round(1000 - 500.0 * least(greatest(v_ms, 0), v_limit) / v_limit))::integer
    else 0 end;

  insert into public.antworten (spieler_id, spiel_id, frage_nr, antwort, richtig, punkte, zeit_ms)
    values (v_sp.id, s.id, s.frage_nr, p_antwort, v_richtig, v_punkte, greatest(v_ms, 0))
    on conflict do nothing;
  if not found then
    raise exception 'QUIZZO: Du hast diese Frage schon beantwortet.';
  end if;

  update public.spieler set punkte = punkte + v_punkte where id = v_sp.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.spiel_beitreten(text, text) from public;
revoke execute on function public.spiel_zustand_schueler(uuid, uuid) from public;
revoke execute on function public.antwort_abgeben(uuid, uuid, integer, integer) from public;
grant execute on function public.spiel_beitreten(text, text) to anon, authenticated;
grant execute on function public.spiel_zustand_schueler(uuid, uuid) to anon, authenticated;
grant execute on function public.antwort_abgeben(uuid, uuid, integer, integer) to anon, authenticated;
