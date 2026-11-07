-- Quizzo – Etappe 12: Schwierigkeit pro Frage (leicht / mittel / schwer)
-- Wird im Frageneditor gesetzt und vom Klassen-Duell genutzt: leichte Fragen auf die niedrigen Felder,
-- schwere auf die hohen. Ohne Angabe gilt eine Frage als „mittel“. Im Live-Spiel ändert sich nichts.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

alter table public.fragen
  add column schwierigkeit smallint check (schwierigkeit between 1 and 3); -- 1 leicht, 2 mittel, 3 schwer, null = ohne Angabe

-- Quiz speichern: übernimmt jetzt auch die Schwierigkeit (sonst unverändert wie in 004_medien.sql)
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

  insert into public.fragen (quiz_id, position, typ, text, inhalt, punkte, zeitlimit, medium, schwierigkeit)
  select v_id,
         (f.nr - 1)::smallint,
         coalesce(f.daten ->> 'typ', 'auswahl'),
         f.daten ->> 'text',
         f.daten -> 'inhalt',
         coalesce((f.daten ->> 'punkte')::smallint, 1),
         coalesce((f.daten ->> 'zeitlimit')::smallint, 20),
         nullif(f.daten -> 'medium', 'null'::jsonb),
         (f.daten ->> 'schwierigkeit')::smallint
  from jsonb_array_elements(p_fragen) with ordinality as f(daten, nr);

  return v_id;
end;
$$;
