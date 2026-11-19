-- Quizzo – Etappe 14: Fragen und Antworten mischen (Hausaufgabe und Prüfung)
-- Beim Verteilen kann die Lehrkraft „mischen“ einschalten. Dann bekommt jede Person die Fragen in
-- einer eigenen Reihenfolge (Präsentationsfolien bleiben an ihrem Platz), ebenso die Antwortmöglichkeiten.
-- Gemischt wird auf dem Handy, fest an die Teilnehmer-ID gebunden (Neuladen ändert nichts).
-- Gespeichert wird nur der Schalter – Fragen-Nummern und Bewertung bleiben unverändert.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

alter table public.aufgaben
  add column mischen boolean not null default false,
  add constraint aufgaben_mischen_check check (not mischen or modus in ('hausaufgabe', 'pruefung'));

-- ---------------------------------------------------------------------------
-- Aufgabe erstellen – neu mit p_mischen
-- ---------------------------------------------------------------------------
drop function public.aufgabe_erstellen(uuid, text, timestamptz, integer, integer);

create function public.aufgabe_erstellen(p_quiz_id uuid, p_modus text, p_frist timestamptz default null,
                                         p_codes integer default null, p_zeit integer default null,
                                         p_mischen boolean default false)
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
  if coalesce(p_mischen, false) and p_modus = 'selbstlernen' then
    raise exception 'QUIZZO: Mischen gibt es nur bei Hausaufgabe und Prüfung.';
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

  insert into public.aufgaben (besitzer_id, code, modus, titel, fragen, frist, loeschen_am, mit_zeit, mischen)
    values (auth.uid(), v_code, p_modus, v_titel, v_fragen, p_frist, v_loeschen, p_zeit is not null, coalesce(p_mischen, false))
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
revoke execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer, integer, boolean) from public, anon;
grant execute on function public.aufgabe_erstellen(uuid, text, timestamptz, integer, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ergebnisse und Liste: zusätzlich „gemischt“
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
                        'anteil', x.anteil, 'punkte', x.punkte, 'zu_spaet', x.zu_spaet) order by x.frage_nr)
                      from public.aufgabe_antworten x where x.teilnehmer_id = t.id), '[]'::jsonb))
        order by coalesce(t.code, lower(t.spitzname)))
      from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id), '[]'::jsonb)
  );
end;
$$;

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
      'offen', public.aufgabe_offen(a), 'mit_zeit', a.mit_zeit, 'mischen', a.mischen,
      'teilnehmer', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.begonnen_am is not null),
      'abgegeben', (select count(*) from public.aufgabe_teilnehmer t where t.aufgabe_id = a.id and t.abgegeben_am is not null),
      'versuche', (select coalesce(sum(versuche), 0) from public.aufgabe_statistik s where s.aufgabe_id = a.id))
      order by a.erstellt_am desc)
    from public.aufgaben a where a.besitzer_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stand eines Teilnehmers: zusätzlich „mischen“
-- ---------------------------------------------------------------------------
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
    'mischen', a.mischen,
    'punkte', case when a.modus = 'hausaufgabe' then t.punkte end,
    'fragen', public.aufgabe_fragen_teilnehmer(a, t.id),
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
