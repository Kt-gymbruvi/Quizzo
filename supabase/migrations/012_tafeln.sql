-- Plattform – Tafeln auf allen Geräten (Lehrraum, SPEC „Tafeln, Abgleich, PDF, Tabelle“, Etappe C)
--
-- Die Tafel (Lehrraum) gleicht jede Tafel – die Tafeln der Klassen und die freie Tafel – zwischen den Geräten der
-- Lehrkraft ab. Verschlüsselt wird AUF DEM GERÄT (AES-256-GCM) mit einem zufälligen Tafel-Schlüssel, der selbst
-- im passwortgeschützten Klassen-Tresor (lr_tresore, Art „klassen“) liegt. Hier liegen nur verschlüsselte Daten.
--
--   lr_tafeln    – je Tafel eine Zeile: tafel = „frei“ oder „k-<Kennung der Klasse>“
--   lr-dateien   – privater Speicherbereich für Bilder und PDF-Seiten, je Datei einmal, verschlüsselt,
--                  im Ordner <Kennung der Lehrkraft>/<Kennung der Datei>; nur der eigene Ordner ist zugänglich
--
-- Gleichzeitiges Speichern: nur über lr_tafel_speichern, und nur wenn die erwartete Fassung (rev) noch aktuell
-- ist; sonst „konflikt“ – dann vergleicht das Gerät und es gilt der zuletzt gespeicherte Stand.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

create table public.lr_tafeln (
  lehrkraft     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tafel         text not null check (tafel ~ '^(frei|k-[0-9a-z-]{4,64})$'),
  rev           integer not null check (rev >= 1),
  iv            text not null check (char_length(iv) between 12 and 32),
  daten         text not null check (char_length(daten) <= 40000000),
  geaendert_am  timestamptz not null default now(),
  primary key (lehrkraft, tafel)
);

alter table public.lr_tafeln enable row level security;

revoke all on public.lr_tafeln from anon, authenticated;
grant select, delete on public.lr_tafeln to authenticated;

create policy "Lehrkraft liest eigene Tafeln" on public.lr_tafeln
  for select to authenticated using (lehrkraft = (select auth.uid()));
create policy "Lehrkraft löscht eigene Tafeln" on public.lr_tafeln
  for delete to authenticated using (lehrkraft = (select auth.uid()));

-- Speichert eine Tafel, wenn p_rev_erwartet noch die aktuelle Fassung ist (0 = noch keine vorhanden).
-- Liefert die neue Fassung. Wurde inzwischen von einem anderen Gerät gespeichert: Fehler „konflikt“.
create or replace function public.lr_tafel_speichern(p_tafel text, p_rev_erwartet integer, p_iv text, p_daten text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  jetzt integer;
begin
  if ich is null then raise exception 'nicht angemeldet'; end if;
  select rev into jetzt from public.lr_tafeln where lehrkraft = ich and tafel = p_tafel for update;
  if coalesce(jetzt, 0) <> p_rev_erwartet then raise exception 'konflikt'; end if;
  if jetzt is null then
    insert into public.lr_tafeln (lehrkraft, tafel, rev, iv, daten) values (ich, p_tafel, 1, p_iv, p_daten);
    return 1;
  end if;
  update public.lr_tafeln set rev = jetzt + 1, iv = p_iv, daten = p_daten, geaendert_am = now()
    where lehrkraft = ich and tafel = p_tafel;
  return jetzt + 1;
end;
$$;

grant insert, update on public.lr_tafeln to authenticated;
create policy "Lehrkraft legt eigene Tafeln an" on public.lr_tafeln
  for insert to authenticated with check (lehrkraft = (select auth.uid()));
create policy "Lehrkraft ändert eigene Tafeln" on public.lr_tafeln
  for update to authenticated using (lehrkraft = (select auth.uid())) with check (lehrkraft = (select auth.uid()));

revoke all on function public.lr_tafel_speichern(text, integer, text, text) from public, anon;
grant execute on function public.lr_tafel_speichern(text, integer, text, text) to authenticated;

-- ---------- Privater Speicherbereich für Bilder und PDF-Seiten ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('lr-dateien', 'lr-dateien', false, 30000000)
on conflict (id) do nothing;

create policy "Lehrkraft liest eigene Tafel-Dateien" on storage.objects
  for select to authenticated
  using (bucket_id = 'lr-dateien' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Lehrkraft lädt eigene Tafel-Dateien hoch" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lr-dateien' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Lehrkraft löscht eigene Tafel-Dateien" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lr-dateien' and (storage.foldername(name))[1] = (select auth.uid())::text);
