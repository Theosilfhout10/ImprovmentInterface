/*
 * Verbeterregistratie (VBR) – schermen en interactie
 * --------------------------------------------------
 * Opbouw:
 *   1. Gegevensbron (adapter)  – praat met de server, of werkt los in de browser (demo/preview)
 *   2. Hulpfuncties            – o.a. veilig tonen van tekst (escapen tegen XSS)
 *   3. Navigatie per rol       – welk menu ziet wie
 *   4. Schermen                – Nieuw voorstel, Mijn voorstellen, Beoordelen, Dashboard, Gesprekken
 *   5. Vensters                – voorstel (bekijken, gesprek, beoordelen, status), berichten, verzonden e-mails
 *
 * De procesregels staan in logica.js (VBR.*). Dit bestand roept die alleen aan.
 */
(function () {
  'use strict';

  // ===== 1. Gegevensbron ====================================================
  /*
   * Adapter-patroon: de schermen roepen altijd dezelfde functies aan (bron.dienIn, bron.wijzigStatus, ...).
   *  - ServerBron: de echte situatie. Data staat op de server, e-mails gaan via de server.
   *  - SupabaseBron: de online versie (GitHub Pages) met echte accounts. Data staat in een gedeelde
   *    Supabase-database, wijzigingen komen live binnen op alle apparaten. De bedrijfsregels en
   *    rolcontrole zitten in de database zelf (supabase/schema.sql), niet alleen in de browser.
   *  - LokaleBron: als er geen server en geen Supabase is (bestand los geopend of de preview). Data
   *    staat dan alleen in deze browser en er wordt niets gemaild.
   */
  const GEBRUIKER_SLEUTEL = 'vbr-gebruiker';
  const OPSLAG_SLEUTEL = 'vbr-data-v1';

  function ServerBron() {
    async function vraag(methode, url, body) {
      const antwoord = await fetch(url, {
        method: methode,
        headers: { 'Content-Type': 'application/json', 'X-Gebruiker': huidigeGebruikerId || '' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await antwoord.json().catch(() => ({}));
      if (!antwoord.ok) throw new Error(json.fout || 'Er ging iets mis. Probeer het opnieuw.');
      return json;
    }
    return {
      soort: 'server',
      async laad() { const r = await vraag('GET', 'api/data'); return { data: r.data, mail: r.mail, demoModus: r.demoModus }; },
      dienIn: invoer => vraag('POST', 'api/voorstellen', invoer).then(r => r.voorstel),
      beoordeel: (id, invoer) => vraag('PUT', `api/voorstellen/${encodeURIComponent(id)}/beoordeling`, invoer),
      wijzigStatus: (id, naar, toelichting) => vraag('POST', `api/voorstellen/${encodeURIComponent(id)}/status`, { naar, toelichting }),
      markeerGelezen: ids => vraag('POST', 'api/notificaties/gelezen', { ids }),
      reageer: (id, tekst) => vraag('POST', `api/voorstellen/${encodeURIComponent(id)}/reacties`, { tekst }).then(r => r.reactie),
      bewerkReactie: (id, tekst) => vraag('PUT', `api/reacties/${encodeURIComponent(id)}`, { tekst }).then(r => r.reactie),
      postvak: () => vraag('GET', 'api/postvak').then(r => r.postvak),
      reset: () => vraag('POST', 'api/reset'),
    };
  }

  function LokaleBron() {
    let lokaal;
    try { lokaal = JSON.parse(localStorage.getItem(OPSLAG_SLEUTEL)); } catch (e) { lokaal = null; }
    if (!lokaal || !lokaal.medewerkers) lokaal = maakDemodata();
    const bewaar = () => { try { localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(lokaal)); } catch (e) { /* geen opslag: prima voor een preview */ } };
    // Zelfde regels als op de server; bij een fout wordt niets opgeslagen.
    const veilig = actie => { const kopie = JSON.stringify(lokaal); try { const r = actie(); bewaar(); return Promise.resolve(r); } catch (e) { lokaal = JSON.parse(kopie); return Promise.reject(e); } };
    return {
      soort: 'lokaal',
      laad: async () => ({ data: JSON.parse(JSON.stringify(lokaal)), mail: { stand: 'geen' }, demoModus: true }),
      dienIn: invoer => veilig(() => VBR.dienVoorstelIn(lokaal, invoer, huidigeGebruikerId)),
      beoordeel: (id, invoer) => veilig(() => VBR.slaBeoordelingOp(lokaal, id, invoer, huidigeGebruikerId)),
      wijzigStatus: (id, naar, toelichting) => veilig(() => VBR.wijzigStatus(lokaal, id, naar, huidigeGebruikerId, toelichting)),
      markeerGelezen: ids => veilig(() => lokaal.notificaties.forEach(n => { if (n.ontvangerId === huidigeGebruikerId && (!ids.length || ids.includes(n.id))) n.gelezen = true; })),
      reageer: (id, tekst) => veilig(() => VBR.plaatsReactie(lokaal, id, tekst, huidigeGebruikerId).reactie),
      bewerkReactie: (id, tekst) => veilig(() => VBR.bewerkReactie(lokaal, id, tekst, huidigeGebruikerId)),
      postvak: async () => [],
      reset: () => veilig(() => { lokaal = maakDemodata(); }),
    };
  }

  // Officiële Supabase-bibliotheek (UMD-build, MIT-licentie), meegeleverd zodat de app niet van een CDN afhangt.
  const SUPABASE_JS = 'js/vendor/supabase-2.86.2.js';
  const LIVE_TABELLEN = ['voorstel', 'beoordeling', 'statuswijziging', 'notificatie', 'reactie'];

  function laadScript(src) {
    return new Promise((klaar, mislukt) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = klaar;
      s.onerror = () => mislukt(new Error('De verbinding met de database kon niet worden geladen. Controleer je internetverbinding.'));
      document.head.appendChild(s);
    });
  }

  /** Vertaalt technische foutmeldingen naar begrijpelijk Nederlands. Meldingen uit de database zijn al Nederlands. */
  function vertaalFout(fout) {
    const m = (fout && fout.message) || String(fout || '');
    if (/invalid login credentials/i.test(m)) return 'E-mailadres of wachtwoord klopt niet.';
    if (/email not confirmed/i.test(m)) return 'Dit account is nog niet bevestigd. Vink bij het aanmaken "Auto Confirm User" aan.';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Geen verbinding met de database. Controleer je internetverbinding.';
    if (/jwt/i.test(m)) return 'Je sessie is verlopen. Log opnieuw in.';
    return m || 'Er ging iets mis. Probeer het opnieuw.';
  }

  async function SupabaseBron(config) {
    if (!window.supabase) await laadScript(SUPABASE_JS);
    const sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const controleer = ({ data: d, error }) => { if (error) throw new Error(vertaalFout(error)); return d; };
    const rpc = (naam, args) => sb.rpc(naam, args).then(controleer);
    const lees = (tabel, kolommen) => sb.from(tabel).select(kolommen || '*').then(controleer);
    // De database gebruikt snake_case (ingediend_op), de app camelCase (ingediendOp); tijden als ISO-tekst.
    const naarApp = rij => {
      const uit = {};
      Object.entries(rij).forEach(([k, w]) => { uit[k.replace(/_([a-z])/g, (_, l) => l.toUpperCase())] = w; });
      ['datum', 'ingediendOp', 'verzondenOp', 'bewerktOp'].forEach(k => { if (uit[k]) uit[k] = new Date(uit[k]).toISOString(); });
      return uit;
    };
    let kanaal = null;
    return {
      soort: 'supabase',
      async sessie() { const { data: d } = await sb.auth.getSession(); return d.session; },
      async login(email, wachtwoord) { controleer(await sb.auth.signInWithPassword({ email, password: wachtwoord })); },
      async uitloggen() {
        if (kanaal) { await sb.removeChannel(kanaal); kanaal = null; }
        await sb.auth.signOut();
      },
      bijAfmelden(fn) { sb.auth.onAuthStateChange(gebeurtenis => { if (gebeurtenis === 'SIGNED_OUT') fn(); }); },
      async laad() {
        const [ik, medewerkers, categorieen, voorstellen, beoordelingen, statuswijzigingen, notificaties, reacties] = await Promise.all([
          rpc('huidige_medewerker'),
          lees('medewerker', 'id, naam, rol'),
          lees('categorie'),
          lees('voorstel'),
          lees('beoordeling'),
          lees('statuswijziging'),
          lees('notificatie'), // de database geeft alleen je eigen berichten terug (Row Level Security)
          // Alleen gesprekken waarin je indiener bent, of alle als je in de stuurgroep zit (Row Level Security).
          // Is het nieuwe SQL-script nog niet gedraaid, dan ontbreekt de tabel: de rest van de app blijft dan gewoon werken.
          sb.from('reactie').select('*').then(({ data: d, error }) => {
            if (error) { console.warn('[gesprek] niet beschikbaar:', error.message); return []; }
            return d;
          }),
        ]);
        const mij = Array.isArray(ik) ? ik[0] : ik;
        if (!mij || !mij.id) throw new Error('Je account is nog niet gekoppeld aan een medewerker. Vraag de beheerder om je e-mailadres toe te voegen.');
        return {
          gebruikerId: mij.id,
          mail: { stand: 'geen' },
          demoModus: !!config.demoModus,
          data: {
            medewerkers, categorieen,
            voorstellen: voorstellen.map(naarApp), beoordelingen: beoordelingen.map(naarApp),
            statuswijzigingen: statuswijzigingen.map(naarApp), notificaties: notificaties.map(naarApp),
            reacties: reacties.map(naarApp),
          },
        };
      },
      dienIn: i => rpc('dien_voorstel_in', { p_titel: i.titel, p_omschrijving: i.omschrijving, p_categorie_id: i.categorieId, p_klant: i.klant || '', p_opbrengst: i.opbrengst || '' }).then(naarApp),
      beoordeel: (id, i) => rpc('sla_beoordeling_op', { p_voorstel_id: id, p_impact: i.impact, p_urgentie: i.urgentie, p_inzet: i.inzet, p_gepland_week: i.geplandeWeek || '', p_notitie: i.notitie || '' }),
      wijzigStatus: (id, naar, toelichting) => rpc('wijzig_status', { p_voorstel_id: id, p_naar: naar, p_toelichting: toelichting || '' }),
      markeerGelezen: ids => rpc('markeer_gelezen', { p_ids: ids }),
      reageer: (id, tekst) => rpc('plaats_reactie', { p_voorstel_id: id, p_tekst: tekst }).then(naarApp),
      bewerkReactie: (id, tekst) => rpc('bewerk_reactie', { p_reactie_id: id, p_tekst: tekst }).then(naarApp),
      postvak: async () => [],
      reset: () => rpc('reset_demo'),
      /** Live: bij elke wijziging in de database roept Supabase bijWijziging aan, op alle open apparaten. */
      volg(bijWijziging, bijStatus) {
        if (kanaal) return;
        kanaal = sb.channel('vbr-live');
        LIVE_TABELLEN.forEach(tabel => kanaal.on('postgres_changes', { event: '*', schema: 'public', table: tabel }, bijWijziging));
        kanaal.subscribe(status => bijStatus(status));
      },
    };
  }

  const ROL_NAAM = { medewerker: 'Medewerker', stuurgroep: 'Stuurgroep', management: 'Management' };
  // Uitleg van de rollen op het inlogscherm. Bewust zonder e-mailadressen: wie inlogt, krijgt die van de beheerder.
  const ROL_UITLEG = [
    { rol: 'medewerker', wat: 'Dient voorstellen in en volgt wat ermee gebeurt.' },
    { rol: 'stuurgroep', wat: 'Beoordeelt voorstellen en wijzigt de status.' },
    { rol: 'management', wat: 'Ziet het dashboard: wat er speelt en wat blijft liggen.' },
  ];
  const WACHTTIJD_NA_FOUT = 3000; // ms; remt raden van wachtwoorden in de app (de echte rem zit in Supabase: rate limits)

  let bron;
  let data = null;
  let liveStatus = '';
  let vensterSoort = null;      // 'voorstel' | 'berichten' | 'postvak'
  let vensterAangeraakt = false; // iemand heeft in het open venster iets ingevuld: dan niet live overschrijven
  let mailInfo = { stand: 'geen' };
  let demoModus = true;
  let huidigeGebruikerId = (() => { try { return localStorage.getItem(GEBRUIKER_SLEUTEL); } catch (e) { return null; } })();
  let huidigScherm = null;
  let beoordeelFilter = 'Te beoordelen';
  let openVoorstelId = null;
  let gesprekKeuze = null;       // het gesprek (voorstel-id) dat open staat in de tab Gesprekken

  /** Volgorde: eigen Node-server (lokaal of intern) > Supabase (online met accounts) > demo in de browser. */
  async function kiesBron() {
    if (location.protocol.startsWith('http')) {
      try {
        const s = ServerBron();
        await s.laad();
        return s;
      } catch (e) { /* geen server bereikbaar */ }
    }
    const config = window.VBR_CONFIG || {};
    if (config.supabaseUrl && config.supabaseAnonKey) return SupabaseBron(config);
    return LokaleBron();
  }

  async function herlaad() {
    const r = await bron.laad();
    data = r.data; mailInfo = r.mail || mailInfo; demoModus = r.demoModus;
    if (!data.reacties) data.reacties = []; // databestand van voor iteratie 5
    if (r.gebruikerId) huidigeGebruikerId = r.gebruikerId; // ingelogd: de gebruiker volgt uit het account
    else if (!data.medewerkers.some(m => m.id === huidigeGebruikerId)) huidigeGebruikerId = data.medewerkers[0].id;
  }

  // ===== 2. Hulpfuncties ====================================================
  const $ = sel => document.querySelector(sel);

  /** Zet tekst om naar veilige HTML, zodat ingevoerde tekst nooit als code wordt uitgevoerd (XSS). */
  function esc(tekst) {
    return String(tekst == null ? '' : tekst)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const gebruiker = () => data.medewerkers.find(m => m.id === huidigeGebruikerId);
  const naamVan = id => (data.medewerkers.find(m => m.id === id) || { naam: 'Onbekend' }).naam;
  const categorieVan = id => (data.categorieen.find(c => c.id === id) || { naam: '-' }).naam;
  const beoordelingVan = id => data.beoordelingen.find(b => b.voorstelId === id);
  const datum = iso => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const datumTijd = iso => new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const PRIO_VOLGORDE = { Hoog: 0, Middel: 1, Laag: 2 };
  const STATUS_KLASSE = {
    'Ingediend': 'k-ingediend', 'In beoordeling': 'k-beoordeling', 'On hold': 'k-hold', 'Goedgekeurd': 'k-goedgekeurd',
    'Ingepland': 'k-ingepland', 'Overgedragen aan Freshservice': 'k-overgedragen', 'Afgewezen': 'k-afgewezen',
  };
  const CHEVRON = '<svg class="chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const statusPil = status => `<span class="pil ${STATUS_KLASSE[status] || ''}"><span class="stip"></span>${esc(status === 'Overgedragen aan Freshservice' ? 'Overgedragen' : status)}</span>`;
  function prioPil(voorstelId) {
    const b = beoordelingVan(voorstelId);
    return b ? `<span class="pil k-${b.prioriteit.toLowerCase()}" title="Score ${b.score} van 9">${esc(b.prioriteit)}</span>` : '';
  }

  let meldingTimer;
  function toonMelding(tekst, isFout) {
    const el = $('#melding');
    el.textContent = tekst;
    el.className = 'melding' + (isFout ? ' fout' : '');
    el.hidden = false;
    clearTimeout(meldingTimer);
    meldingTimer = setTimeout(() => { el.hidden = true; }, isFout ? 5000 : 3200);
  }

  /** Voert een actie uit, ververst de data en toont fouten netjes. */
  async function doe(actie, succesTekst) {
    try {
      const r = await actie();
      await herlaad();
      if (succesTekst) toonMelding(typeof succesTekst === 'function' ? succesTekst(r) : succesTekst);
      return r;
    } catch (e) {
      toonMelding(e.message, true);
      throw e;
    }
  }

  const mailZin = () => mailInfo.stand === 'gmail' ? 'krijgt automatisch een e-mail' : 'krijgt automatisch een bericht';

  // ===== 3. Navigatie per rol ===============================================
  /** Iedereen mag indienen; de stuurgroep beoordeelt; stuurgroep en management zien het dashboard. */
  function menuVoorRol(rol) {
    const basis = [['indienen', 'Nieuw voorstel'], ['mijn', 'Mijn voorstellen'], ['gesprekken', 'Gesprekken']];
    if (rol === 'stuurgroep') return [['beoordelen', 'Beoordelen'], ['dashboard', 'Dashboard']].concat(basis);
    if (rol === 'management') return [['dashboard', 'Dashboard']].concat(basis);
    return basis;
  }

  const mijnOngelezen = () => data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId && !n.gelezen);
  /** Ongelezen meldingen van nieuwe reacties in het gesprek bij één voorstel (voor het bolletje in de lijsten). */
  const ongelezenGesprek = voorstelId => mijnOngelezen().filter(n => n.reactieId && n.voorstelId === voorstelId);

  function tekenKop() {
    $('.kop-acties').hidden = false;
    const metAccount = bron.soort === 'supabase';
    $('.gebruiker').hidden = metAccount;   // demo: wissel van persoon met de keuzelijst
    $('#account').hidden = !metAccount;    // online: je bent wie je bent, met je rol zichtbaar in de kop
    if (metAccount) {
      const g = gebruiker();
      $('#accountNaam').textContent = g.naam;
      $('#accountRol').textContent = ROL_NAAM[g.rol] || g.rol;
      $('#accountRol').className = 'rol-chip rol-' + g.rol;
    } else {
      $('#gebruikerKeuze').innerHTML = data.medewerkers.map(m =>
        `<option value="${esc(m.id)}"${m.id === huidigeGebruikerId ? ' selected' : ''}>${esc(m.naam)}</option>`).join('');
    }
    const ongelezen = mijnOngelezen().length;
    const teller = $('#belTeller');
    teller.textContent = ongelezen > 9 ? '9+' : ongelezen;
    teller.hidden = ongelezen === 0;
    $('#belKnop').setAttribute('aria-label', `Berichten, ${ongelezen} ongelezen`);

    const items = menuVoorRol(gebruiker().rol);
    if (!items.some(([s]) => s === huidigScherm)) huidigScherm = items[0][0];
    const ongelezenChat = mijnOngelezen().filter(n => n.reactieId).length;
    $('#menu').innerHTML = items.map(([s, t]) => {
      const teller = s === 'gesprekken' && ongelezenChat ? `<span class="tab-teller" aria-label="${ongelezenChat} ongelezen">${ongelezenChat > 9 ? '9+' : ongelezenChat}</span>` : '';
      return `<button type="button" data-scherm="${s}"${s === huidigScherm ? ' aria-current="page"' : ''}>${esc(t)}${teller}</button>`;
    }).join('');
  }

  function tekenVoet() {
    const delen = [];
    if (bron.soort === 'lokaal') delen.push('<span>Demo in de browser: gegevens blijven op dit apparaat</span>');
    else if (bron.soort === 'supabase') delen.push(liveStatus === 'SUBSCRIBED'
      ? '<span class="live aan"><span class="stip"></span>Live: wijzigingen verschijnen direct op alle apparaten</span>'
      : '<span class="live"><span class="stip"></span>Verbinden voor live updates…</span>');
    else if (mailInfo.stand === 'gmail') delen.push(`<span>E-mail actief${mailInfo.testOntvanger ? ' (testadres)' : ''}</span>`);
    else delen.push('<span>E-mail in voorbeeldstand</span>');
    if (demoModus && bron.soort === 'server') delen.push('<button type="button" class="tekstknop" data-actie="postvak">Verzonden e-mails</button>');
    if (demoModus) delen.push('<button type="button" class="tekstknop" data-actie="reset">Demodata herstellen</button>');
    $('#voet').innerHTML = delen.join('');
  }

  const SCHERMEN = { indienen: () => schermIndienen(), mijn: () => schermMijn(), beoordelen: () => schermBeoordelen(), dashboard: () => schermDashboard(), gesprekken: () => schermGesprekken() };
  function toon(scherm) {
    if (scherm) huidigScherm = scherm;
    tekenKop();
    tekenVoet();
    SCHERMEN[huidigScherm]();
  }

  // ===== Live verversen ======================================================
  /*
   * Een wijziging van een collega (op een ander apparaat) komt binnen via Supabase Realtime.
   * We halen dan de data opnieuw op en tekenen het scherm opnieuw, behalve waar iemand aan het typen is:
   * dan worden alleen de kop (berichtenteller) en de voet bijgewerkt, zodat er geen invoer verloren gaat.
   */
  let verversTimer;
  function planVerversing() { clearTimeout(verversTimer); verversTimer = setTimeout(verversLive, 350); }
  const aanHetTypen = () => !!document.activeElement && document.activeElement.matches('input:not([type=radio]), textarea');

  async function verversLive() {
    if (!data) return; // niet ingelogd
    const alGezien = new Set(mijnOngelezen().map(n => n.id));
    try { await herlaad(); } catch (e) { return; } // bij de volgende wijziging of poging opnieuw
    tekenKop();
    tekenVoet();
    if (huidigScherm === 'gesprekken') schermGesprekken(); // werkt alleen lijst en berichten bij, nooit het tekstvak
    else if (huidigScherm !== 'indienen' && !aanHetTypen()) SCHERMEN[huidigScherm]();
    if ($('#venster').open && !vensterAangeraakt && !aanHetTypen()) {
      if (vensterSoort === 'voorstel' && openVoorstelId) openVoorstel(openVoorstelId);
      if (vensterSoort === 'berichten') openBerichten();
    } else if ($('#venster').open && vensterSoort === 'voorstel' && openVoorstelId) {
      // Iemand typt: alleen het gesprek bijwerken, de invoer blijft staan.
      tekenGesprek(openVoorstelId);
      markeerGesprekGelezen(openVoorstelId);
    }
    // Pop-up per nieuwe melding, behalve voor het voorstel of gesprek dat je op dit moment al open hebt: dat zie je al.
    const nuOpen = new Set([
      $('#venster').open && vensterSoort === 'voorstel' ? openVoorstelId : null,
      huidigScherm === 'gesprekken' ? gesprekKeuze : null,
    ].filter(Boolean));
    mijnOngelezen().filter(n => !alGezien.has(n.id) && !nuOpen.has(n.voorstelId))
      .sort((a, b) => a.datum.localeCompare(b.datum)).slice(-MAX_POPUPS).forEach(toonPopup);
  }

  // ===== Inloggen (alleen online met Supabase) ==============================
  function toonLogin(fout) {
    data = null;
    sluitVenster();
    $('.kop-acties').hidden = true;
    $('#menu').innerHTML = '';
    $('#voet').innerHTML = '<span>Verbeterregistratie · Egency</span>';
    const config = window.VBR_CONFIG || {};
    $('#inhoud').innerHTML = `
      <div class="login">
        <div class="paginakop"><h1>Inloggen</h1><p>Wat je ziet en wat je mag, hangt af van je rol.</p></div>
        <form id="loginForm" class="formulier" novalidate>
          <div class="kaart velden">
            <div class="veld"><label for="l-email">E-mailadres</label><input id="l-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></div>
            <div class="veld"><label for="l-wachtwoord">Wachtwoord</label><input id="l-wachtwoord" name="wachtwoord" type="password" autocomplete="current-password"></div>
          </div>
          ${fout ? `<p class="login-fout" role="alert">${esc(fout)}</p>` : ''}
          <button class="knop breed" type="submit">Inloggen</button>
        </form>
        ${config.demoModus ? `
        <section class="groep">
          <h2 class="groep-titel">Drie rollen</h2>
          <div class="kaart"><ul class="lijst">${ROL_UITLEG.map(a => `<li><div class="rij" style="cursor:default">
            <span class="rij-tekst"><span class="rij-titel"><span class="rol-chip rol-${a.rol}">${ROL_NAAM[a.rol]}</span></span><span class="rij-meta">${esc(a.wat)}</span></span></div></li>`).join('')}</ul></div>
          <p class="groep-voet">Je inloggegevens krijg je van de beheerder.</p>
        </section>` : ''}
      </div>`;
    const form = $('#loginForm');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const knop = form.querySelector('[type=submit]');
      const email = form.email.value.trim(), wachtwoord = form.wachtwoord.value;
      if (!email || !wachtwoord) { toonMelding('Vul je e-mailadres en wachtwoord in.', true); return; }
      knop.disabled = true; knop.textContent = 'Bezig met inloggen…';
      try {
        await bron.login(email, wachtwoord);
        await naInloggen();
      } catch (err) {
        if (/niet gekoppeld/.test(err.message)) await bron.uitloggen().catch(() => {});
        toonLogin(err.message);
        $('#l-email').value = email;
        // Na een mislukte poging de knop even blokkeren (het wachtwoord wordt nergens bewaard).
        const opnieuw = $('#loginForm [type=submit]');
        opnieuw.disabled = true;
        setTimeout(() => { opnieuw.disabled = false; }, WACHTTIJD_NA_FOUT);
      }
    });
  }

  async function naInloggen() {
    await herlaad();
    huidigScherm = null;
    toon();
    bron.volg(planVerversing, status => {
      const wasLive = liveStatus === 'SUBSCRIBED';
      liveStatus = status;
      if (data) tekenVoet();
      if (status === 'SUBSCRIBED' && !wasLive) planVerversing(); // na (her)verbinden: niets gemist
    });
  }

  const BALLON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/></svg>';
  /** Rood bolletje met het aantal ongelezen reacties in het gesprek; niets als alles gelezen is. */
  function gesprekBadge(voorstelId) {
    const aantal = ongelezenGesprek(voorstelId).length;
    return aantal ? `<span class="gesprek-badge" title="${aantal} nieuwe ${aantal === 1 ? 'reactie' : 'reacties'} in het gesprek">${BALLON}<span>${aantal > 9 ? '9+' : aantal}</span><span class="visueel-verborgen"> nieuwe ${aantal === 1 ? 'reactie' : 'reacties'}</span></span>` : '';
  }

  /** Een rij in een lijst: titel, meta-regel, rechts labels en een pijltje. */
  function voorstelRij(v, meta) {
    return `<li><button type="button" class="rij" data-voorstel="${esc(v.id)}">
      <span class="rij-tekst"><span class="rij-titel">${esc(v.titel)}</span><span class="rij-meta">${esc(meta)}</span></span>
      <span class="rij-rechts">${gesprekBadge(v.id)}${prioPil(v.id)}${statusPil(v.status)}</span>${CHEVRON}</button></li>`;
  }

  // ===== 4. Schermen ========================================================

  // --- Kernfunctionaliteit 1: Nieuw voorstel (max. 5 velden) ---
  function schermIndienen() {
    $('#inhoud').innerHTML = `
      <div class="paginakop">
        <h1>Nieuw voorstel</h1>
        <p>Zie je iets dat beter kan? Leg het vast. Je hoort bij elke stap wat ermee gebeurt.</p>
      </div>
      <form id="indienForm" class="formulier indien-raster" novalidate>
        <div class="kaart velden indien-hoofd">
          <div class="veld" data-veld="titel">
            <label for="f-titel">Titel</label>
            <input id="f-titel" name="titel" maxlength="100" autocomplete="off" placeholder="Bijv. MFA afdwingen voor beheeraccounts">
          </div>
          <div class="veld" data-veld="omschrijving">
            <label for="f-omschrijving">Wat zie je en wat stel je voor?</label>
            <textarea id="f-omschrijving" name="omschrijving" maxlength="2000" placeholder="Beschrijf kort de situatie en je idee."></textarea>
            <div class="veld-hint"><span></span><span><span id="tellerOmschrijving">0</span>/2000</span></div>
          </div>
          <div class="veld" data-veld="categorieId">
            <span class="label" id="l-categorie">Categorie</span>
            <div class="segment" role="radiogroup" aria-labelledby="l-categorie">
              ${data.categorieen.map(c => `<input type="radio" name="categorieId" id="cat-${esc(c.id)}" value="${esc(c.id)}"><label for="cat-${esc(c.id)}" title="${esc(c.omschrijving)}">${esc(c.naam)}</label>`).join('')}
            </div>
          </div>
        </div>
        <div class="indien-zijkant">
        <div class="kaart velden">
          <div class="veld" data-veld="klant">
            <label for="f-klant">Klant <span class="optioneel">optioneel</span></label>
            <input id="f-klant" name="klant" maxlength="100" autocomplete="off" placeholder="Alleen als het over een klant gaat">
          </div>
          <div class="veld" data-veld="opbrengst">
            <label for="f-opbrengst">Wat levert het op? <span class="optioneel">optioneel</span></label>
            <input id="f-opbrengst" name="opbrengst" maxlength="500" autocomplete="off" placeholder="Bijv. tijdwinst, minder risico, advies voor de klant">
          </div>
        </div>
        <button class="knop breed" type="submit">Voorstel indienen</button>
        </div>
      </form>`;
    const omschr = $('#f-omschrijving');
    omschr.addEventListener('input', () => { $('#tellerOmschrijving').textContent = omschr.value.length; });
    $('#indienForm').addEventListener('submit', async e => {
      e.preventDefault();
      const invoer = Object.fromEntries(new FormData(e.target).entries());
      if (!markeerFouten(invoer)) return;
      const knop = e.target.querySelector('[type=submit]');
      knop.disabled = true;
      try {
        await doe(() => bron.dienIn(invoer), v => `"${v.titel}" is ingediend.` + (mailInfo.stand === 'gmail' ? ' Je krijgt een bevestiging per e-mail.' : ''));
        toon('mijn');
      } catch (err) { knop.disabled = false; }
    });
  }

  /** Toont foutmeldingen direct onder het veld waar het om gaat. Geeft true als alles klopt. */
  function markeerFouten(invoer) {
    document.querySelectorAll('.veld.fout').forEach(v => { v.classList.remove('fout'); const m = v.querySelector('.veld-fout'); if (m) m.remove(); });
    const regels = {
      titel: t => (t || '').trim().length >= 5 || 'Geef een titel van minimaal 5 tekens.',
      omschrijving: t => (t || '').trim().length >= 20 || 'Beschrijf je voorstel in minimaal 20 tekens.',
      categorieId: t => data.categorieen.some(c => c.id === t) || 'Kies een categorie.',
    };
    let eerste = null;
    Object.entries(regels).forEach(([veld, regel]) => {
      const uitkomst = regel(invoer[veld]);
      if (uitkomst !== true) {
        const el = document.querySelector(`[data-veld="${veld}"]`);
        el.classList.add('fout');
        el.insertAdjacentHTML('beforeend', `<span class="veld-fout">${esc(uitkomst)}</span>`);
        eerste = eerste || el;
      }
    });
    if (eerste) { const f = eerste.querySelector('input, textarea'); if (f) f.focus(); return false; }
    return true;
  }

  // --- Mijn voorstellen: de indiener volgt de voortgang ---
  function schermMijn() {
    const mijn = data.voorstellen.filter(v => v.indienerId === huidigeGebruikerId)
      .sort((a, b) => b.ingediendOp.localeCompare(a.ingediendOp));
    $('#inhoud').innerHTML = `
      <div class="paginakop"><h1>Mijn voorstellen</h1><p>Wat er met jouw ideeën gebeurt.</p></div>
      <div class="kaart">
        ${mijn.length ? `<ul class="lijst">${mijn.map(v => voorstelRij(v, `${categorieVan(v.categorieId)} · ingediend ${datum(v.ingediendOp)}`)).join('')}</ul>`
        : `<div class="leeg"><strong>Nog geen voorstellen</strong>Je eerste idee indienen kost een paar minuten.<br><br><button class="knop zacht" type="button" data-scherm="indienen">Nieuw voorstel</button></div>`}
      </div>`;
  }

  // --- Kernfunctionaliteit 2: Beoordelen (stuurgroep) ---
  const FILTERS = {
    'Te beoordelen': v => ['Ingediend', 'In beoordeling'].includes(v.status),
    'On hold': v => v.status === 'On hold',
    'Ingepland': v => ['Goedgekeurd', 'Ingepland'].includes(v.status),
    'Afgerond': v => ['Overgedragen aan Freshservice', 'Afgewezen'].includes(v.status),
  };
  function schermBeoordelen() {
    const lijst = data.voorstellen.filter(FILTERS[beoordeelFilter]).sort((a, b) => {
      const pa = beoordelingVan(a.id), pb = beoordelingVan(b.id);
      const va = pa ? PRIO_VOLGORDE[pa.prioriteit] : -1, vb = pb ? PRIO_VOLGORDE[pb.prioriteit] : -1; // onbeoordeeld bovenaan
      return va - vb || a.ingediendOp.localeCompare(b.ingediendOp);
    });
    $('#inhoud').innerHTML = `
      <div class="paginakop"><h1>Beoordelen</h1><p>Werklijst voor het wekelijkse stuurgroepoverleg.</p></div>
      <div class="segment filters" role="group" aria-label="Filter">
        ${Object.keys(FILTERS).map(f => `<button type="button" data-filter="${esc(f)}" aria-pressed="${f === beoordeelFilter}">${esc(f)} <span style="color:var(--tekst-3)">${data.voorstellen.filter(FILTERS[f]).length}</span></button>`).join('')}
      </div>
      <div class="kaart">
        ${lijst.length ? `<ul class="lijst">${lijst.map(v => voorstelRij(v, `${naamVan(v.indienerId)} · ${categorieVan(v.categorieId)} · ${datum(v.ingediendOp)}`)).join('')}</ul>`
        : '<div class="leeg"><strong>Niets in deze lijst</strong>Alles is bijgewerkt.</div>'}
      </div>`;
  }

  // --- Kernfunctionaliteit 3: Dashboard (management) ---
  function schermDashboard() {
    const c = VBR.dashboardCijfers(data);
    const wacht = c.perStatus['Ingediend'] + c.perStatus['In beoordeling'];
    const balken = items => {
      const max = Math.max(1, ...items.map(i => i.aantal));
      return `<div class="balken">${items.map(i => `<div class="balk-rij"><span>${esc(i.naam)}</span>
        <div class="balk" role="img" aria-label="${esc(i.naam)}: ${i.aantal}"><span class="${esc(i.klasse || '')}" style="width:${Math.max(i.aantal ? 4 : 0, (i.aantal / max) * 100)}%"></span></div>
        <span class="aantal">${i.aantal}</span></div>`).join('')}</div>`;
    };
    const openHoog = data.voorstellen.filter(v => VBR.OPEN_STATUSSEN.includes(v.status) && (beoordelingVan(v.id) || {}).prioriteit === 'Hoog');
    const aandacht = c.teLangOpen.map(v => ({ v, meta: `Wacht sinds ${datum(v.ingediendOp)} op beoordeling` }))
      .concat(openHoog.map(v => ({ v, meta: `Hoge prioriteit · ${v.status}` })));
    $('#inhoud').innerHTML = `
      <div class="paginakop"><h1>Dashboard</h1><p>Wat er speelt en wat aandacht nodig heeft.</p></div>
      <div class="kaart cijfers">
        <div class="cijfer"><span class="getal">${c.open}</span><span class="naam">Open voorstellen</span></div>
        <div class="cijfer"><span class="getal">${wacht}</span><span class="naam">Wachten op beoordeling</span></div>
        <div class="cijfer${c.teLangOpen.length ? ' let-op' : ''}"><span class="getal">${c.teLangOpen.length}</span><span class="naam">Langer dan ${VBR.MAX_DAGEN_ZONDER_REACTIE} dagen stil</span></div>
        <div class="cijfer"><span class="getal">${c.gemReactieDagen === null ? '–' : String(c.gemReactieDagen).replace('.', ',')}</span><span class="naam">Dagen tot eerste reactie</span></div>
      </div>
      <div class="dashboard-raster">
      <section class="groep">
        <h2 class="groep-titel">Aandacht nodig</h2>
        <div class="kaart">${aandacht.length ? `<ul class="lijst">${aandacht.map(a => voorstelRij(a.v, a.meta)).join('')}</ul>` : '<div class="leeg">Niets dat nu aandacht vraagt.</div>'}</div>
      </section>
      <div class="twee">
        <section class="groep"><h2 class="groep-titel">Per status</h2>
          <div class="kaart">${balken(VBR.STATUSSEN.map(s => ({ naam: s === 'Overgedragen aan Freshservice' ? 'Overgedragen' : s, aantal: c.perStatus[s], klasse: STATUS_KLASSE[s] })))}</div></section>
        <section class="groep"><h2 class="groep-titel">Open, per prioriteit</h2>
          <div class="kaart">${balken([['Hoog', 'k-hoog'], ['Middel', 'k-middel'], ['Laag', 'k-laag'], ['Nog niet beoordeeld', 'k-ingediend']].map(([n, k]) => ({ naam: n, aantal: c.perPrioriteit[n], klasse: k })))}</div>
          <h2 class="groep-titel" style="margin-top:16px">Per categorie</h2>
          <div class="kaart">${balken(c.perCategorie)}</div></section>
      </div>
      </div>`;
  }

  // --- Gesprekken: alle gesprekken waar je deelnemer van bent (iteratie 5b) ---
  /*
   * Links de lijst, rechts het open gesprek (op een telefoon: eerst de lijst, dan het gesprek).
   * Bij een live update worden alleen de lijst en de berichten opnieuw getekend, nooit het tekstvak.
   */
  function schermGesprekken() {
    if (gesprekKeuze && !VBR.magGesprekZien(data, gesprekKeuze, huidigeGebruikerId)) gesprekKeuze = null;
    const v = gesprekKeuze && data.voorstellen.find(x => x.id === gesprekKeuze);
    const scherm = $('#gesprekkenScherm');
    if (scherm && scherm.dataset.open === (gesprekKeuze || '')) {
      $('#gesprekkenLijst').innerHTML = gesprekkenLijstHtml();
      if (v) { $('#paneelMeta').innerHTML = paneelMeta(v); tekenGesprek(v.id); markeerGesprekGelezen(v.id); }
      return;
    }
    $('#inhoud').innerHTML = `
      <div class="paginakop met-knop">
        <div><h1>Gesprekken</h1><p>Vragen en antwoorden over voorstellen, tussen indiener en stuurgroep.</p></div>
        <button type="button" class="knop zacht" data-actie="nieuwGesprek">Nieuw gesprek</button>
      </div>
      <div id="gesprekkenScherm" class="gesprekken${v ? ' met-keuze' : ''}" data-open="${esc(gesprekKeuze || '')}">
        <div class="kaart gesprekken-lijst"><ul class="lijst" id="gesprekkenLijst">${gesprekkenLijstHtml()}</ul></div>
        ${v ? `
        <section class="kaart gesprek gesprekken-paneel" data-gesprek="${esc(v.id)}" aria-label="Gesprek over ${esc(v.titel)}">
          <div class="paneel-kop">
            <button type="button" class="tekstknop terug" data-gesprek-kies="">‹ Gesprekken</button>
            <div class="paneel-titel"><strong>${esc(v.titel)}</strong><span id="paneelMeta">${paneelMeta(v)}</span></div>
            <button type="button" class="tekstknop" data-voorstel="${esc(v.id)}">Voorstel bekijken</button>
          </div>
          ${gesprekInhoud('tab')}
          <p class="paneel-voet">${privacyZin(v)}</p>
        </section>` : `
        <div class="kaart gesprekken-paneel leeg-paneel"><div class="leeg"><strong>Kies een gesprek</strong>of start een nieuw gesprek over een voorstel.</div></div>`}
      </div>`;
    if (v) {
      const blok = $('.gesprekken-paneel[data-gesprek]');
      tekenGesprek(v.id, true);
      koppelReactieForm(blok, v.id);
      if (!matchMedia('(pointer: coarse)').matches) blok.querySelector('textarea').focus({ preventScroll: true });
      markeerGesprekGelezen(v.id);
    }
  }
  const paneelMeta = v => `${esc(naamVan(v.indienerId))} · ${statusPil(v.status)}`;
  const kort = (tekst, max) => tekst.length > max ? tekst.slice(0, max - 1).trimEnd() + '…' : tekst;

  function gesprekkenLijstHtml() {
    const lijst = VBR.gesprekkenVoor(data, huidigeGebruikerId);
    if (!lijst.length) return `<li><div class="leeg"><strong>Nog geen gesprekken</strong>${gebruiker().rol === 'stuurgroep' ? 'Stel een vraag bij een voorstel met "Nieuw gesprek".' : 'Heeft de stuurgroep een vraag over je voorstel, dan zie je die hier.'}</div></li>`;
    return lijst.map(g => {
      const wie = g.laatste.afzenderId === huidigeGebruikerId ? 'Jij' : naamVan(g.laatste.afzenderId).split(' ')[0];
      const ongelezen = ongelezenGesprek(g.voorstel.id).length;
      return `<li><button type="button" class="rij gesprek-rij${ongelezen ? ' ongelezen' : ''}" data-gesprek-kies="${esc(g.voorstel.id)}"${g.voorstel.id === gesprekKeuze ? ' aria-current="true"' : ''}>
        <span class="rij-tekst"><span class="rij-titel">${esc(g.voorstel.titel)}</span><span class="rij-meta">${esc(wie)}: ${esc(kort(g.laatste.tekst, 90))}</span></span>
        <span class="rij-rechts gesprek-rij-rechts"><span class="wanneer">${datum(g.laatste.verzondenOp)}</span>${gesprekBadge(g.voorstel.id)}</span></button></li>`;
    }).join('');
  }

  /** Venster om een gesprek te starten: kies een voorstel waar je deelnemer van bent. */
  function openNieuwGesprek() {
    const kandidaten = data.voorstellen.filter(v => VBR.magGesprekZien(data, v.id, huidigeGebruikerId))
      .sort((a, b) => (VBR.OPEN_STATUSSEN.includes(b.status) - VBR.OPEN_STATUSSEN.includes(a.status)) || b.ingediendOp.localeCompare(a.ingediendOp));
    const heeftGesprek = new Set(data.reacties.map(r => r.voorstelId));
    const rijen = kandidaten.map(v => `<li data-zoek="${esc((v.titel + ' ' + naamVan(v.indienerId)).toLowerCase())}"><button type="button" class="rij" data-gesprek-kies="${esc(v.id)}">
      <span class="rij-tekst"><span class="rij-titel">${esc(v.titel)}</span><span class="rij-meta">${esc(naamVan(v.indienerId))}${heeftGesprek.has(v.id) ? ' · gesprek loopt al' : ''}</span></span>
      <span class="rij-rechts">${statusPil(v.status)}</span>${CHEVRON}</button></li>`).join('');
    const venster = openVenster('Nieuw gesprek', `
      <p style="margin:0;color:var(--tekst-2)">${gebruiker().rol === 'stuurgroep' ? 'Over welk voorstel wil je iets vragen?' : 'Over welk van je voorstellen wil je iets zeggen of vragen?'}</p>
      ${kandidaten.length > 6 ? '<div class="veld" style="padding:0"><label for="g-zoek" class="visueel-verborgen">Zoeken</label><input id="g-zoek" type="search" placeholder="Zoek op titel of naam" autocomplete="off"></div>' : ''}
      <div class="kaart">${kandidaten.length ? `<ul class="lijst" id="nieuwGesprekLijst">${rijen}</ul>` : '<div class="leeg">Je hebt nog geen voorstellen ingediend.</div>'}</div>`, 'nieuwGesprek');
    const zoek = venster.querySelector('#g-zoek');
    if (zoek) zoek.addEventListener('input', () => {
      const q = zoek.value.trim().toLowerCase();
      venster.querySelectorAll('#nieuwGesprekLijst > li').forEach(li => { li.hidden = q && !li.dataset.zoek.includes(q); });
    });
  }

  // --- Pop-ups bij een update (iteratie 5b) ---
  const MAX_POPUPS = 3;
  const POPUP_DUUR = 8000; // ms

  /** Rustige kaart rechtsboven bij een nieuwe statuswijziging of reactie, met een knop Bekijken. */
  function toonPopup(n) {
    const v = data.voorstellen.find(x => x.id === n.voorstelId);
    if (!v) return;
    let kop, tekst;
    if (n.reactieId) {
      const r = data.reacties.find(x => x.id === n.reactieId);
      kop = `${r ? naamVan(r.afzenderId) : 'Iemand'} reageerde`;
      tekst = r ? kort(r.tekst, 110) : '';
    } else {
      const sw = data.statuswijzigingen.find(x => x.id === n.statuswijzigingId);
      kop = sw ? (sw.vanStatus === null ? 'Voorstel ontvangen' : `Nieuwe status: ${sw.naarStatus === 'Overgedragen aan Freshservice' ? 'Overgedragen' : sw.naarStatus}`) : 'Update';
      tekst = sw && sw.toelichting ? kort(sw.toelichting, 110) : '';
    }
    const houder = $('#popups');
    const el = document.createElement('div');
    el.className = 'popup';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="popup-tekst"><span class="popup-voorstel">${esc(v.titel)}</span><strong>${esc(kop)}</strong>${tekst ? `<span class="popup-bericht">${esc(tekst)}</span>` : ''}</div>
      <div class="popup-knoppen"><button type="button" class="knop zacht" data-popup="bekijk">Bekijken</button><button type="button" class="popup-sluit" data-popup="sluit" aria-label="Sluiten">×</button></div>`;
    houder.appendChild(el);
    while (houder.children.length > MAX_POPUPS) houder.firstElementChild.remove();
    // Als "popover" in de bovenste laag, zodat de pop-up ook boven een open venster staat.
    try { if (houder.matches(':popover-open')) houder.hidePopover(); houder.showPopover(); } catch (e) { /* oudere browser: gewoon fixed */ }
    // Verdwijnt na 8 seconden; met de muis erop blijft hij staan.
    let timer;
    const start = () => { timer = setTimeout(() => sluitPopup(el), POPUP_DUUR); };
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', start);
    el.addEventListener('focusin', () => clearTimeout(timer));
    start();
    el.querySelector('[data-popup="sluit"]').addEventListener('click', () => sluitPopup(el));
    el.querySelector('[data-popup="bekijk"]').addEventListener('click', async () => {
      sluitPopup(el);
      if (n.reactieId) { sluitVenster(); gesprekKeuze = v.id; toon('gesprekken'); window.scrollTo(0, 0); return; }
      if (!n.gelezen) { await doe(() => bron.markeerGelezen([n.id])).catch(() => {}); tekenKop(); }
      openVoorstel(v.id);
    });
  }
  function sluitPopup(el) {
    if (!el.isConnected) return;
    el.classList.add('weg');
    setTimeout(() => {
      el.remove();
      const houder = $('#popups');
      if (!houder.children.length) { try { houder.hidePopover(); } catch (e) { /* geen popover-ondersteuning */ } }
    }, 200);
  }

  // ===== 5. Vensters ========================================================
  function openVenster(titel, inhoud, soort) {
    const v = $('#venster');
    vensterSoort = soort || null;
    vensterAangeraakt = false;
    v.innerHTML = `<div class="venster-kop"><span style="width:52px"></span><h2>${esc(titel)}</h2><button type="button" class="tekstknop" data-sluit style="width:52px;text-align:right">Klaar</button></div><div class="venster-body">${inhoud}</div>`;
    if (!v.open) v.showModal();
    return v;
  }
  function sluitVenster() { const v = $('#venster'); if (v.open) v.close(); openVoorstelId = null; vensterSoort = null; }

  /** Voorstel bekijken; de stuurgroep kan hier ook beoordelen en de status wijzigen. Indiener en stuurgroep zien het gesprek. */
  function openVoorstel(voorstelId, naarGesprek) {
    const v = data.voorstellen.find(x => x.id === voorstelId);
    if (!v) return;
    // Een half getypt bericht in het gesprek bewaren als het venster opnieuw wordt getekend.
    const concept = openVoorstelId === voorstelId && $('#r-tekst-venster') ? $('#r-tekst-venster').value : '';
    openVoorstelId = voorstelId;
    const isStuurgroep = gebruiker().rol === 'stuurgroep';
    const b = beoordelingVan(v.id);
    const historie = data.statuswijzigingen.filter(s => s.voorstelId === v.id).sort((a, c) => a.datum.localeCompare(c.datum));
    const vervolg = VBR.OVERGANGEN[v.status] || [];
    const segment = (naam, waarde) => `<div class="segment" role="radiogroup" aria-label="${esc(naam)}">${['laag', 'middel', 'hoog'].map(n =>
      `<input type="radio" name="${naam}" id="b-${naam}-${n}" value="${n}"${waarde === n ? ' checked' : ''}><label for="b-${naam}-${n}">${n[0].toUpperCase() + n.slice(1)}</label>`).join('')}</div>`;
    const knopTekst = s => ({ 'In beoordeling': 'In beoordeling nemen', 'Goedgekeurd': 'Goedkeuren', 'Afgewezen': 'Afwijzen', 'On hold': 'On hold zetten', 'Ingepland': 'Inplannen', 'Overgedragen aan Freshservice': 'Overdragen aan Freshservice' })[s] || s;

    const venster = openVenster('Voorstel', `
      <div class="detail-titel"><h3>${esc(v.titel)}</h3><div class="knoppen">${statusPil(v.status)}${prioPil(v.id)}</div></div>
      <div class="kaart"><dl class="eigenschappen">
        <div><dt>Voorstel</dt><dd>${esc(v.omschrijving)}</dd></div>
        <div><dt>Categorie</dt><dd>${esc(categorieVan(v.categorieId))}</dd></div>
        ${v.klant ? `<div><dt>Klant</dt><dd>${esc(v.klant)}</dd></div>` : ''}
        ${v.opbrengst ? `<div><dt>Opbrengst</dt><dd>${esc(v.opbrengst)}</dd></div>` : ''}
        <div><dt>Ingediend door</dt><dd>${esc(naamVan(v.indienerId))}, ${datum(v.ingediendOp)}</dd></div>
        ${b && !isStuurgroep ? `<div><dt>Beoordeling</dt><dd>Impact ${esc(b.impact)}, urgentie ${esc(b.urgentie)}, inzet ${esc(b.inzet)}${b.geplandeWeek ? `\nGepland in week ${esc(b.geplandeWeek.split('-W')[1])}` : ''}</dd></div>` : ''}
      </dl></div>

      ${VBR.magGesprekZien(data, v.id, huidigeGebruikerId) ? `
      <section class="groep gesprek" id="gesprek" data-gesprek="${esc(v.id)}">
        <h4 class="groep-titel">Gesprek</h4>
        <div class="kaart">${gesprekInhoud('venster')}</div>
        <p class="groep-voet">${privacyZin(v)}</p>
      </section>` : ''}

      ${isStuurgroep && vervolg.length ? `
      <section class="groep">
        <h4 class="groep-titel">Beoordeling</h4>
        <form id="beoordeelForm" class="kaart velden">
          <div class="veld"><span class="label">Impact</span>${segment('impact', b ? b.impact : '')}</div>
          <div class="veld"><span class="label">Urgentie</span>${segment('urgentie', b ? b.urgentie : '')}</div>
          <div class="veld"><span class="label">Benodigde inzet</span>${segment('inzet', b ? b.inzet : '')}</div>
          <div class="uitkomst" id="uitkomst" aria-live="polite"></div>
          <div class="veld"><label for="b-week">Geplande week <span class="optioneel">nodig om in te plannen</span></label><input id="b-week" name="geplandeWeek" type="week" value="${esc(b ? b.geplandeWeek : '')}"></div>
          <div class="veld"><label for="b-notitie">Notitie <span class="optioneel">alleen voor de stuurgroep</span></label><input id="b-notitie" name="notitie" maxlength="300" value="${esc(b ? b.notitie : '')}"></div>
          <div class="veld"><button class="knop zacht" type="submit">Beoordeling opslaan</button></div>
        </form>
      </section>
      <section class="groep">
        <h4 class="groep-titel">Status wijzigen</h4>
        <div class="kaart velden">
          <div class="veld"><label for="s-toelichting">Bericht aan ${esc(naamVan(v.indienerId).split(' ')[0])} <span class="optioneel">verplicht bij afwijzen of on hold</span></label>
            <textarea id="s-toelichting" maxlength="500" style="min-height:72px" placeholder="Wat moet de indiener weten?"></textarea></div>
          <div class="veld"><div class="knoppen">${vervolg.map(s => `<button type="button" class="knop${s === 'Afgewezen' ? ' gevaar' : s === 'On hold' ? ' zacht' : ''}" data-naar="${esc(s)}">${esc(knopTekst(s))}</button>`).join('')}</div></div>
        </div>
      </section>` : ''}

      <section class="groep">
        <h4 class="groep-titel">Historie</h4>
        <div class="kaart"><ol class="tijdlijn">${historie.map(s => `<li><div><strong>${esc(s.naarStatus)}</strong> · ${esc(naamVan(s.doorId))}</div>
          ${s.toelichting ? `<div class="toelichting">${esc(s.toelichting)}</div>` : ''}<div class="wanneer">${datumTijd(s.datum)}</div></li>`).join('')}</ol></div>
      </section>`, 'voorstel');

    if (venster.querySelector('#gesprek')) {
      tekenGesprek(v.id, true);
      koppelReactieForm(venster.querySelector('#gesprek'), v.id);
      if (concept) { $('#r-tekst-venster').value = concept; groei($('#r-tekst-venster')); }
      markeerGesprekGelezen(v.id);
      if (naarGesprek) venster.querySelector('#gesprek').scrollIntoView({ block: 'start' });
    }

    const form = venster.querySelector('#beoordeelForm');
    if (form) {
      const werkUitkomstBij = () => {
        const f = Object.fromEntries(new FormData(form).entries());
        $('#uitkomst').innerHTML = f.impact && f.urgentie && f.inzet
          ? (p => `<span>Prioriteit</span><span class="pil k-${p.prioriteit.toLowerCase()}">${p.prioriteit}</span><span style="color:var(--tekst-3);font-size:13px">score ${p.score} van 9</span>`)(VBR.berekenPrioriteit(f.impact, f.urgentie, f.inzet))
          : '<span style="color:var(--tekst-3)">Kies impact, urgentie en inzet; de prioriteit wordt berekend.</span>';
      };
      form.addEventListener('change', werkUitkomstBij);
      werkUitkomstBij();
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form).entries());
        if (!(f.impact && f.urgentie && f.inzet)) { toonMelding('Kies impact, urgentie en inzet.', true); return; }
        try { await doe(() => bron.beoordeel(v.id, f), 'Beoordeling opgeslagen.'); openVoorstel(v.id); toon(); } catch (err) { /* melding al getoond */ }
      });
    }
    venster.querySelectorAll('[data-naar]').forEach(knop => knop.addEventListener('click', async () => {
      knop.disabled = true;
      try {
        await doe(() => bron.wijzigStatus(v.id, knop.dataset.naar, $('#s-toelichting').value),
          `Status is nu "${knop.dataset.naar}". ${naamVan(v.indienerId).split(' ')[0]} ${mailZin()}.`);
        openVoorstel(v.id); toon();
      } catch (err) { knop.disabled = false; }
    }));
  }

  // ----- Gesprek per voorstel (iteratie 5) -----
  /*
   * Hetzelfde gesprek kan op twee plekken staan: in het voorstelvenster en in de tab Gesprekken.
   * Elk blok heeft data-gesprek="<voorstel-id>"; tekenGesprek werkt alle blokken van dat voorstel bij.
   */
  const privacyZin = v => `Alleen zichtbaar voor ${v.indienerId === huidigeGebruikerId ? 'jou' : esc(naamVan(v.indienerId))} en de stuurgroep. Je kunt een bericht tot ${VBR.BEWERK_MINUTEN} minuten na verzenden bewerken.`;
  const gesprekInhoud = plek => `
    <ol class="gesprek-lijst" aria-live="polite"></ol>
    <form class="gesprek-invoer" novalidate>
      <label for="r-tekst-${plek}" class="visueel-verborgen">Bericht</label>
      <textarea id="r-tekst-${plek}" rows="1" maxlength="${VBR.MAX_REACTIE_TEKENS}" placeholder="Typ een bericht"></textarea>
      <button class="knop" type="submit">Verstuur</button>
    </form>`;

  /** Tekent alleen de berichtenlijst(en) van het gesprek, zodat live updates een half getypt bericht niet wissen. */
  function tekenGesprek(voorstelId, naarOnder) {
    document.querySelectorAll(`[data-gesprek="${CSS.escape(voorstelId)}"] .gesprek-lijst`).forEach(lijst => {
      if (lijst.querySelector('.bewerk-form')) return; // niet overschrijven terwijl iemand een bericht bewerkt
      const opBodem = naarOnder || lijst.scrollHeight - lijst.scrollTop - lijst.clientHeight < 40;
      const reacties = data.reacties.filter(r => r.voorstelId === voorstelId).sort((a, b) => a.verzondenOp.localeCompare(b.verzondenOp));
      lijst.innerHTML = reacties.length ? reacties.map(r => {
        const eigen = r.afzenderId === huidigeGebruikerId;
        const afzender = data.medewerkers.find(m => m.id === r.afzenderId) || {};
        return `<li class="reactie${eigen ? ' eigen' : ''}" data-reactie="${esc(r.id)}">
          <div class="reactie-meta">${eigen ? 'Jij' : esc(afzender.naam || 'Onbekend')}${!eigen && afzender.rol === 'stuurgroep' ? ' · stuurgroep' : ''}</div>
          <div class="ballon">${esc(r.tekst)}</div>
          <div class="reactie-meta">${datumTijd(r.verzondenOp)}${r.bewerktOp ? ' · bewerkt' : ''}${VBR.magReactieBewerken(r, huidigeGebruikerId) ? ` · <button type="button" class="tekstknop" data-bewerk="${esc(r.id)}">Bewerken</button>` : ''}</div>
        </li>`;
      }).join('') : '<li class="gesprek-leeg">Nog geen berichten. Vragen over dit voorstel stel je hier.</li>';
      if (opBodem) lijst.scrollTop = lijst.scrollHeight;
      lijst.querySelectorAll('[data-bewerk]').forEach(knop => knop.addEventListener('click', () => startBewerken(lijst, voorstelId, knop.dataset.bewerk)));
    });
  }

  /** Laat het tekstvak meegroeien met de tekst (tot een maximum, daarna scrollen). */
  function groei(veld) { veld.style.height = 'auto'; veld.style.height = Math.min(veld.scrollHeight, 160) + 'px'; }

  function koppelReactieForm(blok, voorstelId) {
    const form = blok.querySelector('.gesprek-invoer'), veld = form.querySelector('textarea');
    veld.addEventListener('input', () => groei(veld));
    // Enter verstuurt, Shift+Enter is een nieuwe regel (op een telefoon gebruik je de knop).
    veld.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const tekst = veld.value.trim();
      if (!tekst) { veld.focus(); return; }
      const knop = form.querySelector('[type=submit]');
      knop.disabled = true;
      try {
        await doe(() => bron.reageer(voorstelId, tekst));
        veld.value = ''; groei(veld);
        tekenGesprek(voorstelId, true);
        tekenKop();
        if (huidigScherm === 'gesprekken') schermGesprekken(); // lijst links: dit gesprek naar boven
      } catch (err) { /* melding al getoond, tekst blijft staan */ }
      knop.disabled = false;
      veld.focus();
    });
  }

  function startBewerken(lijst, voorstelId, reactieId) {
    const r = data.reacties.find(x => x.id === reactieId);
    const li = lijst.querySelector(`[data-reactie="${CSS.escape(reactieId)}"]`);
    if (!r || !li) return;
    li.innerHTML = `<form class="bewerk-form">
      <label for="bewerk-${esc(r.id)}" class="visueel-verborgen">Bericht bewerken</label>
      <textarea id="bewerk-${esc(r.id)}" maxlength="${VBR.MAX_REACTIE_TEKENS}">${esc(r.tekst)}</textarea>
      <div class="knoppen"><button type="button" class="tekstknop" data-annuleer>Annuleren</button><button type="submit" class="knop zacht">Opslaan</button></div>
    </form>`;
    const form = li.querySelector('form'), veld = form.querySelector('textarea');
    groei(veld); veld.focus(); veld.setSelectionRange(veld.value.length, veld.value.length);
    veld.addEventListener('input', () => groei(veld));
    form.querySelector('[data-annuleer]').addEventListener('click', () => { form.remove(); tekenGesprek(voorstelId); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await doe(() => bron.bewerkReactie(reactieId, veld.value), 'Bericht bijgewerkt.');
        form.remove(); tekenGesprek(voorstelId);
      } catch (err) { /* bijv. te laat: melding al getoond */ }
    });
  }

  /** Wie het gesprek open heeft, heeft de nieuwe reacties gezien: meldingen daarvan als gelezen markeren. */
  async function markeerGesprekGelezen(voorstelId) {
    const ids = ongelezenGesprek(voorstelId).map(n => n.id);
    if (!ids.length) return;
    try { await bron.markeerGelezen(ids); await herlaad(); } catch (e) { return; }
    tekenKop();
    if (huidigScherm !== 'indienen') SCHERMEN[huidigScherm](); // bolletjes in de lijst bijwerken
  }

  /** Berichten van de ingelogde gebruiker (de terugkoppeling, ook verstuurd per e-mail). */
  function openBerichten() {
    const mijn = data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId).sort((a, b) => b.datum.localeCompare(a.datum));
    const mailLabel = { verzonden: ' · e-mail verzonden', voorbeeld: ' · e-mail (voorbeeld)', mislukt: ' · e-mail mislukt' };
    openVenster('Berichten', `
      ${mijn.some(n => !n.gelezen) ? '<div class="knoppen" style="justify-content:flex-end"><button type="button" class="tekstknop" data-actie="allesGelezen">Alles gelezen</button></div>' : ''}
      <div class="kaart">${mijn.length ? `<ul class="lijst">${mijn.map(n => `<li><button type="button" class="bericht ${n.gelezen ? 'gelezen' : ''}" data-voorstel="${esc(n.voorstelId)}" data-notificatie="${esc(n.id)}">
        <span class="punt" aria-hidden="true"></span>
        <span class="bericht-tekst"><span>${esc(n.bericht)}</span><span class="bericht-meta">${datumTijd(n.datum)}${mailLabel[n.mail] || ''}</span></span></button></li>`).join('')}</ul>`
        : '<div class="leeg">Nog geen berichten.</div>'}</div>`, 'berichten');
  }

  /** Demo: laat zien welke e-mails de server heeft verstuurd (of in voorbeeldstand zou versturen). */
  async function openPostvak() {
    const lijst = await bron.postvak();
    openVenster('Verzonden e-mails', `
      <p style="margin:0;color:var(--tekst-2)">${mailInfo.stand === 'gmail' ? 'Deze e-mails zijn via Gmail verzonden.' : 'Voorbeeldstand: deze e-mails zijn opgesteld maar niet verzonden. Vul het .env-bestand in om echt te mailen.'}</p>
      <div class="kaart">${lijst.length ? `<ul class="lijst">${lijst.map(m => `<li><div class="rij" style="cursor:default"><span class="rij-tekst"><span class="rij-titel">${esc(m.onderwerp)}</span><span class="rij-meta">Aan ${esc(m.aan)} · ${datumTijd(m.datum)} · ${esc(m.status)}</span></span></div><pre class="mail-tekst">${esc(m.tekst)}</pre></li>`).join('')}</ul>`
        : '<div class="leeg">Nog geen e-mails sinds de server is gestart.</div>'}</div>`, 'postvak');
  }

  // ===== Gebeurtenissen =====================================================
  document.addEventListener('click', async e => {
    const doel = e.target.closest('[data-scherm], [data-filter], [data-voorstel], [data-sluit], [data-actie], [data-gesprek-kies]');
    if (!doel) return;
    if (doel.dataset.sluit !== undefined) { sluitVenster(); return; }
    if (doel.dataset.scherm) { sluitVenster(); toon(doel.dataset.scherm); window.scrollTo(0, 0); return; }
    if (doel.dataset.filter) { beoordeelFilter = doel.dataset.filter; toon(); return; }
    if (doel.dataset.gesprekKies !== undefined) { sluitVenster(); gesprekKeuze = doel.dataset.gesprekKies || null; toon('gesprekken'); window.scrollTo(0, 0); return; }
    if (doel.dataset.voorstel) {
      if (doel.dataset.notificatie) {
        const n = data.notificaties.find(x => x.id === doel.dataset.notificatie);
        if (n && !n.gelezen) { await doe(() => bron.markeerGelezen([n.id])).catch(() => {}); tekenKop(); }
      }
      const n = doel.dataset.notificatie && data.notificaties.find(x => x.id === doel.dataset.notificatie);
      openVoorstel(doel.dataset.voorstel, !!(n && n.reactieId));
      return;
    }
    const actie = doel.dataset.actie;
    if (actie === 'allesGelezen') { await doe(() => bron.markeerGelezen([])).catch(() => {}); tekenKop(); openBerichten(); }
    if (actie === 'nieuwGesprek') openNieuwGesprek();
    if (actie === 'postvak') openPostvak().catch(err => toonMelding(err.message, true));
    if (actie === 'reset') { await doe(() => bron.reset(), 'Demodata hersteld.').catch(() => {}); sluitVenster(); toon(); }
    if (actie === 'uitloggen') { data = null; gesprekKeuze = null; $('#popups').innerHTML = ''; await bron.uitloggen().catch(() => {}); liveStatus = ''; toonLogin(); }
  });
  // Typen in het gesprek telt niet als "aangeraakt": dat tekstvak wordt bij live updates toch niet overschreven.
  const telt = e => !e.target.closest('.gesprek');
  $('#venster').addEventListener('input', e => { if (telt(e)) vensterAangeraakt = true; });
  $('#venster').addEventListener('change', e => { if (telt(e)) vensterAangeraakt = true; });
  $('#venster').addEventListener('click', e => { if (e.target === e.currentTarget) sluitVenster(); });
  $('#venster').addEventListener('close', () => { openVoorstelId = null; });
  $('#gebruikerKeuze').addEventListener('change', e => {
    huidigeGebruikerId = e.target.value;
    try { localStorage.setItem(GEBRUIKER_SLEUTEL, huidigeGebruikerId); } catch (err) { /* negeren */ }
    huidigScherm = null;
    gesprekKeuze = null;
    $('#popups').innerHTML = '';
    sluitVenster();
    toon();
  });
  $('#belKnop').addEventListener('click', openBerichten);

  // Vangnet naast live updates: elke 30 seconden verversen (server), of als de live verbinding weg is (Supabase).
  setInterval(() => {
    if (!bron || bron.soort === 'lokaal' || (bron.soort === 'supabase' && liveStatus === 'SUBSCRIBED')) return;
    verversLive();
  }, 30000);
  // Telefoon uit slaapstand of tabblad weer actief: meteen bijwerken.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && bron && bron.soort !== 'lokaal') planVerversing();
  });

  // ===== Start ==============================================================
  (async function start() {
    bron = await kiesBron();
    if (bron.soort === 'supabase') {
      bron.bijAfmelden(() => { if (data) toonLogin('Je bent uitgelogd.'); });
      if (!(await bron.sessie())) { toonLogin(); return; }
      try { await naInloggen(); } catch (e) { toonLogin(e.message); }
      return;
    }
    await herlaad();
    toon();
  })().catch(e => { $('#inhoud').innerHTML = `<div class="kaart leeg"><strong>De app kon niet laden</strong>${esc(e.message)}</div>`; });
})();
