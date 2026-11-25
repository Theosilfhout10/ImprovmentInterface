/*
 * Verbeterregistratie (VBR) – bedrijfslogica
 * ------------------------------------------
 * Dit bestand bevat ALLEEN de regels van het proces, zonder schermen.
 * Daardoor is het los te testen (zie tests/logica.test.js) en makkelijk uit te leggen.
 *
 * Datamodel (6 entiteiten, zie ERD in de documentatie):
 *   Medewerker, Categorie, Voorstel, Beoordeling, Statuswijziging, Notificatie
 */
(function (root) {
  'use strict';

  // ---- Vaste waarden -------------------------------------------------------

  /** Schaal voor impact, urgentie en inzet (eis uit projectplan: laag/middel/hoog). */
  const NIVEAUS = { laag: 1, middel: 2, hoog: 3 };

  /** Alle statussen die een voorstel kan hebben, in procesvolgorde. */
  const STATUSSEN = [
    'Ingediend',
    'In beoordeling',
    'On hold',
    'Goedgekeurd',
    'Ingepland',
    'Overgedragen aan Freshservice',
    'Afgewezen',
  ];

  /**
   * Toegestane statusovergangen (toestandsdiagram).
   * Afgewezen en Overgedragen zijn eindstatussen: daarna gebeurt er in deze app niets meer,
   * de uitvoering loopt via Freshservice (buiten scope).
   */
  const OVERGANGEN = {
    'Ingediend': ['In beoordeling', 'Afgewezen'],
    'In beoordeling': ['Goedgekeurd', 'Afgewezen', 'On hold'],
    'On hold': ['In beoordeling', 'Afgewezen'],
    'Goedgekeurd': ['Ingepland'],
    'Ingepland': ['Overgedragen aan Freshservice'],
    'Overgedragen aan Freshservice': [],
    'Afgewezen': [],
  };

  /** Statussen die nog werk vragen van de stuurgroep (voor het dashboard). */
  const OPEN_STATUSSEN = ['Ingediend', 'In beoordeling', 'On hold', 'Goedgekeurd', 'Ingepland'];

  /** Max. aantal dagen dat een voorstel zonder beoordeling mag liggen (wekelijks overleg + marge). */
  const MAX_DAGEN_ZONDER_REACTIE = 7;

  // ---- Prioritering ----------------------------------------------------------

  /**
   * Berekent de prioriteit uit impact, urgentie en inzet.
   * Hoge impact en urgentie verhogen de score; veel benodigde inzet verlaagt hem.
   *   score = impact + urgentie + (4 - inzet)   → bereik 3 t/m 9
   *   7–9 = Hoog, 5–6 = Middel, 3–4 = Laag
   * @returns {{score:number, prioriteit:string}}
   */
  function berekenPrioriteit(impact, urgentie, inzet) {
    const i = NIVEAUS[impact], u = NIVEAUS[urgentie], z = NIVEAUS[inzet];
    if (!i || !u || !z) throw new Error('Impact, urgentie en inzet moeten laag, middel of hoog zijn.');
    const score = i + u + (4 - z);
    const prioriteit = score >= 7 ? 'Hoog' : score >= 5 ? 'Middel' : 'Laag';
    return { score, prioriteit };
  }

  // ---- Validatie van het indieningsformulier ---------------------------------

  /**
   * Controleert het indieningsformulier (max. 5 velden, eis uit projectplan).
   * Verplicht: titel, omschrijving, categorie. Optioneel: klant, verwachte opbrengst.
   * @returns {string[]} lijst met foutmeldingen (leeg = geldig)
   */
  function valideerVoorstel(invoer, categorieen) {
    const fouten = [];
    const titel = (invoer.titel || '').trim();
    const omschrijving = (invoer.omschrijving || '').trim();
    if (titel.length < 5) fouten.push('Geef een titel van minimaal 5 tekens.');
    if (titel.length > 100) fouten.push('De titel mag maximaal 100 tekens zijn.');
    if (omschrijving.length < 20) fouten.push('Beschrijf het voorstel in minimaal 20 tekens.');
    if (omschrijving.length > 2000) fouten.push('De omschrijving mag maximaal 2000 tekens zijn.');
    if (!categorieen.some(c => c.id === invoer.categorieId)) fouten.push('Kies een categorie.');
    if ((invoer.klant || '').length > 100) fouten.push('De klantnaam mag maximaal 100 tekens zijn.');
    if ((invoer.opbrengst || '').length > 500) fouten.push('De verwachte opbrengst mag maximaal 500 tekens zijn.');
    return fouten;
  }

  // ---- Autorisatie ------------------------------------------------------------

  /**
   * Alleen stuurgroepleden mogen beoordelen en de status wijzigen (NF2).
   * De controle staat bewust in de logica en niet alleen in de schermen:
   * een verborgen knop is geen beveiliging.
   */
  function controleerStuurgroep(data, medewerkerId) {
    const m = data.medewerkers.find(x => x.id === medewerkerId);
    if (!m || m.rol !== 'stuurgroep') throw new Error('Alleen de stuurgroep mag voorstellen beoordelen of de status wijzigen.');
  }

  // ---- Statuswijziging + automatische terugkoppeling --------------------------

  /** Mag een voorstel van status 'van' naar status 'naar'? */
  function magOvergaan(van, naar) {
    return (OVERGANGEN[van] || []).includes(naar);
  }

  /**
   * Voert een statuswijziging uit op de data en maakt AUTOMATISCH een notificatie
   * voor de indiener aan (kernfunctionaliteit 2: gegarandeerde terugkoppeling).
   * Bedrijfsregels:
   *  - alleen de stuurgroep;
   *  - alleen toegestane overgangen;
   *  - bij Afgewezen of On hold is een toelichting verplicht (indiener moet weten waarom);
   *  - Goedgekeurd kan alleen als er een beoordeling is;
   *  - Ingepland kan alleen met een geplande week.
   * @returns {{statuswijziging:object, notificatie:object}}
   */
  function wijzigStatus(data, voorstelId, naar, doorId, toelichting, nu) {
    controleerStuurgroep(data, doorId);
    const voorstel = data.voorstellen.find(v => v.id === voorstelId);
    if (!voorstel) throw new Error('Voorstel niet gevonden.');
    const van = voorstel.status;
    if (!magOvergaan(van, naar)) throw new Error(`Status "${van}" kan niet naar "${naar}".`);
    const tekst = (toelichting || '').trim();
    if ((naar === 'Afgewezen' || naar === 'On hold') && tekst.length < 5) {
      throw new Error('Geef een toelichting, zodat de indiener weet waarom.');
    }
    const beoordeling = data.beoordelingen.find(b => b.voorstelId === voorstelId);
    if (naar === 'Goedgekeurd' && !beoordeling) {
      throw new Error('Beoordeel het voorstel eerst op impact, urgentie en inzet.');
    }
    if (naar === 'Ingepland' && !(beoordeling && beoordeling.geplandeWeek)) {
      throw new Error('Vul eerst de geplande week in bij de beoordeling.');
    }

    const tijd = (nu || new Date()).toISOString();
    voorstel.status = naar;

    const statuswijziging = {
      id: nieuwId('sw', data.statuswijzigingen),
      voorstelId, vanStatus: van, naarStatus: naar, doorId, toelichting: tekst, datum: tijd,
    };
    data.statuswijzigingen.push(statuswijziging);

    const notificatie = {
      id: nieuwId('n', data.notificaties),
      ontvangerId: voorstel.indienerId,
      voorstelId,
      statuswijzigingId: statuswijziging.id,
      bericht: `Je voorstel "${voorstel.titel}" heeft nu de status "${naar}".` + (tekst ? ` Toelichting: ${tekst}` : ''),
      gelezen: false,
      datum: tijd,
    };
    data.notificaties.push(notificatie);
    return { statuswijziging, notificatie };
  }

  /**
   * Legt een nieuw voorstel vast + de eerste statuswijziging ("Ingediend")
   * + een ontvangstbevestiging aan de indiener.
   */
  function dienVoorstelIn(data, invoer, indienerId, nu) {
    const fouten = valideerVoorstel(invoer, data.categorieen);
    if (fouten.length) throw new Error(fouten.join(' '));
    const tijd = (nu || new Date()).toISOString();
    const voorstel = {
      id: nieuwId('v', data.voorstellen),
      titel: invoer.titel.trim(),
      omschrijving: invoer.omschrijving.trim(),
      categorieId: invoer.categorieId,
      klant: (invoer.klant || '').trim(),
      opbrengst: (invoer.opbrengst || '').trim(),
      indienerId,
      status: 'Ingediend',
      ingediendOp: tijd,
    };
    data.voorstellen.push(voorstel);
    const sw = {
      id: nieuwId('sw', data.statuswijzigingen),
      voorstelId: voorstel.id, vanStatus: null, naarStatus: 'Ingediend', doorId: indienerId, toelichting: '', datum: tijd,
    };
    data.statuswijzigingen.push(sw);
    data.notificaties.push({
      id: nieuwId('n', data.notificaties),
      ontvangerId: indienerId, voorstelId: voorstel.id, statuswijzigingId: sw.id,
      bericht: `Bedankt! Je voorstel "${voorstel.titel}" is ontvangen. De stuurgroep beoordeelt het in het eerstvolgende wekelijkse overleg.`,
      gelezen: false, datum: tijd,
    });
    return voorstel;
  }

  /**
   * Slaat de beoordeling van de stuurgroep op (1 beoordeling per voorstel, wordt bijgewerkt).
   * De prioriteit wordt altijd berekend, nooit handmatig ingevuld: zo is hij uitlegbaar.
   */
  function slaBeoordelingOp(data, voorstelId, invoer, beoordelaarId, nu) {
    controleerStuurgroep(data, beoordelaarId);
    if (!data.voorstellen.some(v => v.id === voorstelId)) throw new Error('Voorstel niet gevonden.');
    const { score, prioriteit } = berekenPrioriteit(invoer.impact, invoer.urgentie, invoer.inzet);
    if (invoer.geplandeWeek && !/^\d{4}-W\d{2}$/.test(invoer.geplandeWeek)) {
      throw new Error('Geplande week heeft het formaat JJJJ-Wnn, bijv. 2026-W50.');
    }
    const tijd = (nu || new Date()).toISOString();
    let b = data.beoordelingen.find(x => x.voorstelId === voorstelId);
    if (!b) {
      b = { id: nieuwId('b', data.beoordelingen), voorstelId };
      data.beoordelingen.push(b);
    }
    Object.assign(b, {
      beoordelaarId, impact: invoer.impact, urgentie: invoer.urgentie, inzet: invoer.inzet,
      score, prioriteit, geplandeWeek: invoer.geplandeWeek || '', notitie: (invoer.notitie || '').trim(), datum: tijd,
    });
    return b;
  }

  // ---- Dashboard -------------------------------------------------------------

  /** Verzamelt de kengetallen voor het management-dashboard (kernfunctionaliteit 3). */
  function dashboardCijfers(data, nu) {
    const nuMs = (nu || new Date()).getTime();
    const dag = 24 * 3600 * 1000;
    const v = data.voorstellen;
    const perStatus = Object.fromEntries(STATUSSEN.map(s => [s, 0]));
    v.forEach(x => { perStatus[x.status] = (perStatus[x.status] || 0) + 1; });

    const perCategorie = data.categorieen.map(c => ({ naam: c.naam, aantal: v.filter(x => x.categorieId === c.id).length }));

    const perPrioriteit = { Hoog: 0, Middel: 0, Laag: 0, 'Nog niet beoordeeld': 0 };
    v.filter(x => OPEN_STATUSSEN.includes(x.status)).forEach(x => {
      const b = data.beoordelingen.find(y => y.voorstelId === x.id);
      perPrioriteit[b ? b.prioriteit : 'Nog niet beoordeeld']++;
    });

    // Doorlooptijd: van indienen tot de eerste reactie van de stuurgroep.
    const reactietijden = v.map(x => {
      const eerste = data.statuswijzigingen
        .filter(s => s.voorstelId === x.id && s.vanStatus !== null)
        .sort((a, b) => a.datum.localeCompare(b.datum))[0];
      return eerste ? (new Date(eerste.datum) - new Date(x.ingediendOp)) / dag : null;
    }).filter(t => t !== null);
    const gemReactieDagen = reactietijden.length
      ? Math.round((reactietijden.reduce((a, b) => a + b, 0) / reactietijden.length) * 10) / 10
      : null;

    // Signaal: ingediend maar al te lang geen reactie (bewaakt het wekelijkse overleg).
    const teLangOpen = v.filter(x => x.status === 'Ingediend' && (nuMs - new Date(x.ingediendOp).getTime()) / dag > MAX_DAGEN_ZONDER_REACTIE);

    return {
      totaal: v.length,
      open: v.filter(x => OPEN_STATUSSEN.includes(x.status)).length,
      afgerond: perStatus['Overgedragen aan Freshservice'],
      afgewezen: perStatus['Afgewezen'],
      perStatus, perCategorie, perPrioriteit, gemReactieDagen, teLangOpen,
    };
  }

  // ---- Hulpfuncties ----------------------------------------------------------

  /** Maakt een oplopend id zoals v12, op basis van de hoogste bestaande waarde. */
  function nieuwId(prefix, lijst) {
    const max = lijst.reduce((m, x) => Math.max(m, parseInt(String(x.id).slice(prefix.length), 10) || 0), 0);
    return prefix + (max + 1);
  }

  /** ISO-weeknummer (JJJJ-Wnn) van een datum, voor de standaardwaarde van "geplande week". */
  function isoWeek(datum) {
    const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
    const dagNr = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dagNr);
    const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - jaarStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  const VBR = {
    NIVEAUS, STATUSSEN, OVERGANGEN, OPEN_STATUSSEN, MAX_DAGEN_ZONDER_REACTIE,
    berekenPrioriteit, valideerVoorstel, magOvergaan, controleerStuurgroep, wijzigStatus, dienVoorstelIn,
    slaBeoordelingOp, dashboardCijfers, nieuwId, isoWeek,
  };

  // Werkt zowel in de browser (window.VBR) als in Node (voor de tests).
  if (typeof module !== 'undefined' && module.exports) module.exports = VBR;
  else root.VBR = VBR;
})(typeof window !== 'undefined' ? window : globalThis);
