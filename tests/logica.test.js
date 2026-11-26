/*
 * Geautomatiseerde tests voor de bedrijfslogica (E5 Test & validatie).
 * Uitvoeren: `node --test tests/` (Node 18 of nieuwer, geen installatie nodig).
 * Elke test verwijst naar de requirement (R-nummer) die hij aantoont.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const VBR = require('../public/js/logica.js');
globalThis.VBR = VBR; // demodata gebruikt VBR.berekenPrioriteit
const maakDemodata = require('../public/js/demodata.js');

const NU = new Date('2026-11-25T12:00:00Z');
const geldig = { titel: 'Back-ups controleren', omschrijving: 'Wekelijkse controle op mislukte back-ups bij klanten.', categorieId: 'c1' };

test('R3 prioriteit: hoog/hoog/laag = Hoog (score 9)', () => {
  assert.deepEqual(VBR.berekenPrioriteit('hoog', 'hoog', 'laag'), { score: 9, prioriteit: 'Hoog' });
});
test('R3 prioriteit: grenswaarden 7=Hoog, 6=Middel, 5=Middel, 4=Laag', () => {
  assert.equal(VBR.berekenPrioriteit('hoog', 'middel', 'middel').prioriteit, 'Hoog');   // 3+2+2=7
  assert.equal(VBR.berekenPrioriteit('middel', 'middel', 'middel').prioriteit, 'Middel'); // 6
  assert.equal(VBR.berekenPrioriteit('laag', 'middel', 'middel').prioriteit, 'Middel'); // 5
  assert.equal(VBR.berekenPrioriteit('laag', 'laag', 'middel').prioriteit, 'Laag');     // 4
  assert.deepEqual(VBR.berekenPrioriteit('laag', 'laag', 'hoog'), { score: 3, prioriteit: 'Laag' });
});
test('R3 prioriteit: ongeldige waarde geeft een fout', () => {
  assert.throws(() => VBR.berekenPrioriteit('heel hoog', 'laag', 'laag'));
});

test('R1 formulier: geldig voorstel heeft geen fouten', () => {
  const d = maakDemodata(NU);
  assert.deepEqual(VBR.valideerVoorstel(geldig, d.categorieen), []);
});
test('R1 formulier: lege titel, korte omschrijving en geen categorie worden geweigerd', () => {
  const d = maakDemodata(NU);
  const fouten = VBR.valideerVoorstel({ titel: ' ', omschrijving: 'kort', categorieId: '' }, d.categorieen);
  assert.equal(fouten.length, 3);
});
test('R1 indienen: voorstel krijgt status Ingediend, historie en ontvangstbevestiging', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  assert.equal(v.status, 'Ingediend');
  assert.equal(d.statuswijzigingen.filter(s => s.voorstelId === v.id).length, 1);
  const n = d.notificaties.filter(x => x.voorstelId === v.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].ontvangerId, 'm1');
});

test('R2 terugkoppeling: elke statuswijziging maakt automatisch een bericht voor de indiener', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm2', NU);
  VBR.wijzigStatus(d, v.id, 'In beoordeling', 'm4', '', NU);
  const berichten = d.notificaties.filter(x => x.voorstelId === v.id && x.ontvangerId === 'm2');
  assert.equal(berichten.length, 2);
  assert.match(berichten[1].bericht, /In beoordeling/);
});
test('R2 statusregels: ongeldige overgang wordt geweigerd', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  assert.throws(() => VBR.wijzigStatus(d, v.id, 'Ingepland', 'm4', '', NU), /kan niet naar/);
});
test('R2 statusregels: afwijzen zonder toelichting wordt geweigerd', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  assert.throws(() => VBR.wijzigStatus(d, v.id, 'Afgewezen', 'm4', '', NU), /toelichting/);
  VBR.wijzigStatus(d, v.id, 'Afgewezen', 'm4', 'Valt buiten de scope.', NU);
  assert.equal(v.status, 'Afgewezen');
});
test('R2 statusregels: goedkeuren kan pas na beoordeling, inplannen pas met geplande week', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  VBR.wijzigStatus(d, v.id, 'In beoordeling', 'm4', '', NU);
  assert.throws(() => VBR.wijzigStatus(d, v.id, 'Goedgekeurd', 'm4', '', NU), /Beoordeel/);
  VBR.slaBeoordelingOp(d, v.id, { impact: 'hoog', urgentie: 'middel', inzet: 'laag' }, 'm4', NU);
  VBR.wijzigStatus(d, v.id, 'Goedgekeurd', 'm4', '', NU);
  assert.throws(() => VBR.wijzigStatus(d, v.id, 'Ingepland', 'm4', '', NU), /geplande week/);
  VBR.slaBeoordelingOp(d, v.id, { impact: 'hoog', urgentie: 'middel', inzet: 'laag', geplandeWeek: '2026-W50' }, 'm4', NU);
  VBR.wijzigStatus(d, v.id, 'Ingepland', 'm4', '', NU);
  assert.equal(v.status, 'Ingepland');
});
test('R3 beoordeling: opnieuw beoordelen werkt de bestaande beoordeling bij (geen dubbele)', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  VBR.slaBeoordelingOp(d, v.id, { impact: 'laag', urgentie: 'laag', inzet: 'hoog' }, 'm4', NU);
  VBR.slaBeoordelingOp(d, v.id, { impact: 'hoog', urgentie: 'hoog', inzet: 'laag' }, 'm5', NU);
  const b = d.beoordelingen.filter(x => x.voorstelId === v.id);
  assert.equal(b.length, 1);
  assert.equal(b[0].prioriteit, 'Hoog');
});
test('R3 beoordeling: ongeldige weeknotatie wordt geweigerd', () => {
  const d = maakDemodata(NU);
  assert.throws(() => VBR.slaBeoordelingOp(d, 'v6', { impact: 'laag', urgentie: 'laag', inzet: 'laag', geplandeWeek: 'week 50' }, 'm4', NU));
});

test('NF2 autorisatie: een medewerker mag niet beoordelen of de status wijzigen', () => {
  const d = maakDemodata(NU);
  const v = VBR.dienVoorstelIn(d, geldig, 'm1', NU);
  assert.throws(() => VBR.wijzigStatus(d, v.id, 'In beoordeling', 'm1', '', NU), /Alleen de stuurgroep/);
  assert.throws(() => VBR.slaBeoordelingOp(d, v.id, { impact: 'hoog', urgentie: 'hoog', inzet: 'laag' }, 'm6', NU), /Alleen de stuurgroep/);
  assert.equal(v.status, 'Ingediend');
});
test('R1 robuustheid: rare invoer (HTML, alleen spaties, extreem lang) wordt veilig afgehandeld', () => {
  const d = maakDemodata(NU);
  assert.ok(VBR.valideerVoorstel({ titel: 'x'.repeat(101), omschrijving: ' '.repeat(50), categorieId: 'c9' }, d.categorieen).length >= 3);
  const v = VBR.dienVoorstelIn(d, { ...geldig, titel: '  <b>Vet</b> idee  ' }, 'm1', NU);
  assert.equal(v.titel, '<b>Vet</b> idee'); // opgeslagen als tekst; het scherm escapet bij tonen
});
test('Performance: dashboard met 1.000 voorstellen rekent binnen 1 seconde', () => {
  const d = maakDemodata(NU);
  for (let i = 0; i < 1000; i++) VBR.dienVoorstelIn(d, { ...geldig, titel: 'Voorstel ' + i }, 'm1', NU);
  const start = Date.now();
  const c = VBR.dashboardCijfers(d, NU);
  assert.equal(c.totaal, 1007);
  assert.ok(Date.now() - start < 1000);
});

test('R4 dashboard: telt totalen en signaleert voorstellen die te lang wachten', () => {
  const d = maakDemodata(NU);
  const c = VBR.dashboardCijfers(d, NU);
  assert.equal(c.totaal, 7);
  assert.equal(c.afgerond, 1);
  assert.equal(c.afgewezen, 1);
  assert.equal(c.open, 5);
  assert.deepEqual(c.teLangOpen.map(v => v.id), ['v6']); // 10 dagen zonder reactie
  assert.ok(c.gemReactieDagen > 0);
});

test('Datamodel: demodata is referentieel consistent (geen verwijzingen naar niet-bestaande records)', () => {
  const d = maakDemodata(NU);
  const ids = lijst => new Set(lijst.map(x => x.id));
  const m = ids(d.medewerkers), c = ids(d.categorieen), v = ids(d.voorstellen), s = ids(d.statuswijzigingen), r = ids(d.reacties);
  d.voorstellen.forEach(x => { assert.ok(m.has(x.indienerId)); assert.ok(c.has(x.categorieId)); });
  d.beoordelingen.forEach(x => { assert.ok(v.has(x.voorstelId)); assert.ok(m.has(x.beoordelaarId)); });
  d.statuswijzigingen.forEach(x => { assert.ok(v.has(x.voorstelId)); assert.ok(m.has(x.doorId)); });
  d.reacties.forEach(x => { assert.ok(v.has(x.voorstelId)); assert.ok(m.has(x.afzenderId)); });
  // Elke notificatie hoort bij precies één aanleiding: een statuswijziging óf een reactie.
  d.notificaties.forEach(x => {
    assert.ok(v.has(x.voorstelId)); assert.ok(m.has(x.ontvangerId));
    assert.ok(x.statuswijzigingId ? s.has(x.statuswijzigingId) && !x.reactieId : r.has(x.reactieId));
  });
  assert.equal(new Set(d.beoordelingen.map(b => b.id)).size, d.beoordelingen.length);
});
test('Hulpfunctie isoWeek geeft het ISO-weeknummer', () => {
  assert.equal(VBR.isoWeek(new Date(2026, 10, 25)), '2026-W48');
  assert.equal(VBR.isoWeek(new Date(2027, 0, 1)), '2026-W53');
});

// ---- Iteratie 5: gesprek per voorstel (R5) ----------------------------------
const MIN = 60000;

test('R7 gesprek: alleen de indiener en de stuurgroep zien het gesprek', () => {
  const d = maakDemodata(NU);           // v3 is ingediend door m3
  assert.equal(VBR.magGesprekZien(d, 'v3', 'm3'), true);   // indiener
  assert.equal(VBR.magGesprekZien(d, 'v3', 'm4'), true);   // stuurgroep
  assert.equal(VBR.magGesprekZien(d, 'v3', 'm1'), false);  // andere medewerker
  assert.equal(VBR.magGesprekZien(d, 'v3', 'm6'), false);  // management
});
test('R7 gesprek: indiener reageert, de hele stuurgroep krijgt een melding', () => {
  const d = maakDemodata(NU);
  const { reactie, notificaties } = VBR.plaatsReactie(d, 'v3', '  Aanvulling: het gaat om twee firewalls.  ', 'm3', NU);
  assert.equal(reactie.tekst, 'Aanvulling: het gaat om twee firewalls.');
  assert.equal(reactie.bewerktOp, null);
  assert.deepEqual(notificaties.map(n => n.ontvangerId).sort(), ['m4', 'm5']);
  assert.ok(notificaties.every(n => n.reactieId === reactie.id && !n.gelezen));
});
test('R7 gesprek: stuurgroep reageert, alleen de indiener krijgt een melding', () => {
  const d = maakDemodata(NU);
  const { notificaties } = VBR.plaatsReactie(d, 'v3', 'Dank, dat helpt.', 'm4', NU);
  assert.deepEqual(notificaties.map(n => n.ontvangerId), ['m3']);
});
test('R7 gesprek: andere medewerkers en management kunnen niet reageren', () => {
  const d = maakDemodata(NU);
  assert.throws(() => VBR.plaatsReactie(d, 'v3', 'Mag ik meepraten?', 'm1', NU), /Alleen de indiener en de stuurgroep/);
  assert.throws(() => VBR.plaatsReactie(d, 'v3', 'Even meelezen', 'm6', NU), /Alleen de indiener en de stuurgroep/);
});
test('R7 gesprek: leeg of te lang bericht wordt geweigerd', () => {
  const d = maakDemodata(NU);
  assert.throws(() => VBR.plaatsReactie(d, 'v3', '   ', 'm3', NU), /Typ eerst een bericht/);
  assert.throws(() => VBR.plaatsReactie(d, 'v3', 'x'.repeat(1001), 'm3', NU), /maximaal 1000 tekens/);
  assert.doesNotThrow(() => VBR.plaatsReactie(d, 'v3', 'x'.repeat(1000), 'm3', NU));
});
test('R7 gesprek: eigen bericht bewerken kan tot 15 minuten na verzenden', () => {
  const d = maakDemodata(NU);
  const { reactie } = VBR.plaatsReactie(d, 'v3', 'Eerste versie', 'm3', NU);
  const b = VBR.bewerkReactie(d, reactie.id, 'Tweede versie', 'm3', new Date(NU.getTime() + 15 * MIN));
  assert.equal(b.tekst, 'Tweede versie');
  assert.ok(b.bewerktOp);
  assert.throws(() => VBR.bewerkReactie(d, reactie.id, 'Te laat', 'm3', new Date(NU.getTime() + 16 * MIN)), /tot 15 minuten/);
  assert.throws(() => VBR.bewerkReactie(d, reactie.id, 'Niet van mij', 'm4', NU), /eigen berichten/);
  assert.equal(d.reacties.find(r => r.id === reactie.id).tekst, 'Tweede versie');
});
test('R7 gesprek: werkt ook met oude data zonder reacties (bestaand databestand)', () => {
  const d = maakDemodata(NU);
  delete d.reacties;
  const { reactie } = VBR.plaatsReactie(d, 'v3', 'Eerste reactie', 'm3', NU);
  assert.equal(reactie.id, 'r1');
});
