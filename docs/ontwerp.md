# Ontwerp – Verbeterregistratie (VBR)

> Bron voor scope en eisen: *Applicatie voorstel – Egency*, *Projectplan – VBR* en *Stakeholderanalyse Verbeterregistratie v0.1 (08-10-2026)*.
> Kaders uit de opdracht: maximaal 3 kernfunctionaliteiten en maximaal 6 entiteiten.

## 1. Probleem en doel (kort)

Medewerkers zien dagelijks verbeterkansen (klantomgevingen, interne processen, beveiliging), maar die worden nergens centraal vastgelegd en raken ondergesneeuwd. Doel: één plek om voorstellen in te dienen, een vast wekelijks beoordelingsproces door de stuurgroep, gegarandeerde terugkoppeling aan de indiener en overzicht voor management.

## 2. Requirements

### Functioneel (MoSCoW)

| ID | Requirement | Prioriteit | Bron | Aangetoond met |
|---|---|---|---|---|
| R1 | Een medewerker dient een voorstel in via een formulier van **maximaal 5 velden** (titel, omschrijving, categorie, klant, verwachte opbrengst). Titel, omschrijving en categorie zijn verplicht. | Must | Projectplan §4 | Test R1, TC-01/02 |
| R2 | Bij **elke statuswijziging** krijgt de indiener **automatisch** een bericht in de app én per e-mail, met toelichting. Afwijzen of on hold zetten kan alleen mét toelichting. | Must | Projectplan §3/§4, risico "geen terugkoppeling" | Test R2, TC-04/05 |
| R3 | De stuurgroep beoordeelt op **impact, urgentie en inzet** (elk laag/middel/hoog). De app **berekent** de prioriteit. Goedgekeurde voorstellen worden ingepland in een week (capaciteit). | Must | Projectplan §3/§4 | Test R3, TC-03 |
| R4 | Management ziet op een **dashboard** het aantal voorstellen per status, categorie en prioriteit, de reactietijd en voorstellen die te lang wachten. | Must | Projectplan §4 | Test R4, TC-06 |
| R5 | Een indiener ziet in "Mijn voorstellen" de status en volledige historie van zijn/haar voorstellen. | Should | Voorstel: "collega's moeten zien dat er iets gebeurt" | TC-05 |
| R6 | Een goedgekeurd en ingepland voorstel kan worden gemarkeerd als "Overgedragen aan Freshservice". | Could | Afbakening: uitvoering via Freshservice | TC-04 |
| – | Koppeling met Freshservice, voorstellen van externen, overzetten van oude ideeën | Won't (nu) | Projectplan §5 | – |

### Niet-functioneel

| ID | Eis | Hoe getoetst |
|---|---|---|
| NF1 | Bruikbaarheid: een voorstel indienen kost minder dan 5 minuten. | Acceptatietest met testers (TC-07), tijd meten |
| NF2 | Veiligheid: ingevoerde tekst wordt nooit als code uitgevoerd (XSS), ook niet in e-mails. Alleen de stuurgroep kan beoordelen en status wijzigen (gecontroleerd op de server). Geen wachtwoorden in de code. | TC-08, tests NF2, `.env` buiten Git |
| NF3 | Toegankelijkheid en apparaten: werkt op laptop en telefoon, bruikbaar met toetsenbord, labels bij alle velden. | TC-09 |
| NF4 | Onderhoudbaarheid: bedrijfsregels staan los van de schermen en zijn automatisch getest. | `npm test` (26 tests) |
| NF5 | Kosten en capaciteit: realiseerbaar binnen €2.500 en max. 2 uur per dag. | Projectplan, urenregistratie |

## 3. Datamodel (6 entiteiten)

```mermaid
erDiagram
    MEDEWERKER ||--o{ VOORSTEL : "dient in"
    CATEGORIE ||--o{ VOORSTEL : "classificeert"
    VOORSTEL ||--o| BEOORDELING : "krijgt"
    MEDEWERKER ||--o{ BEOORDELING : "beoordeelt"
    VOORSTEL ||--|{ STATUSWIJZIGING : "heeft historie"
    MEDEWERKER ||--o{ STATUSWIJZIGING : "voert uit"
    STATUSWIJZIGING ||--|| NOTIFICATIE : "veroorzaakt"
    MEDEWERKER ||--o{ NOTIFICATIE : "ontvangt"

    MEDEWERKER {
        string id PK
        string naam
        string email
        string rol "medewerker | stuurgroep | management"
    }
    CATEGORIE {
        string id PK
        string naam "Klantomgeving | Intern proces | Beveiliging"
        string omschrijving
    }
    VOORSTEL {
        string id PK
        string titel
        string omschrijving
        string categorieId FK
        string klant "optioneel"
        string opbrengst "optioneel"
        string indienerId FK
        string status
        datetime ingediendOp
    }
    BEOORDELING {
        string id PK
        string voorstelId FK "uniek: 1 per voorstel"
        string beoordelaarId FK
        string impact "laag | middel | hoog"
        string urgentie "laag | middel | hoog"
        string inzet "laag | middel | hoog"
        int score "3-9, berekend"
        string prioriteit "Hoog | Middel | Laag, berekend"
        string geplandeWeek "JJJJ-Wnn"
        string notitie
        datetime datum
    }
    STATUSWIJZIGING {
        string id PK
        string voorstelId FK
        string vanStatus "leeg bij indienen"
        string naarStatus
        string doorId FK
        string toelichting
        datetime datum
    }
    NOTIFICATIE {
        string id PK
        string ontvangerId FK
        string voorstelId FK
        string statuswijzigingId FK
        string bericht
        bool gelezen
        string mail "verzonden | voorbeeld | mislukt"
        datetime datum
    }
```

### Toelichting op ontwerpkeuzes

- **Categorie als eigen entiteit** in plaats van vaste tekst: de stuurgroep kan later categorieën toevoegen zonder codewijziging, en het dashboard telt per categorie.
- **Beoordeling los van Voorstel** (0..1): niet elk voorstel wordt beoordeeld (bijv. direct afgewezen) en zo blijft duidelijk *wie* beoordeelde en *wanneer*.
- **Statuswijziging als historie**: de huidige status staat ook op Voorstel (snel filteren), maar de volledige historie maakt terugkoppeling en doorlooptijd meetbaar (dashboard: "gem. tijd tot eerste reactie").
- **Notificatie hoort bij één statuswijziging**: zo is aantoonbaar dat *elke* wijziging tot terugkoppeling leidt (R2, het grootste risico uit het projectplan).
- **Klant is een tekstveld, geen entiteit**: klantbeheer valt buiten scope en zou een 7e entiteit opleveren.
- **Prioriteit wordt berekend, niet ingevuld**: `score = impact + urgentie + (4 − inzet)` met laag=1, middel=2, hoog=3. Score 7–9 = Hoog, 5–6 = Middel, 3–4 = Laag. Zo is de prioriteit uitlegbaar en consistent tussen stuurgroepleden.

## 3a. Architectuur (iteratie 3)

```mermaid
flowchart LR
    B[Browser<br>public/: schermen] -- "API (JSON)" --> S[Server<br>server/app.js]
    S --> L[Bedrijfsregels<br>public/js/logica.js]
    B -. dezelfde regels .-> L
    S --> O[(data/vbr.json)]
    S --> M[server/mail.js] -- SMTP --> G[Gmail] --> I[Indiener]
```

- **Bedrijfsregels op één plek.** `logica.js` draait in de browser én op de server. De server is leidend: hij controleert elke wijziging opnieuw, want wat in de browser gebeurt kan een gebruiker aanpassen.
- **Opslag in een JSON-bestand** in plaats van een database: past bij ~20 gebruikers, geen beheer nodig, en de structuur is precies het datamodel.
- **E-mail mag het proces nooit blokkeren.** De statuswijziging wordt eerst opgeslagen, daarna gaat de mail. Lukt de mail niet, dan staat het bericht nog steeds in de app en is de mislukking zichtbaar (`mail = mislukt`).
- **Adapter in de browser.** Zonder server (los geopend of online preview) draait dezelfde app als demo in de browser.

## 3b. Architectuur online (iteratie 4)

```mermaid
flowchart LR
    T1[Telefoon<br>medewerker] & T2[Laptop<br>stuurgroep] & T3[Tablet<br>management] -- "inloggen + RPC (HTTPS)" --> P[GitHub Pages<br>public/]
    P -.-> A[Supabase Auth]
    P -- "lezen (RLS) / functies" --> DB[(Supabase Postgres<br>supabase/schema.sql)]
    DB -- "Realtime (websocket)" --> T1 & T2 & T3
```

- **Zelfde app, andere bron.** `app.js` kiest automatisch: Node-server, anders Supabase (als `config.js` is ingevuld), anders de lokale demo.
- **Regels in de database.** In de browser kan iemand alles aanpassen, dus de database controleert zelf: lezen mag voor ingelogde gebruikers (berichten alleen je eigen), schrijven alleen via functies (`dien_voorstel_in`, `sla_beoordeling_op`, `wijzig_status`, `markeer_gelezen`) met dezelfde regels als `logica.js`. Rol komt uit de tabel `medewerker`, gekoppeld aan het inlogaccount via e-mail.
- **Live.** Elke wijziging in voorstel, beoordeling, statuswijziging of notificatie gaat via Supabase Realtime naar alle open schermen; de app haalt dan de data opnieuw op. Waar iemand aan het typen is, wordt het scherm niet overschreven.

## 4. Statusmodel (procesflow)

```mermaid
stateDiagram-v2
    [*] --> Ingediend: medewerker dient in
    Ingediend --> In_beoordeling: stuurgroep pakt op
    Ingediend --> Afgewezen: met toelichting
    In_beoordeling --> Goedgekeurd: na beoordeling
    In_beoordeling --> On_hold: met toelichting
    In_beoordeling --> Afgewezen: met toelichting
    On_hold --> In_beoordeling
    On_hold --> Afgewezen: met toelichting
    Goedgekeurd --> Ingepland: geplande week ingevuld
    Ingepland --> Overgedragen_aan_Freshservice
    Overgedragen_aan_Freshservice --> [*]
    Afgewezen --> [*]
```

Elke pijl maakt een Statuswijziging en een Notificatie voor de indiener aan.

## 5. Rollen en rechten

| Functie | Medewerker | Stuurgroep | Management |
|---|---|---|---|
| Voorstel indienen | ✓ | ✓ | ✓ |
| Eigen voorstellen en berichten | ✓ | ✓ | ✓ |
| Beoordelen en status wijzigen | – | ✓ | – |
| Dashboard | – | ✓ | ✓ |

## 6. Product backlog en sprintindeling

Indeling volgt het projectplan: 3 sprints van 2 weken, max. 2 uur per dag.

| Sprint | User story | Acceptatiecriteria | Req. |
|---|---|---|---|
| 1 | Als **medewerker** wil ik een voorstel snel kunnen indienen, zodat mijn idee niet verloren gaat. | Max. 5 velden; verplichte velden gecontroleerd; bevestiging na indienen; binnen 5 min in te vullen. | R1, NF1 |
| 1 | Als **medewerker** wil ik mijn voorstellen en hun status zien, zodat ik weet wat ermee gebeurt. | Lijst met eigen voorstellen, status en laatste update; historie per voorstel. | R5 |
| 2 | Als **stuurgroeplid** wil ik een voorstel scoren op impact, urgentie en inzet, zodat we objectief prioriteren. | Drie keuzes L/M/H; prioriteit wordt direct berekend en getoond; 1 beoordeling per voorstel. | R3 |
| 2 | Als **stuurgroeplid** wil ik de status wijzigen en goedgekeurde voorstellen inplannen, zodat de capaciteit bewaakt wordt. | Alleen toegestane overgangen; goedkeuren pas na beoordeling; inplannen pas met week. | R2, R3 |
| 2 | Als **indiener** wil ik automatisch bericht krijgen bij elke statuswijziging, zodat ik zie dat er iets met mijn idee gebeurt. | Elke wijziging → bericht; bij afwijzen/on hold verplichte toelichting; teller ongelezen berichten. | R2 |
| 3 | Als **manager** wil ik een dashboard, zodat ik in één oogopslag zie wat er openstaat. | Aantallen per status/categorie/prioriteit; gem. reactietijd; signaal bij > 7 dagen zonder reactie. | R4 |
| 3 | Als **stuurgroeplid** wil ik een overdracht naar Freshservice kunnen markeren. | Status "Overgedragen aan Freshservice" alleen vanuit Ingepland. | R6 |

### 6a. Acceptatiecriteria als scenario's (Gegeven / Als / Dan)

Volgens ATDD/BDD uit de vibecoding-training: eerst gedrag vastleggen, dan bouwen. Elk scenario heeft een geautomatiseerde test of een testgeval.

**Kernfunctie 1: indienen**
- *Gegeven* een ingelogde medewerker, *als* de medewerker titel, omschrijving en categorie invult en indient, *dan* staat het voorstel op "Ingediend" en krijgt de medewerker een ontvangstbevestiging. (test R1, TC-02)
- *Gegeven* een leeg formulier, *als* de medewerker indient, *dan* ziet de medewerker per ontbrekend veld een melding en wordt er niets opgeslagen. (test R1, TC-01)

**Kernfunctie 2: beoordelen en terugkoppelen**
- *Gegeven* een voorstel in beoordeling, *als* de stuurgroep impact hoog, urgentie hoog en inzet middel kiest, *dan* toont de app prioriteit Hoog (score 8). (test R3, TC-03)
- *Gegeven* een voorstel, *als* de stuurgroep afwijst zonder toelichting, *dan* wordt dat geweigerd met de melding dat de indiener moet weten waarom. (test R2, TC-05)
- *Gegeven* een voorstel van Theo, *als* de stuurgroep de status wijzigt, *dan* krijgt Theo automatisch een bericht met de nieuwe status en de toelichting. (test R2)
- *Gegeven* een medewerker zonder stuurgroeprol, *als* die medewerker probeert te beoordelen of de status te wijzigen, *dan* wordt dat geweigerd. (test NF2)

**Kernfunctie 3: dashboard**
- *Gegeven* een voorstel dat langer dan 7 dagen op "Ingediend" staat, *als* management het dashboard opent, *dan* staat het onder "Aandacht nodig". (test R4, TC-06)

## 7. Definition of Done

Een user story is af als:

1. De acceptatiecriteria aantoonbaar werken in het prototype.
2. De bijbehorende geautomatiseerde tests slagen (`npm test`) en de GitHub Actions-run groen is.
3. De wijziging is gecommit in GitHub met een duidelijke beschrijving.
4. Ingevoerde tekst wordt veilig getoond (geen XSS) en het scherm werkt op laptop en telefoon.
5. Een tester (Matthijs of AnneMirthe) heeft de story in de Sprint Review gezien en goedgekeurd.
6. De iteratielog is bijgewerkt (wat geleerd, wat aangepast).

## 8. Open punten voor de stuurgroep

- **Beveiligingsvoorstellen:** krijgen die een eigen, hogere prioriteitsregel of een directe melding aan de security officer? (Stakeholderanalyse, Arjen Fiechter.) Nu niet gebouwd. Het dashboard toont wel het aantal per categorie.
- **Platform voor de MVP:** het projectplan noemt dit nog niet. Zie de roadmap in het Plan van Aanpak (bijv. Power Apps + SharePoint + Power Automate binnen Microsoft 365, of deze webapp met een gedeelde database).
- **Vervanger voor de Product Owner** bij afwezigheid van Olaf (risico uit stakeholderanalyse).
