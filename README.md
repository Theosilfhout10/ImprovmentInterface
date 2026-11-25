# Verbeterregistratie (VBR) – prototype

Werkend prototype van een interne applicatie voor **Egency** waarin medewerkers verbetervoorstellen indienen, de stuurgroep ze wekelijks beoordeelt en management de voortgang volgt op een dashboard.

Gemaakt voor de integrale opdracht **Digitale Oplossingen Ontwerpen en Realiseren** (Avans, leerjaar 2) door Theo Silfhout. Opdrachtgever/Product Owner: Olaf van Heeswijk.

## Starten

Vereist [Node.js](https://nodejs.org) 20.12 of nieuwer (LTS aanbevolen).

```bash
npm install
npm start
```

Open daarna http://localhost:3000. Kies rechtsboven wie je bent:

- **Medewerker** (bijv. Theo): voorstel indienen en eigen voorstellen volgen.
- **Stuurgroep** (Olaf, Arjen): beoordelen, prioriteren, inplannen en status wijzigen.
- **Management** (Haico): dashboard.

De data staat op de server in `data/vbr.json` (niet in GitHub), dus iedereen die de app opent ziet dezelfde voorstellen. Open je `public/index.html` los zonder server, dan draait de app als demo in je browser.

## Online demo

Bij elke push naar `main` wordt de app gepubliceerd op GitHub Pages: https://theosilfhout10.github.io/ImprovmentInterface/

Is `public/js/config.js` ingevuld, dan log je daar in met een van de drie demo-accounts en zie je wijzigingen live op alle apparaten (zie hieronder). Is hij leeg, dan draait de app als demo in de browser met eigen voorbeelddata per bezoeker. Zet er geen echte gegevens in.

## Live demo met drie accounts (Supabase)

De online versie (GitHub Pages) gebruikt [Supabase](https://supabase.com) (gratis): echte inlogaccounts, één gedeelde database en live updates. Wijzigt de stuurgroep een status, dan ziet de indiener dat binnen een seconde op een ander apparaat, inclusief bericht.

Eenmalig instellen in het Supabase-dashboard:

1. **SQL Editor** → plak de inhoud van [`supabase/installatie.sql`](supabase/installatie.sql) → *Run*. Dit maakt de tabellen, de rechten per rol, de live updates en de demodata. Opnieuw uitvoeren mag (zet alles terug naar de demodata).
2. **Authentication → Users → Add user → Create new user**, drie keer, met *Auto Confirm User* aan en een wachtwoord naar keuze:
   - `medewerker@verbeterregistratie.test` (Theo Silfhout, medewerker)
   - `stuurgroep@verbeterregistratie.test` (Olaf van Heeswijk, stuurgroep)
   - `management@verbeterregistratie.test` (Haico de Boer, management)

   Een account wordt via het e-mailadres automatisch aan de medewerker gekoppeld.
3. **Authentication → Sign In / Providers**: zet *Allow new users to sign up* uit, zodat niemand zelf een account kan maken.
4. Zet de Project URL en de **publishable (anon) key** in [`public/js/config.js`](public/js/config.js). Nooit de service_role/secret key of het databasewachtwoord.

Let op: een gratis Supabase-project pauzeert na 7 dagen zonder gebruik. Open het dashboard en klik *Restore* vóór een demo.

**Instellingen tegen het raden van wachtwoorden** (Supabase-dashboard, eenmalig):
- *Authentication → Sign In / Providers → Email*: minimale wachtwoordlengte **12** en eis kleine letters, hoofdletters, cijfers en symbolen. Bestaande wachtwoorden die korter zijn: opnieuw instellen.
- *Authentication → Rate Limits*: laat de limiet voor inlogpogingen per IP-adres op de standaardwaarde of lager (Supabase remt dan automatisch).
- Na elke demo met externen: wachtwoorden van de demo-accounts wijzigen.

Wachtwoorden staan nergens in de code of in GitHub. Supabase bewaart ze alleen versleuteld (gehasht); de app bewaart na het inloggen alleen een tijdelijk sessietoken in de browser, nooit het wachtwoord.

**Beveiliging:** de publishable key is openbaar bedoeld. De bescherming zit in de database: gebruikers mogen alleen lezen (en alleen hun eigen berichten), en alle wijzigingen lopen via functies die de rol en de procesregels controleren (`supabase/schema.sql`). Een medewerker kan dus ook via de API geen status wijzigen.

## E-mail instellen (Gmail)

Zonder instellingen staat de e-mail in **voorbeeldstand**: mails worden opgesteld maar niet verstuurd. Je ziet ze via *Verzonden e-mails* onderaan de app.

Echt mailen:

1. Maak een apart Gmail-account, bijvoorbeeld `verbeterregistratie.egency@gmail.com`.
2. Zet in dat account **2-stapsverificatie** aan.
3. Maak een **app-wachtwoord** via https://myaccount.google.com/apppasswords (16 tekens).
4. Kopieer `.env.example` naar `.env` en vul `GMAIL_USER` en `GMAIL_APP_PASSWORD` in.
5. Vul tijdens het testen `MAIL_TEST_ONTVANGER` in met je eigen adres, zodat collega's nog geen mail krijgen.
6. Herstart met `npm start`. De console meldt "E-mail: echt verzenden via Gmail".

`.env` staat in `.gitignore` en komt nooit in GitHub. Deel het app-wachtwoord met niemand. Je kunt het in je Google-account altijd intrekken.

De e-mailadressen van de medewerkers staan in `data/vbr.json` (bij de demodata zijn dat voorbeeldadressen).

## Tests draaien

```bash
npm test
```

26 tests: bedrijfsregels (`tests/logica.test.js`) en server, opslag en e-mail (`tests/server.test.js`). Bij elke push draaien ze ook automatisch via GitHub Actions.

## Drie kernfunctionaliteiten

| # | Kernfunctionaliteit | Requirement | Waar in de code |
|---|---|---|---|
| 1 | Voorstel indienen via een formulier met max. 5 velden | R1 | `schermIndienen()` in `public/js/app.js`, `valideerVoorstel()` en `dienVoorstelIn()` in `public/js/logica.js` |
| 2 | Beoordelen en prioriteren (impact, urgentie, inzet) met automatische terugkoppeling (in de app en per e-mail) bij elke statuswijziging | R2, R3 | `openVoorstel()` in `public/js/app.js`, `berekenPrioriteit()`, `slaBeoordelingOp()` en `wijzigStatus()` in `public/js/logica.js`, `server/mail.js` |
| 3 | Dashboard voor management | R4 | `schermDashboard()` in `public/js/app.js`, `dashboardCijfers()` in `public/js/logica.js` |

## Projectstructuur

```
public/               Wat de browser laadt
  index.html          Pagina-opbouw
  css/stijl.css       Opmaak: Apple-stijl in Egency-huisstijl, licht en donker, mobiel
  js/logica.js        Bedrijfsregels (gedeeld door browser én server)
  js/demodata.js      Voorbeelddata
  js/app.js           Schermen en interactie
server/               De server
  start.js            Startpunt (npm start), leest .env
  app.js              API: indienen, beoordelen, status, berichten
  opslag.js           Opslag in data/vbr.json
  mail.js             E-mail via Gmail (of voorbeeldstand)
tests/                Geautomatiseerde tests
docs/                 Ontwerp, testplan, iteratielog, kwaliteit, promptlog
```

## Documentatie

- [Ontwerp: requirements, datamodel (ERD), statusmodel, user stories](docs/ontwerp.md)
- [Testplan en testresultaten](docs/testplan.md)
- [Iteratielog](docs/iteratielog.md)
- [Demoscript (5 minuten)](docs/demoscript.md)
- [Specificatie voor AI (spec-driven)](docs/spec.md)
- [Promptlog en AI-transparantie](docs/promptlog.md)
- [AI-verantwoording (concept, rubric go/no-go 2)](docs/ai-verantwoording.md)
- [Kwaliteitsanalyse en route naar productie](docs/kwaliteit.md)

## Bewuste keuzes en beperkingen

- **Login.** Online (Supabase) log je in met e-mail en wachtwoord. In de Node-versie kies je nog wie je bent uit een lijst; die alleen op het interne netwerk gebruiken. Voor productie: Microsoft 365-login (Entra ID), die Supabase ook ondersteunt.
- **Online versie mailt (nog) niet.** Berichten verschijnen live in de app; e-mail loopt via de Node-server.
- **Opslag in één JSON-bestand.** Ruim voldoende voor ~20 gebruikers; maak een back-up door `data/vbr.json` te kopiëren.
- **Geen koppeling met Freshservice.** Dat valt buiten de scope (projectplan, afbakening).

## AI-gebruik

De code is gegenereerd met hulp van AI (Claude) volgens de vibecoding-aanpak uit de module. Zie [docs/promptlog.md](docs/promptlog.md) en [docs/iteratielog.md](docs/iteratielog.md) voor wat er per iteratie is gevraagd, gecontroleerd en aangepast.
