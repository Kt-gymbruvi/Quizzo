-- Plattform – Schülerseiten, Teil 2 (Lehrraum, SPEC „Schülerseiten“): Gäste und Fotos
-- Läuft NACH 017_schuelerseiten.sql und ändert nichts Bestehendes außer lr_sitzung_anlegen (jetzt bis 100 Plätze).
--
--   Gäste  – Plätze für Schüler, die nicht in der Liste stehen („Gast 1“, „Gast 2“ …). Sie sind gewöhnliche Plätze
--            (Kennung zufällig); dass es Gäste sind, steht nur in der verschlüsselten Namensliste. Dafür steigt die
--            Obergrenze von 60 auf 100 Plätze je Freigabe.
--   Fotos  – lr_bilder: je Foto eine Zeile, verschlüsselt auf dem Gerät des Schülers (AES-256-GCM mit dem Sitzungs-
--            schlüssel, Platz und Kennung des Bildes sind mitgebunden). Die Seite selbst nennt nur die Kennung. Fotos
--            liegen in der Datenbank (nicht im Speicherbereich): Sie hängen per „on delete cascade“ an Platz und Sitzung
--            und verschwinden deshalb mit dem automatischen Löschen zuverlässig.
--
-- Schüler dürfen Fotos nur über lr_bild_speichern und lr_bilder_laden: mit Sitzungscode, Geheimnis des Platzes und
-- offener Zeit. Je Platz höchstens 20 Fotos, höchstens 2,5 Mio. Zeichen je Foto und 15 Mio. Zeichen zusammen.
-- Die Lehrkraft liest die Fotos ihrer eigenen Sitzungen.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------- Gäste: bis zu 100 Plätze ----------
create or replace function public.lr_sitzung_anlegen(p_code text, p_ende timestamptz, p_iv text, p_daten text, p_plaetze text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ich uuid := auth.uid();
begin
  if ich is null then raise exception 'nicht angemeldet'; end if;
  perform public.lr_sitzungen_aufraeumen();
  if p_ende <= now() or p_ende > now() + interval '3 hours' then raise exception 'QUIZZO: Die Dauer muss zwischen 1 Minute und 3 Stunden liegen.'; end if;
  if coalesce(array_length(p_plaetze, 1), 0) not between 1 and 100 then raise exception 'QUIZZO: Eine Freigabe braucht 1 bis 100 Plätze.'; end if;
  if (select count(*) from public.lr_sitzungen where lehrkraft = ich and ende > now()) >= 10 then
    raise exception 'QUIZZO: Es laufen schon 10 Freigaben. Bitte erst welche beenden.';
  end if;
  insert into public.lr_sitzungen (code, ende, loeschen_am, iv, daten) values (p_code, p_ende, p_ende + interval '48 hours', p_iv, p_daten);
  insert into public.lr_abgaben (code, platz) select p_code, p from unnest(p_plaetze) as p;
end;
$$;

-- ---------- Fotos ----------
create table public.lr_bilder (
  code         text not null,
  platz        text not null,
  bild         text not null check (bild ~ '^[0-9a-f]{8,64}$'),
  iv           text not null check (char_length(iv) between 12 and 32),
  daten        text not null check (char_length(daten) <= 2500000),
  angelegt_am  timestamptz not null default now(),
  primary key (code, platz, bild),
  foreign key (code, platz) references public.lr_abgaben (code, platz) on delete cascade
);

alter table public.lr_bilder enable row level security;
revoke all on public.lr_bilder from anon, authenticated;
grant select (code, platz, bild, iv, daten) on public.lr_bilder to authenticated;

create policy "Lehrkraft liest Fotos eigener Sitzungen" on public.lr_bilder
  for select to authenticated
  using (exists (select 1 from public.lr_sitzungen s where s.code = lr_bilder.code and s.lehrkraft = (select auth.uid())));

-- Legt ein Foto ab (einmal je Kennung, danach unveränderlich). Nur mit dem Geheimnis des Platzes und offener Zeit.
create or replace function public.lr_bild_speichern(p_code text, p_platz text, p_hash text, p_bild text, p_iv text, p_daten text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
  summe bigint;
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_platz !~ '^[0-9A-Za-z_-]{1,64}$' or p_hash !~ '^[0-9a-f]{64}$' or p_bild !~ '^[0-9a-f]{8,64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if char_length(p_iv) not between 12 and 32 or char_length(p_daten) > 2500000 then raise exception 'QUIZZO: Das Foto ist zu groß.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and ende > now() and loeschen_am > now()) then
    raise exception 'QUIZZO: Die Zeit ist um.';
  end if;
  perform 1 from public.lr_abgaben where code = p_code and platz = p_platz and geheimnis_hash = p_hash for update;
  if not found then raise exception 'QUIZZO: Dieser Platz gehört einem anderen Gerät.'; end if;
  if exists (select 1 from public.lr_bilder where code = p_code and platz = p_platz and bild = p_bild) then return; end if;
  select count(*), coalesce(sum(char_length(daten)), 0) into anzahl, summe from public.lr_bilder where code = p_code and platz = p_platz;
  if anzahl >= 20 then raise exception 'QUIZZO: Zu viele Fotos.'; end if;
  if summe + char_length(p_daten) > 15000000 then raise exception 'QUIZZO: Die Fotos sind zusammen zu groß.'; end if;
  insert into public.lr_bilder (code, platz, bild, iv, daten) values (p_code, p_platz, p_bild, p_iv, p_daten);
end;
$$;

-- Alle eigenen Fotos (nach einem Neuladen); leer, wenn der Platz einem anderen Gerät gehört.
create or replace function public.lr_bilder_laden(p_code text, p_platz text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code !~ '^[A-Za-z0-9_-]{22}$' or p_platz !~ '^[0-9A-Za-z_-]{1,64}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'QUIZZO: Ungültige Angabe.'; end if;
  if not exists (select 1 from public.lr_sitzungen where code = p_code and ende > now() and loeschen_am > now()) then
    raise exception 'QUIZZO: Die Zeit ist um.';
  end if;
  if not exists (select 1 from public.lr_abgaben where code = p_code and platz = p_platz and geheimnis_hash = p_hash) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bild', b.bild, 'iv', b.iv, 'daten', b.daten) order by b.angelegt_am) from public.lr_bilder b where b.code = p_code and b.platz = p_platz), '[]'::jsonb);
end;
$$;

revoke all on function public.lr_bild_speichern(text, text, text, text, text, text) from public;
revoke all on function public.lr_bilder_laden(text, text, text) from public;
grant execute on function public.lr_bild_speichern(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.lr_bilder_laden(text, text, text) to anon, authenticated;
