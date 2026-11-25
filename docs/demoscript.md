# Demoscript prototype (± 5 minuten)

Voorbereiding: open `index.html`, klik onderaan op **Demodata herstellen**.

1. **Probleem (30 s).** "Ideeën gaan nu mondeling en raken ondergesneeuwd. Deze app legt ze vast, laat de stuurgroep ze wekelijks beoordelen en garandeert terugkoppeling."
2. **Kernfunctie 1: indienen (1 min).** Ingelogd als Theo (medewerker). Laat het formulier zien: 5 velden, waarvan 3 verplicht. Klik eerst op indienen zonder invullen (validatie), vul daarna in en dien in. Laat "Mijn voorstellen" en de bel met 1 nieuw bericht zien.
3. **Kernfunctie 2: beoordelen en terugkoppelen (2 min).** Wissel naar Olaf (stuurgroep). Werklijst "Te beoordelen": onbeoordeelde voorstellen bovenaan. Open het nieuwe voorstel, kies impact/urgentie/inzet en laat zien dat de prioriteit direct wordt berekend. Probeer af te wijzen zonder toelichting (geweigerd). Zet op In beoordeling en daarna Goedgekeurd.
   Wissel terug naar Theo: de berichten met toelichting staan er, en de historie is zichtbaar.
4. **Kernfunctie 3: dashboard (1 min).** Wissel naar Haico (management). Tegels, status/prioriteit/categorie en het signaal "langer dan 7 dagen zonder reactie" (bewaakt de discipline van het wekelijkse overleg).
5. **Relatie met ontwerp (30 s).** Laat het ERD in `docs/ontwerp.md` zien: elke statuswijziging maakt een Notificatie, en dat is precies hoe R2 is afgedwongen. Toon `npm test`: 15 tests groen.

## Afsluiting volgens de peer-review-vragen uit de training

1. **Businessvraag:** ideeën raken ondergesneeuwd; voor ~20 medewerkers, de stuurgroep en management.
2. **Live demo:** stappen 2 t/m 4 hierboven.
3. **Wat werkte goed?** De AI een mini-specificatie geven ([spec.md](spec.md)) en de bedrijfsregels los laten bouwen en testen.
4. **Risico:** waar vertrouw ik het nog niet? Geen echte login en geen gedeelde opslag; bruikbaarheid nog niet getoetst met echte gebruikers.
5. **Productiestap:** login via Microsoft 365, gedeelde opslag, meldingen per e-mail/Teams, security-review door Arjen (zie [kwaliteit.md](kwaliteit.md)).
