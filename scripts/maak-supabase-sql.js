/*
 * Maakt supabase/installatie.sql: het databaseschema (supabase/schema.sql) plus de demodata.
 * De demodata komt uit public/js/demodata.js, zodat de online demo dezelfde voorbeelden toont.
 * Tijden worden opgeslagen als "zoveel seconden geleden", zodat de demo na een reset altijd actueel is.
 *
 * Gebruik: node scripts/maak-supabase-sql.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
globalThis.VBR = require('../public/js/logica.js');
const maakDemodata = require('../public/js/demodata.js');

// De drie demo-accounts (één per rol). Maak in Supabase gebruikers aan met precies deze adressen.
const DEMO_ACCOUNTS = { m1: 'medewerker@verbeterregistratie.test', m4: 'stuurgroep@verbeterregistratie.test', m6: 'management@verbeterregistratie.test' };

const nu = new Date();
const d = maakDemodata(nu);
const q = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const t = iso => `now() - interval '${Math.max(0, Math.round((nu - new Date(iso)) / 1000))} seconds'`;
const nr = id => parseInt(String(id).replace(/^\D+/, ''), 10);

const medewerkers = d.medewerkers.map(m => `(${q(m.id)}, ${q(m.naam)}, ${q(DEMO_ACCOUNTS[m.id] || m.email)}, ${q(m.rol)})`);
const categorieen = d.categorieen.map(c => `(${q(c.id)}, ${q(c.naam)}, ${q(c.omschrijving)})`);
const voorstellen = d.voorstellen.map(v => `(${q(v.id)}, ${q(v.titel)}, ${q(v.omschrijving)}, ${q(v.categorieId)}, ${q(v.klant)}, ${q(v.opbrengst)}, ${q(v.indienerId)}, ${q(v.status)}, ${t(v.ingediendOp)})`);
const beoordelingen = d.beoordelingen.map(b => `(${q(b.id)}, ${q(b.voorstelId)}, ${q(b.beoordelaarId)}, ${q(b.impact)}, ${q(b.urgentie)}, ${q(b.inzet)}, ${b.score}, ${q(b.prioriteit)}, ${q(b.geplandeWeek || '')}, ${q(b.notitie || '')}, ${t(b.datum)})`);
const wijzigingen = d.statuswijzigingen.map(s => `(${q(s.id)}, ${q(s.voorstelId)}, ${q(s.vanStatus)}, ${q(s.naarStatus)}, ${q(s.doorId)}, ${q(s.toelichting)}, ${t(s.datum)})`);
const berichten = d.notificaties.map(n => `(${q(n.id)}, ${q(n.ontvangerId)}, ${q(n.voorstelId)}, ${q(n.statuswijzigingId)}, ${q(n.bericht)}, ${n.gelezen}, ${t(n.datum)})`);
const max = lijst => Math.max(0, ...lijst.map(x => nr(x.id)));

const seed = `-- Demodata (gegenereerd door scripts/maak-supabase-sql.js op ${nu.toISOString().slice(0, 10)}).
create or replace function reset_demo_intern() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from notificatie where true; delete from statuswijziging where true; delete from beoordeling where true; delete from voorstel where true;
  insert into medewerker (id, naam, email, rol) values
    ${medewerkers.join(',\n    ')}
    on conflict (id) do update set naam = excluded.naam, email = excluded.email, rol = excluded.rol;
  insert into categorie (id, naam, omschrijving) values
    ${categorieen.join(',\n    ')}
    on conflict (id) do update set naam = excluded.naam, omschrijving = excluded.omschrijving;
  insert into voorstel (id, titel, omschrijving, categorie_id, klant, opbrengst, indiener_id, status, ingediend_op) values
    ${voorstellen.join(',\n    ')};
  insert into beoordeling (id, voorstel_id, beoordelaar_id, impact, urgentie, inzet, score, prioriteit, gepland_week, notitie, datum) values
    ${beoordelingen.join(',\n    ')};
  insert into statuswijziging (id, voorstel_id, van_status, naar_status, door_id, toelichting, datum) values
    ${wijzigingen.join(',\n    ')};
  insert into notificatie (id, ontvanger_id, voorstel_id, statuswijziging_id, bericht, gelezen, datum) values
    ${berichten.join(',\n    ')};
  perform setval('voorstel_nr', ${max(d.voorstellen)});
  perform setval('beoordeling_nr', ${max(d.beoordelingen)});
  perform setval('statuswijziging_nr', ${max(d.statuswijzigingen)});
  perform setval('notificatie_nr', ${max(d.notificaties)});
end $$;

-- "Demodata herstellen" in de app: iedere ingelogde gebruiker mag dit (alleen bedoeld voor de demo).
create or replace function reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform vereis_medewerker();
  perform reset_demo_intern();
end $$;`;

const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'installatie.sql'), schema.replace('-- @@SEED_FUNCTIES@@', () => seed));
console.log('supabase/installatie.sql gemaakt.');
