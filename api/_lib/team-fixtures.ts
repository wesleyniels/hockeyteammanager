// One-time fixture import for SC Muiden's youth teams. This app's own
// roster-naming convention doesn't always match hockey.nl's team numbering
// (jersey-color names like MO9-Blauw/MO9-Geel vs. hockey.nl's MO9-1/MO9-2) —
// most teams happen to share a name, but MO11-Blauw is hockey.nl's MO11-2,
// and JO11-Blauw is JO11-1. There's no live sync with hockey.nl (its
// robots.txt disallows automated /api/ access, which almost certainly backs
// the match-center SPA), so this is a fixed, one-time transcription of each
// team's KNHB voorcompetitie schedule (match center, read 2026-08-11) for
// whichever poule it had fixtures in at the time. MO7-Blauw/MO7-Geel/
// MO7-Rood and JO7-Blauw (hockey.nl: JO7-Wit) had no schedule published yet
// for that age group. Re-transcribe by hand next season rather than
// building a standing scraper.
//
// 'Dames S1'/'Dames S2'/'Heren S1' added later (read 2026-08-26) from
// knhb.nl/match-center's direct per-team deep links — the /match-center
// landing page still never loads real data for an automated browser, but a
// direct #/team/<id>|<id>/program link does render. Only the "Herfst"
// (autumn) poule's schedule was transcribed; each team's KNHB page also
// lists "Winter" and "Lente" poules whose fixtures weren't reachable
// (the poule-switcher dropdown wouldn't respond to automated clicks) — add
// those by hand once that part of the season is underway. These three teams
// play "Mix Hockey7" (7-a-side) rather than full 11-a-side, hence two
// fixtures on some dates and opponent team codes like HS1/DS1/DS4 instead
// of the youth teams' MO/JO-number-1/2/3 style.
//
// Re-read 2026-10-19 once KNHB published the "Najaar" (youth, 31 Oct - 28 Nov;
// MO18-1 also its Mar-Jun 2027 half) and Herfst/Winter senior programs: every
// team's /program page, opponent club names expanded from the match center's
// short forms ("Naarden") to the official names ClubLogo resolves ("Hockey
// Club Naarden"). Three senior 2026-11-13 fixtures KNHB has since
// rescheduled are corrected here, but seedTeamFixtures is ON CONFLICT DO
// NOTHING, so a database that already holds the old rows needs those three
// updated by hand. MO7-Wit and MO9-Rood were added as new teams in the same
// pass (a `teams` row has to exist too — see SEED_TEAMS). JO9-Wit no longer
// has a KNHB program but is left in place.
//
// Seeded once into the `games` table (see seedTeamFixtures in db.ts) under
// the Hockey One system account, and made visible to every user whose own
// default_team matches — see the GET/PUT handlers in api/games.ts.
export const TEAM_FIXTURES: Record<string, { date: string; opponent: string; homeAway: 'Thuis' | 'Uit' }[]> = {
  'MO7-Blauw': [
    { date: '2026-10-31', opponent: 'SC Muiden MO7-Rood', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'MHC Muiderberg JO7-Geel-mix', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Almeerse HC MO7-Chimpansees', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'SC Muiden MO7-Rood', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'MHC Muiderberg JO7-Geel-mix', homeAway: 'Thuis' },
  ],
  'MO7-Geel': [
    { date: '2026-10-31', opponent: 'Almeerse HC MO7-Gibbons', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'SC Muiden MO7-Wit', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Buitenhout MHC MO7-Oranje', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Almeerse HC MO7-Gibbons', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'SC Muiden MO7-Wit', homeAway: 'Thuis' },
  ],
  'MO7-Rood': [
    { date: '2026-10-31', opponent: 'SC Muiden MO7-Blauw', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Almeerse HC MO7-Chimpansees', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'MHC Muiderberg JO7-Geel-mix', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'SC Muiden MO7-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Almeerse HC MO7-Chimpansees', homeAway: 'Uit' },
  ],
  'MO7-Wit': [
    { date: '2026-10-31', opponent: 'Buitenhout MHC MO7-Oranje', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'SC Muiden MO7-Geel', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Almeerse HC MO7-Gibbons', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Buitenhout MHC MO7-Oranje', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'SC Muiden MO7-Geel', homeAway: 'Uit' },
  ],
  'MO8-Blauw': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO8-Lila', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Huizer HC MO8-Wit', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-blauw', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO8-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Turquoise', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Huizer HC MO8-Groen', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Almeerse HC MO8-1', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Larensche Mixed Hockey Club MO8-Geel', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Hockey Club Naarden MO8-Oranje', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Gooische Hockey Club MO8-geel', homeAway: 'Uit' },
  ],
  'MO8-Geel': [
    { date: '2026-09-05', opponent: 'Almeerse HC MO8-4', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO8-Rood', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-Roze', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Huizer HC MO8-Rood', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Geel', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Larensche Mixed Hockey Club MO8-Oranje', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: "'t Spandersbosch MO8-Roze", homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Gooische Hockey Club MO8-wit', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'H.C. Eemvallei MO8-Blauw', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Hockey Club Naarden MO8-Rood', homeAway: 'Thuis' },
  ],
  'MO8-Rood': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO8-Paars', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO8-Lila', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-geel', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO8-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Oranje', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Almeerse HC MO8-2', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Hockey Club Naarden MO8-Lila', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Schaerweijde MO8-3', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Hockey Club Naarden MO8-Geel', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Buitenhout MHC MO8-Wit', homeAway: 'Thuis' },
  ],
  'MO8-Wit': [
    { date: '2026-09-05', opponent: 'Huizer HC MO8-Blauw', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO8-groen', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-wit', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Buitenhout MHC MO8-Wit', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Roze', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'MHC Fletiomare MO8-Groen', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Gooische Hockey Club MO8-oranje', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'MMHC Voordaan MO8-Groen', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Larensche Mixed Hockey Club MO8-Rood', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'H.C. Eemvallei MO8-Rood', homeAway: 'Uit' },
  ],
  'MO9-Blauw': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-paars', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Buitenhout MHC MO9-Blauw', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Huizer HC MO9-Oranje', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO9-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'MHC Muiderberg MO9-Roze', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Huizer HC MO9-Groen', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Larensche Mixed Hockey Club MO9-Wit', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: "'t Spandersbosch MO9-Groen", homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'MMHC Voordaan MO9-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'H.C. Eemvallei MO9-Groen', homeAway: 'Uit' },
  ],
  'MO9-Geel': [
    { date: '2026-09-05', opponent: 'Huizer HC MO9-Groen', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Nijkerk (H.C.) MO9-Blauw', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC MO9-Geel', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO9-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO9-blauw', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'H.C. Eemvallei MO9-Paars', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Kampong MO9-3', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Larensche Mixed Hockey Club MO9-Rood', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'MMHC Voordaan MO9-Groen', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Hockeyclub Amersfoort MO9-Rood', homeAway: 'Thuis' },
  ],
  'MO9-Oranje': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-wit', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO9-wit', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Larensche Mixed Hockey Club MO9-Geel', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Hilversum MO9-Rood', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: "'t Spandersbosch MO9-geel", homeAway: 'Thuis' },
    { date: '2026-10-24', opponent: 'Huizer HC MO9-Blauw', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Gooische Hockey Club MO9-blauw', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Buitenhout MHC MO9-Blauw', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Huizer HC MO9-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Gooische Hockey Club MO9-blauw', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Buitenhout MHC MO9-Blauw', homeAway: 'Thuis' },
  ],
  'MO9-Rood': [
    { date: '2026-10-31', opponent: 'SCHC MO9-Paars', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Baarnse Mixed Hockey Vereniging MO9-Wit-mix', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'MHV Maarssen MO9-4', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Schaerweijde MO9-5', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Soest MO9-Geel', homeAway: 'Uit' },
  ],
  'MO9-Wit': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-groen', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Almeerse HC MO9-4', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'SCHC MO9-Oranje', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Schaerweijde MO9-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Huizer HC MO9-Blauw', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Huizer HC MO9-Wit', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'MHC Fletiomare MO9-Geel', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'MMHC Voordaan MO9-Oranje', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Larensche Mixed Hockey Club MO9-Oranje', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Kampong MO9-2', homeAway: 'Thuis' },
  ],
  'MO10-Blauw': [
    { date: '2026-09-05', opponent: 'Huizer HC MO10-Groen', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO10-rood', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Hockey Club Naarden MO10-geel', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Larensche Mixed Hockey Club MO10-Roze', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Buitenhout MHC MO10-Rood', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Gooische Hockey Club MO10-geel', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Hockey Club Naarden MO10-Roze', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Huizer HC MO10-Rood', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Almeerse HC MO10-3', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Larensche Mixed Hockey Club MO10-Groen', homeAway: 'Thuis' },
  ],
  'MO11-Blauw': [
    { date: '2026-09-05', opponent: 'M.H.C. Weesp MO11-4', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Zeewolde MO11-1', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC MO11-2', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'AHC Noorderlicht MO11-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockeyclub VVV MO11-5', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Hockey Club Naarden MO11-5', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Gooische Hockey Club MO11-5', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Huizer HC MO11-3', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Hockey Club Zeewolde MO11-2', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Larensche Mixed Hockey Club MO11-4', homeAway: 'Thuis' },
  ],
  'MO11-Wit': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO11-3', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO11-3', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Huizer HC MO11-2', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hilversum MO11-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Almeerse HC MO11-2', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Hilversum MO11-3', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Hockey Club Naarden MO11-3', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Gooische Hockey Club MO11-1', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'H.C. Eemvallei MO11-2', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Huizer HC MO11-2', homeAway: 'Uit' },
  ],
  'MO12-1': [
    { date: '2026-09-05', opponent: 'MHC Muiderberg MO12-1', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Pinoké MO12-2', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Hurley MO12-4', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'M.H.C. Weesp MO12-1', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Vereniging Abcoude MO12-1', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Larensche Mixed Hockey Club MO12-2', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'MHC Muiderberg MO12-1', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Hockey Club Naarden MO12-2', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Gooische Hockey Club MO12-2', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Loenense MHC MO12-1', homeAway: 'Uit' },
  ],
  'MO12-2': [
    { date: '2026-09-05', opponent: 'Hockeyclub AMVJ MO12-2', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'HV Myra MO12-3', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'M.H.C. Weesp MO12-3', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'HC Diemen MO12-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Amsterdam MO12-3', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Hockey Club Naarden MO12-5', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: "'t Spandersbosch MO12-5", homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Gooische Hockey Club MO12-5', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'SCHC MO12-6', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Loenense MHC MO12-2', homeAway: 'Thuis' },
  ],
  'MO14-1': [
    { date: '2026-09-05', opponent: 'Hockeyclub AMVJ MO14-3', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Vereniging Mijdrecht MO14-1', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Hockey Vereniging Abcoude MO14-2', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'M.H.C. Weesp MO14-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'HC Athena MO14-3', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Loenense MHC MO14-1', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'MHC De Mezen MO14-2', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Gooische Hockey Club MO14-4', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: "'t Spandersbosch MO14-3", homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'Hockey Club Zeewolde MO14-1', homeAway: 'Thuis' },
  ],
  'MO14-2': [
    { date: '2026-09-05', opponent: 'Buitenhout MHC MO14-3', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hilversum MO14-7', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO14-6', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'MHV Maarssen MO14-6', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Baarnse Mixed Hockey Vereniging MO14-3', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'SCHC MO14-5', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'Huizer HC MO14-4', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Hockey Club Zeewolde MO14-2', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Buitenhout MHC MO14-3', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'MHV Maarssen MO14-5', homeAway: 'Thuis' },
  ],
  'MO18-1': [
    { date: '2026-09-05', opponent: 'DMHC Shinty MO18-4', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO18-5', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Schaerweijde MO18-4', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'MHC De Mezen MO18-3', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Soest MO18-5', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Gooische Hockey Club MO18-6', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'H.C. Eemvallei MO18-2', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Hockey Club Houten MO18-4', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'MHC Fletiomare MO18-5', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Nieuwegein MO18-2', homeAway: 'Uit' },
    { date: '2027-03-06', opponent: "'t Spandersbosch MO18-3", homeAway: 'Thuis' },
    { date: '2027-03-13', opponent: 'MHC Muiderberg MO18-1', homeAway: 'Uit' },
    { date: '2027-03-20', opponent: 'Gooische Hockey Club MO18-6', homeAway: 'Thuis' },
    { date: '2027-04-03', opponent: 'H.C. Eemvallei MO18-2', homeAway: 'Uit' },
    { date: '2027-04-10', opponent: 'Hockey Club Houten MO18-4', homeAway: 'Thuis' },
    { date: '2027-04-17', opponent: 'MHC Fletiomare MO18-5', homeAway: 'Uit' },
    { date: '2027-05-22', opponent: 'Nieuwegein MO18-2', homeAway: 'Thuis' },
    { date: '2027-05-29', opponent: "'t Spandersbosch MO18-3", homeAway: 'Uit' },
    { date: '2027-06-05', opponent: 'MHC Muiderberg MO18-1', homeAway: 'Thuis' },
  ],
  'JO7-Blauw': [
    { date: '2026-11-01', opponent: 'M.H.C. Weesp JO7-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-08', opponent: 'Loenense MHC JO7-1', homeAway: 'Uit' },
    { date: '2026-11-15', opponent: 'Hilversum JO7-Groen', homeAway: 'Thuis' },
    { date: '2026-11-22', opponent: 'Larensche Mixed Hockey Club JO7-Groene Krokodillen', homeAway: 'Thuis' },
    { date: '2026-11-29', opponent: "'t Spandersbosch JO7-Groen", homeAway: 'Uit' },
  ],
  'JO8-Blauw': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club JO8-rood', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden JO8-Oranje', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC JO8-Groen', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hockey Club Naarden JO8-Groen', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'MHC Fletiomare JO8-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Gooische Hockey Club JO8-groen', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'MMHC Voordaan JO8-Oranje', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Huizer HC JO8-Rood', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Hockey Club Naarden JO8-Rood', homeAway: 'Uit' },
  ],
  'JO9-Blauw': [
    { date: '2026-09-05', opponent: 'Buitenhout MHC JO9-Oranje', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden JO9-blauw', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Almeerse HC JO9-1', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hockeyclub Amersfoort JO9-Geel', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'MHC Muiderberg JO9-Oranje', homeAway: 'Uit' },
    { date: '2026-10-31', opponent: 'Gooische Hockey Club JO9-groen', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'Hockey Club Naarden JO9-Wit', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'MHC Fletiomare JO9-Rood', homeAway: 'Thuis' },
    { date: '2026-11-21', opponent: 'Almeerse HC JO9-1', homeAway: 'Uit' },
    { date: '2026-11-28', opponent: 'MHC Muiderberg JO9-Blauw', homeAway: 'Thuis' },
  ],
  'JO9-Wit': [
    { date: '2026-09-05', opponent: 'Baarnse Mixed Hockey Vereniging JO9-Blauw', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'SCHC JO9-Oranje', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Schaerweijde JO9-1', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'MHC Muiderberg JO9-Blauw', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden JO9-rood', homeAway: 'Thuis' },
  ],
  'JO10-Blauw': [
    { date: '2026-09-05', opponent: 'Hilversum JO10-Blauw', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Buitenhout MHC JO10-Paars', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'MHV Maarssen JO10-1', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Almeerse HC JO10-2', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'MMHC Voordaan JO10-Blauw', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Larensche Mixed Hockey Club JO10-Geel', homeAway: 'Uit' },
    { date: '2026-11-07', opponent: 'H.C. Eemvallei JO10-Blauw', homeAway: 'Thuis' },
    { date: '2026-11-14', opponent: 'Buitenhout MHC JO10-Paars', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: "'t Spandersbosch JO10-Oranje", homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Gooische Hockey Club JO10-geel', homeAway: 'Uit' },
  ],
  'JO11-Blauw': [
    { date: '2026-09-05', opponent: 'MHC Fletiomare JO11-2', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club JO11-1', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Loenense MHC JO11-1', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Amsterdam JO11-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden JO11-1', homeAway: 'Thuis' },
    { date: '2026-10-31', opponent: 'Larensche Mixed Hockey Club JO11-2', homeAway: 'Thuis' },
    { date: '2026-11-07', opponent: 'MMHC Voordaan JO11-1', homeAway: 'Uit' },
    { date: '2026-11-14', opponent: 'Flevoland Dronten (M.H.C.) JO11-1', homeAway: 'Uit' },
    { date: '2026-11-21', opponent: 'Hilversum JO11-1', homeAway: 'Thuis' },
    { date: '2026-11-28', opponent: 'Soest JO11-1', homeAway: 'Uit' },
  ],
  'Dames S1': [
    { date: '2026-09-04', opponent: 'MHV Maarssen DS1', homeAway: 'Thuis' },
    { date: '2026-09-04', opponent: 'Kampong DS4', homeAway: 'Thuis' },
    { date: '2026-09-18', opponent: 'Kampong DS4', homeAway: 'Uit' },
    { date: '2026-09-18', opponent: 'MHV Maarssen DS1', homeAway: 'Uit' },
    { date: '2026-10-02', opponent: 'Kampong DS4', homeAway: 'Uit' },
    { date: '2026-10-02', opponent: 'MHV Maarssen DS1', homeAway: 'Thuis' },
    { date: '2026-10-30', opponent: 'Hilversum DS1', homeAway: 'Uit' },
    { date: '2026-10-30', opponent: 'Hockey Club Houten DS1', homeAway: 'Thuis' },
    { date: '2026-11-13', opponent: 'Kampong DS4', homeAway: 'Uit' },
    { date: '2026-11-13', opponent: 'MHV Maarssen DS1', homeAway: 'Thuis' },
    { date: '2026-11-27', opponent: 'Hockey Club Houten DS1', homeAway: 'Uit' },
    { date: '2026-11-27', opponent: 'Hilversum DS1', homeAway: 'Thuis' },
  ],
  'Dames S2': [
    { date: '2026-09-04', opponent: 'MHC Muiderberg DS1', homeAway: 'Thuis' },
    { date: '2026-09-04', opponent: 'Gooische Hockey Club DS1', homeAway: 'Thuis' },
    { date: '2026-09-18', opponent: 'M.H.C. Weesp DS1', homeAway: 'Uit' },
    { date: '2026-09-18', opponent: 'MHC Muiderberg DS1', homeAway: 'Thuis' },
    { date: '2026-10-02', opponent: 'M.H.C. Weesp DS1', homeAway: 'Thuis' },
    { date: '2026-10-02', opponent: 'M.H.C. Weesp DS2', homeAway: 'Uit' },
    { date: '2026-10-30', opponent: 'MHC Muiderberg DS1', homeAway: 'Uit' },
    { date: '2026-10-30', opponent: 'Gooische Hockey Club DS1', homeAway: 'Uit' },
    { date: '2026-11-13', opponent: 'M.H.C. Weesp DS2', homeAway: 'Thuis' },
    { date: '2026-11-13', opponent: 'Gooische Hockey Club DS2', homeAway: 'Uit' },
    { date: '2026-11-27', opponent: 'Gooische Hockey Club DS2', homeAway: 'Uit' },
    { date: '2026-11-27', opponent: 'Gooische Hockey Club DS1', homeAway: 'Uit' },
  ],
  'Heren S1': [
    { date: '2026-09-04', opponent: 'Gooische Hockey Club HS1', homeAway: 'Uit' },
    { date: '2026-09-04', opponent: 'MMHC Voordaan HS5', homeAway: 'Thuis' },
    { date: '2026-09-18', opponent: 'Hockeyclub UNO HS1', homeAway: 'Thuis' },
    { date: '2026-09-18', opponent: 'MMHC Voordaan HS5', homeAway: 'Thuis' },
    { date: '2026-10-02', opponent: 'Hockey Club Naarden HS4', homeAway: 'Thuis' },
    { date: '2026-10-02', opponent: 'Gooische Hockey Club HS1', homeAway: 'Uit' },
    { date: '2026-10-30', opponent: 'MMHC Voordaan HS1', homeAway: 'Thuis' },
    { date: '2026-10-30', opponent: 'Hockey Club Naarden HS4', homeAway: 'Uit' },
    { date: '2026-11-13', opponent: 'MMHC Voordaan HS5', homeAway: 'Uit' },
    { date: '2026-11-13', opponent: 'MMHC Voordaan HS1', homeAway: 'Uit' },
    { date: '2026-11-27', opponent: 'MMHC Voordaan HS1', homeAway: 'Uit' },
    { date: '2026-11-27', opponent: 'Hockeyclub UNO HS1', homeAway: 'Thuis' },
  ],
}

// Mirrors ageGroupFromTeamName in src/App.tsx (kept separate since frontend
// and API code aren't shared bundles) -- just enough to label a seeded
// fixture's age group correctly; doesn't need the full AGE_CONFIG validation
// the frontend version has, since every key above is already known-valid.
export function ageGroupFromTeamName(team: string): string {
  if (team === 'Senioren' || /^(Dames|Heren)\b/i.test(team)) return 'Senioren'
  const m = team.match(/^[MJ]O(\d+)/i)
  return m ? `U${m[1]}` : 'U7'
}
