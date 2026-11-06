-- Quizzo – Etappe 2: Quizze und Fragen der Lehrkräfte
-- Diese Daten werden dauerhaft gespeichert. Jede Lehrkraft sieht und ändert nur ihre eigenen Quizze.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.quizze (
  id            uuid primary key default gen_random_uuid(),
  besitzer_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel         text not null check (char_length(titel) between 1 and 200),
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create index quizze_besitzer_idx on public.quizze (besitzer_id);

create table public.fragen (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizze (id) on delete cascade,
  position   smallint not null check (position >= 0),
  text       text not null check (char_length(text) between 1 and 500),
  antworten  text[] not null check (array_length(antworten, 1) between 2 and 4),
  richtig    smallint not null,
  zeitlimit  smallint not null default 20 check (zeitlimit between 5 and 240),
  check (richtig >= 0 and richtig < array_length(antworten, 1)),
  unique (quiz_id, position)
);
create index fragen_quiz_idx on public.fragen (quiz_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: nur angemeldete Lehrkräfte, nur eigene Daten
-- ---------------------------------------------------------------------------
alter table public.quizze enable row level security;
alter table public.fragen enable row level security;

-- Nicht angemeldete Besucher (Schüler) haben keinerlei Zugriff auf diese Tabellen.
revoke all on public.quizze, public.fragen from anon;
grant select, insert, update, delete on public.quizze, public.fragen to authenticated;

create policy "Lehrkraft liest eigene Quizze" on public.quizze
  for select to authenticated using (besitzer_id = (select auth.uid()));
create policy "Lehrkraft legt eigene Quizze an" on public.quizze
  for insert to authenticated with check (besitzer_id = (select auth.uid()));
create policy "Lehrkraft ändert eigene Quizze" on public.quizze
  for update to authenticated
  using (besitzer_id = (select auth.uid()))
  with check (besitzer_id = (select auth.uid()));
create policy "Lehrkraft löscht eigene Quizze" on public.quizze
  for delete to authenticated using (besitzer_id = (select auth.uid()));

create policy "Lehrkraft verwaltet Fragen eigener Quizze" on public.fragen
  for all to authenticated
  using (exists (select 1 from public.quizze q where q.id = quiz_id and q.besitzer_id = (select auth.uid())))
  with check (exists (select 1 from public.quizze q where q.id = quiz_id and q.besitzer_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Quiz mit allen Fragen in einem Schritt speichern (alles oder nichts).
-- security invoker: läuft mit den Rechten der Lehrkraft, RLS gilt weiterhin.
-- ---------------------------------------------------------------------------
create function public.quiz_speichern(p_id uuid, p_titel text, p_fragen jsonb)
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

  insert into public.fragen (quiz_id, position, text, antworten, richtig, zeitlimit)
  select v_id,
         (f.nr - 1)::smallint,
         f.daten ->> 'text',
         array(select jsonb_array_elements_text(f.daten -> 'antworten')),
         (f.daten ->> 'richtig')::smallint,
         coalesce((f.daten ->> 'zeitlimit')::smallint, 20)
  from jsonb_array_elements(p_fragen) with ordinality as f(daten, nr);

  return v_id;
end;
$$;

revoke execute on function public.quiz_speichern(uuid, text, jsonb) from public, anon;
grant execute on function public.quiz_speichern(uuid, text, jsonb) to authenticated;
