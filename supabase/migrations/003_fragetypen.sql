-- Quizzo – Etappe 4: Fragetypen
-- Jede Frage bekommt einen Typ und ein JSON-Feld "inhalt" mit den typabhängigen Angaben.
-- Bestehende Fragen werden zu Multiple-Choice-Fragen umgewandelt (nichts geht verloren).
-- Laufende Spiele werden beendet (Spieldaten sind ohnehin nur vorübergehend).
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (rein rechnerisch, ohne Datenzugriff)
-- ---------------------------------------------------------------------------

-- Text vergleichbar machen: Leerzeichen zusammenfassen, Groß-/Kleinschreibung ignorieren
create function public.normalisiere(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')));
$$;

-- Ist p ein JSON-Array aus 1..max_anzahl nicht-leeren Texten mit höchstens max_laenge Zeichen?
create function public.nur_texte(p jsonb, max_laenge integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'string'
          or btrim(e #>> '{}') = ''
          or char_length(e #>> '{}') > max_laenge
     );
$$;

-- Ist e eine ganze Zahl zwischen 0 und n-1?
create function public.ist_index(e jsonb, n integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(e) = 'number'
     and (e #>> '{}')::numeric = floor((e #>> '{}')::numeric)
     and (e #>> '{}')::numeric between 0 and n - 1;
$$;

-- Sind alle Texte im Array verschieden (ohne Groß-/Kleinschreibung)?
create function public.texte_eindeutig(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (select count(distinct public.normalisiere(e)) from jsonb_array_elements_text(p) e) = jsonb_array_length(p);
$$;

-- Ist p eine endliche Zahl?
create function public.ist_zahl(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'number';
$$;

-- ---------------------------------------------------------------------------
-- Prüfung: ist der Inhalt einer Frage zu ihrem Typ vollständig und gültig?
-- ---------------------------------------------------------------------------
create function public.frage_gueltig(p_typ text, p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  case p_typ
    when 'auswahl', 'umfrage' then
      if not public.nur_texte(p -> 'antworten', 120) then return false; end if;
      n := jsonb_array_length(p -> 'antworten');
      if n < 2 or n > 6 then return false; end if;
      if p_typ = 'umfrage' then return true; end if;
      return jsonb_typeof(p -> 'richtig') = 'array'
         and jsonb_array_length(p -> 'richtig') between 1 and n
         and not exists (select 1 from jsonb_array_elements(p -> 'richtig') e where not public.ist_index(e, n))
         and (select count(distinct e) from jsonb_array_elements(p -> 'richtig') e) = jsonb_array_length(p -> 'richtig');

    when 'wahrfalsch' then
      return jsonb_typeof(p -> 'richtig') = 'boolean';

    when 'freitext' then
      return public.nur_texte(p -> 'loesungen', 40)
         and jsonb_array_length(p -> 'loesungen') between 1 and 10;

    when 'reihenfolge' then
      return public.nur_texte(p -> 'elemente', 80)
         and jsonb_array_length(p -> 'elemente') between 3 and 6
         and public.texte_eindeutig(p -> 'elemente');

    when 'zuordnung' then
      if jsonb_typeof(p -> 'paare') <> 'array' then return false; end if;
      n := jsonb_array_length(p -> 'paare');
      if n < 2 or n > 6 then return false; end if;
      return public.nur_texte((select jsonb_agg(x -> 'links') from jsonb_array_elements(p -> 'paare') x), 60)
         and public.nur_texte((select jsonb_agg(x -> 'rechts') from jsonb_array_elements(p -> 'paare') x), 60)
         and public.texte_eindeutig((select jsonb_agg(x -> 'links') from jsonb_array_elements(p -> 'paare') x))
         and public.texte_eindeutig((select jsonb_agg(x -> 'rechts') from jsonb_array_elements(p -> 'paare') x));

    when 'schieberegler' then
      if not (public.ist_zahl(p -> 'min') and public.ist_zahl(p -> 'max') and public.ist_zahl(p -> 'schritt')
              and public.ist_zahl(p -> 'richtig') and public.ist_zahl(p -> 'toleranz')) then
        return false;
      end if;
      return (p ->> 'min')::numeric < (p ->> 'max')::numeric
         and (p ->> 'schritt')::numeric > 0
         and ((p ->> 'max')::numeric - (p ->> 'min')::numeric) / (p ->> 'schritt')::numeric <= 100000
         and (p ->> 'richtig')::numeric between (p ->> 'min')::numeric and (p ->> 'max')::numeric
         and (p ->> 'toleranz')::numeric >= 0
         and (p -> 'einheit' is null or (jsonb_typeof(p -> 'einheit') = 'string' and char_length(p ->> 'einheit') <= 20));

    when 'wortwolke', 'offen' then
      return true;

    when 'folie' then
      return p -> 'text' is null
          or (jsonb_typeof(p -> 'text') = 'string' and char_length(p ->> 'text') <= 1000);

    else
      return false;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelle "fragen" umbauen
-- ---------------------------------------------------------------------------
delete from public.spiele;

alter table public.fragen
  add column typ text not null default 'auswahl',
  add column inhalt jsonb,
  add column punkte smallint not null default 1;

update public.fragen
  set inhalt = jsonb_build_object('antworten', to_jsonb(antworten), 'richtig', jsonb_build_array(richtig));

alter table public.fragen drop column antworten cascade;
alter table public.fragen drop column richtig cascade;
alter table public.fragen alter column inhalt set not null;
alter table public.fragen alter column typ drop default;
alter table public.fragen
  add constraint fragen_typ_check check (typ in ('auswahl', 'wahrfalsch', 'freitext', 'reihenfolge', 'zuordnung',
                                                 'umfrage', 'wortwolke', 'offen', 'schieberegler', 'folie')),
  add constraint fragen_punkte_check check (punkte in (0, 1, 2)),
  -- coalesce: "unbekannt" (NULL, z. B. bei fehlenden Feldern) zählt als ungültig
  add constraint fragen_inhalt_check check (coalesce(public.frage_gueltig(typ, inhalt), false));

-- Antworten der Schüler: beliebige Antwortform (Zahl, Liste, Text …) und Anteil richtig (0..1)
alter table public.antworten alter column antwort type jsonb using to_jsonb(antwort);
alter table public.antworten add column anteil real not null default 0;

-- ---------------------------------------------------------------------------
-- Quiz speichern (neues Format: typ, text, zeitlimit, punkte, inhalt)
-- ---------------------------------------------------------------------------
create or replace function public.quiz_speichern(p_id uuid, p_titel text, p_fragen jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.quizze (titel) values (p_titel) returning id into v_id;
  else
    update public.quizze set titel = p_titel, geaendert_am = now()
      where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Quiz nicht gefunden';
    end if;
    delete from public.fragen where quiz_id = v_id;
  end if;

  insert into public.fragen (quiz_id, position, typ, text, inhalt, punkte, zeitlimit)
  select v_id,
         (f.nr - 1)::smallint,
         coalesce(f.daten ->> 'typ', 'auswahl'),
         f.daten ->> 'text',
         f.daten -> 'inhalt',
         coalesce((f.daten ->> 'punkte')::smallint, 1),
         coalesce((f.daten ->> 'zeitlimit')::smallint, 20)
  from jsonb_array_elements(p_fragen) with ordinality as f(daten, nr);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Was Schüler während der Frage sehen dürfen (ohne Lösung).
-- Reihenfolge und Zuordnung werden gemischt – für alle Schüler eines Spiels gleich.
-- ---------------------------------------------------------------------------
create function public.frage_fuer_schueler(p_typ text, p jsonb, p_salz text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_typ
    when 'auswahl' then jsonb_build_object('antworten', p -> 'antworten', 'mehrfach', jsonb_array_length(p -> 'richtig') > 1)
    when 'umfrage' then jsonb_build_object('antworten', p -> 'antworten')
    when 'freitext' then jsonb_build_object('max_zeichen', 40)
    when 'wortwolke' then jsonb_build_object('max_zeichen', 25)
    when 'offen' then jsonb_build_object('max_zeichen', 250)
    when 'reihenfolge' then jsonb_build_object('elemente',
      (select jsonb_agg(e order by md5(p_salz || e::text)) from jsonb_array_elements(p -> 'elemente') e))
    when 'zuordnung' then jsonb_build_object(
      'links', (select jsonb_agg(x -> 'links' order by nr) from jsonb_array_elements(p -> 'paare') with ordinality as t(x, nr)),
      'rechts', (select jsonb_agg(x -> 'rechts' order by md5(p_salz || (x -> 'rechts')::text)) from jsonb_array_elements(p -> 'paare') x))
    when 'schieberegler' then jsonb_build_object('min', p -> 'min', 'max', p -> 'max', 'schritt', p -> 'schritt', 'einheit', p -> 'einheit')
    when 'folie' then jsonb_build_object('text', p -> 'text')
    else '{}'::jsonb
  end;
$$;

-- Lösung, die nach der Auflösung gezeigt wird (null bei Fragen ohne richtige Antwort)
create function public.frage_loesung(p_typ text, p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_typ
    when 'auswahl' then p -> 'richtig'
    when 'wahrfalsch' then p -> 'richtig'
    when 'freitext' then p -> 'loesungen'
    when 'reihenfolge' then p -> 'elemente'
    when 'zuordnung' then p -> 'paare'
    when 'schieberegler' then jsonb_build_object('richtig', p -> 'richtig', 'toleranz', p -> 'toleranz', 'einheit', p -> 'einheit')
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Antwort bewerten: liefert den Anteil richtig (0..1). Wirft einen Fehler bei ungültiger Antwort.
-- ---------------------------------------------------------------------------
create function public.antwort_bewerten(p_typ text, p jsonb, a jsonb)
returns real
language plpgsql
immutable
set search_path = ''
as $$
declare
  n        integer;
  v_wert   numeric;
  v_diff   numeric;
  v_spanne numeric;
  v_tol    numeric;
  v_treffer integer;
begin
  case p_typ
    when 'auswahl', 'umfrage' then
      n := jsonb_array_length(p -> 'antworten');
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) < 1 or jsonb_array_length(a) > n
         or exists (select 1 from jsonb_array_elements(a) e where not public.ist_index(e, n)) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      if p_typ = 'umfrage' then
        if jsonb_array_length(a) <> 1 then raise exception 'QUIZZO: Ungültige Antwort.'; end if;
        return 0;
      end if;
      return case when
        (select array_agg(distinct (e #>> '{}')::integer order by (e #>> '{}')::integer) from jsonb_array_elements(a) e)
        = (select array_agg(distinct (e #>> '{}')::integer order by (e #>> '{}')::integer) from jsonb_array_elements(p -> 'richtig') e)
        then 1 else 0 end;

    when 'wahrfalsch' then
      if jsonb_typeof(a) <> 'boolean' then raise exception 'QUIZZO: Ungültige Antwort.'; end if;
      return case when a = p -> 'richtig' then 1 else 0 end;

    when 'freitext' then
      if jsonb_typeof(a) <> 'string' or btrim(a #>> '{}') = '' or char_length(a #>> '{}') > 40 then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      return case when exists (
        select 1 from jsonb_array_elements_text(p -> 'loesungen') l
        where public.normalisiere(l) = public.normalisiere(a #>> '{}')
      ) then 1 else 0 end;

    when 'reihenfolge' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> jsonb_array_length(p -> 'elemente') then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      return case when a = p -> 'elemente' then 1 else 0 end;

    when 'zuordnung' then
      n := jsonb_array_length(p -> 'paare');
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> n then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      select count(*) into v_treffer
        from jsonb_array_elements(p -> 'paare') with ordinality as t(x, nr)
        where (a -> (nr::integer - 1)) = (x -> 'rechts');
      return v_treffer::real / n;

    when 'schieberegler' then
      if jsonb_typeof(a) <> 'number' then raise exception 'QUIZZO: Ungültige Antwort.'; end if;
      v_wert := (a #>> '{}')::numeric;
      if v_wert < (p ->> 'min')::numeric or v_wert > (p ->> 'max')::numeric then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      v_diff := abs(v_wert - (p ->> 'richtig')::numeric);
      v_tol := (p ->> 'toleranz')::numeric;
      v_spanne := ((p ->> 'max')::numeric - (p ->> 'min')::numeric) / 4;
      if v_diff <= v_tol then return 1; end if;
      return greatest(0, 1 - (v_diff - v_tol) / v_spanne)::real;

    when 'wortwolke', 'offen' then
      if jsonb_typeof(a) <> 'string' or btrim(a #>> '{}') = ''
         or char_length(a #>> '{}') > (case when p_typ = 'wortwolke' then 25 else 250 end) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      return 0;

    else
      raise exception 'QUIZZO: Diese Frage kann man nicht beantworten.';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spiel steuern: Bei einer Präsentationsfolie geht "weiter" direkt zur nächsten Frage.
-- ---------------------------------------------------------------------------
create or replace function public.spiel_steuern(p_spiel uuid, p_aktion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.spiele;
  v_anzahl integer;
  v_typ    text;
begin
  select * into s from public.spiele
    where id = p_spiel and besitzer_id = auth.uid()
    for update;
  if not found then
    raise exception 'QUIZZO: Spiel nicht gefunden.';
  end if;

  select typ into v_typ from public.fragen where quiz_id = s.quiz_id and position = s.frage_nr;

  if p_aktion = 'weiter' then
    if not (s.status in ('lobby', 'auswertung') or (s.status = 'frage' and v_typ = 'folie')) then
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
    if s.status = 'frage' and v_typ is distinct from 'folie' then
      update public.spiele set status = 'auswertung' where id = s.id;
    end if;
  else
    raise exception 'QUIZZO: Unbekannte Aktion.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spielzustand für die Lehrkraft: komplette Frage und alle Antworten zur aktuellen Frage
-- ---------------------------------------------------------------------------
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

  select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'spitzname', sp.spitzname, 'punkte', sp.punkte)
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
    'status', s.status,
    'frage_nr', s.frage_nr,
    'anzahl_fragen', v_anzahl,
    'quiz_titel', (select q.titel from public.quizze q where q.id = s.quiz_id),
    'frage', case when v_frage.text is null then null else jsonb_build_object(
      'typ', v_frage.typ, 'text', v_frage.text, 'inhalt', v_frage.inhalt,
      'zeitlimit', v_frage.zeitlimit, 'punkte', v_frage.punkte,
      'ansicht', public.frage_fuer_schueler(v_frage.typ, v_frage.inhalt, s.id::text || ':' || s.frage_nr)) end,
    'restzeit_ms', v_rest,
    'spieler', v_spieler,
    'antworten', coalesce(v_antworten, '[]'::jsonb),
    'beantwortet', v_beantwortet
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Spielzustand für Schüler (ohne Lösung, bis aufgelöst wurde)
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

-- ---------------------------------------------------------------------------
-- Antwort abgeben (neue Signatur: Antwort als JSON)
-- Punkte: bis zu 1000 × Punktefaktor, je schneller desto mehr (mind. 500), mal Anteil richtig.
-- ---------------------------------------------------------------------------
drop function public.antwort_abgeben(uuid, uuid, integer, integer);

create function public.antwort_abgeben(p_spieler uuid, p_token uuid, p_frage_nr integer, p_antwort jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sp     public.spieler;
  s        public.spiele;
  v_frage  public.fragen;
  v_ms     integer;
  v_limit  integer;
  v_anteil real;
  v_punkte integer := 0;
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
  v_ms := greatest(0, floor(extract(epoch from (now() - s.frage_start)) * 1000))::integer;
  if v_ms > v_limit + 1000 then -- 1 Sekunde Kulanz für langsame Verbindungen
    raise exception 'QUIZZO: Die Zeit ist abgelaufen.';
  end if;

  v_anteil := public.antwort_bewerten(v_frage.typ, v_frage.inhalt, p_antwort);

  if v_anteil > 0 and v_frage.punkte > 0 then
    v_punkte := round(greatest(500, 1000 - 500.0 * least(v_ms, v_limit) / v_limit) * v_anteil * v_frage.punkte)::integer;
  end if;

  insert into public.antworten (spieler_id, spiel_id, frage_nr, antwort, richtig, anteil, punkte, zeit_ms)
    values (v_sp.id, s.id, s.frage_nr, p_antwort, v_anteil >= 1, v_anteil, v_punkte, v_ms)
    on conflict do nothing;
  if not found then
    raise exception 'QUIZZO: Du hast diese Frage schon beantwortet.';
  end if;

  update public.spieler set punkte = punkte + v_punkte where id = v_sp.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.antwort_abgeben(uuid, uuid, integer, jsonb) from public;
grant execute on function public.antwort_abgeben(uuid, uuid, integer, jsonb) to anon, authenticated;
