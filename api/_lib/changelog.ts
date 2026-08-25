import { version as CURRENT_VERSION } from '../../package.json'

export { CURRENT_VERSION }

// Human-readable "what's new" notes, broadcast to every account's Meldingen
// the first time the app boots on a version not yet announced (see
// announceReleaseIfNeeded in db.ts). Written for the coaches/players/
// supporters using the app — no jargon, no file names, no "refactored" —
// the same tone as an app-store "what's new" entry. A version with no entry
// here is a silent release (bug fixes/internal work only): the version
// marker still advances so nothing re-announces later, but nobody gets
// pinged. Keep each entry short — this renders inside a notification, not
// a changelog page.
export const RELEASE_NOTES: Record<string, string> = {
  '1.1.0': `**Nieuw in Hockey One (v1.1.0)**
- Spelers kunnen per wedstrijd als niet beschikbaar gemarkeerd worden, zodat ze niet per ongeluk op het veld komen
- Groter wedstrijdveld en duidelijkere knoppen tijdens een live wedstrijd
- Tactiekbord opgeruimd: het tekengereedschap zit nu direct op het veld
- Senioren teams (Dames 1, Dames 2, Heren 1) toegevoegd
- Spelers en supporters zien voortaan alleen voorletters van teamgenoten, coaches en managers — coaches en managers blijven volledige namen zien`,
}
