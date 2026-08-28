// Source of truth for "who's really a trainer/coach/manager of which team,
// according to Lisa" — Lisa (SC Muiden's club administration system) has no
// public API and is otherwise only reachable through its iOS/Android app or
// its separate club-admin web portal (beheer.lisahockey.nl), so this is a
// one-time-per-season hand transcription of each team's "Ondersteuning"
// list, the same approach team-fixtures.ts uses for match schedules.
//
// Transcribed 2026-08-19 from Lisa's per-team "Ondersteuning" screens.
// "Technisch Coördinator" isn't one of this app's roles (Trainer/Coach/
// Manager) so those entries are dropped; "Ouder coach" is folded into
// 'Coach'. Someone listed under more than one role gets one row per role.
// Still missing (not yet provided): JO8-Blauw (the "JO8-Wit" screenshot
// sent for this doesn't match any team name this app knows — needs
// clarifying whether that's the same team under a different name in
// Lisa). Add it here once available, using the exact team name from
// teams/list. MO8-Wit only had a partial screenshot originally, so may
// still be missing a Manager alongside the Coach added 2026-08-28.
//
// Used only to gate self-selecting an elevated Rol in Profile (see
// isVerifiedStaffName in team-staff.ts and the PUT /api/auth/me check in
// api/auth/[action].ts) — a name match here is what unlocks Trainer/Coach/
// Trainer & Coach/Manager instead of leaving only Speler/Supporter
// available. Re-transcribe by hand each season as Lisa's assignments change.
export const TEAM_STAFF: Record<string, { role: 'Trainer' | 'Coach' | 'Manager'; firstName: string; lastName: string }[]> = {
  'MO7-Blauw': [
    { role: 'Coach', firstName: 'Stefan', lastName: 'Quak' },
  ],
  'MO7-Geel': [
    { role: 'Coach', firstName: 'Deborah', lastName: 'Oskam' },
  ],
  'MO7-Rood': [
    { role: 'Coach', firstName: 'Joeri ruben', lastName: 'Wikkerman' },
  ],
  'MO8-Blauw': [
    { role: 'Coach', firstName: 'Madeleine', lastName: 'van Hasselt' },
    { role: 'Manager', firstName: 'Caroline', lastName: 'Ebels' },
  ],
  'MO8-Geel': [
    { role: 'Coach', firstName: 'Jeroen', lastName: 'Edens' },
    { role: 'Manager', firstName: 'Yana', lastName: 'van den Bor' },
  ],
  'MO8-Rood': [
    { role: 'Coach', firstName: 'Wim', lastName: 'Gille' },
    { role: 'Manager', firstName: 'Haiko', lastName: 'Brinkers' },
  ],
  'MO8-Wit': [
    { role: 'Coach', firstName: 'Joëlle', lastName: 'Rijkse' },
  ],
  'MO9-Blauw': [
    { role: 'Manager', firstName: 'Juliette', lastName: 'Velthuysen' },
    { role: 'Coach', firstName: 'Juliette', lastName: 'Velthuysen' },
    { role: 'Coach', firstName: 'Marloes', lastName: 'Foudraine' },
  ],
  'MO9-Geel': [
    { role: 'Coach', firstName: 'Maarten', lastName: 'Postma' },
    { role: 'Manager', firstName: 'Maartje', lastName: 'Verspoor' },
    { role: 'Trainer', firstName: 'Michiel', lastName: 'Berenschot' },
  ],
  'MO9-Oranje': [
    { role: 'Coach', firstName: 'Michiel', lastName: 'Huisman' },
    { role: 'Manager', firstName: 'Jort', lastName: 'Bangma' },
    { role: 'Trainer', firstName: 'Nienke', lastName: 'van Haare heijmeijer' },
  ],
  'MO9-Wit': [
    { role: 'Coach', firstName: 'Tom', lastName: 'Houwen' },
    { role: 'Coach', firstName: 'Stefan', lastName: 'Quak' },
  ],
  'MO10-Blauw': [
    { role: 'Manager', firstName: 'Sylvia', lastName: 'van Beukering' },
    { role: 'Coach', firstName: 'Chris', lastName: 'Coepijn' },
    { role: 'Coach', firstName: 'Frank', lastName: 'Prinsen' },
    { role: 'Trainer', firstName: 'Maartje', lastName: 'Lak- Korsten' },
    { role: 'Trainer', firstName: 'Saar', lastName: 'Stam' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
    { role: 'Trainer', firstName: 'Christiaan', lastName: 'Visser' },
  ],
  'MO11-Blauw': [
    { role: 'Manager', firstName: 'Stefanie', lastName: 'Eerhardt' },
    { role: 'Coach', firstName: 'Marije', lastName: 'Wanders' },
    { role: 'Trainer', firstName: 'Bernard', lastName: 'Geersing' },
    { role: 'Trainer', firstName: 'Saar', lastName: 'Stam' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pepijn', lastName: 'van de Weijer' },
  ],
  'MO11-Wit': [
    { role: 'Trainer', firstName: 'Wesley', lastName: 'Niels' },
    { role: 'Coach', firstName: 'Wesley', lastName: 'Niels' },
    { role: 'Coach', firstName: 'Emile', lastName: 'Bosman' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
  'MO12-1': [
    { role: 'Manager', firstName: 'Marloes', lastName: 'Foudraine' },
    { role: 'Coach', firstName: 'Lotte', lastName: 'Bloemendal' },
    { role: 'Coach', firstName: 'Rogier', lastName: 'van der Maat' },
    { role: 'Coach', firstName: 'Dominique', lastName: 'Vosmaer' },
    { role: 'Trainer', firstName: 'Saar', lastName: 'Stam' },
  ],
  'MO12-2': [
    { role: 'Coach', firstName: 'Tjeerd', lastName: 'van Lotringen' },
    { role: 'Manager', firstName: 'Loes', lastName: 'Bruning- van der Burgt' },
    { role: 'Coach', firstName: 'Thijs', lastName: 'Jansen' },
    { role: 'Coach', firstName: 'Joost', lastName: 'De Weerdt' },
    { role: 'Trainer', firstName: 'Saar', lastName: 'Stam' },
  ],
  'MO14-1': [
    { role: 'Trainer', firstName: 'Hidde', lastName: 'Eikelboom' },
    { role: 'Coach', firstName: 'Hidde', lastName: 'Eikelboom' },
    { role: 'Trainer', firstName: 'Michiel', lastName: 'Verbeek' },
    { role: 'Manager', firstName: 'Michiel', lastName: 'Verbeek' },
    { role: 'Trainer', firstName: 'Nienke', lastName: 'van Haare heijmeijer' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
  'MO14-2': [
    { role: 'Coach', firstName: 'Bas', lastName: 'Aalbersberg' },
    { role: 'Manager', firstName: 'Catherine', lastName: 'Dijkstra' },
    { role: 'Trainer', firstName: 'Carole', lastName: 'Scholvinck' },
    { role: 'Trainer', firstName: 'Saar', lastName: 'Stam' },
  ],
  'MO18-1': [
    { role: 'Coach', firstName: 'Wilko', lastName: 'van Os' },
    { role: 'Coach', firstName: 'Herman', lastName: 'Stam' },
    { role: 'Manager', firstName: 'Bas', lastName: 'Aalbersberg' },
    { role: 'Coach', firstName: 'Till', lastName: 'Jansen' },
    { role: 'Trainer', firstName: 'Gijs', lastName: 'Bots' },
  ],
  'JO7-Blauw': [
    { role: 'Coach', firstName: 'Hugo', lastName: 'le Conge kleyn' },
  ],
  'JO9-Blauw': [
    { role: 'Coach', firstName: 'Benno', lastName: 'Naaijkens' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
  'JO9-Wit': [
    { role: 'Coach', firstName: 'Nick', lastName: 'Botter' },
    { role: 'Manager', firstName: 'Anne fleur', lastName: 'Jansen' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
  'JO10-Blauw': [
    { role: 'Coach', firstName: 'Leon', lastName: 'Hofman' },
    { role: 'Manager', firstName: 'Marjolein', lastName: 'de Jong' },
    { role: 'Trainer', firstName: 'Nienke', lastName: 'van Haare heijmeijer' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
  'JO11-Blauw': [
    { role: 'Coach', firstName: 'Ralph', lastName: 'van Oss' },
    { role: 'Manager', firstName: 'Job', lastName: 'Wagenmans' },
    { role: 'Trainer', firstName: 'Maarten', lastName: 'Bautz' },
    { role: 'Trainer', firstName: 'Gijs', lastName: 'Bots' },
    { role: 'Trainer', firstName: 'Nienke', lastName: 'van Haare heijmeijer' },
    { role: 'Trainer', firstName: 'Dolph', lastName: 'Thieme' },
    { role: 'Trainer', firstName: 'Pelle', lastName: 'Vis' },
  ],
}
