# Kwaliteitsanalyse en route naar productie

De vibecoding-training stelt: *sneller code genereren verandert de kwaliteitsattributen niet, het verkort vooral de tijd tot de eerste versie.* Hieronder per kwaliteitsattribuut uit de training hoe het prototype ervoor staat.

| Attribuut | Vraag uit de training | Stand prototype | Bewijs | Nodig voor MVP |
|---|---|---|---|---|
| Correctheid | Werkt het ook bij uitzonderingen en foutieve invoer? | Invoer gevalideerd; ongeldige statusovergangen en ontbrekende toelichting worden geweigerd. | Tests R1/R2, robuustheidstest | Acceptatietest met key users (TC-07) |
| Performance | Wat gebeurt er bij 10, 1.000 of 1.000.000 records? | Bij 1.000 voorstellen rekent het dashboard ruim binnen 1 seconde. Egency verwacht tientallen per jaar. | Performancetest | Bij gedeelde database: berekening naar de server of een query |
| Onderhoudbaarheid | Is de code begrijpelijk, modulair, getest en overdraagbaar? | Logica los van schermen, Nederlands commentaar, geen framework, 18 tests, CI. | `js/logica.js`, GitHub Actions | Codeconventies en review per pull request |
| Security & privacy | Authenticatie, autorisatie, secrets, persoonsgegevens, dependencies | Online: login met e-mail en wachtwoord (Supabase); rechten in de database (Row Level Security, wijzigingen alleen via functies met rolcontrole, getest); Content Security Policy; geheimenscan van de volledige Git-historie (25-11-2026: geen geheimen gevonden); wachtwoordbeleid en rate limits in Supabase. Node-versie: geen login, rolcontrole op de server; XSS voorkomen in app en e-mail; Gmail-wachtwoord alleen in `.env`; beveiligingsheaders (CSP); 2 vastgezette pakketten (Express, Nodemailer). | Tests NF2, TC-08 | Login via Microsoft 365 (Entra ID); review door security officer vóór livegang |
| Schaalbaarheid | Kan datamodel en architectuur meegroeien? | Datamodel genormaliseerd (6 entiteiten); gedeelde opslag in één JSON-bestand op de server, ruim genoeg voor ~20 gebruikers. | ERD, servertests | Database bij groei of meerdere servers |
| Vendor lock-in | Kun je code en data exporteren en elders beheren? | Volledige broncode in eigen GitHub; data exporteerbaar als JSON; geen platformafhankelijkheid. | Repository, exportknop | Bij keuze voor een low-code platform opnieuw afwegen |

## Waarom code in GitHub en niet een AI-app-builder zoals Lovable?

De training noemt Cursor, Replit, Bolt, v0 en Lovable en zegt "kies op basis van controle, doelgroep en lifecycle". Afweging:

- **Voor deze aanpak (agentic high-code in eigen repository):** volledige controle over en inzicht in de code, wat nodig is voor de CGI. Versiegeschiedenis per iteratie als bewijs voor het iteratielog. Tests en CI als quality gate. Geen lock-in.
- **Voor Lovable:** sneller een mooie interface en direct online te delen. Maar de code is minder zichtbaar, de data staat bij een externe partij en het is lastiger te verantwoorden wat er precies gegenereerd is.
- **Conclusie:** voor een prototype dat uitlegbaar en toetsbaar moet zijn, past code in een eigen repository beter. Lovable blijft geschikt voor snelle UX-experimenten in de workshop.

## Ontwikkelaanpak: methodiek en engineeringtechnieken

De training maakt onderscheid tussen **methodiek** (hoe organiseer je het werk) en **techniek** (hoe borg je de kwaliteit).

- **Methodiek: Scrum.** Drie sprints van twee weken (projectplan), Product Owner Olaf, Sprint Review met de testers. Past omdat de eisen gaandeweg scherper worden en de stuurgroep snel feedback moet kunnen geven. Waterval past niet: de wensen van de stuurgroep zijn nog niet stabiel.
- **Elementen van DSDM:** vaste tijd (3 sprints) en budget (€2.500), variabele scope via MoSCoW.
- **Engineeringtechnieken:**
  - *Spec-driven development:* de AI bouwt tegen [spec.md](spec.md).
  - *ATDD/BDD:* acceptatiecriteria als Gegeven/Als/Dan vóór de bouw ([ontwerp.md](ontwerp.md) §6a), vertaald naar tests.
  - *Continuous Integration:* elke push en pull request draait de tests automatisch.
  - *Code review:* wijzigingen vanaf iteratie 2 lopen via een pull request die Theo beoordeelt voordat ze in `main` komen.

## Van prototype naar productie

Volgens de training: Business fit → Requirements → Engineering → Verification → Operations.

| Stap | Wat al staat | Wat nog moet |
|---|---|---|
| Business fit | Probleem en doel onderbouwd in projectplan en stakeholderanalyse | Validatie met de stuurgroep: lost dit het ondersneeuwen echt op? |
| Requirements | R1–R6 en NF1–NF5 | Beslissen over beveiligingsvoorstellen (Arjen), meldingskanaal (e-mail of Teams) |
| Engineering | Werkende app online (GitHub Pages + Supabase) met login, gedeelde database en live updates; Node-versie met e-mail; 27 tests | Login via Microsoft 365, e-mail ook vanuit de online versie, keuze definitieve hosting |
| Verification | 18 geautomatiseerde tests, functionele tests | Acceptatietest key users, security-review |
| Operations | – | Beheer (wie?), back-up, werkinstructie, communicatie en livegang (sprint 3) |
