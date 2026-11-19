-- Quizzo – Etappe 18: offene Antworten von Hand bewerten
-- Offene Fragen bekommen zwei Schalter in fragen.inhalt:
--   "lang": true      → Antworten bis 1000 statt 250 Zeichen
--   "von_hand": true  → in Hausaufgabe und Prüfung bewertet die Lehrkraft die Antwort (✗ / ½ / ✓) und es gibt Punkte
-- Auch Freitext-Antworten kann die Lehrkraft in Aufgaben nachträglich von Hand bewerten (z. B. Tippfehler gelten lassen).
-- Im Live-Spiel bleiben offene Fragen ohne Punkte. Datenschutz unverändert (es werden nur vorhandene Antworten bewertet).
-- Die alte App-Version funktioniert weiter. Ausführen im SQL Editor: Inhalt einfügen → Run.

-- Höchstlänge der Antwort bei offenen Fragen
create or replace function public.offen_max_zeichen(p jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p -> 'lang' = 'true'::jsonb then 1000 else 250 end;
$$;

-- Merker: Antwort wurde von der Lehrkraft bewertet
alter table public.aufgabe_antworten add column von_hand boolean not null default false;

-- ---------------------------------------------------------------------------
-- Antwort in einer Hausaufgabe/Prüfung von Hand bewerten (nur Lehrkraft, nur eigene Aufgaben)
-- p_anteil: 0 = falsch, 0.5 = halb, 1 = richtig. Punkte = 1000 × Anteil × Punkte-Faktor der Frage.
-- ---------------------------------------------------------------------------
create or replace function public.aufgabe_bewerten(p_teilnehmer uuid, p_frage_nr integer, p_anteil real)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a         public.aufgaben;
  t         public.aufgabe_teilnehmer;
  x         public.aufgabe_antworten;
  f         jsonb;
  v_punkte  integer;
begin
  if auth.uid() is null then
    raise exception 'QUIZZO: Bitte melde dich an.';
  end if;
  select * into t from public.aufgabe_teilnehmer where id = p_teilnehmer for update;
  if found then
    select * into a from public.aufgaben where id = t.aufgabe_id and besitzer_id = auth.uid();
  end if;
  if a.id is null then
    raise exception 'QUIZZO: Diese Antwort gibt es nicht (mehr).';
  end if;
  if p_anteil is null or p_anteil not in (0, 0.5, 1) then
    raise exception 'QUIZZO: Bitte falsch, halb oder richtig wählen.';
  end if;
  if p_frage_nr is null or p_frage_nr < 0 or p_frage_nr >= jsonb_array_length(a.fragen) then
    raise exception 'QUIZZO: Diese Frage gibt es nicht.';
  end if;
  f := a.fragen -> p_frage_nr;
  if not coalesce(f ->> 'typ' = 'freitext' or (f ->> 'typ' = 'offen' and f -> 'inhalt' -> 'von_hand' = 'true'::jsonb), false) then
    raise exception 'QUIZZO: Diese Frage kann man nicht von Hand bewerten.';
  end if;
  select * into x from public.aufgabe_antworten where teilnehmer_id = t.id and frage_nr = p_frage_nr for update;
  if not found or jsonb_typeof(x.antwort) = 'null' then
    raise exception 'QUIZZO: Zu dieser Frage gibt es keine Antwort.';
  end if;

  v_punkte := round(1000 * p_anteil * coalesce((f ->> 'punkte')::integer, 1))::integer;
  update public.aufgabe_antworten
     set anteil = p_anteil, punkte = v_punkte, von_hand = true
   where teilnehmer_id = t.id and frage_nr = p_frage_nr;
  update public.aufgabe_teilnehmer set punkte = punkte - x.punkte + v_punkte where id = t.id;
  return jsonb_build_object('anteil', p_anteil, 'punkte', v_punkte);
end;
$$;
revoke execute on function public.aufgabe_bewerten(uuid, integer, real) from public, anon;
grant execute on function public.aufgabe_bewerten(uuid, integer, real) to authenticated;

-- ---------------------------------------------------------------------------
-- Schüleransicht: offene Fragen verraten, ob die Lehrkraft sie bewertet (für den Hinweis nach dem Antworten)
-- ---------------------------------------------------------------------------
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
    when 'hotspot' then jsonb_build_object('bild', p -> 'bild' -> 'url', 'beschreibung', p -> 'bild' -> 'beschreibung')
    else '{}'::jsonb
  end;
$$;

-- ---------------------------------------------------------------------------
-- Ergebnisse für die Lehrkraft: zusätzlich „von_hand“ je Antwort
-- ---------------------------------------------------------------------------
create or replace function public.aufgabe_ergebnisse(p_aufgabe uuid)
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
    'offen', public.aufgabe_offen(a), 'geschlossen', a.geschlossen, 'mit_zeit', a.mit_zeit, 'mischen', a.mischen,
    'fragen', a.fragen,
    'statistik', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', frage_nr, 'versuche', versuche,
                    'richtig', richtig, 'anteil_summe', anteil_summe) order by frage_nr)
                  from public.aufgabe_statistik where aufgabe_id = a.id), '[]'::jsonb),
    'teilnehmer', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'spitzname', t.spitzname, 'code', t.code, 'punkte', t.punkte,
        'aktiv', t.token is not null, 'begonnen_am', t.begonnen_am, 'abgegeben_am', t.abgegeben_am,
        'antworten', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', x.frage_nr, 'antwort', x.antwort,
                        'anteil', x.anteil, 'punkte', x.punkte, 'zu_spaet', x.zu_spaet,
                        'von_hand', x.von_hand) order by x.frage_nr)
                      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb))
        order by coalesce(t.code, lower(t.spitzname)))
      from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id), '[]'::jsonb)
  );
end;
$$;
