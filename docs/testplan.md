# Testplan en testresultaten – Verbeterregistratie

## 1. Teststrategie

| Niveau | Wat | Wie | Wanneer |
|---|---|---|---|
| Unittests (geautomatiseerd) | Bedrijfsregels in `js/logica.js`: prioriteit, validatie, statusovergangen, terugkoppeling, dashboardcijfers, consistentie datamodel | Ontwikkelaar, automatisch via GitHub Actions | Bij elke commit |
| Functionele test (handmatig) | Testgevallen TC-01 t/m TC-09 hieronder, via de schermen | Ontwikkelaar | Einde van elke sprint |
| Acceptatietest | Echte gebruikers voeren taken uit en geven feedback (NF1 bruikbaarheid) | Matthijs van Voorthuizen, AnneMirthe Roelofsen (key users) | Sprint Review sprint 3 |
| Validatie | Klopt de oplossing met het probleem? Stuurgroep beoordeelt het dashboard en het proces | Olaf van Heeswijk (PO), Haico de Boer | Sprint Review |

## 2. Geautomatiseerde tests

Uitvoeren met `npm test`. Resultaat bij oplevering van iteratie 1 (25-11-2026): **15 van 15 geslaagd**. Na iteratie 2: **18 van 18 geslaagd** (extra: autorisatie, robuustheid, performance). Na iteratie 3: **26 van 26 geslaagd** (extra: server-API, opslag, e-mail).

| Test | Requirement |
|---|---|
| Prioriteit hoog/hoog/laag = Hoog (score 9) | R3 |
| Grenswaarden 7=Hoog, 6=Middel, 5=Middel, 4=Laag, 3=Laag | R3 |
| Ongeldige waarde geeft een fout | R3 |
| Geldig voorstel heeft geen fouten | R1 |
| Lege titel, korte omschrijving en geen categorie worden geweigerd | R1 |
| Indienen: status Ingediend, historie en ontvangstbevestiging | R1, R2 |
| Elke statuswijziging maakt automatisch een bericht voor de indiener | R2 |
| Ongeldige statusovergang wordt geweigerd | R2 |
| Afwijzen zonder toelichting wordt geweigerd | R2 |
| Goedkeuren pas na beoordeling, inplannen pas met geplande week | R2, R3 |
| Opnieuw beoordelen werkt de bestaande beoordeling bij | R3 |
| Ongeldige weeknotatie wordt geweigerd | R3 |
| Dashboard telt totalen en signaleert voorstellen die te lang wachten | R4 |
| Demodata is referentieel consistent (alle verwijzingen kloppen) | Datamodel |
| ISO-weeknummer klopt | Hulpfunctie |
| Medewerker mag niet beoordelen of status wijzigen (iteratie 2) | NF2 |
| Rare invoer (HTML, spaties, te lang) veilig afgehandeld (iteratie 2) | R1 |
| Dashboard met 1.000 voorstellen binnen 1 seconde (iteratie 2) | Performance |
| API geeft data en mailstand (iteratie 3) | – |
| Indienen via API slaat op in bestand en stuurt ontvangstmail (iteratie 3) | R1, R2 |
| Statuswijziging mailt de indiener met toelichting; mailstatus vastgelegd (iteratie 3) | R2 |
| Medewerker of onbekende gebruiker geweigerd door de server (iteratie 3) | NF2 |
| Geweigerde wijziging laat geen halve data achter (iteratie 3) | Correctheid |
| Testadres-schakelaar stuurt alle mail naar één adres (iteratie 3) | NF2 |
| HTML in titel wordt ge-escaped in de e-mail (iteratie 3) | NF2 |
| Mailer kiest voorbeeldstand zonder Gmail-instellingen (iteratie 3) | – |
| Alleen indiener en stuurgroep zien het gesprek (iteratie 5) | R7, NF2 |
| Reactie van indiener geeft melding aan de hele stuurgroep; reactie van stuurgroep alleen aan de indiener (iteratie 5) | R7 |
| Andere medewerkers en management kunnen niet reageren (iteratie 5) | R7, NF2 |
| Leeg bericht of meer dan 1000 tekens geweigerd (iteratie 5) | R7 |
| Eigen bericht bewerken tot 15 minuten, daarna en door een ander geweigerd (iteratie 5) | R7 |
| Werkt met een bestaand databestand zonder reacties (iteratie 5) | Correctheid |
| API: reageren, bewerken, weigeren van buitenstaanders, geen e-mail (iteratie 5) | R7 |
| Tab Gesprekken toont alleen gesprekken waar je deelnemer van bent, nieuwste bovenaan (iteratie 5b) | R7 |
| Database: RLS op gesprekken, meldingen naar de juiste partij, bewerken na 15 minuten geweigerd, geen directe schrijfrechten (iteratie 5) | R7, NF2 |

## 3. Functionele testgevallen (handmatig)

| ID | Req. | Stappen | Verwacht resultaat | Resultaat 25-11-2026 |
|---|---|---|---|---|
| TC-01 | R1 | Als Theo: klik "Voorstel indienen" zonder iets in te vullen. | Foutmeldingen voor titel, omschrijving en categorie; niets opgeslagen. | Geslaagd |
| TC-02 | R1 | Vul titel, omschrijving (≥ 20 tekens) en categorie in, dien in. | Melding "Bedankt", voorstel staat in "Mijn voorstellen" met status Ingediend; 1 nieuw bericht. | Geslaagd |
| TC-03 | R3 | Als Olaf: open het nieuwe voorstel, kies impact hoog, urgentie hoog, inzet middel. | Berekende prioriteit Hoog (score 8) wordt direct getoond. | Geslaagd |
| TC-04 | R2, R6 | Zet status naar In beoordeling, Goedgekeurd, Ingepland (met week), Overgedragen. | Alleen toegestane knoppen zichtbaar; inplannen zonder week geeft melding. | Geslaagd tot Goedgekeurd in de schermen; Ingepland/Overgedragen aangetoond met unittest |
| TC-05 | R2, R5 | Probeer af te wijzen zonder toelichting; daarna mét. Wissel naar indiener. | Zonder toelichting geweigerd. Indiener ziet bericht met toelichting en historie. | Geslaagd |
| TC-06 | R4 | Als Haico: open Dashboard. | Tegels en grafieken kloppen met de data; voorstel > 7 dagen zonder reactie wordt gesignaleerd. | Geslaagd |
| TC-07 | NF1 | Laat een tester zonder uitleg een voorstel indienen; meet de tijd. | Binnen 5 minuten, zonder hulp. | *Nog uit te voeren met testers* |
| TC-10 | R2 | Vul `.env` met Gmail en `MAIL_TEST_ONTVANGER`, zet een status om. | Testadres ontvangt binnen een minuut een nette e-mail met status en toelichting. | *Uit te voeren door Theo met eigen Gmail* |
| TC-11 | NF2 | Online: log in als medewerker en probeer via de browserconsole `wijzig_status` aan te roepen. | Database weigert: "Alleen de stuurgroep mag ...". | Geslaagd (databasetest `tests/supabase/test.sql`) |
| TC-13 | R7 | Online op twee apparaten: stuurgroep stelt een vraag bij een voorstel van de medewerker; medewerker antwoordt en bewerkt het antwoord. Log daarna in als management en open hetzelfde voorstel. | Vraag en antwoord verschijnen live; de ontvanger ziet een rood bolletje in de lijst en een melding; "bewerkt" staat bij het bericht; management ziet geen gesprek. | *Uit te voeren door Theo na het draaien van het nieuwe SQL-script* |
| TC-14 | R7 | Online op twee apparaten: stuurgroep start via Gesprekken → Nieuw gesprek een vraag bij een voorstel van de medewerker en wijzigt daarna de status. | Medewerker ziet binnen enkele seconden twee pop-ups (reactie en status) met Bekijken; de tab Gesprekken krijgt een rood tellertje; management ziet het gesprek niet in zijn tab. | *Uit te voeren door Theo* |
| TC-12 | R2, R5 | Online op drie apparaten: medewerker dient in, stuurgroep beoordeelt en keurt goed, management kijkt mee. | Elk apparaat toont de wijziging binnen enkele seconden zonder verversen; indiener krijgt een melding. | Geslaagd (Theo, 25-11-2026): "ik zie direct alles verschijnen" |
| TC-13 | NF2 | Online: open de app zonder in te loggen en vraag via de API de voorstellen op; log in met een fout wachtwoord. | API geeft "permission denied"; foutmelding verraadt niet of het e-mailadres bestaat; knop 3 s geblokkeerd. | Geslaagd (25-11-2026) |
| TC-08 | NF2 | Dien een voorstel in met titel `<script>alert(1)</script>`. | Tekst wordt letterlijk getoond, er verschijnt geen pop-up. | Geslaagd |
| TC-09 | NF3 | Open de app op een telefoon (390 px breed) en bedien het formulier met alleen het toetsenbord. | Geen horizontaal scrollen; alle velden bereikbaar met Tab. | Deels: 390 px zonder horizontaal scrollen; toetsenbordbediening nog handmatig controleren |

TC-01 t/m TC-06, TC-08 en TC-09 (schermbreedte) zijn uitgevoerd met een geautomatiseerde browsertest (Playwright) op het prototype. Er traden geen JavaScript-fouten op.

## 4. Acceptatietest met key users (in te vullen tijdens Sprint Review)

| Taak voor de tester | Gelukt zonder hulp? | Tijd | Opmerkingen / feedback |
|---|---|---|---|
| Dien een verbetervoorstel in over iets dat je deze week zag | | | |
| Zoek op wat er met je voorstel is gebeurd | | | |
| (Stuurgroep) Beoordeel een voorstel en zet het op Goedgekeurd | | | |
| (Management) Vertel na 30 seconden dashboard: wat vraagt nu aandacht? | | | |

Validatievragen na afloop: *Zou je dit echt gebruiken? Wat houdt je tegen? Wat mist er?*

## 5. Bekende beperkingen (input voor vervolg naar MVP)

- Authenticatie alleen in de online versie (Supabase, e-mail + wachtwoord); voor productie Microsoft 365-login.
- De online versie verstuurt geen e-mail (alleen berichten in de app).
- Berichten verschijnen alleen in de app, niet per e-mail of Teams.
- Geen capaciteitscontrole per week (de stuurgroep kiest zelf de week).
