# Testplan en testresultaten – Verbeterregistratie

## 1. Teststrategie

| Niveau | Wat | Wie | Wanneer |
|---|---|---|---|
| Unittests (geautomatiseerd) | Bedrijfsregels in `js/logica.js`: prioriteit, validatie, statusovergangen, terugkoppeling, dashboardcijfers, consistentie datamodel | Ontwikkelaar, automatisch via GitHub Actions | Bij elke commit |
| Functionele test (handmatig) | Testgevallen TC-01 t/m TC-09 hieronder, via de schermen | Ontwikkelaar | Einde van elke sprint |
| Acceptatietest | Echte gebruikers voeren taken uit en geven feedback (NF1 bruikbaarheid) | Matthijs van Voorthuizen, AnneMirthe Roelofsen (key users) | Sprint Review sprint 3 |
| Validatie | Klopt de oplossing met het probleem? Stuurgroep beoordeelt het dashboard en het proces | Olaf van Heeswijk (PO), Haico de Boer | Sprint Review |

## 2. Geautomatiseerde tests

Uitvoeren met `npm test`. Resultaat bij oplevering van iteratie 1 (25-11-2026): **15 van 15 geslaagd**. Na iteratie 2: **18 van 18 geslaagd** (extra: autorisatie, robuustheid, performance).

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

- Geen echte authenticatie: iedereen kan in het prototype elke rol kiezen.
- Data staat per browser (`localStorage`), dus niet gedeeld tussen collega's.
- Berichten verschijnen alleen in de app, niet per e-mail of Teams.
- Geen capaciteitscontrole per week (de stuurgroep kiest zelf de week).
