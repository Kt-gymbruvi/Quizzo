-- Plattform – Schülerseiten, Teil 3 (Lehrraum, SPEC „Schülerseiten“): Bilder und PDF-Seiten im Aufgabenblatt
-- Läuft NACH 017 und 018 und ändert nichts Bestehendes.
--
--   Schickt die Lehrkraft die gezeigte Seite als Aufgabenblatt mit, gehören dazu auch Bilder, Hintergrundbilder und
--   PDF-Seiten. Sie werden auf dem Gerät der Lehrkraft mit dem Sitzungsschlüssel verschlüsselt (AES-256-GCM, der
--   Platz heißt dabei fest „vorlage“) und hier abgelegt. Die Schüler holen sie mit dem Sitzungscode (der Schlüssel steht
--   nur im QR-Code). Sie hängen per „on delete cascade“ an der Sitzung und verschwinden mit dem automatischen Löschen.
--
-- Je Freigabe höchstens 12 Bilder, höchstens 2,5 Mio. Zeichen je Bild und 20 Mio. Zeichen zusammen.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

create table public.lr_vorlagebilder (
  code         text not null references public.lr_sitzungen (code) on delete cascade,
  bild         text not null check (bild ~ '^[0-9a-f]{8,64}$'),
  iv           text not null check (char_length(iv) between 12 and 32),
  daten        text not null check (char_length(daten) <= 2500000),
  angelegt_am  timestamptz not null default now(),
  primary key (code, bild)
);

alter table public.lr_vorlagebilder enable row level security;
revoke all on public.lr_vorlagebilder from anon, authenticated;

-- Lehrkraft: legt ein Bild des Aufgabenblatts ab (einmal je Kennung). Nur für eigene, noch offene Freigaben.
create or replace function public.lr_vorlagebild_speichern(p_code text, p_bild text, p_iv text, p_daten text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  anzahl integer;
  summe bigint;
begin
  if ich is null then raise exception 'nicht angemeldet'; end if;
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_bild !~ '^[0-9a-f]{8,64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if char_length(p_iv) not between 12 and 32 or char_length(p_daten) > 2500000 then raise exception 'QUIZZO: Das Bild ist zu groß.'; end if;
  perform 1 from public.lr_sitzungen where code = p_code and lehrkraft = ich and loeschen_am > now() for update;
  if not found then raise exception 'QUIZZO: Diese Freigabe gibt es nicht (mehr).'; end if;
  if exists (select 1 from public.lr_vorlagebilder where code = p_code and bild = p_bild) then return; end if;
  select count(*), coalesce(sum(char_length(daten)), 0) into anzahl, summe from public.lr_vorlagebilder where code = p_code;
  if anzahl >= 12 then raise exception 'QUIZZO: Das Aufgabenblatt hat zu viele Bilder.'; end if;
  if summe + char_length(p_daten) > 20000000 then raise exception 'QUIZZO: Die Bilder des Aufgabenblatts sind zusammen zu groß.'; end if;
  insert into public.lr_vorlagebilder (code, bild, iv, daten) values (p_code, p_bild, p_iv, p_daten);
end;
$$;

-- Schüler und Lehrkraft: ein Bild des Aufgabenblatts holen; null, wenn es (noch) nicht da ist.
create or replace function public.lr_vorlagebild_laden(p_code text, p_bild text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_bild !~ '^[0-9a-f]{8,64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and loeschen_am > now()) then
    raise exception 'QUIZZO: Diese Freigabe gibt es nicht (mehr).';
  end if;
  return (select jsonb_build_object('bild', b.bild, 'iv', b.iv, 'daten', b.daten) from public.lr_vorlagebilder b where b.code = p_code and b.bild = p_bild);
end;
$$;

revoke all on function public.lr_vorlagebild_speichern(text, text, text, text) from public;
revoke all on function public.lr_vorlagebild_laden(text, text) from public;
grant execute on function public.lr_vorlagebild_speichern(text, text, text, text) to authenticated;
grant execute on function public.lr_vorlagebild_laden(text, text) to anon, authenticated;
