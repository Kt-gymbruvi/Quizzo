-- Quizzo – Etappe 17: Spielmodus „Klassen-Challenge“
-- Alle spielen gemeinsam gegen das Quiz: Statt einer Rangliste zeigen Beamer und Handys den Fortschritt der
-- ganzen Klasse (durchschnittlich richtig über alle bisher aufgelösten Fragen mit Punkten). Keine Plätze.
-- Datenschutz unverändert: nur Spitznamen, alles wird beim Spielende gelöscht.
-- Die alte App-Version funktioniert weiter. Ausführen im SQL Editor: Inhalt einfügen → Run.

alter table public.spiele drop constraint spiele_modus_check;
alter table public.spiele
  add constraint spiele_modus_check check (
    (modus in ('klassisch', 'challenge') and anzahl_teams is null) or
    (modus = 'team' and anzahl_teams between 2 and 6));

-- ---------------------------------------------------------------------------
-- Fortschritt der Klasse: Durchschnitt über die aufgelösten Fragen mit Wertung (keine Antwort = 0)
-- ---------------------------------------------------------------------------
create or replace function public.klassen_fortschritt(p_spiel uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.spiele where id = p_spiel),
  n as (select greatest(count(*), 1) as spieler from public.spieler where spiel_id = p_spiel),
  gezaehlt as (
    select f.position
    from public.fragen f, s
    where f.quiz_id = s.quiz_id
      and f.punkte > 0
      and f.typ in ('auswahl', 'wahrfalsch', 'freitext', 'reihenfolge', 'zuordnung', 'schieberegler', 'kategorien', 'lueckentext', 'hotspot')
      and (f.position < s.frage_nr or (f.position = s.frage_nr and s.status in ('auswertung', 'ende')) or s.status = 'ende')
  ),
  je_frage as (
    select g.position,
           coalesce((select sum(a.anteil) from public.antworten a where a.spiel_id = p_spiel and a.frage_nr = g.position), 0)
             / (select spieler from n) as quote
    from gezaehlt g
  )
  select jsonb_build_object(
    'prozent', coalesce(round(avg(quote) * 100)::integer, 0),
    'fragen', count(*),
    'letzte', (select round(quote * 100)::integer from je_frage order by position desc limit 1)
  )
  from je_frage;
$$;
revoke execute on function public.klassen_fortschritt(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spiel erstellen: zusätzlich Modus 'challenge'
-- ---------------------------------------------------------------------------
create or replace function public.spiel_erstellen(p_quiz_id uuid, p_modus text default 'klassisch', p_teams integer default null)
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
  if v_modus not in ('klassisch', 'team', 'challenge') then
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

-- ---------------------------------------------------------------------------
-- Spielzustand: zusätzlich 'klasse' (Fortschritt) in der Challenge; dort keine Plätze für Schüler
-- ---------------------------------------------------------------------------

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
    'platz', case when s.modus = 'challenge' then null else v_platz end,
    'anzahl_spieler', v_mitspieler,
    'modus', s.modus,
    'runde', s.runde,
    'team', v_sp.team,
    'teams', case when s.modus = 'team' then public.team_wertung(s.id) end,
    'klasse', case when s.modus = 'challenge' then public.klassen_fortschritt(s.id) end,
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
    'runde', s.runde,
    'anzahl_teams', s.anzahl_teams,
    'teams', case when s.modus = 'team' then public.team_wertung(s.id) end,
    'klasse', case when s.modus = 'challenge' then public.klassen_fortschritt(s.id) end,
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
