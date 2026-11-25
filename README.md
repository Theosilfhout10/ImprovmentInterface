# Verbeterregistratie (VBR) – prototype

Prototype van een interne applicatie voor **Egency** waarin medewerkers verbetervoorstellen indienen, de stuurgroep ze wekelijks beoordeelt en management de voortgang volgt op een dashboard.

Gemaakt voor de integrale opdracht **Digitale Oplossingen Ontwerpen en Realiseren** (Avans, leerjaar 2) door Theo Silfhout. Opdrachtgever/Product Owner: Olaf van Heeswijk.

## Starten

Geen installatie nodig.

1. Download of clone deze repository.
2. Dubbelklik op `index.html`. De app opent in je browser.
3. Kies rechtsboven met **Ingelogd als** een rol om de verschillende gebruikers te bekijken:
   - **Medewerker** (bijv. Theo): voorstel indienen, eigen voorstellen volgen, berichten lezen.
   - **Stuurgroep** (Olaf, Arjen): voorstellen beoordelen, prioriteren, inplannen en status wijzigen.
   - **Management** (Haico): dashboard.

De app start met demodata. Met **Demodata herstellen** (onderaan) zet je alles terug. Data wordt alleen lokaal in je browser opgeslagen (`localStorage`).

## Tests draaien

Vereist Node.js 18 of nieuwer.

```bash
npm test
```

De tests staan in `tests/logica.test.js` en verwijzen naar de requirements (R1 t/m R4). Bij elke push draaien ze ook automatisch via GitHub Actions.

## Drie kernfunctionaliteiten

| # | Kernfunctionaliteit | Requirement | Waar in de code |
|---|---|---|---|
| 1 | Voorstel indienen via een formulier met max. 5 velden | R1 | `schermIndienen()` in `js/app.js`, `valideerVoorstel()` en `dienVoorstelIn()` in `js/logica.js` |
| 2 | Beoordelen en prioriteren (impact, urgentie, inzet) met automatische terugkoppeling bij elke statuswijziging | R2, R3 | `openDetail()` in `js/app.js`, `berekenPrioriteit()`, `slaBeoordelingOp()` en `wijzigStatus()` in `js/logica.js` |
| 3 | Dashboard voor management | R4 | `schermDashboard()` in `js/app.js`, `dashboardCijfers()` in `js/logica.js` |

## Projectstructuur

```
index.html            Pagina-opbouw
css/stijl.css         Opmaak (ook donkere modus en mobiel)
js/logica.js          Bedrijfsregels: prioriteit, statusovergangen, validatie, dashboardcijfers
js/demodata.js        Voorbeelddata voor de demo
js/app.js             Schermen en interactie
tests/                Geautomatiseerde tests (node:test)
docs/                 Ontwerp, ERD, testplan en iteratielog
```

## Documentatie

- [Ontwerp: requirements, datamodel (ERD), statusmodel, user stories](docs/ontwerp.md)
- [Testplan en testresultaten](docs/testplan.md)
- [Iteratielog](docs/iteratielog.md)
- [Demoscript (5 minuten)](docs/demoscript.md)
- [Specificatie voor AI (spec-driven)](docs/spec.md)
- [Promptlog en AI-transparantie](docs/promptlog.md)
- [Kwaliteitsanalyse en route naar productie](docs/kwaliteit.md)

## Bewuste keuzes en beperkingen van dit prototype

- **Geen echte login.** Je kiest een gebruiker uit een lijst. In de MVP regelt Microsoft 365 (Entra ID) de identiteit.
- **Terugkoppeling is een in-app bericht.** In de MVP gaat dit via e-mail of Teams (bijv. Power Automate).
- **Opslag in de browser.** Elke browser heeft zijn eigen data. In de MVP komt dit in een gedeelde opslag (bijv. SharePoint-lijst of database).
- **Geen koppeling met Freshservice.** Dat valt buiten de scope (projectplan, afbakening).

## AI-gebruik

De code is gegenereerd met hulp van AI (Claude) volgens de vibecoding-aanpak uit de module. Zie [docs/promptlog.md](docs/promptlog.md) en [docs/iteratielog.md](docs/iteratielog.md) voor wat er per iteratie is gevraagd, gecontroleerd en aangepast.
