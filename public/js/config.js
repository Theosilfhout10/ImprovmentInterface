/*
 * Instellingen voor de online versie (GitHub Pages) met echte accounts en live data.
 *
 * Leeg gelaten = de app werkt als demo in de browser (gegevens alleen op dit apparaat),
 * of met de eigen Node-server als die draait.
 *
 * Ingevuld = de app gebruikt Supabase: inloggen met e-mail en wachtwoord, één gedeelde database
 * en wijzigingen verschijnen direct op alle apparaten. Zie README, "Live demo met drie accounts".
 *
 * Hier hoort ALLEEN de Project URL en de anon/publishable key. Die zijn bedoeld om openbaar te zijn;
 * de beveiliging zit in de database (Row Level Security en functies met rolcontrole).
 * Zet hier NOOIT de service_role key of het databasewachtwoord.
 */
window.VBR_CONFIG = {
  supabaseUrl: 'https://jhyjehxphksdniqmhate.supabase.co',
  supabaseAnonKey: 'sb_publishable_WzyZPeUhaFxw71Fr7SC1qg_6yE1Mtn_',
  // Demo: toont de drie demo-accounts op het inlogscherm en de knop "Demodata herstellen". Zet op false bij echt gebruik.
  demoModus: true,
};
