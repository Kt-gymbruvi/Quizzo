-- Quizzo – Etappe 7: Turnier (mehrere Quizze hintereinander mit denselben Mitspielenden)
-- Nach dem Endstand kann die Lehrkraft mit einem anderen eigenen Quiz eine weitere Runde starten.
-- Spitznamen, Teams und Punkte bleiben erhalten, die einzelnen Antworten der Vorrunde werden gelöscht.
-- Datenschutz unverändert: Das Spiel samt allen Daten wird beim Beenden gelöscht (spätestens nach 6 Stunden).
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

alter table public.spiele
  add column runde smallint not null default 1 check (runde between 1 and 50);

create function public.spiel_naechste_runde(p_spiel uuid, p_quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spiele;
begin
  select * into s from public.spiele
    where id = p_spiel and besitzer_id = auth.uid()
    for update;
  if not found then
    raise exception 'QUIZZO: Spiel nicht gefunden.';
  end if;
  if s.status <> 'ende' then
    raise exception 'QUIZZO: Die nächste Runde kann erst nach dem Endstand beginnen.';
  end if;
  if s.runde >= 50 then
    raise exception 'QUIZZO: Mehr als 50 Runden gehen nicht.';
  end if;
  if not exists (select 1 from public.quizze where id = p_quiz_id and besitzer_id = auth.uid()) then
    raise exception 'QUIZZO: Quiz nicht gefunden.';
  end if;
  if not exists (select 1 from public.fragen where quiz_id = p_quiz_id) then
    raise exception 'QUIZZO: Das Quiz hat noch keine Fragen.';
  end if;

  -- Antworten der Vorrunde werden nicht mehr gebraucht (die Punkte stehen beim Spieler)
  delete from public.antworten where spiel_id = s.id;
  update public.spiele
     set quiz_id = p_quiz_id, status = 'lobby', frage_nr = -1, frage_start = null, runde = s.runde + 1
   where id = s.id;
end;
$$;
revoke execute on function public.spiel_naechste_runde(uuid, uuid) from public, anon;
grant execute on function public.spiel_naechste_runde(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Spielzustand: zusätzlich die Rundennummer
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
    'platz', v_platz,
    'anzahl_spieler', v_mitspieler,
    'modus', s.modus,
    'runde', s.runde,
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
    'runde', s.runde,
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
