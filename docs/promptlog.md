# Promptlog en AI-transparantie

De opdracht vraagt transparantie over AI-gebruik: wat heeft AI gegenereerd, wat is gecontroleerd en wat is aangepast. Hulpmiddel: Claude (Anthropic), als agent die code schrijft, tests draait en naar GitHub commit. Theo stuurt de richting, beoordeelt het resultaat en is eigenaar van alle keuzes.

| # | Datum | Prompt (Theo) | Wat de AI deed | Controle en bijsturing |
|---|---|---|---|---|
| 1 | 25-11-2026 | "Als het goed is zie je een opdracht waar ik een applicatie moet maken. Ik heb in mijn bestanden een document gemaakt waarin wordt aangegeven wat ik wil en hoe. Kan je een plan maken en die opdracht uitvoeren." | Opdracht, applicatievoorstel, projectplan en stakeholderanalyse gelezen; samenvatting en plan gemaakt; platformkeuze voorgelegd (webapp of Power Apps). | Theo koos voor echte code (vibecoding). |
| 2 | 25-11-2026 | "Ik moet dit vibecoden dus moet wel code zijn. Kan je niet lokaal mijn GitHub gebruiken?" | Repository ImprovmentInterface gekoppeld; iteratie 1 gebouwd: logica, schermen, 15 tests, CI, documentatie. | Browsertest met screenshots; 3 opmaakfouten gevonden en opgelost (zie [iteratielog](iteratielog.md)). |
| 3 | 25-11-2026 | "Ik heb in de map SDLC een nieuw document gezet. Kan je die bekijken en aanpassingen maken?" (vibecoding-training) | Inzichten uit de training verwerkt: spec-driven specificatie, Gegeven/Als/Dan-criteria, kwaliteitsanalyse, autorisatie in de logica, extra tests; wijziging via pull request (code review als quality gate). | *In te vullen door Theo na review van de pull request.* |
| 4 | 25-11-2026 | "Lovable hoeft niet. Is een prototype dat wel moet werken en dat we misschien gaan gebruiken. Graag Egency-huisstijl maar wel clean en overzichtelijk (Apple-designstijl). Preview is te AI-gebouwd qua stijl, moet makkelijker te gebruiken zijn zonder afleiding. Zorg dat ik ook kan mailen (los Gmail-account)." | Zocht een Apple-design-skill (niet beschikbaar), haalde logo en kleuren van egency.nl, bouwde server + gedeelde opslag + Gmail-mail, nieuw ontwerp, 8 extra tests. | *In te vullen door Theo na review van de pull request.* |
| 5 | 25-11-2026 | "Ik wil 3 accounts hebben waarmee ik kan inloggen op de GitHub-link en een kleine demo geven waar ze echt data zien en dat elke rol duidelijk is. Ik wil met data op 3 verschillende apparaten live de veranderingen zien." | Hosting via GitHub Pages ingericht; Supabase gekozen (login, database, live). Databaseschema met rechten per rol en regels in functies, databasetest in CI, inlogscherm, rol in de kop, live verversen. | Databasetest (rechten en regels) en browsertest met drie rollen geslaagd. Theo testte de live demo zelf (25-11): werkt zoals bedoeld, wijzigingen verschijnen direct. Kritisch moment: de AI kon het echte Supabase-project niet bereiken en meldde dat expliciet; wachtwoorden zijn bewust niet aan de AI gegeven. |
| 6 | 26-11-2026 | "Kan je toevoegen dat gebruikers kunnen chatten in een verbetervoorstel zodat de stuurgroep vragen kan stellen per verbetervoorstel? Als je vragen hebt eerst stellen en dan pas uitvoeren." | De AI stelde eerst 6 vragen (o.a. 6-entiteitengrens, wie mag lezen, live, meldingen, bewerken, ongelezen-indicator). Theo koos: 7e entiteit mag, privé tussen indiener en stuurgroep, live, melding in de app, bewerken tot 15 minuten, ongelezen-bolletje. Daarna gebouwd: entiteit REACTIE, RLS en functies in de database, API, schermen, tests en documentatie. | 9 nieuwe tests (logica, API, database) groen; browsertest met drie rollen (indiener, stuurgroep, management ziet niets). Kritisch moment: de eerste databasetest faalde omdat de demodata al een melding bevatte; de test is aangepast, niet de regel. Online test door Theo (TC-13) nog uit te voeren. |
| 7 | 26-11-2026 | "Is het een optie om een chat tab toe te voegen zodat je makkelijk vragen kan stellen en een soort popup maken als er bij een voorstel een update is?" | De AI stelde eerst 6 vragen met voorkeuren (inhoud tab, nieuw gesprek, wie ziet wat, wanneer en hoe een pop-up, meldingen buiten de app). Theo: akkoord. Gebouwd: tab Gesprekken, Nieuw gesprek, pop-ups; datamodel ongewijzigd. | 1 nieuwe unittest groen; browsertest desktop en telefoon met pop-ups via live verversing. Online test (TC-14) door Theo nog uit te voeren. |

## Wat moet Theo zelf kunnen uitleggen (voorbereiding CGI)

- Hoe `berekenPrioriteit()` werkt en waarom inzet "omgekeerd" meetelt.
- Waarom elke statuswijziging een Notificatie aanmaakt (R2, risico "geen terugkoppeling").
- Waarom `esc()` in `app.js` nodig is (XSS) en waarom de rolcontrole in `logica.js` staat.
- Wat de server doet en waarom de bedrijfsregels daar opnieuw worden gecontroleerd.
- Waarom het Gmail-wachtwoord in `.env` staat en niet in de code.
- Wat er gebeurt als een e-mail niet verzonden kan worden.
- Waarom het gesprek een eigen entiteit (REACTIE) is en hoe de database afdwingt dat alleen de indiener en de stuurgroep het zien (`mag_gesprek_zien`, Row Level Security).
- Wat een test in `tests/logica.test.js` controleert en hoe je hem draait.

## Risico's van AI-gegenereerde code (reflectie)

- **Aannames:** de AI koos zelf de prioriteitsformule en de statussen. Die zijn vastgelegd in [ontwerp.md](ontwerp.md) zodat de stuurgroep ze kan valideren.
- **Schijnzekerheid:** groene tests bewijzen alleen wat getest wordt. Bruikbaarheid moet met echte gebruikers worden getoetst (TC-07).
- **Eigenaarschap:** code die Theo niet kan uitleggen, telt niet. Daarom is gekozen voor eenvoudige JavaScript zonder framework en Nederlandstalig commentaar.
