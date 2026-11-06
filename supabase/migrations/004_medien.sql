-- Quizzo – Etappe 5: Bilder, Audio und Video zu Fragen
-- Jede Frage kann ein Medium haben (Spalte "medium"). Hochgeladene Dateien liegen im Supabase-Speicher
-- (Bucket "quizzo-medien", Region des Projekts), jede Lehrkraft nur in ihrem eigenen Ordner.
-- Medien erscheinen nur am Beamer (Lehrkraft-Ansicht), nicht auf den Handys der Schüler.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Prüfung: ist ein Medium gültig?
--   { "art": "bild" | "audio" | "video", "url": "https://…", "pfad"?: "<lehrkraft>/<datei>",
--     "beschreibung"?: Text, "start"?: Sekunden, "ende"?: Sekunden }
--   { "art": "youtube", "id": "<11 Zeichen>", "start"?: Sekunden, "ende"?: Sekunden }
-- ---------------------------------------------------------------------------
create function public.medium_gueltig(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_start numeric;
  v_ende  numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return true;
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;

  -- optionale Zeitangaben (Ausschnitt): ganze Sekunden, höchstens 10 Stunden, Ende nach Start
  if p ? 'start' then
    if not public.ist_zahl(p -> 'start') then return false; end if;
    v_start := (p ->> 'start')::numeric;
    if v_start < 0 or v_start > 36000 then return false; end if;
  end if;
  if p ? 'ende' then
    if not public.ist_zahl(p -> 'ende') then return false; end if;
    v_ende := (p ->> 'ende')::numeric;
    if v_ende <= 0 or v_ende > 36000 then return false; end if;
  end if;
  if v_start is not null and v_ende is not null and v_ende <= v_start then
    return false;
  end if;

  if p ? 'beschreibung' and (jsonb_typeof(p -> 'beschreibung') <> 'string' or char_length(p ->> 'beschreibung') > 300) then
    return false;
  end if;

  case p ->> 'art'
    when 'bild', 'audio', 'video' then
      if jsonb_typeof(p -> 'url') is distinct from 'string'
         or char_length(p ->> 'url') > 1000
         or (p ->> 'url') !~ '^https://[^[:space:]"<>]+$' then
        return false;
      end if;
      if p ? 'pfad' and (jsonb_typeof(p -> 'pfad') <> 'string'
         or (p ->> 'pfad') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
        return false;
      end if;
      return true;
    when 'youtube' then
      return jsonb_typeof(p -> 'id') = 'string' and (p ->> 'id') ~ '^[A-Za-z0-9_-]{11}$';
    else
      return false;
  end case;
end;
$$;

alter table public.fragen
  add column medium jsonb,
  add constraint fragen_medium_check check (coalesce(public.medium_gueltig(medium), false));

-- ---------------------------------------------------------------------------
-- Quiz speichern: jetzt mit Medium
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

  insert into public.fragen (quiz_id, position, typ, text, inhalt, punkte, zeitlimit, medium)
  select v_id,
         (f.nr - 1)::smallint,
         coalesce(f.daten ->> 'typ', 'auswahl'),
         f.daten ->> 'text',
         f.daten -> 'inhalt',
         coalesce((f.daten ->> 'punkte')::smallint, 1),
         coalesce((f.daten ->> 'zeitlimit')::smallint, 20),
         nullif(f.daten -> 'medium', 'null'::jsonb)
  from jsonb_array_elements(p_fragen) with ordinality as f(daten, nr);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spielzustand für die Lehrkraft: wie bisher, zusätzlich das Medium der Frage.
-- (spiel_zustand_schueler bleibt unverändert: Schüler bekommen keine Medien.)
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
      'zeitlimit', v_frage.zeitlimit, 'punkte', v_frage.punkte, 'medium', v_frage.medium,
      'ansicht', public.frage_fuer_schueler(v_frage.typ, v_frage.inhalt, s.id::text || ':' || s.frage_nr)) end,
    'restzeit_ms', v_rest,
    'spieler', v_spieler,
    'antworten', coalesce(v_antworten, '[]'::jsonb),
    'beantwortet', v_beantwortet
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Speicher für hochgeladene Dateien
--   * öffentlich lesbar über die (nicht erratbare) Datei-Adresse – nötig, damit Bild/Ton/Video
--     am Beamer ohne Anmelde-Umweg geladen werden; eine Liste aller Dateien bekommt niemand
--   * hochladen, auflisten und löschen nur im eigenen Ordner (Ordnername = eigene Nutzer-ID)
--   * höchstens 50 MB pro Datei, nur Bild-, Audio- und Videoformate
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quizzo-medien', 'quizzo-medien', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
              'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm',
              'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "quizzo_medien_hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quizzo-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "quizzo_medien_auflisten" on storage.objects
  for select to authenticated
  using (bucket_id = 'quizzo-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "quizzo_medien_loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quizzo-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);
