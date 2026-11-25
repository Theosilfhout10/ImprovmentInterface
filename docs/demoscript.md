# Demoscript prototype (± 5 minuten, drie apparaten)

**Voorbereiding (dag ervoor):** open het Supabase-dashboard (een gratis project pauzeert na 7 dagen stilte; klik zo nodig *Restore*). Open op drie apparaten https://theosilfhout10.github.io/ImprovmentInterface/ en log in:

| Apparaat | Account | Rol |
|---|---|---|
| Telefoon | `medewerker@verbeterregistratie.test` | Medewerker (Theo) |
| Laptop (beamer) | `stuurgroep@verbeterregistratie.test` | Stuurgroep (Olaf) |
| Tablet of tweede laptop | `management@verbeterregistratie.test` | Management (Haico) |

Klik vlak voor de demo op één apparaat onderaan op **Demodata herstellen**. Controleer onderaan het groene bolletje "Live".

1. **Probleem (30 s).** "Ideeën gaan nu mondeling en raken ondergesneeuwd. Deze app legt ze vast, laat de stuurgroep ze wekelijks beoordelen en garandeert terugkoppeling."
2. **Rollen (30 s).** Laat het label in de kop zien (Medewerker, Stuurgroep, Management) en hoe het menu per rol verschilt. De database controleert de rol, niet alleen het scherm.
3. **Kernfunctie 1: indienen (1 min, telefoon).** Dien eerst leeg in (validatie), daarna een echt voorstel. Wijs naar de laptop: het voorstel staat direct in de werklijst "Te beoordelen". Het dashboard op de tablet telt mee.
4. **Kernfunctie 2: beoordelen en terugkoppelen (2 min, laptop).** Open het voorstel, kies impact/urgentie/inzet: de prioriteit wordt direct berekend. Probeer af te wijzen zonder toelichting (geweigerd). Zet op In beoordeling en daarna Goedgekeurd. De telefoon toont meteen een melding en de bel telt op.
5. **Kernfunctie 3: dashboard (1 min, tablet).** Tegels, status/prioriteit/categorie en het signaal "langer dan 7 dagen zonder reactie" (bewaakt de discipline van het wekelijkse overleg). De cijfers zijn tijdens de demo live veranderd.
6. **Relatie met ontwerp (30 s).** ERD in [ontwerp.md](ontwerp.md): elke statuswijziging maakt een Notificatie; zo is R2 (terugkoppeling) afgedwongen. GitHub Actions: 27 tests groen, waaronder de databasetest op rechten.

**Plan B** als internet of Supabase het niet doet: open de app zonder config (of `npm start` lokaal) en wissel van persoon met de keuzelijst rechtsboven.

## Afsluiting volgens de peer-review-vragen uit de training

1. **Businessvraag:** ideeën raken ondergesneeuwd; voor ~20 medewerkers, de stuurgroep en management.
2. **Live demo:** stappen 2 t/m 5 hierboven.
3. **Wat werkte goed?** De AI een mini-specificatie geven ([spec.md](spec.md)), de bedrijfsregels los laten bouwen en testen, en kleine iteraties via pull requests.
4. **Risico:** waar vertrouw ik het nog niet? Bruikbaarheid nog niet getoetst met echte gebruikers; demo-accounts met gedeeld wachtwoord; gratis hosting zonder afspraken over beschikbaarheid en back-up; online versie mailt niet.
5. **Productiestap:** login via Microsoft 365, hosting en beheer binnen Egency (of Supabase met verwerkersovereenkomst), meldingen per e-mail/Teams, security-review door Arjen (zie [kwaliteit.md](kwaliteit.md)).
