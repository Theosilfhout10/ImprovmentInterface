# Specificatie voor AI (spec-driven vibecoding)

Dit is de mini-specificatie waarmee het prototype is gegenereerd en waartegen elke iteratie wordt gecontroleerd. De opbouw volgt de "sterke startprompt" uit de training *Softwareontwikkeling & Vibecoding* (Context, Probleem, Kernflow, Data, Randvoorwaarden, Acceptatie). Les uit de training: prompt niet alleen "maak een app", maar geef de AI een mini-specificatie.

## Context
Egency is een IT-dienstverlener met ongeveer 20 medewerkers (engineers, servicedesk, consultants). Gebruikers: medewerkers (indienen), stuurgroep (Olaf van Heeswijk, Arjen Fiechter: beoordelen) en management (Haico de Boer: overzicht).

## Probleem
Verbeterideeën over klantomgevingen, interne processen en beveiliging worden alleen mondeling gedeeld en raken door werkdruk ondergesneeuwd. Er is geen overzicht, geen onderbouwing om te prioriteren en indieners horen niets terug.

## Kernflow
1. Medewerker vult een formulier in (max. 5 velden) en ziet een bevestiging.
2. Stuurgroep ziet in de werklijst nieuwe voorstellen bovenaan, scoort impact/urgentie/inzet (laag/middel/hoog), de app berekent de prioriteit, de stuurgroep zet de status en plant in.
3. Bij elke statuswijziging krijgt de indiener automatisch een bericht met toelichting.
4. Management bekijkt het dashboard: aantallen per status, categorie en prioriteit, reactietijd en wat te lang blijft liggen.

## Data
Max. 6 entiteiten: Medewerker, Categorie, Voorstel, Beoordeling, Statuswijziging, Notificatie (zie [ontwerp.md](ontwerp.md)). Alleen fictieve demodata, geen productie- of klantgegevens.

## Randvoorwaarden
- Nederlandstalig, eenvoudige navigatie, werkt op laptop en telefoon, donkere modus.
- Validatie van alle invoer; ingevoerde tekst nooit als HTML uitvoeren.
- Rollen: alleen de stuurgroep beoordeelt en wijzigt status (ook afgedwongen in de logica).
- Geen framework of installatie: openen door te dubbelklikken, zodat de code uitlegbaar blijft.
- Bedrijfsregels gescheiden van de schermen en automatisch getest.
- Buiten scope: Freshservice-koppeling, externe indieners, oude ideeën overzetten, echte login.

## Acceptatie (wanneer is de eerste versie "werkend"?)
- De drie kernflows werken van begin tot eind met de demodata.
- Alle geautomatiseerde tests zijn groen in GitHub Actions.
- Testgevallen TC-01 t/m TC-09 uit [testplan.md](testplan.md) zijn uitgevoerd.
- De acceptatiecriteria (Gegeven/Als/Dan) in [ontwerp.md](ontwerp.md) §6a kloppen.
