-- Quizzo – Migration 020: Bild-Hotspot mit beliebig vielen richtigen Bereichen
--   Eine Hotspot-Frage hat weiterhin `ziel` (der erste Bereich, damit ältere App-Versionen weiterlaufen)
--   und optional `ziele`: Liste aller richtigen Bereiche (höchstens 30). Ein Tipp zählt, wenn er in einem
--   dieser Bereiche liegt. Ohne `ziele` gilt nur `ziel` – bestehende Fragen bleiben unverändert.
--   Mit `alle: true` müssen die Schüler jeden Bereich antippen (so viele Tipps wie Bereiche, Antwort = Liste von
--   Punkten); Teilpunkte = Anteil der getroffenen Bereiche.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- Alle richtigen Bereiche einer Hotspot-Frage als JSON-Liste
create or replace function public.hotspot_ziele(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p -> 'ziele') = 'array' then p -> 'ziele' else jsonb_build_array(p -> 'ziel') end;
$$;

-- Ist ein Bereich gültig? (Mitte x/y in Prozent, Breite/Höhe 2–100)
create or replace function public.hotspot_ziel_gueltig(z jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(z) = 'object'
     and public.zahl_zwischen(z -> 'x', 0, 100)
     and public.zahl_zwischen(z -> 'y', 0, 100)
     and public.zahl_zwischen(z -> 'b', 2, 100)
     and public.zahl_zwischen(z -> 'h', 2, 100);
$$;

create or replace function public.frage_gueltig(p_typ text, p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
  k integer;
  v_luecken jsonb;
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

    when 'kategorien' then
      if not public.nur_texte(p -> 'kategorien', 40) or jsonb_typeof(p -> 'begriffe') <> 'array' then return false; end if;
      k := jsonb_array_length(p -> 'kategorien');
      n := jsonb_array_length(p -> 'begriffe');
      if k < 2 or k > 4 or n < 2 or n > 12 or not public.texte_eindeutig(p -> 'kategorien') then return false; end if;
      return not exists (
               select 1 from jsonb_array_elements(p -> 'begriffe') x
               where jsonb_typeof(x) <> 'object' or not coalesce(public.ist_index(x -> 'kategorie', k), false))
         and public.nur_texte((select jsonb_agg(x -> 'text') from jsonb_array_elements(p -> 'begriffe') x), 60)
         and public.texte_eindeutig((select jsonb_agg(x -> 'text') from jsonb_array_elements(p -> 'begriffe') x));

    when 'lueckentext' then
      if jsonb_typeof(p -> 'lueckentext') <> 'string' or char_length(p ->> 'lueckentext') > 600 then return false; end if;
      if (p ->> 'modus') is null or (p ->> 'modus') not in ('auswahl', 'eingabe') then return false; end if;
      -- übrig gebliebene Klammern (z. B. verschachtelt oder nicht geschlossen) sind ein Fehler
      if exists (select 1 from jsonb_array_elements_text(public.lueckentext_teile(p ->> 'lueckentext')) t where t ~ '[\[\]]') then
        return false;
      end if;
      v_luecken := public.lueckentext_luecken(p ->> 'lueckentext');
      n := jsonb_array_length(v_luecken);
      if n < 1 or n > 10 then return false; end if;
      if exists (select 1 from jsonb_array_elements(v_luecken) l where not coalesce(public.nur_texte(l, 40) and jsonb_array_length(l) between 1 and 10, false)) then
        return false;
      end if;
      return p -> 'ablenker' is null
          or (jsonb_typeof(p -> 'ablenker') = 'array'
              and jsonb_array_length(p -> 'ablenker') <= 6
              and (jsonb_array_length(p -> 'ablenker') = 0 or public.nur_texte(p -> 'ablenker', 40)));

    when 'hotspot' then
      return jsonb_typeof(p -> 'bild') = 'object'
         and jsonb_typeof(p -> 'bild' -> 'url') = 'string'
         and (p -> 'bild' ->> 'url') ~ '^https://[^\s"<>]+$'
         and char_length(p -> 'bild' ->> 'url') <= 1000
         and (p -> 'bild' -> 'pfad' is null or (jsonb_typeof(p -> 'bild' -> 'pfad') = 'string' and char_length(p -> 'bild' ->> 'pfad') <= 200))
         and (p -> 'bild' -> 'beschreibung' is null
              or (jsonb_typeof(p -> 'bild' -> 'beschreibung') = 'string' and char_length(p -> 'bild' ->> 'beschreibung') <= 300))
         and public.hotspot_ziel_gueltig(p -> 'ziel')
         and (p -> 'ziele' is null
              or (jsonb_typeof(p -> 'ziele') = 'array'
                  and jsonb_array_length(p -> 'ziele') between 1 and 30
                  and not exists (select 1 from jsonb_array_elements(p -> 'ziele') z where not public.hotspot_ziel_gueltig(z))))
         and (p -> 'alle' is null or jsonb_typeof(p -> 'alle') = 'boolean');

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

create or replace function public.frage_loesung(p_typ text, p jsonb)
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
    when 'kategorien' then jsonb_build_object('kategorien', p -> 'kategorien', 'begriffe', p -> 'begriffe')
    when 'lueckentext' then public.lueckentext_luecken(p ->> 'lueckentext')
    when 'hotspot' then public.hotspot_ziele(p)
    else null
  end;
$$;

create or replace function public.antwort_bewerten(p_typ text, p jsonb, a jsonb)
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
  v_luecken jsonb;
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

    -- Antwort: {"Begriff": Nummer der Kategorie, …} für jeden Begriff
    when 'kategorien' then
      n := jsonb_array_length(p -> 'begriffe');
      if jsonb_typeof(a) <> 'object'
         or (select count(*) from jsonb_object_keys(a)) <> n
         or exists (select 1 from jsonb_each(a) e
                    where not public.ist_index(e.value, jsonb_array_length(p -> 'kategorien'))
                       or not exists (select 1 from jsonb_array_elements(p -> 'begriffe') x where x ->> 'text' = e.key)) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      select count(*) into v_treffer
        from jsonb_array_elements(p -> 'begriffe') x
        where (a -> (x ->> 'text')) = (x -> 'kategorie');
      return v_treffer::real / n;

    -- Antwort: ein Text pro Lücke (leer = nicht ausgefüllt)
    when 'lueckentext' then
      v_luecken := public.lueckentext_luecken(p ->> 'lueckentext');
      n := jsonb_array_length(v_luecken);
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> n
         or exists (select 1 from jsonb_array_elements(a) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 40) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      select count(*) into v_treffer
        from jsonb_array_elements(v_luecken) with ordinality as t(l, nr)
        where exists (select 1 from jsonb_array_elements_text(l) loesung
                      where public.normalisiere(loesung) = public.normalisiere(a ->> (nr::integer - 1)));
      return v_treffer::real / n;

    -- Antwort: {"x": 0..100, "y": 0..100} in Prozent der Bildbreite/-höhe
    when 'hotspot' then
      -- alle Bereiche nötig: Antwort ist eine Liste von 1 bis n Punkten; Anteil = getroffene Bereiche / n
      if coalesce(p -> 'alle' = 'true'::jsonb, false) then
        n := jsonb_array_length(public.hotspot_ziele(p));
        if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) < 1 or jsonb_array_length(a) > n
           or exists (select 1 from jsonb_array_elements(a) e
                       where jsonb_typeof(e) <> 'object' or not public.zahl_zwischen(e -> 'x', 0, 100) or not public.zahl_zwischen(e -> 'y', 0, 100)) then
          raise exception 'QUIZZO: Ungültige Antwort.';
        end if;
        return (select count(*) from jsonb_array_elements(public.hotspot_ziele(p)) z
                 where exists (select 1 from jsonb_array_elements(a) e
                                where abs((e ->> 'x')::numeric - (z ->> 'x')::numeric) <= (z ->> 'b')::numeric / 2
                                  and abs((e ->> 'y')::numeric - (z ->> 'y')::numeric) <= (z ->> 'h')::numeric / 2))::real / n;
      end if;
      if jsonb_typeof(a) <> 'object' or not public.zahl_zwischen(a -> 'x', 0, 100) or not public.zahl_zwischen(a -> 'y', 0, 100) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      return case when exists (
                select 1 from jsonb_array_elements(public.hotspot_ziele(p)) z
                 where abs((a ->> 'x')::numeric - (z ->> 'x')::numeric) <= (z ->> 'b')::numeric / 2
                   and abs((a ->> 'y')::numeric - (z ->> 'y')::numeric) <= (z ->> 'h')::numeric / 2)
                  then 1 else 0 end;

    when 'wortwolke', 'offen' then
      if jsonb_typeof(a) <> 'string' or btrim(a #>> '{}') = ''
         or char_length(a #>> '{}') > (case when p_typ = 'wortwolke' then 25 else public.offen_max_zeichen(p) end) then
        raise exception 'QUIZZO: Ungültige Antwort.';
      end if;
      return 0;

    else
      raise exception 'QUIZZO: Diese Frage kann man nicht beantworten.';
  end case;
end;
$$;

-- Schüleransicht: bei „alle Bereiche“ erfahren die Schüler nur, wie viele Stellen sie antippen müssen
create or replace function public.frage_fuer_schueler(p_typ text, p jsonb, p_salz text)
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
    when 'offen' then jsonb_build_object('max_zeichen', public.offen_max_zeichen(p),
                                         'von_hand', coalesce(p -> 'von_hand' = 'true'::jsonb, false))
    when 'reihenfolge' then jsonb_build_object('elemente',
      (select jsonb_agg(e order by md5(p_salz || e::text)) from jsonb_array_elements(p -> 'elemente') e))
    when 'zuordnung' then jsonb_build_object(
      'links', (select jsonb_agg(x -> 'links' order by nr) from jsonb_array_elements(p -> 'paare') with ordinality as t(x, nr)),
      'rechts', (select jsonb_agg(x -> 'rechts' order by md5(p_salz || (x -> 'rechts')::text)) from jsonb_array_elements(p -> 'paare') x))
    when 'schieberegler' then jsonb_build_object('min', p -> 'min', 'max', p -> 'max', 'schritt', p -> 'schritt', 'einheit', p -> 'einheit')
    when 'folie' then jsonb_build_object('text', p -> 'text')
    when 'kategorien' then jsonb_build_object(
      'kategorien', p -> 'kategorien',
      'begriffe', (select jsonb_agg(x -> 'text' order by md5(p_salz || (x -> 'text')::text)) from jsonb_array_elements(p -> 'begriffe') x))
    when 'lueckentext' then jsonb_build_object(
      'teile', public.lueckentext_teile(p ->> 'lueckentext'),
      'luecken', jsonb_array_length(public.lueckentext_luecken(p ->> 'lueckentext')),
      'max_zeichen', 40,
      'optionen', case when p ->> 'modus' = 'auswahl' then public.lueckentext_optionen(p, p_salz) end)
    when 'hotspot' then jsonb_build_object('bild', p -> 'bild' -> 'url', 'beschreibung', p -> 'bild' -> 'beschreibung',
      'anzahl', case when coalesce(p -> 'alle' = 'true'::jsonb, false) then jsonb_array_length(public.hotspot_ziele(p)) end)
    else '{}'::jsonb
  end;
$$;
