-- =============================================================================
-- Verbeterregistratie (VBR) – database voor Supabase (PostgreSQL)
-- =============================================================================
-- Plak dit hele bestand (installatie.sql) in Supabase → SQL Editor → Run.
-- Het script is opnieuw uit te voeren: het ruimt eerst de oude objecten op.
--
-- Opbouw:
--   1. Tabellen volgens het ERD (6 entiteiten)
--   2. Hulpfuncties: wie is ingelogd en welke rol heeft die
--   3. Beveiliging (Row Level Security): iedereen mag lezen, NIEMAND mag direct schrijven
--   4. Functies voor alle wijzigingen, met de bedrijfsregels (zelfde regels als logica.js)
--   5. Koppeling inlogaccount → medewerker
--   6. Live updates (Realtime)
--   7. Demodata
-- =============================================================================

-- ---------- Opruimen (zodat het script opnieuw kan draaien) ----------
drop trigger if exists vbr_koppel_nieuw_account on auth.users;
drop table if exists notificatie, statuswijziging, beoordeling, voorstel, categorie, medewerker cascade;
drop sequence if exists voorstel_nr, beoordeling_nr, statuswijziging_nr, notificatie_nr;

-- =============================================================================
-- 1. Tabellen (ERD: docs/ontwerp.md)
-- =============================================================================
create table medewerker (
  id            text primary key,
  naam          text not null,
  email         text not null unique,
  rol           text not null check (rol in ('medewerker', 'stuurgroep', 'management')),
  auth_user_id  uuid unique references auth.users(id) on delete set null   -- inlogaccount (optioneel)
);

create table categorie (
  id            text primary key,
  naam          text not null,
  omschrijving  text not null default ''
);

create sequence voorstel_nr;
create table voorstel (
  id            text primary key default 'v' || nextval('voorstel_nr'),
  titel         text not null check (char_length(titel) between 5 and 100),
  omschrijving  text not null check (char_length(omschrijving) between 20 and 2000),
  categorie_id  text not null references categorie(id),
  klant         text not null default '' check (char_length(klant) <= 100),
  opbrengst     text not null default '' check (char_length(opbrengst) <= 500),
  indiener_id   text not null references medewerker(id),
  status        text not null default 'Ingediend' check (status in
                  ('Ingediend','In beoordeling','On hold','Goedgekeurd','Ingepland','Overgedragen aan Freshservice','Afgewezen')),
  ingediend_op  timestamptz not null default now()
);

create sequence beoordeling_nr;
create table beoordeling (
  id              text primary key default 'b' || nextval('beoordeling_nr'),
  voorstel_id     text not null unique references voorstel(id) on delete cascade,  -- max. 1 per voorstel
  beoordelaar_id  text not null references medewerker(id),
  impact          text not null check (impact   in ('laag','middel','hoog')),
  urgentie        text not null check (urgentie in ('laag','middel','hoog')),
  inzet           text not null check (inzet    in ('laag','middel','hoog')),
  score           int  not null check (score between 3 and 9),
  prioriteit      text not null check (prioriteit in ('Hoog','Middel','Laag')),
  gepland_week    text not null default '' check (gepland_week = '' or gepland_week ~ '^\d{4}-W\d{2}$'),
  notitie         text not null default '',
  datum           timestamptz not null default now()
);

create sequence statuswijziging_nr;
create table statuswijziging (
  id           text primary key default 'sw' || nextval('statuswijziging_nr'),
  voorstel_id  text not null references voorstel(id) on delete cascade,
  van_status   text,                                   -- leeg bij indienen
  naar_status  text not null,
  door_id      text not null references medewerker(id),
  toelichting  text not null default '',
  datum        timestamptz not null default now()
);

create sequence notificatie_nr;
create table notificatie (
  id                  text primary key default 'n' || nextval('notificatie_nr'),
  ontvanger_id        text not null references medewerker(id),
  voorstel_id         text not null references voorstel(id) on delete cascade,
  statuswijziging_id  text not null unique references statuswijziging(id) on delete cascade,  -- 1 bericht per wijziging
  bericht             text not null,
  gelezen             boolean not null default false,
  mail                text,
  datum               timestamptz not null default now()
);

-- =============================================================================
-- 2. Hulpfuncties
-- =============================================================================
-- De medewerker die hoort bij het ingelogde account.
create or replace function huidige_medewerker() returns medewerker
language sql stable security definer set search_path = public as $$
  select * from medewerker where auth_user_id = auth.uid()
$$;

create or replace function vereis_medewerker() returns medewerker
language plpgsql stable security definer set search_path = public as $$
declare m medewerker;
begin
  m := huidige_medewerker();
  if m.id is null then raise exception 'Je account is nog niet gekoppeld aan een medewerker.'; end if;
  return m;
end $$;

create or replace function vereis_stuurgroep() returns medewerker
language plpgsql stable security definer set search_path = public as $$
declare m medewerker;
begin
  m := vereis_medewerker();
  if m.rol <> 'stuurgroep' then raise exception 'Alleen de stuurgroep mag voorstellen beoordelen of de status wijzigen.'; end if;
  return m;
end $$;

-- =============================================================================
-- 3. Beveiliging: Row Level Security
-- =============================================================================
-- Ingelogde gebruikers mogen alles lezen (nodig voor lijsten en dashboard),
-- behalve berichten van anderen. Er zijn GEEN insert/update/delete-regels:
-- schrijven kan alleen via de functies hieronder, die de bedrijfsregels afdwingen.
alter table medewerker      enable row level security;
alter table categorie       enable row level security;
alter table voorstel        enable row level security;
alter table beoordeling     enable row level security;
alter table statuswijziging enable row level security;
alter table notificatie     enable row level security;

create policy lezen on medewerker      for select to authenticated using (true);
create policy lezen on categorie       for select to authenticated using (true);
create policy lezen on voorstel        for select to authenticated using (true);
create policy lezen on beoordeling     for select to authenticated using (true);
create policy lezen on statuswijziging for select to authenticated using (true);
create policy eigen_berichten on notificatie for select to authenticated
  using (ontvanger_id = (select id from huidige_medewerker()));

-- =============================================================================
-- 4. Functies voor wijzigingen (bedrijfsregels, gelijk aan public/js/logica.js)
-- =============================================================================

-- Kernfunctionaliteit 1: voorstel indienen + statuswijziging + ontvangstbericht.
create or replace function dien_voorstel_in(p_titel text, p_omschrijving text, p_categorie_id text, p_klant text default '', p_opbrengst text default '')
returns voorstel language plpgsql security definer set search_path = public as $$
declare m medewerker; v voorstel; sw statuswijziging;
begin
  m := vereis_medewerker();
  p_titel := btrim(coalesce(p_titel, '')); p_omschrijving := btrim(coalesce(p_omschrijving, ''));
  if char_length(p_titel) < 5 then raise exception 'Geef een titel van minimaal 5 tekens.'; end if;
  if char_length(p_titel) > 100 then raise exception 'De titel mag maximaal 100 tekens zijn.'; end if;
  if char_length(p_omschrijving) < 20 then raise exception 'Beschrijf het voorstel in minimaal 20 tekens.'; end if;
  if not exists (select 1 from categorie where id = p_categorie_id) then raise exception 'Kies een categorie.'; end if;
  insert into voorstel (titel, omschrijving, categorie_id, klant, opbrengst, indiener_id)
    values (p_titel, p_omschrijving, p_categorie_id, btrim(coalesce(p_klant, '')), btrim(coalesce(p_opbrengst, '')), m.id)
    returning * into v;
  insert into statuswijziging (voorstel_id, van_status, naar_status, door_id) values (v.id, null, 'Ingediend', m.id) returning * into sw;
  insert into notificatie (ontvanger_id, voorstel_id, statuswijziging_id, bericht)
    values (m.id, v.id, sw.id, format('Bedankt! Je voorstel "%s" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', v.titel));
  return v;
end $$;

-- Prioriteit: score = impact + urgentie + (4 - inzet); 7-9 Hoog, 5-6 Middel, 3-4 Laag.
create or replace function niveau(p text) returns int language sql immutable as $$
  select case p when 'laag' then 1 when 'middel' then 2 when 'hoog' then 3 end
$$;

-- Kernfunctionaliteit 2a: beoordelen (alleen stuurgroep; 1 beoordeling per voorstel, wordt bijgewerkt).
create or replace function sla_beoordeling_op(p_voorstel_id text, p_impact text, p_urgentie text, p_inzet text, p_gepland_week text default '', p_notitie text default '')
returns beoordeling language plpgsql security definer set search_path = public as $$
declare m medewerker; s int; b beoordeling;
begin
  m := vereis_stuurgroep();
  if not exists (select 1 from voorstel where id = p_voorstel_id) then raise exception 'Voorstel niet gevonden.'; end if;
  if niveau(p_impact) is null or niveau(p_urgentie) is null or niveau(p_inzet) is null then
    raise exception 'Impact, urgentie en inzet moeten laag, middel of hoog zijn.'; end if;
  p_gepland_week := coalesce(p_gepland_week, '');
  if p_gepland_week <> '' and p_gepland_week !~ '^\d{4}-W\d{2}$' then raise exception 'Geplande week heeft het formaat JJJJ-Wnn, bijv. 2026-W50.'; end if;
  s := niveau(p_impact) + niveau(p_urgentie) + (4 - niveau(p_inzet));
  insert into beoordeling (voorstel_id, beoordelaar_id, impact, urgentie, inzet, score, prioriteit, gepland_week, notitie, datum)
    values (p_voorstel_id, m.id, p_impact, p_urgentie, p_inzet, s, case when s >= 7 then 'Hoog' when s >= 5 then 'Middel' else 'Laag' end,
            p_gepland_week, btrim(coalesce(p_notitie, '')), now())
    on conflict (voorstel_id) do update set beoordelaar_id = excluded.beoordelaar_id, impact = excluded.impact, urgentie = excluded.urgentie,
      inzet = excluded.inzet, score = excluded.score, prioriteit = excluded.prioriteit, gepland_week = excluded.gepland_week,
      notitie = excluded.notitie, datum = excluded.datum
    returning * into b;
  return b;
end $$;

-- Kernfunctionaliteit 2b: status wijzigen + AUTOMATISCH bericht aan de indiener (R2).
create or replace function wijzig_status(p_voorstel_id text, p_naar text, p_toelichting text default '')
returns statuswijziging language plpgsql security definer set search_path = public as $$
declare m medewerker; v voorstel; b beoordeling; sw statuswijziging; toegestaan text[];
begin
  m := vereis_stuurgroep();
  select * into v from voorstel where id = p_voorstel_id for update;
  if v.id is null then raise exception 'Voorstel niet gevonden.'; end if;
  toegestaan := case v.status
    when 'Ingediend'      then array['In beoordeling','Afgewezen']
    when 'In beoordeling' then array['Goedgekeurd','Afgewezen','On hold']
    when 'On hold'        then array['In beoordeling','Afgewezen']
    when 'Goedgekeurd'    then array['Ingepland']
    when 'Ingepland'      then array['Overgedragen aan Freshservice']
    else array[]::text[] end;
  if not (p_naar = any(toegestaan)) then raise exception 'Status "%" kan niet naar "%".', v.status, p_naar; end if;
  p_toelichting := btrim(coalesce(p_toelichting, ''));
  if p_naar in ('Afgewezen','On hold') and char_length(p_toelichting) < 5 then
    raise exception 'Geef een toelichting, zodat de indiener weet waarom.'; end if;
  select * into b from beoordeling where voorstel_id = p_voorstel_id;
  if p_naar = 'Goedgekeurd' and b.id is null then raise exception 'Beoordeel het voorstel eerst op impact, urgentie en inzet.'; end if;
  if p_naar = 'Ingepland' and coalesce(b.gepland_week, '') = '' then raise exception 'Vul eerst de geplande week in bij de beoordeling.'; end if;

  update voorstel set status = p_naar where id = p_voorstel_id;
  insert into statuswijziging (voorstel_id, van_status, naar_status, door_id, toelichting)
    values (p_voorstel_id, v.status, p_naar, m.id, p_toelichting) returning * into sw;
  insert into notificatie (ontvanger_id, voorstel_id, statuswijziging_id, bericht)
    values (v.indiener_id, p_voorstel_id, sw.id,
            format('Je voorstel "%s" heeft nu de status "%s".', v.titel, p_naar) || case when p_toelichting <> '' then ' Toelichting: ' || p_toelichting else '' end);
  return sw;
end $$;

-- Eigen berichten als gelezen markeren (lege lijst = alles).
create or replace function markeer_gelezen(p_ids text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare m medewerker;
begin
  m := vereis_medewerker();
  update notificatie set gelezen = true
   where ontvanger_id = m.id and (coalesce(array_length(p_ids, 1), 0) = 0 or id = any(p_ids));
end $$;

-- =============================================================================
-- 5. Koppeling inlogaccount → medewerker (op e-mailadres)
-- =============================================================================
-- Maak je in Supabase → Authentication een gebruiker aan met hetzelfde e-mailadres
-- als een medewerker hieronder, dan wordt die automatisch gekoppeld.
create or replace function koppel_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update medewerker set auth_user_id = new.id where lower(email) = lower(new.email);
  return new;
end $$;
create trigger vbr_koppel_nieuw_account after insert on auth.users for each row execute function koppel_account();

-- @@SEED_FUNCTIES@@

-- =============================================================================
-- Rechten: alleen ingelogde gebruikers mogen de functies aanroepen.
-- =============================================================================
-- (Supabase geeft standaard rechten aan anon en authenticated; die halen we eerst weg.)
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on medewerker, categorie, voorstel, beoordeling, statuswijziging, notificatie from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on medewerker, categorie, voorstel, beoordeling, statuswijziging, notificatie to authenticated;
grant execute on function huidige_medewerker(), dien_voorstel_in(text, text, text, text, text), sla_beoordeling_op(text, text, text, text, text, text),
  wijzig_status(text, text, text), markeer_gelezen(text[]), reset_demo() to authenticated;

-- =============================================================================
-- 6. Live updates: wijzigingen direct naar alle open schermen sturen
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['voorstel','beoordeling','statuswijziging','notificatie'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- =============================================================================
-- 7. Demodata
-- =============================================================================
select reset_demo_intern();
update medewerker m set auth_user_id = u.id from auth.users u where lower(u.email) = lower(m.email);
