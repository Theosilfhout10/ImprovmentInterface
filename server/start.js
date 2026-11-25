/*
 * Startpunt: `npm start`
 * Instellingen komen uit het bestand .env (zie .env.example). Dat bestand staat NIET in GitHub.
 */
'use strict';
const path = require('node:path');

// .env inlezen als het bestaat (ingebouwd in Node.js 20.12+, geen extra pakket nodig).
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (e) { /* geen .env: standaardwaarden */ }
const { maakOpslag } = require('./opslag.js');
const { maakMailer } = require('./mail.js');
const { maakApp } = require('./app.js');

const poort = Number(process.env.PORT) || 3000;
const opslag = maakOpslag(process.env.DATA_BESTAND || path.join(__dirname, '..', 'data', 'vbr.json'));
const mailer = maakMailer(process.env);
const demoModus = process.env.DEMO_MODUS !== 'uit';

maakApp({ opslag, mailer, demoModus }).listen(poort, () => {
  const info = mailer.info();
  console.log(`Verbeterregistratie draait op http://localhost:${poort}`);
  console.log(info.stand === 'gmail'
    ? `E-mail: echt verzenden via Gmail (${info.afzender})${info.testOntvanger ? `, alles naar testadres ${info.testOntvanger}` : ''}`
    : 'E-mail: voorbeeldstand (er wordt niets verzonden). Vul .env in om via Gmail te mailen.');
});
