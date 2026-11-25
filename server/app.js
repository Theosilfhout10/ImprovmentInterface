/*
 * Verbeterregistratie – webserver en API
 * --------------------------------------
 * De server doet drie dingen:
 *  1. De schermen (map public/) aanbieden aan de browser.
 *  2. Een API waarmee de schermen data lezen en wijzigen. Alle bedrijfsregels komen uit
 *     public/js/logica.js: dezelfde code als in de browser, dus regels staan op één plek.
 *  3. Na elke statuswijziging automatisch een e-mail sturen naar de indiener (server/mail.js).
 *
 * Let op (prototype): er is nog geen echte login. De browser geeft mee wie er "ingelogd" is.
 * In de MVP komt hier Microsoft 365-login (Entra ID) voor in de plaats.
 */
'use strict';
const path = require('node:path');
const express = require('express');
const VBR = require('../public/js/logica.js');

function maakApp({ opslag, mailer, demoModus = true }) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));

  // Eenvoudige beveiligingsheaders (geen externe scripts, geen inbedden in andere sites).
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const naamVan = (data, id) => (data.medewerkers.find(m => m.id === id) || {}).naam || '';
  const medewerker = (data, id) => data.medewerkers.find(m => m.id === id);

  /** Stuurt de mail bij een notificatie en legt de mailstatus vast op de notificatie. */
  async function mailNotificatie(notificatieId) {
    const data = opslag.lees();
    const n = data.notificaties.find(x => x.id === notificatieId);
    if (!n) return;
    const ontvanger = medewerker(data, n.ontvangerId);
    const voorstel = data.voorstellen.find(v => v.id === n.voorstelId);
    const sw = data.statuswijzigingen.find(s => s.id === n.statuswijzigingId);
    if (!ontvanger || !voorstel || !sw) return;
    const status = await mailer.verstuur({
      aan: ontvanger.email, naam: ontvanger.naam.split(' ')[0], voorstelTitel: voorstel.titel,
      status: sw.naarStatus, toelichting: sw.toelichting, isNieuw: sw.vanStatus === null,
    });
    await opslag.wijzig(d => { const x = d.notificaties.find(y => y.id === notificatieId); if (x) x.mail = status; });
  }

  // Foutafhandeling: bedrijfsregel-fouten zijn 400 (de gebruiker kan het oplossen).
  const verwerk = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(400).json({ fout: e.message }); }
  };

  /** Controleert dat de opgegeven gebruiker bestaat (prototype-"login"). */
  function gebruikerUit(req) {
    const id = req.get('X-Gebruiker');
    if (!medewerker(opslag.lees(), id)) throw new Error('Onbekende gebruiker. Kies opnieuw wie je bent.');
    return id;
  }

  app.get('/api/data', verwerk(async () => ({ data: opslag.lees(), mail: mailer.info(), demoModus })));

  app.post('/api/voorstellen', verwerk(async req => {
    const indienerId = gebruikerUit(req);
    const voorstel = await opslag.wijzig(d => VBR.dienVoorstelIn(d, req.body || {}, indienerId));
    const n = opslag.lees().notificaties.find(x => x.voorstelId === voorstel.id);
    mailNotificatie(n.id).catch(e => console.error('[mail]', e.message));
    return { voorstel };
  }));

  app.put('/api/voorstellen/:id/beoordeling', verwerk(async req => {
    const id = gebruikerUit(req);
    const beoordeling = await opslag.wijzig(d => VBR.slaBeoordelingOp(d, req.params.id, req.body || {}, id));
    return { beoordeling };
  }));

  app.post('/api/voorstellen/:id/status', verwerk(async req => {
    const id = gebruikerUit(req);
    const { naar, toelichting } = req.body || {};
    const uitkomst = await opslag.wijzig(d => VBR.wijzigStatus(d, req.params.id, naar, id, toelichting));
    mailNotificatie(uitkomst.notificatie.id).catch(e => console.error('[mail]', e.message));
    return { ...uitkomst, indiener: naamVan(opslag.lees(), opslag.lees().voorstellen.find(v => v.id === req.params.id).indienerId) };
  }));

  app.post('/api/notificaties/gelezen', verwerk(async req => {
    const id = gebruikerUit(req);
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    await opslag.wijzig(d => d.notificaties.forEach(n => { if (n.ontvangerId === id && (ids.length === 0 || ids.includes(n.id))) n.gelezen = true; }));
    return { ok: true };
  }));

  // Postvak uit (verstuurde/voorbeeld-mails) en reset zijn alleen bedoeld voor demo en test.
  app.get('/api/postvak', verwerk(async () => {
    if (!demoModus) throw new Error('Niet beschikbaar.');
    return { postvak: mailer.postvak() };
  }));
  app.post('/api/reset', verwerk(async () => {
    if (!demoModus) throw new Error('Niet beschikbaar.');
    await opslag.reset();
    return { ok: true };
  }));

  return app;
}

module.exports = { maakApp };
