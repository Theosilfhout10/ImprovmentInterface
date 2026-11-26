# Iteratielog – Verbeterregistratie

Vibecoding-aanpak: de code is gegenereerd met hulp van AI (Claude) op basis van het projectplan, het applicatievoorstel en de stakeholderanalyse. Per iteratie staat wat het doel was, wat is gebouwd, wat is gecontroleerd en wat is aangepast.

## Iteratie 1 – eerste werkende versie (25-11-2026)

**Doel (wat wilde ik leren of valideren?)**
Kan het proces uit het projectplan (indienen → wekelijks beoordelen → terugkoppeling → dashboard) in een eenvoudige applicatie worden gevangen, binnen de grens van 3 kernfunctionaliteiten en 6 entiteiten?

**Centrale requirements:** R1 indienen, R2 automatische terugkoppeling, R3 prioriteren, R4 dashboard.

**Wat is gebouwd en met welke hulpmiddelen**
- Webapplicatie in HTML, CSS en JavaScript, zonder framework of installatie, zodat hij overal te demonstreren is.
- Bedrijfsregels gescheiden van de schermen (`js/logica.js`), zodat ze los te testen en uit te leggen zijn.
- 15 geautomatiseerde tests (Node.js `node:test`) en een GitHub Actions-workflow die ze bij elke push draait.
- Hulpmiddelen: Claude (code genereren), GitHub (versiebeheer), Playwright (browsertest).

**Controle van de AI-output**
- Alle tests geslaagd, browsertest zonder JavaScript-fouten.
- XSS-test: HTML in de titel wordt letterlijk getoond, niet uitgevoerd.
- Visuele controle van alle schermen op laptop- en telefoonformaat.

**Aanpassingen na de eerste test**
- De teller met ongelezen berichten toonde "0" terwijl hij verborgen hoorde te zijn (CSS overschreef `hidden`). Opgelost.
- Op een telefoon scrolde de pagina horizontaal door de brede gebruikerskeuze. Opgelost.
- Links in "Aandacht nodig" op het dashboard braken verkeerd af. Omgezet naar gewone links.

**Keuzes en waarom**
- Prioriteit wordt **berekend** in plaats van gekozen: consistent tussen stuurgroepleden en uitlegbaar.
- Afwijzen en on hold **vereisen een toelichting**: het grootste projectrisico is "geen terugkoppeling", en een kale afwijzing ontmoedigt indieners.
- Klant is een tekstveld, geen entiteit: blijft binnen de 6 entiteiten en klantbeheer valt buiten scope.

**Beperkingen en nieuwe risico's**
- Geen echte login en geen gedeelde opslag: geschikt voor demo en feedback, niet voor livegang.
- Terugkoppeling via e-mail/Teams is nog gesimuleerd.

**Betekenis voor het vervolg naar MVP**
Platformkeuze voor gedeelde opslag, login via Microsoft 365 en echte meldingen (e-mail/Teams) worden de belangrijkste onderdelen van het Plan van Aanpak.

## Iteratie 2 – kwaliteit op basis van de vibecoding-training (25-11-2026)

**Doel:** het prototype toetsen aan de kwaliteitsattributen en engineeringtechnieken uit de training *Softwareontwikkeling & Vibecoding*.

**Wat is aangepast**
- Rolcontrole verplaatst van alleen de schermen naar de logica: een verborgen knop is geen beveiliging.
- 3 extra tests: autorisatie, rare invoer, performance bij 1.000 voorstellen (18 in totaal).
- Mini-specificatie voor de AI ([spec.md](spec.md)), promptlog ([promptlog.md](promptlog.md)), acceptatiecriteria als Gegeven/Als/Dan en een kwaliteitsanalyse met de route naar productie ([kwaliteit.md](kwaliteit.md)).
- Werkwijze: deze wijziging loopt via een pull request, zodat er een code review plaatsvindt vóór samenvoegen.

**Geleerd:** de training benadrukt dat vibecoding sterk is voor de eerste versie, maar dat productie expliciete keuzes vraagt over security, data en beheer. Die keuzes staan nu zichtbaar in de documentatie in plaats van alleen in mijn hoofd.

## Iteratie 3 – van demo naar bruikbaar (25-11-2026)

**Feedback (Theo, als product owner-vertegenwoordiger):** "Preview ziet er goed uit, maar is te AI-gebouwd qua stijl. Moet makkelijker te gebruiken zijn zonder afleiding. Egency-huisstijl, clean, Apple-stijl. Het is een prototype dat wel moet werken en dat we misschien gaan gebruiken. Mailen als dat kan."

**Afwegingen**
- *Mail vanuit de browser (bijv. EmailJS) of een eigen server?* Gekozen voor een kleine Node.js-server: de sleutels blijven geheim (in de browser zijn ze voor iedereen leesbaar) en hij lost meteen het tweede probleem op, namelijk dat data per browser stond en collega's elkaars voorstellen niet zagen.
- *Database of bestand?* Een JSON-bestand: past bij ~20 gebruikers, geen beheer, en uitlegbaar. Database blijft een MVP-stap.
- *Framework (React) of niet?* Niet: de app blijft klein en uitlegbaar. Alleen Express (webserver) en Nodemailer (mail) als pakketten.
- *Stijl:* geen Apple-design-skill beschikbaar; daarom zelf de principes uit Apple's Human Interface Guidelines toegepast (gegroepeerde lijsten, segmented controls, sheets, veel witruimte, systeemlettertype) met de Egency-kleuren en het logo van egency.nl.

**Wat is aangepast**
- Server met API en gedeelde opslag; bedrijfsregels worden op de server opnieuw gecontroleerd.
- E-mail via Gmail met app-wachtwoord in `.env` (niet in GitHub), voorbeeldstand zonder instellingen, testadres-schakelaar zodat collega's tijdens testen geen mail krijgen.
- Nieuw ontwerp: minder tekst, geen tabellen maar lijsten, categorie en scores als segmented controls, berichten achter de bel, foutmeldingen direct bij het veld.
- 8 extra tests voor server, opslag en e-mail (26 in totaal).

**Nieuwe risico's**
- Zonder echte login kan iedereen op het netwerk zich als stuurgroep voordoen. Niet op internet zetten vóór Microsoft 365-login.
- Gmail-account is een losse afhankelijkheid; voor productie beter via de Microsoft 365-mail van Egency.

## Iteratie 4 – online demo met drie accounts en live updates (25-11-2026)

**Aanleiding (Theo):** "Ik wil 3 accounts hebben waarmee ik kan inloggen op de GitHub-link en een kleine demo geven waar ze echt data zien en elke rol duidelijk is. Ik wil met data op 3 verschillende apparaten live de veranderingen zien."

**Afwegingen**
- *Eigen server hosten of een dienst?* GitHub Pages kan alleen statische bestanden; de Node-server draait daar niet. Gratis Node-hosting (bijv. Render) slaapt en verliest het JSON-bestand bij een herstart. Gekozen voor Supabase (gratis): login, Postgres-database en live updates in één.
- *Regels in de browser of in de database?* In de database. De publishable key is openbaar, dus alles wat de browser mag, mag iedereen met die key. Daarom: alleen lezen via Row Level Security, schrijven alleen via functies die rol en procesregels controleren.
- *Live: elke paar seconden opvragen of Realtime?* Realtime (websocket): direct, en geen onnodig verkeer. Vangnet: als de verbinding wegvalt, ververst de app elke 30 seconden en direct bij terugkeer naar het tabblad.
- *Supabase-bibliotheek van een CDN of meeleveren?* Meegeleverd (`public/js/vendor/`), vaste versie: geen afhankelijkheid van een externe server.

**Wat is aangepast**
- `supabase/schema.sql` + gegenereerd `supabase/installatie.sql` (schema + demodata, `npm run supabase-sql`).
- Inlogscherm met de drie demo-accounts; rol als gekleurd label in de kop; uitloggen.
- Live verversen met melding bij een nieuw bericht; indicator "Live" in de voet.
- Databasetest (`tests/supabase.test.js`, rechten en bedrijfsregels) draait in GitHub Actions op een echte PostgreSQL.

**Feedback en resultaat**
- Theo heeft de live demo getest (25-11-2026): alles werkt zoals bedoeld en wijzigingen verschijnen direct op de andere apparaten (TC-12).
- Feedback van stakeholders (Olaf, testers) volgt in iteratie 5.

**Nieuwe risico's**
- Gratis Supabase pauzeert na 7 dagen stilte. Vóór de demo controleren.
- De online versie verstuurt geen e-mail; berichten staan wel in de app.
- Demo-accounts delen een wachtwoord met testers: na de demo wachtwoorden wijzigen of accounts verwijderen.

**Betekenis voor MVP**
- De architectuur "statische app + beheerde database met regels in de database" werkt en is een serieuze MVP-optie naast Power Apps/SharePoint. Te beslissen in het Plan van Aanpak (E6): hosting binnen Egency of Supabase (privacy, verwerkersovereenkomst, beheer), Microsoft 365-login, e-mail of Teams voor meldingen.

## Iteratie 5a – gesprek per voorstel (26-11-2026)

**Aanleiding (Theo):** "Kan je toevoegen dat gebruikers kunnen chatten in een verbetervoorstel zodat de stuurgroep vragen kan stellen per verbetervoorstel?"

**Afspraken vooraf (vragen gesteld en beantwoord door Theo, 26-11-2026)**
- Een 7e entiteit mag ("wordt niet moeilijk over gedaan").
- Het gesprek is privé tussen de indiener en de behandelaar (stuurgroep). Management en andere medewerkers zien het niet.
- Live, zonder verversen.
- Melding in de app bij een nieuw bericht, geen e-mail.
- Niet verwijderen; bewerken mag tot 15 minuten na verzenden.
- Ongelezen-indicator bij het voorstel in de lijsten.

**Afwegingen**
- *Eigen entiteit of reacties opslaan in STATUSWIJZIGING?* Eigen entiteit REACTIE: andere rechten en levensloop dan een statuswijziging. Kost de 6-entiteitengrens; met Theo afgestemd.
- *Melding: nieuwe tabel of NOTIFICATIE hergebruiken?* NOTIFICATIE hergebruikt, met een verwijzing naar óf een statuswijziging óf een reactie. Zo werken de bel, "Alles gelezen" en de live melding zonder extra code, en blijft het datamodel op 7.
- *Wie krijgt een melding?* Schrijft de indiener, dan de hele stuurgroep (je weet niet wie het oppakt); schrijft een stuurgroeplid, dan alleen de indiener. Collega-stuurgroepleden zien het gesprek wel, maar krijgen geen melding van elkaar (minder ruis).
- *Beveiliging:* lezen via Row Level Security (`mag_gesprek_zien`), schrijven en bewerken alleen via de functies `plaats_reactie` en `bewerk_reactie`, die dezelfde regels afdwingen als `logica.js`. Ook via de API kan een collega dus niet meelezen of andermans bericht aanpassen.
- *Live typen:* een live update tekent alleen de berichtenlijst opnieuw, zodat een half getypt bericht niet verdwijnt.

**Wat is aangepast**
- `public/js/logica.js`: `magGesprekZien`, `plaatsReactie`, `magReactieBewerken`, `bewerkReactie`.
- `supabase/schema.sql` / `installatie.sql`: tabel `reactie`, aangepaste `notificatie`, RLS-regel, twee functies, live updates; demodata met twee voorbeeldgesprekken.
- `server/app.js`: `POST /api/voorstellen/:id/reacties` en `PUT /api/reacties/:id`.
- Schermen: blok "Gesprek" in het voorstelvenster (chatballonnen, Enter verstuurt, "Bewerken" bij eigen berichten tot 15 minuten), rood bolletje met aantal ongelezen reacties in Mijn voorstellen, Beoordelen en Dashboard.
- Tests: 7 unittests, 1 API-test en databasetests voor R7 (35 tests in totaal). ERD, rollen-tabel en testplan bijgewerkt.

**Nieuwe risico's**
- In de Node-versie zonder echte login (prototype) stuurt de server alle data naar de browser; de privacy van het gesprek is daar alleen in de schermen geregeld. Online (Supabase) dwingt de database het af.
- Een gesprek kan een "achterdeur" worden voor beslissingen. Afspraak: besluiten blijven via een statuswijziging met toelichting lopen, zodat ze in de historie en het dashboard staan.

**Betekenis voor MVP**
- Meldingen via Teams of e-mail bij een nieuwe reactie is een logische vervolgstap zodra de Microsoft 365-koppeling er is.

## Iteratie 5b – tab Gesprekken en pop-ups bij updates (26-11-2026)

**Aanleiding (Theo):** "Is het een optie om een chat tab toe te voegen zodat je makkelijk vragen kan stellen en een soort popup maken als er bij een voorstel een update is?"

**Afspraken vooraf (vragen gesteld, Theo akkoord met alle voorkeuren, 26-11-2026)**
- Tab **Gesprekken** voor alle rollen: links de lijst met je gesprekken (nieuwste boven, rood bolletje bij ongelezen), rechts het open gesprek. Op een telefoon eerst de lijst, dan het gesprek.
- Iedereen ziet alleen gesprekken waar hij deelnemer van is: de indiener bij eigen voorstellen, de stuurgroep bij alle voorstellen (de privacyregel van 5a blijft gelijk).
- **Nieuw gesprek** starten vanuit de tab: de stuurgroep bij elk voorstel, een medewerker bij eigen voorstellen.
- **Pop-up** bij een statuswijziging en bij een nieuw chatbericht: rustige kaart rechtsboven met knop Bekijken, verdwijnt na 8 seconden, maximaal 3 tegelijk, niet voor het voorstel of gesprek dat je al open hebt.
- Meldingen buiten de app (browser/telefoon) en geluid: bewust nog niet.

**Afwegingen**
- *Nieuwe gegevens nodig?* Nee. De tab en de pop-ups gebruiken REACTIE en NOTIFICATIE uit 5a; het datamodel en de database blijven gelijk (geen nieuw SQL-script nodig).
- *Eén gesprek op twee plekken:* in het voorstelvenster en in de tab. Beide blokken worden bij een live update samen bijgewerkt, zonder een half getypt bericht te wissen.
- *Pop-up boven een open venster:* de pop-ups staan in de bovenste laag van de browser (popover), zodat je ze ook ziet als er een voorstel open staat.

**Wat is aangepast**
- `public/js/logica.js`: `gesprekkenVoor()` (welke gesprekken zie ik, nieuwste eerst), met unittest.
- `public/js/app.js`: scherm Gesprekken, venster Nieuw gesprek, tellertje op de tab, pop-ups (`toonPopup`). Gesprekscode herbruikbaar gemaakt voor venster en tab.
- `public/css/stijl.css`, `public/index.html`: opmaak tab en pop-ups.

**Nieuwe risico's**
- In de Node-versie zonder Realtime verschijnen pop-ups pas bij de verversing (elke 30 seconden of bij terugkeer naar het tabblad); online (Supabase) direct.

## Iteratie 5c – na feedback stuurgroep en testers (in te vullen)

**Doel:**
**Feedback ontvangen van (wie, wanneer):**
**Belangrijkste feedback:**
**Wat is aangepast in scope, requirements, ontwerp of aanpak:**
**Nieuwe beperkingen of risico's:**
**Betekenis voor MVP:**
