# AI-verantwoording (concept, door Theo aan te vullen)

> Rubric go/no-go 2: *1–2 A4 met 1. jouw methodische prompt, 2. criteria wanneer je akkoord bent, 3. transparantie over waarvoor AI is ingezet, 4. verantwoording conform APA.* Dit is een opzet op basis van wat er in dit project is gebeurd. Herschrijf het in je eigen woorden: in het CGI moet je elke zin kunnen toelichten.

## 1. Methodische prompt

Ik werk met een vaste opbouw (spec-driven, uit de vibecoding-training), zie [spec.md](spec.md):

1. **Context:** wie zijn de gebruikers, welk probleem lossen we op (projectplan, stakeholderanalyse).
2. **Doel van deze iteratie:** één concreet resultaat (bijv. "drie accounts, live zichtbaar op drie apparaten").
3. **Kaders:** max. 3 kernfuncties en 6 entiteiten, Egency-huisstijl, geen framework, geen geheimen in de code.
4. **Acceptatie:** wanneer is het af (Gegeven/Als/Dan in [ontwerp.md](ontwerp.md) §6a, tests groen).
5. **Werkwijze:** wijzigingen via een pull request, ik review en geef akkoord voor het mergen.

## 2. Wanneer ben ik akkoord?

- De drie kernflows werken in de echte app (zelf getest, zie testplan TC-01 t/m TC-12).
- Alle geautomatiseerde tests zijn groen in GitHub Actions (27, waaronder de databasetest op rechten).
- Ik kan uitleggen wat de code doet: bedrijfsregels (`logica.js`, databasefuncties), datamodel, rechten.
- Geen wachtwoorden of geheime sleutels in GitHub; alleen de openbare publishable key.
- Het past binnen scope en kaders (geen extra functies "omdat het kan").

## 3. Waarvoor is AI ingezet

| Onderdeel | Inzet van AI | Mijn rol |
|---|---|---|
| Analyse en plan | Samenvatten van opdracht, projectplan en stakeholderanalyse; voorstel voor aanpak | Keuze voor echte code en voor de scope |
| Requirements en ERD | Formuleren van R1–R6, NF1–NF5, Gegeven/Als/Dan, ERD | Gecontroleerd tegen projectplan; te valideren met Olaf |
| Code (vibecoding) | Schermen, logica, server, database, tests, CI | Richting, stijlkeuzes, testen, akkoord per pull request |
| Documentatie | Iteratielog, testplan, kwaliteitsanalyse, demoscript | Aanvullen met eigen feedback en reflectie |

Volledig overzicht per prompt: [promptlog.md](promptlog.md).

## 4. Kritische AI-momenten

- **Stijl:** de eerste versie zag er "te AI-gebouwd" uit. Ik heb bijgestuurd naar Egency-huisstijl en een rustige Apple-stijl.
- **Lovable afgewezen:** een AI-app-builder levert snel iets op, maar ik wilde eigen, uitlegbare code in mijn eigen GitHub (zie [kwaliteit.md](kwaliteit.md)).
- **Beveiliging:** de AI stelde voor de regels in de database af te dwingen, omdat alles in de browser aan te passen is. Wachtwoorden en geheime sleutels heb ik bewust niet aan de AI gegeven.
- **Grenzen van de AI:** de AI kon mijn Supabase-project niet bereiken en meldde dat expliciet. Ik heb daarom zelf de live test op meerdere apparaten gedaan.
- *(Vul aan: een moment waarop jij een AI-voorstel hebt afgewezen of gecorrigeerd, en waarom.)*

## 5. Bronvermelding (APA 7)

Anthropic. (2026). *Claude* (Opus 5.5) [Large language model]. https://claude.ai

Supabase. (2026). *Supabase documentation*. https://supabase.com/docs
