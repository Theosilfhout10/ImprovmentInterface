/*
 * Tests voor de server (API, opslag en e-mail) – iteratie 3.
 * De server draait hier op een willekeurige poort met een tijdelijk databestand
 * en de e-mail in voorbeeldstand: er wordt nooit echt gemaild tijdens tests.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { maakOpslag } = require('../server/opslag.js');
const { maakMailer, maakMail } = require('../server/mail.js');
const { maakApp } = require('../server/app.js');

async function startServer(env = {}) {
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'vbr-'));
  const bestand = path.join(map, 'vbr.json');
  const opslag = maakOpslag(bestand);
  const mailer = maakMailer(env);
  const server = maakApp({ opslag, mailer, demoModus: true }).listen(0);
  await new Promise(r => server.once('listening', r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const api = async (methode, url, gebruiker, body) => {
    const r = await fetch(basis + url, { method: methode, headers: { 'Content-Type': 'application/json', 'X-Gebruiker': gebruiker || '' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json() };
  };
  const wachtOpMail = async aantal => { for (let i = 0; i < 50 && mailer.postvak().length < aantal; i++) await new Promise(r => setTimeout(r, 20)); };
  return { api, bestand, mailer, wachtOpMail, stop: () => new Promise(r => server.close(r)) };
}
const geldig = { titel: 'Back-ups controleren', omschrijving: 'Wekelijkse controle op mislukte back-ups bij klanten.', categorieId: 'c1' };

test('API: data ophalen geeft demodata en mailstand "voorbeeld"', async () => {
  const s = await startServer();
  const r = await s.api('GET', '/api/data');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.voorstellen.length, 10);
  assert.equal(r.json.mail.stand, 'voorbeeld');
  await s.stop();
});

test('R1+R2 API: indienen slaat op in het bestand en stuurt een ontvangstmail', async () => {
  const s = await startServer();
  const r = await s.api('POST', '/api/voorstellen', 'm1', geldig);
  assert.equal(r.status, 200);
  const opgeslagen = JSON.parse(fs.readFileSync(s.bestand, 'utf8'));
  assert.ok(opgeslagen.voorstellen.some(v => v.id === r.json.voorstel.id));
  await s.wachtOpMail(1);
  assert.equal(s.mailer.postvak()[0].aan, 'theo@egency.example');
  assert.match(s.mailer.postvak()[0].onderwerp, /Ontvangen/);
  await s.stop();
});

test('R2 API: statuswijziging door de stuurgroep mailt de indiener met de toelichting', async () => {
  const s = await startServer();
  const v = (await s.api('POST', '/api/voorstellen', 'm2', geldig)).json.voorstel;
  const r = await s.api('POST', `/api/voorstellen/${v.id}/status`, 'm4', { naar: 'Afgewezen', toelichting: 'Loopt al via een ander project.' });
  assert.equal(r.status, 200);
  await s.wachtOpMail(2);
  const mail = s.mailer.postvak()[0];
  assert.equal(mail.aan, 'matthijs@egency.example');
  assert.match(mail.tekst, /Afgewezen/);
  assert.match(mail.tekst, /Loopt al via een ander project/);
  const n = (await s.api('GET', '/api/data')).json.data.notificaties.find(x => x.statuswijzigingId === r.json.statuswijziging.id);
  assert.equal(n.mail, 'voorbeeld');
  await s.stop();
});

test('NF2 API: medewerker kan geen status wijzigen; onbekende gebruiker wordt geweigerd', async () => {
  const s = await startServer();
  const r1 = await s.api('POST', '/api/voorstellen/v8/status', 'm1', { naar: 'In beoordeling' });
  assert.equal(r1.status, 400);
  assert.match(r1.json.fout, /Alleen de stuurgroep/);
  const r2 = await s.api('POST', '/api/voorstellen', 'onbekend', geldig);
  assert.equal(r2.status, 400);
  await s.stop();
});

test('Opslag: een geweigerde wijziging laat geen halve data achter', async () => {
  const s = await startServer();
  const voor = fs.readFileSync(s.bestand, 'utf8');
  const r = await s.api('POST', '/api/voorstellen/v8/status', 'm4', { naar: 'Afgewezen', toelichting: '' });
  assert.equal(r.status, 400);
  assert.equal(fs.readFileSync(s.bestand, 'utf8'), voor);
  assert.equal((await s.api('GET', '/api/data')).json.data.voorstellen.find(v => v.id === 'v8').status, 'Ingediend');
  await s.stop();
});

test('Mail: MAIL_TEST_ONTVANGER stuurt alles naar het testadres', async () => {
  const s = await startServer({ MAIL_TEST_ONTVANGER: 'test@voorbeeld.nl' });
  await s.api('POST', '/api/voorstellen', 'm3', geldig);
  await s.wachtOpMail(1);
  assert.equal(s.mailer.postvak()[0].aan, 'test@voorbeeld.nl');
  assert.equal(s.mailer.postvak()[0].oorspronkelijkAan, 'annemirthe@egency.example');
  await s.stop();
});

test('NF2 Mail: HTML in een titel wordt in de e-mail ge-escaped', () => {
  const m = maakMail({ naam: 'Theo', voorstelTitel: '<script>x</script>', status: 'Goedgekeurd', toelichting: '', isNieuw: false, appUrl: 'http://localhost:3000' });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
});

test('Mail: zonder Gmail-instellingen staat de mailer in voorbeeldstand', () => {
  assert.equal(maakMailer({}).info().stand, 'voorbeeld');
  assert.equal(maakMailer({ GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }).info().stand, 'gmail');
});

test('R7 API: gesprek per voorstel, met meldingen en bewerken', async () => {
  const s = await startServer();
  const r = await s.api('POST', '/api/voorstellen/v5/reacties', 'm4', { tekst: 'Welke versie draait er nu?' });
  assert.equal(r.status, 200);
  const data = (await s.api('GET', '/api/data')).json.data;
  assert.ok(data.notificaties.some(n => n.reactieId === r.json.reactie.id && n.ontvangerId === 'm3'));
  const bewerkt = await s.api('PUT', `/api/reacties/${r.json.reactie.id}`, 'm4', { tekst: 'Welke firmwareversie draait er nu?' });
  assert.equal(bewerkt.status, 200);
  assert.ok(bewerkt.json.reactie.bewerktOp);
  const vreemd = await s.api('POST', '/api/voorstellen/v5/reacties', 'm1', { tekst: 'Mag ik meepraten?' });
  assert.equal(vreemd.status, 400);
  assert.match(vreemd.json.fout, /Alleen de indiener en de stuurgroep/);
  assert.equal((await s.api('PUT', `/api/reacties/${r.json.reactie.id}`, 'm3', { tekst: 'x' })).status, 400);
  assert.equal(s.mailer.postvak().length, 0); // reacties sturen (nog) geen e-mail
  await s.stop();
});
