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
// Seeded once into the `games` table (see seedTeamFixtures in db.ts) under
// the Hockey One system account, and made visible to every user whose own
// default_team matches — see the GET/PUT handlers in api/games.ts.
export const TEAM_FIXTURES: Record<string, { date: string; opponent: string; homeAway: 'Thuis' | 'Uit' }[]> = {
  'MO7-Blauw': [],
  'MO7-Geel': [],
  'MO7-Rood': [],
  'MO8-Blauw': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO8-Lila', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Huizer HC MO8-Wit', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-blauw', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO8-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Turquoise', homeAway: 'Uit' },
  ],
  'MO8-Geel': [
    { date: '2026-09-05', opponent: 'Almeerse HC MO8-4', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO8-Rood', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-Roze', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Huizer HC MO8-Rood', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Geel', homeAway: 'Uit' },
  ],
  'MO8-Rood': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO8-Paars', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO8-Lila', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-geel', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO8-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Oranje', homeAway: 'Uit' },
  ],
  'MO8-Wit': [
    { date: '2026-09-05', opponent: 'Huizer HC MO8-Blauw', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO8-groen', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO8-wit', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Buitenhout MHC MO8-Wit', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO8-Roze', homeAway: 'Thuis' },
  ],
  'MO9-Blauw': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-paars', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Buitenhout MHC MO9-Blauw', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Huizer HC MO9-Oranje', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO9-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'MHC Muiderberg MO9-Roze', homeAway: 'Uit' },
  ],
  'MO9-Geel': [
    { date: '2026-09-05', opponent: 'Huizer HC MO9-Groen', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Nijkerk (H.C.) MO9-Blauw', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC MO9-Geel', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Almeerse HC MO9-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden MO9-blauw', homeAway: 'Thuis' },
  ],
  'MO9-Oranje': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-wit', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO9-wit', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Larensche Mixed Hockey Club MO9-Geel', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Hilversum MO9-Rood', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: "'t Spandersbosch MO9-geel", homeAway: 'Thuis' },
  ],
  'MO9-Wit': [
    { date: '2026-09-05', opponent: 'Hockey Club Naarden MO9-groen', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Almeerse HC MO9-4', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'SCHC MO9-Oranje', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Schaerweijde MO9-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Huizer HC MO9-Blauw', homeAway: 'Thuis' },
  ],
  'MO10-Blauw': [
    { date: '2026-09-05', opponent: 'Huizer HC MO10-Groen', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club MO10-rood', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Hockey Club Naarden MO10-geel', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Larensche Mixed Hockey Club MO10-Roze', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Buitenhout MHC MO10-Rood', homeAway: 'Thuis' },
  ],
  'MO11-Blauw': [
    { date: '2026-09-05', opponent: 'M.H.C. Weesp MO11-4', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Zeewolde MO11-1', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC MO11-2', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'AHC Noorderlicht MO11-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockeyclub VVV MO11-5', homeAway: 'Thuis' },
  ],
  'MO11-Wit': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club MO11-3', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO11-3', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Huizer HC MO11-2', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hilversum MO11-2', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Almeerse HC MO11-2', homeAway: 'Uit' },
  ],
  'MO12-1': [
    { date: '2026-09-05', opponent: 'MHC Muiderberg MO12-1', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Pinoké MO12-2', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Hurley MO12-4', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'M.H.C. Weesp MO12-1', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Hockey Vereniging Abcoude MO12-1', homeAway: 'Uit' },
  ],
  'MO12-2': [
    { date: '2026-09-05', opponent: 'Hockeyclub AMVJ MO12-2', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'HV Myra MO12-3', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'M.H.C. Weesp MO12-3', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'HC Diemen MO12-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Amsterdam MO12-3', homeAway: 'Uit' },
  ],
  'MO14-1': [
    { date: '2026-09-05', opponent: 'Hockeyclub AMVJ MO14-3', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Vereniging Mijdrecht MO14-1', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Hockey Vereniging Abcoude MO14-2', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'M.H.C. Weesp MO14-3', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'HC Athena MO14-3', homeAway: 'Uit' },
  ],
  'MO14-2': [
    { date: '2026-09-05', opponent: 'Buitenhout MHC MO14-3', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hilversum MO14-7', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Gooische Hockey Club MO14-6', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'MHV Maarssen MO14-6', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'Baarnse Mixed Hockey Vereniging MO14-3', homeAway: 'Uit' },
  ],
  'MO18-1': [
    { date: '2026-09-05', opponent: 'DMHC Shinty MO18-4', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden MO18-5', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Schaerweijde MO18-4', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'MHC De Mezen MO18-3', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Soest MO18-5', homeAway: 'Thuis' },
  ],
  'JO7-Blauw': [],
  'JO8-Blauw': [
    { date: '2026-09-05', opponent: 'Gooische Hockey Club JO8-rood', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden JO8-Oranje', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Buitenhout MHC JO8-Groen', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hockey Club Naarden JO8-Groen', homeAway: 'Uit' },
  ],
  'JO9-Blauw': [
    { date: '2026-09-05', opponent: 'Buitenhout MHC JO9-Oranje', homeAway: 'Thuis' },
    { date: '2026-09-12', opponent: 'Hockey Club Naarden JO9-blauw', homeAway: 'Uit' },
    { date: '2026-09-19', opponent: 'Almeerse HC JO9-1', homeAway: 'Thuis' },
    { date: '2026-09-26', opponent: 'Hockeyclub Amersfoort JO9-Geel', homeAway: 'Thuis' },
    { date: '2026-10-03', opponent: 'MHC Muiderberg JO9-Oranje', homeAway: 'Uit' },
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
  ],
  'JO11-Blauw': [
    { date: '2026-09-05', opponent: 'MHC Fletiomare JO11-2', homeAway: 'Uit' },
    { date: '2026-09-12', opponent: 'Gooische Hockey Club JO11-1', homeAway: 'Thuis' },
    { date: '2026-09-19', opponent: 'Loenense MHC JO11-1', homeAway: 'Uit' },
    { date: '2026-09-26', opponent: 'Amsterdam JO11-1', homeAway: 'Uit' },
    { date: '2026-10-03', opponent: 'Hockey Club Naarden JO11-1', homeAway: 'Thuis' },
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
    { date: '2026-11-13', opponent: 'Hilversum DS1', homeAway: 'Uit' },
    { date: '2026-11-13', opponent: 'Hockey Club Houten DS1', homeAway: 'Uit' },
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
    { date: '2026-11-13', opponent: 'Gooische Hockey Club HS1', homeAway: 'Uit' },
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
