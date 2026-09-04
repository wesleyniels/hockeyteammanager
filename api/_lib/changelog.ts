// Deliberately hardcoded rather than imported from package.json: this is
// the only file under api/ that would otherwise reach outside the api/
// directory, and Vercel's serverless function bundler traces/packages each
// function's files independently — a cross-boundary import here is exactly
// the kind of thing that can build fine locally and 500 on every route in
// production. Bump this by hand alongside package.json's "version" (and the
// src/App.tsx footer's import, which goes through Vite's bundler instead
// and doesn't have this risk) whenever shipping a new release.
export const CURRENT_VERSION = '1.2.1'

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
  '1.2.0': `**Nieuw in Hockey One (v1.2.0)**
- Volg meerdere teams tegelijk, elk met je eigen rol — bijvoorbeeld Manager van je eigen team en Supporter van een ander (in te stellen bij Profiel)
- Kaarten geven nu een strafbank: de speler gaat automatisch naar de bank, met een aftellende timer en een melding zodra die voorbij is
- De wedstrijdklok loopt niet meer uit de pas als je de app op de achtergrond zet of je telefoon vergrendelt
- Bug in het strafcornerbord opgelost: een speler kiezen en neerzetten werkte daar niet goed
- Starten van een wedstrijd verbeterd, met een Herstel-knop om een foutje snel terug te draaien
- Tik overal op een wedstrijdkaart of het logo bovenin om sneller te navigeren`,
  '1.2.1': `**Bugfix (v1.2.1)**
- Het balkje onderin de app verscheen soms niet bij het openen — dit is verholpen`,
}

// Versions announced only in-app, with no accompanying email — for a release
// note too minor to justify an inbox ping (see announceReleaseIfNeeded in
// db.ts). Everything else with a RELEASE_NOTES entry emails by default.
export const RELEASE_NOTES_SKIP_EMAIL = new Set<string>(['1.2.1'])
