-- Plattform – verschlüsselte Tresore für Notenbuch und Lehrraum (Notenbuch Etappe 1, Lehrraum SPEC „Klassen, Namen, Notenbuch“)
--
-- Notenbuch und Lehrraum speichern Noten bzw. Klassen mit Schülernamen auf dem Gerät und gleichen sie über
-- diese Tabelle zwischen den Geräten der Lehrkraft ab. Verschlüsselt wird AUF DEM GERÄT (AES-256-GCM, Schlüssel
-- aus dem Passwort der Lehrkraft mit PBKDF2). Hier liegen nur verschlüsselte Daten: Ohne das Passwort kann sie
-- niemand lesen – weder die Datenbank noch wer die Anmeldung kennt.
--
-- Arten (eine Zeile je Lehrkraft und Art):
--   notenbuch  – das ganze Notenbuch (schreibt und liest nur das Notenbuch)
--   namen      – Klassen und Schülernamen aus dem Notenbuch, ohne Noten (schreibt das Notenbuch, liest Lehrraum)
--   klassen    – in Lehrraum selbst angelegte Klassen mit Namen (schreibt und liest Lehrraum)
--
-- Gleichzeitiges Speichern von zwei Geräten: gespeichert wird nur über lr_tresor_speichern, und nur wenn die
-- erwartete Fassung (rev) noch aktuell ist. Sonst meldet die Funktion „konflikt“ und das Gerät fragt nach.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

create table public.lr_tresore (
  lehrkraft     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  art           text not null check (art in ('notenbuch', 'namen', 'klassen')),
  rev           integer not null check (rev >= 1),
  salt          text not null check (char_length(salt) between 16 and 64),
  iv            text not null check (char_length(iv) between 12 and 32),
  daten         text not null check (char_length(daten) <= 30000000),
  geaendert_am  timestamptz not null default now(),
  primary key (lehrkraft, art)
);

alter table public.lr_tresore enable row level security;

revoke all on public.lr_tresore from anon, authenticated;
grant select, delete on public.lr_tresore to authenticated;
-- Schreiben nur über die Funktion unten (prüft die Fassung)

create policy "Lehrkraft liest eigene Tresore" on public.lr_tresore
  for select to authenticated using (lehrkraft = (select auth.uid()));
create policy "Lehrkraft löscht eigene Tresore" on public.lr_tresore
  for delete to authenticated using (lehrkraft = (select auth.uid()));

-- Speichert einen Tresor, wenn p_rev_erwartet noch die aktuelle Fassung ist (0 = noch keiner vorhanden).
-- Liefert die neue Fassung. Wurde inzwischen von einem anderen Gerät gespeichert: Fehler „konflikt“.
create or replace function public.lr_tresor_speichern(p_art text, p_rev_erwartet integer, p_salt text, p_iv text, p_daten text)
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
  select rev into jetzt from public.lr_tresore where lehrkraft = ich and art = p_art for update;
  if coalesce(jetzt, 0) <> p_rev_erwartet then raise exception 'konflikt'; end if;
  if jetzt is null then
    insert into public.lr_tresore (lehrkraft, art, rev, salt, iv, daten) values (ich, p_art, 1, p_salt, p_iv, p_daten);
    return 1;
  end if;
  update public.lr_tresore set rev = jetzt + 1, salt = p_salt, iv = p_iv, daten = p_daten, geaendert_am = now()
    where lehrkraft = ich and art = p_art;
  return jetzt + 1;
end;
$$;

-- Die Funktion läuft mit den Rechten der Lehrkraft (security invoker) – dafür braucht sie Schreibrechte,
-- die aber wegen RLS nur für die eigene Zeile gelten.
grant insert, update on public.lr_tresore to authenticated;
create policy "Lehrkraft legt eigene Tresore an" on public.lr_tresore
  for insert to authenticated with check (lehrkraft = (select auth.uid()));
create policy "Lehrkraft ändert eigene Tresore" on public.lr_tresore
  for update to authenticated using (lehrkraft = (select auth.uid())) with check (lehrkraft = (select auth.uid()));

revoke all on function public.lr_tresor_speichern(text, integer, text, text, text) from public, anon;
grant execute on function public.lr_tresor_speichern(text, integer, text, text, text) to authenticated;
