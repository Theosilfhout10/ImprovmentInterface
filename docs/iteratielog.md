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

## Iteratie 4 – na feedback stuurgroep en testers (in te vullen)

**Doel:**
**Feedback ontvangen van (wie, wanneer):**
**Belangrijkste feedback:**
**Wat is aangepast in scope, requirements, ontwerp of aanpak:**
**Nieuwe beperkingen of risico's:**
**Betekenis voor MVP:**
