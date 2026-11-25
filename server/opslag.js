/*
 * Opslag: alle data in één JSON-bestand (data/vbr.json).
 * ------------------------------------------------------
 * Waarom een JSON-bestand en geen database?
 *  - Egency heeft ~20 gebruikers en tientallen voorstellen per jaar: een bestand is ruim voldoende.
 *  - Geen installatie of beheer van een databaseserver nodig, en makkelijk te back-uppen (kopieer het bestand).
 *  - De structuur is precies het datamodel (6 entiteiten), dus goed uit te leggen.
 * Voor de MVP is overstappen naar een echte database (of SharePoint) een bewuste vervolgstap.
 *
 * Schrijven gebeurt "atomair": eerst naar een tijdelijk bestand, dan hernoemen.
 * Zo raakt het bestand niet half beschreven als de server midden in het opslaan stopt.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const VBR = require('../public/js/logica.js');
globalThis.VBR = VBR; // demodata gebruikt VBR.berekenPrioriteit
const maakDemodata = require('../public/js/demodata.js');

function maakOpslag(bestand) {
  let data;
  // Eén schrijfactie tegelijk: wijzigingen worden achter elkaar uitgevoerd (wachtrij).
  let wachtrij = Promise.resolve();

  function laad() {
    try {
      data = JSON.parse(fs.readFileSync(bestand, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`Kan ${bestand} niet lezen: ${e.message}`);
      data = maakDemodata();
      bewaarNu();
    }
  }

  function bewaarNu() {
    fs.mkdirSync(path.dirname(bestand), { recursive: true });
    const tmp = bestand + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, bestand);
  }

  /**
   * Voert een wijziging uit en slaat daarna op. Gaat de wijziging fout (bijv. een bedrijfsregel),
   * dan wordt de vorige toestand teruggezet zodat er nooit halve wijzigingen achterblijven.
   */
  function wijzig(actie) {
    const resultaat = wachtrij.then(async () => {
      const kopie = JSON.stringify(data);
      try {
        const uitkomst = await actie(data);
        bewaarNu();
        return uitkomst;
      } catch (e) {
        data = JSON.parse(kopie);
        throw e;
      }
    });
    wachtrij = resultaat.catch(() => {});
    return resultaat;
  }

  function reset() {
    return wijzig(() => { const nieuw = maakDemodata(); Object.keys(data).forEach(k => delete data[k]); Object.assign(data, nieuw); });
  }

  laad();
  return { lees: () => data, wijzig, reset };
}

module.exports = { maakOpslag };
