/*
 * Verbeterregistratie (VBR) – schermen en interactie
 * --------------------------------------------------
 * Opbouw:
 *   1. Opslag (localStorage)        – laden/bewaren van de data
 *   2. Hulpfuncties                 – o.a. veilig tonen van tekst (escapen tegen XSS)
 *   3. Navigatie per rol            – welk menu ziet wie
 *   4. Schermen                     – Indienen, Mijn voorstellen, Beoordelen, Dashboard, Berichten
 *   5. Detailvenster                – voorstel bekijken, beoordelen en status wijzigen
 *
 * De procesregels zelf staan in logica.js (VBR.*). Dit bestand roept die alleen aan.
 */
(function () {
  'use strict';

  // ===== 1. Opslag ==========================================================
  const OPSLAG_SLEUTEL = 'vbr-data-v1';
  const GEBRUIKER_SLEUTEL = 'vbr-gebruiker';

  function laad() {
    try {
      const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
      if (ruw) return JSON.parse(ruw);
    } catch (e) { /* geen opslag beschikbaar of kapotte data: val terug op demodata */ }
    return maakDemodata();
  }
  function bewaar() {
    try { localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(data)); } catch (e) { /* prototype: negeren */ }
  }

  let data = laad();
  let huidigeGebruikerId = (() => { try { return localStorage.getItem(GEBRUIKER_SLEUTEL); } catch (e) { return null; } })()
    || data.medewerkers[0].id;
  if (!data.medewerkers.some(m => m.id === huidigeGebruikerId)) huidigeGebruikerId = data.medewerkers[0].id;
  let huidigScherm = null;
  let beoordeelFilter = 'Te beoordelen';

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
  const datum = iso => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const datumTijd = iso => new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const PRIO_VOLGORDE = { Hoog: 0, Middel: 1, Laag: 2 };

  function statusLabel(status) {
    const klasse = 'status-' + status.split(' ')[0].replace(/\s/g, '') + (status === 'On hold' ? ' status-Onhold' : '');
    return `<span class="label ${esc(klasse)}">${esc(status)}</span>`;
  }
  function prioLabel(voorstelId) {
    const b = beoordelingVan(voorstelId);
    return b ? `<span class="label ${esc(b.prioriteit)}" title="Score ${b.score} van 9">${esc(b.prioriteit)}</span>`
      : '<span class="label grijs">Nog niet</span>';
  }

  let meldingTimer;
  function toonMelding(tekst, isFout) {
    const el = $('#melding');
    el.textContent = tekst;
    el.className = 'melding' + (isFout ? ' fout' : '');
    el.hidden = false;
    clearTimeout(meldingTimer);
    meldingTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ===== 3. Navigatie per rol ===============================================
  /** Iedereen mag indienen; stuurgroep beoordeelt; stuurgroep en management zien het dashboard. */
  function menuVoorRol(rol) {
    const basis = [['indienen', 'Voorstel indienen'], ['mijn', 'Mijn voorstellen'], ['berichten', 'Berichten']];
    if (rol === 'stuurgroep') return [['beoordelen', 'Beoordelen'], ['dashboard', 'Dashboard']].concat(basis);
    if (rol === 'management') return [['dashboard', 'Dashboard']].concat(basis);
    return basis;
  }

  function tekenKop() {
    const keuze = $('#gebruikerKeuze');
    keuze.innerHTML = data.medewerkers.map(m =>
      `<option value="${esc(m.id)}"${m.id === huidigeGebruikerId ? ' selected' : ''}>${esc(m.naam)} (${esc(m.rol)})</option>`).join('');
    const ongelezen = data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId && !n.gelezen).length;
    const teller = $('#belTeller');
    teller.textContent = ongelezen;
    teller.hidden = ongelezen === 0;
    $('#belKnop').setAttribute('aria-label', `Berichten (${ongelezen} ongelezen)`);
  }

  function tekenMenu() {
    const items = menuVoorRol(gebruiker().rol);
    if (!items.some(([sleutel]) => sleutel === huidigScherm)) huidigScherm = items[0][0];
    $('#menu').innerHTML = items.map(([sleutel, tekst]) =>
      `<button type="button" data-scherm="${sleutel}"${sleutel === huidigScherm ? ' aria-current="page"' : ''}>${esc(tekst)}</button>`).join('');
  }

  function toon(scherm) {
    if (scherm) huidigScherm = scherm;
    tekenKop();
    tekenMenu();
    const schermen = { indienen: schermIndienen, mijn: schermMijn, beoordelen: schermBeoordelen, dashboard: schermDashboard, berichten: schermBerichten };
    schermen[huidigScherm]();
  }

  // ===== 4. Schermen ========================================================

  // --- Kernfunctionaliteit 1: Voorstel indienen (max. 5 velden) ---
  function schermIndienen() {
    $('#inhoud').innerHTML = `
      <h2>Verbetervoorstel indienen</h2>
      <p class="intro">Zie je een kans om iets beter te doen, bij een klant of bij Egency zelf? Leg het hier vast. Invullen duurt een paar minuten. Je krijgt automatisch bericht bij elke statuswijziging.</p>
      <form id="indienForm" class="kaart formulier" novalidate>
        <div id="formFouten" class="fouten" hidden></div>
        <div class="veld">
          <label for="f-titel">1. Titel <span class="hint">(verplicht)</span></label>
          <input id="f-titel" name="titel" maxlength="100" required placeholder="Bijv. MFA afdwingen voor beheeraccounts">
        </div>
        <div class="veld">
          <label for="f-omschrijving">2. Wat is je voorstel? <span class="hint">(verplicht, wat zie je en wat stel je voor)</span></label>
          <textarea id="f-omschrijving" name="omschrijving" maxlength="2000" required></textarea>
          <div class="tekens"><span id="tellerOmschrijving">0</span>/2000</div>
        </div>
        <div class="veld">
          <label for="f-categorie">3. Categorie <span class="hint">(verplicht)</span></label>
          <select id="f-categorie" name="categorieId" required>
            <option value="">Kies een categorie…</option>
            ${data.categorieen.map(c => `<option value="${esc(c.id)}">${esc(c.naam)}: ${esc(c.omschrijving)}</option>`).join('')}
          </select>
        </div>
        <div class="veld">
          <label for="f-klant">4. Klant <span class="hint">(optioneel, als het over een klantomgeving gaat)</span></label>
          <input id="f-klant" name="klant" maxlength="100">
        </div>
        <div class="veld">
          <label for="f-opbrengst">5. Wat levert het op? <span class="hint">(optioneel, bijv. tijdwinst, minder risico, advies-omzet)</span></label>
          <textarea id="f-opbrengst" name="opbrengst" maxlength="500" style="min-height:70px"></textarea>
        </div>
        <div class="rij">
          <button class="knop" type="submit">Voorstel indienen</button>
          <span class="hint" style="color:var(--zacht)">Ingediend als ${esc(gebruiker().naam)}</span>
        </div>
      </form>`;
    const omschr = $('#f-omschrijving');
    omschr.addEventListener('input', () => { $('#tellerOmschrijving').textContent = omschr.value.length; });
    $('#indienForm').addEventListener('submit', e => {
      e.preventDefault();
      const invoer = Object.fromEntries(new FormData(e.target).entries());
      const fouten = VBR.valideerVoorstel(invoer, data.categorieen);
      const foutVak = $('#formFouten');
      if (fouten.length) {
        foutVak.innerHTML = `<ul>${fouten.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
        foutVak.hidden = false;
        foutVak.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const voorstel = VBR.dienVoorstelIn(data, invoer, huidigeGebruikerId);
      bewaar();
      toonMelding(`Bedankt! "${voorstel.titel}" is ingediend.`);
      toon('mijn');
    });
  }

  // --- Mijn voorstellen: indiener volgt de voortgang (terugkoppeling) ---
  function schermMijn() {
    const mijn = data.voorstellen.filter(v => v.indienerId === huidigeGebruikerId)
      .sort((a, b) => b.ingediendOp.localeCompare(a.ingediendOp));
    $('#inhoud').innerHTML = `
      <h2>Mijn voorstellen</h2>
      <p class="intro">Hier zie je wat er met jouw ideeën gebeurt. Klik op een voorstel voor de volledige historie.</p>
      <div class="kaart tabel-wrap">
        ${mijn.length ? `<table>
          <thead><tr><th>Voorstel</th><th>Categorie</th><th>Ingediend</th><th>Status</th><th>Laatste update</th></tr></thead>
          <tbody>${mijn.map(v => {
            const laatste = data.statuswijzigingen.filter(s => s.voorstelId === v.id).sort((a, b) => b.datum.localeCompare(a.datum))[0];
            return `<tr class="klikbaar" data-voorstel="${esc(v.id)}" tabindex="0">
              <td>${esc(v.titel)}</td><td>${esc(categorieVan(v.categorieId))}</td><td>${datum(v.ingediendOp)}</td>
              <td>${statusLabel(v.status)}</td><td>${laatste ? datumTijd(laatste.datum) : '-'}</td></tr>`;
          }).join('')}</tbody></table>`
        : `<p class="leeg">Je hebt nog geen voorstellen ingediend. <button class="link" type="button" data-scherm="indienen">Dien je eerste voorstel in</button>.</p>`}
      </div>`;
  }

  // --- Kernfunctionaliteit 2: Beoordelen (stuurgroep) ---
  function schermBeoordelen() {
    const filters = {
      'Te beoordelen': v => ['Ingediend', 'In beoordeling'].includes(v.status),
      'On hold': v => v.status === 'On hold',
      'Goedgekeurd / ingepland': v => ['Goedgekeurd', 'Ingepland'].includes(v.status),
      'Afgerond': v => ['Overgedragen aan Freshservice', 'Afgewezen'].includes(v.status),
      'Alle': () => true,
    };
    const lijst = data.voorstellen.filter(filters[beoordeelFilter]).sort((a, b) => {
      const pa = beoordelingVan(a.id), pb = beoordelingVan(b.id);
      const va = pa ? PRIO_VOLGORDE[pa.prioriteit] : -1, vb = pb ? PRIO_VOLGORDE[pb.prioriteit] : -1; // onbeoordeeld bovenaan
      return va - vb || a.ingediendOp.localeCompare(b.ingediendOp);
    });
    $('#inhoud').innerHTML = `
      <h2>Beoordelen</h2>
      <p class="intro">Werklijst voor het wekelijkse stuurgroepoverleg. Nog niet beoordeelde voorstellen staan bovenaan, daarna op prioriteit.</p>
      <div class="filters" role="group" aria-label="Filter">
        ${Object.keys(filters).map(f => `<button type="button" class="chip" data-filter="${esc(f)}" aria-pressed="${f === beoordeelFilter}">${esc(f)} (${data.voorstellen.filter(filters[f]).length})</button>`).join('')}
      </div>
      <div class="kaart tabel-wrap">
        ${lijst.length ? `<table>
          <thead><tr><th>Voorstel</th><th>Indiener</th><th>Categorie</th><th>Ingediend</th><th>Prioriteit</th><th>Status</th></tr></thead>
          <tbody>${lijst.map(v => `<tr class="klikbaar" data-voorstel="${esc(v.id)}" tabindex="0">
            <td>${esc(v.titel)}${v.klant ? `<br><small style="color:var(--zacht)">${esc(v.klant)}</small>` : ''}</td>
            <td>${esc(naamVan(v.indienerId))}</td><td>${esc(categorieVan(v.categorieId))}</td><td>${datum(v.ingediendOp)}</td>
            <td>${prioLabel(v.id)}</td><td>${statusLabel(v.status)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="leeg">Geen voorstellen in deze lijst.</p>'}
      </div>`;
  }

  // --- Kernfunctionaliteit 3: Dashboard (management) ---
  function schermDashboard() {
    const c = VBR.dashboardCijfers(data);
    const balken = (items, klasse) => {
      const max = Math.max(1, ...items.map(i => i.aantal));
      return items.map(i => `<div class="balk-rij"><span>${esc(i.naam)}</span>
        <div class="balk" role="img" aria-label="${esc(i.naam)}: ${i.aantal}"><span class="${esc(klasse ? klasse(i) : '')}" style="width:${(i.aantal / max) * 100}%"></span></div>
        <span class="aantal">${i.aantal}</span></div>`).join('');
    };
    const openHoog = data.voorstellen.filter(v => VBR.OPEN_STATUSSEN.includes(v.status) && (beoordelingVan(v.id) || {}).prioriteit === 'Hoog');
    $('#inhoud').innerHTML = `
      <h2>Dashboard</h2>
      <p class="intro">In één oogopslag: hoeveel ideeën er zijn, wat er nog openstaat en of de stuurgroep op tijd reageert.</p>
      <div class="tegels">
        <div class="tegel"><div class="getal">${c.totaal}</div><div class="naam">Voorstellen totaal</div></div>
        <div class="tegel"><div class="getal">${c.open}</div><div class="naam">Nog open</div></div>
        <div class="tegel"><div class="getal">${c.afgerond}</div><div class="naam">Overgedragen aan Freshservice</div></div>
        <div class="tegel"><div class="getal">${c.gemReactieDagen === null ? '-' : c.gemReactieDagen + ' d'}</div><div class="naam">Gem. tijd tot eerste reactie</div></div>
        <div class="tegel${c.teLangOpen.length ? ' waarschuwing' : ''}"><div class="getal">${c.teLangOpen.length}</div><div class="naam">Langer dan ${VBR.MAX_DAGEN_ZONDER_REACTIE} dagen zonder reactie</div></div>
      </div>
      <div class="twee-kolom">
        <div class="kaart"><h3>Per status</h3>${balken(VBR.STATUSSEN.map(s => ({ naam: s, aantal: c.perStatus[s] })))}</div>
        <div class="kaart"><h3>Open voorstellen per prioriteit</h3>${balken(Object.entries(c.perPrioriteit).map(([naam, aantal]) => ({ naam, aantal })), i => i.naam)}</div>
        <div class="kaart"><h3>Per categorie</h3>${balken(c.perCategorie)}</div>
        <div class="kaart" style="grid-column: 1 / -1"><h3>Aandacht nodig</h3>
          ${c.teLangOpen.length || openHoog.length ? `<ul style="margin:0;padding-left:1.1rem">
            ${c.teLangOpen.map(v => `<li><a href="#" data-voorstel="${esc(v.id)}">${esc(v.titel)}</a>: wacht al sinds ${datum(v.ingediendOp)} op beoordeling</li>`).join('')}
            ${openHoog.map(v => `<li><a href="#" data-voorstel="${esc(v.id)}">${esc(v.titel)}</a>: hoge prioriteit, status ${esc(v.status)}</li>`).join('')}
          </ul>` : '<p class="leeg">Niets dat nu aandacht vraagt.</p>'}
        </div>
      </div>`;
  }

  // --- Berichten: de automatische terugkoppeling aan de indiener ---
  function schermBerichten() {
    const mijn = data.notificaties.filter(n => n.ontvangerId === huidigeGebruikerId).sort((a, b) => b.datum.localeCompare(a.datum));
    $('#inhoud').innerHTML = `
      <h2>Berichten</h2>
      <p class="intro">Automatische meldingen over jouw voorstellen. In de echte applicatie gaat dit bericht ook per e-mail of Teams naar je toe.</p>
      <div class="kaart">
        ${mijn.some(n => !n.gelezen) ? '<div class="rij" style="justify-content:flex-end"><button class="knop tweede" type="button" id="allesGelezen">Alles als gelezen markeren</button></div>' : ''}
        ${mijn.length ? mijn.map(n => `<div class="bericht ${n.gelezen ? 'gelezen' : 'ongelezen'}">
            <span class="stip" aria-hidden="true"></span>
            <div><div>${esc(n.bericht)}</div>
            <div class="rij" style="font-weight:400;font-size:.82rem;color:var(--zacht)">${datumTijd(n.datum)} · <button class="link" type="button" data-voorstel="${esc(n.voorstelId)}" data-notificatie="${esc(n.id)}">Bekijk voorstel</button></div></div>
          </div>`).join('') : '<p class="leeg">Nog geen berichten.</p>'}
      </div>`;
    const knop = $('#allesGelezen');
    if (knop) knop.addEventListener('click', () => {
      mijn.forEach(n => { n.gelezen = true; });
      bewaar();
      toon();
    });
  }

  // ===== 5. Detailvenster ===================================================
  function openDetail(voorstelId) {
    const v = data.voorstellen.find(x => x.id === voorstelId);
    if (!v) return;
    const isStuurgroep = gebruiker().rol === 'stuurgroep';
    const b = beoordelingVan(v.id);
    const historie = data.statuswijzigingen.filter(s => s.voorstelId === v.id).sort((a, c) => a.datum.localeCompare(c.datum));
    const vervolg = VBR.OVERGANGEN[v.status] || [];
    const keuze = (naam, waarde) => ['laag', 'middel', 'hoog'].map(n =>
      `<option value="${n}"${waarde === n ? ' selected' : ''}>${n[0].toUpperCase() + n.slice(1)}</option>`).join('');

    const dlg = $('#detail');
    dlg.innerHTML = `
      <div class="detail-kop">
        <div><h2 style="margin:0">${esc(v.titel)}</h2>
          <div class="rij" style="margin-top:.4rem">${statusLabel(v.status)} ${prioLabel(v.id)}</div></div>
        <button class="sluit" type="button" data-sluit aria-label="Sluiten">×</button>
      </div>
      <div class="detail-body">
        <dl class="gegevens">
          <dt>Omschrijving</dt><dd>${esc(v.omschrijving)}</dd>
          <dt>Categorie</dt><dd>${esc(categorieVan(v.categorieId))}</dd>
          <dt>Klant</dt><dd>${esc(v.klant || '-')}</dd>
          <dt>Verwachte opbrengst</dt><dd>${esc(v.opbrengst || '-')}</dd>
          <dt>Ingediend door</dt><dd>${esc(naamVan(v.indienerId))} op ${datum(v.ingediendOp)}</dd>
          ${b ? `<dt>Beoordeling</dt><dd>Impact ${esc(b.impact)}, urgentie ${esc(b.urgentie)}, inzet ${esc(b.inzet)}, score ${b.score}/9 (${esc(b.prioriteit)})${b.geplandeWeek ? `<br>Gepland in week ${esc(b.geplandeWeek)}` : ''}${b.notitie ? `<br>Notitie: ${esc(b.notitie)}` : ''}</dd>` : ''}
        </dl>

        ${isStuurgroep && vervolg.length ? `
        <section class="sectie">
          <h3>Beoordelen</h3>
          <form id="beoordeelForm" class="formulier" style="max-width:none">
            <div class="scores">
              <div class="veld"><label for="b-impact">Impact</label><select id="b-impact" name="impact">${keuze('impact', b ? b.impact : 'middel')}</select></div>
              <div class="veld"><label for="b-urgentie">Urgentie</label><select id="b-urgentie" name="urgentie">${keuze('urgentie', b ? b.urgentie : 'middel')}</select></div>
              <div class="veld"><label for="b-inzet">Benodigde inzet</label><select id="b-inzet" name="inzet">${keuze('inzet', b ? b.inzet : 'middel')}</select></div>
            </div>
            <div id="uitkomst" class="uitkomst" aria-live="polite"></div>
            <div class="scores">
              <div class="veld"><label for="b-week">Geplande week <span class="hint">(capaciteit)</span></label><input id="b-week" name="geplandeWeek" type="week" value="${esc(b ? b.geplandeWeek : '')}"></div>
              <div class="veld" style="grid-column: span 2"><label for="b-notitie">Notitie stuurgroep <span class="hint">(intern)</span></label><input id="b-notitie" name="notitie" maxlength="300" value="${esc(b ? b.notitie : '')}"></div>
            </div>
            <div class="rij"><button class="knop tweede" type="submit">Beoordeling opslaan</button></div>
          </form>
        </section>
        <section class="sectie">
          <h3>Status wijzigen</h3>
          <p style="margin:0 0 .6rem;color:var(--zacht)">De indiener krijgt automatisch een bericht met je toelichting.</p>
          <div class="formulier" style="max-width:none">
            <div class="veld"><label for="s-toelichting">Toelichting aan indiener <span class="hint">(verplicht bij afwijzen en on hold)</span></label>
              <textarea id="s-toelichting" maxlength="500" style="min-height:70px"></textarea></div>
            <div class="rij">${vervolg.map(s => `<button type="button" class="knop${s === 'Afgewezen' ? ' gevaar' : s === 'On hold' ? ' tweede' : ''}" data-naar="${esc(s)}">${esc(s === 'Overgedragen aan Freshservice' ? 'Overdragen aan Freshservice' : 'Naar: ' + s)}</button>`).join('')}</div>
          </div>
        </section>` : ''}

        <section class="sectie">
          <h3>Historie</h3>
          <ol class="tijdlijn">${historie.map(s => `<li><div><strong>${esc(s.naarStatus)}</strong> door ${esc(naamVan(s.doorId))}</div>
            ${s.toelichting ? `<div>${esc(s.toelichting)}</div>` : ''}
            <div class="wanneer">${datumTijd(s.datum)}</div></li>`).join('')}</ol>
        </section>
      </div>`;

    // Live prioriteit tonen terwijl de stuurgroep scoort
    const form = dlg.querySelector('#beoordeelForm');
    if (form) {
      const werkUitkomstBij = () => {
        const f = Object.fromEntries(new FormData(form).entries());
        const p = VBR.berekenPrioriteit(f.impact, f.urgentie, f.inzet);
        $('#uitkomst').innerHTML = `Berekende prioriteit: <span class="label ${p.prioriteit}">${p.prioriteit}</span> (score ${p.score} van 9 = impact + urgentie + omgekeerde inzet)`;
      };
      form.addEventListener('change', werkUitkomstBij);
      werkUitkomstBij();
      form.addEventListener('submit', e => {
        e.preventDefault();
        try {
          VBR.slaBeoordelingOp(data, v.id, Object.fromEntries(new FormData(form).entries()), huidigeGebruikerId);
          bewaar();
          toonMelding('Beoordeling opgeslagen.');
          openDetail(v.id);
          toon();
        } catch (err) { toonMelding(err.message, true); }
      });
    }
    dlg.querySelectorAll('[data-naar]').forEach(knop => knop.addEventListener('click', () => {
      try {
        VBR.wijzigStatus(data, v.id, knop.dataset.naar, huidigeGebruikerId, $('#s-toelichting').value);
        bewaar();
        toonMelding(`Status gewijzigd naar "${knop.dataset.naar}". ${naamVan(v.indienerId)} is automatisch op de hoogte gebracht.`);
        openDetail(v.id);
        toon();
      } catch (err) { toonMelding(err.message, true); }
    }));
    if (!dlg.open) dlg.showModal();
  }

  // ===== Gebeurtenissen (één centrale klik-afhandeling) =====================
  document.addEventListener('click', e => {
    const doel = e.target.closest('[data-scherm], [data-filter], [data-voorstel], [data-sluit]');
    if (!doel) return;
    if (doel.tagName === 'A') e.preventDefault();
    if (doel.dataset.sluit !== undefined) { $('#detail').close(); return; }
    if (doel.dataset.scherm) { toon(doel.dataset.scherm); return; }
    if (doel.dataset.filter) { beoordeelFilter = doel.dataset.filter; toon(); return; }
    if (doel.dataset.voorstel) {
      if (doel.dataset.notificatie) {
        const n = data.notificaties.find(x => x.id === doel.dataset.notificatie);
        if (n && !n.gelezen) { n.gelezen = true; bewaar(); toon(); }
      }
      openDetail(doel.dataset.voorstel);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('tr[data-voorstel]')) openDetail(e.target.dataset.voorstel);
  });
  $('#detail').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#gebruikerKeuze').addEventListener('change', e => {
    huidigeGebruikerId = e.target.value;
    try { localStorage.setItem(GEBRUIKER_SLEUTEL, huidigeGebruikerId); } catch (err) { /* negeren */ }
    huidigScherm = null;
    toon();
  });
  $('#belKnop').addEventListener('click', () => toon('berichten'));
  $('#resetKnop').addEventListener('click', () => {
    data = maakDemodata();
    bewaar();
    toonMelding('Demodata hersteld.');
    toon();
  });
  $('#exportKnop').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'verbeterregistratie-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  toon();
})();
