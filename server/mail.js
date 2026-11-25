/*
 * E-mail: automatische terugkoppeling aan de indiener (R2).
 * ---------------------------------------------------------
 * Twee standen:
 *  1. Gmail (echt verzenden): als GMAIL_USER en GMAIL_APP_PASSWORD in het .env-bestand staan.
 *     Gebruik een app-wachtwoord van een apart Gmail-account, nooit je gewone wachtwoord.
 *  2. Voorbeeldstand: zonder instellingen worden mails NIET verzonden maar bewaard in een
 *     "postvak uit" dat je in de app kunt bekijken. Handig voor demo en tests.
 *
 * MAIL_TEST_ONTVANGER (optioneel): stuur ALLE mails naar dit ene adres, zodat je tijdens
 * het testen nooit per ongeluk echte collega's mailt.
 */
'use strict';
const nodemailer = require('nodemailer');

const MAX_POSTVAK = 50;

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Opmaak van de e-mail: kort, met de status en een link naar de app. */
function maakMail({ naam, voorstelTitel, status, toelichting, isNieuw, appUrl }) {
  const onderwerp = isNieuw
    ? `Ontvangen: ${voorstelTitel}`
    : `Update: "${voorstelTitel}" is nu ${status}`;
  const regels = isNieuw
    ? [`Bedankt voor je verbetervoorstel "${voorstelTitel}".`, 'De stuurgroep bekijkt het in het eerstvolgende wekelijkse overleg. Je krijgt bij elke stap automatisch bericht.']
    : [`Je verbetervoorstel "${voorstelTitel}" heeft een nieuwe status: ${status}.`].concat(toelichting ? [`Toelichting van de stuurgroep: ${toelichting}`] : []);
  const tekst = [`Hoi ${naam},`, '', ...regels, '', `Bekijk je voorstellen: ${appUrl}`, '', 'Groet,', 'Stuurgroep Verbeterregistratie, Egency'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f4fa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a1440">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:14px;padding:24px">
      <p style="margin:0 0 4px;font-size:13px;color:#cb0c36;font-weight:600">Verbeterregistratie</p>
      <h1 style="margin:0 0 16px;font-size:20px">${esc(isNieuw ? 'Voorstel ontvangen' : 'Status: ' + status)}</h1>
      <p style="margin:0 0 12px">Hoi ${esc(naam)},</p>
      ${regels.map(r => `<p style="margin:0 0 12px;line-height:1.5">${esc(r)}</p>`).join('')}
      <p style="margin:20px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#0a1440;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Bekijk je voorstellen</a></p>
    </div>
    <p style="font-size:12px;color:#6b7280;text-align:center;margin:16px 0 0">Automatisch bericht van de Verbeterregistratie van Egency.</p>
  </div></body></html>`;
  return { onderwerp, tekst, html };
}

function maakMailer(env = process.env) {
  const gebruiker = env.GMAIL_USER;
  const wachtwoord = env.GMAIL_APP_PASSWORD;
  const testOntvanger = env.MAIL_TEST_ONTVANGER || '';
  const appUrl = env.APP_URL || 'http://localhost:3000';
  const echt = Boolean(gebruiker && wachtwoord);
  const postvak = [];

  const transport = echt
    ? nodemailer.createTransport({ service: 'gmail', auth: { user: gebruiker, pass: wachtwoord.replace(/\s/g, '') } })
    : null;

  /**
   * Verstuurt (of bewaart) één mail. Geeft de status terug: 'verzonden', 'voorbeeld' of 'mislukt'.
   * Een mislukte mail mag de statuswijziging nooit tegenhouden: het bericht staat altijd ook in de app.
   */
  async function verstuur({ aan, naam, voorstelTitel, status, toelichting, isNieuw }) {
    const mail = maakMail({ naam, voorstelTitel, status, toelichting, isNieuw, appUrl });
    const ontvanger = testOntvanger || aan;
    const item = { aan: ontvanger, oorspronkelijkAan: aan, onderwerp: mail.onderwerp, tekst: mail.tekst, datum: new Date().toISOString() };
    if (!echt) {
      postvak.unshift({ ...item, status: 'voorbeeld' });
      postvak.length = Math.min(postvak.length, MAX_POSTVAK);
      return 'voorbeeld';
    }
    try {
      await transport.sendMail({ from: `"Verbeterregistratie Egency" <${gebruiker}>`, to: ontvanger, subject: mail.onderwerp, text: mail.tekst, html: mail.html });
      postvak.unshift({ ...item, status: 'verzonden' });
      postvak.length = Math.min(postvak.length, MAX_POSTVAK);
      return 'verzonden';
    } catch (e) {
      console.error('[mail] Verzenden mislukt:', e.message);
      postvak.unshift({ ...item, status: 'mislukt', fout: e.message });
      postvak.length = Math.min(postvak.length, MAX_POSTVAK);
      return 'mislukt';
    }
  }

  return {
    verstuur,
    postvak: () => postvak,
    info: () => ({ stand: echt ? 'gmail' : 'voorbeeld', afzender: echt ? gebruiker : null, testOntvanger: testOntvanger || null }),
  };
}

module.exports = { maakMailer, maakMail };
