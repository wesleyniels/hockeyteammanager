import { useState, useEffect, useCallback, useRef } from 'react'
import { upload as uploadToBlob } from '@vercel/blob/client'

// ── Types ───────────────────────────────────────────────────────────────────

type AgeGroup = 'U7' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12' | 'U14' | 'U16' | 'U18' | 'Senioren'
type View = 'home' | 'setup' | 'game' | 'history' | 'profile' | 'messages' | 'matchDetail' | 'team' | 'playerProfile' | 'staffProfile'

interface Player {
  id: string
  name: string
  number?: number
  // A private Blob URL (proxied through mediaSrc()), sourced from the
  // team_players DB row — see fetchTeamRoster(). Not persisted directly;
  // re-resolved whenever a team is (re)loaded.
  photoUrl?: string
}

interface PositionSlot {
  posId: string
  label: string
  playerId: string | null
  x: number
  y: number
}

interface BenchEntry {
  playerId: string
  sinceGameSec: number
}

interface SubRecord {
  gameTimeSec: number
  playerInId: string
  playerOutId: string
  posLabel: string
}

interface OppMarker {
  id: string
  x: number
  y: number
}

interface Goal {
  id: string
  playerId: string
  // Match-clock time the goal was recorded at. Optional because it was only
  // ever added once the Timeline tab needed a time to sort by — matches
  // saved before that show up without one (see MatchTimeline).
  gameTimeSec?: number
}

interface Card {
  id: string
  playerId: string
  color: 'green' | 'yellow' | 'red'
  // See Goal.gameTimeSec.
  gameTimeSec?: number
}

interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  name: string
}

interface TacticsMarker {
  id: string
  x: number
  y: number
  playerId: string
}

interface TacticsArrow {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface TacticsBoard {
  id: string
  name: string
  markers: TacticsMarker[]
  arrows: TacticsArrow[]
  // True = "Strafcorner" layout: only half the pitch (one goal + D), zoomed
  // in for sketching penalty-corner routines. Undefined/false = full pitch.
  corner?: boolean
}

interface SavedGame {
  id: string
  date: string
  club: string
  team: string
  ageGroup: AgeGroup
  opponent: string
  homeAway: 'Thuis' | 'Uit'
  squad: Player[]
  slots: PositionSlot[]
  subs: SubRecord[]
  oppMarkers: OppMarker[]
  goals: Goal[]
  cards: Card[]
  tacticsBoards: TacticsBoard[]
  playedSeconds: Record<string, number>
  media: MediaItem[]
  notes: string
  result: string
  scoreOwn: number
  scoreOpp: number
  finalTime: number
  // Which period the match clock is in, and the `finalTime`/`gameSec` value
  // it was at when that period began — together these let the header clock
  // count down the time left in the *current* period instead of counting up
  // the whole match, without touching `gameSec` itself (still a plain
  // cumulative elapsed-seconds counter, since bench timers, sub timestamps
  // and per-player played time all depend on it staying that way). Optional
  // because older saved games predate this field; missing means "match
  // hasn't been advanced past period 1 yet".
  currentPeriod?: number
  periodStartSec?: number
  // Populated by the API from games/game_shares — absent on a game that
  // hasn't been saved/fetched yet. Missing means "treat as fully owned",
  // which is correct for anything created locally before its first save.
  ownerId?: string
  permission?: 'owner' | 'edit' | 'view'
}

interface GameParams {
  club: string
  team: string
  ageGroup: AgeGroup
  opponent: string
  homeAway: 'Thuis' | 'Uit'
  squad: Player[]
  date?: string
}

// ── KNHB Clubs ───────────────────────────────────────────────────────────────
// Full official club list from knhb.nl/club-finder (354 clubs), alphabetical.

const KNHB_CLUBS = [
  "'t Spandersbosch", "A.M.H.C. F.I.T.", "A.M.H.C. Rood-Wit", "AH & BC",
  "AHC IJburg", "AHC Noorderlicht", "Alblasserwaardse Hockeyclub Souburgh", "Alkmaarsche M.H.C.",
  "Almeerse HC", "AMHC Westerpark", "Amsterdam Dynamics", "Antwerpse Wheelblazers (BE)",
  "Apeldoornsche (M.H.C.)", "Arnhemsche H.C.", "Arnhemse Antilope Vereniging", "Arnhemse Mixed Hockey Club Upward",
  "B.H.V. Push", "B.N.M.H.C. Zwart-Wit", "Baarnse Mixed Hockey Vereniging", "Berkel en Rodenrijs",
  "Berkel-Enschot", "BH&BC Breda", "BHC Overbos", "Bredius Rollers",
  "Buitenhout MHC", "C.M.H.C. CIVICUM", "Charlotte-Oort Hockey Team (CHT)", "CMHC",
  "Craeyenhout", "D.H.C. Hudito", "DDHC", "de Graspiepers",
  "De Keistadrollers", "De Kieviten", "De Meeuwen", "De Peperbus",
  "De Pont", "DHC Drienerlo", "DHV", "DMHC Shinty",
  "Doetinchemse Hockey Club", "Doing", "Don Quishoot", "Doornse Hockey Club",
  "Dopie", "Dordrechtse Mixed Hockey Club", "Dorsteti", "DSHC",
  "DVS", "E-team Emmen", "Eemsmond", "Eendracht Maakt Macht 2021",
  "EHV Enschede", "Enschedese hockeyclub Prinses Wilhelmina", "Flevoland Dronten (M.H.C.)", "G.C.H.C.",
  "G.H.C. RAPID", "GHBS", "Gidos Wheels on Fire (BE)", "Gilze Rijen (H.C.)",
  "GMHC Goes", "Gooische Hockey Club", "GoorseMHC", "Goudse MHC",
  "GP Bulls", "Groninger Studenten Hockey Club 'Forward'", "GZG Hardenberg", "H.C. Bedum",
  "H.C. Derby", "H.C. Eemvallei", "H.C. Haarlem", "H.C. HISALIS",
  "H.C. Winsum", "H.V. de Terriërs", "H.V. HOCKEER", "H.V.A.",
  "Haag 88", "Haagsche Countryclub Groen-Geel", "Haagsche Delftsche Mixed", "Harlinger Mixed Hockey Club",
  "Hattemse M.H.C.", "HC Alphen", "HC Ares", "HC Athena",
  "HC Baarle Nassau", "HC Bloemendaal", "HC Boekel", "HC Capelle",
  "HC Cranendonck", "HC De Hoeksche Waard", "HC Delfshaven", "HC Delta Venlo",
  "HC Den Haag", "HC Diemen", "HC Eelde", "HC Eersel",
  "HC Eindhoven", "HC Etten-Leur", "HC Feijenoord", "HC Geldermalsen",
  "HC Gemert", "HC Gorssel/Epse", "HC Grave", "HC Helmond",
  "HC Horst", "HC IJsseloever", "HC Kampen", "HC Kromme Rijn",
  "HC Leerdam", "HC Martinus", "HC Mierlo", "HC Mill",
  "HC Mistral", "HC Nieuwkoop", "HC Nova", "HC Nuth",
  "HC Oirschot", "HC Oranje Rood", "HC Pijnacker", "HC Polaris",
  "HC Rijnvliet", "HC Scherpenzeel", "HC Schiedam", "HC Scoop",
  "HC Spaarndam", "HC Spire", "HC Tilburg", "HC Voorne",
  "HC Waalwijk", "HC Waddinxveen", "HC Walcheren", "HC Ypenburg",
  "HC Zwolle", "HCAS", "HCC Catwyck", "HCGO",
  "HCHN", "HCM Arnhem", "HCOB - Hockeyclub Overbetuwe", "HCOIJ",
  "HCQZ", "HCRB", "HCSO", "HDS",
  "HGC", "HHC Haackey", "HHC Quick Stick", "HIC",
  "HMHC", "HMHC Saxenburg", "HOB Bakel", "Hockey Club Druten",
  "Hockey Club Houten", "Hockey Club Naarden", "Hockey Club Nuenen", "Hockey Club Rotterdam",
  "Hockey Club Twente", "Hockey Club Uden", "Hockey Club Wateringse Veld", "Hockey Club Zeewolde",
  "Hockey Geldrop", "Hockey Heeze", "Hockey Phoenix Belgie", "Hockey Vereniging Abcoude",
  "Hockey Vereniging Mijdrecht", "Hockey Vereniging Zevenaar", "Hockeyclub 's-Hertogenbosch", "Hockeyclub Amersfoort",
  "Hockeyclub AMVJ", "Hockeyclub Barendrecht", "Hockeyclub Berlicum", "Hockeyclub De Haaskamp",
  "Hockeyclub De Hondsrug", "Hockeyclub Dokkum", "Hockeyclub Emmen", "Hockeyclub Groningen",
  "Hockeyclub Hilvarenbeek", "Hockeyclub Holten Rijssen", "Hockeyclub Liempde", "Hockeyclub Losser",
  "Hockeyclub Montfoort", "Hockeyclub Peel & Maas", "Hockeyclub Prinsenbeek", "Hockeyclub Ridderkerk",
  "Hockeyclub Schouwen Duiveland", "Hockeyclub UNO", "Hockeyclub VVV", "Hockeyclub Zevenbergen",
  "Hockeyvereniging H.O.D.", "Hoogeveen", "HSC Hermes", "HTCSON Hockey",
  "Huizer HC", "HV Bleiswijk", "HV Meerssen", "HV Myra",
  "HV Spijkenisse", "HV Victoria", "HV Weert", "HV Westland",
  "JHC-Stix", "K.H.C. Strawberries", "Kampong Wheelys", "Kennemer Keien",
  "Klein Zwitserland, H.C.", "L.S.C. ALECTO", "Larensche Mixed Hockey Club", "Leidsche en Oegstgeester Hockeyclub (LOHC)",
  "Leidse Hockey Club Roomburg", "Lochemse Hockey Club", "Loenense MHC", "M.H.C. Barneveld",
  "M.H.C. Boxmeer", "M.H.C. Dash", "M.H.C. Deurne", "M.H.C. Goirle",
  "M.H.C. Hoevelaken", "M.H.C. Krimpen", "M.H.C. LELYSTAD", "M.H.C. M.E.P. (Mea Est Pila)",
  "M.H.C. Oosterbeek", "M.H.C. Oudenbosch", "M.H.C. Purmerend", "M.H.C. Venray",
  "M.H.C. Weesp", "Maastrichtse Hockey Club MHC", "MADESE H.C.", "Maestrichtse Studenten Hockey Club",
  "Meppeler HV", "MH&LC Tempo", "MHC Alliance", "MHC Almelo",
  "MHC Amstelveen", "MHC Bemmel 800", "MHC Bennebroek", "MHC Best",
  "MHC Bommelerwaard", "MHC Castricum", "MHC Coevorden", "MHC Dalfsen",
  "MHC Daring-Veendam", "MHC de Dommel", "MHC de Kikkers", "MHC De Mezen",
  "MHC De Reigers", "MHC De Warande", "MHC DES", "MHC Dieren",
  "MHC EDE", "MHC Epe", "MHC Fletiomare", "MHC Forescate",
  "MHC Heerhugowaard", "MHC HOCO", "MHC Lemmer", "MHC Leusden",
  "MHC Liberty", "MHC Maarn", "MHC Muiderberg", "MHC Nunspeet",
  "MHC Olympia", "MHC Rapide", "MHC Roden", "MHC Soest",
  "MHC Steenwijk", "MHC Udenhout", "MHC Uitgeest", "MHC Vianen",
  "MHC Voorhout", "MHC Westerkwartier", "MHC Wijchen", "MHC Woerden",
  "MHCBeuningen", "MHCD", "MHCHBS", "MHCN",
  "MHCT", "MHCZutphen", "MHV Evergreen", "MHV Forcial",
  "MHV Maarssen", "Mixed Hockey Club Heesch", "Mixed Hockey Club Leeuwarden", "Mixed Hockey Club Ommen",
  "mixed hockeyclub HDL", "Mixed Hockeyclub Zoetermeer", "MMHC Voordaan", "N.S.H.C. Apeliotes",
  "Never Less", "NHC De IJssel", "Nijkerk (H.C.)", "NMHC Nijmegen",
  "Noordwijkse (H.C)", "O.H.C. Bully", "OMHC", "Only Friends",
  "Oss (M.H.C.)", "Pinoké", "R.G.H.C. Tempo '34", "R.H.C. Concordia",
  "R.H.V. Leonidas", "R.K.H.V. Union", "Rapid Rollers", "Rijswijksche Hockey Club",
  "Ring Pass Delft", "RMHC de Pelikaan", "Rosmalen", "S.M.H.C. Magnus",
  "SC Muiden", "Schaerweijde", "Schoonhovense MHC", "Scoop Delft",
  "SG Beverland", "SHOT", "Sint Oedenrode", "Sjinborn",
  "SMHC De Hopbel", "SMHC Salland", "Sneeker Mixed Hockey Club", "Stichtsche Cricket & Hockey Club",
  "Stick Flyers", "SV Kampong Hockey", "SV Phoenix", "SVG De Tubanten",
  "THC Hurley", "THCC De Kromhouters", "The Black Scorpions", "Thor",
  "Tukkers United", "U.H.C.QUI VIVE", "U.S.H.C.", "V.M.H.& C.C. M.O.P.",
  "V.M.H.C. Basko", "V.M.H.C. CARTOUCHE", "V.M.H.C. Geel-Zwart", "VIOS '82",
  "VMHC", "VMHC Pollux", "VMHC Spitsbergen", "Voorster Hockeyclub Twello",
  "W.M.H.C. Avanti", "Waterlandse Hockey Club", "Were Di Tilburg", "Westerduiven",
  "WFHC Hoorn", "Wheel Warriors", "Winschoten", "WMHC",
  "Xenios", "Z.H.C. de Kraaien", "Zandvoortsche H.C.", "Zundertse Hockeyclub",
  "Zwaluwen Utrecht", "Zwollywood Sticks",
]

// Seeded fixture data (team-fixtures.ts) sometimes names an opponent by the
// short/colloquial name coaches actually use rather than KNHB's formal one —
// resolved here so ClubLogo can still find the right crest either way.
const CLUB_NAME_ALIASES: Record<string, string> = {
  'Hilversum': 'HMHC',
  'Amsterdam': 'AH & BC',
  'Hurley': 'THC Hurley',
  'Soest': 'MHC Soest',
  'SCHC': 'Stichtsche Cricket & Hockey Club',
}

// A game's `opponent` field is a free-text "club + team" string (e.g.
// "Gooische Hockey Club MO8-Lila") — there's no separate opponent-club field
// to look a logo up by. This recovers the club name by finding the longest
// KNHB_CLUBS entry the string starts with, so ClubLogo can still resolve it.
function matchKnhbClub(s: string): string {
  for (const [alias, official] of Object.entries(CLUB_NAME_ALIASES)) {
    if (s === alias || s.startsWith(alias + ' ')) { s = official + s.slice(alias.length); break }
  }
  let best = ''
  for (const c of KNHB_CLUBS) {
    if ((s === c || s.startsWith(c + ' ')) && c.length > best.length) best = c
  }
  return best || s
}

// ── Age group config ─────────────────────────────────────────────────────────

// `periods` x `periodSec` is each age group's official KNHB match format —
// drives the countdown clock in GameView (see `remainingInPeriod`). U9/U10
// (2 helften) and U11 through Senioren (4 kwarten, 17:30 each) are per KNHB's
// published competition formats; U7/U8's funkey/dual-field format isn't
// centrally fixed by the KNHB (districts and clubs set their own timing), so
// 2x15 min here is a reasonable placeholder — adjust if SC Muiden's actual
// district uses something else.
const AGE_CONFIG: Record<AgeGroup, { total: number; field: number; label: string; dual?: boolean; periods: number; periodSec: number }> = {
  U7:      { total: 6,  field: 6,  label: 'U7 — 3 tegen 3 (KNHB O7), 2 velden', dual: true, periods: 2, periodSec: 15 * 60 },
  U8:      { total: 6,  field: 6,  label: 'U8 — 3 tegen 3 (KNHB O8), 2 velden', dual: true, periods: 2, periodSec: 15 * 60 },
  U9:      { total: 6,  field: 5,  label: 'U9 — 6 spelers (5 veld + 1 keeper, KNHB O9 6-tegen-6)', periods: 2, periodSec: 25 * 60 },
  U10:     { total: 8,  field: 7,  label: 'U10 — 8 spelers (7 veld + 1 keeper, KNHB O10 8-tegen-8, half veld)', periods: 2, periodSec: 30 * 60 },
  U11:     { total: 9,  field: 8,  label: 'U11 — 9 spelers (8 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
  U12:     { total: 11, field: 10, label: 'U12 — 11 spelers (10 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
  U14:     { total: 11, field: 10, label: 'U14 — 11 spelers (10 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
  U16:     { total: 11, field: 10, label: 'U16 — 11 spelers (10 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
  U18:     { total: 11, field: 10, label: 'U18 — 11 spelers (10 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
  Senioren:{ total: 11, field: 10, label: 'Sr. — 11 spelers (10 veld + 1 keeper)', periods: 4, periodSec: 17.5 * 60 },
}

// ── SC Muiden Teams ───────────────────────────────────────────────────────────
// Team name encodes gender (M/J = Meisjes/Jongens) and KNHB age category
// (O<n> = Onder <n>), e.g. MO11-Wit = Meisjes Onder 11, team "Wit". Team and
// roster data used to be a client-bundled constant here — visible in the JS
// bundle to anyone, logged in or not. It now lives in the database
// (api/teams/[action].ts) and is fetched per logged-in session instead; see
// fetchTeamNames()/fetchTeamRoster() below.

function ageGroupFromTeamName(team: string): AgeGroup {
  if (team === 'Senioren') return 'Senioren'
  const m = team.match(/^[MJ]O(\d+)/i)
  const candidate = m ? (`U${m[1]}` as AgeGroup) : null
  return candidate && candidate in AGE_CONFIG ? candidate : 'U7'
}

// Generic age/gender categories (no specific team, no real roster) shown to
// logged-out visitors instead of the official team list — lets them start a
// match and get the right player-count target without exposing any team or
// player data, which now requires a login to fetch at all.
const GENERIC_AGE_NUMBERS = [7, 8, 9, 10, 11, 12, 14, 16, 18]
const GENERIC_TEAM_CATEGORIES = [
  ...GENERIC_AGE_NUMBERS.map(n => `MO${n}`),
  ...GENERIC_AGE_NUMBERS.map(n => `JO${n}`),
  'Senioren',
]

// 'Manager' sits between the coaching roles and Speler/Supporter: it's
// eligible for nothing ELIGIBLE_ROLES/canReset gate (messaging, match
// squads, resetting a match), but — like Coach/Trainer/Trainer & Coach —
// can add a player to their own team and edit their photo. Renaming or
// removing a player entirely is beheerder-only for every non-admin role;
// see TeamPlayerPhotos' canEditPhotos/canAddPlayer vs canManageRoster split.
const ROLE_OPTIONS = ['Trainer', 'Coach', 'Trainer & Coach', 'Manager', 'Speler', 'Supporter'] as const

// Mirrors ELEVATED_ROLES in api/_lib/team-staff.ts — self-selecting any of
// these requires a name match in team_staff (see fetchStaffEligibility),
// enforced server-side in PUT /api/auth/me. Kept as a plain array here
// (not shared with the API) since frontend and backend code aren't part of
// the same bundle.
const ELEVATED_ROLES: string[] = ['Trainer', 'Coach', 'Trainer & Coach', 'Manager']

// ── Field positions ──────────────────────────────────────────────────────────
// x/y are % of the SVG container (0–100)
// Standard field SVG viewBox="0 0 62 97", dual viewBox="0 0 140 97"

interface PosDef {
  id: string
  label: string
  x: number
  y: number
}

interface FormationVariant {
  id: string
  name: string
  positions: PosDef[]
}

// U7/U8 dual field — left field center x≈22.5%, right≈77.5%
const POS_DUAL: PosDef[] = [
  { id: 'a_b', label: 'VD', x: 22.5, y: 82 },
  { id: 'a_m', label: 'MV', x: 22.5, y: 50 },
  { id: 'a_f', label: 'ST', x: 22.5, y: 18 },
  { id: 'b_b', label: 'VD', x: 77.5, y: 82 },
  { id: 'b_m', label: 'MV', x: 77.5, y: 50 },
  { id: 'b_f', label: 'ST', x: 77.5, y: 18 },
]

// U9 (KNHB O9, 6-tegen-6) — GK + 5 outfield, in three common shapes
const POS_U9_2_2_1: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 72, y: 66 }, { id: 'd2', label: 'LB', x: 28, y: 66 },
  { id: 'm1', label: 'RM', x: 72, y: 40 }, { id: 'm2', label: 'LM', x: 28, y: 40 },
  { id: 'f1', label: 'ST', x: 50, y: 20 },
]
const POS_U9_1_3_1: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'CB', x: 50, y: 68 },
  { id: 'm1', label: 'RM', x: 80, y: 45 }, { id: 'm2', label: 'CM', x: 50, y: 45 }, { id: 'm3', label: 'LM', x: 20, y: 45 },
  { id: 'f1', label: 'ST', x: 50, y: 20 },
]
const POS_U9_2_1_2: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 72, y: 68 }, { id: 'd2', label: 'LB', x: 28, y: 68 },
  { id: 'm1', label: 'CM', x: 50, y: 45 },
  { id: 'f1', label: 'RS', x: 70, y: 20 }, { id: 'f2', label: 'LS', x: 30, y: 20 },
]

// U10 — GK + 7 outfield
const POS_U10_2_3_2: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 72, y: 70 }, { id: 'd2', label: 'LB', x: 28, y: 70 },
  { id: 'm1', label: 'RH', x: 84, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 16, y: 50 },
  { id: 'f1', label: 'RS', x: 70, y: 26 }, { id: 'f2', label: 'LS', x: 30, y: 26 },
]
const POS_U10_3_2_2: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 82, y: 70 }, { id: 'd2', label: 'CB', x: 50, y: 72 }, { id: 'd3', label: 'LB', x: 18, y: 70 },
  { id: 'm1', label: 'RH', x: 72, y: 48 }, { id: 'm2', label: 'LH', x: 28, y: 48 },
  { id: 'f1', label: 'RS', x: 70, y: 24 }, { id: 'f2', label: 'LS', x: 30, y: 24 },
]
const POS_U10_2_2_3: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 72, y: 68 }, { id: 'd2', label: 'LB', x: 28, y: 68 },
  { id: 'm1', label: 'RH', x: 72, y: 46 }, { id: 'm2', label: 'LH', x: 28, y: 46 },
  { id: 'f1', label: 'RW', x: 80, y: 24 }, { id: 'f2', label: 'ST', x: 50, y: 18 }, { id: 'f3', label: 'LW', x: 20, y: 24 },
]

// U11 — GK + 8 outfield
const POS_U11_2_3_3: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 72, y: 70 }, { id: 'd2', label: 'LB', x: 28, y: 70 },
  { id: 'm1', label: 'RH', x: 84, y: 50 }, { id: 'm2', label: 'MH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 16, y: 50 },
  { id: 'f1', label: 'RW', x: 78, y: 28 }, { id: 'f2', label: 'ST', x: 50, y: 21 }, { id: 'f3', label: 'LW', x: 22, y: 28 },
]
const POS_U11_3_3_2: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 82, y: 70 }, { id: 'd2', label: 'CB', x: 50, y: 72 }, { id: 'd3', label: 'LB', x: 18, y: 70 },
  { id: 'm1', label: 'RH', x: 78, y: 48 }, { id: 'm2', label: 'MH', x: 50, y: 48 }, { id: 'm3', label: 'LH', x: 22, y: 48 },
  { id: 'f1', label: 'RS', x: 68, y: 22 }, { id: 'f2', label: 'LS', x: 32, y: 22 },
]
const POS_U11_3_2_3: PosDef[] = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 82, y: 70 }, { id: 'd2', label: 'CB', x: 50, y: 72 }, { id: 'd3', label: 'LB', x: 18, y: 70 },
  { id: 'm1', label: 'RH', x: 70, y: 48 }, { id: 'm2', label: 'LH', x: 30, y: 48 },
  { id: 'f1', label: 'RW', x: 78, y: 22 }, { id: 'f2', label: 'ST', x: 50, y: 18 }, { id: 'f3', label: 'LW', x: 22, y: 22 },
]

// U12+ (11-a-side) — GK + 10 outfield, shared by U12/U14/U16/U18/Senioren
const POS_11_4_3_3: PosDef[] = [
  { id: 'gk', label: 'K',   x: 50, y: 86 },
  { id: 'd1', label: 'RB',  x: 85, y: 70 }, { id: 'd2', label: 'CB', x: 38, y: 70 }, { id: 'd3', label: 'CB', x: 62, y: 70 }, { id: 'd4', label: 'LB', x: 15, y: 70 },
  { id: 'm1', label: 'RH',  x: 78, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 22, y: 50 },
  { id: 'f1', label: 'RW',  x: 78, y: 27 }, { id: 'f2', label: 'ST', x: 50, y: 20 }, { id: 'f3', label: 'LW', x: 22, y: 27 },
]
const POS_11_4_4_2: PosDef[] = [
  { id: 'gk', label: 'K',   x: 50, y: 86 },
  { id: 'd1', label: 'RB',  x: 85, y: 70 }, { id: 'd2', label: 'CB', x: 38, y: 70 }, { id: 'd3', label: 'CB', x: 62, y: 70 }, { id: 'd4', label: 'LB', x: 15, y: 70 },
  { id: 'm1', label: 'RM',  x: 85, y: 48 }, { id: 'm2', label: 'CM', x: 38, y: 48 }, { id: 'm3', label: 'CM', x: 62, y: 48 }, { id: 'm4', label: 'LM', x: 15, y: 48 },
  { id: 'f1', label: 'ST',  x: 35, y: 22 }, { id: 'f2', label: 'ST', x: 65, y: 22 },
]
const POS_11_3_4_3: PosDef[] = [
  { id: 'gk', label: 'K',   x: 50, y: 86 },
  { id: 'd1', label: 'CB',  x: 25, y: 70 }, { id: 'd2', label: 'CB', x: 50, y: 72 }, { id: 'd3', label: 'CB', x: 75, y: 70 },
  { id: 'm1', label: 'RM',  x: 85, y: 48 }, { id: 'm2', label: 'CM', x: 38, y: 48 }, { id: 'm3', label: 'CM', x: 62, y: 48 }, { id: 'm4', label: 'LM', x: 15, y: 48 },
  { id: 'f1', label: 'RW',  x: 78, y: 22 }, { id: 'f2', label: 'ST', x: 50, y: 18 }, { id: 'f3', label: 'LW', x: 22, y: 22 },
]

const FORMATIONS_11: FormationVariant[] = [
  { id: '1-4-3-3', name: '1-4-3-3 (standaard)', positions: POS_11_4_3_3 },
  { id: '1-4-4-2', name: '1-4-4-2', positions: POS_11_4_4_2 },
  { id: '1-3-4-3', name: '1-3-4-3', positions: POS_11_3_4_3 },
]

// Every age group's available formation variants — the first is the default.
// Ids only need to be unique within an age group's own list.
const FORMATIONS: Record<AgeGroup, FormationVariant[]> = {
  U7:  [{ id: 'standaard', name: 'Standaard', positions: POS_DUAL }],
  U8:  [{ id: 'standaard', name: 'Standaard', positions: POS_DUAL }],
  U9:  [
    { id: '1-2-2-1', name: '1-2-2-1 (standaard)', positions: POS_U9_2_2_1 },
    { id: '1-1-3-1', name: '1-1-3-1', positions: POS_U9_1_3_1 },
    { id: '1-2-1-2', name: '1-2-1-2', positions: POS_U9_2_1_2 },
  ],
  U10: [
    { id: '1-2-3-2', name: '1-2-3-2 (standaard)', positions: POS_U10_2_3_2 },
    { id: '1-3-2-2', name: '1-3-2-2', positions: POS_U10_3_2_2 },
    { id: '1-2-2-3', name: '1-2-2-3', positions: POS_U10_2_2_3 },
  ],
  U11: [
    { id: '1-2-3-3', name: '1-2-3-3 (standaard)', positions: POS_U11_2_3_3 },
    { id: '1-3-3-2', name: '1-3-3-2', positions: POS_U11_3_3_2 },
    { id: '1-3-2-3', name: '1-3-2-3', positions: POS_U11_3_2_3 },
  ],
  U12: FORMATIONS_11,
  U14: FORMATIONS_11,
  U16: FORMATIONS_11,
  U18: FORMATIONS_11,
  Senioren: FORMATIONS_11,
}

function getFormationVariants(ag: AgeGroup): FormationVariant[] {
  return FORMATIONS[ag]
}

// Which variant a club currently plays, per age group.
const formationVariantKey = (ag: AgeGroup) => `fh_formation_variant_${ag}`

function getSelectedVariant(ag: AgeGroup): FormationVariant {
  const variants = getFormationVariants(ag)
  try {
    const saved = localStorage.getItem(formationVariantKey(ag))
    return variants.find(v => v.id === saved) ?? variants[0]
  } catch {
    return variants[0]
  }
}

// Custom (dragged) position layouts are saved per age group *and* variant —
// switching formation shouldn't clobber another variant's saved tweaks.
// "_v2" marks the coordinate fix that mirrored every L/R position (previously
// R was on-screen-left and L was on-screen-right) — bumping the key orphans
// any layout saved under the old, mirrored coordinates instead of re-applying
// them onto the now-correct labels.
const layoutKey = (ag: AgeGroup, variantId: string) => `fh_layout_v2_${ag}_${variantId}`

function getPositionsForVariant(ag: AgeGroup, variant: FormationVariant): PosDef[] {
  const base = variant.positions
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey(ag, variant.id)) ?? 'null') as PosDef[] | null
    if (saved && saved.length === base.length && saved.every(s => base.some(b => b.id === s.id))) {
      return base.map(b => {
        const override = saved.find(s => s.id === b.id)!
        return { ...b, x: override.x, y: override.y }
      })
    }
  } catch { /* fall through to base */ }
  return base
}

// Which formation variant a set of already-assigned slots was built from —
// matched by comparing posId sets, since that's the only thing tying a slot
// back to a specific variant's template. Falls back to this device's
// currently-selected variant when there's nothing to match (a brand-new
// match, or a variant that's since been removed from FORMATIONS).
function findVariantForSlots(ag: AgeGroup, slots: PositionSlot[] | undefined): FormationVariant {
  if (slots && slots.length > 0) {
    const slotIds = new Set(slots.map(s => s.posId))
    const match = getFormationVariants(ag).find(v => v.positions.length === slots.length && v.positions.every(p => slotIds.has(p.id)))
    if (match) return match
  }
  return getSelectedVariant(ag)
}

// ── Utils ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 11)
// The Blob store is private, so raw blob URLs 404 without auth — everything
// reads media through this proxy instead (see api/blob/[action].ts's 'view').
const mediaSrc = (url: string) => `/api/blob/view?url=${encodeURIComponent(url)}`

// Mirrors the Python slugify used when the club crests were uploaded to Blob
// storage (club-logos/{slug}.png) — NFKD-normalize, drop combining marks,
// lowercase, collapse non-alphanumeric runs to a single hyphen.
function slugifyClubName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Club logos are fetched from the live Blob store (api/blob/[action].ts's
// 'club-logos' listing) instead of a hardcoded per-environment URL map, so
// preview and production — genuinely separate stores — never drift out of
// sync. Memoized at module scope: every ClubLogo instance and the theme
// effect below share one fetch/one cache for the app's lifetime.
let clubLogosState: Record<string, string> | null = null
let clubLogosPromise: Promise<Record<string, string>> | null = null
function fetchClubLogos(): Promise<Record<string, string>> {
  clubLogosPromise ??= fetch('/api/blob/club-logos')
    .then(r => r.ok ? r.json() : { logos: {} })
    .then(data => (clubLogosState = data.logos ?? {}))
    .catch(() => (clubLogosState = {}))
  return clubLogosPromise
}
function useClubLogos(): Record<string, string> {
  const [state, setState] = useState(clubLogosState)
  useEffect(() => {
    if (clubLogosState) return
    let mounted = true
    fetchClubLogos().then(logos => { if (mounted) setState(logos) })
    return () => { mounted = false }
  }, [])
  return state ?? {}
}

// ── Club theme (derived from the selected club's logo) ──────────────────────
// The CSS variables below (defined in index.css, one per "brand blue" hex
// used across the app) default to the app's original palette. With no club
// selected, nothing overrides them. When one is, applyClubTheme re-derives
// every shade at the *same* saturation/lightness as its original color —
// only the hue shifts — so contrast and the light↔dark relationships between
// shades stay exactly as designed.
const BRAND_TOKENS: { name: string; s: number; l: number }[] = [
  { name: '--brand-0d2b7a', s: 0.8074, l: 0.2647 },
  { name: '--brand-1a2f6b', s: 0.6090, l: 0.2608 },
  { name: '--brand-1a3fab', s: 0.7360, l: 0.3863 },
  { name: '--brand-2563eb', s: 0.8319, l: 0.5333 },
  { name: '--brand-3b4f7a', s: 0.3481, l: 0.3549 },
  { name: '--brand-3b5299', s: 0.4434, l: 0.4157 },
  { name: '--brand-6b82b8', s: 0.3516, l: 0.5706 },
  { name: '--brand-7b90c8', s: 0.4118, l: 0.6333 },
  { name: '--brand-7b9de0', s: 0.6196, l: 0.6804 },
  { name: '--brand-a8bef0', s: 0.7059, l: 0.8000 },
  { name: '--brand-b8c8f0', s: 0.6512, l: 0.8314 },
  { name: '--brand-c8d5f5', s: 0.6923, l: 0.8725 },
  { name: '--brand-d0dcfa', s: 0.8077, l: 0.8980 },
  { name: '--brand-dbeafe', s: 0.9459, l: 0.9275 },
  { name: '--brand-e4ecfe', s: 0.9286, l: 0.9451 },
  { name: '--brand-e8effd', s: 0.8400, l: 0.9510 },
  { name: '--brand-eef3ff', s: 1.0000, l: 0.9667 },
  { name: '--brand-f0f5ff', s: 1.0000, l: 0.9706 },
  { name: '--brand-f8faff', s: 1.0000, l: 0.9863 },
]

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function applyClubTheme(hue: number) {
  for (const t of BRAND_TOKENS) document.documentElement.style.setProperty(t.name, hslToHex(hue, t.s, t.l))
}

function clearClubTheme() {
  for (const t of BRAND_TOKENS) document.documentElement.style.removeProperty(t.name)
}

// Samples the club's logo (already same-origin via mediaSrc, so the canvas
// isn't tainted) and returns its dominant hue, ignoring near-white/near-black/
// low-saturation pixels — a crest is mostly background/outline, and including
// those would just pull the average toward gray. Resolves null if the image
// fails to load or has no colorful pixels at all (e.g. a purely black/white
// crest), so the caller can fall back to the default theme.
function extractDominantHue(imgSrc: string): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let rSum = 0, gSum = 0, bSum = 0, weight = 0
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
          if (a < 128) continue
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const lightness = (max + min) / 2 / 255
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
          if (lightness > 0.92 || lightness < 0.08 || sat < 0.15) continue
          rSum += r * sat; gSum += g * sat; bSum += b * sat; weight += sat
        }
        if (weight < 1) { resolve(null); return }
        const r = rSum / weight / 255, g = gSum / weight / 255, b = bSum / weight / 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        if (d === 0) { resolve(null); return }
        let h: number
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break
          case g: h = (b - r) / d + 2; break
          default: h = (r - g) / d + 4
        }
        resolve(h * 60)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = imgSrc
  })
}

// Teams, rosters and photos all live in the database now (api/teams/[action].ts)
// rather than a client-bundled constant — a player's Blob photo lives at
// players/{playerId}/photo.jpg and its URL is stored on the team_players row,
// so a roster fetch returns everything needed in one call.
interface RosterPlayer { id: string; name: string; photoUrl: string | null; position: string | null }

async function fetchTeamNames(): Promise<string[]> {
  try {
    const res = await fetch('/api/teams/list')
    if (!res.ok) return []
    const { teams } = await res.json() as { teams: { id: string; name: string }[] }
    return teams.map(t => t.name)
  } catch {
    return []
  }
}

// Live preview of the same team_staff check PUT /api/auth/me enforces —
// lets Profile's Rol dropdown hide Trainer/Coach/Trainer & Coach/Manager
// before someone even tries to save, rather than only erroring afterward.
async function fetchStaffEligibility(team: string, firstName: string, lastName: string): Promise<boolean> {
  if (!team || !firstName.trim() || !lastName.trim()) return false
  try {
    const params = new URLSearchParams({ team, firstName, lastName })
    const res = await fetch(`/api/team-staff?${params}`)
    if (!res.ok) return false
    const { eligible } = await res.json() as { eligible: boolean }
    return eligible
  } catch {
    return false
  }
}

async function fetchTeamRoster(team: string): Promise<RosterPlayer[]> {
  try {
    const res = await fetch(`/api/teams/roster?team=${encodeURIComponent(team)}`)
    if (!res.ok) return []
    const { players } = await res.json() as { players: RosterPlayer[] }
    return players
  } catch {
    return []
  }
}

// Coaches/trainers/managers of a team — real accounts (users.role +
// users.default_team), not team_players rows. No email included; this is a
// broadly-viewable list, unlike the messaging contact picker.
interface TeamStaffMember { id: string; name: string | null; firstName: string | null; lastName: string | null; picture: string | null; role: string | null }

async function fetchTeamStaff(team: string): Promise<TeamStaffMember[]> {
  try {
    const res = await fetch(`/api/teams/staff?team=${encodeURIComponent(team)}`)
    if (!res.ok) return []
    const { staff } = await res.json() as { staff: TeamStaffMember[] }
    return staff
  } catch {
    return []
  }
}

// ── Messages & notifications ─────────────────────────────────────────────────
// Backed by api/messages/[action].ts and api/notifications.ts. Eligibility
// (who can message whom) is fully re-checked server-side on every send —
// the contacts list below is a UI convenience, never trusted as the actual
// authorization.

interface Contact { id: string; name: string; defaultClub: string | null; role: string | null; isHockeyOne: boolean }
interface Conversation {
  userId: string; name: string; isHockeyOne: boolean
  lastMessage: string; lastAt: string; mine: boolean; unreadCount: number
}
interface ChatMessage { id: string; senderId: string; body: string; createdAt: string; mine: boolean }
interface AppNotification { id: string; type: string; body: string; gameId: string | null; createdAt: string; read: boolean }

async function fetchContacts(): Promise<{ contacts: Contact[]; canSend: boolean }> {
  try {
    const res = await fetch('/api/messages/contacts')
    if (!res.ok) return { contacts: [], canSend: false }
    return await res.json()
  } catch {
    return { contacts: [], canSend: false }
  }
}

async function fetchConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch('/api/messages/conversations')
    if (!res.ok) return []
    const { conversations } = await res.json() as { conversations: Conversation[] }
    return conversations
  } catch {
    return []
  }
}

async function fetchThread(userId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`/api/messages/thread?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) return []
    const { messages } = await res.json() as { messages: ChatMessage[] }
    return messages
  } catch {
    return []
  }
}

async function sendMessage(recipientId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, body }),
    })
    if (!res.ok) { const data = await res.json().catch(() => ({})); return { ok: false, error: data.error ?? 'Verzenden mislukt' } }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Verzenden mislukt' }
  }
}

async function fetchUnreadMessageCount(): Promise<number> {
  try {
    const res = await fetch('/api/messages/unread-count')
    if (!res.ok) return 0
    const { count } = await res.json() as { count: number }
    return count
  } catch {
    return 0
  }
}

async function fetchNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  try {
    const res = await fetch('/api/notifications')
    if (!res.ok) return { notifications: [], unreadCount: 0 }
    return await res.json()
  } catch {
    return { notifications: [], unreadCount: 0 }
  }
}

async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  } catch { /* best-effort */ }
}

async function markAllNotificationsRead(): Promise<void> {
  try {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
  } catch { /* best-effort */ }
}

async function markNotificationUnread(id: string): Promise<void> {
  try {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read: false }) })
  } catch { /* best-effort */ }
}

async function deleteNotification(id: string): Promise<void> {
  try {
    await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch { /* best-effort */ }
}

async function publishAnnouncement(body: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error ?? 'Versturen mislukt' }
    return { ok: true, count: data.count ?? 0 }
  } catch {
    return { ok: false, error: 'Versturen mislukt' }
  }
}

const playerPhotoPathname = (playerId: string) => `players/${playerId}/photo.jpg`
const p2 = (n: number) => n.toString().padStart(2, '0')
const fmtSec = (s: number) => `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
const fmtHM = (s: number) => {
  const totalMin = Math.round(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}u ${m}m` : `${m}m`
}
const todayStr = () => new Date().toISOString().slice(0, 10)
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'nu'
  if (min < 60) return `${min}m geleden`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours}u geleden`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d geleden`
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}
// Renders the plain-text markers the admin announcement toolbar writes
// (**bold**, _italic_, "- " bullets) as real elements — built directly as
// React nodes rather than through dangerouslySetInnerHTML, so arbitrary
// admin-authored text can never be interpreted as HTML/script, only as
// this fixed, closed set of inline tokens.
function renderInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*.+?\*\*|_.+?_)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function renderFormattedText(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-4 space-y-0.5">
        {listItems.map((item, i) => <li key={i}>{renderInlineFormatting(item, `li-${blocks.length}-${i}`)}</li>)}
      </ul>
    )
    listItems = []
  }
  text.split('\n').forEach(line => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2))
      return
    }
    flushList()
    if (line.trim() === '') return
    blocks.push(<div key={`line-${blocks.length}`}>{renderInlineFormatting(line, `line-${blocks.length}`)}</div>)
  })
  flushList()
  return blocks
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const sortPlayers = <T extends { number?: number; name: string }>(list: T[]) =>
  [...list].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name))

// Downscales a picked photo to a small square JPEG before it's stored as
// base64 in Postgres — keeps profile photos to a few tens of KB instead of
// multi-MB camera originals.
function resizeImageToDataUrl(file: File, maxDim = 300, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Kon bestand niet lezen'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Kon afbeelding niet laden'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas wordt niet ondersteund')); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
const ageGroupLabel = (ag: AgeGroup) => ag === 'Senioren' ? 'Sr.' : ag

function useLS<T>(key: string, init: T) {
  const [v, sv] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? init } catch { return init }
  })
  const set = useCallback((u: T | ((p: T) => T)) => {
    sv(p => {
      const n = typeof u === 'function' ? (u as (x: T) => T)(p) : u
      localStorage.setItem(key, JSON.stringify(n))
      return n
    })
  }, [key])
  return [v, set] as const
}

function benchColor(sec: number) {
  if (sec < 300) return '#16A34A'
  if (sec < 600) return '#D97706'
  if (sec < 900) return '#EA580C'
  return '#DC2626'
}

function H1Logo({ height = 28 }: { height?: number }) {
  return <img src="/h1-logo.png" alt="Hockey One" style={{ height, width: 'auto' }} />
}

// Per-club crest, fetched dynamically from the Blob store's club-logos/
// prefix (see api/blob/[action].ts's 'club-logos' action) rather than a
// hardcoded per-environment URL map — keeps preview and production (genuinely
// separate stores) from drifting, and picks up newly-uploaded crests without
// a redeploy. A club with no matching slug in the store falls back to the
// generic H1 mark rather than showing a broken image.
function ClubLogo({ club, size = 46 }: { club: string; size?: number }) {
  const logos = useClubLogos()
  const src = logos[slugifyClubName(club)]
  if (!src) return <H1Logo height={size} />
  return <img src={mediaSrc(src)} alt={club} width={size} height={size} style={{ width: size, height: size, objectFit: 'contain' }} />
}

// A plain dimpled ball (no black pentagon patches like a football) so goal
// scorers read as field hockey, not soccer.
function HockeyBallIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: '-2px' }}>
      <circle cx="12" cy="12" r="10" fill="#F7F3E8" stroke="#B7AD8F" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.1" fill="#B7AD8F" />
      <circle cx="15.5" cy="10" r="1.1" fill="#B7AD8F" />
      <circle cx="10.5" cy="15.5" r="1.1" fill="#B7AD8F" />
    </svg>
  )
}

// ── Nav icons ────────────────────────────────────────────────────────────────
// A small hand-rolled set (same pattern as HockeyBallIcon above — plain inline
// SVG, no icon-library dependency) used only for navigation chrome (bottom
// bar, notification bell). Stroke-based on currentColor so active/inactive
// tinting is just a CSS color change, not a second asset per state.

function IconHome({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function IconCalendar({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  )
}

function IconMail({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  )
}

function IconUsers({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V20" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.8 13.6A4 4 0 0 1 20.5 17.4V19" />
    </svg>
  )
}

function IconClock({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

function IconChevronLeft({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

function IconMore({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

function IconUndo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h9a5 5 0 0 1 0 10h-3" />
      <path d="M8 6 4 10l4 4" />
    </svg>
  )
}

function IconPlay({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5v14l12-7z" />
    </svg>
  )
}

function IconPause({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function IconSkipBack({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="5" width="2.5" height="14" rx="1" />
      <path d="M19 5 8 12l11 7z" />
    </svg>
  )
}

function IconSkipForward({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="17.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M5 5l11 7-11 7z" />
    </svg>
  )
}

function IconPitch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M3.5 12h17" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function IconSwap({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </svg>
  )
}

function IconGoal({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v14M20 4v14M4 4h16" strokeWidth={2} />
      <path d="M4 9h16M4 14h16M9 4v14M15 4v14" opacity={0.55} />
    </svg>
  )
}

function IconTactics({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M9.5 10 14.5 14" strokeDasharray="1.8 1.8" />
      <circle cx="8.5" cy="9" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconCamera({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

function IconBell({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10a6 6 0 0 1 12 0c0 3.2 1 4.8 1.6 5.6a.8.8 0 0 1-.6 1.4H5a.8.8 0 0 1-.6-1.4C5 14.8 6 13.2 6 10Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

// Avatar shown for the signed-in user (photo, or initials-on-brand-blue
// fallback) — the same markup used to be duplicated across every header;
// factored out here since it's now also used in BottomBar's Profiel tab.
function ProfileAvatar({ user, size = 32 }: { user: AuthUser; size?: number }) {
  return user.picture ? (
    <img src={user.picture} alt="Profiel" width={size} height={size} className="rounded-full" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35, background: 'var(--brand-1a3fab)' }}>
      {initials(user.name ?? user.email)}
    </span>
  )
}

// ── Field Hockey Field SVG (standard portrait) ───────────────────────────────
// viewBox="0 0 62 97" — field lines from y=4.5 to y=92.5, goals at y=0-4.5 and y=92.5-97

function FieldSVG({ half }: { half?: 'top' | 'bottom' } = {}) {
  // D-circle radius: 14.63m / 91.4m * 88 SVG units ≈ 14.08
  const dR = 14.08
  const cx = 31        // horizontal center
  const topY = 4.5     // top backline
  const botY = 92.5    // bottom backline
  const goalW = 9.6    // goal width in SVG units (3.66m / 55m * 60 * 2.4 ≈ 9.6... rough)
  const goalX1 = cx - goalW / 2
  const goalX2 = cx + goalW / 2
  // 23m lines: 22.9/91.4 * 88 ≈ 22 units from backline
  const top23 = topY + 22
  const bot23 = botY - 22
  // Penalty spots: 6.4/91.4 * 88 ≈ 6.16 from backline
  const topPen = topY + 6.16
  const botPen = botY - 6.16

  const stripes = Array.from({ length: 14 }, (_, i) => (
    <rect key={i} x="0" y={i * 6.93} width="62" height="6.93"
      fill={i % 2 === 0 ? 'url(#turfA)' : 'url(#turfB)'} />
  ))

  // Crop the same drawing to one half by panning the viewBox — every element
  // below keeps its normal full-pitch coordinates, so nothing else changes.
  const viewBox = half === 'top' ? '0 0 62 48.5' : half === 'bottom' ? '0 48.5 62 48.5' : '0 0 62 97'

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="turfA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E8049" />
          <stop offset="100%" stopColor="#146132" />
        </linearGradient>
        <linearGradient id="turfB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24824F" />
          <stop offset="100%" stopColor="#1A7040" />
        </linearGradient>
        <radialGradient id="turfVignette" cx="50%" cy="42%" r="75%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
        <filter id="lineGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {stripes}
      <rect x="0" y="0" width="62" height="97" fill="url(#turfVignette)" />

      {/* Goals (behind backlines) */}
      <rect x={goalX1} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#0C3A21" stroke="white" strokeWidth="0.7"/>
      <rect x={goalX1} y={botY} width={goalW} height="3.8" rx="0.3"
        fill="#0C3A21" stroke="white" strokeWidth="0.7"/>

      {/* Field boundary */}
      <rect x="1" y={topY} width="60" height={botY - topY}
        fill="none" stroke="white" strokeWidth="0.9" filter="url(#lineGlow)"/>

      {/* 23m lines */}
      <line x1="1" y1={top23} x2="61" y2={top23}
        stroke="white" strokeWidth="0.5" strokeOpacity="0.75"/>
      <line x1="1" y1={bot23} x2="61" y2={bot23}
        stroke="white" strokeWidth="0.5" strokeOpacity="0.75"/>

      {/* Center line */}
      <line x1="1" y1="48.5" x2="61" y2="48.5"
        stroke="white" strokeWidth="0.6" strokeOpacity="0.8"/>

      {/* Shooting circles (D) — semicircles projecting INTO the field */}
      {/* Top D: arc from (cx-dR, topY) to (cx+dR, topY) bowing downward, into the field */}
      <path d={`M ${cx - dR} ${topY} A ${dR} ${dR} 0 0 0 ${cx + dR} ${topY}`}
        fill="none" stroke="white" strokeWidth="0.75" filter="url(#lineGlow)"/>
      {/* Bottom D: arc from (cx-dR, botY) to (cx+dR, botY) bowing upward, into the field */}
      <path d={`M ${cx - dR} ${botY} A ${dR} ${dR} 0 0 1 ${cx + dR} ${botY}`}
        fill="none" stroke="white" strokeWidth="0.75" filter="url(#lineGlow)"/>

      {/* Penalty spots */}
      <circle cx={cx} cy={topPen} r="0.65" fill="white" fillOpacity="0.9"/>
      <circle cx={cx} cy={botPen} r="0.65" fill="white" fillOpacity="0.9"/>

      {/* Center spot */}
      <circle cx={cx} cy="48.5" r="0.5" fill="white" fillOpacity="0.65"/>

      {/* Corner arcs (r=0.9m, struck from corner flags) */}
      <path d={`M 1.9 ${topY} A 0.9 0.9 0 0 1 1 ${topY + 0.9}`}
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.7"/>
      <path d={`M 61 ${topY + 0.9} A 0.9 0.9 0 0 1 60.1 ${topY}`}
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.7"/>
      <path d={`M 1 ${botY - 0.9} A 0.9 0.9 0 0 1 1.9 ${botY}`}
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.7"/>
      <path d={`M 60.1 ${botY} A 0.9 0.9 0 0 1 61 ${botY - 0.9}`}
        fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.7"/>
    </svg>
  )
}

// ── Dual Field Hockey Field SVG (U7/U8, landscape) ───────────────────────────
// viewBox="0 0 140 97" — two mini-fields side by side

function DualFieldSVG() {
  const gy = 4.5
  const gBot = 92.5
  const fH = gBot - gy       // field height = 88
  const fW = 59              // each field width
  const gap = 18
  const aX = 2               // field A left edge
  const bX = aX + fW + gap   // field B left edge = 79
  const aCx = aX + fW / 2    // field A center x = 31.5
  const bCx = bX + fW / 2    // field B center x = 108.5
  const dR = 10              // D radius (smaller for mini-field)
  const goalW = 9
  const centerY = gy + fH / 2

  const stripes = Array.from({ length: 14 }, (_, i) => (
    <rect key={i} x="0" y={i * 6.93} width="140" height="6.93"
      fill={i % 2 === 0 ? 'url(#turfA2)' : 'url(#turfB2)'} />
  ))

  const miniField = (x: number, cx: number, label: string) => (
    <g key={label}>
      {/* Goals */}
      <rect x={cx - goalW / 2} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#0C3A21" stroke="white" strokeWidth="0.7"/>
      <rect x={cx - goalW / 2} y={gBot} width={goalW} height="3.8" rx="0.3"
        fill="#0C3A21" stroke="white" strokeWidth="0.7"/>
      {/* Boundary */}
      <rect x={x} y={gy} width={fW} height={fH}
        fill="none" stroke="white" strokeWidth="0.85" filter="url(#lineGlow2)"/>
      {/* Center line */}
      <line x1={x} y1={centerY} x2={x + fW} y2={centerY}
        stroke="white" strokeWidth="0.5" strokeOpacity="0.7"/>
      {/* D circles — bow into the field, not out behind the goal */}
      <path d={`M ${cx - dR} ${gy} A ${dR} ${dR} 0 0 0 ${cx + dR} ${gy}`}
        fill="none" stroke="white" strokeWidth="0.7" filter="url(#lineGlow2)"/>
      <path d={`M ${cx - dR} ${gBot} A ${dR} ${dR} 0 0 1 ${cx + dR} ${gBot}`}
        fill="none" stroke="white" strokeWidth="0.7" filter="url(#lineGlow2)"/>
      {/* Penalty spots */}
      <circle cx={cx} cy={gy + 5.5} r="0.6" fill="white" fillOpacity="0.85"/>
      <circle cx={cx} cy={gBot - 5.5} r="0.6" fill="white" fillOpacity="0.85"/>
      {/* Field label */}
      <text x={cx} y="96.5" textAnchor="middle" fill="white" fontSize="5.5"
        fontWeight="800" fillOpacity="0.9" fontFamily="'Barlow Condensed',sans-serif"
        letterSpacing="1">{label}</text>
    </g>
  )

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 140 97"
      preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="turfA2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E8049" />
          <stop offset="100%" stopColor="#146132" />
        </linearGradient>
        <linearGradient id="turfB2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24824F" />
          <stop offset="100%" stopColor="#1A7040" />
        </linearGradient>
        <radialGradient id="turfVignette2" cx="50%" cy="42%" r="80%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
        <filter id="lineGlow2" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {stripes}
      <rect x="0" y="0" width="140" height="97" fill="url(#turfVignette2)"/>
      {/* Gap between fields */}
      <rect x={aX + fW} y="0" width={gap} height="97" fill="#173523" fillOpacity="0.75"/>
      {miniField(aX, aCx, 'VELD A')}
      {miniField(bX, bCx, 'VELD B')}
    </svg>
  )
}

// ── Field View ───────────────────────────────────────────────────────────────
// Positions carry their own live (x,y) on `slots`, so any marker — bench or
// field — can be dropped anywhere on the pitch: land near another marker to
// swap/substitute, or drop on open grass to freely reposition/place there.

const SNAP_THRESHOLD = 7 // % of field container; how close a drop must be to another marker to trigger a swap/sub

// 'opp-pool' = an unplaced opponent token dragged in from the Bank tab;
// 'opp-marker' = an opponent token already placed on the field.
type DragKind = 'field' | 'bench' | 'opp-pool' | 'opp-marker'

type Selected =
  | { type: 'field'; posId: string }
  | { type: 'bench'; playerId: string }
  | { type: 'opp-pool' }
  | { type: 'opp-marker'; id: string }
  | null

interface FieldViewProps {
  ageGroup: AgeGroup
  slots: PositionSlot[]
  squad: Player[]
  oppMarkers: OppMarker[]
  selected: Selected
  dragOverPos: string | null
  dragPreview: { type: DragKind; id: string; x: number; y: number } | null
  fieldRef: React.RefObject<HTMLDivElement | null>
  onFieldClick: (posId: string) => void
  onBackgroundClick: (x: number, y: number) => void
  onMarkerPointerDown: (posId: string, e: React.PointerEvent) => void
  onOppMarkerPointerDown: (id: string, e: React.PointerEvent) => void
  onOppMarkerClick: (id: string) => void
}

function nearestSlot(slots: PositionSlot[], x: number, y: number, excludeId?: string) {
  let best: PositionSlot | null = null
  let bestDist = Infinity
  for (const s of slots) {
    if (s.posId === excludeId) continue
    const d = Math.hypot(s.x - x, s.y - y)
    if (d < bestDist) { bestDist = d; best = s }
  }
  return best && bestDist <= SNAP_THRESHOLD ? best : null
}

function FieldView({ ageGroup, slots, squad, oppMarkers, selected, dragOverPos, dragPreview, fieldRef, onFieldClick, onBackgroundClick, onMarkerPointerDown, onOppMarkerPointerDown, onOppMarkerClick }: FieldViewProps) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null
  const draggedBenchPlayer = dragPreview?.type === 'bench' ? getPlayer(dragPreview.id) : null

  return (
    <div
      ref={fieldRef}
      className="relative w-full"
      style={{ aspectRatio: isDual ? '140/97' : '62/97', maxHeight: '100%' }}
      onClick={e => {
        if (!selected) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
        const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
        onBackgroundClick(x, y)
      }}>
      {isDual ? <DualFieldSVG /> : <FieldSVG />}

      {slots.map(slot => {
        const isBeingDragged = dragPreview?.type === 'field' && dragPreview.id === slot.posId
        const player = getPlayer(slot.playerId)
        const isFieldSel = selected?.type === 'field' && selected.posId === slot.posId
        const isBenchSel = selected?.type === 'bench'
        const isDragTarget = dragOverPos === slot.posId
        const isGK = slot.posId === 'gk'
        const x = isBeingDragged ? dragPreview.x : slot.x
        const y = isBeingDragged ? dragPreview.y : slot.y

        return (
          <div
            key={slot.posId}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isBeingDragged ? 30 : 10 }}
            onPointerDown={e => { e.stopPropagation(); onMarkerPointerDown(slot.posId, e) }}
            onClick={e => { e.stopPropagation(); onFieldClick(slot.posId) }}>
            <div
              style={{
                width: player ? '46px' : '36px',
                height: player ? '46px' : '36px',
                background: isGK ? '#FBBF24' : player ? '#fff' : 'rgba(255,255,255,0.18)',
                border: isDragTarget
                  ? '2.5px solid #86EFAC'
                  : isFieldSel
                    ? '2.5px solid #fff'
                    : isBenchSel && !player
                      ? '2px dashed #86EFAC'
                      : player
                        ? '2px solid rgba(255,255,255,0.85)'
                        : '1.5px dashed rgba(255,255,255,0.45)',
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isBeingDragged
                  ? '0 6px 20px rgba(0,0,0,0.45)'
                  : isFieldSel
                    ? '0 0 0 3px rgba(26,63,171,0.7), 0 3px 12px rgba(0,0,0,0.4)'
                    : isDragTarget
                      ? '0 0 0 3px rgba(134,239,172,0.6), 0 3px 12px rgba(0,0,0,0.3)'
                      : player
                        ? '0 2px 8px rgba(0,0,0,0.3)'
                        : 'none',
                transform: isBeingDragged ? 'scale(1.18)' : isFieldSel ? 'scale(1.12)' : isDragTarget ? 'scale(1.08)' : 'scale(1)',
                opacity: isBeingDragged ? 0.95 : 1,
                transition: isBeingDragged ? 'none' : 'transform 0.1s, box-shadow 0.1s',
              }}>
              {player ? (
                player.photoUrl ? (
                  <img src={mediaSrc(player.photoUrl)} alt={player.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                      {player.number ?? initials(player.name)}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                      {firstName(player.name)}
                    </span>
                  </>
                )
              ) : (
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                  {slot.label}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {draggedBenchPlayer && dragPreview && (
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${dragPreview.x}%`, top: `${dragPreview.y}%`, zIndex: 30 }}>
          <div
            style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: '#fff', border: '2px solid rgba(255,255,255,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(0,0,0,0.45)', transform: 'scale(1.18)', opacity: 0.95,
            }}>
            {draggedBenchPlayer.photoUrl ? (
              <img src={mediaSrc(draggedBenchPlayer.photoUrl)} alt={draggedBenchPlayer.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              <>
                <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                  {draggedBenchPlayer.number ?? initials(draggedBenchPlayer.name)}
                </span>
                <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                  {firstName(draggedBenchPlayer.name)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {oppMarkers.map(o => {
        const isBeingDragged = dragPreview?.type === 'opp-marker' && dragPreview.id === o.id
        const isSel = selected?.type === 'opp-marker' && selected.id === o.id
        const x = isBeingDragged ? dragPreview.x : o.x
        const y = isBeingDragged ? dragPreview.y : o.y
        return (
          <div
            key={o.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isBeingDragged ? 30 : 9 }}
            onPointerDown={e => { e.stopPropagation(); onOppMarkerPointerDown(o.id, e) }}
            onClick={e => { e.stopPropagation(); onOppMarkerClick(o.id) }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: '#DC2626', border: isSel ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.85)',
              boxShadow: isBeingDragged
                ? '0 6px 20px rgba(0,0,0,0.45)'
                : isSel
                  ? '0 0 0 3px rgba(26,63,171,0.7), 0 3px 12px rgba(0,0,0,0.4)'
                  : '0 2px 8px rgba(0,0,0,0.3)',
              transform: isBeingDragged ? 'scale(1.18)' : isSel ? 'scale(1.12)' : 'scale(1)',
              opacity: isBeingDragged ? 0.95 : 1,
              transition: isBeingDragged ? 'none' : 'transform 0.1s, box-shadow 0.1s',
            }} />
          </div>
        )
      })}

      {dragPreview?.type === 'opp-pool' && (
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${dragPreview.x}%`, top: `${dragPreview.y}%`, zIndex: 30 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: '#DC2626', border: '2px solid rgba(255,255,255,0.85)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)', transform: 'scale(1.18)', opacity: 0.95,
          }} />
        </div>
      )}
    </div>
  )
}

// ── Read-only field (match-detail Line-up tab) ───────────────────────────────
// A static rendering of a saved game's final formation — same field SVG and
// percentage-positioned markers as FieldView, with every drag/click/selection
// affordance stripped out since nothing here is editable.

function ReadOnlyFieldView({ ageGroup, slots, squad }: { ageGroup: AgeGroup; slots: PositionSlot[]; squad: Player[] }) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null
  // Width-driven sizing (never an explicit height) so the aspect-ratio always
  // resolves cleanly: capped at 100% of the card so it never overflows a
  // narrow phone, and at (100dvh - chrome)-worth-of-width so the field fills
  // the space between the header and the local tab bar without needing to
  // scroll, on any screen size. 260px approximates the header + tab-bar +
  // card/page padding that isn't available to the field itself.
  const ratio = isDual ? 140 / 97 : 62 / 97

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: `min(100%, calc((100dvh - 260px) * ${ratio}))`, aspectRatio: isDual ? '140/97' : '62/97' }}>
      {isDual ? <DualFieldSVG /> : <FieldSVG />}

      {slots.map(slot => {
        const player = getPlayer(slot.playerId)
        const isGK = slot.posId === 'gk'

        return (
          <div key={slot.posId} className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: 10 }}>
            <div style={{
              width: player ? '46px' : '36px',
              height: player ? '46px' : '36px',
              background: isGK ? '#FBBF24' : player ? '#fff' : 'rgba(255,255,255,0.18)',
              border: player ? '2px solid rgba(255,255,255,0.85)' : '1.5px dashed rgba(255,255,255,0.45)',
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: player ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}>
              {player ? (
                player.photoUrl ? (
                  <img src={mediaSrc(player.photoUrl)} alt={player.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                      {player.number ?? initials(player.name)}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                      {firstName(player.name)}
                    </span>
                  </>
                )
              ) : (
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                  {slot.label}
                </span>
              )}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

// ── Tactics board ─────────────────────────────────────────────────────────────
// Overlaid on top of the real field (current squad positions + opponent
// markers, read-only here) so a coach can sketch a setup that's grounded in
// how the team is actually lined up. Markers are real squad players; arrows
// are drawn by dragging rather than the live field's pointer-drag machinery,
// since nothing here is tied to the actual on-field slots.

function TacticsFieldEditor({
  isDual, slots, squad, oppMarkers, board, tool, selectedMarker, fieldRef,
  selected, dragOverPos, dragPreview,
  onFieldClick, onMarkerClick, onMarkerMove, onArrowDrawn,
  onSquadSlotClick, onSquadMarkerPointerDown, onOppMarkerPointerDown, onOppMarkerClick,
}: {
  isDual: boolean
  slots: PositionSlot[]
  squad: Player[]
  oppMarkers: OppMarker[]
  board: TacticsBoard
  tool: 'select' | 'marker' | 'arrow'
  selectedMarker: string | null
  fieldRef: React.RefObject<HTMLDivElement | null>
  selected: Selected
  dragOverPos: string | null
  dragPreview: { type: DragKind; id: string; x: number; y: number } | null
  onFieldClick: (x: number, y: number) => void
  onMarkerClick: (id: string) => void
  onMarkerMove: (id: string, x: number, y: number) => void
  onArrowDrawn: (x1: number, y1: number, x2: number, y2: number) => void
  onSquadSlotClick: (posId: string) => void
  onSquadMarkerPointerDown: (posId: string, e: React.PointerEvent) => void
  onOppMarkerPointerDown: (id: string, e: React.PointerEvent) => void
  onOppMarkerClick: (id: string) => void
}) {
  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null
  const [dragArrow, setDragArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const draggingRef = useRef(false)

  // Percent-of-field coordinates from a raw client point, always measured
  // against the field container itself — needed for marker dragging below,
  // since pointer capture keeps delivering events with currentTarget set to
  // whichever marker captured them, not the field.
  const pointFromClient = (clientX: number, clientY: number) => {
    const rect = fieldRef.current!.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    return { x, y }
  }
  const toPct = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => pointFromClient(e.clientX, e.clientY)

  // Dragging a marker directly, in addition to the original tap-then-tap
  // flow (select a marker, then tap elsewhere on the field to move it there
  // — still handled by onFieldClick/handleTacticsFieldClick, and still the
  // only option with 'marker'/'arrow' tools active or on the corner board).
  // A plain tap with no real movement falls through to that flow instead of
  // firing onMarkerMove — see the marker's onClick below.
  const [draggingMarker, setDraggingMarker] = useState<{ id: string; x: number; y: number } | null>(null)
  const markerMovedRef = useRef(false)
  const markerStartRef = useRef<{ x: number; y: number } | null>(null)

  const isCorner = !!board.corner

  return (
    <div ref={fieldRef}
      className="relative w-full"
      style={{ aspectRatio: isCorner ? '62/48.5' : isDual ? '140/97' : '62/97', maxHeight: '100%', cursor: tool !== 'select' ? 'crosshair' : 'default', touchAction: tool === 'arrow' ? 'none' : undefined }}
      onClick={e => {
        if (tool === 'arrow') return
        const { x, y } = toPct(e)
        onFieldClick(x, y)
      }}
      onPointerDown={e => {
        if (tool !== 'arrow') return
        const { x, y } = toPct(e)
        draggingRef.current = true
        setDragArrow({ x1: x, y1: y, x2: x, y2: y })
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!draggingRef.current) return
        const { x, y } = toPct(e)
        setDragArrow(a => a ? { ...a, x2: x, y2: y } : a)
      }}
      onPointerUp={() => {
        if (!draggingRef.current) return
        draggingRef.current = false
        const a = dragArrow
        setDragArrow(null)
        if (a && Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 1.5) onArrowDrawn(a.x1, a.y1, a.x2, a.y2)
      }}
      onPointerCancel={() => { draggingRef.current = false; setDragArrow(null) }}>
      {isCorner ? <FieldSVG half="bottom" /> : isDual ? <DualFieldSVG /> : <FieldSVG />}

      {/* Live squad positions — kept fully interactive (same handlers as the
          normal veld view) so substitutions/swaps still work while sketching
          a formation. Skipped for a Strafcorner board: its coordinates are
          calibrated for the full pitch and would land in the wrong spot once
          cropped. */}
      {!isCorner && slots.map(slot => {
        const isBeingDragged = dragPreview?.type === 'field' && dragPreview.id === slot.posId
        const player = getPlayer(slot.playerId)
        const isFieldSel = selected?.type === 'field' && selected.posId === slot.posId
        const isBenchSel = selected?.type === 'bench'
        const isDragTarget = dragOverPos === slot.posId
        const isGK = slot.posId === 'gk'
        const x = isBeingDragged ? dragPreview.x : slot.x
        const y = isBeingDragged ? dragPreview.y : slot.y
        return (
          <div key={slot.posId}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isBeingDragged ? 30 : 5 }}
            onPointerDown={e => { e.stopPropagation(); onSquadMarkerPointerDown(slot.posId, e) }}
            onClick={e => { e.stopPropagation(); onSquadSlotClick(slot.posId) }}>
            <div style={{
              width: player ? '46px' : '36px',
              height: player ? '46px' : '36px',
              background: isGK ? '#FBBF24' : player ? '#fff' : 'rgba(255,255,255,0.18)',
              border: isDragTarget
                ? '2.5px solid #86EFAC'
                : isFieldSel
                  ? '2.5px solid #fff'
                  : isBenchSel && !player
                    ? '2px dashed #86EFAC'
                    : player
                      ? '2px solid rgba(255,255,255,0.85)'
                      : '1.5px dashed rgba(255,255,255,0.45)',
              borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: isBeingDragged
                ? '0 6px 20px rgba(0,0,0,0.45)'
                : isFieldSel
                  ? '0 0 0 3px rgba(26,63,171,0.7), 0 3px 12px rgba(0,0,0,0.4)'
                  : isDragTarget
                    ? '0 0 0 3px rgba(134,239,172,0.6), 0 3px 12px rgba(0,0,0,0.3)'
                    : player
                      ? '0 2px 8px rgba(0,0,0,0.3)'
                      : 'none',
              transform: isBeingDragged ? 'scale(1.18)' : isFieldSel ? 'scale(1.12)' : isDragTarget ? 'scale(1.08)' : 'scale(1)',
              opacity: isBeingDragged ? 0.95 : 1,
              transition: isBeingDragged ? 'none' : 'transform 0.1s, box-shadow 0.1s',
            }}>
              {player ? (
                player.photoUrl ? (
                  <img src={mediaSrc(player.photoUrl)} alt={player.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                      {player.number ?? initials(player.name)}
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                      {firstName(player.name)}
                    </span>
                  </>
                )
              ) : (
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{slot.label}</span>
              )}
            </div>
          </div>
        )
      })}

      {!isCorner && oppMarkers.map(o => {
        const isBeingDragged = dragPreview?.type === 'opp-marker' && dragPreview.id === o.id
        const isSel = selected?.type === 'opp-marker' && selected.id === o.id
        const x = isBeingDragged ? dragPreview.x : o.x
        const y = isBeingDragged ? dragPreview.y : o.y
        return (
          <div key={o.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isBeingDragged ? 30 : 4 }}
            onPointerDown={e => { e.stopPropagation(); onOppMarkerPointerDown(o.id, e) }}
            onClick={e => { e.stopPropagation(); onOppMarkerClick(o.id) }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: '#DC2626', border: isSel ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.85)',
              boxShadow: isBeingDragged
                ? '0 6px 20px rgba(0,0,0,0.45)'
                : isSel
                  ? '0 0 0 3px rgba(26,63,171,0.7), 0 3px 12px rgba(0,0,0,0.4)'
                  : '0 2px 8px rgba(0,0,0,0.3)',
              transform: isBeingDragged ? 'scale(1.18)' : isSel ? 'scale(1.12)' : 'scale(1)',
              opacity: isBeingDragged ? 0.95 : 1,
              transition: isBeingDragged ? 'none' : 'transform 0.1s, box-shadow 0.1s',
            }} />
          </div>
        )
      })}

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none', zIndex: 8 }}>
        <defs>
          <marker id="tactics-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#FBBF24" />
          </marker>
        </defs>
        {board.arrows.map(a => (
          <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="#FBBF24" strokeWidth="0.8" markerEnd="url(#tactics-arrowhead)" />
        ))}
        {dragArrow && (
          <line x1={dragArrow.x1} y1={dragArrow.y1} x2={dragArrow.x2} y2={dragArrow.y2}
            stroke="#FBBF24" strokeWidth="0.8" strokeDasharray="2,1.5" markerEnd="url(#tactics-arrowhead)" />
        )}
      </svg>

      {board.markers.map(m => {
        const player = getPlayer(m.playerId)
        const pos = draggingMarker?.id === m.id ? draggingMarker : m
        return (
          <div key={m.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 select-none touch-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: 10, cursor: tool === 'select' ? 'grab' : 'default' }}
            onPointerDown={e => {
              if (tool !== 'select') return
              e.stopPropagation()
              markerMovedRef.current = false
              markerStartRef.current = { x: e.clientX, y: e.clientY }
              setDraggingMarker({ id: m.id, x: m.x, y: m.y })
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (tool !== 'select' || draggingMarker?.id !== m.id) return
              e.stopPropagation()
              const start = markerStartRef.current
              if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) markerMovedRef.current = true
              const { x, y } = pointFromClient(e.clientX, e.clientY)
              setDraggingMarker(d => d ? { ...d, x, y } : d)
            }}
            onPointerUp={e => {
              if (tool !== 'select' || draggingMarker?.id !== m.id) return
              e.stopPropagation()
              const moved = markerMovedRef.current
              const finalPos = draggingMarker
              setDraggingMarker(null)
              if (moved && finalPos) onMarkerMove(m.id, finalPos.x, finalPos.y)
            }}
            onPointerCancel={() => setDraggingMarker(null)}
            onClick={e => { e.stopPropagation(); if (!markerMovedRef.current) onMarkerClick(m.id) }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: '#fff',
              border: selectedMarker === m.id ? '2.5px solid var(--brand-1a3fab)' : '2px solid rgba(13,43,122,0.5)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: selectedMarker === m.id ? '0 0 0 3px rgba(26,63,171,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
            }}>
              {player?.photoUrl ? (
                <img src={mediaSrc(player.photoUrl)} alt={player.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--brand-1a2f6b)', lineHeight: 1 }}>
                    {player ? (player.number ?? initials(player.name)) : '?'}
                  </span>
                  {player && (
                    <span style={{ fontSize: '7px', fontWeight: 600, color: 'var(--brand-3b5299)', marginTop: '1px', maxWidth: '36px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {firstName(player.name)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Formation Editor ─────────────────────────────────────────────────────────
// Lets a club drag the default position markers to match how they actually
// line up; saved per age group in localStorage and picked up by getPositionsForVariant().

function FormationEditorView({ ageGroup, onBack }: { ageGroup: AgeGroup; onBack: () => void }) {
  const variants = getFormationVariants(ageGroup)
  const [variantId, setVariantId] = useLS(formationVariantKey(ageGroup), variants[0].id)
  const activeVariant = variants.find(v => v.id === variantId) ?? variants[0]

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-sm font-semibold shrink-0" style={{ color: 'var(--brand-7b9de0)' }}>← Terug</button>
            <div>
              <h1 className="font-display text-2xl font-bold uppercase tracking-widest leading-none">Opstelling aanpassen</h1>
              <p className="text-xs mt-1" style={{ color: 'var(--brand-7b9de0)' }}>{AGE_CONFIG[ageGroup].label}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <H1Logo height={24} />
          </div>
          <div />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <p className="text-sm text-center" style={{ color: 'var(--brand-6b82b8)' }}>
          Sleep de posities naar de gewenste plek op het veld. Dit wordt de standaardopstelling voor {ageGroupLabel(ageGroup)}.
        </p>

        {variants.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>
              Opstellingsvariant
            </label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: 'var(--brand-1a2f6b)', outline: 'none' }}
              value={activeVariant.id} onChange={e => setVariantId(e.target.value)}>
              {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}

        {/* Keyed by variant so switching variants remounts this with a fresh
            drag-layout read from localStorage instead of carrying over the
            previous variant's positions. */}
        <FormationVariantEditor key={activeVariant.id} ageGroup={ageGroup} variant={activeVariant} onBack={onBack} />
      </div>
    </div>
  )
}

function FormationVariantEditor({ ageGroup, variant, onBack }: { ageGroup: AgeGroup; variant: FormationVariant; onBack: () => void }) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const base = variant.positions
  const [positions, setPositions] = useLS<PosDef[]>(layoutKey(ageGroup, variant.id), base)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingId = useRef<string | null>(null)

  // If the underlying formation changed since this layout was saved, the ids
  // won't line up — fall back to base. (Component remounts on variant change,
  // so this only ever needs to guard within a single variant.)
  useEffect(() => {
    const valid = positions.length === base.length && positions.every(p => base.some(b => b.id === p.id))
    if (!valid) setPositions(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const movePos = (clientX: number, clientY: number) => {
    if (!draggingId.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    const id = draggingId.current
    setPositions(ps => ps.map(p => (p.id === id ? { ...p, x, y } : p)))
  }

  return (
    <>
      <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center justify-center" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
        <div
          ref={containerRef}
          className="relative w-full touch-none"
          style={{ aspectRatio: isDual ? '140/97' : '62/97', maxWidth: isDual ? '540px' : '290px' }}
          onPointerMove={e => movePos(e.clientX, e.clientY)}
          onPointerUp={() => { draggingId.current = null }}
          onPointerLeave={() => { draggingId.current = null }}>
          {isDual ? <DualFieldSVG /> : <FieldSVG />}
          {positions.map(pos => (
            <div
              key={pos.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab select-none touch-none"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: 10 }}
              onPointerDown={e => {
                draggingId.current = pos.id
                ;(e.target as Element).setPointerCapture(e.pointerId)
              }}>
              <div
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: pos.id === 'gk' ? '#FBBF24' : '#fff',
                  border: '2px solid var(--brand-1a3fab)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--brand-1a3fab)' }}>{pos.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setPositions(base)}
          className="flex-1 py-3 rounded-xl font-semibold text-sm"
          style={{ background: 'var(--brand-f8faff)', color: 'var(--brand-3b5299)', border: '1.5px solid var(--brand-d0dcfa)' }}>
          Standaardopstelling herstellen
        </button>
        <button onClick={onBack}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white"
          style={{ background: 'var(--brand-1a3fab)' }}>
          Klaar
        </button>
      </div>
    </>
  )
}

// A plain <select> with 350+ KNHB clubs is scrollable but not searchable —
// this swaps it for a text input that filters the same option list as you
// type, while still behaving like a normal controlled value/onChange field.
function SearchableSelect({ value, onChange, options, placeholder, inputStyle }: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  inputStyle: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const pick = (v: string) => { onChange(v); setQuery(''); setOpen(false) }

  return (
    <div ref={containerRef} className="relative">
      <input type="text" className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: value ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
        value={open ? query : value} placeholder={placeholder}
        onFocus={() => setQuery('')}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onClick={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); pick(filtered[0]) }
        }} />
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl bg-white shadow-lg py-1"
          style={{ border: '1.5px solid var(--brand-d0dcfa)' }}>
          {value && (
            <button type="button" onClick={() => pick('')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--brand-f0f5ff)]" style={{ color: 'var(--brand-7b90c8)' }}>
              {placeholder}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm" style={{ color: 'var(--brand-a8bef0)' }}>Geen resultaten</p>
          ) : (
            filtered.map(o => (
              <button key={o} type="button" onClick={() => pick(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--brand-f0f5ff)]"
                style={{ color: 'var(--brand-1a2f6b)', background: o === value ? 'var(--brand-f0f5ff)' : undefined }}>
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Notification bell ───────────────────────────────────────────────────────
// Icon-only trigger + dropdown panel, lives in the main page's topbar (moved
// out of the bottom bar, which only has room for Thuis/Wedstrijden/Berichten
// now) — clicking a notification with a linked game still jumps to Wedstrijden.

function NotificationBell({ unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDelete, onOpenHistory }: {
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDelete: (id: string) => void
  onOpenHistory: () => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative w-8 h-8 flex items-center justify-center" style={{ color: 'var(--brand-a8bef0)' }} aria-label="Meldingen">
        <IconBell />
        {unreadNotifications > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 text-white leading-tight" style={{ background: '#DC2626' }}>
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <div ref={panelRef} className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] z-40">
          <div className="rounded-2xl shadow-2xl overflow-hidden bg-white" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--brand-e8effd)' }}>
              <span className="font-display font-bold uppercase text-sm tracking-wide" style={{ color: 'var(--brand-0d2b7a)' }}>Meldingen</span>
              {notifications.some(n => !n.read) && (
                <button onClick={onMarkAllRead} className="text-xs font-semibold" style={{ color: 'var(--brand-1a3fab)' }}>Alles gelezen</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Geen meldingen</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="flex items-start gap-2 px-4 py-3 text-sm"
                    style={{ borderBottom: '1px solid var(--brand-f0f5ff)', background: n.read ? 'transparent' : 'var(--brand-f0f5ff)' }}>
                    {!n.read && <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--brand-1a3fab)' }} />}
                    <button onClick={() => { onMarkRead(n.id); if (n.gameId) { setOpen(false); onOpenHistory() } }}
                      className="flex-1 min-w-0 text-left">
                      <div style={{ color: 'var(--brand-1a2f6b)' }}>{renderFormattedText(n.body)}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--brand-a8bef0)' }}>{formatRelativeTime(n.createdAt)}</div>
                    </button>
                    <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
                      <button onClick={() => n.read ? onMarkUnread(n.id) : onMarkRead(n.id)}
                        className="text-xs leading-none" style={{ color: 'var(--brand-a8bef0)' }}
                        title={n.read ? 'Markeer als ongelezen' : 'Markeer als gelezen'}>
                        {n.read ? '○' : '●'}
                      </button>
                      <button onClick={() => onDelete(n.id)}
                        className="text-xs leading-none" style={{ color: '#DC2626' }}
                        title="Verwijderen">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Home / dashboard ─────────────────────────────────────────────────────────
// The main landing screen once logged in — a real dashboard (next match,
// last result) instead of always showing the match-creation form. Creating a
// match now lives entirely under Wedstrijden ("Wedstrijd aanmaken"); a
// logged-out visitor has no games/dashboard data to show at all, so App()
// routes them straight to SetupView's form instead of this component.

function HomeView({ user, games, onEditGame, onOpenHistory, onOpenMatch, onCreateMatch, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification }: {
  user: AuthUser
  games: SavedGame[]
  onEditGame: (g: SavedGame) => void
  onOpenHistory: () => void
  onOpenMatch: (id: string) => void
  onCreateMatch: () => void
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
}) {
  // Same "not yet played" signal HistoryView's upcoming list uses — the
  // clock hasn't run yet, regardless of whether a squad's already built.
  const nextMatch = [...games].filter(g => g.finalTime === 0).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  // A played match's clock should read > 0, but not every recorded result
  // necessarily ran through the live timer for its full duration — a match
  // dated in the past is a more forgiving fallback signal than finalTime
  // alone, so a real result isn't missed here just because it's 0.
  const lastPlayed = [...games]
    .filter(g => g.finalTime > 0 || g.date < todayStr())
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3 justify-self-start">
            {user.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
            <div>
              <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                {user.defaultClub ?? 'Hockey One'}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                {user.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <H1Logo height={26} />
          </div>
          <div className="flex items-center gap-2 justify-self-end">
            <NotificationBell
              unreadNotifications={unreadNotifications}
              notifications={notifications}
              onMarkRead={onMarkRead}
              onMarkAllRead={onMarkAllRead}
              onMarkUnread={onMarkUnread}
              onDelete={onDeleteNotification}
              onOpenHistory={onOpenHistory}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {nextMatch && (
          <section className="rounded-2xl p-6 text-white shadow-lg" style={{ background: 'var(--brand-0d2b7a)' }}>
            <h2 className="font-display text-xs font-bold uppercase mb-3" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.14em' }}>
              Volgende wedstrijd
            </h2>
            <div className="flex items-center gap-3">
              <ClubLogo club={nextMatch.club} size={40} />
              <span className="font-display text-lg font-bold uppercase" style={{ color: 'var(--brand-a8bef0)' }}>
                {nextMatch.homeAway === 'Thuis' ? 'Thuis' : 'Uit'}
              </span>
              <ClubLogo club={matchKnhbClub(nextMatch.opponent)} size={40} />
            </div>
            <p className="font-display text-xl font-bold mt-3 leading-tight">
              {nextMatch.club} {nextMatch.team} <span style={{ color: 'var(--brand-a8bef0)', fontWeight: 400 }}>vs</span> {nextMatch.opponent}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-a8bef0)' }}>
              {new Date(nextMatch.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <button onClick={() => onEditGame(nextMatch)}
              className="w-full mt-4 py-3 rounded-xl font-display font-bold uppercase tracking-wide text-sm"
              style={{ background: '#fff', color: 'var(--brand-0d2b7a)' }}>
              Wedstrijd voorbereiden →
            </button>
          </section>
        )}

        <section className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
          <h2 className="font-display text-xs font-bold uppercase mb-3" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.14em' }}>
            Laatste resultaat
          </h2>
          {lastPlayed ? (
            <>
              <div className="flex items-center gap-3">
                <ClubLogo club={lastPlayed.club} size={36} />
                <span className="font-display text-2xl font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>
                  {lastPlayed.scoreOwn} - {lastPlayed.scoreOpp}
                </span>
                <ClubLogo club={matchKnhbClub(lastPlayed.opponent)} size={36} />
              </div>
              <p className="text-sm font-semibold mt-3" style={{ color: 'var(--brand-1a2f6b)' }}>
                {lastPlayed.club} {lastPlayed.team} <span style={{ color: 'var(--brand-a8bef0)', fontWeight: 400 }}>vs</span> {lastPlayed.opponent}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--brand-a8bef0)' }}>
                {new Date(lastPlayed.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <button onClick={() => onOpenMatch(lastPlayed.id)} className="text-sm font-bold mt-3" style={{ color: 'var(--brand-1a3fab)' }}>
                Bekijk wedstrijd →
              </button>
            </>
          ) : (
            <p className="text-sm py-2" style={{ color: 'var(--brand-a8bef0)' }}>Geen resultaten beschikbaar</p>
          )}
        </section>

        <button onClick={onCreateMatch}
          className="w-full py-3.5 rounded-xl font-display font-bold uppercase tracking-widest text-sm text-white"
          style={{ background: 'var(--brand-1a3fab)' }}>
          Wedstrijd aanmaken
        </button>
      </div>
    </div>
  )
}

// ── Setup View ───────────────────────────────────────────────────────────────

function SetupView({ onStart, onProfile, user, authLoading, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification, onOpenHistory }: {
  onStart: (p: GameParams) => void
  onProfile: () => void
  user: AuthUser | null
  authLoading: boolean
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
  onOpenHistory: () => void
}) {
  const [club, setClub] = useLS('fh_club', '')
  const [team, setTeam] = useLS('fh_team', '')
  const [teamSuffix, setTeamSuffix] = useState('')
  const [teamNames, setTeamNames] = useState<string[]>([])
  const ageGroup = team ? ageGroupFromTeamName(team) : 'U7'
  const [opponent, setOpponent] = useState('')
  const [opponentTeam, setOpponentTeam] = useState('')
  const [opponentTeamSuffix, setOpponentTeamSuffix] = useState('')
  const [homeAway, setHomeAway] = useState<'Thuis' | 'Uit'>('Thuis')
  const [matchDate, setMatchDate] = useState(() => todayStr())
  const [squad, setSquad] = useLS<Player[]>('fh_squad', [])
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showFormationEditor, setShowFormationEditor] = useState(false)

  const addPlayer = () => {
    const name = newName.trim()
    if (!name) return
    setSquad(s => [...s, { id: uid(), name }])
    setNewName('')
  }

  const saveEdit = (id: string) => {
    if (!editName.trim()) return
    setSquad(s => s.map(p => p.id === id ? { ...p, name: editName.trim() } : p))
    setEditId(null)
  }

  // The official team list (and its rosters) requires login to fetch at all
  // — logged-out visitors only ever see GENERIC_TEAM_CATEGORIES.
  useEffect(() => {
    if (!user) { setTeamNames([]); return }
    fetchTeamNames().then(setTeamNames)
  }, [user])

  // fh_squad/fh_team persist in localStorage so a reload doesn't lose your
  // setup — but an official roster fetched while logged in would otherwise
  // sit there indefinitely, showing that coach's real player names to
  // anyone else using this browser. fh_squad_official_owner tags *whose*
  // roster is currently cached (set in selectTeam below, right after a
  // successful fetch) so this can tell "still the same person" apart from
  // "logged out, or a different person logged in" — on a mismatch the cache
  // is cleared. Checking on every mount (not just a live logout click in
  // this tab) is what catches an already-stale cache from a *previous*
  // session, e.g. reopening the app after logging out yesterday. Waiting
  // for authLoading to resolve avoids a spurious clear-then-refetch flash
  // on an ordinary reload while still logged in.
  const [squadOfficialOwner, setSquadOfficialOwner] = useLS<string | null>('fh_squad_official_owner', null)
  useEffect(() => {
    if (authLoading) return
    // One-time cleanup for browsers with a cache from before this owner tag
    // existed — untagged, it has nothing to mismatch against and would
    // otherwise keep leaking indefinitely regardless of the check below.
    if (localStorage.getItem('fh_squad_owner_tracking_v1') !== '1') {
      localStorage.setItem('fh_squad_owner_tracking_v1', '1')
      setSquad([])
      setTeam('')
      setSquadOfficialOwner(null)
      return
    }
    const currentEmail = user?.email ?? null
    if (squadOfficialOwner && squadOfficialOwner !== currentEmail) {
      setSquad([])
      setTeam('')
      setSquadOfficialOwner(null)
    }
  }, [authLoading, user, squadOfficialOwner])

  // Selecting a team fills Selectie with its official roster; players can
  // still be added or removed manually afterwards. This only affects the
  // current match setup — it never touches the profile's preferred team,
  // which is only changed explicitly from the Profile page.
  const selectTeam = (newTeam: string) => {
    setTeam(newTeam)
    if (!user) return
    fetchTeamRoster(newTeam).then(players => {
      if (players.length) {
        setSquad(players.map(p => ({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? undefined })))
        setSquadOfficialOwner(user.email)
      }
    })
  }

  // Once signed in, pre-select the coach's remembered team (from their
  // profile) if nothing's been picked locally yet — works across devices.
  useEffect(() => {
    if (user?.defaultTeam && !team) selectTeam(user.defaultTeam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.defaultTeam])

  // Same idea for the club, except it always wins once set — changing it in
  // Profile should be reflected back here immediately, not just fill in the
  // first time. Without a profile club (or logged out), the dropdown below
  // just starts on "Kies club…" and the coach picks one themselves.
  useEffect(() => {
    if (user?.defaultClub) setClub(user.defaultClub)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.defaultClub])

  // Photos are uploaded from Profile onto the same team_players rows a
  // squad's players are drawn from. Re-fetch the roster and merge photos by
  // name whenever the active team changes, so photos uploaded in Profile
  // show up here without needing to re-select the team.
  useEffect(() => {
    if (!team || !user) return
    let cancelled = false
    fetchTeamRoster(team).then(players => {
      if (cancelled || players.length === 0) return
      const photoByName = new Map(players.map(p => [p.name, p.photoUrl]))
      setSquad(s => s.map(p => {
        const photoUrl = photoByName.get(p.name)
        return photoUrl ? { ...p, photoUrl } : p
      }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team])

  const minPlayers = AGE_CONFIG[ageGroup].total
  // e.g. "MO11" + "Wit" -> "MO11-Wit", matching the real MO11-1/JO9-Blauw style names.
  const opponentTeamFull = [opponentTeam, opponentTeamSuffix.trim()].filter(Boolean).join('-')
  // Logged-in users already pick the full official team name from the roster
  // dropdown; only logged-out users pick a bare generic category and need the
  // suffix to name their own team as specifically as the opponent's.
  const teamFull = user ? team : [team, teamSuffix.trim()].filter(Boolean).join('-')
  const canStart = club && team && (opponent || opponentTeamFull)

  const inputStyle = { border: '2px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }

  if (showFormationEditor) {
    return <FormationEditorView ageGroup={ageGroup} onBack={() => setShowFormationEditor(false)} />
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3 justify-self-start">
            {user?.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
            <div>
              <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                {user?.defaultClub ?? 'Hockey One'}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                {user?.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
              </p>
            </div>
          </div>
          <h1 className="font-display text-xl font-bold uppercase tracking-widest text-center truncate">Nieuwe wedstrijd</h1>
          <div className="flex items-center gap-2 justify-self-end">
            {user && (
              <NotificationBell
                unreadNotifications={unreadNotifications}
                notifications={notifications}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onMarkUnread={onMarkUnread}
                onDelete={onDeleteNotification}
                onOpenHistory={onOpenHistory}
              />
            )}
            {!user && (
              <button onClick={onProfile} className="text-sm px-3 py-1.5 rounded-lg font-semibold"
                style={{ color: 'var(--brand-a8bef0)', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
                Inloggen
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Team config */}
        <section className="bg-white rounded-2xl p-6 space-y-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: 'var(--brand-0d2b7a)' }}>Team</h2>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Club</label>
            <SearchableSelect value={club} onChange={setClub} options={KNHB_CLUBS} placeholder="Kies club…" inputStyle={inputStyle} />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Teamnaam</label>
            {authLoading ? (
              <div className="rounded-xl px-3 py-3 text-sm text-center" style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: 'var(--brand-a8bef0)' }}>
                Laden…
              </div>
            ) : (
              <>
                <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: team ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
                  value={team} onChange={e => selectTeam(e.target.value)}>
                  <option value="">Kies team…</option>
                  {(user ? teamNames : GENERIC_TEAM_CATEGORIES).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {!user && (
                  <>
                    <input type="text" className="w-full rounded-xl px-3 py-2.5 text-sm mt-2" style={inputStyle}
                      value={teamSuffix} onChange={e => setTeamSuffix(e.target.value)}
                      placeholder="Toevoeging (bijv. Wit, 1, 2)" />
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-7b90c8)' }}>
                      Dit is een algemene categorie zonder spelerslijst.{' '}
                      <button onClick={onProfile} className="font-bold" style={{ color: 'var(--brand-1a3fab)' }}>Log in</button>
                      {' '}voor de officiële teamnamen en spelerslijst.
                    </p>
                  </>
                )}
                {team && (
                  <>
                    <p className="text-xs mt-2 font-medium" style={{ color: 'var(--brand-7b90c8)' }}>{AGE_CONFIG[ageGroup].label}</p>
                    <button onClick={() => setShowFormationEditor(true)}
                      className="text-xs font-bold mt-1"
                      style={{ color: 'var(--brand-1a3fab)' }}>
                      Opstelling aanpassen →
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {/* Match */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: 'var(--brand-0d2b7a)' }}>Tegenstander</h2>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Club</label>
            <SearchableSelect value={opponent} onChange={setOpponent} options={KNHB_CLUBS} placeholder="Kies club tegenstander…" inputStyle={inputStyle} />
            <label className="block text-xs font-bold uppercase mb-1.5 mt-3" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Teamnaam</label>
            {/* Always the generic category list, even when the opponent club is SC
                Muiden — that roster is for the coach's own team, not for naming
                whichever of their teams happens to be the opponent here. */}
            <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: opponentTeam ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
              value={opponentTeam} onChange={e => setOpponentTeam(e.target.value)}>
              <option value="">Kies teamnaam tegenstander…</option>
              {GENERIC_TEAM_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" className="w-full rounded-xl px-3 py-2.5 text-sm mt-2" style={inputStyle}
              value={opponentTeamSuffix} onChange={e => setOpponentTeamSuffix(e.target.value)}
              placeholder="Toevoeging (bijv. Wit, 1, 2)" />
          </div>
          <div className="flex gap-3">
            {(['Thuis', 'Uit'] as const).map(ha => (
              <button key={ha} onClick={() => setHomeAway(ha)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={homeAway === ha
                  ? { background: 'var(--brand-1a3fab)', color: '#fff', border: '1.5px solid var(--brand-1a3fab)' }
                  : { background: 'var(--brand-f8faff)', color: 'var(--brand-3b5299)', border: '1.5px solid var(--brand-d0dcfa)' }}>
                {ha}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Datum</label>
            {/* Native date-picker controls can render wider than the CSS box on
                some mobile browsers (their internal segments/icon ignore
                width:100%) — clipping on this wrapper, with the input itself
                borderless/transparent, keeps the visible box the same size as
                every other field regardless of that native overflow. */}
            <div className="w-full rounded-xl overflow-hidden" style={inputStyle}>
              <input type="date" className="w-full block px-3 py-2.5 text-sm bg-transparent border-0 outline-none"
                value={matchDate} onChange={e => setMatchDate(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Squad */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: 'var(--brand-0d2b7a)' }}>Selectie</h2>
            <span className="text-sm font-bold" style={{ color: squad.length >= minPlayers ? '#16A34A' : 'var(--brand-7b90c8)' }}>
              {squad.length} / {minPlayers}+ spelers
            </span>
          </div>

          <div className="flex gap-2">
            <input className="flex-1 rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Naam speler"
              onKeyDown={e => e.key === 'Enter' && addPlayer()} />
            <button onClick={addPlayer}
              className="px-4 py-2.5 rounded-xl font-bold text-white text-lg"
              style={{ background: 'var(--brand-1a3fab)' }}>+</button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {squad.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Voeg spelers toe aan de selectie</p>
            )}
            {sortPlayers(squad).map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--brand-f0f5ff)', border: '1px solid var(--brand-e4ecfe)' }}>
                {editId === p.id ? (
                  <>
                    <input className="flex-1 rounded-lg px-2 py-1 text-sm"
                      style={{ border: '1px solid var(--brand-d0dcfa)', background: 'white' }}
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)} />
                    <button onClick={() => saveEdit(p.id)}
                      className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: '#16A34A' }}>✓</button>
                    <button onClick={() => setEditId(null)}
                      className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--brand-7b90c8)' }}>✕</button>
                  </>
                ) : (
                  <>
                    {p.number != null && (
                      <span className="font-mono text-sm font-bold w-8 text-center" style={{ color: 'var(--brand-1a3fab)' }}>#{p.number}</span>
                    )}
                    <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--brand-1a2f6b)' }}>{p.name}</span>
                    <button onClick={() => { setEditId(p.id); setEditName(p.name) }}
                      className="text-xs px-2 py-0.5 rounded-lg" style={{ color: 'var(--brand-a8bef0)' }}>✎</button>
                    <button onClick={() => setSquad(s => s.filter(x => x.id !== p.id))}
                      className="text-lg leading-none ml-1" style={{ color: 'var(--brand-c8d5f5)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-c8d5f5)')}>×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <button
          disabled={!canStart}
          onClick={() => onStart({ club, team: teamFull, ageGroup, opponent: [opponent, opponentTeamFull].filter(Boolean).join(' '), homeAway, squad, date: matchDate })}
          className="w-full py-4 rounded-2xl font-display text-xl font-bold uppercase tracking-widest text-white shadow-lg"
          style={{ background: canStart ? 'var(--brand-1a3fab)' : 'var(--brand-b8c8f0)', cursor: canStart ? 'pointer' : 'not-allowed' }}>
          Wedstrijd starten →
        </button>
        {!canStart && (
          <p className="text-xs text-center -mt-3" style={{ color: 'var(--brand-a8bef0)' }}>
            Vul club, team en tegenstander in
          </p>
        )}
      </div>
    </div>
  )
}

// ── Game View ────────────────────────────────────────────────────────────────

// An empty (but defined) `saved` array means there's no real slot data to
// preserve — e.g. a Hockey-One fixture seeded with `slots: []` (see
// seedTeamFixtures in db.ts) — so it's treated the same as no saved data at
// all: build a fresh template instead of handing back zero slots, which
// would leave the field with nowhere to drag a player onto.
function normalizeSlots(saved: PositionSlot[] | undefined, ageGroup: AgeGroup, variant: FormationVariant): PositionSlot[] {
  const template = getPositionsForVariant(ageGroup, variant)
  if (!saved || saved.length === 0) return template.map(p => ({ posId: p.id, label: p.label, playerId: null, x: p.x, y: p.y }))
  return saved.map(s => {
    const base = template.find(p => p.id === s.posId)
    return {
      posId: s.posId,
      playerId: s.playerId,
      label: s.label ?? base?.label ?? '',
      x: s.x ?? base?.x ?? 50,
      y: s.y ?? base?.y ?? 50,
    }
  })
}

// Rebuilds slots against a different formation variant, carrying over
// whoever's already on the field by matching posId between the old and new
// templates (see the FORMATIONS comment on id conventions — d1/m1/f1 etc.
// mean roughly the same role across variants of the same age group). Anyone
// whose posId doesn't exist in the new variant falls off the field onto the
// bench instead of just disappearing.
function reassignSlotsForVariant(oldSlots: PositionSlot[], ageGroup: AgeGroup, variant: FormationVariant): { slots: PositionSlot[]; benched: string[] } {
  const template = getPositionsForVariant(ageGroup, variant)
  const oldByPosId = new Map(oldSlots.map(s => [s.posId, s.playerId]))
  const kept = new Set<string>()
  const slots = template.map(p => {
    const playerId = oldByPosId.get(p.id) ?? null
    if (playerId) kept.add(playerId)
    return { posId: p.id, label: p.label, playerId, x: p.x, y: p.y }
  })
  const benched = oldSlots.map(s => s.playerId).filter((id): id is string => !!id && !kept.has(id))
  return { slots, benched }
}

function GameView({ club, team, ageGroup, opponent, homeAway, squad, date, initial, user, onSave, onBack }: GameParams & {
  initial?: SavedGame
  user: AuthUser | null
  onSave: (g: SavedGame) => void
  onBack: () => void
}) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  // A game shared with only 'view' permission is read-only in the UI; the
  // real enforcement is server-side (PUT rejects it regardless), this just
  // keeps a view-only viewer from fiddling with controls that won't stick.
  const readOnly = (initial?.permission ?? 'owner') === 'view'
  // Generated once and reused for every autosave of a brand-new match — the
  // old manual-save flow called uid() fresh on each click when `initial` was
  // undefined, which would have inserted a new row per autosave tick instead
  // of updating the same one.
  const [gameId] = useState(() => initial?.id ?? uid())
  const [gameDate] = useState(() => initial?.date ?? date ?? todayStr())

  const formationVariants = getFormationVariants(ageGroup)
  const [variantId, setVariantId] = useState(() => findVariantForSlots(ageGroup, initial?.slots).id)
  const activeVariant = formationVariants.find(v => v.id === variantId) ?? formationVariants[0]
  const [slots, setSlots] = useState<PositionSlot[]>(() => normalizeSlots(initial?.slots, ageGroup, activeVariant))
  const [bench, setBench] = useState<BenchEntry[]>(() => {
    const onField = new Set((initial?.slots ?? []).map(s => s.playerId).filter(Boolean))
    return squad.filter(p => !onField.has(p.id)).map(p => ({ playerId: p.id, sinceGameSec: initial?.finalTime ?? 0 }))
  })
  const [subs, setSubs] = useState<SubRecord[]>(() => initial?.subs ?? [])
  const [oppMarkers, setOppMarkers] = useState<OppMarker[]>(() => initial?.oppMarkers ?? [])
  const [goals, setGoals] = useState<Goal[]>(() => initial?.goals ?? [])
  const [goalPlayerId, setGoalPlayerId] = useState('')
  const [cards, setCards] = useState<Card[]>(() => initial?.cards ?? [])
  const [cardPlayerId, setCardPlayerId] = useState('')
  const [cardColor, setCardColor] = useState<Card['color']>('green')
  // A red card ends a player's match — recomputed from `cards` rather than
  // tracked separately, so undoing a mis-given card (the × next to it)
  // immediately lifts the restriction again.
  const redCardedIds = new Set(cards.filter(c => c.color === 'red').map(c => c.playerId))
  // A brand-new board starts seeded with whoever's currently on the field
  // (their live slot positions) instead of blank — without this, the tactics
  // board looked empty and un-interactive on first open (the live squad shown
  // there is a non-interactive reference only), which read as "I can't move
  // players around" even though dragging markers works fine once any exist.
  const seedMarkersFromSlots = (): TacticsMarker[] =>
    slots.filter(s => s.playerId).map(s => ({ id: uid(), x: s.x, y: s.y, playerId: s.playerId! }))
  const [tacticsBoards, setTacticsBoards] = useState<TacticsBoard[]>(() =>
    initial?.tacticsBoards?.length ? initial.tacticsBoards : [{ id: uid(), name: 'Opstelling 1', markers: seedMarkersFromSlots(), arrows: [] }]
  )
  const [activeBoardId, setActiveBoardId] = useState(() => tacticsBoards[0].id)
  const [tacticsTool, setTacticsTool] = useState<'select' | 'marker' | 'arrow'>('select')
  const [selectedTacticsMarker, setSelectedTacticsMarker] = useState<string | null>(null)
  const [tacticsPlayerId, setTacticsPlayerId] = useState('')
  const [playedSeconds, setPlayedSeconds] = useState<Record<string, number>>(() => initial?.playedSeconds ?? {})
  const [media, setMedia] = useState<MediaItem[]>(() => initial?.media ?? [])
  const [uploading, setUploading] = useState(false)
  const mediaFileInputRef = useRef<HTMLInputElement>(null)
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [result] = useState(initial?.result ?? '')
  const [scoreOwn, setScoreOwn] = useState(initial?.scoreOwn ?? 0)
  const [scoreOpp, setScoreOpp] = useState(initial?.scoreOpp ?? 0)
  const [gameSec, setGameSec] = useState(initial?.finalTime ?? 0)
  // `gameSec` itself stays a plain cumulative elapsed-seconds counter (bench
  // timers, sub timestamps and per-player played time all key off it) —
  // `periodStartSec` just marks the `gameSec` value the current period began
  // at, so the header clock can show time remaining *in this period* without
  // otherwise touching how `gameSec` behaves.
  const { periods: totalPeriods, periodSec } = AGE_CONFIG[ageGroup]
  const [currentPeriod, setCurrentPeriod] = useState(() => initial?.currentPeriod ?? 1)
  const [periodStartSec, setPeriodStartSec] = useState(() => initial?.periodStartSec ?? 0)
  const remainingInPeriod = Math.max(0, periodSec - (gameSec - periodStartSec))
  const periodLabel = totalPeriods === 2 ? 'Helft' : 'Kwart'
  const advancePeriod = () => {
    if (readOnly || currentPeriod >= totalPeriods) return
    setRunning(false)
    setPeriodStartSec(gameSec)
    setCurrentPeriod(p => p + 1)
  }
  // Corrects an accidental or premature advance (e.g. tapped ⏭ too early) —
  // steps back one period at a time rather than jumping straight to 1/4, so
  // repeatedly pressing it lands wherever the coach needs. Like advancing,
  // it restarts the countdown fresh from right now rather than trying to
  // reconstruct exactly where the previous period's clock had been.
  const regressPeriod = () => {
    if (readOnly || currentPeriod <= 1) return
    setRunning(false)
    setPeriodStartSec(gameSec)
    setCurrentPeriod(p => p - 1)
  }
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)
  // Bottom tab bar — replaces the old side panel entirely. Wedstrijd is the
  // default/home tab (the full pitch); Bank/Score/Tactiek/Media are each a
  // full-screen view now, not a column squeezed beside the field.
  const [gameTab, setGameTab] = useState<'wedstrijd' | 'bank' | 'score' | 'tactiek' | 'media'>('wedstrijd')
  const [bankView, setBankView] = useState<'field' | 'list'>('field')
  const [showSettings, setShowSettings] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Autosave + Herstel (undo) ────────────────────────────────────────────
  // Everything that counts as an editable "game setting" — not the running
  // clock itself, and not media (deleting a photo/video also deletes its
  // Blob, which Herstel couldn't bring back) — is tracked here. Every real
  // change pushes the state *before* that change onto a stack; Herstel pops
  // and restores it, one click per change, all the way back to the state
  // the match started in.
  const tracked = { slots, bench, subs, oppMarkers, goals, cards, tacticsBoards, notes, scoreOwn, scoreOpp, currentPeriod, periodStartSec }
  const historyRef = useRef<(typeof tracked)[]>([])
  const lastTrackedRef = useRef(tracked)
  const isFirstTrackRef = useRef(true)
  const restoringRef = useRef(false)
  const [historyLen, setHistoryLen] = useState(0)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = () => {
    if (readOnly || !user) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => onSave(buildSnapshot()), 600)
  }
  const flushSave = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    if (!readOnly && user) onSave(buildSnapshot())
  }

  useEffect(() => {
    if (isFirstTrackRef.current) { isFirstTrackRef.current = false; lastTrackedRef.current = tracked; return }
    if (restoringRef.current) {
      restoringRef.current = false
    } else {
      historyRef.current.push(lastTrackedRef.current)
      setHistoryLen(historyRef.current.length)
    }
    lastTrackedRef.current = tracked
    scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bench, subs, oppMarkers, goals, cards, tacticsBoards, notes, scoreOwn, scoreOpp, currentPeriod, periodStartSec])

  const isFirstMediaRef = useRef(true)
  useEffect(() => {
    if (isFirstMediaRef.current) { isFirstMediaRef.current = false; return }
    scheduleSave()
  }, [media])

  // Substitutions/goals/etc. already autosave the instant they happen; the
  // clock alone ticking for a while (with nothing else changing) wouldn't
  // otherwise persist finalTime/playedSeconds until something else does.
  const lastAutosaveSecRef = useRef(gameSec)
  const isFirstGameSecRef = useRef(true)
  useEffect(() => {
    if (isFirstGameSecRef.current) { isFirstGameSecRef.current = false; return }
    if (gameSec - lastAutosaveSecRef.current >= 15) {
      lastAutosaveSecRef.current = gameSec
      scheduleSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSec])

  const prevRunningRef = useRef(running)
  useEffect(() => {
    if (prevRunningRef.current && !running) scheduleSave()
    prevRunningRef.current = running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const herstel = () => {
    if (readOnly) return
    const prev = historyRef.current.pop()
    if (!prev) return
    setHistoryLen(historyRef.current.length)
    restoringRef.current = true
    setSlots(prev.slots)
    setBench(prev.bench)
    setSubs(prev.subs)
    setOppMarkers(prev.oppMarkers)
    setGoals(prev.goals)
    setCards(prev.cards)
    setTacticsBoards(prev.tacticsBoards)
    setNotes(prev.notes)
    setScoreOwn(prev.scoreOwn)
    setScoreOpp(prev.scoreOpp)
    setCurrentPeriod(prev.currentPeriod)
    setPeriodStartSec(prev.periodStartSec)
  }

  // Only a Coach/Trainer (solo or combined) may reset a match — Manager and
  // below get no say over match state at all, only their own team's player
  // photos (see TeamPlayerPhotos). Combined with `readOnly` so a coach who's
  // merely viewing someone else's shared game (permission: 'view') can't
  // reset it either.
  const canReset = user?.role === 'Coach' || user?.role === 'Trainer' || user?.role === 'Trainer & Coach'
  // Puts everything that happens *during* a match back to a blank slate —
  // score, field/bench assignments, goals, cards, tactics boards, played
  // time, notes and the clock/period. Squad and media are deliberately left
  // alone: who's called up isn't something that goes wrong mid-match the
  // way a live scoreboard can, and clearing uploaded photos/videos would
  // need its own confirmation and Blob cleanup — out of scope for "start
  // the match over". Goes through the same tracked-state fields Herstel
  // already watches, so the reset itself is one more undo step, not a
  // point of no return.
  const resetGame = () => {
    if (readOnly || !canReset) return
    if (!confirm('Weet u zeker dat u de wedstrijd wilt resetten?')) return
    const freshBoardId = uid()
    setRunning(false)
    setSlots(normalizeSlots(undefined, ageGroup, activeVariant))
    setBench(squad.map(p => ({ playerId: p.id, sinceGameSec: 0 })))
    setSubs([])
    setOppMarkers([])
    setGoals([])
    setCards([])
    setTacticsBoards([{ id: freshBoardId, name: 'Opstelling 1', markers: [], arrows: [] }])
    setActiveBoardId(freshBoardId)
    setSelectedTacticsMarker(null)
    setPlayedSeconds({})
    setNotes('')
    setScoreOwn(0)
    setScoreOpp(0)
    setGameSec(0)
    setCurrentPeriod(1)
    setPeriodStartSec(0)
    setSelected(null)
  }

  // slotsRef (declared further below, kept fresh on every render) lets this
  // interval — only recreated when `running` toggles — see substitutions that
  // happen mid-match without resetting the tick cadence.
  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => {
      setGameSec(s => s + 1)
      setPlayedSeconds(ps => {
        const onField = slotsRef.current.filter(s => s.playerId)
        if (onField.length === 0) return ps
        const next = { ...ps }
        for (const slot of onField) next[slot.playerId!] = (next[slot.playerId!] ?? 0) + 1
        return next
      })
    }, 1000)
    else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null

  // ── Tactics boards ────────────────────────────────────────────────────────
  // Separate, deliberately simple canvas for illustrating set plays to
  // players — markers/arrows here are just visual aids, not tied to the
  // live squad or the actual on-field slots above.
  const activeBoard = tacticsBoards.find(b => b.id === activeBoardId) ?? tacticsBoards[0]

  const updateActiveBoard = (updater: (b: TacticsBoard) => TacticsBoard) => {
    if (readOnly) return
    setTacticsBoards(bs => bs.map(b => b.id === activeBoard.id ? updater(b) : b))
  }

  const addBoard = (corner: boolean) => {
    if (readOnly) return
    const sameType = tacticsBoards.filter(b => !!b.corner === corner).length + 1
    const board: TacticsBoard = {
      id: uid(),
      name: corner ? `Strafcorner ${sameType}` : `Opstelling ${sameType}`,
      markers: corner ? [] : seedMarkersFromSlots(), arrows: [], corner,
    }
    setTacticsBoards(bs => [...bs, board])
    setActiveBoardId(board.id)
  }

  const deleteBoard = (id: string) => {
    if (readOnly || tacticsBoards.length <= 1) return
    setTacticsBoards(bs => {
      const next = bs.filter(b => b.id !== id)
      if (activeBoardId === id) setActiveBoardId(next[0].id)
      return next
    })
  }

  // Tap-based editing for markers — a "select" tool for repositioning markers
  // click-then-click, and a "marker" tool that places the chosen squad player
  // where you tap. Arrows are dragged instead (handled in onArrowDrawn below).
  const handleTacticsFieldClick = (x: number, y: number) => {
    if (readOnly) return
    if (tacticsTool === 'marker') {
      if (!tacticsPlayerId) return
      updateActiveBoard(b => ({ ...b, markers: [...b.markers, { id: uid(), x, y, playerId: tacticsPlayerId }] }))
      setTacticsPlayerId('')
      return
    }
    if (selectedTacticsMarker) {
      const id = selectedTacticsMarker
      updateActiveBoard(b => ({ ...b, markers: b.markers.map(m => m.id === id ? { ...m, x, y } : m) }))
      setSelectedTacticsMarker(null)
    }
  }

  // Background taps on the tactics board serve two independent purposes —
  // placing/relocating a tactics marker, or completing a pending squad
  // action (a bench player or field slot selected before switching to this
  // tab) — so route to whichever is actually pending. Placing a tactics
  // marker (tool + a chosen player) or relocating a selected one takes
  // priority since those are explicit in-progress actions; otherwise fall
  // through to the same background-click handling FieldView uses.
  const handleTacticsBoardBackgroundClick = (x: number, y: number) => {
    if (tacticsTool === 'marker' && tacticsPlayerId) { handleTacticsFieldClick(x, y); return }
    if (tacticsTool === 'select' && selectedTacticsMarker) { handleTacticsFieldClick(x, y); return }
    if (selected) { handleBackgroundClick(x, y); return }
  }

  const handleTacticsArrowDrawn = (x1: number, y1: number, x2: number, y2: number) => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, arrows: [...b.arrows, { id: uid(), x1, y1, x2, y2 }] }))
  }

  const handleTacticsMarkerClick = (id: string) => {
    if (readOnly || tacticsTool !== 'select') return
    setSelectedTacticsMarker(sel => (sel === id ? null : id))
  }

  const handleTacticsMarkerMove = (id: string, x: number, y: number) => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, markers: b.markers.map(m => m.id === id ? { ...m, x, y } : m) }))
  }

  const removeTacticsMarker = (id: string) => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, markers: b.markers.filter(m => m.id !== id) }))
    setSelectedTacticsMarker(null)
  }

  const removeTacticsArrow = (id: string) => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, arrows: b.arrows.filter(a => a.id !== id) }))
  }

  const clearBoard = () => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, markers: [], arrows: [] }))
    setSelectedTacticsMarker(null)
  }

  const doSub = (inId: string, posId: string) => {
    if (readOnly || redCardedIds.has(inId)) return
    const pos = slots.find(s => s.posId === posId)
    const outId = pos?.playerId ?? null
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: inId } : s))
    setBench(b => b.filter(e => e.playerId !== inId).concat(outId ? [{ playerId: outId, sinceGameSec: gameSec }] : []))
    if (outId) setSubs(s => [...s, { gameTimeSec: gameSec, playerInId: inId, playerOutId: outId, posLabel: pos?.label ?? '' }])
    setSelected(null)
  }

  const swapField = (posA: string, posB: string) => {
    if (readOnly) return
    const aId = slots.find(s => s.posId === posA)?.playerId ?? null
    const bId = slots.find(s => s.posId === posB)?.playerId ?? null
    setSlots(sl => sl.map(s => {
      if (s.posId === posA) return { ...s, playerId: bId }
      if (s.posId === posB) return { ...s, playerId: aId }
      return s
    }))
    setSelected(null)
  }

  const sendToBench = (posId: string) => {
    if (readOnly) return
    const pid = slots.find(s => s.posId === posId)?.playerId
    if (!pid) return
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: null } : s))
    setBench(b => [...b.filter(e => e.playerId !== pid), { playerId: pid, sinceGameSec: gameSec }])
    setSelected(null)
  }

  // Lets a coach change the base setup mid-match (e.g. switching from
  // 1-4-3-3 to 1-4-4-2 at half-time) instead of being stuck with whichever
  // formation the match started in. Whoever's still recognizable in the new
  // template (same posId, see reassignSlotsForVariant) stays on the field;
  // everyone else goes to the bench rather than vanishing.
  const switchFormation = (newVariantId: string) => {
    if (readOnly || newVariantId === variantId) return
    const newVariant = formationVariants.find(v => v.id === newVariantId)
    if (!newVariant) return
    const { slots: newSlots, benched } = reassignSlotsForVariant(slots, ageGroup, newVariant)
    setVariantId(newVariantId)
    setSlots(newSlots)
    if (benched.length > 0) {
      setBench(b => [...b.filter(e => !benched.includes(e.playerId)), ...benched.map(playerId => ({ playerId, sinceGameSec: gameSec }))])
    }
    setSelected(null)
  }

  // Freeform positioning: move a slot (and whoever's on it) to an arbitrary spot on the field.
  const movePosition = (posId: string, x: number, y: number) => {
    if (readOnly) return
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, x, y } : s))
  }

  // ── Pointer-based dragging (works on touch, unlike HTML5 drag-and-drop) ──
  // Window-level pointermove/pointerup listeners so a drag started on a bench
  // card (a separate DOM region from the field) can still be tracked and
  // resolved against the field's bounding rect wherever the pointer lands.
  // The dragged marker's visual position follows the pointer every animation
  // frame (dragPreview) so it feels like a smooth, live drag instead of only
  // snapping into place on release.
  const fieldRef = useRef<HTMLDivElement>(null)
  const [dragOverPos, setDragOverPos] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{ type: DragKind; id: string; x: number; y: number } | null>(null)
  const dragInfoRef = useRef<{ type: DragKind; id: string } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const handleDropAtRef = useRef((_t: 'field' | 'bench', _id: string, _x: number, _y: number, _p: string | null) => {})
  const sendToBenchRef = useRef((_posId: string) => {})
  sendToBenchRef.current = sendToBench

  useEffect(() => {
    const pointInField = (clientX: number, clientY: number) => {
      const rect = fieldRef.current?.getBoundingClientRect()
      if (!rect) return null
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      return {
        inside,
        x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
      }
    }

    // Batch pointermove updates to one React update per animation frame —
    // pointermove can fire far faster than the display refreshes, and
    // committing every single event to state is what made dragging feel
    // sluggish/stuttery, especially on mobile.
    let raf: number | null = null
    let pendingOverPos: string | null | undefined
    let pendingPreview: { type: DragKind; id: string; x: number; y: number } | null | undefined
    const flush = () => {
      raf = null
      if (pendingOverPos !== undefined) setDragOverPos(pendingOverPos)
      if (pendingPreview !== undefined) setDragPreview(pendingPreview)
      pendingOverPos = undefined
      pendingPreview = undefined
    }
    const schedule = () => { if (raf == null) raf = requestAnimationFrame(flush) }

    const onMove = (e: PointerEvent) => {
      const info = dragInfoRef.current
      if (!info) return
      const pt = pointInField(e.clientX, e.clientY)
      if (!pt || !pt.inside) {
        pendingOverPos = null
        pendingPreview = null
        schedule()
        return
      }
      // Opponent tokens are a freeform overlay — they never snap to/swap with
      // your own team's slots, so skip the nearest-slot lookup for them.
      const isOpp = info.type === 'opp-pool' || info.type === 'opp-marker'
      const target = isOpp ? null : nearestSlot(slotsRef.current, pt.x, pt.y, info.type === 'field' ? info.id : undefined)
      pendingOverPos = target?.posId ?? null
      pendingPreview = { type: info.type, id: info.id, x: pt.x, y: pt.y }
      schedule()
    }
    const onUp = (e: PointerEvent) => {
      const info = dragInfoRef.current
      const start = dragStartRef.current
      dragInfoRef.current = null
      dragStartRef.current = null
      if (raf != null) { cancelAnimationFrame(raf); raf = null }
      setDragOverPos(null)
      setDragPreview(null)
      if (!info || !start) return
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6
      if (!moved) return // a simple tap — let the native click event drive the existing select flow
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 0)
      const pt = pointInField(e.clientX, e.clientY)

      // Opponent markers: drag onto the field to place/reposition, drag off
      // the field to remove. No swap/sub semantics — they're just tokens.
      if (info.type === 'opp-marker') {
        if (!pt || !pt.inside) setOppMarkers(m => m.filter(o => o.id !== info.id))
        else setOppMarkers(m => m.map(o => o.id === info.id ? { ...o, x: pt.x, y: pt.y } : o))
        return
      }
      if (info.type === 'opp-pool') {
        if (pt && pt.inside) setOppMarkers(m => [...m, { id: uid(), x: pt.x, y: pt.y }])
        return
      }

      if (!pt || !pt.inside) {
        if (info.type === 'field') sendToBenchRef.current(info.id)
        return
      }
      const target = nearestSlot(slotsRef.current, pt.x, pt.y, info.type === 'field' ? info.id : undefined)
      handleDropAtRef.current(info.type, info.id, pt.x, pt.y, target?.posId ?? null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const beginDrag = (type: DragKind, id: string, e: React.PointerEvent) => {
    if (readOnly || (type === 'bench' && redCardedIds.has(id))) return
    dragInfoRef.current = { type, id }
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleFieldClick = (posId: string) => {
    if (suppressClickRef.current || readOnly) return
    const slot = slots.find(s => s.posId === posId)!
    if (selected?.type === 'bench') {
      doSub(selected.playerId, posId)
    } else if (selected?.type === 'field') {
      if (selected.posId === posId) { setSelected(null); return }
      const aId = slots.find(s => s.posId === selected.posId)?.playerId ?? null
      const bId = slot.playerId
      setSlots(sl => sl.map(s => {
        if (s.posId === selected.posId) return { ...s, playerId: bId }
        if (s.posId === posId) return { ...s, playerId: aId }
        return s
      }))
      setSelected(null)
    } else if (selected?.type === 'opp-pool') {
      setOppMarkers(m => [...m, { id: uid(), x: slot.x, y: slot.y }])
      setSelected(null)
    } else if (selected?.type === 'opp-marker') {
      const id = selected.id
      setOppMarkers(m => m.map(o => o.id === id ? { ...o, x: slot.x, y: slot.y } : o))
      setSelected(null)
    } else {
      setSelected({ type: 'field', posId })
      setGameTab('bank')
    }
  }

  const handleBenchClick = (playerId: string) => {
    if (suppressClickRef.current || readOnly || redCardedIds.has(playerId)) return
    if (selected?.type === 'field') {
      doSub(playerId, selected.posId)
    } else if (selected?.type === 'bench' && selected.playerId === playerId) {
      setSelected(null)
    } else {
      setSelected({ type: 'bench', playerId })
    }
  }

  // Tap-to-place fallback for opponent tokens, mirroring how bench players
  // can be either dragged or click-selected-then-placed.
  const handleOppPoolClick = () => {
    if (suppressClickRef.current || readOnly) return
    setSelected(sel => (sel?.type === 'opp-pool' ? null : { type: 'opp-pool' }))
  }

  const handleOppMarkerClick = (id: string) => {
    if (suppressClickRef.current || readOnly) return
    setSelected(sel => (sel?.type === 'opp-marker' && sel.id === id ? null : { type: 'opp-marker', id }))
  }

  const removeOppMarker = (id: string) => {
    if (readOnly) return
    setOppMarkers(m => m.filter(o => o.id !== id))
    setSelected(null)
  }

  // Dropped anywhere on the field: land near another marker to swap/sub, or on
  // open grass to freely place/reposition (drag-and-drop everywhere on the field).
  const handleDropAt = (dragType: 'field' | 'bench', dragId: string, x: number, y: number, nearestPosId: string | null) => {
    if (nearestPosId) {
      if (dragType === 'bench') doSub(dragId, nearestPosId)
      else if (dragId !== nearestPosId) swapField(dragId, nearestPosId)
      return
    }
    if (dragType === 'field') {
      movePosition(dragId, x, y)
    } else {
      const empty = slots.find(s => !s.playerId)
      if (empty) { doSub(dragId, empty.posId); movePosition(empty.posId, x, y) }
    }
  }
  handleDropAtRef.current = handleDropAt

  // Click-based equivalent of handleDropAt, for clicking empty grass while something is selected.
  const handleBackgroundClick = (x: number, y: number) => {
    if (suppressClickRef.current || readOnly) return
    if (!selected) return
    // Opponent tokens are freeform — they never snap to/swap with own slots.
    if (selected.type === 'opp-pool') {
      setOppMarkers(m => [...m, { id: uid(), x, y }])
      setSelected(null)
      return
    }
    if (selected.type === 'opp-marker') {
      const id = selected.id
      setOppMarkers(m => m.map(o => o.id === id ? { ...o, x, y } : o))
      setSelected(null)
      return
    }
    const target = nearestSlot(slots, x, y, selected.type === 'field' ? selected.posId : undefined)
    if (target) { handleFieldClick(target.posId); return }
    if (selected.type === 'field') {
      movePosition(selected.posId, x, y)
      setSelected(null)
    } else {
      const empty = slots.find(s => !s.playerId)
      if (empty) { doSub(selected.playerId, empty.posId); movePosition(empty.posId, x, y) }
    }
  }

  const benchPlayers = bench
    .map(b => ({ ...b, player: getPlayer(b.playerId) }))
    .filter(b => b.player) as (BenchEntry & { player: Player })[]

  const onFieldCount = slots.filter(s => s.playerId).length
  const targetCount = AGE_CONFIG[ageGroup].total
  const oppAvailable = Math.max(0, AGE_CONFIG[ageGroup].total - oppMarkers.length)
  const selectedFieldPos = selected?.type === 'field' ? selected.posId : null
  const selectedFieldPlayer = selectedFieldPos ? getPlayer(slots.find(s => s.posId === selectedFieldPos)?.playerId ?? null) : null

  // Uploads go straight from the browser to Vercel Blob storage (not through
  // this function, which would hit the ~4.5MB serverless body-size limit) —
  // /api/blob/upload only hands out a short-lived authorization token.
  const handleMediaUpload = async (files: FileList | null) => {
    if (readOnly || !files || files.length === 0) return
    if (!user) {
      alert('Log in met Google om media te uploaden (zie Profiel rechtsboven op het startscherm).')
      return
    }
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await uploadToBlob(`games/${initial?.id ?? uid()}/${uid()}-${file.name}`, file, {
          access: 'private',
          handleUploadUrl: '/api/blob/upload',
        })
        setMedia(m => [...m, { id: uid(), url: blob.url, type: file.type.startsWith('video') ? 'video' : 'image', name: file.name }])
      }
    } catch (err) {
      alert('Uploaden mislukt: ' + (err instanceof Error ? err.message : 'onbekende fout'))
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteMedia = async (item: MediaItem): Promise<boolean> => {
    if (readOnly) return false
    if (!confirm(`"${item.name}" verwijderen?`)) return false
    try {
      const res = await fetch('/api/blob/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setMedia(m => m.filter(x => x.id !== item.id))
      return true
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Verwijderen mislukt')
      return false
    }
  }

  const buildSnapshot = (): SavedGame => ({
    id: gameId,
    date: gameDate,
    club, team, ageGroup, opponent, homeAway, squad, slots, subs, oppMarkers, goals, cards, tacticsBoards, playedSeconds, media, notes, result,
    scoreOwn, scoreOpp,
    finalTime: gameSec,
    currentPeriod, periodStartSec,
    ownerId: initial?.ownerId ?? user!.id,
    permission: initial?.permission ?? 'owner',
  })

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--brand-eef3ff)' }}
      onClick={() => setSelected(null)}>

      {/* Header — just the identity: crests flank the score, made bigger/more
          present now that navigation (back) and clock/period/play controls
          live in rails either side of the body instead of crowding this bar. */}
      <div className="shrink-0 text-white" style={{ background: 'var(--brand-0d2b7a)' }}>
        <div className="flex items-center justify-center gap-2.5 px-3 py-3 relative">
          <ClubLogo club={club} size={38} />
          <span className="font-mono font-bold text-2xl tabular-nums px-1">{scoreOwn} - {scoreOpp}</span>
          <ClubLogo club={matchKnhbClub(opponent)} size={38} />
          <button onClick={e => { e.stopPropagation(); setShowSettings(true) }} aria-label="Notities en instellingen"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--brand-7b9de0)' }}>
            <IconMore size={20} />
          </button>
        </div>
      </div>

      {/* Body — a persistent rail either side (back on the left, clock/period/
          play/herstel on the right) framing the scrollable tab content. */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col items-center pt-3 shrink-0" style={{ width: '48px' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { flushSave(); onBack() }} aria-label="Terug"
            className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
            <IconChevronLeft size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" onClick={e => e.stopPropagation()}>
        {gameTab === 'wedstrijd' && (
          <div className="flex flex-col items-center p-3">
            <div className="flex items-center justify-between w-full mb-2 gap-2"
              style={{ maxWidth: isDual ? '820px' : '460px' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold shrink-0" style={{ color: 'var(--brand-6b82b8)' }}>
                  Op veld:&nbsp;
                  <span style={{ color: onFieldCount < targetCount ? '#DC2626' : '#16A34A' }}>
                    {onFieldCount}/{targetCount}
                  </span>
                </span>
                {!readOnly && formationVariants.length > 1 && (
                  <select value={variantId} onChange={e => switchFormation(e.target.value)}
                    className="text-xs font-semibold rounded-lg px-1.5 py-1 min-w-0"
                    style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: 'var(--brand-1a3fab)', outline: 'none' }}>
                    {formationVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
              </div>
              {selected ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--brand-dbeafe)', color: 'var(--brand-1a3fab)' }}>
                  {selected.type === 'bench'
                    ? `Kies positie voor ${getPlayer(selected.playerId)?.name.split(' ')[0]}`
                    : selected.type === 'opp-pool' || selected.type === 'opp-marker'
                      ? 'Tik op het veld om de tegenstander te plaatsen'
                      : selectedFieldPlayer ? `${selectedFieldPlayer.name.split(' ')[0]} geselecteerd` : 'Positie geselecteerd'}
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--brand-a8bef0)' }}>Sleep of klik om te wisselen</span>
              )}
            </div>

            <div className="flex items-center justify-center w-full" style={{ maxWidth: isDual ? '820px' : '460px' }}>
              <FieldView
                ageGroup={ageGroup}
                slots={slots}
                squad={squad}
                oppMarkers={oppMarkers}
                selected={selected}
                dragOverPos={dragOverPos}
                dragPreview={dragPreview}
                fieldRef={fieldRef}
                onFieldClick={handleFieldClick}
                onBackgroundClick={handleBackgroundClick}
                onMarkerPointerDown={(posId, e) => beginDrag('field', posId, e)}
                onOppMarkerPointerDown={(id, e) => beginDrag('opp-marker', id, e)}
                onOppMarkerClick={handleOppMarkerClick}
              />
            </div>

            {!user && (
              <p className="text-xs text-center mt-2" style={{ color: 'var(--brand-a8bef0)' }}>
                Log in om deze wedstrijd te kunnen opslaan.
              </p>
            )}

            {selectedFieldPos && (
              <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                {slots.find(s => s.posId === selectedFieldPos)?.playerId && (
                  <button onClick={() => sendToBench(selectedFieldPos)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: '#4B5563' }}>
                    → Bank
                  </button>
                )}
                <button onClick={() => setSelected(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}>
                  Annuleer
                </button>
              </div>
            )}

            {selected?.type === 'opp-marker' && (
              <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => removeOppMarker(selected.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: '#4B5563' }}>
                  Verwijder
                </button>
                <button onClick={() => setSelected(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}>
                  Annuleer
                </button>
              </div>
            )}

            {/* Opponent marker pool lives here (not Bank) — it's about the live
                pitch picture, not the coach's own roster rotation. */}
            <div className="w-full mt-4 pt-3" style={{ maxWidth: isDual ? '820px' : '460px', borderTop: '1px solid var(--brand-d0dcfa)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                  Tegenstander ({oppAvailable} beschikbaar)
                </span>
                {oppMarkers.length > 0 && !readOnly && (
                  <button onClick={() => setOppMarkers([])} className="text-xs font-bold" style={{ color: '#DC2626' }}>
                    Wis
                  </button>
                )}
              </div>
              <p className="text-xs mb-2" style={{ color: selected?.type === 'opp-pool' ? 'var(--brand-1a3fab)' : 'var(--brand-a8bef0)' }}>
                {selected?.type === 'opp-pool'
                  ? 'Tik op het veld om te plaatsen…'
                  : 'Sleep naar het veld, of tik en tik daarna op het veld.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: oppAvailable }).map((_, i) => (
                  <div key={i}
                    className="w-8 h-8 rounded-full cursor-grab touch-none select-none shrink-0"
                    style={{
                      background: '#DC2626',
                      border: selected?.type === 'opp-pool' ? '2.5px solid var(--brand-1a3fab)' : '2px solid #fff',
                      boxShadow: selected?.type === 'opp-pool' ? '0 0 0 3px rgba(26,63,171,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
                    }}
                    onPointerDown={e => beginDrag('opp-pool', 'new', e)}
                    onClick={handleOppPoolClick} />
                ))}
              </div>
            </div>
          </div>
        )}

        {gameTab === 'bank' && (
          <div className="p-3">
            <div className="flex gap-2 mb-4 mx-auto" style={{ maxWidth: '280px' }}>
              {(['field', 'list'] as const).map(v => (
                <button key={v} onClick={() => setBankView(v)}
                  className="flex-1 py-2 rounded-full text-xs font-bold uppercase transition-colors"
                  style={bankView === v
                    ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                    : { background: '#fff', color: 'var(--brand-3b5299)', border: '1px solid var(--brand-d0dcfa)' }}>
                  {v === 'field' ? 'Veld' : 'Lijst'}
                </button>
              ))}
            </div>

            {bankView === 'field' ? (
              <div className="flex items-center justify-center w-full mb-4 mx-auto" style={{ maxWidth: isDual ? '600px' : '330px' }}>
                <FieldView
                  ageGroup={ageGroup}
                  slots={slots}
                  squad={squad}
                  oppMarkers={oppMarkers}
                  selected={selected}
                  dragOverPos={dragOverPos}
                  dragPreview={dragPreview}
                  fieldRef={fieldRef}
                  onFieldClick={handleFieldClick}
                  onBackgroundClick={handleBackgroundClick}
                  onMarkerPointerDown={(posId, e) => beginDrag('field', posId, e)}
                  onOppMarkerPointerDown={(id, e) => beginDrag('opp-marker', id, e)}
                  onOppMarkerClick={handleOppMarkerClick}
                />
              </div>
            ) : (
              <div className="space-y-1.5 mb-4 mx-auto" style={{ maxWidth: '420px' }}>
                {slots.filter(s => s.playerId).length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Nog niemand op het veld</p>
                ) : (
                  slots.filter(s => s.playerId).map(s => {
                    const p = getPlayer(s.playerId)
                    if (!p) return null
                    return (
                      <div key={s.posId} className="flex items-center gap-2.5 p-2.5 rounded-xl"
                        style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                        <span className="text-xs font-bold w-9 shrink-0 text-center" style={{ color: 'var(--brand-1a3fab)' }}>{s.label}</span>
                        <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--brand-1a2f6b)' }}>
                          {p.number != null ? `#${p.number} ` : ''}{p.name}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            <div className="mx-auto" style={{ maxWidth: '420px' }}>
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                Bank ({benchPlayers.length})
              </span>
              {benchPlayers.length === 0 ? (
                <div className="text-xs text-center py-6 rounded-xl border-2 border-dashed mt-2"
                  style={{ color: 'var(--brand-a8bef0)', borderColor: 'var(--brand-d0dcfa)' }}>
                  Alle spelers staan op het veld
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto mt-2 pb-1">
                  {[...benchPlayers].sort((a, b) => (a.player.number ?? Infinity) - (b.player.number ?? Infinity) || a.player.name.localeCompare(b.player.name)).map(({ playerId, sinceGameSec, player }) => {
                    const elapsed = Math.max(0, gameSec - sinceGameSec)
                    const isSel = selected?.type === 'bench' && selected.playerId === playerId
                    const isBeingDragged = dragPreview?.type === 'bench' && dragPreview.id === playerId
                    const isRedCarded = redCardedIds.has(playerId)
                    return (
                      <div key={playerId}
                        className={`flex flex-col items-center gap-1 shrink-0 w-16 touch-none select-none ${isRedCarded ? 'cursor-not-allowed' : 'cursor-grab'}`}
                        style={{ opacity: isBeingDragged ? 0.35 : isRedCarded ? 0.6 : 1 }}
                        onPointerDown={e => beginDrag('bench', playerId, e)}
                        onClick={() => handleBenchClick(playerId)}>
                        <div className="relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                          style={{ background: 'var(--brand-1a3fab)', border: isSel ? '2.5px solid var(--brand-0d2b7a)' : '2px solid transparent' }}>
                          {player.photoUrl ? (
                            <img src={mediaSrc(player.photoUrl)} alt={player.name} className="w-full h-full object-cover" />
                          ) : (
                            player.number ?? initials(player.name)
                          )}
                          {isRedCarded && (
                            <span className="absolute bottom-0 right-0 inline-block w-2.5 h-3.5 rounded-sm" style={{ background: '#DC2626' }} title="Rode kaart — kan niet meer meedoen" />
                          )}
                        </div>
                        <span className="text-xs font-semibold truncate w-full text-center" style={{ color: 'var(--brand-1a2f6b)' }}>{firstName(player.name)}</span>
                        <span className="font-mono text-[10px] font-bold"
                          style={{ color: gameSec > 0 ? benchColor(elapsed) : 'var(--brand-a8bef0)' }}>
                          {gameSec > 0 ? fmtSec(elapsed) : '—:—'}
                        </span>
                        {isSel && <span className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>↔</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 mx-auto" style={{ maxWidth: '420px', borderTop: '1px solid var(--brand-e8effd)' }}>
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                Wissels ({subs.length})
              </span>
              {subs.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Nog geen wissels</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {subs.map((s, i) => {
                    const pIn = getPlayer(s.playerInId)
                    const pOut = getPlayer(s.playerOutId)
                    return (
                      <div key={i} className="py-2.5 rounded-xl px-3"
                        style={{ background: 'var(--brand-f0f5ff)', border: '1px solid var(--brand-e4ecfe)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand-7b90c8)' }}>{fmtSec(s.gameTimeSec)}</span>
                          {s.posLabel && (
                            <span className="text-xs font-bold px-1.5 rounded" style={{ color: 'var(--brand-1a3fab)', background: 'var(--brand-e4ecfe)' }}>{s.posLabel}</span>
                          )}
                        </div>
                        <div className="text-xs font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.number ? `#${pIn.number} ` : ''}{pIn?.name}</div>
                        <div className="text-xs font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.number ? `#${pOut.number} ` : ''}{pOut?.name}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 mx-auto" style={{ maxWidth: '420px', borderTop: '1px solid var(--brand-e8effd)' }}>
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                Speeltijd
              </span>
              <div className="space-y-1 mt-2">
                {sortPlayers(squad).map(p => {
                  const onField = slots.some(s => s.playerId === p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                      style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                      <span style={{ color: 'var(--brand-1a2f6b)' }}>
                        {onField && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: '#16A34A' }} />}
                        {p.number ? `#${p.number} ` : ''}{p.name}
                      </span>
                      <span className="font-mono font-bold" style={{ color: 'var(--brand-3b5299)' }}>{fmtSec(playedSeconds[p.id] ?? 0)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {gameTab === 'score' && (
          <div className="p-3 space-y-3 mx-auto" style={{ maxWidth: '420px' }}>
            <div>
              <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Scorebord</label>
              <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)' }}>
                <div className="flex-1 text-center min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--brand-6b82b8)' }}>{team || 'Eigen team'}</div>
                  <div className="flex items-center justify-center gap-2.5 mt-1">
                    <button onClick={() => setScoreOwn(s => Math.max(0, s - 1))} disabled={readOnly}
                      className="w-7 h-7 rounded-lg font-bold text-sm disabled:opacity-50" style={{ background: 'var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}>−</button>
                    <span className="font-mono font-bold text-xl w-6 text-center" style={{ color: 'var(--brand-1a2f6b)' }}>{scoreOwn}</span>
                    <button onClick={() => setScoreOwn(s => s + 1)} disabled={readOnly}
                      className="w-7 h-7 rounded-lg font-bold text-sm text-white disabled:opacity-50" style={{ background: 'var(--brand-1a3fab)' }}>+</button>
                  </div>
                </div>
                <div className="font-bold text-sm shrink-0" style={{ color: 'var(--brand-a8bef0)' }}>–</div>
                <div className="flex-1 text-center min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--brand-6b82b8)' }}>{opponent || 'Tegenstander'}</div>
                  <div className="flex items-center justify-center gap-2.5 mt-1">
                    <button onClick={() => setScoreOpp(s => Math.max(0, s - 1))} disabled={readOnly}
                      className="w-7 h-7 rounded-lg font-bold text-sm disabled:opacity-50" style={{ background: 'var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}>−</button>
                    <span className="font-mono font-bold text-xl w-6 text-center" style={{ color: 'var(--brand-1a2f6b)' }}>{scoreOpp}</span>
                    <button onClick={() => setScoreOpp(s => s + 1)} disabled={readOnly}
                      className="w-7 h-7 rounded-lg font-bold text-sm text-white disabled:opacity-50" style={{ background: 'var(--brand-1a3fab)' }}>+</button>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Doelpuntenmakers</label>
              <div className="flex gap-2">
                <select className="flex-1 rounded-xl px-3 py-2 text-sm" disabled={readOnly}
                  style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: goalPlayerId ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)', outline: 'none' }}
                  value={goalPlayerId} onChange={e => setGoalPlayerId(e.target.value)}>
                  <option value="">Kies speler…</option>
                  {sortPlayers(squad).map(p => (
                    <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
                  ))}
                </select>
                <button onClick={() => {
                  if (readOnly || !goalPlayerId) return
                  setGoals(g => [...g, { id: uid(), playerId: goalPlayerId, gameTimeSec: gameSec }])
                }}
                  disabled={readOnly}
                  className="px-4 py-2 rounded-xl font-bold text-white text-lg shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--brand-1a3fab)' }}>
                  +
                </button>
              </div>
              {goals.length > 0 && (
                <div className="mt-2 space-y-1">
                  {goals.map(g => {
                    const p = getPlayer(g.playerId)
                    return (
                      <div key={g.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                        <span style={{ color: 'var(--brand-1a2f6b)' }}><HockeyBallIcon /> {p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : 'Onbekende speler'}</span>
                        {!readOnly && (
                          <button onClick={() => setGoals(gs => gs.filter(x => x.id !== g.id))}
                            className="font-bold" style={{ color: '#DC2626' }}>
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-xs mt-1.5" style={{ color: goals.length === scoreOwn ? 'var(--brand-7b90c8)' : '#D97706' }}>
                {goals.length} van de {scoreOwn} doelpunten toegewezen
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Kaarten</label>
              <select className="w-full rounded-xl px-3 py-2 text-sm" disabled={readOnly}
                style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: cardPlayerId ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)', outline: 'none' }}
                value={cardPlayerId} onChange={e => setCardPlayerId(e.target.value)}>
                <option value="">Kies speler…</option>
                {sortPlayers(squad).map(p => (
                  <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
                ))}
              </select>
              <div className="flex gap-2 mt-2">
                {(['green', 'yellow', 'red'] as const).map(c => (
                  <button key={c} onClick={() => setCardColor(c)} disabled={readOnly}
                    className="flex-1 h-8 rounded-lg disabled:opacity-50"
                    style={{
                      background: c === 'green' ? '#16A34A' : c === 'yellow' ? '#EAB308' : '#DC2626',
                      border: cardColor === c ? '2px solid var(--brand-1a2f6b)' : '2px solid transparent',
                    }}
                    aria-label={c} />
                ))}
                <button onClick={() => {
                  if (readOnly || !cardPlayerId) return
                  setCards(c => [...c, { id: uid(), playerId: cardPlayerId, color: cardColor, gameTimeSec: gameSec }])
                  // A red card ends the player's match — take them off the
                  // field immediately rather than leaving it to be noticed
                  // (and enforced) only the next time someone tries to sub
                  // them back in.
                  if (cardColor === 'red') {
                    const onFieldSlot = slots.find(s => s.playerId === cardPlayerId)
                    if (onFieldSlot) sendToBench(onFieldSlot.posId)
                  }
                }}
                  disabled={readOnly}
                  className="px-4 py-1 rounded-xl font-bold text-white text-lg shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--brand-1a3fab)' }}>
                  +
                </button>
              </div>
              {cards.length > 0 && (
                <div className="mt-2 space-y-1">
                  {cards.map(c => {
                    const p = getPlayer(c.playerId)
                    return (
                      <div key={c.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                        <span style={{ color: 'var(--brand-1a2f6b)' }}>
                          <span className="inline-block w-3 h-4 rounded-sm mr-1.5 align-middle"
                            style={{ background: c.color === 'green' ? '#16A34A' : c.color === 'yellow' ? '#EAB308' : '#DC2626' }} />
                          {p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : 'Onbekende speler'}
                        </span>
                        {!readOnly && (
                          <button onClick={() => setCards(cs => cs.filter(x => x.id !== c.id))}
                            className="font-bold" style={{ color: '#DC2626' }}>
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {gameTab === 'tactiek' && (
          <div className="p-3">
            <div className="flex items-center justify-center w-full mb-3 mx-auto" style={{ maxWidth: isDual ? '600px' : '330px' }}>
              <TacticsFieldEditor
                isDual={isDual}
                slots={slots}
                squad={squad}
                oppMarkers={oppMarkers}
                board={activeBoard}
                tool={tacticsTool}
                selectedMarker={selectedTacticsMarker}
                fieldRef={fieldRef}
                selected={selected}
                dragOverPos={dragOverPos}
                dragPreview={dragPreview}
                onFieldClick={handleTacticsBoardBackgroundClick}
                onMarkerClick={handleTacticsMarkerClick}
                onMarkerMove={handleTacticsMarkerMove}
                onArrowDrawn={handleTacticsArrowDrawn}
                onSquadSlotClick={handleFieldClick}
                onSquadMarkerPointerDown={(posId, e) => beginDrag('field', posId, e)}
                onOppMarkerPointerDown={(id, e) => beginDrag('opp-marker', id, e)}
                onOppMarkerClick={handleOppMarkerClick}
              />
            </div>

            <div className="space-y-3 mx-auto" style={{ maxWidth: '420px' }}>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Opstellingen</label>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <button onClick={() => addBoard(false)} className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>
                        + Opstelling
                      </button>
                      <button onClick={() => addBoard(true)} className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>
                        + Strafcorner
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tacticsBoards.map(b => (
                    <div key={b.id} className="flex items-center gap-1">
                      <button onClick={() => { setActiveBoardId(b.id); setSelectedTacticsMarker(null); setTacticsPlayerId('') }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                        style={b.id === activeBoardId
                          ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                          : { background: 'var(--brand-f8faff)', color: 'var(--brand-3b5299)', border: '1px solid var(--brand-d0dcfa)' }}>
                        {b.name}
                      </button>
                      {!readOnly && tacticsBoards.length > 1 && (
                        <button onClick={() => { if (confirm(`"${b.name}" verwijderen?`)) deleteBoard(b.id) }}
                          className="font-bold text-xs" style={{ color: '#DC2626' }}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {!readOnly && (
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Gereedschap</label>
                  <div className="flex gap-2">
                    {([
                      { key: 'select', label: 'Selecteer' },
                      { key: 'marker', label: '+ Speler' },
                      { key: 'arrow', label: '+ Pijl' },
                    ] as const).map(t => (
                      <button key={t.key} onClick={() => { setTacticsTool(t.key); setSelectedTacticsMarker(null); setTacticsPlayerId('') }}
                        className="flex-1 py-2 rounded-lg text-xs font-bold"
                        style={tacticsTool === t.key
                          ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                          : { background: 'var(--brand-f8faff)', color: 'var(--brand-3b5299)', border: '1px solid var(--brand-d0dcfa)' }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {tacticsTool === 'marker' ? (
                    <div className="mt-2">
                      <select className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: tacticsPlayerId ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)', outline: 'none' }}
                        value={tacticsPlayerId} onChange={e => setTacticsPlayerId(e.target.value)}>
                        <option value="">Kies speler…</option>
                        {sortPlayers(squad.filter(p => !activeBoard.markers.some(m => m.playerId === p.id))).map(p => (
                          <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
                        ))}
                      </select>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--brand-a8bef0)' }}>
                        {tacticsPlayerId ? 'Tik op het veld om te plaatsen.' : 'Kies eerst een speler.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--brand-a8bef0)' }}>
                      {tacticsTool === 'arrow'
                        ? 'Sleep op het veld om een pijl te tekenen.'
                        : 'Tik een speler, tik daarna waar die naartoe moet.'}
                    </p>
                  )}
                </div>
              )}

              {selectedTacticsMarker && !readOnly && (
                <button onClick={() => removeTacticsMarker(selectedTacticsMarker)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                  Verwijder geselecteerde speler
                </button>
              )}

              {activeBoard.arrows.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.1em' }}>Pijlen</label>
                  <div className="space-y-1">
                    {activeBoard.arrows.map((a, i) => (
                      <div key={a.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                        <span style={{ color: 'var(--brand-1a2f6b)' }}>Pijl {i + 1}</span>
                        {!readOnly && (
                          <button onClick={() => removeTacticsArrow(a.id)} className="font-bold" style={{ color: '#DC2626' }}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!readOnly && (activeBoard.markers.length > 0 || activeBoard.arrows.length > 0) && (
                <button onClick={() => { if (confirm('Alles op deze opstelling wissen?')) clearBoard() }}
                  className="text-xs font-bold" style={{ color: '#DC2626' }}>
                  Wis opstelling
                </button>
              )}
            </div>
          </div>
        )}

        {gameTab === 'media' && (
          <div className="p-3 space-y-3 mx-auto" style={{ maxWidth: '480px' }}>
            {!readOnly && (
              <input ref={mediaFileInputRef} type="file" accept="image/*,video/*" multiple
                className="hidden" onChange={e => { handleMediaUpload(e.target.files); e.target.value = '' }} />
            )}
            {readOnly && media.length === 0 ? (
              <div className="text-xs text-center py-8 rounded-xl border-2 border-dashed"
                style={{ color: 'var(--brand-a8bef0)', borderColor: 'var(--brand-d0dcfa)' }}>
                Geen foto's of video's
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {!readOnly && (
                  <button onClick={() => mediaFileInputRef.current?.click()} disabled={uploading}
                    className="flex flex-col items-center justify-center gap-1 h-24 rounded-xl border-2 border-dashed disabled:opacity-50"
                    style={{ borderColor: 'var(--brand-d0dcfa)', color: 'var(--brand-7b90c8)' }}>
                    <span className="text-2xl leading-none font-bold">+</span>
                    <span className="text-xs font-bold">{uploading ? 'Uploaden…' : 'Toevoegen'}</span>
                  </button>
                )}
                {media.map(item => (
                  <button key={item.id} onClick={() => setPreviewMedia(item)}
                    className="relative rounded-xl overflow-hidden h-24" style={{ border: '1px solid var(--brand-d0dcfa)', background: 'var(--brand-0d2b7a)' }}>
                    {item.type === 'image' ? (
                      <img src={mediaSrc(item.url)} alt={item.name} className="w-full h-24 object-cover" />
                    ) : (
                      <video src={mediaSrc(item.url)} className="w-full h-24 object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

        <div className="flex flex-col items-center gap-2 pt-3 shrink-0" style={{ width: '52px' }}
          onClick={e => e.stopPropagation()}>
          {!readOnly && (
            <button onClick={() => setRunning(r => !r)} aria-label={running ? 'Pauzeer' : 'Start'}
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: running ? '#D97706' : '#16A34A', color: '#fff' }}>
              {running ? <IconPause size={17} /> : <IconPlay size={17} />}
            </button>
          )}
          {!readOnly && currentPeriod > 1 && (
            <button onClick={() => regressPeriod()}
              aria-label={`Vorige ${periodLabel.toLowerCase()}`} title={`Vorige ${periodLabel.toLowerCase()}`}
              className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
              <IconSkipBack size={16} />
            </button>
          )}
          <div className="flex flex-col items-center leading-none py-1">
            <div className="font-mono font-bold text-sm tabular-nums" style={{ color: remainingInPeriod === 0 ? '#DC2626' : 'var(--brand-1a2f6b)' }}>
              {fmtSec(remainingInPeriod)}
            </div>
            <div className="text-[8px] font-bold uppercase tracking-wide mt-0.5 text-center" style={{ color: 'var(--brand-7b90c8)' }}>
              {periodLabel}<br />{currentPeriod}/{totalPeriods}
            </div>
          </div>
          {!readOnly && currentPeriod < totalPeriods && (
            <button onClick={() => advancePeriod()}
              aria-label={`Volgende ${periodLabel.toLowerCase()}`} title={`Volgende ${periodLabel.toLowerCase()}`}
              className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
              <IconSkipForward size={16} />
            </button>
          )}
          {!readOnly && (
            <button onClick={() => herstel()} disabled={historyLen === 0}
              aria-label="Herstel" title="Herstel"
              className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
              <IconUndo size={17} />
            </button>
          )}
          {readOnly && (
            <span className="text-[9px] font-bold text-center px-1" style={{ color: 'var(--brand-a8bef0)' }}>
              Alleen-lezen
            </span>
          )}
        </div>
      </div>

      {/* Bottom tab bar — replaces the old side panel */}
      <div className="shrink-0 shadow-lg" style={{ background: 'var(--brand-0d2b7a)' }} onClick={e => e.stopPropagation()}>
        <div className="grid grid-cols-5 mx-auto" style={{ maxWidth: '380px' }}>
          {([
            ['wedstrijd', 'Wedstrijd'],
            ['bank', 'Bank'],
            ['score', 'Score'],
            ['tactiek', 'Tactiek'],
            ['media', 'Media'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setGameTab(key)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold"
              style={{ color: gameTab === key ? '#fff' : 'var(--brand-7b9de0)' }}>
              <span className="relative w-8 h-7 rounded-full flex items-center justify-center transition-colors"
                style={{ background: gameTab === key ? 'var(--brand-1a3fab)' : 'transparent' }}>
                {key === 'wedstrijd' && <IconPitch size={19} />}
                {key === 'bank' && <IconSwap size={19} />}
                {key === 'score' && <IconGoal size={19} />}
                {key === 'tactiek' && <IconTactics size={19} />}
                {key === 'media' && <IconCamera size={19} />}
                {key === 'bank' && benchPlayers.length > 0 && (
                  <span className="absolute -top-1 -right-1.5 text-[9px] font-bold rounded-full px-1 text-white leading-tight" style={{ background: '#DC2626' }}>
                    {benchPlayers.length}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Settings sheet — notes + reset, moved out of the old catch-all Score tab */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(13,20,43,0.5)' }}
          onClick={() => setShowSettings(false)}>
          <div className="w-full bg-white rounded-t-2xl p-4 space-y-3" style={{ maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>Notities</h3>
              <button onClick={() => setShowSettings(false)} className="text-2xl leading-none px-2" style={{ color: 'var(--brand-a8bef0)' }}>×</button>
            </div>
            <textarea className="w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', color: 'var(--brand-1a2f6b)', outline: 'none' }}
              rows={8} value={notes} onChange={e => setNotes(e.target.value)} readOnly={readOnly}
              placeholder="Tactische notities, bijzonderheden…" />
            {!readOnly && canReset && (
              <div className="pt-2" style={{ borderTop: '1px solid var(--brand-e8effd)' }}>
                <button onClick={resetGame}
                  className="w-full px-4 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  Wedstrijd resetten
                </button>
                <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--brand-7b90c8)' }}>
                  Zet score, opstelling, doelpunten, kaarten en klok terug naar het begin.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(13,20,43,0.85)' }}
          onClick={() => setPreviewMedia(null)}>
          <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
            {previewMedia.type === 'image' ? (
              <img src={mediaSrc(previewMedia.url)} alt={previewMedia.name}
                className="rounded-xl" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />
            ) : (
              <video src={mediaSrc(previewMedia.url)} controls autoPlay
                className="rounded-xl" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />
            )}
            {!readOnly && (
              <button onClick={async () => { if (await handleDeleteMedia(previewMedia)) setPreviewMedia(null) }}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center"
                style={{ background: '#DC2626', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                ×
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── History View ─────────────────────────────────────────────────────────────

// Shared between HistoryView's expand-in-place row and the "Match" tab of
// MatchDetailView — every section that isn't Stats/Line-up/Timeline lives
// here so the two surfaces can't drift out of sync.
function MatchDetailSections({ g, user, getPlayer, canManageSharing, shares, addShare, removeShare, onEdit, onDelete }: {
  g: SavedGame
  user: AuthUser | null
  getPlayer: (g: SavedGame, id: string) => Player | undefined
  canManageSharing: boolean
  shares: GameShare[]
  addShare: (email: string, permission: 'view' | 'edit') => Promise<{ ok: true } | { ok: false; error: string }>
  removeShare: (userId: string) => void
  onEdit: (game: SavedGame) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>
          Selectie ({g.squad.length})
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {sortPlayers(g.squad).map(p => (
            <span key={p.id} className="text-xs px-2 py-1 rounded-lg font-medium"
              style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a2f6b)', border: '1px solid var(--brand-d0dcfa)' }}>
              {p.number != null && <span className="font-mono font-bold" style={{ color: 'var(--brand-1a3fab)' }}>#{p.number} </span>}{p.name}
            </span>
          ))}
        </div>
      </div>

      {g.subs.length > 0 && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Wissels</h4>
          <div className="space-y-1">
            {g.subs.map((s, i) => {
              const pIn = getPlayer(g, s.playerInId)
              const pOut = getPlayer(g, s.playerOutId)
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold w-10 shrink-0" style={{ color: 'var(--brand-7b90c8)' }}>{fmtSec(s.gameTimeSec)}</span>
                  {s.posLabel && (
                    <span className="text-xs font-bold px-1.5 rounded shrink-0" style={{ color: 'var(--brand-1a3fab)', background: 'var(--brand-e4ecfe)' }}>{s.posLabel}</span>
                  )}
                  <span className="font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.name}</span>
                  <span className="font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {g.goals && g.goals.length > 0 && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Doelpunten</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(
              g.goals.reduce<Record<string, number>>((acc, goal) => {
                acc[goal.playerId] = (acc[goal.playerId] ?? 0) + 1
                return acc
              }, {})
            ).map(([playerId, count]) => {
              const p = getPlayer(g, playerId)
              return (
                <span key={playerId} className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a2f6b)', border: '1px solid var(--brand-d0dcfa)' }}>
                  <HockeyBallIcon /> {p?.name ?? 'Onbekende speler'}{count > 1 ? ` ×${count}` : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {g.cards && g.cards.length > 0 && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Kaarten</h4>
          <div className="flex flex-wrap gap-1.5">
            {g.cards.map(c => {
              const p = getPlayer(g, c.playerId)
              return (
                <span key={c.id} className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a2f6b)', border: '1px solid var(--brand-d0dcfa)' }}>
                  <span className="inline-block w-3 h-4 rounded-sm mr-1 align-middle"
                    style={{ background: c.color === 'green' ? '#16A34A' : c.color === 'yellow' ? '#EAB308' : '#DC2626' }} />
                  {p?.name ?? 'Onbekende speler'}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {g.playedSeconds && Object.keys(g.playedSeconds).length > 0 && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Speeltijd</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(g.playedSeconds)
              .map(([playerId, sec]) => ({ playerId, sec, player: getPlayer(g, playerId) }))
              .filter((x): x is { playerId: string; sec: number; player: Player } => !!x.player)
              .sort((a, b) => (a.player.number ?? Infinity) - (b.player.number ?? Infinity) || a.player.name.localeCompare(b.player.name))
              .map(x => (
                <span key={x.playerId} className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a2f6b)', border: '1px solid var(--brand-d0dcfa)' }}>
                  {x.player.name} <span style={{ color: 'var(--brand-3b5299)' }}>· {fmtSec(x.sec)}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {g.media && g.media.length > 0 && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Media</h4>
          <div className="grid grid-cols-4 gap-1.5">
            {g.media.map(item => (
              <a key={item.id} href={mediaSrc(item.url)} target="_blank" rel="noreferrer"
                className="block rounded-lg overflow-hidden" style={{ border: '1px solid var(--brand-d0dcfa)', background: 'var(--brand-0d2b7a)' }}>
                {item.type === 'image' ? (
                  <img src={mediaSrc(item.url)} alt={item.name} className="w-full h-16 object-cover" />
                ) : (
                  <video src={mediaSrc(item.url)} className="w-full h-16 object-cover" />
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {g.notes && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)' }}>Notities</h4>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--brand-3b4f7a)' }}>{g.notes}</p>
        </div>
      )}

      {canManageSharing && (
        <div>
          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: 'var(--brand-7b90c8)' }}>Delen</h4>
          <GameShareManager shares={shares} onAdd={addShare} onRemove={removeShare} />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => onEdit(g)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
          style={{ background: 'var(--brand-1a3fab)' }}>
          {(g.permission ?? 'owner') === 'view' ? 'Bekijken' : 'Bewerken'}
        </button>
        {(!g.ownerId || g.ownerId === user?.id) && (
          <button onClick={() => { if (confirm('Wedstrijd verwijderen?')) onDelete(g.id) }}
            className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
            Verwijder
          </button>
        )}
      </div>
    </div>
  )
}

function HistoryView({ games, user, authLoading, onDelete, onEdit, onProfile, onCreateMatch, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification }: {
  games: SavedGame[]
  user: AuthUser | null
  authLoading: boolean
  onDelete: (id: string) => void
  onEdit: (game: SavedGame) => void
  onProfile: () => void
  onCreateMatch: () => void
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'played'>('upcoming')
  const getPlayer = (g: SavedGame, id: string) => g.squad.find(p => p.id === id)

  const expandedGame = games.find(g => g.id === expanded) ?? null
  const canManageSharing = !!expandedGame && (expandedGame.ownerId ?? user?.id) === user?.id
  const { shares, addShare, removeShare } = useGameShares(canManageSharing ? expanded : null)

  // A game is "played" once its clock has actually run — seeded fixtures and
  // freshly-scheduled manual matches start at finalTime 0 (even if a squad's
  // already been built for them), so that's a more reliable signal than the
  // date alone. Upcoming matches sort soonest-first; played ones keep the
  // existing newest-first order.
  const upcomingGames = games.filter(g => g.finalTime === 0).sort((a, b) => a.date.localeCompare(b.date))
  const playedGames = [...games.filter(g => g.finalTime > 0)].reverse()
  const filteredGames = filter === 'upcoming' ? upcomingGames : filter === 'played' ? playedGames : [...upcomingGames, ...playedGames]

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      {/* Header + filter/create bar stick together as one unit — only the
          match list below them scrolls. */}
      <div className="sticky top-0 z-20">
        <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white shadow-lg">
          <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <div className="flex items-center gap-3 justify-self-start">
              {user?.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
              <div>
                <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                  {user?.defaultClub ?? 'Hockey One'}
                </p>
                <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                  {user?.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <H1Logo height={26} />
            </div>
            <div className="flex items-center gap-2 justify-self-end">
              {user && (
                <NotificationBell
                  unreadNotifications={unreadNotifications}
                  notifications={notifications}
                  onMarkRead={onMarkRead}
                  onMarkAllRead={onMarkAllRead}
                  onMarkUnread={onMarkUnread}
                  onDelete={onDeleteNotification}
                  onOpenHistory={() => {}}
                />
              )}
              {!user && (
                <button onClick={onProfile} className="text-sm px-3 py-1.5 rounded-lg font-semibold"
                  style={{ color: 'var(--brand-a8bef0)', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
                  Inloggen
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="shadow-sm" style={{ background: 'var(--brand-eef3ff)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
            <div className="flex gap-1.5 flex-1">
              {([['all', 'Alles'], ['upcoming', 'Aankomend'], ['played', 'Gespeeld']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                  style={filter === key
                    ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                    : { background: '#fff', color: 'var(--brand-3b5299)', border: '1px solid var(--brand-d0dcfa)' }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={onCreateMatch}
              className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0 text-white"
              style={{ background: 'var(--brand-1a3fab)' }}>
              Wedstrijd aanmaken
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!authLoading && !user ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔒</div>
            <p className="font-display text-xl font-bold uppercase mb-3" style={{ color: 'var(--brand-a8bef0)' }}>Log in om je wedstrijden te zien</p>
            <button onClick={onProfile}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: 'var(--brand-1a3fab)' }}>
              Naar profiel →
            </button>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏑</div>
            <p className="font-display text-xl font-bold uppercase" style={{ color: 'var(--brand-a8bef0)' }}>Nog geen wedstrijden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGames.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--brand-a8bef0)' }}>
                {filter === 'upcoming' ? 'Geen aankomende wedstrijden' : 'Geen gespeelde wedstrijden'}
              </p>
            ) : (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y" style={{ border: '1px solid var(--brand-d0dcfa)', borderColor: 'var(--brand-d0dcfa)' }}>
                {filteredGames.map(renderGame)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  function renderGame(g: SavedGame) {
    return (
              <div key={g.id}>
                <button className="w-full text-left px-5 py-4"
                  onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>
                      {new Date(g.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-a8bef0)' }}>
                      {g.homeAway === 'Thuis' ? 'Thuis' : 'Uit'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap font-display text-base font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>
                      <ClubLogo club={g.club} size={22} />
                      <span>{g.club} {g.team}</span>
                      <span className="font-normal text-xs" style={{ color: 'var(--brand-a8bef0)' }}>vs</span>
                      <ClubLogo club={matchKnhbClub(g.opponent)} size={22} />
                      <span>{g.opponent}</span>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: 'var(--brand-c8d5f5)' }}>
                      {expanded === g.id ? '▲' : '▼'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    <span className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>{ageGroupLabel(g.ageGroup)}</span>
                    {typeof g.scoreOwn === 'number' && typeof g.scoreOpp === 'number' ? (
                      <span className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>{g.scoreOwn} - {g.scoreOpp}</span>
                    ) : g.result ? (
                      <span className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>{g.result}</span>
                    ) : null}
                    <span className="text-xs font-mono" style={{ color: 'var(--brand-a8bef0)' }}>{fmtSec(g.finalTime)}</span>
                    {g.ownerId && user && g.ownerId !== user.id && (
                      <span className="text-xs font-bold px-1.5 rounded" style={{ color: '#6D28D9', background: '#EDE9FE' }}>
                        {g.ownerId === 'hockey-one' ? 'Officiële wedstrijd' : 'Gedeeld'} · {g.permission === 'edit' ? 'Bewerken' : 'Bekijken'}
                      </span>
                    )}
                  </div>
                </button>

                {expanded === g.id && (
                  <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--brand-eef3ff)' }}>
                    <div className="pt-4">
                      <MatchDetailSections g={g} user={user} getPlayer={getPlayer}
                        canManageSharing={canManageSharing} shares={shares} addShare={addShare} removeShare={removeShare}
                        onEdit={onEdit} onDelete={onDelete} />
                    </div>
                  </div>
                )}
              </div>
    )
  }
}

// ── Match Detail View (Stats / Line-up / Timeline / Match) ──────────────────
// Opened from HomeView's "Laatste resultaat" card. Subs/cards are only ever
// recorded for the tracked team (there's no opponent roster), so their
// opponent side is shown as 0 rather than a real comparison.

function StatBar({ label, own, opp }: { label: string; own: number; opp: number }) {
  const total = Math.max(own + opp, 1)
  const ownPct = (own / total) * 100
  const oppPct = (opp / total) * 100

  return (
    <div>
      <div className="flex items-center justify-between text-sm font-bold mb-1.5">
        <span style={{ color: 'var(--brand-1a3fab)' }}>{own}</span>
        <span className="text-xs font-bold uppercase" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>{label}</span>
        <span style={{ color: 'var(--brand-7b90c8)' }}>{opp}</span>
      </div>
      <div className="flex w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--brand-eef3ff)' }}>
        <div style={{ width: `${ownPct}%`, background: 'var(--brand-1a3fab)' }} />
        <div style={{ width: `${oppPct}%`, background: 'var(--brand-a8bef0)' }} />
      </div>
    </div>
  )
}

function MatchStats({ game }: { game: SavedGame }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-5" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <ClubLogo club={game.club} size={40} />
          <span className="text-xs font-bold uppercase text-center truncate w-full" style={{ color: 'var(--brand-1a2f6b)' }}>{game.club} {game.team}</span>
        </div>
        <span className="text-xs font-bold uppercase px-2 shrink-0" style={{ color: 'var(--brand-a8bef0)' }}>vs</span>
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <ClubLogo club={matchKnhbClub(game.opponent)} size={40} />
          <span className="text-xs font-bold uppercase text-center truncate w-full" style={{ color: 'var(--brand-1a2f6b)' }}>{game.opponent}</span>
        </div>
      </div>

      <div className="space-y-4">
        <StatBar label="Doelpunten" own={game.scoreOwn} opp={game.scoreOpp} />
        <StatBar label="Wissels" own={game.subs.length} opp={0} />
        <StatBar label="Kaarten" own={game.cards.length} opp={0} />
      </div>
    </div>
  )
}

function MatchTimeline({ game, getPlayer }: { game: SavedGame; getPlayer: (id: string) => Player | undefined }) {
  const timed: { time: number; node: React.ReactNode }[] = []
  const untimed: React.ReactNode[] = []
  const untimedRow = "flex items-center gap-2 text-xs py-2"
  const untimedRowStyle = { borderBottom: '1px solid var(--brand-eef3ff)' }

  const timePill = (time: number) => (
    <span className="relative z-10 shrink-0 text-[11px] font-bold font-mono px-2 py-1 rounded-full text-white"
      style={{ background: 'var(--brand-1a3fab)' }}>
      {fmtSec(time)}
    </span>
  )

  // Every tracked goal/card/sub belongs to our own squad — there's no
  // opponent roster to attribute events to — so the whole timeline renders
  // on our side of the center spine; the opponent column stays empty rather
  // than showing fabricated events.
  const ownRow = (key: string, time: number, content: React.ReactNode) => (
    <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-2">
      <div className="text-right">{content}</div>
      {timePill(time)}
      <div />
    </div>
  )

  game.subs.forEach((s, i) => {
    const pIn = getPlayer(s.playerInId)
    const pOut = getPlayer(s.playerOutId)
    timed.push({
      time: s.gameTimeSec,
      node: ownRow(`sub-${i}`, s.gameTimeSec, (
        <div className="text-xs">
          {s.posLabel && <div className="font-bold mb-0.5" style={{ color: 'var(--brand-1a3fab)' }}>{s.posLabel}</div>}
          <div className="font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.name}</div>
          <div className="font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.name}</div>
        </div>
      )),
    })
  })

  game.goals.forEach(g => {
    const p = getPlayer(g.playerId)
    const content = (
      <span className="text-xs font-semibold inline-flex items-center justify-end gap-1" style={{ color: 'var(--brand-1a2f6b)' }}>
        {p?.name ?? 'Onbekende speler'} <HockeyBallIcon />
      </span>
    )
    if (g.gameTimeSec != null) {
      timed.push({ time: g.gameTimeSec, node: ownRow(`goal-${g.id}`, g.gameTimeSec, content) })
    } else {
      untimed.push(
        <div key={`goal-${g.id}`} className={untimedRow} style={untimedRowStyle}>
          <HockeyBallIcon /> {p?.name ?? 'Onbekende speler'}
        </div>
      )
    }
  })

  game.cards.forEach(c => {
    const p = getPlayer(c.playerId)
    const swatch = (
      <span className="inline-block w-3 h-4 rounded-sm shrink-0"
        style={{ background: c.color === 'green' ? '#16A34A' : c.color === 'yellow' ? '#EAB308' : '#DC2626' }} />
    )
    const content = (
      <span className="text-xs font-semibold inline-flex items-center justify-end gap-1.5" style={{ color: 'var(--brand-1a2f6b)' }}>
        {p?.name ?? 'Onbekende speler'} {swatch}
      </span>
    )
    if (c.gameTimeSec != null) {
      timed.push({ time: c.gameTimeSec, node: ownRow(`card-${c.id}`, c.gameTimeSec, content) })
    } else {
      untimed.push(
        <div key={`card-${c.id}`} className={untimedRow} style={untimedRowStyle}>
          {swatch} {p?.name ?? 'Onbekende speler'}
        </div>
      )
    }
  })

  timed.sort((a, b) => a.time - b.time)

  return (
    <div>
      {/* Crests + score, left/right of the center line — establishes the
          two-sided split even when one side (the opponent) has no events. */}
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--brand-eef3ff)' }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ClubLogo club={game.club} size={28} />
          <span className="text-xs font-bold uppercase truncate" style={{ color: 'var(--brand-1a2f6b)' }}>{game.club} {game.team}</span>
        </div>
        <span className="text-sm font-display font-bold shrink-0 px-2" style={{ color: 'var(--brand-1a3fab)' }}>{game.scoreOwn} - {game.scoreOpp}</span>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          <span className="text-xs font-bold uppercase truncate" style={{ color: 'var(--brand-a8bef0)' }}>{game.opponent}</span>
          <ClubLogo club={matchKnhbClub(game.opponent)} size={28} />
        </div>
      </div>

      {timed.length === 0 && untimed.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--brand-a8bef0)' }}>Geen gebeurtenissen vastgelegd</p>
      ) : (
        <>
          {timed.length > 0 && (
            <div className="relative">
              <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: 'var(--brand-d0dcfa)' }} />
              {timed.map(t => t.node)}
            </div>
          )}

          {untimed.length > 0 && (
            <div className="mt-4">
              <h4 className="font-display text-sm font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)' }}>
                Overig (geen tijd vastgelegd)
              </h4>
              {untimed}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MatchDetailView({ game, user, onEdit, onDelete }: {
  game: SavedGame
  user: AuthUser | null
  onEdit: (game: SavedGame) => void
  onDelete: (id: string) => void
}) {
  const [tab, setTab] = useState<'stats' | 'lineup' | 'timeline' | 'match'>('stats')
  const getPlayer = (id: string) => game.squad.find(p => p.id === id)
  const getPlayerFromGame = (g: SavedGame, id: string) => g.squad.find(p => p.id === id)
  const canManageSharing = (game.ownerId ?? user?.id) === user?.id
  const { shares, addShare, removeShare } = useGameShares(canManageSharing ? game.id : null)

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
          <ClubLogo club={game.club} size={32} />
          <div className="text-center min-w-0">
            <p className="font-display text-base font-bold truncate">
              {game.club} {game.team} <span style={{ color: 'var(--brand-a8bef0)', fontWeight: 400 }}>vs</span> {game.opponent}
            </p>
            <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--brand-a8bef0)' }}>
              {new Date(game.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} · {game.homeAway === 'Thuis' ? 'Thuis' : 'Uit'} · {game.scoreOwn} - {game.scoreOpp}
            </p>
          </div>
          <ClubLogo club={matchKnhbClub(game.opponent)} size={32} />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {tab === 'stats' && <MatchStats game={game} />}
        {tab === 'lineup' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <ReadOnlyFieldView ageGroup={game.ageGroup} slots={game.slots} squad={game.squad} />
          </div>
        )}
        {tab === 'timeline' && (
          <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <MatchTimeline game={game} getPlayer={getPlayer} />
          </div>
        )}
        {tab === 'match' && (
          <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <MatchDetailSections g={game} user={user} getPlayer={getPlayerFromGame}
              canManageSharing={canManageSharing} shares={shares} addShare={addShare} removeShare={removeShare}
              onEdit={onEdit} onDelete={onDelete} />
          </div>
        )}
        <div style={{ height: tab === 'lineup' ? 16 : 128 }} />
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-20 shadow-lg" style={{ background: 'var(--brand-0d2b7a)' }}>
        <div className="max-w-2xl mx-auto grid grid-cols-4 px-2 py-1.5 gap-1">
          {([
            ['stats', 'Stats'],
            ['lineup', 'Line-up'],
            ['timeline', 'Timeline'],
            ['match', 'Match'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
              style={tab === key
                ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                : { color: 'var(--brand-7b9de0)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Profile View ─────────────────────────────────────────────────────────────

// ── Team player photos ──────────────────────────────────────────────────────
// Shown in Profile for the user's "voorkeursteam". Roster, names and photo
// URLs all live in the database now (api/teams/[action].ts) — this is also
// where a coach adds/renames/removes players, since there's no more source
// file to edit for roster changes. SetupView re-fetches by team name
// whenever one is loaded, so changes made here show up in matches
// automatically.

function TeamPlayerPhotos({ team, canEditPhotos, canAddPlayer, canManageRoster, onSelectPlayer, compact }: { team: string; canEditPhotos: boolean; canAddPlayer: boolean; canManageRoster: boolean; onSelectPlayer?: (id: string) => void; compact?: boolean }) {
  const [players, setPlayers] = useState<RosterPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTeamRoster(team).then(p => { if (!cancelled) { setPlayers(p); setLoading(false) } })
    return () => { cancelled = true }
  }, [team])

  const triggerUpload = (id: string) => {
    uploadTargetRef.current = id
    fileInputRef.current?.click()
  }

  const onFileChange = async (file: File | undefined) => {
    const id = uploadTargetRef.current
    if (!file || !id) return
    setError(null)
    setBusyId(id)
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      const blob = await (await fetch(dataUrl)).blob()
      const result = await uploadToBlob(playerPhotoPathname(id), blob, {
        access: 'private',
        handleUploadUrl: '/api/blob/upload',
      })
      const res = await fetch('/api/teams/set-player-photo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, url: result.url }),
      })
      if (!res.ok) throw new Error()
      setPlayers(ps => ps.map(p => p.id === id ? { ...p, photoUrl: result.url } : p))
    } catch {
      setError('Kon foto niet uploaden. Probeer het opnieuw.')
    } finally {
      setBusyId(null)
    }
  }

  const removePhoto = async (id: string, name: string) => {
    if (!confirm(`Foto van ${name} verwijderen?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/teams/remove-player-photo?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPlayers(ps => ps.map(p => p.id === id ? { ...p, photoUrl: null } : p))
    } catch {
      setError('Kon foto niet verwijderen.')
    } finally {
      setBusyId(null)
    }
  }

  const addPlayer = async () => {
    const name = newName.trim()
    if (!name) return
    setError(null)
    try {
      const res = await fetch('/api/teams/add-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, name }),
      })
      if (!res.ok) throw new Error()
      const player = await res.json() as { id: string; name: string }
      setPlayers(ps => [...ps, { id: player.id, name: player.name, photoUrl: null, position: null }])
      setNewName('')
    } catch {
      setError('Kon speler niet toevoegen.')
    }
  }

  const saveRename = async (id: string) => {
    const name = editName.trim()
    if (!name) { setEditId(null); return }
    try {
      const res = await fetch('/api/teams/rename-player', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      if (!res.ok) throw new Error()
      setPlayers(ps => ps.map(p => p.id === id ? { ...p, name } : p))
    } catch {
      setError('Kon naam niet wijzigen.')
    } finally {
      setEditId(null)
    }
  }

  const removePlayer = async (id: string, name: string) => {
    if (!confirm(`${name} verwijderen uit dit team?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/teams/remove-player?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPlayers(ps => ps.filter(p => p.id !== id))
    } catch {
      setError('Kon speler niet verwijderen.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-center py-4" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>

  return (
    <div>
      {canEditPhotos && (
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { onFileChange(e.target.files?.[0]); e.target.value = '' }} />
      )}
      {!canEditPhotos && !canAddPlayer && !canManageRoster && (
        <p className="text-xs mb-3" style={{ color: 'var(--brand-7b90c8)' }}>
          Alleen coaches kunnen spelers en foto's beheren.
        </p>
      )}
      {error && <p className="text-xs font-semibold mb-2" style={{ color: '#DC2626' }}>{error}</p>}
      {players.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--brand-7b90c8)' }}>Geen spelers gevonden voor dit team.</p>
      ) : (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          {players.map(p => {
            const busy = busyId === p.id
            const avatarSize = compact ? 'w-8 h-8' : 'w-11 h-11'
            const avatar = p.photoUrl ? (
              <img src={mediaSrc(p.photoUrl)} alt={p.name} className={`${avatarSize} rounded-full object-cover`} />
            ) : (
              <div className={`${avatarSize} rounded-full flex items-center justify-center text-white font-bold ${compact ? 'text-xs' : 'text-sm'}`} style={{ background: 'var(--brand-1a3fab)' }}>
                {initials(p.name)}
              </div>
            )
            return (
              <div key={p.id} className={`flex items-center rounded-xl ${compact ? 'gap-2 p-1.5' : 'gap-3 p-2.5'}`}
                style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
                {canEditPhotos ? (
                  <button onClick={() => triggerUpload(p.id)} disabled={busy}
                    className={`relative ${avatarSize} rounded-full shrink-0 group overflow-hidden disabled:opacity-50`} title="Foto wijzigen">
                    {avatar}
                    <span className="absolute inset-0 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(13,43,122,0.55)' }}>
                      {busy ? '…' : '✎'}
                    </span>
                  </button>
                ) : (
                  <div className={`${avatarSize} rounded-full shrink-0 overflow-hidden`}>{avatar}</div>
                )}
                {editId === p.id ? (
                  <input autoFocus className="flex-1 text-sm font-semibold rounded-lg px-2 py-1" style={{ border: '1.5px solid var(--brand-d0dcfa)' }}
                    value={editName} onChange={e => setEditName(e.target.value)}
                    onBlur={() => saveRename(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(p.id); if (e.key === 'Escape') setEditId(null) }} />
                ) : onSelectPlayer ? (
                  <button className="flex-1 min-w-0 text-left" onClick={() => onSelectPlayer(p.id)}>
                    <span className={`font-semibold truncate block ${compact ? 'text-sm' : 'text-sm'}`} style={{ color: 'var(--brand-1a2f6b)' }}>{p.name}</span>
                    {p.position && !compact && <span className="text-xs truncate block" style={{ color: 'var(--brand-7b90c8)' }}>{p.position}</span>}
                  </button>
                ) : (
                  <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--brand-1a2f6b)', cursor: canManageRoster ? 'pointer' : 'default' }}
                    onClick={() => { if (canManageRoster) { setEditId(p.id); setEditName(p.name) } }}>
                    {p.name}
                  </span>
                )}
                {onSelectPlayer && canManageRoster && !busy && (
                  <button onClick={() => { setEditId(p.id); setEditName(p.name) }} className="text-xs shrink-0" style={{ color: 'var(--brand-a8bef0)' }} title="Naam wijzigen">✎</button>
                )}
                {canEditPhotos && p.photoUrl && !busy && (
                  <button onClick={() => removePhoto(p.id, p.name)} className="font-bold text-sm" style={{ color: '#DC2626' }} title="Foto verwijderen">×</button>
                )}
                {canManageRoster && !busy && (
                  <button onClick={() => removePlayer(p.id, p.name)} className="text-xs font-bold" style={{ color: 'var(--brand-a8bef0)' }} title="Speler verwijderen">🗑</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {canAddPlayer && (
        <div className="flex gap-2 mt-3">
          <input className="flex-1 rounded-xl px-3 py-2 text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }}
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Naam nieuwe speler"
            onKeyDown={e => e.key === 'Enter' && addPlayer()} />
          <button onClick={addPlayer} className="px-4 py-2 rounded-xl font-bold text-white text-lg" style={{ background: 'var(--brand-1a3fab)' }}>+</button>
        </div>
      )}
    </div>
  )
}

// ── Team View ─────────────────────────────────────────────────────────────────
// Roster overview, relocated out of Profiel so it's its own bottom-nav
// destination — tapping a player opens their profile/stats page.

function TeamView({ user, games, onProfile, onSelectPlayer, onSelectStaff, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification }: {
  user: AuthUser | null
  games: SavedGame[]
  onProfile: () => void
  onSelectPlayer: (id: string) => void
  onSelectStaff: (id: string) => void
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
}) {
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL
  // Coach/Trainer/Trainer & Coach/Manager can add a player to their own team
  // and edit a player's photo — renaming or removing a player entirely is
  // beheerder-only (see TeamPlayerPhotos' canManageRoster below). Same rule
  // ProfileView used to compute before this section moved here.
  const isRosterStaff = user?.role === 'Coach' || user?.role === 'Trainer' || user?.role === 'Trainer & Coach' || user?.role === 'Manager'

  const [staff, setStaff] = useState<TeamStaffMember[]>([])
  useEffect(() => {
    if (!user?.defaultTeam) { setStaff([]); return }
    let cancelled = false
    fetchTeamStaff(user.defaultTeam).then(s => { if (!cancelled) setStaff(s) })
    return () => { cancelled = true }
  }, [user?.defaultTeam])

  // Same "played" signal Wedstrijden uses (finalTime > 0) — a scheduled but
  // not-yet-played match shouldn't count toward the team's record.
  const playedGames = games.filter(g => g.finalTime > 0)
  const wins = playedGames.filter(g => g.scoreOwn > g.scoreOpp).length
  const losses = playedGames.filter(g => g.scoreOwn < g.scoreOpp).length
  const draws = playedGames.filter(g => g.scoreOwn === g.scoreOpp).length
  const totalMinutes = playedGames.reduce((n, g) => n + g.finalTime, 0)
  const goalsFor = playedGames.reduce((n, g) => n + g.scoreOwn, 0)
  const goalsAgainst = playedGames.reduce((n, g) => n + g.scoreOpp, 0)

  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <p className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>{label}</p>
      <p className="font-display text-2xl font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>{value}</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3 justify-self-start">
            {user?.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
            <div>
              <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                {user?.defaultClub ?? 'Hockey One'}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                {user?.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <H1Logo height={26} />
          </div>
          <div className="flex items-center gap-2 justify-self-end">
            {user && (
              <NotificationBell
                unreadNotifications={unreadNotifications}
                notifications={notifications}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onMarkUnread={onMarkUnread}
                onDelete={onDeleteNotification}
                onOpenHistory={() => {}}
              />
            )}
            {!user && (
              <button onClick={onProfile} className="text-sm px-3 py-1.5 rounded-lg font-semibold"
                style={{ color: 'var(--brand-a8bef0)', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
                Inloggen
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!user ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔒</div>
            <p className="font-display text-xl font-bold uppercase mb-3" style={{ color: 'var(--brand-a8bef0)' }}>Log in om je team te zien</p>
            <button onClick={onProfile}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: 'var(--brand-1a3fab)' }}>
              Naar profiel →
            </button>
          </div>
        ) : !user.defaultTeam ? (
          <p className="text-sm text-center py-20" style={{ color: 'var(--brand-a8bef0)' }}>Stel eerst een team in via je profiel.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
              <h2 className="font-display text-sm font-bold uppercase mb-4" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                Teamoverzicht
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {stat('Wedstrijden', playedGames.length)}
                {stat('Doelpunten voor', goalsFor)}
                {stat('Doelpunten tegen', goalsAgainst)}
                {stat('Gewonnen', wins)}
                {stat('Verloren', losses)}
                {stat('Gelijkgespeeld', draws)}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                <IconClock size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>Minuten gespeeld</p>
                <p className="font-display text-2xl font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>{fmtHM(totalMinutes)}</p>
              </div>
            </div>

            {staff.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
                <h2 className="font-display text-sm font-bold uppercase mb-4" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                  Staf
                </h2>
                <div className="grid grid-cols-4 gap-3">
                  {staff.map(s => {
                    const displayName = s.firstName?.trim() || (s.name ? firstName(s.name) : 'Onbekend')
                    const initialsName = (s.firstName && s.lastName) ? `${s.firstName} ${s.lastName}` : (s.name ?? displayName)
                    return (
                      <button key={s.id} onClick={() => onSelectStaff(s.id)} className="flex flex-col items-center gap-1.5">
                        {s.picture ? (
                          <img src={s.picture} alt={displayName} className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--brand-1a3fab)' }}>
                            {initials(initialsName)}
                          </div>
                        )}
                        <span className="text-xs font-semibold truncate w-full text-center" style={{ color: 'var(--brand-1a2f6b)' }}>{displayName}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
              <h2 className="font-display text-sm font-bold uppercase mb-1" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
                Spelers — {user.defaultTeam}
              </h2>
              <p className="text-xs mb-3" style={{ color: 'var(--brand-a8bef0)' }}>
                Tik op een speler voor hun profiel en statistieken.
              </p>
              <TeamPlayerPhotos team={user.defaultTeam}
                canEditPhotos={isRosterStaff}
                canAddPlayer={isRosterStaff}
                canManageRoster={isAdmin}
                onSelectPlayer={onSelectPlayer}
                compact />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Player Profile View ──────────────────────────────────────────────────────
// Stats are derived by reducing over the same `games` array Wedstrijden
// already loads — no new fetch for match history. Only name/photo/position
// come from a roster fetch, the same way TeamPlayerPhotos already does it.

function PlayerProfileView({ playerId, team, games, user, onBack }: {
  playerId: string
  team: string
  games: SavedGame[]
  user: AuthUser | null
  onBack: () => void
}) {
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [savingPosition, setSavingPosition] = useState(false)
  const [editingPosition, setEditingPosition] = useState(false)
  const [positionDraft, setPositionDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchTeamRoster(team).then(p => { if (!cancelled) setPlayers(p) })
    return () => { cancelled = true }
  }, [team])

  const player = players?.find(p => p.id === playerId) ?? null

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL
  const isRosterStaff = user?.role === 'Coach' || user?.role === 'Trainer' || user?.role === 'Trainer & Coach' || user?.role === 'Manager'
  const canEditPosition = isAdmin || (isRosterStaff && (user?.defaultTeam ?? '').toLowerCase() === team.toLowerCase())

  const savePosition = async () => {
    const position = positionDraft.trim()
    setSavingPosition(true)
    try {
      const res = await fetch('/api/teams/set-player-position', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: playerId, position }),
      })
      if (res.ok) setPlayers(ps => ps ? ps.map(p => p.id === playerId ? { ...p, position: position || null } : p) : ps)
    } finally {
      setSavingPosition(false)
      setEditingPosition(false)
    }
  }

  // "Matches" = games where the player actually got game time, not merely
  // squad membership — a bench-only appearance shouldn't count as a match.
  const playerGames = games.filter(g => ((g.playedSeconds ?? {})[playerId] ?? 0) > 0)
  const totalGoals = games.reduce((n, g) => n + (g.goals ?? []).filter(x => x.playerId === playerId).length, 0)
  const totalCards = games.reduce((n, g) => n + (g.cards ?? []).filter(x => x.playerId === playerId).length, 0)
  // "Amount of subs" = every time this player was part of a substitution,
  // coming on or going off — there's no separate "assist" concept tracked
  // anywhere in the app to attribute more precisely than that.
  const totalSubs = games.reduce((n, g) => n + (g.subs ?? []).filter(s => s.playerInId === playerId || s.playerOutId === playerId).length, 0)
  const totalPlaytimeSec = games.reduce((n, g) => n + ((g.playedSeconds ?? {})[playerId] ?? 0), 0)
  const lastGameWithPlaytime = [...playerGames].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const secLastGame = lastGameWithPlaytime ? ((lastGameWithPlaytime.playedSeconds ?? {})[playerId] ?? 0) : 0
  const last5 = [...playerGames].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).reverse()
  const maxLast5Minutes = Math.max(...last5.map(g => Math.round(((g.playedSeconds ?? {})[playerId] ?? 0) / 60)), 1)

  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <p className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>{label}</p>
      <p className="font-display text-2xl font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>{value}</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <div style={{ background: 'var(--brand-0d2b7a)' }} className="text-white">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-14">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: 'var(--brand-7b9de0)' }}>
            ← Terug
          </button>
          {player && (
            <div className="flex flex-col items-center text-center mt-3">
              {player.photoUrl ? (
                <img src={mediaSrc(player.photoUrl)} alt={player.name}
                  className="w-24 h-24 rounded-full object-cover" style={{ border: '3px solid rgba(255,255,255,0.85)' }} />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-2xl"
                  style={{ background: '#fff', color: 'var(--brand-1a3fab)', border: '3px solid rgba(255,255,255,0.85)' }}>
                  {initials(player.name)}
                </div>
              )}
              <h1 className="font-display text-xl font-bold mt-3">{player.name}</h1>
              {editingPosition ? (
                <input autoFocus className="text-sm text-center mt-1 rounded-lg px-2 py-1 w-full max-w-xs"
                  style={{ border: '1.5px solid var(--brand-d0dcfa)', color: 'var(--brand-1a2f6b)' }}
                  value={positionDraft} onChange={e => setPositionDraft(e.target.value)}
                  placeholder="bijv. Middenvelder, Verdediger"
                  onBlur={savePosition}
                  onKeyDown={e => { if (e.key === 'Enter') savePosition(); if (e.key === 'Escape') setEditingPosition(false) }} />
              ) : (
                <button onClick={() => { if (canEditPosition) { setPositionDraft(player.position ?? ''); setEditingPosition(true) } }}
                  className="text-sm mt-1"
                  style={{ color: 'var(--brand-a8bef0)', cursor: canEditPosition ? 'pointer' : 'default' }}>
                  {savingPosition ? 'Opslaan…' : player.position || (canEditPosition ? 'Positie instellen →' : 'Positie niet ingesteld')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!player ? (
        <p className="text-sm text-center py-20" style={{ color: 'var(--brand-a8bef0)' }}>
          {players === null ? 'Laden…' : 'Speler niet gevonden.'}
        </p>
      ) : (
        <div className="max-w-2xl mx-auto px-4 -mt-8 pb-8 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-lg" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-sm font-bold uppercase mb-4" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
              Seizoensoverzicht
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {stat('Wedstrijden', playerGames.length)}
              {stat('Doelpunten', totalGoals)}
              {stat('Totale speeltijd', fmtHM(totalPlaytimeSec))}
              {stat('Min. laatste wedstrijd', Math.round(secLastGame / 60))}
              {stat('Kaarten', totalCards)}
              {stat('Aantal wissels', totalSubs)}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-sm font-bold uppercase mb-4" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
              Minuten gespeeld — laatste 5 wedstrijden
            </h2>
            {last5.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--brand-a8bef0)' }}>Nog geen speeltijd geregistreerd.</p>
            ) : (
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {last5.map(g => {
                  const minutes = Math.round(((g.playedSeconds ?? {})[playerId] ?? 0) / 60)
                  const heightPct = Math.max((minutes / maxLast5Minutes) * 100, 4)
                  return (
                    <div key={g.id} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, background: 'var(--brand-1a3fab)' }} />
                      <span className="text-xs font-bold mt-1" style={{ color: 'var(--brand-7b90c8)' }}>{minutes}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Staff Profile View ───────────────────────────────────────────────────────
// Same dark-hero-plus-overlap-card layout as PlayerProfileView, but a coach/
// trainer/manager has no match stats to show — this just surfaces the
// information they filled in on their own account profile (Profiel), not
// anything derived from match history.

function StaffProfileView({ staffId, team, onBack }: { staffId: string; team: string; onBack: () => void }) {
  const [staff, setStaff] = useState<TeamStaffMember[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTeamStaff(team).then(s => { if (!cancelled) setStaff(s) })
    return () => { cancelled = true }
  }, [team])

  const member = staff?.find(s => s.id === staffId) ?? null
  const fullName = member ? ((member.firstName && member.lastName) ? `${member.firstName} ${member.lastName}` : (member.name ?? 'Onbekend')) : ''

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <div style={{ background: 'var(--brand-0d2b7a)' }} className="text-white">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-14">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: 'var(--brand-7b9de0)' }}>
            ← Terug
          </button>
          {member && (
            <div className="flex flex-col items-center text-center mt-3">
              {member.picture ? (
                <img src={member.picture} alt={fullName} referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-full object-cover" style={{ border: '3px solid rgba(255,255,255,0.85)' }} />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-2xl"
                  style={{ background: '#fff', color: 'var(--brand-1a3fab)', border: '3px solid rgba(255,255,255,0.85)' }}>
                  {initials(fullName)}
                </div>
              )}
              <h1 className="font-display text-xl font-bold mt-3">{fullName}</h1>
              {member.role && <p className="text-sm mt-1" style={{ color: 'var(--brand-a8bef0)' }}>{member.role}</p>}
            </div>
          )}
        </div>
      </div>

      {!member ? (
        <p className="text-sm text-center py-20" style={{ color: 'var(--brand-a8bef0)' }}>
          {staff === null ? 'Laden…' : 'Niet gevonden.'}
        </p>
      ) : (
        <div className="max-w-2xl mx-auto px-4 -mt-8 pb-8 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-lg" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-sm font-bold uppercase mb-4" style={{ color: 'var(--brand-7b90c8)', letterSpacing: '0.08em' }}>
              Profiel
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>Rol</p>
                <p className="font-display text-lg font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>{member.role ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--brand-7b90c8)' }}>Team</p>
                <p className="font-display text-lg font-bold" style={{ color: 'var(--brand-0d2b7a)' }}>{team}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileView({ user, loading, onCredential, onRegister, onLoginPassword, onResendVerification, onForgotPassword, onLogout, onBack, onHistory, onUpdateProfile, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification }: {
  user: AuthUser | null
  loading: boolean
  onCredential: (credential: string) => void
  onRegister: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onLoginPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  onResendVerification: (email: string) => Promise<void>
  onForgotPassword: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onLogout: () => void
  onBack: () => void
  onHistory: () => void
  onUpdateProfile: (fields: Partial<Pick<AuthUser, 'defaultTeam' | 'defaultClub' | 'firstName' | 'lastName' | 'role' | 'picture'>>) => Promise<{ ok: true } | { ok: false; error: string }>
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
}) {
  const inputStyle = { border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [role, setRole] = useState(user?.role ?? '')
  const [saved, setSaved] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFirstName(user?.firstName ?? '')
    setLastName(user?.lastName ?? '')
    setRole(user?.role ?? '')
  }, [user?.firstName, user?.lastName, user?.role])

  const [teamNames, setTeamNames] = useState<string[]>([])
  useEffect(() => {
    if (user) fetchTeamNames().then(setTeamNames)
  }, [user])

  // Already having an elevated role (set before this feature existed, or
  // verified previously) is grandfathered in — this only decides whether
  // someone can newly pick their way *into* Trainer/Coach/Trainer &
  // Coach/Manager from Speler/Supporter, checked live as they type their
  // name so the dropdown itself reflects it (real enforcement is still
  // server-side, see PUT /api/auth/me).
  const alreadyElevated = ELEVATED_ROLES.includes(user?.role ?? '')
  const [staffEligible, setStaffEligible] = useState(false)
  useEffect(() => {
    if (alreadyElevated) return
    const team = user?.defaultTeam ?? ''
    if (!team || !firstName.trim() || !lastName.trim()) { setStaffEligible(false); return }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchStaffEligibility(team, firstName, lastName).then(eligible => { if (!cancelled) setStaffEligible(eligible) })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [alreadyElevated, user?.defaultTeam, firstName, lastName])
  const selectableRoles = alreadyElevated || staffEligible ? ROLE_OPTIONS : ROLE_OPTIONS.filter(r => !ELEVATED_ROLES.includes(r))

  const saveDetails = async () => {
    setDetailsError(null)
    const result = await onUpdateProfile({ firstName: firstName || null, lastName: lastName || null, role: role || null })
    if (result.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setDetailsError(result.error)
    }
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setPhotoError(null)
    setUploadingPhoto(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      onUpdateProfile({ picture: dataUrl })
    } catch {
      setPhotoError('Kon foto niet verwerken. Probeer een andere afbeelding.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL
  const { users: adminUsers, loading: adminLoading, error: adminError, deleteUser, setAdmin } = useAdminUsers(isAdmin)
  const { teams: adminTeams, loading: adminTeamsLoading, error: adminTeamsError, createTeam, renameTeam, deleteTeam } = useAdminTeams(isAdmin)
  const [newTeamName, setNewTeamName] = useState('')
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)

  const [announcement, setAnnouncement] = useState('')
  const [announcementBusy, setAnnouncementBusy] = useState(false)
  const [announcementResult, setAnnouncementResult] = useState<{ ok: boolean; message: string } | null>(null)
  const announcementRef = useRef<HTMLTextAreaElement>(null)

  // Wraps the current selection (or, with nothing selected, inserts a
  // placeholder) with a marker pair — **bold**/_italic_ — and keeps the
  // selection on the wrapped text so hitting the same button again toggles
  // it back off from the toolbar.
  const wrapSelection = (marker: string) => {
    const el = announcementRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const selected = announcement.slice(selectionStart, selectionEnd) || 'tekst'
    const next = announcement.slice(0, selectionStart) + marker + selected + marker + announcement.slice(selectionEnd)
    setAnnouncement(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length)
    })
  }

  // Toggles "- " bullets on every line the selection touches (a plain-text
  // convention rendered as a real <ul> in renderFormattedText below) — off
  // again if every touched line already has one, on otherwise.
  const toggleBulletList = () => {
    const el = announcementRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const lineStart = announcement.lastIndexOf('\n', selectionStart - 1) + 1
    const nextBreak = announcement.indexOf('\n', selectionEnd)
    const lineEnd = nextBreak === -1 ? announcement.length : nextBreak
    const lines = announcement.slice(lineStart, lineEnd).split('\n')
    const allBulleted = lines.every(l => l.startsWith('- ') || l.trim() === '')
    const newLines = lines.map(l => {
      if (l.trim() === '') return l
      return allBulleted ? l.slice(2) : (l.startsWith('- ') ? l : `- ${l}`)
    })
    setAnnouncement(announcement.slice(0, lineStart) + newLines.join('\n') + announcement.slice(lineEnd))
    requestAnimationFrame(() => el.focus())
  }

  const submitAnnouncement = async () => {
    const body = announcement.trim()
    if (!body) return
    setAnnouncementBusy(true)
    setAnnouncementResult(null)
    const result = await publishAnnouncement(body)
    if (result.ok) {
      setAnnouncement('')
      setAnnouncementResult({ ok: true, message: `Verstuurd naar ${result.count} gebruiker${result.count !== 1 ? 's' : ''}.` })
    } else {
      setAnnouncementResult({ ok: false, message: result.error })
    }
    setAnnouncementBusy(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3 justify-self-start">
            {user?.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
            <div>
              <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                {user?.defaultClub ?? 'Hockey One'}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                {user?.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
              </p>
            </div>
          </div>
          <h1 className="font-display text-xl font-bold uppercase tracking-widest text-center truncate">PROFIEL</h1>
          <div className="flex items-center gap-2 justify-self-end">
            {user && (
              <NotificationBell
                unreadNotifications={unreadNotifications}
                notifications={notifications}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onMarkUnread={onMarkUnread}
                onDelete={onDeleteNotification}
                onOpenHistory={onHistory}
              />
            )}
            {/* Logged-out visitors have no bottom bar at all (it only shows
                once signed in) — without this, landing here (e.g. via the
                "Log in" link in Team setup) was a dead end. */}
            {!user && (
              <button onClick={onBack} className="text-sm font-semibold" style={{ color: 'var(--brand-7b9de0)' }}>
                ← Terug
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>
          ) : user ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                    className="relative w-16 h-16 rounded-full shrink-0 group" title="Foto wijzigen">
                    {user.picture ? (
                      <img src={user.picture} alt="" className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
                        style={{ background: 'var(--brand-1a3fab)' }}>
                        {initials(user.name ?? user.email)}
                      </div>
                    )}
                    <span className="absolute inset-0 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(13,43,122,0.55)' }}>
                      {uploadingPhoto ? '…' : '✎'}
                    </span>
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-lg truncate" style={{ color: 'var(--brand-0d2b7a)' }}>{user.name ?? user.email}</div>
                    <div className="text-sm truncate" style={{ color: 'var(--brand-7b90c8)' }}>{user.email}</div>
                  </div>
                </div>
                <button onClick={onLogout}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
                  style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                  Uitloggen
                </button>
              </div>
              {user.defaultClub && (
                <div className="flex items-center gap-2.5">
                  <ClubLogo club={user.defaultClub} size={40} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--brand-1a2f6b)' }}>{user.defaultClub}</span>
                </div>
              )}
              {photoError && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{photoError}</p>}

              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Club</label>
                <SearchableSelect value={user.defaultClub ?? ''} onChange={v => onUpdateProfile({ defaultClub: v || null })}
                  options={KNHB_CLUBS} placeholder="Kies club…" inputStyle={inputStyle} />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Team</label>
                <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: user.defaultTeam ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
                  value={user.defaultTeam ?? ''}
                  onChange={e => onUpdateProfile({ defaultTeam: e.target.value || null })}>
                  <option value="">Kies team…</option>
                  {/* teamNames is this club's real roster list — only meaningful for SC
                      Muiden, the only club this app actually manages rosters for. Any
                      other club falls back to the generic age-category list. */}
                  {(user.defaultClub === 'SC Muiden' ? teamNames : GENERIC_TEAM_CATEGORIES).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <p className="text-xs mt-1.5" style={{ color: 'var(--brand-7b90c8)' }}>Wordt automatisch geselecteerd bij het starten van een wedstrijd.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Naam</label>
                  <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
                    value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Voornaam" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Achternaam</label>
                  <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
                    value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Achternaam" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-6b82b8)', letterSpacing: '0.12em' }}>Rol</label>
                <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: role ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
                  value={role} onChange={e => setRole(e.target.value)}>
                  <option value="">Kies rol…</option>
                  {selectableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {!alreadyElevated && !staffEligible && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--brand-7b90c8)' }}>
                    Trainer, Coach en Manager zijn alleen te kiezen als je voor- en achternaam bekend zijn als
                    Ondersteuning van je team bij Lisa.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveDetails}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'var(--brand-1a3fab)' }}>
                  Opslaan
                </button>
                {saved && <span className="text-sm font-semibold" style={{ color: '#16A34A' }}>Opgeslagen!</span>}
                {detailsError && <span className="text-sm font-semibold" style={{ color: '#DC2626' }}>{detailsError}</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-center py-4">
              <p className="text-sm" style={{ color: 'var(--brand-6b82b8)' }}>
                Log in om wedstrijden op te slaan en later terug te vinden.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton onCredential={onCredential} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--brand-e4ecfe)' }} />
                <span className="text-xs font-semibold uppercase" style={{ color: 'var(--brand-a8bef0)' }}>of</span>
                <div className="flex-1 h-px" style={{ background: 'var(--brand-e4ecfe)' }} />
              </div>
              <EmailAuthForm onLogin={onLoginPassword} onRegister={onRegister} onResend={onResendVerification} onForgotPassword={onForgotPassword} />
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="bg-white rounded-2xl p-6 shadow-sm mt-5" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--brand-0d2b7a)' }}>
              Beheer — Melding versturen
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--brand-7b90c8)' }}>
              Stuurt een melding naar Meldingen van alle andere gebruikers.
            </p>
            <div className="flex gap-1.5 mb-1.5">
              <button type="button" onClick={() => wrapSelection('**')}
                className="w-8 h-8 rounded-lg font-bold text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}
                title="Vet">B</button>
              <button type="button" onClick={() => wrapSelection('_')}
                className="w-8 h-8 rounded-lg italic text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}
                title="Cursief">I</button>
              <button type="button" onClick={toggleBulletList}
                className="w-8 h-8 rounded-lg text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', color: 'var(--brand-1a3fab)' }}
                title="Opsomming">☰</button>
            </div>
            <textarea ref={announcementRef} className="w-full rounded-xl px-3 py-2.5 text-sm font-mono" style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              value={announcement} onChange={e => setAnnouncement(e.target.value)}
              maxLength={500} placeholder="Typ hier je melding…" />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs" style={{ color: 'var(--brand-a8bef0)' }}>{announcement.length}/500</span>
            </div>
            {announcement.trim() && (
              <div className="mt-2 p-3 rounded-xl text-sm" style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)', color: 'var(--brand-1a2f6b)' }}>
                <div className="text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.1em' }}>Voorbeeld</div>
                {renderFormattedText(announcement)}
              </div>
            )}
            {announcementResult && (
              <p className="text-xs font-semibold mt-2" style={{ color: announcementResult.ok ? '#16A34A' : '#DC2626' }}>
                {announcementResult.message}
              </p>
            )}
            <button onClick={submitAnnouncement} disabled={announcementBusy || !announcement.trim()}
              className="mt-3 px-4 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
              style={{ background: 'var(--brand-1a3fab)' }}>
              {announcementBusy ? 'Versturen…' : 'Publiceren'}
            </button>
          </section>
        )}

        {isAdmin && (
          <section className="bg-white rounded-2xl p-6 shadow-sm mt-5" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide mb-4" style={{ color: 'var(--brand-0d2b7a)' }}>
              Beheer — Gebruikers
            </h2>
            {adminLoading ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>
            ) : adminError ? (
              <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>{adminError}</p>
            ) : adminUsers.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--brand-7b90c8)' }}>Nog geen gebruikers.</p>
            ) : (
              <div className="space-y-2">
                {adminUsers.map(u => (
                  <div key={u.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--brand-e8effd)', background: 'var(--brand-f8faff)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: 'var(--brand-1a2f6b)' }}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email}
                        </div>
                        <div className="text-xs truncate" style={{ color: 'var(--brand-7b90c8)' }}>{u.email}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {u.id !== user?.id && u.email.toLowerCase() !== ADMIN_EMAIL && (
                          <button onClick={() => {
                            if (!u.isAdmin && !confirm(`${u.email} beheerderstoegang geven? Diegene kan dan ook andere accounts beheren.`)) return
                            setAdmin(u.id, !u.isAdmin)
                          }}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                            style={u.isAdmin
                              ? { color: 'var(--brand-7b90c8)', border: '1px solid var(--brand-d0dcfa)' }
                              : { color: 'var(--brand-1a3fab)', border: '1px solid var(--brand-a8bef0)' }}>
                            {u.isAdmin ? 'Beheerder verwijderen' : 'Maak beheerder'}
                          </button>
                        )}
                        {u.id !== user?.id && (
                          <button onClick={() => {
                            if (confirm(`Account van ${u.email} verwijderen? Dit verwijdert ook alle opgeslagen wedstrijden van dit account.`)) deleteUser(u.id)
                          }}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                            Verwijder
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.isAdmin && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EDE9FE', color: '#6D28D9' }}>
                          Beheerder
                        </span>
                      )}
                      {u.defaultClub && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                          {u.defaultClub}
                        </span>
                      )}
                      {u.defaultTeam && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                          {u.defaultTeam}
                        </span>
                      )}
                      {u.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                          {u.role}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                        {u.gameCount} wedstrijd{u.gameCount !== 1 ? 'en' : ''}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={u.emailVerified
                          ? { background: '#DCFCE7', color: '#16A34A' }
                          : { background: '#FEF3C7', color: '#D97706' }}>
                        {u.emailVerified ? 'Geverifieerd' : 'Niet geverifieerd'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-eef3ff)', color: 'var(--brand-1a3fab)' }}>
                        {u.hasPassword ? 'E-mail/wachtwoord' : 'Google'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="bg-white rounded-2xl p-6 shadow-sm mt-5" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide mb-4" style={{ color: 'var(--brand-0d2b7a)' }}>
              Beheer — Teams
            </h2>
            {adminTeamsLoading ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>
            ) : adminTeamsError ? (
              <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>{adminTeamsError}</p>
            ) : (
              <div className="space-y-2">
                {adminTeams.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--brand-7b90c8)' }}>Nog geen teams.</p>
                )}
                {adminTeams.map(t => (
                  <div key={t.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-e8effd)', background: 'var(--brand-f8faff)' }}>
                    <div className="flex items-center gap-2 p-2.5">
                      <span className="flex-1 text-sm font-semibold truncate px-1" style={{ color: 'var(--brand-1a2f6b)' }}>{t.name}</span>
                      <button onClick={() => setExpandedTeamId(id => id === t.id ? null : t.id)}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0" style={{ color: 'var(--brand-1a3fab)', border: '1px solid var(--brand-d0dcfa)' }}>
                        {expandedTeamId === t.id ? 'Sluiten' : 'Aanpassen'}
                      </button>
                      <button onClick={() => {
                        if (confirm(`Team ${t.name} verwijderen? Alle spelers en foto's van dit team gaan verloren.`)) deleteTeam(t.id)
                      }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                        style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                        Verwijder
                      </button>
                    </div>
                    {expandedTeamId === t.id && (
                      <div className="px-2.5 pb-2.5 space-y-3">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide block mb-1" style={{ color: 'var(--brand-7b90c8)' }}>Teamnaam</label>
                          <input className="w-full text-sm font-semibold rounded-lg px-2 py-1.5" style={{ border: '1.5px solid var(--brand-d0dcfa)', color: 'var(--brand-1a2f6b)' }}
                            defaultValue={t.name} key={`${t.id}-${t.name}`}
                            onBlur={e => { const name = e.target.value.trim(); if (name && name !== t.name) renameTeam(t.id, name) }} />
                        </div>
                        <TeamPlayerPhotos team={t.name} canEditPhotos={true} canAddPlayer={true} canManageRoster={true} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <input className="flex-1 rounded-xl px-3 py-2 text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }}
                value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                placeholder="Naam nieuw team, bv. MO13-1"
                onKeyDown={e => { if (e.key === 'Enter' && newTeamName.trim()) { createTeam(newTeamName.trim()); setNewTeamName('') } }} />
              <button onClick={() => { if (newTeamName.trim()) { createTeam(newTeamName.trim()); setNewTeamName('') } }}
                className="px-4 py-2 rounded-xl font-bold text-white text-lg" style={{ background: 'var(--brand-1a3fab)' }}>+</button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Google auth ───────────────────────────────────────────────────────────────
// Session lives in an HttpOnly cookie set by /api/auth/google; the frontend
// only ever sees the decoded user info, never a token it has to manage.

interface AuthUser {
  id: string
  email: string
  name: string | null
  picture: string | null
  defaultTeam: string | null
  defaultClub: string | null
  firstName: string | null
  lastName: string | null
  role: string | null
}

function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setUser(data?.user ?? null) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // /api/auth/verify-email redirects back here with ?verify=ok|error after
  // the coach clicks the link in their inbox — surface the result once and
  // strip the param so refreshing doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verify = params.get('verify')
    if (!verify) return
    if (verify === 'ok') alert('E-mailadres bevestigd! Je bent ingelogd.')
    else if (verify === 'error') alert('Deze verificatielink is ongeldig of verlopen. Log in om een nieuwe aan te vragen.')
    params.delete('verify')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [])

  const loginWithCredential = useCallback(async (credential: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (res.ok) setUser((await res.json()).user)
  }, [])

  const registerWithPassword = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    if (res.ok) return { ok: true as const }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? 'Registreren mislukt' }
  }, [])

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) { setUser((await res.json()).user); return { ok: true as const } }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? 'Inloggen mislukt', code: body.code as string | undefined }
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  }, [])

  // The server always responds 200/{ok:true} here regardless of whether the
  // account exists or the email actually sent (no enumeration) — but a
  // non-2xx still means something genuinely broke (wrong route, 500, etc.),
  // and that's worth surfacing rather than silently swallowing.
  const forgotPassword = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) return { ok: true as const }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? `Er ging iets mis (${res.status})` }
  }, [])

  const resetPassword = useCallback(async (token: string, password: string) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (res.ok) { setUser((await res.json()).user); return { ok: true as const } }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? 'Wachtwoord opnieuw instellen mislukt' }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  // Persists profile fields (team preference, name, role, photo) so they're
  // available next time this coach logs in, on any device. Only the fields
  // passed in are changed — the API leaves the rest untouched.
  const updateProfile = useCallback(async (fields: Partial<Pick<AuthUser, 'defaultTeam' | 'defaultClub' | 'firstName' | 'lastName' | 'role' | 'picture'>>) => {
    const res = await fetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) { setUser((await res.json()).user); return { ok: true as const } }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? 'Opslaan mislukt' }
  }, [])

  return { user, loading, loginWithCredential, registerWithPassword, loginWithPassword, resendVerification, forgotPassword, resetPassword, logout, updateProfile }
}

// Renders Google's own "Sign in with Google" button into a div once the GSI
// script (loaded in index.html) is ready. No-ops quietly if the client ID
// isn't configured yet, rather than crashing the page.
// google.accounts.id.initialize() should only ever run once per page load —
// calling it again (e.g. when this component remounts navigating between
// views) just logs a GSI warning and reinitializes the same thing. The
// credential callback is kept in a module-level ref so it always delegates
// to whichever component instance is currently mounted.
let googleInitialized = false
const googleCredentialCallbackRef: { current: ((credential: string) => void) | null } = { current: null }

function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  googleCredentialCallbackRef.current = onCredential

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return
    let cancelled = false
    const tryRender = () => {
      if (cancelled) return
      const google = (window as any).google
      if (!google?.accounts?.id) { setTimeout(tryRender, 100); return }
      if (!googleInitialized) {
        googleInitialized = true
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => googleCredentialCallbackRef.current?.(response.credential),
        })
      }
      if (ref.current) {
        google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' })
      }
    }
    tryRender()
    return () => { cancelled = true }
  }, [])

  return <div ref={ref} />
}

// ── Email/password auth ───────────────────────────────────────────────────────
// Alternative to Google sign-in for coaches without a Google account.
// Registering never logs the user in directly — they must click the
// verification link emailed to them first (see api/auth/register.ts).

function EmailAuthForm({ onLogin, onRegister, onResend, onForgotPassword }: {
  onLogin: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  onRegister: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onResend: (email: string) => Promise<void>
  onForgotPassword: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const inputStyle = { border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showResend, setShowResend] = useState(false)

  const switchMode = (m: 'login' | 'register' | 'forgot') => {
    setMode(m)
    setError(null)
    setInfo(null)
    setShowResend(false)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    setShowResend(false)
    if (mode === 'register') {
      const res = await onRegister(email.trim(), password, name.trim())
      if (res.ok) {
        setInfo('Bijna klaar! Check je inbox en klik op de link om je e-mailadres te bevestigen.')
        setPassword('')
      } else {
        setError(res.error)
      }
    } else if (mode === 'forgot') {
      const res = await onForgotPassword(email.trim())
      if (res.ok) {
        setInfo('Als dit account bestaat, hebben we een e-mail gestuurd met een link om je wachtwoord opnieuw in te stellen.')
      } else {
        setError(res.error)
      }
    } else {
      const res = await onLogin(email.trim(), password)
      if (!res.ok) {
        setError(res.error)
        if (res.code === 'unverified') setShowResend(true)
      }
    }
    setBusy(false)
  }

  const resend = async () => {
    setBusy(true)
    await onResend(email.trim())
    setInfo('Als dit account bestaat, is er een nieuwe verificatie-e-mail verstuurd.')
    setBusy(false)
  }

  if (mode === 'forgot') {
    return (
      <div className="space-y-3 text-left">
        <p className="text-sm" style={{ color: 'var(--brand-6b82b8)' }}>
          Vul je e-mailadres in en we sturen je een link om een nieuw wachtwoord in te stellen.
        </p>
        <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle} type="email"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mailadres" />

        {info && <p className="text-xs font-semibold" style={{ color: '#16A34A' }}>{info}</p>}

        <button onClick={submit} disabled={busy || !email}
          className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
          style={{ background: 'var(--brand-1a3fab)' }}>
          Reset-link versturen
        </button>
        <button onClick={() => switchMode('login')} className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>
          ← Terug naar inloggen
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-left">
      <div className="flex gap-2 justify-center">
        <button onClick={() => switchMode('login')}
          className="text-xs font-bold uppercase px-3 py-1.5 rounded-lg"
          style={{ color: mode === 'login' ? '#fff' : 'var(--brand-1a3fab)', background: mode === 'login' ? 'var(--brand-1a3fab)' : 'var(--brand-eef3ff)' }}>
          Inloggen
        </button>
        <button onClick={() => switchMode('register')}
          className="text-xs font-bold uppercase px-3 py-1.5 rounded-lg"
          style={{ color: mode === 'register' ? '#fff' : 'var(--brand-1a3fab)', background: mode === 'register' ? 'var(--brand-1a3fab)' : 'var(--brand-eef3ff)' }}>
          Registreren
        </button>
      </div>

      {mode === 'register' && (
        <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
          value={name} onChange={e => setName(e.target.value)} placeholder="Naam" />
      )}
      <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle} type="email"
        value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mailadres" />
      <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle} type="password"
        value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" />
      {mode === 'register' && (
        <p className="text-xs" style={{ color: 'var(--brand-a8bef0)' }}>
          Minimaal 8 tekens, met een hoofdletter, kleine letter, cijfer en speciaal teken.
        </p>
      )}
      {mode === 'login' && (
        <button onClick={() => switchMode('forgot')} className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>
          Wachtwoord vergeten?
        </button>
      )}

      {error && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{error}</p>}
      {info && <p className="text-xs font-semibold" style={{ color: '#16A34A' }}>{info}</p>}
      {showResend && (
        <button onClick={resend} disabled={busy} className="text-xs font-bold" style={{ color: 'var(--brand-1a3fab)' }}>
          Verificatie-e-mail opnieuw versturen
        </button>
      )}

      <button onClick={submit} disabled={busy || !email || !password}
        className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
        style={{ background: 'var(--brand-1a3fab)' }}>
        {mode === 'register' ? 'Account aanmaken' : 'Inloggen'}
      </button>
    </div>
  )
}

// The link in the password-reset email points at the app's own origin
// (?reset=<token>) rather than an API route — see handleForgotPassword's
// comment in api/auth/[action].ts for why — so this renders full-screen
// ahead of everything else once that param is present.
function ResetPasswordView({ token, onSubmit, onDone }: {
  token: string
  onSubmit: (token: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onDone: () => void
}) {
  const inputStyle = { border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (password !== confirm) { setError('Wachtwoorden komen niet overeen'); return }
    setBusy(true)
    setError(null)
    const res = await onSubmit(token, password)
    setBusy(false)
    if (res.ok) setDone(true)
    else setError(res.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--brand-eef3ff)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-sm space-y-4" style={{ border: '1px solid var(--brand-d0dcfa)' }}>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide text-center" style={{ color: 'var(--brand-0d2b7a)' }}>
          Nieuw wachtwoord
        </h1>
        {done ? (
          <>
            <p className="text-sm text-center" style={{ color: '#16A34A' }}>Je wachtwoord is bijgewerkt en je bent ingelogd.</p>
            <button onClick={onDone} className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'var(--brand-1a3fab)' }}>
              Naar Hockey One
            </button>
          </>
        ) : (
          <>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle} type="password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Nieuw wachtwoord" />
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle} type="password"
              value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Bevestig wachtwoord" />
            <p className="text-xs" style={{ color: 'var(--brand-a8bef0)' }}>
              Minimaal 8 tekens, met een hoofdletter, kleine letter, cijfer en speciaal teken.
            </p>
            {error && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{error}</p>}
            <button onClick={submit} disabled={busy || !password || !confirm}
              className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
              style={{ background: 'var(--brand-1a3fab)' }}>
              Wachtwoord instellen
            </button>
            <button onClick={onDone} className="w-full text-xs font-bold text-center" style={{ color: 'var(--brand-1a3fab)' }}>
              Annuleren
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Remote match history (Vercel Postgres via /api/games) ────────────────────
// Saved matches are private per account now, so this only fetches once a
// session exists — logging out clears the list rather than erroring.

// `teamKey` isn't read inside the effect — it's only here so switching teams
// (which changes which Hockey-One fixtures the API returns, see games.ts)
// re-runs the fetch instead of leaving the previous team's games on screen
// until a manual page reload.
function useRemoteGames(enabled: boolean, teamKey: string | null) {
  const [games, setGames] = useState<SavedGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) { setGames([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/games')
        if (res.status === 401) { if (!cancelled) setGames([]); return }
        if (!res.ok) throw new Error(`GET /api/games: ${res.status}`)
        const remote = (await res.json()) as SavedGame[]
        if (!cancelled) setGames(remote)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [enabled, teamKey])

  const addGame = useCallback((g: SavedGame) => {
    setGames(gs => [...gs, g])
    fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const updateGame = useCallback((g: SavedGame) => {
    setGames(gs => gs.map(x => x.id === g.id ? g : x))
    fetch('/api/games', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g) })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const deleteGame = useCallback((id: string) => {
    setGames(gs => gs.filter(x => x.id !== id))
    fetch(`/api/games?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return { games, loading, error, addGame, updateGame, deleteGame }
}

// Polls both unread counts on a plain interval rather than anything
// real-time (websockets, SSE) — this is a small club app, a ~20s badge
// delay is an entirely reasonable tradeoff against not running any
// always-on infrastructure for it.
function useNotificationCenter(enabled: boolean) {
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const refresh = useCallback(() => {
    if (!enabled) return
    fetchUnreadMessageCount().then(setUnreadMessages)
    fetchNotifications().then(({ notifications, unreadCount }) => {
      setNotifications(notifications)
      setUnreadNotifications(unreadCount)
    })
  }, [enabled])

  useEffect(() => {
    if (!enabled) { setUnreadMessages(0); setNotifications([]); setUnreadNotifications(0); return }
    refresh()
    const interval = setInterval(refresh, 20000)
    return () => clearInterval(interval)
  }, [enabled, refresh])

  const markRead = useCallback(async (id: string) => {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadNotifications(n => Math.max(0, n - 1))
    await markNotificationRead(id)
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(ns => ns.map(n => ({ ...n, read: true })))
    setUnreadNotifications(0)
    await markAllNotificationsRead()
  }, [])

  const markUnread = useCallback(async (id: string) => {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: false } : n))
    setUnreadNotifications(n => n + 1)
    await markNotificationUnread(id)
  }, [])

  const remove = useCallback(async (id: string) => {
    const target = notifications.find(n => n.id === id)
    setNotifications(ns => ns.filter(n => n.id !== id))
    if (target && !target.read) setUnreadNotifications(n => Math.max(0, n - 1))
    await deleteNotification(id)
  }, [notifications])

  return { unreadMessages, notifications, unreadNotifications, refresh, markRead, markAllRead, markUnread, remove }
}

// ── Game sharing ───────────────────────────────────────────────────────────────
// Management (list/add/remove shares) is owner-only, enforced by the API —
// gameId is only passed in as non-null when the caller already knows the
// viewer owns the game, so this never fires a doomed request otherwise.

interface GameShare {
  userId: string
  email: string
  name: string | null
  permission: 'view' | 'edit'
}

interface DirectoryUser {
  id: string
  email: string
  name: string | null
}

// Small closed roster, so any signed-in coach can browse who else has an
// account (id/email/name only) to pick a share target from — see
// api/users-list.ts for the access-control reasoning.
function useAllUsers() {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/users-list')
      .then(res => (res.ok ? res.json() : { users: [] }))
      .then(data => { if (!cancelled) setUsers(data.users ?? []) })
      .catch(() => { if (!cancelled) setUsers([]) })
    return () => { cancelled = true }
  }, [])
  return users
}

function useGameShares(gameId: string | null) {
  const [shares, setShares] = useState<GameShare[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!gameId) { setShares([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/game-shares?gameId=${encodeURIComponent(gameId)}`)
      .then(res => (res.ok ? res.json() : { shares: [] }))
      .then(data => { if (!cancelled) setShares(data.shares ?? []) })
      .catch(() => { if (!cancelled) setShares([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gameId])

  useEffect(() => refresh(), [refresh])

  const addShare = useCallback(async (email: string, permission: 'view' | 'edit') => {
    if (!gameId) return { ok: false as const, error: 'Geen wedstrijd geselecteerd' }
    const res = await fetch('/api/game-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, email, permission }),
    })
    if (res.ok) { refresh(); return { ok: true as const } }
    const body = await res.json().catch(() => ({}))
    return { ok: false as const, error: body.error ?? 'Delen mislukt' }
  }, [gameId, refresh])

  const removeShare = useCallback(async (userId: string) => {
    if (!gameId) return
    await fetch(`/api/game-shares?gameId=${encodeURIComponent(gameId)}&userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
    setShares(s => s.filter(x => x.userId !== userId))
  }, [gameId])

  return { shares, loading, addShare, removeShare }
}

function GameShareManager({ shares, onAdd, onRemove }: {
  shares: GameShare[]
  onAdd: (email: string, permission: 'view' | 'edit') => Promise<{ ok: true } | { ok: false; error: string }>
  onRemove: (userId: string) => void
}) {
  const inputStyle = { border: '1.5px solid var(--brand-d0dcfa)', background: 'var(--brand-f8faff)', outline: 'none' }
  const allUsers = useAllUsers()
  const sharedIds = new Set(shares.map(s => s.userId))
  const available = allUsers.filter(u => !sharedIds.has(u.id))
  const [userId, setUserId] = useState('')
  const [permission, setPermission] = useState<'view' | 'edit'>('view')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const target = available.find(u => u.id === userId)
    if (!target) return
    setBusy(true)
    setError(null)
    const res = await onAdd(target.email, permission)
    if (res.ok) setUserId(''); else setError(res.error)
    setBusy(false)
  }

  return (
    <div>
      <div className="space-y-2">
        <select className="w-full min-w-0 rounded-xl px-3 py-2 text-sm"
          style={{ ...inputStyle, color: userId ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)' }}
          value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Kies gebruiker…</option>
          {available.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="flex-1 min-w-0 rounded-xl px-2 py-2 text-sm" style={inputStyle}
            value={permission} onChange={e => setPermission(e.target.value as 'view' | 'edit')}>
            <option value="view">Bekijken</option>
            <option value="edit">Bewerken</option>
          </select>
          <button onClick={submit} disabled={busy || !userId}
            className="px-3 py-2 rounded-xl font-bold text-white text-sm shrink-0 disabled:opacity-50"
            style={{ background: 'var(--brand-1a3fab)' }}>
            Delen
          </button>
        </div>
      </div>
      {available.length === 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--brand-a8bef0)' }}>Geen andere gebruikers gevonden om mee te delen.</p>
      )}
      {error && <p className="text-xs font-semibold mt-1" style={{ color: '#DC2626' }}>{error}</p>}
      {shares.length > 0 && (
        <div className="mt-2 space-y-1">
          {shares.map(s => (
            <div key={s.userId} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
              style={{ background: 'var(--brand-f8faff)', border: '1px solid var(--brand-e8effd)' }}>
              <span style={{ color: 'var(--brand-1a2f6b)' }}>
                {s.name ?? s.email} <span style={{ color: 'var(--brand-7b90c8)' }}>· {s.permission === 'edit' ? 'Bewerken' : 'Bekijken'}</span>
              </span>
              <button onClick={() => onRemove(s.userId)} className="font-bold" style={{ color: '#DC2626' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Admin (user management) ───────────────────────────────────────────────────
// Gate is purely a UI convenience — the /api/admin/* routes re-check the
// session's email server-side, so hiding this section isn't the real guard.

const ADMIN_EMAIL = 'wesleyniels@gmail.com'

interface AdminUser {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  role: string | null
  defaultTeam: string | null
  defaultClub: string | null
  emailVerified: boolean
  hasPassword: boolean
  gameCount: number
  createdAt: string
  isAdmin: boolean
}

function useAdminUsers(enabled: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/admin/users')
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { if (!cancelled) setUsers(data.users) })
      .catch(() => { if (!cancelled) setError('Kon gebruikers niet laden') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled])

  useEffect(() => refresh(), [refresh])

  const deleteUser = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) setUsers(u => u.filter(x => x.id !== id))
    return res.ok
  }, [])

  const setAdmin = useCallback(async (id: string, isAdmin: boolean) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isAdmin }),
    })
    if (res.ok) setUsers(u => u.map(x => x.id === id ? { ...x, isAdmin } : x))
    return res.ok
  }, [])

  return { users, loading, error, deleteUser, setAdmin }
}

// Adding/renaming/deleting a whole team is rare (once a season, or fixing a
// typo) and admin-only. Everyday roster changes still go through the same
// TeamPlayerPhotos component a coach uses for their own team — an admin can
// open it here for any team too (api/teams/[action].ts accepts either).
function useAdminTeams(enabled: boolean) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/teams/list')
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { if (!cancelled) setTeams(data.teams) })
      .catch(() => { if (!cancelled) setError('Kon teams niet laden') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled])

  useEffect(() => refresh(), [refresh])

  const createTeam = useCallback(async (name: string) => {
    const res = await fetch('/api/teams/create-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) { const t = await res.json(); setTeams(ts => [...ts, t]) }
    return res.ok
  }, [])

  const renameTeam = useCallback(async (id: string, name: string) => {
    const res = await fetch('/api/teams/rename-team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
    if (res.ok) setTeams(ts => ts.map(t => t.id === id ? { ...t, name } : t))
    return res.ok
  }, [])

  const deleteTeam = useCallback(async (id: string) => {
    const res = await fetch(`/api/teams/delete-team?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) setTeams(ts => ts.filter(t => t.id !== id))
    return res.ok
  }, [])

  return { teams, loading, error, createTeam, renameTeam, deleteTeam }
}

// ── Splash screen ─────────────────────────────────────────────────────────────
// Shown once per browser session (sessionStorage, not localStorage — a
// reload later that day should still skip it) until the coach taps Continue.

const SPLASH_SESSION_KEY = 'fh_splash_shown'

function SplashScreen({ onContinue }: { onContinue: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8" style={{ background: '#000' }}>
      <img src="/hockey-one-splash.png" alt="Hockey One"
        className="w-full max-w-xs px-10"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease-out' }} />
      <button onClick={onContinue}
        className="text-sm font-bold uppercase italic"
        style={{ color: 'var(--brand-2563eb)', letterSpacing: '0.15em', opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease-out' }}>
        Continue →
      </button>
    </div>
  )
}

// ── Bottom bar ───────────────────────────────────────────────────────────────
// Persistent across every logged-in view except the live match (GameView
// wants the full screen). Messages navigates to its own full view since
// threads need real space; Meldingen lives in the main page's topbar instead
// (see NotificationBell) since there's only room for four destinations here.

function BottomBar({ view, user, unreadMessages, onMessages, onOpenHistory, onHome, onProfile, onTeam }: {
  view: View
  user: AuthUser
  unreadMessages: number
  onMessages: () => void
  onOpenHistory: () => void
  onHome: () => void
  onProfile: () => void
  onTeam: () => void
}) {
  const badge = (n: number) => n > 0 && (
    <span className="absolute -top-1.5 -right-2.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 text-white leading-tight" style={{ background: '#DC2626' }}>
      {n > 9 ? '9+' : n}
    </span>
  )

  // Icon-over-label tabs with a filled pill behind the active icon — the old
  // row of plain text+emoji buttons gave no sense of "where am I", which read
  // as flat/unfinished next to the rest of the app's active/inactive styling
  // (e.g. the Thuis/Uit toggle already uses this same filled-pill language).
  const tab = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badgeEl?: React.ReactNode) => (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold"
      style={{ color: active ? '#fff' : 'var(--brand-7b9de0)' }}>
      <span className="relative w-9 h-7 rounded-full flex items-center justify-center transition-colors"
        style={{ background: active ? 'var(--brand-1a3fab)' : 'transparent' }}>
        {icon}
        {badgeEl}
      </span>
      {label}
    </button>
  )

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 shadow-lg" style={{ background: 'var(--brand-0d2b7a)' }}>
      <div className="max-w-2xl mx-auto grid grid-cols-5">
        {tab(view === 'home', onHome, <IconHome size={20} />, 'Thuis')}
        {tab(view === 'history', onOpenHistory, <IconCalendar size={20} />, 'Wedstrijden')}
        {tab(view === 'team', onTeam, <IconUsers size={20} />, 'Team')}
        {tab(view === 'messages', onMessages, <IconMail size={20} />, 'Berichten', badge(unreadMessages))}
        {tab(view === 'profile', onProfile, <ProfileAvatar user={user} size={26} />, 'Profiel')}
      </div>
    </div>
  )
}

// ── Messages View ────────────────────────────────────────────────────────────
// Two-pane-in-one: a conversation list (or contact picker, for starting a
// new one) when no thread is open, and the thread itself when one is.
// Eligibility (canSend, and who shows up as a contact) always comes from
// the server — see api/messages/[action].ts — this just renders what it's
// given.

function MessagesView({ user, onProfile, onRefreshUnread, unreadNotifications, notifications, onMarkRead, onMarkAllRead, onMarkUnread, onDeleteNotification, onOpenHistory }: {
  user: AuthUser | null
  onProfile: () => void
  onRefreshUnread: () => void
  unreadNotifications: number
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onMarkUnread: (id: string) => void
  onDeleteNotification: (id: string) => void
  onOpenHistory: () => void
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [canSend, setCanSend] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeName, setActiveName] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const loadConversations = useCallback(() => {
    setLoadingConversations(true)
    fetchConversations().then(cs => { setConversations(cs); setLoadingConversations(false) })
  }, [])

  useEffect(() => {
    if (!user) return
    loadConversations()
    fetchContacts().then(({ contacts, canSend }) => { setContacts(contacts); setCanSend(canSend) })
  }, [user, loadConversations])

  const openThread = (id: string, name: string) => {
    setActiveId(id)
    setActiveName(name)
    setShowContactPicker(false)
    setLoadingThread(true)
    setSendError(null)
    fetchThread(id).then(msgs => {
      setMessages(msgs)
      setLoadingThread(false)
      onRefreshUnread()
      loadConversations()
    })
  }

  const closeThread = () => {
    setActiveId(null)
    setMessages([])
    loadConversations()
  }

  const send = async () => {
    const body = composeText.trim()
    if (!body || !activeId) return
    setSending(true)
    setSendError(null)
    const result = await sendMessage(activeId, body)
    if (result.ok) {
      setComposeText('')
      fetchThread(activeId).then(setMessages)
      loadConversations()
    } else {
      setSendError(result.error)
    }
    setSending(false)
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: 'var(--brand-eef3ff)' }}>
        <p className="text-sm text-center" style={{ color: 'var(--brand-6b82b8)' }}>Log in om berichten te bekijken en te versturen.</p>
        <button onClick={onProfile} className="px-4 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: 'var(--brand-1a3fab)' }}>Inloggen</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-eef3ff)' }}>
      <header style={{ background: 'var(--brand-0d2b7a)' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3 justify-self-start">
            {user.defaultClub ? <ClubLogo club={user.defaultClub} size={32} /> : <H1Logo height={32} />}
            <div>
              <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '16px', letterSpacing: '0.08em' }}>
                {user.defaultClub ?? 'Hockey One'}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--brand-a8bef0)', letterSpacing: '0.12em' }}>
                {user.defaultClub ? (user.role ?? 'HOCKEY ONE').toUpperCase() : 'Hockey Team Manager'}
              </p>
            </div>
          </div>
          {activeId ? (
            <h1 className="font-display text-xl font-bold uppercase tracking-widest text-center truncate">{activeName}</h1>
          ) : (
            <div className="flex justify-center">
              <H1Logo height={26} />
            </div>
          )}
          <div className="flex items-center gap-2 justify-self-end">
            {activeId && (
              <button onClick={closeThread} className="text-sm font-semibold shrink-0" style={{ color: 'var(--brand-7b9de0)' }}>
                ← Berichten
              </button>
            )}
            {!activeId && (
              <NotificationBell
                unreadNotifications={unreadNotifications}
                notifications={notifications}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onMarkUnread={onMarkUnread}
                onDelete={onDeleteNotification}
                onOpenHistory={onOpenHistory}
              />
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {activeId ? (
          <div className="space-y-3">
            {loadingThread ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Nog geen berichten. Stuur de eerste!</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm"
                    style={m.mine
                      ? { background: 'var(--brand-1a3fab)', color: '#fff' }
                      : { background: '#fff', color: 'var(--brand-1a2f6b)', border: '1px solid var(--brand-e8effd)' }}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="text-[10px] mt-1" style={{ color: m.mine ? 'rgba(255,255,255,0.7)' : 'var(--brand-a8bef0)' }}>
                      {formatRelativeTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {sendError && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{sendError}</p>}
            {canSend ? (
              <div className="flex gap-2 sticky bottom-2 pt-2">
                <input className="flex-1 rounded-xl px-3 py-2.5 text-sm" style={{ border: '1.5px solid var(--brand-d0dcfa)', background: '#fff', outline: 'none' }}
                  value={composeText} onChange={e => setComposeText(e.target.value)}
                  placeholder="Typ een bericht…"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                <button onClick={send} disabled={sending || !composeText.trim()}
                  className="px-4 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: 'var(--brand-1a3fab)' }}>
                  {sending ? '…' : 'Stuur'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-center py-2" style={{ color: 'var(--brand-a8bef0)' }}>
                Alleen coaches en trainers kunnen berichten versturen.
              </p>
            )}
          </div>
        ) : showContactPicker ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-lg font-bold uppercase" style={{ color: 'var(--brand-0d2b7a)' }}>Nieuw bericht</h2>
              <button onClick={() => setShowContactPicker(false)} className="text-sm font-semibold" style={{ color: 'var(--brand-1a3fab)' }}>Annuleren</button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>
                Geen coaches of trainers gevonden om een bericht naar te sturen.
              </p>
            ) : (
              contacts.map(c => (
                <button key={c.id} onClick={() => openThread(c.id, c.name)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: '#fff', border: '1px solid var(--brand-e8effd)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: c.isHockeyOne ? 'var(--brand-2563eb)' : 'var(--brand-1a3fab)' }}>
                    {c.isHockeyOne ? 'H1' : initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: 'var(--brand-1a2f6b)' }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--brand-7b90c8)' }}>{c.role ?? ''}{c.defaultClub ? ` · ${c.defaultClub}` : ''}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-lg font-bold uppercase" style={{ color: 'var(--brand-0d2b7a)' }}>Gesprekken</h2>
              {canSend && (
                <button onClick={() => setShowContactPicker(true)} className="px-3 py-1.5 rounded-xl font-bold text-white text-sm" style={{ background: 'var(--brand-1a3fab)' }}>
                  + Nieuw
                </button>
              )}
            </div>
            {loadingConversations ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>Laden…</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--brand-a8bef0)' }}>
                {canSend ? 'Nog geen gesprekken. Start er één met "+ Nieuw".' : 'Nog geen gesprekken.'}
              </p>
            ) : (
              conversations.map(c => (
                <button key={c.userId} onClick={() => openThread(c.userId, c.name)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: '#fff', border: '1px solid var(--brand-e8effd)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: c.isHockeyOne ? 'var(--brand-2563eb)' : 'var(--brand-1a3fab)' }}>
                    {c.isHockeyOne ? 'H1' : initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: 'var(--brand-1a2f6b)' }}>{c.name}</span>
                      <span className="text-[11px] shrink-0" style={{ color: 'var(--brand-a8bef0)' }}>{formatRelativeTime(c.lastAt)}</span>
                    </div>
                    <div className="text-xs truncate" style={{ color: c.unreadCount > 0 ? 'var(--brand-1a2f6b)' : 'var(--brand-7b90c8)', fontWeight: c.unreadCount > 0 ? 700 : 400 }}>
                      {c.mine ? 'Jij: ' : ''}{c.lastMessage}
                    </div>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 text-white shrink-0" style={{ background: '#DC2626' }}>
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem(SPLASH_SESSION_KEY) !== '1')

  const dismissSplash = () => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    setShowSplash(false)
  }

  // A password-reset email links straight back here with ?reset=<token> —
  // handled ahead of the splash screen so following the link works in one tap.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'))
  const clearResetToken = () => {
    setResetToken(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('reset')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }

  const [view, setView] = useState<View>('home')
  const [gameParams, setGameParams] = useState<GameParams | null>(null)
  const [editingGame, setEditingGame] = useState<SavedGame | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const { user, loading: authLoading, loginWithCredential, registerWithPassword, loginWithPassword, resendVerification, forgotPassword, resetPassword, logout, updateProfile } = useAuth()
  const { games, error: gamesError, addGame, updateGame, deleteGame } = useRemoteGames(!!user, user?.defaultTeam ?? null)
  const notif = useNotificationCenter(!!user)

  // The live match view (GameView) gets the full screen to itself — every
  // other view gets the bar, plus a same-height spacer so the last bit of
  // real content never sits behind the fixed bar.
  const showBottomBar = !!user && view !== 'game'
  const withBottomBar = (content: React.ReactNode) => (
    <>
      {content}
      {showBottomBar && (
        <>
          <div style={{ height: 64 }} />
          <BottomBar
            view={view}
            user={user!}
            unreadMessages={notif.unreadMessages}
            onMessages={() => setView('messages')}
            onOpenHistory={() => setView('history')}
            onHome={() => setView('home')}
            onProfile={() => setView('profile')}
            onTeam={() => setView('team')}
          />
        </>
      )}
    </>
  )

  // Recolors the app to the selected club's logo — see applyClubTheme/
  // extractDominantHue above. Runs before the splash early-return so it
  // still fires on the very first render a club is known, not just after.
  useEffect(() => {
    const club = user?.defaultClub
    if (!club) { clearClubTheme(); return }
    let cancelled = false
    fetchClubLogos().then(logos => {
      if (cancelled) return
      const src = logos[slugifyClubName(club)]
      if (!src) { clearClubTheme(); return }
      extractDominantHue(mediaSrc(src)).then(hue => {
        if (cancelled) return
        if (hue == null) clearClubTheme()
        else applyClubTheme(hue)
      })
    })
    return () => { cancelled = true }
  }, [user?.defaultClub])

  if (resetToken) return <ResetPasswordView token={resetToken} onSubmit={resetPassword} onDone={clearResetToken} />

  if (showSplash) return <SplashScreen onContinue={dismissSplash} />

  const startEdit = (game: SavedGame) => {
    setEditingGame(game)
    setGameParams({ club: game.club, team: game.team, ageGroup: game.ageGroup, opponent: game.opponent, homeAway: game.homeAway, squad: game.squad })
    setView('game')
  }

  if (view === 'profile')
    return withBottomBar(
      <ProfileView
        user={user}
        loading={authLoading}
        onCredential={loginWithCredential}
        onRegister={registerWithPassword}
        onLoginPassword={loginWithPassword}
        onResendVerification={resendVerification}
        onForgotPassword={forgotPassword}
        onLogout={logout}
        onBack={() => setView('home')}
        onHistory={() => setView('history')}
        onUpdateProfile={updateProfile}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
      />
    )
  if (view === 'history')
    return withBottomBar(
      <HistoryView
        games={games}
        user={user}
        authLoading={authLoading}
        onDelete={deleteGame}
        onEdit={startEdit}
        onProfile={() => setView('profile')}
        onCreateMatch={() => setView('setup')}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
      />
    )
  if (view === 'messages')
    return withBottomBar(
      <MessagesView
        user={user}
        onProfile={() => setView('profile')}
        onRefreshUnread={notif.refresh}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
        onOpenHistory={() => setView('history')}
      />
    )
  if (view === 'matchDetail') {
    const selectedGame = games.find(g => g.id === selectedGameId)
    if (!selectedGame) { setView('home'); return null }
    return withBottomBar(
      <MatchDetailView
        game={selectedGame}
        user={user}
        onEdit={startEdit}
        onDelete={deleteGame}
      />
    )
  }
  if (view === 'team')
    return withBottomBar(
      <TeamView
        user={user}
        games={games}
        onProfile={() => setView('profile')}
        onSelectPlayer={id => { setSelectedPlayerId(id); setView('playerProfile') }}
        onSelectStaff={id => { setSelectedStaffId(id); setView('staffProfile') }}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
      />
    )
  if (view === 'playerProfile') {
    if (!selectedPlayerId || !user?.defaultTeam) { setView('team'); return null }
    return withBottomBar(
      <PlayerProfileView
        playerId={selectedPlayerId}
        team={user.defaultTeam}
        games={games}
        user={user}
        onBack={() => setView('team')}
      />
    )
  }
  if (view === 'staffProfile') {
    if (!selectedStaffId || !user?.defaultTeam) { setView('team'); return null }
    return withBottomBar(
      <StaffProfileView
        staffId={selectedStaffId}
        team={user.defaultTeam}
        onBack={() => setView('team')}
      />
    )
  }
  if (view === 'game' && gameParams)
    return (
      <GameView
        {...gameParams}
        initial={editingGame ?? undefined}
        user={user}
        onSave={g => { if (games.some(x => x.id === g.id)) updateGame(g); else addGame(g) }}
        onBack={() => { setEditingGame(null); setView('home') }}
      />
    )
  // A logged-out visitor has no games/dashboard data for HomeView to show —
  // route them straight to the creation form instead (this is also where
  // "Wedstrijd aanmaken" from Wedstrijden and Home itself send a logged-in
  // coach).
  if (view === 'setup' || (view === 'home' && !user))
    return withBottomBar(
      <SetupView
        onStart={p => { setEditingGame(null); setGameParams(p); setView('game') }}
        onProfile={() => setView('profile')}
        user={user}
        authLoading={authLoading}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
        onOpenHistory={() => setView('history')}
      />
    )
  return withBottomBar(
    <>
      <HomeView
        user={user!}
        games={games}
        onEditGame={startEdit}
        onOpenHistory={() => setView('history')}
        onOpenMatch={id => { setSelectedGameId(id); setView('matchDetail') }}
        onCreateMatch={() => setView('setup')}
        unreadNotifications={notif.unreadNotifications}
        notifications={notif.notifications}
        onMarkRead={notif.markRead}
        onMarkAllRead={notif.markAllRead}
        onMarkUnread={notif.markUnread}
        onDeleteNotification={notif.remove}
      />
      {gamesError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs font-semibold px-4 py-2 rounded-xl shadow-lg"
          style={{ background: '#DC2626', color: '#fff' }}>
          Kon wedstrijdgeschiedenis niet synchroniseren: {gamesError}
        </div>
      )}
    </>
  )
}
