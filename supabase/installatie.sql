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
    ('v1', 'MFA verplichten voor beheeraccounts bij klanten', 'Bij een aantal klanten kunnen beheeraccounts nog zonder MFA inloggen. Voorstel: via Conditional Access MFA verplichten voor alle beheerdersrollen en dit vastleggen in de standaardinrichting.', 'c3', 'Meerdere klanten', 'Kleiner risico op accountovername; adviestraject bij ongeveer 8 klanten.', 'm2', 'Overgedragen aan Freshservice', now() - interval '3046606 seconds'),
    ('v2', 'Back-upmeldingen bundelen in één dagrapport', 'Elke ochtend komen tientallen losse back-upmails binnen. Eén dagrapport met alleen de mislukte en gewaarschuwde taken maakt de controle sneller en overzichtelijker.', 'c2', '', 'Ongeveer 30 minuten per dag tijdwinst bij de back-upcontrole.', 'm3', 'Overgedragen aan Freshservice', now() - interval '2614606 seconds'),
    ('v3', 'Vaste checklist voor onboarding van nieuwe klanten', 'Iedere engineer doet de onboarding van een nieuwe klant net anders. Een vaste checklist voorkomt vergeten stappen, zoals de back-upcontrole, documentatie en het overdragen van wachtwoorden.', 'c2', '', 'Minder nazorgtickets na onboarding en sneller inwerken van nieuwe collega''s.', 'm1', 'Ingepland', now() - interval '2096206 seconds'),
    ('v4', 'Maandrapport licentiegebruik Microsoft 365', 'Klanten betalen regelmatig voor licenties die niemand gebruikt. Een maandelijks rapport per klant maakt dit zichtbaar en is een goede aanleiding voor een adviesgesprek.', 'c1', 'Alle Microsoft 365-klanten', 'Besparing voor de klant en extra adviesuren voor Egency.', 'm2', 'On hold', now() - interval '1750606 seconds'),
    ('v5', 'Firmware van firewall bijwerken bij klant', 'Tijdens een storing zag ik dat de firewall bij deze klant twee hoofdversies achterloopt. Voorstel: de klant adviseren om te upgraden en de update in een onderhoudsvenster in te plannen.', 'c3', 'Klant in de bouwsector', 'Kleiner beveiligingsrisico voor de klant en enkele adviesuren.', 'm3', 'Goedgekeurd', now() - interval '1577806 seconds'),
    ('v6', 'Persoonlijke accounts in plaats van gedeelde servicedesk-accounts', 'Op de servicedesk worden enkele gedeelde accounts gebruikt met een wachtwoord dat al lang niet is gewijzigd. Voorstel: iedereen een persoonlijk account en wachtwoorden opslaan in een wachtwoordmanager.', 'c3', '', 'Beter te herleiden wie wat doet en beter in lijn met ISO 27001.', 'm1', 'In beoordeling', now() - interval '1059406 seconds'),
    ('v7', 'Eigen snelheidstest-tool voor klantlocaties', 'Bij klachten over trage verbindingen meten we nu handmatig. Een eigen tool die op de klantlocatie periodiek de snelheid meet, maakt dit makkelijker.', 'c1', '', 'Snellere analyse bij klachten over de verbinding.', 'm3', 'Afgewezen', now() - interval '1405006 seconds'),
    ('v8', 'Kennisbankartikel voor terugkerende printerstoring', 'Dezelfde printerstoring komt bijna elke week binnen bij de servicedesk. Een kennisbankartikel met de vaste oplossing scheelt tijd en klanten kunnen het deels zelf oplossen.', 'c2', '', 'Ongeveer 1 uur per week tijdwinst op de servicedesk.', 'm3', 'Ingediend', now() - interval '886606 seconds'),
    ('v9', 'Verlopen SSL-certificaten bij klanten automatisch signaleren', 'Het komt voor dat een certificaat bij een klant verloopt voordat iemand het merkt. Een automatische controle met een melding 30 dagen vooraf voorkomt storingen.', 'c1', 'Meerdere klanten', 'Minder storingen en spoedwerk; kans op vervolgopdrachten.', 'm2', 'Ingediend', now() - interval '368206 seconds'),
    ('v10', 'Wekelijkse controle op mislukte Windows-updates', 'Mislukte Windows-updates vallen nu pas op als er iets misgaat. Een vaste wekelijkse controle in de beheertool zorgt dat we ze op tijd oppakken.', 'c1', 'Alle beheerklanten', 'Veiligere werkplekken bij klanten en minder verstoringen.', 'm1', 'Ingediend', now() - interval '109006 seconds');
  insert into beoordeling (id, voorstel_id, beoordelaar_id, impact, urgentie, inzet, score, prioriteit, gepland_week, notitie, datum) values
    ('b1', 'v1', 'm5', 'hoog', 'hoog', 'middel', 8, 'Hoog', '2026-W44', '', now() - interval '2855806 seconds'),
    ('b2', 'v2', 'm4', 'middel', 'middel', 'laag', 7, 'Hoog', '2026-W45', '', now() - interval '2423806 seconds'),
    ('b3', 'v3', 'm4', 'middel', 'middel', 'laag', 7, 'Hoog', '2026-W49', '', now() - interval '1819006 seconds'),
    ('b4', 'v4', 'm4', 'middel', 'laag', 'hoog', 4, 'Laag', '', '', now() - interval '1214206 seconds'),
    ('b5', 'v5', 'm5', 'hoog', 'middel', 'laag', 8, 'Hoog', '', '', now() - interval '1127806 seconds'),
    ('b6', 'v7', 'm4', 'laag', 'laag', 'middel', 4, 'Laag', '', '', now() - interval '1214206 seconds');
  insert into statuswijziging (id, voorstel_id, van_status, naar_status, door_id, toelichting, datum) values
    ('sw1', 'v1', null, 'Ingediend', 'm2', '', now() - interval '3046606 seconds'),
    ('sw2', 'v1', 'Ingediend', 'In beoordeling', 'm5', '', now() - interval '2855806 seconds'),
    ('sw3', 'v1', 'In beoordeling', 'Goedgekeurd', 'm4', 'Hoge impact op beveiliging. Arjen werkt het advies per klant uit.', now() - interval '2852206 seconds'),
    ('sw4', 'v1', 'Goedgekeurd', 'Ingepland', 'm4', '', now() - interval '2683006 seconds'),
    ('sw5', 'v1', 'Ingepland', 'Overgedragen aan Freshservice', 'm4', 'Change aangemaakt in Freshservice; uitvoering per klant.', now() - interval '2078206 seconds'),
    ('sw6', 'v2', null, 'Ingediend', 'm3', '', now() - interval '2614606 seconds'),
    ('sw7', 'v2', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '2423806 seconds'),
    ('sw8', 'v2', 'In beoordeling', 'Goedgekeurd', 'm4', '', now() - interval '2420206 seconds'),
    ('sw9', 'v2', 'Goedgekeurd', 'Ingepland', 'm4', '', now() - interval '2337406 seconds'),
    ('sw10', 'v2', 'Ingepland', 'Overgedragen aan Freshservice', 'm4', 'Opgepakt als interne wijziging in Freshservice.', now() - interval '1473406 seconds'),
    ('sw11', 'v3', null, 'Ingediend', 'm1', '', now() - interval '2096206 seconds'),
    ('sw12', 'v3', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '1819006 seconds'),
    ('sw13', 'v3', 'In beoordeling', 'Goedgekeurd', 'm4', 'Sluit goed aan bij de ISO 27001-doelen.', now() - interval '1815406 seconds'),
    ('sw14', 'v3', 'Goedgekeurd', 'Ingepland', 'm4', 'Ingepland op basis van de beschikbare capaciteit.', now() - interval '1214206 seconds'),
    ('sw15', 'v4', null, 'Ingediend', 'm2', '', now() - interval '1750606 seconds'),
    ('sw16', 'v4', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '1214206 seconds'),
    ('sw17', 'v4', 'In beoordeling', 'On hold', 'm4', 'Goed idee. We pakken het op zodra de capaciteit voor Q1 bekend is.', now() - interval '1210606 seconds'),
    ('sw18', 'v5', null, 'Ingediend', 'm3', '', now() - interval '1577806 seconds'),
    ('sw19', 'v5', 'Ingediend', 'In beoordeling', 'm5', '', now() - interval '1300606 seconds'),
    ('sw20', 'v5', 'In beoordeling', 'Goedgekeurd', 'm5', 'Akkoord. Inplannen volgt in het volgende stuurgroepoverleg.', now() - interval '1124206 seconds'),
    ('sw21', 'v6', null, 'Ingediend', 'm1', '', now() - interval '1059406 seconds'),
    ('sw22', 'v6', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '609406 seconds'),
    ('sw23', 'v7', null, 'Ingediend', 'm3', '', now() - interval '1405006 seconds'),
    ('sw24', 'v7', 'Ingediend', 'In beoordeling', 'm4', '', now() - interval '1214206 seconds'),
    ('sw25', 'v7', 'In beoordeling', 'Afgewezen', 'm4', 'De monitoring in onze huidige beheertool meet dit al. We laten je graag zien hoe je die hiervoor inzet.', now() - interval '1210606 seconds'),
    ('sw26', 'v8', null, 'Ingediend', 'm3', '', now() - interval '886606 seconds'),
    ('sw27', 'v9', null, 'Ingediend', 'm2', '', now() - interval '368206 seconds'),
    ('sw28', 'v10', null, 'Ingediend', 'm1', '', now() - interval '109006 seconds');
  insert into reactie (id, voorstel_id, afzender_id, tekst, verzonden_op) values
    ('r1', 'v4', 'm2', 'Zal ik alvast een opzet van het rapport maken? Dan kunnen we in Q1 meteen starten.', now() - interval '1142206 seconds'),
    ('r2', 'v4', 'm4', 'Graag. Stuur hem mee in dit gesprek, dan nemen we hem mee bij de herbeoordeling.', now() - interval '1127806 seconds'),
    ('r3', 'v5', 'm5', 'Weet je welk type firewall het is en of er nog support op zit? Dan kan ik de inzet beter inschatten.', now() - interval '1311406 seconds'),
    ('r4', 'v5', 'm3', 'Het is een firewall uit de kleine zakelijke serie; de support loopt nog tot eind volgend jaar. De update kan dus via de normale weg.', now() - interval '1304206 seconds'),
    ('r5', 'v6', 'm4', 'Om hoeveel gedeelde accounts gaat het ongeveer, en wie gebruiken ze?', now() - interval '620206 seconds'),
    ('r6', 'v6', 'm1', 'Het gaat om vier accounts die het hele servicedeskteam deelt. Een wachtwoordmanager gebruiken we daar nog niet.', now() - interval '541006 seconds'),
    ('r7', 'v6', 'm4', 'Helder, dank je. Arjen kijkt of de wachtwoordmanager uit het ISO-traject hiervoor gebruikt kan worden. We bespreken het in het volgende overleg.', now() - interval '105406 seconds');
  insert into notificatie (id, ontvanger_id, voorstel_id, statuswijziging_id, reactie_id, bericht, gelezen, datum) values
    ('n1', 'm2', 'v1', 'sw1', null, 'Bedankt! Je voorstel "MFA verplichten voor beheeraccounts bij klanten" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '3046606 seconds'),
    ('n2', 'm2', 'v1', 'sw2', null, 'Je voorstel "MFA verplichten voor beheeraccounts bij klanten" heeft nu de status "In beoordeling".', true, now() - interval '2855806 seconds'),
    ('n3', 'm2', 'v1', 'sw3', null, 'Je voorstel "MFA verplichten voor beheeraccounts bij klanten" heeft nu de status "Goedgekeurd". Toelichting: Hoge impact op beveiliging. Arjen werkt het advies per klant uit.', true, now() - interval '2852206 seconds'),
    ('n4', 'm2', 'v1', 'sw4', null, 'Je voorstel "MFA verplichten voor beheeraccounts bij klanten" heeft nu de status "Ingepland".', true, now() - interval '2683006 seconds'),
    ('n5', 'm2', 'v1', 'sw5', null, 'Je voorstel "MFA verplichten voor beheeraccounts bij klanten" heeft nu de status "Overgedragen aan Freshservice". Toelichting: Change aangemaakt in Freshservice; uitvoering per klant.', true, now() - interval '2078206 seconds'),
    ('n6', 'm3', 'v2', 'sw6', null, 'Bedankt! Je voorstel "Back-upmeldingen bundelen in één dagrapport" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '2614606 seconds'),
    ('n7', 'm3', 'v2', 'sw7', null, 'Je voorstel "Back-upmeldingen bundelen in één dagrapport" heeft nu de status "In beoordeling".', true, now() - interval '2423806 seconds'),
    ('n8', 'm3', 'v2', 'sw8', null, 'Je voorstel "Back-upmeldingen bundelen in één dagrapport" heeft nu de status "Goedgekeurd".', true, now() - interval '2420206 seconds'),
    ('n9', 'm3', 'v2', 'sw9', null, 'Je voorstel "Back-upmeldingen bundelen in één dagrapport" heeft nu de status "Ingepland".', true, now() - interval '2337406 seconds'),
    ('n10', 'm3', 'v2', 'sw10', null, 'Je voorstel "Back-upmeldingen bundelen in één dagrapport" heeft nu de status "Overgedragen aan Freshservice". Toelichting: Opgepakt als interne wijziging in Freshservice.', true, now() - interval '1473406 seconds'),
    ('n11', 'm1', 'v3', 'sw11', null, 'Bedankt! Je voorstel "Vaste checklist voor onboarding van nieuwe klanten" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '2096206 seconds'),
    ('n12', 'm1', 'v3', 'sw12', null, 'Je voorstel "Vaste checklist voor onboarding van nieuwe klanten" heeft nu de status "In beoordeling".', true, now() - interval '1819006 seconds'),
    ('n13', 'm1', 'v3', 'sw13', null, 'Je voorstel "Vaste checklist voor onboarding van nieuwe klanten" heeft nu de status "Goedgekeurd". Toelichting: Sluit goed aan bij de ISO 27001-doelen.', true, now() - interval '1815406 seconds'),
    ('n14', 'm1', 'v3', 'sw14', null, 'Je voorstel "Vaste checklist voor onboarding van nieuwe klanten" heeft nu de status "Ingepland". Toelichting: Ingepland op basis van de beschikbare capaciteit.', true, now() - interval '1214206 seconds'),
    ('n15', 'm2', 'v4', 'sw15', null, 'Bedankt! Je voorstel "Maandrapport licentiegebruik Microsoft 365" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1750606 seconds'),
    ('n16', 'm2', 'v4', 'sw16', null, 'Je voorstel "Maandrapport licentiegebruik Microsoft 365" heeft nu de status "In beoordeling".', true, now() - interval '1214206 seconds'),
    ('n17', 'm2', 'v4', 'sw17', null, 'Je voorstel "Maandrapport licentiegebruik Microsoft 365" heeft nu de status "On hold". Toelichting: Goed idee. We pakken het op zodra de capaciteit voor Q1 bekend is.', true, now() - interval '1210606 seconds'),
    ('n18', 'm3', 'v5', 'sw18', null, 'Bedankt! Je voorstel "Firmware van firewall bijwerken bij klant" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1577806 seconds'),
    ('n19', 'm3', 'v5', 'sw19', null, 'Je voorstel "Firmware van firewall bijwerken bij klant" heeft nu de status "In beoordeling".', true, now() - interval '1300606 seconds'),
    ('n20', 'm3', 'v5', 'sw20', null, 'Je voorstel "Firmware van firewall bijwerken bij klant" heeft nu de status "Goedgekeurd". Toelichting: Akkoord. Inplannen volgt in het volgende stuurgroepoverleg.', true, now() - interval '1124206 seconds'),
    ('n21', 'm1', 'v6', 'sw21', null, 'Bedankt! Je voorstel "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1059406 seconds'),
    ('n22', 'm1', 'v6', 'sw22', null, 'Je voorstel "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts" heeft nu de status "In beoordeling".', true, now() - interval '609406 seconds'),
    ('n23', 'm3', 'v7', 'sw23', null, 'Bedankt! Je voorstel "Eigen snelheidstest-tool voor klantlocaties" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '1405006 seconds'),
    ('n24', 'm3', 'v7', 'sw24', null, 'Je voorstel "Eigen snelheidstest-tool voor klantlocaties" heeft nu de status "In beoordeling".', true, now() - interval '1214206 seconds'),
    ('n25', 'm3', 'v7', 'sw25', null, 'Je voorstel "Eigen snelheidstest-tool voor klantlocaties" heeft nu de status "Afgewezen". Toelichting: De monitoring in onze huidige beheertool meet dit al. We laten je graag zien hoe je die hiervoor inzet.', true, now() - interval '1210606 seconds'),
    ('n26', 'm3', 'v8', 'sw26', null, 'Bedankt! Je voorstel "Kennisbankartikel voor terugkerende printerstoring" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '886606 seconds'),
    ('n27', 'm2', 'v9', 'sw27', null, 'Bedankt! Je voorstel "Verlopen SSL-certificaten bij klanten automatisch signaleren" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', true, now() - interval '368206 seconds'),
    ('n28', 'm1', 'v10', 'sw28', null, 'Bedankt! Je voorstel "Wekelijkse controle op mislukte Windows-updates" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.', false, now() - interval '109006 seconds'),
    ('n29', 'm4', 'v4', null, 'r1', 'Matthijs van Voorthuizen reageerde bij "Maandrapport licentiegebruik Microsoft 365".', true, now() - interval '1142206 seconds'),
    ('n30', 'm5', 'v4', null, 'r1', 'Matthijs van Voorthuizen reageerde bij "Maandrapport licentiegebruik Microsoft 365".', true, now() - interval '1142206 seconds'),
    ('n31', 'm2', 'v4', null, 'r2', 'Olaf van Heeswijk reageerde bij "Maandrapport licentiegebruik Microsoft 365".', true, now() - interval '1127806 seconds'),
    ('n32', 'm3', 'v5', null, 'r3', 'Arjen Fiechter reageerde bij "Firmware van firewall bijwerken bij klant".', true, now() - interval '1311406 seconds'),
    ('n33', 'm4', 'v5', null, 'r4', 'AnneMirthe Roelofsen reageerde bij "Firmware van firewall bijwerken bij klant".', true, now() - interval '1304206 seconds'),
    ('n34', 'm5', 'v5', null, 'r4', 'AnneMirthe Roelofsen reageerde bij "Firmware van firewall bijwerken bij klant".', true, now() - interval '1304206 seconds'),
    ('n35', 'm1', 'v6', null, 'r5', 'Olaf van Heeswijk reageerde bij "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts".', true, now() - interval '620206 seconds'),
    ('n36', 'm4', 'v6', null, 'r6', 'Theo Silfhout reageerde bij "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts".', true, now() - interval '541006 seconds'),
    ('n37', 'm5', 'v6', null, 'r6', 'Theo Silfhout reageerde bij "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts".', true, now() - interval '541006 seconds'),
    ('n38', 'm1', 'v6', null, 'r7', 'Olaf van Heeswijk reageerde bij "Persoonlijke accounts in plaats van gedeelde servicedesk-accounts".', false, now() - interval '105406 seconds');
  perform setval('voorstel_nr', 10);
  perform setval('beoordeling_nr', 6);
  perform setval('statuswijziging_nr', 28);
  perform setval('notificatie_nr', 38);
  perform setval('reactie_nr', 7);
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

-- Supabase (PostgREST) direct laten weten dat er nieuwe tabellen en functies zijn,
-- anders volgt bij inloggen "Could not find the table ... in the schema cache".
notify pgrst, 'reload schema';
