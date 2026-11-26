-- =============================================================================
-- Verbeterregistratie (VBR) – database voor Supabase (PostgreSQL)
-- =============================================================================
-- Plak dit hele bestand (installatie.sql) in Supabase → SQL Editor → Run.
-- Het script is opnieuw uit te voeren: het ruimt eerst de oude objecten op.
--
-- Opbouw:
--   1. Tabellen volgens het ERD (7 entiteiten; REACTIE is erbij gekomen in iteratie 5)
--   2. Hulpfuncties: wie is ingelogd en welke rol heeft die
--   3. Beveiliging (Row Level Security): iedereen mag lezen, NIEMAND mag direct schrijven;
--      het gesprek (reactie) is alleen zichtbaar voor de indiener en de stuurgroep
--   4. Functies voor alle wijzigingen, met de bedrijfsregels (zelfde regels als logica.js)
--   5. Koppeling inlogaccount → medewerker
--   6. Live updates (Realtime)
--   7. Demodata
-- =============================================================================

-- ---------- Opruimen (zodat het script opnieuw kan draaien) ----------
drop trigger if exists vbr_koppel_nieuw_account on auth.users;
drop table if exists notificatie, reactie, statuswijziging, beoordeling, voorstel, categorie, medewerker cascade;
drop sequence if exists voorstel_nr, beoordeling_nr, statuswijziging_nr, notificatie_nr, reactie_nr;

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

-- Iteratie 5: gesprek per voorstel, privé tussen de indiener en de stuurgroep.
create sequence reactie_nr;
create table reactie (
  id            text primary key default 'r' || nextval('reactie_nr'),
  voorstel_id   text not null references voorstel(id) on delete cascade,
  afzender_id   text not null references medewerker(id),
  tekst         text not null check (char_length(tekst) between 1 and 1000),
  verzonden_op  timestamptz not null default now(),
  bewerkt_op    timestamptz                                -- leeg = nooit bewerkt
);
create index reactie_voorstel on reactie (voorstel_id, verzonden_op);

-- Een notificatie hoort bij precies één aanleiding: een statuswijziging óf een reactie.
create sequence notificatie_nr;
create table notificatie (
  id                  text primary key default 'n' || nextval('notificatie_nr'),
  ontvanger_id        text not null references medewerker(id),
  voorstel_id         text not null references voorstel(id) on delete cascade,
  statuswijziging_id  text unique references statuswijziging(id) on delete cascade,  -- 1 bericht per wijziging
  reactie_id          text references reactie(id) on delete cascade,
  bericht             text not null,
  gelezen             boolean not null default false,
  mail                text,
  datum               timestamptz not null default now(),
  check (num_nonnulls(statuswijziging_id, reactie_id) = 1),
  unique (reactie_id, ontvanger_id)                                                 -- 1 melding per ontvanger per reactie
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

-- Mag de ingelogde medewerker het gesprek bij dit voorstel zien en erin schrijven?
-- Alleen de indiener en de stuurgroep (zelfde regel als magGesprekZien in logica.js).
create or replace function mag_gesprek_zien(p_voorstel_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from voorstel v, medewerker m
     where v.id = p_voorstel_id and m.auth_user_id = auth.uid()
       and (v.indiener_id = m.id or m.rol = 'stuurgroep'))
$$;

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
alter table reactie         enable row level security;

create policy lezen on medewerker      for select to authenticated using (true);
create policy lezen on categorie       for select to authenticated using (true);
create policy lezen on voorstel        for select to authenticated using (true);
create policy lezen on beoordeling     for select to authenticated using (true);
create policy lezen on statuswijziging for select to authenticated using (true);
create policy eigen_berichten on notificatie for select to authenticated
  using (ontvanger_id = (select id from huidige_medewerker()));
create policy gesprek_deelnemers on reactie for select to authenticated
  using (mag_gesprek_zien(voorstel_id));

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

-- Iteratie 5: reactie plaatsen in het gesprek + automatisch een melding voor de andere partij.
-- Schrijft de indiener, dan krijgt de stuurgroep een melding; schrijft de stuurgroep, dan de indiener.
create or replace function plaats_reactie(p_voorstel_id text, p_tekst text)
returns reactie language plpgsql security definer set search_path = public as $$
declare m medewerker; v voorstel; r reactie;
begin
  m := vereis_medewerker();
  select * into v from voorstel where id = p_voorstel_id;
  if v.id is null then raise exception 'Voorstel niet gevonden.'; end if;
  if not mag_gesprek_zien(p_voorstel_id) then raise exception 'Alleen de indiener en de stuurgroep kunnen in dit gesprek reageren.'; end if;
  p_tekst := btrim(coalesce(p_tekst, ''));
  if p_tekst = '' then raise exception 'Typ eerst een bericht.'; end if;
  if char_length(p_tekst) > 1000 then raise exception 'Een bericht mag maximaal 1000 tekens zijn.'; end if;
  insert into reactie (voorstel_id, afzender_id, tekst) values (p_voorstel_id, m.id, p_tekst) returning * into r;
  insert into notificatie (ontvanger_id, voorstel_id, reactie_id, bericht)
    select o.id, v.id, r.id, format('%s reageerde bij "%s".', m.naam, v.titel)
      from medewerker o
     where o.id <> m.id
       and (case when m.id = v.indiener_id then o.rol = 'stuurgroep' else o.id = v.indiener_id end);
  return r;
end $$;

-- Eigen reactie bewerken, tot 15 minuten na verzenden. Verwijderen kan bewust niet.
create or replace function bewerk_reactie(p_reactie_id text, p_tekst text)
returns reactie language plpgsql security definer set search_path = public as $$
declare m medewerker; r reactie;
begin
  m := vereis_medewerker();
  select * into r from reactie where id = p_reactie_id for update;
  if r.id is null then raise exception 'Bericht niet gevonden.'; end if;
  if r.afzender_id <> m.id then raise exception 'Je kunt alleen je eigen berichten bewerken.'; end if;
  if now() - r.verzonden_op > interval '15 minutes' then raise exception 'Bewerken kan tot 15 minuten na verzenden.'; end if;
  p_tekst := btrim(coalesce(p_tekst, ''));
  if p_tekst = '' then raise exception 'Typ eerst een bericht.'; end if;
  if char_length(p_tekst) > 1000 then raise exception 'Een bericht mag maximaal 1000 tekens zijn.'; end if;
  update reactie set tekst = p_tekst, bewerkt_op = now() where id = r.id returning * into r;
  return r;
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

-- Demodata (gegenereerd door scripts/maak-supabase-sql.js op 2026-11-26).
create or replace function reset_demo_intern() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from notificatie where true; delete from reactie where true; delete from statuswijziging where true; delete from beoordeling where true; delete from voorstel where true;
  insert into medewerker (id, naam, email, rol) values
    ('m1', 'Theo Silfhout', 'medewerker@verbeterregistratie.test', 'medewerker'),
    ('m2', 'Matthijs van Voorthuizen', 'matthijs@egency.example', 'medewerker'),
    ('m3', 'AnneMirthe Roelofsen', 'annemirthe@egency.example', 'medewerker'),
    ('m4', 'Olaf van Heeswijk', 'stuurgroep@verbeterregistratie.test', 'stuurgroep'),
    ('m5', 'Arjen Fiechter', 'arjen@egency.example', 'stuurgroep'),
    ('m6', 'Haico de Boer', 'management@verbeterregistratie.test', 'management')
    on conflict (id) do update set naam = excluded.naam, email = excluded.email, rol = excluded.rol;
  insert into categorie (id, naam, omschrijving) values
    ('c1', 'Klantomgeving', 'Technische verbetering of adviesmogelijkheid bij een klant'),
    ('c2', 'Intern proces', 'Verbetering van de eigen werkwijze van Egency'),
    ('c3', 'Beveiliging', 'Beveiligingsverbetering bij een klant of bij Egency')
    on conflict (id) do update set naam = excluded.naam, omschrijving = excluded.omschrijving;
  insert into voorstel (id, titel, omschrijving, categorie_id, klant, opbrengst, indiener_id, status, ingediend_op) values
    ('v1', 'MFA afdwingen voor beheeraccounts bij klanten', 'Bij meerdere klanten hebben beheeraccounts nog geen MFA. Voorstel: via Conditional Access MFA verplichten voor alle admin-rollen.', 'c3', 'Meerdere klanten', 'Lager risico op accountovername; adviestraject bij ca. 8 klanten.', 'm2', 'Overgedragen aan Freshservice', now() - interval '2094521 seconds'),
    ('v2', 'Standaard checklist voor onboarding nieuwe klant', 'Elke engineer doet de onboarding anders. Een vaste checklist voorkomt vergeten stappen zoals back-upcontrole en documentatie.', 'c2', '', 'Minder nazorgtickets na onboarding, snellere inwerktijd nieuwe collega''s.', 'm1', 'Ingepland', now() - interval '1489721 seconds'),
    ('v3', 'Verouderde firewall-firmware bij klant', 'Tijdens een storing zag ik dat de firewall bij deze klant twee major versies achterloopt. Voorstel: upgrade adviseren en inplannen.', 'c3', 'Klant Bouwbedrijf', 'Advies-uren en kleiner beveiligingsrisico.', 'm3', 'In beoordeling', now() - interval '798521 seconds'),
    ('v4', 'Automatische rapportage licentiegebruik M365', 'Klanten betalen vaak voor ongebruikte licenties. Een maandelijkse rapportage maakt dit zichtbaar en levert adviesgesprekken op.', 'c1', 'Alle M365-klanten', 'Besparing voor klant, extra adviesomzet voor Egency.', 'm2', 'On hold', now() - interval '1057721 seconds'),
    ('v5', 'Koffieautomaat vervangen', 'De koffieautomaat op kantoor is vaak stuk.', 'c2', '', '', 'm3', 'Afgewezen', now() - interval '1316921 seconds'),
    ('v6', 'Wachtwoordbeleid servicedesk-accounts aanscherpen', 'Gedeelde accounts op de servicedesk gebruiken een zwak wachtwoord dat lang niet gewijzigd is. Voorstel: persoonlijke accounts + wachtwoordmanager.', 'c3', '', 'Kleiner risico voor Egency, voldoet beter aan ISO 27001.', 'm1', 'Ingediend', now() - interval '884921 seconds'),
    ('v7', 'Kennisbankartikel voor veelvoorkomende printerstoring', 'Dezelfde printerstoring komt wekelijks binnen. Een kennisbankartikel scheelt de servicedesk tijd.', 'c2', '', 'Ca. 1 uur per week tijdwinst op de servicedesk.', 'm2', 'Ingediend', now() - interval '193721 seconds');
  insert into beoordeling (id, voorstel_id, beoordelaar_id, impact, urgentie, inzet, score, prioriteit, gepland_week, notitie, datum) values
    ('b1', 'v1', 'm5', 'hoog', 'hoog', 'middel', 8, 'Hoog', '', '', now() - interval '1817321 seconds'),
    ('b2', 'v2', 'm4', 'middel', 'middel', 'laag', 7, 'Hoog', '2026-W49', '', now() - interval '1212521 seconds'),
    ('b3', 'v3', 'm5', 'hoog', 'middel', 'laag', 8, 'Hoog', '', '', now() - interval '607721 seconds'),
    ('b4', 'v4', 'm4', 'middel', 'laag', 'hoog', 4, 'Laag', '', '', now() - interval '607721 seconds');
  insert into statuswijziging (id, voorstel_id, van_status, naar_status, door_id, toelichting, datum) values
    ('sw1', 'v1', null, 'Ingediend', 'm2', '', now() - interval '2094521 seconds'),
    ('sw2', 'v1', 'Ingediend', 'In beoordeling', 'm5', '', now() - interval '1817321 seconds'),
    ('sw3', 'v1', 'In beoordeling', 'Goedgekeurd', 'm4', 'Hoge impact op beveiliging; Arjen pakt de inhoud op.', now() - interval '1813721 seconds'),
    ('sw4', 'v1', 'Goedgekeurd', 'Ingepland', 'm4', '', now() - interval '1730921 seconds'),
    ('sw5', 'v1', 'Ingepland', 'Overgedragen aan Freshservice', 'm4', 'Freshservice-change aangemaakt.', now() - interval '1126121 seconds'),
    ('sw6', 'v2', null, 'Ingediend', 'm1', '', now() - interval '1489721 seconds'),
    ('sw7', 'v2', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '1212521 seconds'),
    ('sw8', 'v2', 'In beoordeling', 'Goedgekeurd', 'm4', '', now() - interval '1208921 seconds'),
    ('sw9', 'v2', 'Goedgekeurd', 'Ingepland', 'm4', 'Ingepland op basis van beschikbare capaciteit.', now() - interval '607721 seconds'),
    ('sw10', 'v3', null, 'Ingediend', 'm3', '', now() - interval '798521 seconds'),
    ('sw11', 'v3', 'Ingediend', 'In beoordeling', 'm5', '', now() - interval '607721 seconds'),
    ('sw12', 'v4', null, 'Ingediend', 'm2', '', now() - interval '1057721 seconds'),
    ('sw13', 'v4', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '607721 seconds'),
    ('sw14', 'v4', 'In beoordeling', 'On hold', 'm4', 'Goed idee, maar eerst capaciteit vrijmaken in Q1.', now() - interval '604121 seconds'),
    ('sw15', 'v5', null, 'Ingediend', 'm3', '', now() - interval '1316921 seconds'),
    ('sw16', 'v5', 'Ingediend', 'Afgewezen', 'm4', 'Hoort niet in deze registratie; graag melden bij facilitair.', now() - interval '1212521 seconds'),
    ('sw17', 'v6', null, 'Ingediend', 'm1', '', now() - interval '884921 seconds'),
    ('sw18', 'v7', null, 'Ingediend', 'm2', '', now() - interval '193721 seconds');
  insert into reactie (id, voorstel_id, afzender_id, tekst, verzonden_op) values
    ('r1', 'v3', 'm5', 'Weet je welk firewallmodel het is en of er nog support op zit? Dan kan ik de inzet beter inschatten.', now() - interval '618521 seconds'),
    ('r2', 'v3', 'm3', 'Het is een FortiGate 60F, support loopt nog tot volgend jaar. De upgrade kan dus via de normale weg.', now() - interval '611321 seconds'),
    ('r3', 'v6', 'm4', 'Om hoeveel gedeelde accounts gaat het ongeveer? En gebruiken collega''s nu al een wachtwoordmanager?', now() - interval '103721 seconds');
  insert into notificatie (id, ontvanger_id, voorstel_id, statuswijziging_id, reactie_id, bericht, gelezen, datum) values
    ('n1', 'm2', 'v1', 'sw1', null, 'Bedankt! Je voorstel "MFA afdwingen voor beheeraccounts bij klanten" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '2094521 seconds'),
    ('n2', 'm2', 'v1', 'sw2', null, 'Je voorstel "MFA afdwingen voor beheeraccounts bij klanten" heeft nu de status "In beoordeling".', true, now() - interval '1817321 seconds'),
    ('n3', 'm2', 'v1', 'sw3', null, 'Je voorstel "MFA afdwingen voor beheeraccounts bij klanten" heeft nu de status "Goedgekeurd". Toelichting: Hoge impact op beveiliging; Arjen pakt de inhoud op.', true, now() - interval '1813721 seconds'),
    ('n4', 'm2', 'v1', 'sw4', null, 'Je voorstel "MFA afdwingen voor beheeraccounts bij klanten" heeft nu de status "Ingepland".', true, now() - interval '1730921 seconds'),
    ('n5', 'm2', 'v1', 'sw5', null, 'Je voorstel "MFA afdwingen voor beheeraccounts bij klanten" heeft nu de status "Overgedragen aan Freshservice". Toelichting: Freshservice-change aangemaakt.', true, now() - interval '1126121 seconds'),
    ('n6', 'm1', 'v2', 'sw6', null, 'Bedankt! Je voorstel "Standaard checklist voor onboarding nieuwe klant" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1489721 seconds'),
    ('n7', 'm1', 'v2', 'sw7', null, 'Je voorstel "Standaard checklist voor onboarding nieuwe klant" heeft nu de status "In beoordeling".', true, now() - interval '1212521 seconds'),
    ('n8', 'm1', 'v2', 'sw8', null, 'Je voorstel "Standaard checklist voor onboarding nieuwe klant" heeft nu de status "Goedgekeurd".', true, now() - interval '1208921 seconds'),
    ('n9', 'm1', 'v2', 'sw9', null, 'Je voorstel "Standaard checklist voor onboarding nieuwe klant" heeft nu de status "Ingepland". Toelichting: Ingepland op basis van beschikbare capaciteit.', true, now() - interval '607721 seconds'),
    ('n10', 'm3', 'v3', 'sw10', null, 'Bedankt! Je voorstel "Verouderde firewall-firmware bij klant" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '798521 seconds'),
    ('n11', 'm3', 'v3', 'sw11', null, 'Je voorstel "Verouderde firewall-firmware bij klant" heeft nu de status "In beoordeling".', true, now() - interval '607721 seconds'),
    ('n12', 'm2', 'v4', 'sw12', null, 'Bedankt! Je voorstel "Automatische rapportage licentiegebruik M365" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1057721 seconds'),
    ('n13', 'm2', 'v4', 'sw13', null, 'Je voorstel "Automatische rapportage licentiegebruik M365" heeft nu de status "In beoordeling".', true, now() - interval '607721 seconds'),
    ('n14', 'm2', 'v4', 'sw14', null, 'Je voorstel "Automatische rapportage licentiegebruik M365" heeft nu de status "On hold". Toelichting: Goed idee, maar eerst capaciteit vrijmaken in Q1.', true, now() - interval '604121 seconds'),
    ('n15', 'm3', 'v5', 'sw15', null, 'Bedankt! Je voorstel "Koffieautomaat vervangen" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1316921 seconds'),
    ('n16', 'm3', 'v5', 'sw16', null, 'Je voorstel "Koffieautomaat vervangen" heeft nu de status "Afgewezen". Toelichting: Hoort niet in deze registratie; graag melden bij facilitair.', true, now() - interval '1212521 seconds'),
    ('n17', 'm1', 'v6', 'sw17', null, 'Bedankt! Je voorstel "Wachtwoordbeleid servicedesk-accounts aanscherpen" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '884921 seconds'),
    ('n18', 'm2', 'v7', 'sw18', null, 'Bedankt! Je voorstel "Kennisbankartikel voor veelvoorkomende printerstoring" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', false, now() - interval '193721 seconds'),
    ('n19', 'm3', 'v3', null, 'r1', 'Arjen Fiechter reageerde bij "Verouderde firewall-firmware bij klant".', true, now() - interval '618521 seconds'),
    ('n20', 'm4', 'v3', null, 'r2', 'AnneMirthe Roelofsen reageerde bij "Verouderde firewall-firmware bij klant".', true, now() - interval '611321 seconds'),
    ('n21', 'm5', 'v3', null, 'r2', 'AnneMirthe Roelofsen reageerde bij "Verouderde firewall-firmware bij klant".', true, now() - interval '611321 seconds'),
    ('n22', 'm1', 'v6', null, 'r3', 'Olaf van Heeswijk reageerde bij "Wachtwoordbeleid servicedesk-accounts aanscherpen".', false, now() - interval '103721 seconds');
  perform setval('voorstel_nr', 7);
  perform setval('beoordeling_nr', 4);
  perform setval('statuswijziging_nr', 18);
  perform setval('notificatie_nr', 22);
  perform setval('reactie_nr', 3);
end $$;

-- "Demodata herstellen" in de app: iedere ingelogde gebruiker mag dit (alleen bedoeld voor de demo).
create or replace function reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform vereis_medewerker();
  perform reset_demo_intern();
end $$;

-- =============================================================================
-- Rechten: alleen ingelogde gebruikers mogen de functies aanroepen.
-- =============================================================================
-- (Supabase geeft standaard rechten aan anon en authenticated; die halen we eerst weg.)
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on medewerker, categorie, voorstel, beoordeling, statuswijziging, notificatie, reactie from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on medewerker, categorie, voorstel, beoordeling, statuswijziging, notificatie, reactie to authenticated;
grant execute on function huidige_medewerker(), dien_voorstel_in(text, text, text, text, text), sla_beoordeling_op(text, text, text, text, text, text),
  wijzig_status(text, text, text), markeer_gelezen(text[]), reset_demo(),
  mag_gesprek_zien(text), plaats_reactie(text, text), bewerk_reactie(text, text) to authenticated;

-- =============================================================================
-- 6. Live updates: wijzigingen direct naar alle open schermen sturen
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['voorstel','beoordeling','statuswijziging','notificatie','reactie'] loop
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
