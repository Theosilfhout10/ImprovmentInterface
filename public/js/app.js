/*
 * Verbeterregistratie (VBR) – schermen en interactie
 * --------------------------------------------------
 * Opbouw:
 *   1. Gegevensbron (adapter)  – praat met de server, of werkt los in de browser (demo/preview)
 *   2. Hulpfuncties            – o.a. veilig tonen van tekst (escapen tegen XSS)
 *   3. Navigatie per rol       – welk menu ziet wie
 *   4. Schermen                – Nieuw voorstel, Mijn voorstellen, Beoordelen, Dashboard
 *   5. Vensters                – voorstel (bekijken, beoordelen, status), berichten, verzonden e-mails
 *
 * De procesregels staan in logica.js (VBR.*). Dit bestand roept die alleen aan.
 */
(function () {
  'use strict';

  // ===== 1. Gegevensbron ====================================================
  /*
   * Adapter-patroon: de schermen roepen altijd dezelfde functies aan (bron.dienIn, bron.wijzigStatus, ...).
   *  - ServerBron: de echte situatie. Data staat op de server, e-mails gaan via de server.
   *  - LokaleBron: als er geen server is (bestand los geopend of de online preview). Data staat dan
   *    alleen in deze browser en er wordt niets gemaild.
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
      postvak: async () => [],
      reset: () => veilig(() => { lokaal = maakDemodata(); }),
    };
  }

  let bron;
  let data = null;
  let mailInfo = { stand: 'geen' };
  let demoModus = true;
  let huidigeGebruikerId = (() => { try { return localStorage.getItem(GEBRUIKER_SLEUTEL); } catch (e) { return null; } })();
  let huidigScherm = null;
  let beoordeelFilter = 'Te beoordelen';
  let openVoorstelId = null;

  async function kiesBron() {
    if (location.protocol.startsWith('http')) {
      try {
        const s = ServerBron();
        await s.laad();
        return s;
      } catch (e) { /* geen server bereikbaar: val terug op de lokale demo */ }
    }
    return LokaleBron();
  }

  async function herlaad() {
    const r = await bron.laad();
    data = r.data; mailInfo = r.mail || mailInfo; demoModus = r.demoModus;
    if (!data.medewerkers.some(m => m.id === huidigeGebruikerId)) huidigeGebruikerId = data.medewerkers[0].id;
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
    const basis = [['indienen', 'Nieuw voorstel'], ['mijn', 'Mijn voorstellen']];
    if (rol === 'stuurgroep') return [['beoordelen', 'Beoordelen'], ['dashboard', 'Dashboard']].concat(basis);
    if (rol === 'management') return [['dashboard', 'Dashboard']].concat(basis);
    return basis;
  }

  function tekenKop() {
    $('#gebruikerKeuze').innerHTML = data.medewerkers.map(m =>
      `<option value="${esc(m.id)}"${m.id === huidigeGebruikerId ? ' selected' : ''}>${esc(m.naam)}</option>`).join('');
    const ongelezen = data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId && !n.gelezen).length;
    const teller = $('#belTeller');
    teller.textContent = ongelezen > 9 ? '9+' : ongelezen;
    teller.hidden = ongelezen === 0;
    $('#belKnop').setAttribute('aria-label', `Berichten, ${ongelezen} ongelezen`);

    const items = menuVoorRol(gebruiker().rol);
    if (!items.some(([s]) => s === huidigScherm)) huidigScherm = items[0][0];
    $('#menu').innerHTML = items.map(([s, t]) =>
      `<button type="button" data-scherm="${s}"${s === huidigScherm ? ' aria-current="page"' : ''}>${esc(t)}</button>`).join('');
  }

  function tekenVoet() {
    const delen = [];
    if (bron.soort === 'lokaal') delen.push('<span>Demo in de browser: gegevens blijven op dit apparaat</span>');
    else if (mailInfo.stand === 'gmail') delen.push(`<span>E-mail actief${mailInfo.testOntvanger ? ' (testadres)' : ''}</span>`);
    else delen.push('<span>E-mail in voorbeeldstand</span>');
    if (demoModus && bron.soort === 'server') delen.push('<button type="button" class="tekstknop" data-actie="postvak">Verzonden e-mails</button>');
    if (demoModus) delen.push('<button type="button" class="tekstknop" data-actie="reset">Demodata herstellen</button>');
    $('#voet').innerHTML = delen.join('');
  }

  function toon(scherm) {
    if (scherm) huidigScherm = scherm;
    tekenKop();
    tekenVoet();
    ({ indienen: schermIndienen, mijn: schermMijn, beoordelen: schermBeoordelen, dashboard: schermDashboard })[huidigScherm]();
  }

  /** Een rij in een lijst: titel, meta-regel, rechts labels en een pijltje. */
  function voorstelRij(v, meta) {
    return `<li><button type="button" class="rij" data-voorstel="${esc(v.id)}">
      <span class="rij-tekst"><span class="rij-titel">${esc(v.titel)}</span><span class="rij-meta">${esc(meta)}</span></span>
      <span class="rij-rechts">${prioPil(v.id)}${statusPil(v.status)}</span>${CHEVRON}</button></li>`;
  }

  // ===== 4. Schermen ========================================================

  // --- Kernfunctionaliteit 1: Nieuw voorstel (max. 5 velden) ---
  function schermIndienen() {
    $('#inhoud').innerHTML = `
      <div class="paginakop">
        <h1>Nieuw voorstel</h1>
        <p>Zie je iets dat beter kan? Leg het vast. Je hoort bij elke stap wat ermee gebeurt.</p>
      </div>
      <form id="indienForm" class="formulier" novalidate>
        <div class="kaart velden">
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
      </div>`;
  }

  // ===== 5. Vensters ========================================================
  function openVenster(titel, inhoud) {
    const v = $('#venster');
    v.innerHTML = `<div class="venster-kop"><span style="width:52px"></span><h2>${esc(titel)}</h2><button type="button" class="tekstknop" data-sluit style="width:52px;text-align:right">Klaar</button></div><div class="venster-body">${inhoud}</div>`;
    if (!v.open) v.showModal();
    return v;
  }
  function sluitVenster() { const v = $('#venster'); if (v.open) v.close(); openVoorstelId = null; }

  /** Voorstel bekijken; de stuurgroep kan hier ook beoordelen en de status wijzigen. */
  function openVoorstel(voorstelId) {
    const v = data.voorstellen.find(x => x.id === voorstelId);
    if (!v) return;
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
      </section>`);

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

  /** Berichten van de ingelogde gebruiker (de terugkoppeling, ook verstuurd per e-mail). */
  function openBerichten() {
    const mijn = data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId).sort((a, b) => b.datum.localeCompare(a.datum));
    const mailLabel = { verzonden: ' · e-mail verzonden', voorbeeld: ' · e-mail (voorbeeld)', mislukt: ' · e-mail mislukt' };
    openVenster('Berichten', `
      ${mijn.some(n => !n.gelezen) ? '<div class="knoppen" style="justify-content:flex-end"><button type="button" class="tekstknop" data-actie="allesGelezen">Alles gelezen</button></div>' : ''}
      <div class="kaart">${mijn.length ? `<ul class="lijst">${mijn.map(n => `<li><button type="button" class="bericht ${n.gelezen ? 'gelezen' : ''}" data-voorstel="${esc(n.voorstelId)}" data-notificatie="${esc(n.id)}">
        <span class="punt" aria-hidden="true"></span>
        <span class="bericht-tekst"><span>${esc(n.bericht)}</span><span class="bericht-meta">${datumTijd(n.datum)}${mailLabel[n.mail] || ''}</span></span></button></li>`).join('')}</ul>`
        : '<div class="leeg">Nog geen berichten.</div>'}</div>`);
  }

  /** Demo: laat zien welke e-mails de server heeft verstuurd (of in voorbeeldstand zou versturen). */
  async function openPostvak() {
    const lijst = await bron.postvak();
    openVenster('Verzonden e-mails', `
      <p style="margin:0;color:var(--tekst-2)">${mailInfo.stand === 'gmail' ? 'Deze e-mails zijn via Gmail verzonden.' : 'Voorbeeldstand: deze e-mails zijn opgesteld maar niet verzonden. Vul het .env-bestand in om echt te mailen.'}</p>
      <div class="kaart">${lijst.length ? `<ul class="lijst">${lijst.map(m => `<li><div class="rij" style="cursor:default"><span class="rij-tekst"><span class="rij-titel">${esc(m.onderwerp)}</span><span class="rij-meta">Aan ${esc(m.aan)} · ${datumTijd(m.datum)} · ${esc(m.status)}</span></span></div><pre class="mail-tekst">${esc(m.tekst)}</pre></li>`).join('')}</ul>`
        : '<div class="leeg">Nog geen e-mails sinds de server is gestart.</div>'}</div>`);
  }

  // ===== Gebeurtenissen =====================================================
  document.addEventListener('click', async e => {
    const doel = e.target.closest('[data-scherm], [data-filter], [data-voorstel], [data-sluit], [data-actie]');
    if (!doel) return;
    if (doel.dataset.sluit !== undefined) { sluitVenster(); return; }
    if (doel.dataset.scherm) { sluitVenster(); toon(doel.dataset.scherm); window.scrollTo(0, 0); return; }
    if (doel.dataset.filter) { beoordeelFilter = doel.dataset.filter; toon(); return; }
    if (doel.dataset.voorstel) {
      if (doel.dataset.notificatie) {
        const n = data.notificaties.find(x => x.id === doel.dataset.notificatie);
        if (n && !n.gelezen) { await doe(() => bron.markeerGelezen([n.id])).catch(() => {}); tekenKop(); }
      }
      openVoorstel(doel.dataset.voorstel);
      return;
    }
    const actie = doel.dataset.actie;
    if (actie === 'allesGelezen') { await doe(() => bron.markeerGelezen([])).catch(() => {}); tekenKop(); openBerichten(); }
    if (actie === 'postvak') openPostvak().catch(err => toonMelding(err.message, true));
    if (actie === 'reset') { await doe(() => bron.reset(), 'Demodata hersteld.').catch(() => {}); sluitVenster(); toon(); }
  });
  $('#venster').addEventListener('click', e => { if (e.target === e.currentTarget) sluitVenster(); });
  $('#venster').addEventListener('close', () => { openVoorstelId = null; });
  $('#gebruikerKeuze').addEventListener('change', e => {
    huidigeGebruikerId = e.target.value;
    try { localStorage.setItem(GEBRUIKER_SLEUTEL, huidigeGebruikerId); } catch (err) { /* negeren */ }
    huidigScherm = null;
    sluitVenster();
    toon();
  });
  $('#belKnop').addEventListener('click', openBerichten);

  // Elke 30 seconden verversen, zodat je wijzigingen van collega's ziet (niet tijdens het typen in een venster).
  setInterval(async () => {
    if (bron.soort !== 'server' || $('#venster').open || document.activeElement.matches('input, textarea')) return;
    try { await herlaad(); toon(); } catch (e) { /* volgende keer opnieuw */ }
  }, 30000);

  // ===== Start ==============================================================
  (async function start() {
    bron = await kiesBron();
    await herlaad();
    toon();
  })().catch(e => { $('#inhoud').innerHTML = `<div class="kaart leeg"><strong>De app kon niet laden</strong>${esc(e.message)}</div>`; });
})();
