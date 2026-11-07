-- Quizzo – Etappe 9: Quizze in Ordnern ordnen, Zeitlimit pro Frage bei Hausaufgabe und Prüfung
--
-- 1. Ordner: Jedes Quiz kann in einem Ordner liegen (einfacher Name, z. B. „Mathe 7b“).
--    „Zuletzt benutzt“ merkt sich, wann ein Quiz zuletzt gespielt oder verteilt wurde (zum Sortieren).
-- 2. Zeitlimit: Beim Verteilen einer Hausaufgabe oder Prüfung kann die Lehrkraft ein Zeitlimit
--    pro Frage einschalten (Zeiten aus dem Quiz oder eine feste Zeit). Der Server merkt sich, wann
--    eine Frage geöffnet wurde. Neu laden setzt die Zeit nicht zurück; wer zu spät antwortet,
--    bekommt für die Frage keine Punkte. Fragen werden erst beim Öffnen übertragen, damit man
--    sie nicht vorher heimlich auslesen kann.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- 1. Ordner und „zuletzt benutzt“
-- ---------------------------------------------------------------------------
alter table public.quizze
  add column ordner text check (ordner is null or char_length(ordner) between 1 and 60),
  add column zuletzt_benutzt timestamptz;
-- Rechte und RLS gelten unverändert: Die Lehrkraft ändert nur eigene Quizze.

-- ---------------------------------------------------------------------------
-- 2. Zeitlimit bei Aufgaben
-- ---------------------------------------------------------------------------
alter table public.aufgaben
  add column mit_zeit boolean not null default false,
  add constraint aufgaben_zeit_check check (not mit_zeit or modus in ('hausaufgabe', 'pruefung'));

alter table public.aufgabe_antworten
  add column zu_spaet boolean not null default false;

-- Wann hat ein Teilnehmer welche Frage geöffnet? (nur bei Aufgaben mit Zeitlimit)
create table public.aufgabe_gestartet (
  teilnehmer_id  uuid not null references public.aufgabe_teilnehmer (id) on delete cascade,
  frage_nr       integer not null,
  gestartet_am   timestamptz not null default now(),
  primary key (teilnehmer_id, frage_nr)
);
alter table public.aufgabe_gestartet enable row level security;
-- Kein direkter Zugriff – nur über die Funktionen unten.
revoke all on public.aufgabe_gestartet from anon, authenticated;

-- Spielraum für langsames Netz (Sekunden), bevor eine Antwort als zu spät gilt
create function public.aufgabe_kulanz()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '5 seconds' $$;
revoke execute on function public.aufgabe_kulanz() from public, anon, authenticated;

-- Restzeit einer geöffneten Frage in Millisekunden (null = kein Zeitlimit)
create function public.aufgabe_restzeit(a public.aufgaben, p_frage_nr integer, p_gestartet timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when a.mit_zeit and p_gestartet is not null then
    greatest(0, ((a.fragen -> p_frage_nr ->> 'zeitlimit')::integer * 1000
                 - floor(extract(epoch from (now() - p_gestartet)) * 1000))::integer)
  end;
$$;
revoke execute on function public.aufgabe_restzeit(public.aufgaben, integer, timestamptz) from public, anon, authenticated;

-- Eine Frage so, wie Schüler sie sehen (ohne Lösung)
create function public.aufgabe_frage_schueler(a public.aufgaben, p_nr integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'typ', f ->> 'typ', 'text', f ->> 'text',
    'zeitlimit', case when a.mit_zeit and f ->> 'typ' <> 'folie' then (f ->> 'zeitlimit')::integer else 0 end,
    'punkte', (f ->> 'punkte')::integer,
    'ansicht', public.frage_fuer_schueler(f ->> 'typ', f -> 'inhalt', a.id::text || ':' || p_nr))
  from (select a.fragen -> p_nr as f) x;
$$;
revoke execute on function public.aufgabe_frage_schueler(public.aufgaben, integer) from public, anon, authenticated;

-- Alle Fragen für einen Teilnehmer. Mit Zeitlimit sind noch nicht geöffnete Fragen verdeckt
-- (nur Typ und Zeit) – so kann niemand die Fragen vorab auslesen.
create function public.aufgabe_fragen_teilnehmer(a public.aufgaben, p_teilnehmer uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    case when a.mit_zeit and f ->> 'typ' <> 'folie'
              and not exists (select 1 from public.aufgabe_gestartet g where g.teilnehmer_id = p_teilnehmer and g.frage_nr = nr - 1)
         then jsonb_build_object('typ', f ->> 'typ', 'text', '', 'zeitlimit', (f ->> 'zeitlimit')::integer,
                                 'punkte', (f ->> 'punkte')::integer, 'ansicht', '{}'::jsonb, 'verdeckt', true)
         else public.aufgabe_frage_schueler(a, (nr - 1)::integer)
    end order by nr), '[]'::jsonb)
  from jsonb_array_elements(a.fragen) with ordinality as t(f, nr);
$$;
revoke execute on function public.aufgabe_fragen_teilnehmer(public.aufgaben, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aufgabe erstellen – neu mit Zeitlimit
--   p_zeit: null = ohne Zeitlimit, 0 = Zeiten aus dem Quiz, 10 bis 600 = feste Sekunden pro Frage
-- ---------------------------------------------------------------------------
drop function public.aufgabe_erstellen(uuid, text, timestamptz, integer);

create function public.aufgabe_erstellen(p_quiz_id uuid, p_modus text, p_frist timestamptz default null,
                                         p_codes integer default null, p_zeit integer default null)
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

  if p_modus not in ('selbstlernen', 'hausaufgabe', 'pruefung') then
    raise exception 'QUIZZO: Unbekannter Modus.';
  end if;
  if p_zeit is not null and p_modus = 'selbstlernen' then
    raise exception 'QUIZZO: Beim Selbstlernen gibt es kein Zeitlimit.';
  end if;
  if p_zeit is not null and p_zeit <> 0 and (p_zeit < 10 or p_zeit > 600) then
    raise exception 'QUIZZO: Die Zeit pro Frage muss zwischen 10 Sekunden und 10 Minuten liegen.';
  end if;

  select jsonb_agg(jsonb_build_object('typ', typ, 'text', text, 'inhalt', inhalt, 'punkte', punkte,
                     'zeitlimit', case when coalesce(p_zeit, 0) = 0 then zeitlimit else p_zeit end)
                   order by position)
    into v_fragen from public.fragen where quiz_id = p_quiz_id;
  if v_fragen is null then
    raise exception 'QUIZZO: Das Quiz hat noch keine Fragen.';
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

  insert into public.aufgaben (besitzer_id, code, modus, titel, fragen, frist, loeschen_am, mit_zeit)
    values (auth.uid(), v_code, p_modus, v_titel, v_fragen, p_frist, v_loeschen, p_zeit is not null)
    returning id into v_id;

  if p_modus = 'pruefung' then
    i := 0;
    while i < p_codes loop
      v_neu := public.zufallscode(3) || '-' || public.zufallscode(3);
      insert into public.aufgabe_teilnehmer (aufgabe_id, code) values (v_id, v_neu) on conflict do nothing;
      if found then i := i + 1; end if;
    end loop;
  end if;

  update public.quizze set zuletzt_benutzt = now() where id = p_quiz_id;
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;
revoke execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer, integer) to authenticated;

-- Ergebnisse: zusätzlich „mit Zeitlimit“ und „zu spät“ je Antwort
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
    'offen', public.aufgabe_offen(a), 'geschlossen', a.geschlossen, 'mit_zeit', a.mit_zeit,
    'fragen', a.fragen,
    'statistik', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', frage_nr, 'versuche', versuche,
                    'richtig', richtig, 'anteil_summe', anteil_summe) order by frage_nr)
                  from public.aufgabe_statistik where aufgabe_id = a.id), '[]'::jsonb),
    'teilnehmer', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'spitzname', t.spitzname, 'code', t.code, 'punkte', t.punkte,
        'aktiv', t.token is not null, 'begonnen_am', t.begonnen_am, 'abgegeben_am', t.abgegeben_am,
        'antworten', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', x.frage_nr, 'antwort', x.antwort,
                        'anteil', x.anteil, 'punkte', x.punkte, 'zu_spaet', x.zu_spaet) order by x.frage_nr)
                      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb))
        order by coalesce(t.code, lower(t.spitzname)))
      from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id), '[]'::jsonb)
  );
end;
$$;

-- Liste: zusätzlich „mit Zeitlimit“
create or replace function public.aufgaben_liste()
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
      'offen', public.aufgabe_offen(a), 'mit_zeit', a.mit_zeit,
      'teilnehmer', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.begonnen_am is not null),
      'abgegeben', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.abgegeben_am is not null),
      'versuche', (select coalesce(sum(versuche), 0) from public.aufgabe_statistik s where s.aufgabe_id = a.id))
      order by a.erstellt_am desc)
    from public.aufgaben a where a.besitzer_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Schüler
-- ---------------------------------------------------------------------------

-- Stand eines Teilnehmers – neu: mit_zeit, verdeckte Fragen und die Restzeit der geöffneten Frage
create or replace function public.aufgabe_zustand(p_teilnehmer uuid, p_token uuid)
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
    'mit_zeit', a.mit_zeit,
    'punkte', case when a.modus = 'hausaufgabe' then t.punkte end,
    'fragen', public.aufgabe_fragen_teilnehmer(a, t.id),
    -- geöffnet, aber noch nicht beantwortet (z. B. nach dem Neuladen): mit Restzeit
    'geoeffnet', coalesce((select jsonb_agg(jsonb_build_object('frage_nr', g.frage_nr,
          'restzeit_ms', public.aufgabe_restzeit(a, g.frage_nr, g.gestartet_am)) order by g.frage_nr)
        from public.aufgabe_gestartet g
        where g.teilnehmer_id = t.id
          and not exists (select 1 from public.aufgabe_antworten x where x.teilnehmer_id = t.id and x.frage_nr = g.frage_nr)),
      '[]'::jsonb),
    'antworten', coalesce((select jsonb_agg(case when a.modus = 'hausaufgabe' then
          jsonb_build_object('frage_nr', x.frage_nr, 'anteil', x.anteil, 'punkte', x.punkte, 'zu_spaet', x.zu_spaet,
            'loesung', public.frage_loesung(a.fragen -> x.frage_nr ->> 'typ', a.fragen -> x.frage_nr -> 'inhalt'))
        else jsonb_build_object('frage_nr', x.frage_nr) end order by x.frage_nr)
      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb)
  );
end;
$$;

-- Frage öffnen (nur bei Aufgaben mit Zeitlimit): startet die Zeit – aber nur beim ersten Mal.
-- Liefert {frage, restzeit_ms}. Noch einmal öffnen (z. B. nach dem Neuladen) gibt die Restzeit.
create function public.aufgabe_frage_oeffnen(p_teilnehmer uuid, p_token uuid, p_frage_nr integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.aufgabe_teilnehmer;
  a public.aufgaben;
  v_start timestamptz;
begin
  select * into t from public.aufgabe_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    raise exception 'QUIZZO: Du bist nicht (mehr) bei dieser Aufgabe angemeldet.';
  end if;
  select * into a from public.aufgaben where id = t.aufgabe_id;
  if not public.aufgabe_offen(a) then
    raise exception 'QUIZZO: Diese Aufgabe ist schon beendet.';
  end if;
  if p_frage_nr is null or p_frage_nr < 0 or p_frage_nr >= jsonb_array_length(a.fragen) then
    raise exception 'QUIZZO: Diese Frage gibt es nicht.';
  end if;
  if exists (select 1 from public.aufgabe_antworten where teilnehmer_id = t.id and frage_nr = p_frage_nr) then
    raise exception 'QUIZZO: Du hast diese Frage schon beantwortet.';
  end if;
  if a.mit_zeit and a.fragen -> p_frage_nr ->> 'typ' <> 'folie' then
    insert into public.aufgabe_gestartet (teilnehmer_id, frage_nr) values (t.id, p_frage_nr)
      on conflict do nothing;
    select gestartet_am into v_start from public.aufgabe_gestartet where teilnehmer_id = t.id and frage_nr = p_frage_nr;
  end if;
  return jsonb_build_object('frage', public.aufgabe_frage_schueler(a, p_frage_nr),
                            'restzeit_ms', public.aufgabe_restzeit(a, p_frage_nr, v_start));
end;
$$;
revoke execute on function public.aufgabe_frage_oeffnen(uuid, uuid, integer) from public;
grant execute on function public.aufgabe_frage_oeffnen(uuid, uuid, integer) to anon, authenticated;

-- Antworten – neu: Mit Zeitlimit muss die Frage vorher geöffnet worden sein. Zu spät oder ohne
-- Antwort (Zeit abgelaufen, p_antwort = null) zählt als beantwortet, aber ohne Punkte.
create or replace function public.aufgabe_antworten(p_code text, p_teilnehmer uuid, p_token uuid, p_frage_nr integer, p_antwort jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a         public.aufgaben;
  t         public.aufgabe_teilnehmer;
  f         jsonb;
  v_anteil  real;
  v_punkte  integer := 0;
  v_offen   integer;
  v_start   timestamptz;
  v_spaet   boolean := false;
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

  if a.modus = 'selbstlernen' then
    v_anteil := public.antwort_bewerten(f ->> 'typ', f -> 'inhalt', p_antwort);
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

  if a.mit_zeit and f ->> 'typ' <> 'folie' then
    select gestartet_am into v_start from public.aufgabe_gestartet where teilnehmer_id = t.id and frage_nr = p_frage_nr;
    if v_start is null then
      raise exception 'QUIZZO: Bitte öffne die Frage zuerst.';
    end if;
    v_spaet := now() > v_start + make_interval(secs => (f ->> 'zeitlimit')::integer) + public.aufgabe_kulanz();
  end if;

  if v_spaet or p_antwort is null or jsonb_typeof(p_antwort) = 'null' then
    v_anteil := 0;
    v_spaet := v_spaet or a.mit_zeit;
  else
    v_anteil := public.antwort_bewerten(f ->> 'typ', f -> 'inhalt', p_antwort);
  end if;
  if v_anteil > 0 then
    v_punkte := round(1000 * v_anteil * coalesce((f ->> 'punkte')::integer, 1))::integer;
  end if;
  insert into public.aufgabe_antworten (teilnehmer_id, aufgabe_id, frage_nr, antwort, anteil, punkte, zu_spaet)
    values (t.id, a.id, p_frage_nr, coalesce(p_antwort, 'null'::jsonb), v_anteil, v_punkte, v_spaet)
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
    return jsonb_build_object('ok', true, 'abgegeben', v_offen = 0, 'zu_spaet', v_spaet);
  end if;
  return jsonb_build_object('anteil', v_anteil, 'punkte', v_punkte, 'abgegeben', v_offen = 0, 'zu_spaet', v_spaet,
                            'loesung', public.frage_loesung(f ->> 'typ', f -> 'inhalt'));
end;
$$;
