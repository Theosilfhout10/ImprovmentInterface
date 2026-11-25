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

    voorstel('v1', 'MFA afdwingen voor beheeraccounts bij klanten',
      'Bij meerdere klanten hebben beheeraccounts nog geen MFA. Voorstel: via Conditional Access MFA verplichten voor alle admin-rollen.',
      'c3', 'Meerdere klanten', 'Lager risico op accountovername; adviestraject bij ca. 8 klanten.', 'm2', 24,
      [
        { naar: 'In beoordeling', door: 'm5', dagen: 21 },
        { naar: 'Goedgekeurd', door: 'm4', dagen: 21, uur: 15, toelichting: 'Hoge impact op beveiliging; Arjen pakt de inhoud op.' },
        { naar: 'Ingepland', door: 'm4', dagen: 20 },
        { naar: 'Overgedragen aan Freshservice', door: 'm4', dagen: 13, toelichting: 'Freshservice-change aangemaakt.' },
      ],
      { impact: 'hoog', urgentie: 'hoog', inzet: 'middel', beoordelaarId: 'm5', geplandeWeek: '', dagen: 21 });

    voorstel('v2', 'Standaard checklist voor onboarding nieuwe klant',
      'Elke engineer doet de onboarding anders. Een vaste checklist voorkomt vergeten stappen zoals back-upcontrole en documentatie.',
      'c2', '', 'Minder nazorgtickets na onboarding, snellere inwerktijd nieuwe collega\'s.', 'm1', 17,
      [
        { naar: 'In beoordeling', door: 'm4', dagen: 14 },
        { naar: 'Goedgekeurd', door: 'm4', dagen: 14, uur: 15 },
        { naar: 'Ingepland', door: 'm4', dagen: 7, toelichting: 'Ingepland op basis van beschikbare capaciteit.' },
      ],
      { impact: 'middel', urgentie: 'middel', inzet: 'laag', geplandeWeek: root.VBR.isoWeek(new Date(nu.getTime() + 7 * 86400000)), dagen: 14 });

    voorstel('v3', 'Verouderde firewall-firmware bij klant',
      'Tijdens een storing zag ik dat de firewall bij deze klant twee major versies achterloopt. Voorstel: upgrade adviseren en inplannen.',
      'c3', 'Klant Bouwbedrijf', 'Advies-uren en kleiner beveiligingsrisico.', 'm3', 9,
      [{ naar: 'In beoordeling', door: 'm5', dagen: 7 }],
      { impact: 'hoog', urgentie: 'middel', inzet: 'laag', beoordelaarId: 'm5', dagen: 7 });

    voorstel('v4', 'Automatische rapportage licentiegebruik M365',
      'Klanten betalen vaak voor ongebruikte licenties. Een maandelijkse rapportage maakt dit zichtbaar en levert adviesgesprekken op.',
      'c1', 'Alle M365-klanten', 'Besparing voor klant, extra adviesomzet voor Egency.', 'm2', 12,
      [{ naar: 'In beoordeling', door: 'm4', dagen: 7 }, { naar: 'On hold', door: 'm4', dagen: 7, uur: 15, toelichting: 'Goed idee, maar eerst capaciteit vrijmaken in Q1.' }],
      { impact: 'middel', urgentie: 'laag', inzet: 'hoog', dagen: 7 });

    voorstel('v5', 'Koffieautomaat vervangen',
      'De koffieautomaat op kantoor is vaak stuk.', 'c2', '', '', 'm3', 15,
      [{ naar: 'Afgewezen', door: 'm4', dagen: 14, toelichting: 'Hoort niet in deze registratie; graag melden bij facilitair.' }]);

    voorstel('v6', 'Wachtwoordbeleid servicedesk-accounts aanscherpen',
      'Gedeelde accounts op de servicedesk gebruiken een zwak wachtwoord dat lang niet gewijzigd is. Voorstel: persoonlijke accounts + wachtwoordmanager.',
      'c3', '', 'Kleiner risico voor Egency, voldoet beter aan ISO 27001.', 'm1', 10, []);

    voorstel('v7', 'Kennisbankartikel voor veelvoorkomende printerstoring',
      'Dezelfde printerstoring komt wekelijks binnen. Een kennisbankartikel scheelt de servicedesk tijd.',
      'c2', '', 'Ca. 1 uur per week tijdwinst op de servicedesk.', 'm2', 2, []);

    return data;
  }

  root.maakDemodata = maakDemodata;
  if (typeof module !== 'undefined' && module.exports) module.exports = maakDemodata;
})(typeof window !== 'undefined' ? window : globalThis);
