/*
 * Demodata voor de prototype-demo.
 * Datums worden berekend vanaf "vandaag", zodat het dashboard altijd actueel oogt.
 * Personen en rollen komen uit de stakeholderanalyse (v0.1, 08-10-2026).
 */
(function (root) {
  'use strict';

  function maakDemodata(nu) {
    nu = nu || new Date();
    const dagenTerug = (d, uur) => {
      const t = new Date(nu.getTime() - d * 86400000);
      t.setHours(uur || 10, 0, 0, 0);
      return t.toISOString();
    };

    const data = {
      versie: 1,
      medewerkers: [
        { id: 'm1', naam: 'Theo Silfhout', email: 'theo@egency.example', rol: 'medewerker' },
        { id: 'm2', naam: 'Matthijs van Voorthuizen', email: 'matthijs@egency.example', rol: 'medewerker' },
        { id: 'm3', naam: 'AnneMirthe Roelofsen', email: 'annemirthe@egency.example', rol: 'medewerker' },
        { id: 'm4', naam: 'Olaf van Heeswijk', email: 'olaf@egency.example', rol: 'stuurgroep' },
        { id: 'm5', naam: 'Arjen Fiechter', email: 'arjen@egency.example', rol: 'stuurgroep' },
        { id: 'm6', naam: 'Haico de Boer', email: 'haico@egency.example', rol: 'management' },
      ],
      categorieen: [
        { id: 'c1', naam: 'Klantomgeving', omschrijving: 'Technische verbetering of adviesmogelijkheid bij een klant' },
        { id: 'c2', naam: 'Intern proces', omschrijving: 'Verbetering van de eigen werkwijze van Egency' },
        { id: 'c3', naam: 'Beveiliging', omschrijving: 'Beveiligingsverbetering bij een klant of bij Egency' },
      ],
      voorstellen: [],
      beoordelingen: [],
      statuswijzigingen: [],
      notificaties: [],
      reacties: [],   // gesprek per voorstel (iteratie 5)
    };

    // Hulpje om een voorstel met historie op te bouwen.
    let swNr = 0, nNr = 0;
    function voorstel(id, titel, omschrijving, cat, klant, opbrengst, indiener, ingediendDagen, historie, beoordeling) {
      const ingediendOp = dagenTerug(ingediendDagen, 9);
      data.voorstellen.push({ id, titel, omschrijving, categorieId: cat, klant, opbrengst, indienerId: indiener, status: 'Ingediend', ingediendOp });
      const log = [{ naar: 'Ingediend', door: indiener, dagen: ingediendDagen, uur: 9, toelichting: '' }].concat(historie || []);
      let van = null;
      log.forEach(h => {
        const datum = dagenTerug(h.dagen, h.uur || 14);
        const sw = { id: 'sw' + (++swNr), voorstelId: id, vanStatus: van, naarStatus: h.naar, doorId: h.door, toelichting: h.toelichting || '', datum };
        data.statuswijzigingen.push(sw);
        data.notificaties.push({
          id: 'n' + (++nNr), ontvangerId: indiener, voorstelId: id, statuswijzigingId: sw.id,
          bericht: van === null
            ? `Bedankt! Je voorstel "${titel}" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.`
            : `Je voorstel "${titel}" heeft nu de status "${h.naar}".` + (h.toelichting ? ` Toelichting: ${h.toelichting}` : ''),
          gelezen: h.dagen > 3, datum,
        });
        van = h.naar;
      });
      data.voorstellen.find(v => v.id === id).status = van;
      if (beoordeling) {
        const p = root.VBR.berekenPrioriteit(beoordeling.impact, beoordeling.urgentie, beoordeling.inzet);
        data.beoordelingen.push(Object.assign({ id: 'b' + (data.beoordelingen.length + 1), voorstelId: id, beoordelaarId: 'm4', notitie: '', geplandeWeek: '', datum: dagenTerug(beoordeling.dagen || 0, 14) }, beoordeling, p));
      }
    }

    // ---- Demoset (vernieuwd 26-11-2026) ----------------------------------------
    // Opbouw voor de demo: elke rol ziet direct iets zinnigs.
    //  - Medewerker (m1, Theo): voorstel ingepland, voorstel in beoordeling met een lopend gesprek
    //    (ongelezen vraag van de stuurgroep) en een vers ingediend voorstel.
    //  - Stuurgroep (m4, Olaf): drie nieuwe voorstellen om te beoordelen, waarvan één al te lang wacht.
    //  - Management (m6, Haico): alle statussen, categorieën en prioriteiten gevuld op het dashboard.
    // Klantnamen zijn bewust algemeen gehouden (geen echte klantgegevens).
    const weekVanaf = dagen => root.VBR.isoWeek(new Date(nu.getTime() + dagen * 86400000));

    voorstel('v1', 'MFA verplichten voor beheeraccounts bij klanten',
      'Bij een aantal klanten kunnen beheeraccounts nog zonder MFA inloggen. Voorstel: via Conditional Access MFA verplichten voor alle beheerdersrollen en dit vastleggen in de standaardinrichting.',
      'c3', 'Meerdere klanten', 'Kleiner risico op accountovername; adviestraject bij ongeveer 8 klanten.', 'm2', 35,
      [
        { naar: 'In beoordeling', door: 'm5', dagen: 33 },
        { naar: 'Goedgekeurd', door: 'm4', dagen: 33, uur: 15, toelichting: 'Hoge impact op beveiliging. Arjen werkt het advies per klant uit.' },
        { naar: 'Ingepland', door: 'm4', dagen: 31 },
        { naar: 'Overgedragen aan Freshservice', door: 'm4', dagen: 24, toelichting: 'Change aangemaakt in Freshservice; uitvoering per klant.' },
      ],
      { impact: 'hoog', urgentie: 'hoog', inzet: 'middel', beoordelaarId: 'm5', geplandeWeek: weekVanaf(-28), dagen: 33 });

    voorstel('v2', 'Back-upmeldingen bundelen in één dagrapport',
      'Elke ochtend komen tientallen losse back-upmails binnen. Eén dagrapport met alleen de mislukte en gewaarschuwde taken maakt de controle sneller en overzichtelijker.',
      'c2', '', 'Ongeveer 30 minuten per dag tijdwinst bij de back-upcontrole.', 'm3', 30,
      [
        { naar: 'In beoordeling', door: 'm4', dagen: 28 },
        { naar: 'Goedgekeurd', door: 'm4', dagen: 28, uur: 15 },
        { naar: 'Ingepland', door: 'm4', dagen: 27 },
        { naar: 'Overgedragen aan Freshservice', door: 'm4', dagen: 17, toelichting: 'Opgepakt als interne wijziging in Freshservice.' },
      ],
      { impact: 'middel', urgentie: 'middel', inzet: 'laag', geplandeWeek: weekVanaf(-21), dagen: 28 });

    voorstel('v3', 'Vaste checklist voor onboarding van nieuwe klanten',
      'Iedere engineer doet de onboarding van een nieuwe klant net anders. Een vaste checklist voorkomt vergeten stappen, zoals de back-upcontrole, documentatie en het overdragen van wachtwoorden.',
      'c2', '', 'Minder nazorgtickets na onboarding en sneller inwerken van nieuwe collega\'s.', 'm1', 24,
      [
        { naar: 'In beoordeling', door: 'm4', dagen: 21 },
        { naar: 'Goedgekeurd', door: 'm4', dagen: 21, uur: 15, toelichting: 'Sluit goed aan bij de ISO 27001-doelen.' },
        { naar: 'Ingepland', door: 'm4', dagen: 14, toelichting: 'Ingepland op basis van de beschikbare capaciteit.' },
      ],
      { impact: 'middel', urgentie: 'middel', inzet: 'laag', geplandeWeek: weekVanaf(7), dagen: 21 });

    voorstel('v4', 'Maandrapport licentiegebruik Microsoft 365',
      'Klanten betalen regelmatig voor licenties die niemand gebruikt. Een maandelijks rapport per klant maakt dit zichtbaar en is een goede aanleiding voor een adviesgesprek.',
      'c1', 'Alle Microsoft 365-klanten', 'Besparing voor de klant en extra adviesuren voor Egency.', 'm2', 20,
      [
        { naar: 'In beoordeling', door: 'm4', dagen: 14 },
        { naar: 'On hold', door: 'm4', dagen: 14, uur: 15, toelichting: 'Goed idee. We pakken het op zodra de capaciteit voor Q1 bekend is.' },
      ],
      { impact: 'middel', urgentie: 'laag', inzet: 'hoog', dagen: 14 });

    voorstel('v5', 'Firmware van firewall bijwerken bij klant',
      'Tijdens een storing zag ik dat de firewall bij deze klant twee hoofdversies achterloopt. Voorstel: de klant adviseren om te upgraden en de update in een onderhoudsvenster in te plannen.',
      'c3', 'Klant in de bouwsector', 'Kleiner beveiligingsrisico voor de klant en enkele adviesuren.', 'm3', 18,
      [
        { naar: 'In beoordeling', door: 'm5', dagen: 15 },
        { naar: 'Goedgekeurd', door: 'm5', dagen: 13, uur: 15, toelichting: 'Akkoord. Inplannen volgt in het volgende stuurgroepoverleg.' },
      ],
      { impact: 'hoog', urgentie: 'middel', inzet: 'laag', beoordelaarId: 'm5', dagen: 13 });

    voorstel('v6', 'Persoonlijke accounts in plaats van gedeelde servicedesk-accounts',
      'Op de servicedesk worden enkele gedeelde accounts gebruikt met een wachtwoord dat al lang niet is gewijzigd. Voorstel: iedereen een persoonlijk account en wachtwoorden opslaan in een wachtwoordmanager.',
      'c3', '', 'Beter te herleiden wie wat doet en beter in lijn met ISO 27001.', 'm1', 12,
      [{ naar: 'In beoordeling', door: 'm4', dagen: 7 }]);

    voorstel('v7', 'Eigen snelheidstest-tool voor klantlocaties',
      'Bij klachten over trage verbindingen meten we nu handmatig. Een eigen tool die op de klantlocatie periodiek de snelheid meet, maakt dit makkelijker.',
      'c1', '', 'Snellere analyse bij klachten over de verbinding.', 'm3', 16,
      [
        { naar: 'In beoordeling', door: 'm4', dagen: 14 },
        { naar: 'Afgewezen', door: 'm4', dagen: 14, uur: 15, toelichting: 'De monitoring in onze huidige beheertool meet dit al. We laten je graag zien hoe je die hiervoor inzet.' },
      ],
      { impact: 'laag', urgentie: 'laag', inzet: 'middel', dagen: 14 });

    voorstel('v8', 'Kennisbankartikel voor terugkerende printerstoring',
      'Dezelfde printerstoring komt bijna elke week binnen bij de servicedesk. Een kennisbankartikel met de vaste oplossing scheelt tijd en klanten kunnen het deels zelf oplossen.',
      'c2', '', 'Ongeveer 1 uur per week tijdwinst op de servicedesk.', 'm3', 10, []);

    voorstel('v9', 'Verlopen SSL-certificaten bij klanten automatisch signaleren',
      'Het komt voor dat een certificaat bij een klant verloopt voordat iemand het merkt. Een automatische controle met een melding 30 dagen vooraf voorkomt storingen.',
      'c1', 'Meerdere klanten', 'Minder storingen en spoedwerk; kans op vervolgopdrachten.', 'm2', 4, []);

    voorstel('v10', 'Wekelijkse controle op mislukte Windows-updates',
      'Mislukte Windows-updates vallen nu pas op als er iets misgaat. Een vaste wekelijkse controle in de beheertool zorgt dat we ze op tijd oppakken.',
      'c1', 'Alle beheerklanten', 'Veiligere werkplekken bij klanten en minder verstoringen.', 'm1', 1, []);

    // Gesprek per voorstel: vragen van de stuurgroep en antwoorden van de indiener.
    // Meldingen volgen dezelfde regel als logica.js: indiener schrijft → stuurgroep, stuurgroep schrijft → indiener.
    function reactie(voorstelId, afzenderId, dagen, uur, tekst) {
      const v = data.voorstellen.find(x => x.id === voorstelId);
      const datum = dagenTerug(dagen, uur);
      const r = { id: 'r' + (data.reacties.length + 1), voorstelId, afzenderId, tekst, verzondenOp: datum, bewerktOp: null };
      data.reacties.push(r);
      const naam = data.medewerkers.find(m => m.id === afzenderId).naam;
      const ontvangers = afzenderId === v.indienerId ? data.medewerkers.filter(m => m.rol === 'stuurgroep').map(m => m.id) : [v.indienerId];
      ontvangers.filter(id => id !== afzenderId).forEach(ontvangerId => data.notificaties.push({
        id: 'n' + (++nNr), ontvangerId, voorstelId, statuswijzigingId: null, reactieId: r.id,
        bericht: `${naam} reageerde bij "${v.titel}".`, gelezen: dagen > 3, datum,
      }));
    }
    reactie('v4', 'm2', 13, 10, 'Zal ik alvast een opzet van het rapport maken? Dan kunnen we in Q1 meteen starten.');
    reactie('v4', 'm4', 13, 14, 'Graag. Stuur hem mee in dit gesprek, dan nemen we hem mee bij de herbeoordeling.');
    reactie('v5', 'm5', 15, 11, 'Weet je welk type firewall het is en of er nog support op zit? Dan kan ik de inzet beter inschatten.');
    reactie('v5', 'm3', 15, 13, 'Het is een firewall uit de kleine zakelijke serie; de support loopt nog tot eind volgend jaar. De update kan dus via de normale weg.');
    reactie('v6', 'm4', 7, 11, 'Om hoeveel gedeelde accounts gaat het ongeveer, en wie gebruiken ze?');
    reactie('v6', 'm1', 6, 9, 'Het gaat om vier accounts die het hele servicedeskteam deelt. Een wachtwoordmanager gebruiken we daar nog niet.');
    reactie('v6', 'm4', 1, 10, 'Helder, dank je. Arjen kijkt of de wachtwoordmanager uit het ISO-traject hiervoor gebruikt kan worden. We bespreken het in het volgende overleg.');

    return data;
  }

  root.maakDemodata = maakDemodata;
  if (typeof module !== 'undefined' && module.exports) module.exports = maakDemodata;
})(typeof window !== 'undefined' ? window : globalThis);
