-- Quizzo – Etappe 6: Spielmodi (Klassisch und Team)
-- Teamspiel: Die Lehrkraft wählt 2–6 Teams. Schüler werden beim Beitreten automatisch dem kleinsten Team
-- zugeteilt (Lehrkraft kann in der Lobby umsetzen). Teampunkte = Durchschnitt der Punkte der Mitglieder,
-- damit unterschiedlich große Teams fair verglichen werden.
-- Datenschutz unverändert: weiterhin nur Spitznamen, alles wird beim Spielende gelöscht.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

alter table public.spiele
  add column modus text not null default 'klassisch',
  add column anzahl_teams smallint,
  add constraint spiele_modus_check check (
    (modus = 'klassisch' and anzahl_teams is null) or
    (modus = 'team' and anzahl_teams between 2 and 6));

alter table public.spieler
  add column team smallint check (team between 1 and 6);
-- Lehrkraft darf auch die Team-Nummer lesen (der geheime Schlüssel bleibt gesperrt)
grant select (team) on public.spieler to authenticated;

-- ---------------------------------------------------------------------------
-- Teamwertung: [{ team, punkte (Durchschnitt), mitglieder, platz }], beste zuerst.
-- Nur für interne Verwendung durch die Spiel-Funktionen.
-- ---------------------------------------------------------------------------
create function public.team_wertung(p_spiel uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select g.t as team,
           coalesce(round(avg(sp.punkte)), 0)::integer as punkte,
           count(sp.id)::integer as mitglieder
      from public.spiele s
      cross join generate_series(1, s.anzahl_teams) as g(t)
      left join public.spieler sp on sp.spiel_id = s.id and sp.team = g.t
     where s.id = p_spiel and s.modus = 'team'
     group by g.t
  )
  select coalesce(jsonb_agg(jsonb_build_object('team', team, 'punkte', punkte, 'mitglieder', mitglieder,
                                               'platz', platz) order by platz, team), '[]'::jsonb)
    from (select t.*, rank() over (order by punkte desc) as platz from t) r;
$$;
revoke execute on function public.team_wertung(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spiel erstellen: jetzt mit Modus und Anzahl der Teams
-- ---------------------------------------------------------------------------
drop function public.spiel_erstellen(uuid);

create function public.spiel_erstellen(p_quiz_id uuid, p_modus text default 'klassisch', p_teams integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_pin   text;
  v_id    uuid;
  v_modus text := coalesce(p_modus, 'klassisch');
begin
  if v_uid is null then
    raise exception 'QUIZZO: Bitte melde dich an.';
  end if;
  if v_modus not in ('klassisch', 'team') then
    raise exception 'QUIZZO: Unbekannter Spielmodus.';
  end if;
  if v_modus = 'team' and (p_teams is null or p_teams not between 2 and 6) then
    raise exception 'QUIZZO: Bitte 2 bis 6 Teams wählen.';
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
      insert into public.spiele (pin, quiz_id, besitzer_id, modus, anzahl_teams)
        values (v_pin, p_quiz_id, v_uid, v_modus, case when v_modus = 'team' then p_teams end)
        returning id into v_id;
      exit;
    exception when unique_violation then
      -- PIN schon vergeben: neue ziehen
    end;
  end loop;

  return jsonb_build_object('id', v_id, 'pin', v_pin);
end;
$$;
revoke execute on function public.spiel_erstellen(uuid, text, integer) from public, anon;
grant execute on function public.spiel_erstellen(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Lehrkraft setzt einen Spieler in der Lobby ins nächste Team (1 → 2 → … → 1)
-- ---------------------------------------------------------------------------
create function public.spieler_team_wechseln(p_spieler uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spiele;
begin
  select g.* into s
    from public.spieler sp join public.spiele g on g.id = sp.spiel_id
   where sp.id = p_spieler and g.besitzer_id = auth.uid();
  if not found then
    raise exception 'QUIZZO: Spieler nicht gefunden.';
  end if;
  if s.modus <> 'team' then
    raise exception 'QUIZZO: Das ist kein Teamspiel.';
  end if;
  if s.status <> 'lobby' then
    raise exception 'QUIZZO: Teams können nur vor dem Start geändert werden.';
  end if;
  update public.spieler set team = team % s.anzahl_teams + 1 where id = p_spieler;
end;
$$;
revoke execute on function public.spieler_team_wechseln(uuid) from public, anon;
grant execute on function public.spieler_team_wechseln(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Beitreten und Spielzustand: zusätzlich Modus, Team und Teamwertung
-- ---------------------------------------------------------------------------

create or replace function public.spiel_beitreten(p_pin text, p_spitzname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_spitzname, ''), '\s+', ' ', 'g'));
  s      public.spiele;
  v_sp   public.spieler;
  v_team smallint;
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
    -- Teamspiel: ins kleinste Team (bei Gleichstand das mit der kleinsten Nummer)
    if s.modus = 'team' then
      select t into v_team
        from generate_series(1, s.anzahl_teams) as t
        order by (select count(*) from public.spieler x where x.spiel_id = s.id and x.team = t), t
        limit 1;
    end if;
    insert into public.spieler (spiel_id, spitzname, team) values (s.id, v_name, v_team) returning * into v_sp;
  exception when unique_violation then
    raise exception 'QUIZZO: Dieser Spitzname ist schon vergeben.';
  end;

  return jsonb_build_object('spiel_id', s.id, 'spieler_id', v_sp.id, 'token', v_sp.token, 'spitzname', v_sp.spitzname, 'team', v_sp.team);
end;
$$;

create or replace function public.spiel_zustand_schueler(p_spieler uuid, p_token uuid)
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

  if s.status = 'frage' and v_frage.typ is distinct from 'folie' and v_frage.zeitlimit is not null then
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
    'modus', s.modus,
    'team', v_sp.team,
    'teams', case when s.modus = 'team' then public.team_wertung(s.id) end,
    'frage', case when v_frage.text is null then null else jsonb_build_object(
      'typ', v_frage.typ, 'text', v_frage.text, 'zeitlimit', v_frage.zeitlimit, 'punkte', v_frage.punkte,
      'ansicht', public.frage_fuer_schueler(v_frage.typ, v_frage.inhalt, s.id::text || ':' || s.frage_nr)) end,
    'restzeit_ms', v_rest,
    'meine_antwort', case
      when v_antwort.spieler_id is null then null
      when s.status = 'frage' then jsonb_build_object('antwort', v_antwort.antwort)
      else jsonb_build_object('antwort', v_antwort.antwort, 'richtig', v_antwort.richtig,
                              'anteil', v_antwort.anteil, 'punkte', v_antwort.punkte)
    end,
    'loesung', case when s.status = 'auswertung' then public.frage_loesung(v_frage.typ, v_frage.inhalt) end
  );
end;
$$;

create or replace function public.spiel_zustand_lehrkraft(p_spiel uuid)
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
  v_antworten   jsonb;
  v_beantwortet integer := 0;
  v_rest        integer;
begin
  select * into s from public.spiele where id = p_spiel and besitzer_id = auth.uid();
  if not found then
    return null;
  end if;

  select count(*) into v_anzahl from public.fragen where quiz_id = s.quiz_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'spitzname', sp.spitzname, 'punkte', sp.punkte, 'team', sp.team)
                            order by sp.punkte desc, sp.beigetreten_am), '[]'::jsonb)
    into v_spieler
    from public.spieler sp where sp.spiel_id = s.id;

  if s.frage_nr >= 0 then
    select * into v_frage from public.fragen where quiz_id = s.quiz_id and position = s.frage_nr;
    select count(*), coalesce(jsonb_agg(jsonb_build_object('antwort', a.antwort, 'anteil', a.anteil, 'punkte', a.punkte)), '[]'::jsonb)
      into v_beantwortet, v_antworten
      from public.antworten a where a.spiel_id = s.id and a.frage_nr = s.frage_nr;
  end if;

  if s.status = 'frage' and v_frage.typ is distinct from 'folie' and v_frage.zeitlimit is not null then
    v_rest := greatest(0, v_frage.zeitlimit * 1000 - floor(extract(epoch from (now() - s.frage_start)) * 1000))::integer;
  end if;

  return jsonb_build_object(
    'id', s.id,
    'pin', s.pin,
    'modus', s.modus,
    'anzahl_teams', s.anzahl_teams,
    'teams', case when s.modus = 'team' then public.team_wertung(s.id) end,
    'status', s.status,
    'frage_nr', s.frage_nr,
    'anzahl_fragen', v_anzahl,
    'quiz_titel', (select q.titel from public.quizze q where q.id = s.quiz_id),
    'frage', case when v_frage.text is null then null else jsonb_build_object(
      'typ', v_frage.typ, 'text', v_frage.text, 'inhalt', v_frage.inhalt,
      'zeitlimit', v_frage.zeitlimit, 'punkte', v_frage.punkte, 'medium', v_frage.medium,
      'ansicht', public.frage_fuer_schueler(v_frage.typ, v_frage.inhalt, s.id::text || ':' || s.frage_nr)) end,
    'restzeit_ms', v_rest,
    'spieler', v_spieler,
    'antworten', coalesce(v_antworten, '[]'::jsonb),
    'beantwortet', v_beantwortet
  );
end;
$$;

