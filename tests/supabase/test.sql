-- Tests voor de Supabase-database. Elke test faalt met een foutmelding als iets niet klopt.
-- Draait als rol "authenticated" met een nagebootste ingelogde gebruiker (request.jwt.claim.sub).
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'medewerker@verbeterregistratie.test'),
  ('00000000-0000-0000-0000-000000000004', 'stuurgroep@verbeterregistratie.test'),
  ('00000000-0000-0000-0000-000000000006', 'Management@verbeterregistratie.test'),
  ('00000000-0000-0000-0000-000000000009', 'vreemde@voorbeeld.nl');

create or replace function pg_temp.als(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.verwacht_fout(p_sql text, p_tekst text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_tekst in sqlerrm) = 0 then raise exception 'Verkeerde fout: % (verwacht: %)', sqlerrm, p_tekst; end if; return; end;
  raise exception 'Geen fout bij: % (verwacht: %)', p_sql, p_tekst;
end $$;

do $$ begin
  -- Koppeling: trigger koppelt accounts op e-mail (hoofdletterongevoelig); onbekend adres krijgt geen medewerker
  if (select count(*) from medewerker where auth_user_id is not null) <> 3 then raise exception 'Koppeling accounts mislukt'; end if;
  raise notice 'OK koppeling accounts';
end $$;

-- Medewerker dient in
select pg_temp.als('00000000-0000-0000-0000-000000000001');
do $$ declare v voorstel; begin
  v := dien_voorstel_in('Back-ups controleren', 'Wekelijkse controle op mislukte back-ups bij klanten.', 'c1');
  if v.status <> 'Ingediend' or v.indiener_id <> 'm1' then raise exception 'Indienen fout'; end if;
  if (select count(*) from notificatie where voorstel_id = v.id and ontvanger_id = 'm1') <> 1 then raise exception 'Geen ontvangstbericht'; end if;
  perform set_config('vbr.test_voorstel', v.id, false);
  raise notice 'OK R1 indienen + ontvangstbericht (%)', v.id;
end $$;
select pg_temp.verwacht_fout($$select dien_voorstel_in('kort', 'ook te kort', 'c1')$$, 'minimaal 5 tekens');
select pg_temp.verwacht_fout($$select dien_voorstel_in('Goede titel', 'Een omschrijving die lang genoeg is.', 'c9')$$, 'Kies een categorie');
-- Medewerker mag niet beoordelen of status wijzigen, en niet direct schrijven
select pg_temp.verwacht_fout(format($$select wijzig_status(%L, 'In beoordeling')$$, current_setting('vbr.test_voorstel')), 'Alleen de stuurgroep');
select pg_temp.verwacht_fout(format($$select sla_beoordeling_op(%L, 'hoog', 'hoog', 'laag')$$, current_setting('vbr.test_voorstel')), 'Alleen de stuurgroep');
select pg_temp.verwacht_fout($$update voorstel set status = 'Goedgekeurd'$$, 'permission denied');
select pg_temp.verwacht_fout($$insert into notificatie (ontvanger_id, voorstel_id, statuswijziging_id, bericht) values ('m1','v1','sw1','x')$$, 'permission denied');
do $$ begin
  -- Alleen eigen berichten zichtbaar
  if exists (select 1 from notificatie where ontvanger_id <> 'm1') then raise exception 'Berichten van anderen zichtbaar'; end if;
  raise notice 'OK NF2 medewerker: geen beoordelen/status, geen directe schrijfrechten, alleen eigen berichten';
end $$;
reset role;

-- Stuurgroep beoordeelt en wijzigt status
select pg_temp.als('00000000-0000-0000-0000-000000000004');
select pg_temp.verwacht_fout(format($$select wijzig_status(%L, 'Ingepland')$$, current_setting('vbr.test_voorstel')), 'kan niet naar');
select pg_temp.verwacht_fout(format($$select wijzig_status(%L, 'Afgewezen', '')$$, current_setting('vbr.test_voorstel')), 'toelichting');
do $$ declare vid text := current_setting('vbr.test_voorstel'); b beoordeling; begin
  perform wijzig_status(vid, 'In beoordeling');
  begin perform wijzig_status(vid, 'Goedgekeurd'); raise exception 'Goedkeuren zonder beoordeling mocht'; exception when others then if sqlerrm not like 'Beoordeel%' then raise; end if; end;
  b := sla_beoordeling_op(vid, 'hoog', 'middel', 'middel');
  if b.score <> 7 or b.prioriteit <> 'Hoog' then raise exception 'Prioriteit fout: % %', b.score, b.prioriteit; end if;
  b := sla_beoordeling_op(vid, 'laag', 'laag', 'middel');
  if b.prioriteit <> 'Laag' or (select count(*) from beoordeling where voorstel_id = vid) <> 1 then raise exception 'Herbeoordelen fout'; end if;
  perform wijzig_status(vid, 'Goedgekeurd', 'Prima idee');
  begin perform wijzig_status(vid, 'Ingepland'); raise exception 'Inplannen zonder week mocht'; exception when others then if sqlerrm not like '%geplande week%' then raise; end if; end;
  perform sla_beoordeling_op(vid, 'laag', 'laag', 'middel', '2026-W50');
  perform wijzig_status(vid, 'Ingepland');
  if (select status from voorstel where voorstel.id = vid) <> 'Ingepland' then raise exception 'Status niet bijgewerkt'; end if;
  raise notice 'OK R2/R3 statusregels, prioriteit en herbeoordelen';
end $$;
select pg_temp.verwacht_fout(format($$select sla_beoordeling_op(%L, 'laag', 'laag', 'laag', 'week 50')$$, current_setting('vbr.test_voorstel')), 'JJJJ-Wnn');
reset role;

-- Indiener heeft voor elke statuswijziging precies één bericht
do $$ declare vid text := current_setting('vbr.test_voorstel'); begin
  if (select count(*) from statuswijziging where voorstel_id = vid) <> (select count(*) from notificatie where voorstel_id = vid and ontvanger_id = 'm1') then
    raise exception 'Niet elke statuswijziging heeft een bericht'; end if;
  if not exists (select 1 from notificatie where voorstel_id = vid and bericht like '%Toelichting: Prima idee%') then raise exception 'Toelichting ontbreekt in bericht'; end if;
  raise notice 'OK R2 elke statuswijziging geeft een bericht met toelichting';
end $$;

-- Iteratie 5: gesprek per voorstel (privé tussen indiener en stuurgroep)
select pg_temp.als('00000000-0000-0000-0000-000000000001');
do $$ declare vid text := current_setting('vbr.test_voorstel'); r reactie; begin
  r := plaats_reactie(vid, '  Is er al iets bekend over de planning?  ');
  if r.tekst <> 'Is er al iets bekend over de planning?' or r.afzender_id <> 'm1' or r.bewerkt_op is not null then raise exception 'Reactie fout opgeslagen'; end if;
  perform set_config('vbr.test_reactie', r.id, false);
  -- De indiener ziet het gesprek bij een voorstel van iemand anders niet
  if exists (select 1 from reactie where voorstel_id = 'v3') then raise exception 'Gesprek van een ander voorstel zichtbaar'; end if;
  r := bewerk_reactie(r.id, 'Is er al iets bekend over de planning van dit voorstel?');
  if r.bewerkt_op is null or r.tekst not like '%van dit voorstel%' then raise exception 'Bewerken fout'; end if;
  raise notice 'OK R7 indiener reageert en bewerkt binnen 15 minuten; ziet geen gesprekken van anderen';
end $$;
select pg_temp.verwacht_fout($$select plaats_reactie('v3', 'Mag ik meepraten?')$$, 'Alleen de indiener en de stuurgroep');
select pg_temp.verwacht_fout(format($$select plaats_reactie(%L, '   ')$$, current_setting('vbr.test_voorstel')), 'Typ eerst een bericht');
select pg_temp.verwacht_fout(format($$select plaats_reactie(%L, repeat('x', 1001))$$, current_setting('vbr.test_voorstel')), 'maximaal 1000 tekens');
select pg_temp.verwacht_fout($$insert into reactie (voorstel_id, afzender_id, tekst) values ('v3', 'm1', 'x')$$, 'permission denied');
select pg_temp.verwacht_fout(format($$update reactie set tekst = 'x' where id = %L$$, current_setting('vbr.test_reactie')), 'permission denied');
reset role;
do $$ declare vid text := current_setting('vbr.test_voorstel'); begin
  if (select array_agg(ontvanger_id order by ontvanger_id) from notificatie where reactie_id = current_setting('vbr.test_reactie')) <> array['m4','m5'] then
    raise exception 'Reactie van indiener moet naar de hele stuurgroep'; end if;
end $$;

select pg_temp.als('00000000-0000-0000-0000-000000000004');
do $$ declare vid text := current_setting('vbr.test_voorstel'); r reactie; begin
  if (select count(*) from reactie where voorstel_id = 'v3') <> 2 then raise exception 'Stuurgroep ziet niet alle gesprekken'; end if;
  r := plaats_reactie(vid, 'Ja, hij staat gepland voor week 50.');
  perform set_config('vbr.test_reactie2', r.id, false);
  begin perform bewerk_reactie(current_setting('vbr.test_reactie'), 'Gekaapt'); raise exception 'Bericht van een ander bewerken mocht';
  exception when others then if sqlerrm not like '%eigen berichten%' then raise; end if; end;
  raise notice 'OK R7 stuurgroep ziet alle gesprekken, reageert, kan andermans bericht niet bewerken';
end $$;
reset role;
do $$ begin
  if (select array_agg(ontvanger_id) from notificatie where reactie_id = current_setting('vbr.test_reactie2')) <> array['m1'] then
    raise exception 'Reactie van stuurgroep moet alleen naar de indiener'; end if;
  update reactie set verzonden_op = now() - interval '16 minutes' where id = current_setting('vbr.test_reactie');
end $$;
select pg_temp.als('00000000-0000-0000-0000-000000000001');
select pg_temp.verwacht_fout(format($$select bewerk_reactie(%L, 'Te laat')$$, current_setting('vbr.test_reactie')), 'tot 15 minuten');
do $$ begin
  if exists (select 1 from notificatie where ontvanger_id <> 'm1') then raise exception 'Indiener ziet meldingen van anderen'; end if;
  if not exists (select 1 from notificatie where reactie_id = current_setting('vbr.test_reactie2')) then raise exception 'Indiener ziet melding van antwoord niet'; end if;
  raise notice 'OK R7 meldingen naar de juiste partij; bewerken na 15 minuten geweigerd';
end $$;
reset role;
-- Management ziet het gesprek niet en kan niet reageren
select pg_temp.als('00000000-0000-0000-0000-000000000006');
select pg_temp.verwacht_fout(format($$select plaats_reactie(%L, 'Even meelezen')$$, current_setting('vbr.test_voorstel')), 'Alleen de indiener en de stuurgroep');
do $$ begin
  if exists (select 1 from reactie) then raise exception 'Management ziet gesprekken'; end if;
  raise notice 'OK R7 management ziet geen gesprekken';
end $$;
reset role;

-- Management mag niet beoordelen; onbekend account mag niets
select pg_temp.als('00000000-0000-0000-0000-000000000006');
select pg_temp.verwacht_fout($$select wijzig_status('v6', 'In beoordeling')$$, 'Alleen de stuurgroep');
reset role;
select pg_temp.als('00000000-0000-0000-0000-000000000009');
select pg_temp.verwacht_fout($$select dien_voorstel_in('Goede titel', 'Een omschrijving die lang genoeg is.', 'c1')$$, 'niet gekoppeld');
reset role;
-- Niet ingelogd (anon) mag niets lezen of aanroepen
set role anon;
select pg_temp.verwacht_fout($$select * from voorstel$$, 'permission denied');
select pg_temp.verwacht_fout($$select reset_demo()$$, 'permission denied');
reset role;

-- Gelezen markeren en demo resetten
select pg_temp.als('00000000-0000-0000-0000-000000000001');
do $$ begin
  perform markeer_gelezen();
  if exists (select 1 from notificatie where not gelezen) then raise exception 'Niet alles gelezen'; end if;
  perform reset_demo();
  if (select count(*) from voorstel) <> 7 then raise exception 'Reset fout'; end if;
  raise notice 'OK markeer gelezen en demo resetten';
end $$;
reset role;
do $$ declare v voorstel; begin
  perform pg_temp.als('00000000-0000-0000-0000-000000000001');
  v := dien_voorstel_in('Na reset indienen', 'Nieuwe id mag niet botsen met de demodata.', 'c2');
  if v.id <> 'v8' then raise exception 'Volgnummer na reset fout: %', v.id; end if;
  raise notice 'OK volgnummers na reset';
end $$;
