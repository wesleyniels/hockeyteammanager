import { useState, useEffect, useCallback, useRef } from 'react'
import { upload as uploadToBlob } from '@vercel/blob/client'

// ── Types ───────────────────────────────────────────────────────────────────

type AgeGroup = 'U7' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12' | 'U14' | 'U16' | 'U18' | 'Senioren'
type View = 'setup' | 'game' | 'history' | 'profile'

interface Player {
  id: string
  name: string
  number?: number
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
}

interface Card {
  id: string
  playerId: string
  color: 'green' | 'yellow' | 'red'
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

// ── Age group config ─────────────────────────────────────────────────────────

const AGE_CONFIG: Record<AgeGroup, { total: number; field: number; label: string; dual?: boolean }> = {
  U7:      { total: 6,  field: 6,  label: 'U7 — 3 tegen 3 (KNHB O7), 2 velden', dual: true },
  U8:      { total: 6,  field: 6,  label: 'U8 — 3 tegen 3 (KNHB O8), 2 velden', dual: true },
  U9:      { total: 6,  field: 5,  label: 'U9 — 6 spelers (5 veld + 1 keeper, KNHB O9 6-tegen-6)' },
  U10:     { total: 8,  field: 7,  label: 'U10 — 8 spelers (7 veld + 1 keeper, KNHB O10 8-tegen-8, half veld)' },
  U11:     { total: 9,  field: 8,  label: 'U11 — 9 spelers (8 veld + 1 keeper)' },
  U12:     { total: 11, field: 10, label: 'U12 — 11 spelers (10 veld + 1 keeper)' },
  U14:     { total: 11, field: 10, label: 'U14 — 11 spelers (10 veld + 1 keeper)' },
  U16:     { total: 11, field: 10, label: 'U16 — 11 spelers (10 veld + 1 keeper)' },
  U18:     { total: 11, field: 10, label: 'U18 — 11 spelers (10 veld + 1 keeper)' },
  Senioren:{ total: 11, field: 10, label: 'Sr. — 11 spelers (10 veld + 1 keeper)' },
}

// ── SC Muiden Teams (seizoen 2026-2027) ──────────────────────────────────────
// Team name encodes gender (M/J = Meisjes/Jongens) and KNHB age category
// (O<n> = Onder <n>), e.g. MO11-Wit = Meisjes Onder 11, team "Wit".

const SC_MUIDEN_TEAMS: Record<string, string[]> = {
  'MO18-1': [
    'Annika Aalbersberg', 'Kee Bruckel', 'Felicia Chow', 'Cato Frencken', 'Koosje Gerritsen',
    'Nova Hooijer', 'Lieve van der Hucht', 'Neele Jansen', 'Nina Kuiper', 'Amber Mansvelder',
    'Julia Monticelli', 'Kiek van Os', 'Jolie Ottervanger', 'Diya Schuffelers', 'Pien Stam',
  ],
  'MO14-1': [
    'Marie Bak', 'Isabelle Bautz', 'Elin Berkes', 'Pien Boer', 'Roos Boer',
    'Mila Eikelboom', 'Julia-Fien Kaak', 'Cato Kreuger', 'Lis van Lotringen', 'Niki Smit',
    'Elisa amelie Troncoso Schach', 'Jasmijn Verbeek', 'Rosa Wierenga', 'Eline Zoetekouw',
  ],
  'MO14-2': [
    'Victoria Aalbersberg', 'Fenna Barrero', 'Sophie Beukeboom', 'Izabella Ciocan', 'Lise de Graaf',
    'Alicia Hoedt', 'Pomme van Loosbroek', 'Jacky Nova Nelissen', 'Zena Sarryeh', 'Phéline van Schaik',
    'Valentina Sichtman', 'Florine Smit', 'Olivia Van Oord', 'Isabelle Weijers',
  ],
  'MO12-1': [
    'Jetta von der Assen', 'Lot Benink', 'Hedwig Coepijn', 'Juule Dielemans', 'Olivia van Dorp',
    'Thinka de Graaff', 'Mijntje Ketting', 'Mijntje Ketting', 'Roos Lubbinge', 'Isa van der Maat',
    'Hannah Naaijkens', 'Filippa Nordman', 'Pippa Teunissen', 'Keke van de Weijer',
  ],
  'MO12-2': [
    'Mare Bruning', 'Lilly Crouch', 'Noa Dekker', 'Lea Hendry', 'Tess Jansen',
    'Sara Kanabar', 'Olli van Lotringen', 'Lucy Meijer', 'Anna-mae Rog', 'Elisa Schönfeld',
    'Philippine Verhoeff', 'Puck de Weerdt', 'Cato Wenning', 'Emma marie Werner',
  ],
  'MO11-Blauw': [
    'Felien Bruning', 'Mabel Eerhardt', 'Micky Geersing', 'Sienna Jacques', 'Eva de Jong',
    'Anna Smeets', 'Faye Stoop', 'Annika Teeuwen', 'Jolien Toom', 'Roos Verbeek', 'Nouk van de Weijer',
  ],
  'MO11-Wit': [
    'Saar Barrero Galesloot', 'Maya Bleeker', 'Bobbie Bosman', 'Bo Gille', 'Sofia Koppenens',
    'Sophie Kroezen', 'Gigi Niels', 'Juune van Os', 'Celine Sarryeh', 'Pippa van Daalen', 'Evi Wolfs',
  ],
  'MO10-Blauw': [
    'Kiki Aerts', 'Sofie Barrero galesloot', 'Lara Brouwer', 'Elsbeth Coepijn', 'Storm Rosie Kampman',
    'Mijntje Lak', 'Fem van der Maat', 'Sophie Prinsen', 'Elise Roodenburg', 'Zoë Steltenpool', 'Cato Visser',
  ],
  'MO9-Blauw': [
    'Nola Crouch', 'Brune van Dorp', 'Sam van Keulen', 'Fientje Klick', 'Olivia Lindelauf',
    'Isa Nordman', 'Thysa de Rijk', 'Romee Tai', 'Lexi Tittel', 'Milou Wagenmans',
  ],
  'MO9-Geel': [
    'Pippa Berenschot', 'Nena Breek', 'Julie Burggraaff', 'Ada Cavell', 'Feline Coenraads',
    'Elin van Dijk', 'Louise Eiting', 'Bente Methorst', 'Maeve Postma', 'Mae Sepmeijer',
  ],
  'MO9-Oranje': [
    'Fleur Bangma', 'Kiki Groeneveld', 'Philou Huisman', 'Stella Matthijssens', 'Bente Meijer',
    'Julia Prinsen', 'Elisa Timmer', 'Bo Vonderbank', 'Loren Willems',
  ],
  'MO9-Wit': [
    'Lauren De Rijk Marschalk', 'Yuli van Erk', 'Loeka van t Hek', 'Jans Houwen', "Rim M'rabti",
    'Coco Quak', 'Fien Siemerink', 'Izzie van Spronsen', 'Philippa kate Wiggers', 'Lauren van Woerkum',
  ],
  'MO8-Blauw': [
    'Emilie Aerts', 'Amy Bautz', 'Diana Bloemarts', 'Kiki Eikelboom', 'Maren van Heumen',
    'Mayran Koning', 'Tess van den Nieuwboer', 'Jules de Rijk', 'Charlotte Teeuwen',
  ],
  'MO8-Geel': [
    'Liza van Baarsen', 'Sientje Brand', 'Julie Edens', 'Coco Geersing', 'Bowie de Lang',
    'Julie mae Oei', 'Lois Schoo noordzij', 'Robin Toom', 'Emma Van vliet',
  ],
  'MO8-Rood': [
    'Féline Beenen', 'Lize Brinkers', 'Evi Buijs', 'Pleun Gille', 'Tess Lurvink',
    'Charlie van Sabben', 'Betje roos Siecker', 'Doris Smit',
  ],
  'MO8-Wit': [
    'Kato Boerma', 'Liva Dopmeijer', 'Yfke Gijsman', 'Julie Hofman', 'Sofia Rijkse',
    'Lilli Smeets', 'Bo Timmermans', 'Florence Verhoef',
  ],
  'MO7-Blauw': [
    'Sophie Au yeung', 'Evy Huisman', 'Inez Koelemij', 'Lua Lakner', 'Mae Quak',
    'Bella Soepboer', 'Charlie Visser', 'Sasha Wagenmans', 'Janne van Wees',
  ],
  'MO7-Geel': [
    'Lara Bolsius', 'Ruby Coppen', 'Bo van Dalfsen', 'Danique Kuys', 'Julia Roodenburg',
    'Sammie Schmittmann', 'Maeve van Spronsen', 'Sophia Stoop', 'Emma Vonderbank',
  ],
  'MO7-Rood': [
    'Madelon Coenraads', 'Sophie Houthuys', 'Valerie Kooijman', 'Luce Kuipers', 'Isabelle Perotti',
    'Ella van der Ploeg', 'Harper Roosblad', 'Lara Westedt', 'Puck Wikkerman',
  ],
  'JO11-Blauw': [
    'Boudie Bautz', 'Felix Bernink', 'Doeke Eikelboom', 'Marc Eiting', 'Louis Jacobs',
    'Teun Klick', 'Melle Kloet', 'Julius Langerak', 'Lex van der Linde', 'Felix van Oss', 'Melle Siemerink',
  ],
  'JO10-Blauw': [
    'Storm Bastel', 'Hugo van Boetzelaer', 'Rafael Hermans', 'Liam Hofman', 'Jack Kuys',
    'Lodi van der Linde', 'Pepijn van Oss', 'Hugo van Schaik', 'Luc Spijkervet', 'Quin Teunissen',
    'Federico Troncoso Schach', 'James Wagenmans', 'Hugo nico de Wolf', 'Raphael Worms',
  ],
  'JO9-Blauw': [
    'Beckett Bushman', 'Zef Gezelle Meerburg', 'Jack Huttinga', 'Adam Naaijkens',
    'Joep Nieuwendijk', 'Teun Van den berg', 'Chris Wilders',
  ],
  'JO9-Wit': [
    'Joep Bosman', 'Bowie Botter', 'Benjamin Guissouma', 'Luca Hendry', 'Victor Langerak',
    'Morris van Oss', 'Daniel Puskas diaz',
  ],
  'JO8-Blauw': [
    'Alexander Burgerhout', 'Eric Domnica', 'Boaz Spijkervet', 'Alexander Steeksma',
    'Matz van der Veer', 'Boris Versteeg', 'Julian Winter',
  ],
  'JO7-Blauw': [
    'Hugo Brandon', 'Freddie le Conge kleyn', 'Lewis van Dijk', 'Tom van Dorp',
    'Ludo Eerhardt', 'Miles Gabriel', 'David Schröder',
  ],
}

function ageGroupFromTeamName(team: string): AgeGroup {
  const m = team.match(/^[MJ]O(\d+)/i)
  const candidate = m ? (`U${m[1]}` as AgeGroup) : null
  return candidate && candidate in AGE_CONFIG ? candidate : 'U7'
}

const SC_MUIDEN_TEAM_NAMES = Object.keys(SC_MUIDEN_TEAMS).sort((a, b) => {
  const ma = a.match(/^([MJ])O(\d+)-(.+)$/)!
  const mb = b.match(/^([MJ])O(\d+)-(.+)$/)!
  if (ma[1] !== mb[1]) return ma[1] === 'M' ? -1 : 1
  const na = parseInt(ma[2]), nb = parseInt(mb[2])
  if (na !== nb) return na - nb
  return ma[3].localeCompare(mb[3])
})

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

function getPositions(ag: AgeGroup): PosDef[] {
  const variant = getSelectedVariant(ag)
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

// ── Utils ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 11)
// The Blob store is private, so raw blob URLs 404 without auth — everything
// reads media through this proxy instead (see api/blob/[action].ts's 'view').
const mediaSrc = (url: string) => `/api/blob/view?url=${encodeURIComponent(url)}`
const p2 = (n: number) => n.toString().padStart(2, '0')
const fmtSec = (s: number) => `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
const fmtHM = (s: number) => {
  const totalMin = Math.round(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}u ${m}m` : `${m}m`
}
const todayStr = () => new Date().toISOString().slice(0, 10)
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

// ── SC Muiden Logo ───────────────────────────────────────────────────────────

function SCMuidenLogo({ size = 48 }: { size?: number }) {
  return (
    <img src="/sc-muiden-logo.webp" alt="SC Muiden" width={size} height={size}
      style={{ width: size, height: size, objectFit: 'contain' }} />
  )
}

function H1Logo({ height = 28 }: { height?: number }) {
  return <img src="/h1-logo.png" alt="Hockey One" style={{ height, width: 'auto' }} />
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
      fill={i % 2 === 0 ? '#1C6B38' : '#217040'} />
  ))

  // Crop the same drawing to one half by panning the viewBox — every element
  // below keeps its normal full-pitch coordinates, so nothing else changes.
  const viewBox = half === 'top' ? '0 0 62 48.5' : half === 'bottom' ? '0 48.5 62 48.5' : '0 0 62 97'

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      {stripes}

      {/* Goals (behind backlines) */}
      <rect x={goalX1} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      <rect x={goalX1} y={botY} width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>

      {/* Field boundary */}
      <rect x="1" y={topY} width="60" height={botY - topY}
        fill="none" stroke="white" strokeWidth="0.9" strokeOpacity="0.9"/>

      {/* 23m lines */}
      <line x1="1" y1={top23} x2="61" y2={top23}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.65"/>
      <line x1="1" y1={bot23} x2="61" y2={bot23}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.65"/>

      {/* Center line */}
      <line x1="1" y1="48.5" x2="61" y2="48.5"
        stroke="white" strokeWidth="0.65" strokeOpacity="0.7"/>

      {/* Shooting circles (D) — semicircles projecting INTO the field */}
      {/* Top D: arc from (cx-dR, topY) to (cx+dR, topY) bowing downward, into the field */}
      <path d={`M ${cx - dR} ${topY} A ${dR} ${dR} 0 0 0 ${cx + dR} ${topY}`}
        fill="none" stroke="white" strokeWidth="0.8" strokeOpacity="0.85"/>
      {/* Bottom D: arc from (cx-dR, botY) to (cx+dR, botY) bowing upward, into the field */}
      <path d={`M ${cx - dR} ${botY} A ${dR} ${dR} 0 0 1 ${cx + dR} ${botY}`}
        fill="none" stroke="white" strokeWidth="0.8" strokeOpacity="0.85"/>

      {/* Penalty spots */}
      <circle cx={cx} cy={topPen} r="0.65" fill="white" fillOpacity="0.8"/>
      <circle cx={cx} cy={botPen} r="0.65" fill="white" fillOpacity="0.8"/>

      {/* Center spot */}
      <circle cx={cx} cy="48.5" r="0.5" fill="white" fillOpacity="0.55"/>

      {/* Corner arcs (r=0.9m, struck from corner flags) */}
      <path d={`M 1.9 ${topY} A 0.9 0.9 0 0 1 1 ${topY + 0.9}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 61 ${topY + 0.9} A 0.9 0.9 0 0 1 60.1 ${topY}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 1 ${botY - 0.9} A 0.9 0.9 0 0 1 1.9 ${botY}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      <path d={`M 60.1 ${botY} A 0.9 0.9 0 0 1 61 ${botY - 0.9}`}
        fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
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
      fill={i % 2 === 0 ? '#1C6B38' : '#217040'} />
  ))

  const miniField = (x: number, cx: number, label: string) => (
    <g key={label}>
      {/* Goals */}
      <rect x={cx - goalW / 2} y="1" width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      <rect x={cx - goalW / 2} y={gBot} width={goalW} height="3.8" rx="0.3"
        fill="#14472A" stroke="white" strokeWidth="0.7" strokeOpacity="0.9"/>
      {/* Boundary */}
      <rect x={x} y={gy} width={fW} height={fH}
        fill="none" stroke="white" strokeWidth="0.85" strokeOpacity="0.9"/>
      {/* Center line */}
      <line x1={x} y1={centerY} x2={x + fW} y2={centerY}
        stroke="white" strokeWidth="0.55" strokeOpacity="0.6"/>
      {/* D circles — bow into the field, not out behind the goal */}
      <path d={`M ${cx - dR} ${gy} A ${dR} ${dR} 0 0 0 ${cx + dR} ${gy}`}
        fill="none" stroke="white" strokeWidth="0.75" strokeOpacity="0.85"/>
      <path d={`M ${cx - dR} ${gBot} A ${dR} ${dR} 0 0 1 ${cx + dR} ${gBot}`}
        fill="none" stroke="white" strokeWidth="0.75" strokeOpacity="0.85"/>
      {/* Penalty spots */}
      <circle cx={cx} cy={gy + 5.5} r="0.6" fill="white" fillOpacity="0.75"/>
      <circle cx={cx} cy={gBot - 5.5} r="0.6" fill="white" fillOpacity="0.75"/>
      {/* Field label */}
      <text x={cx} y="96.5" textAnchor="middle" fill="white" fontSize="5.5"
        fontWeight="800" fillOpacity="0.9" fontFamily="'Barlow Condensed',sans-serif"
        letterSpacing="1">{label}</text>
    </g>
  )

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 140 97"
      preserveAspectRatio="xMidYMid meet">
      {stripes}
      {/* Gap between fields */}
      <rect x={aX + fW} y="0" width={gap} height="97" fill="#173523" fillOpacity="0.7"/>
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
                <>
                  <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                    {player.number ?? initials(player.name)}
                  </span>
                  <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                    {firstName(player.name)}
                  </span>
                </>
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
            <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
              {draggedBenchPlayer.number ?? initials(draggedBenchPlayer.name)}
            </span>
            <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
              {firstName(draggedBenchPlayer.name)}
            </span>
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

// ── Tactics board ─────────────────────────────────────────────────────────────
// Overlaid on top of the real field (current squad positions + opponent
// markers, read-only here) so a coach can sketch a setup that's grounded in
// how the team is actually lined up. Markers are real squad players; arrows
// are drawn by dragging rather than the live field's pointer-drag machinery,
// since nothing here is tied to the actual on-field slots.

function TacticsFieldEditor({ isDual, slots, squad, oppMarkers, board, tool, selectedMarker, onFieldClick, onMarkerClick, onArrowDrawn }: {
  isDual: boolean
  slots: PositionSlot[]
  squad: Player[]
  oppMarkers: OppMarker[]
  board: TacticsBoard
  tool: 'select' | 'marker' | 'arrow'
  selectedMarker: string | null
  onFieldClick: (x: number, y: number) => void
  onMarkerClick: (id: string) => void
  onArrowDrawn: (x1: number, y1: number, x2: number, y2: number) => void
}) {
  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null
  const [dragArrow, setDragArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const draggingRef = useRef(false)

  const toPct = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    return { x, y }
  }

  const isCorner = !!board.corner

  return (
    <div
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

      {/* Live squad positions — visual reference only, not interactive here.
          Skipped for a Strafcorner board: its coordinates are calibrated for
          the full pitch and would land in the wrong spot once cropped. */}
      {!isCorner && slots.map(slot => {
        const player = getPlayer(slot.playerId)
        const isGK = slot.posId === 'gk'
        return (
          <div key={slot.posId} className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: 5 }}>
            <div style={{
              width: player ? '46px' : '36px',
              height: player ? '46px' : '36px',
              background: isGK ? '#FBBF24' : player ? '#fff' : 'rgba(255,255,255,0.18)',
              border: player ? '2px solid rgba(255,255,255,0.85)' : '1.5px dashed rgba(255,255,255,0.45)',
              borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: player ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}>
              {player ? (
                <>
                  <span style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1, color: '#111' }}>
                    {player.number ?? initials(player.name)}
                  </span>
                  <span style={{ fontSize: '8px', fontWeight: 600, color: '#333', marginTop: '1px', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                    {firstName(player.name)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{slot.label}</span>
              )}
            </div>
          </div>
        )
      })}

      {!isCorner && oppMarkers.map(o => (
        <div key={o.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${o.x}%`, top: `${o.y}%`, zIndex: 4 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#DC2626', border: '2px solid rgba(255,255,255,0.85)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
        </div>
      ))}

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
        return (
          <div key={m.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 select-none touch-none"
            style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: 10, cursor: tool === 'select' ? 'pointer' : 'default' }}
            onClick={e => { e.stopPropagation(); onMarkerClick(m.id) }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: '#fff',
              border: selectedMarker === m.id ? '2.5px solid #1A3FAB' : '2px solid rgba(13,43,122,0.5)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: selectedMarker === m.id ? '0 0 0 3px rgba(26,63,171,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#1A2F6B', lineHeight: 1 }}>
                {player ? (player.number ?? initials(player.name)) : '?'}
              </span>
              {player && (
                <span style={{ fontSize: '7px', fontWeight: 600, color: '#3B5299', marginTop: '1px', maxWidth: '36px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {firstName(player.name)}
                </span>
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
// line up; saved per age group in localStorage and picked up by getPositions().

function FormationEditorView({ ageGroup, onBack }: { ageGroup: AgeGroup; onBack: () => void }) {
  const variants = getFormationVariants(ageGroup)
  const [variantId, setVariantId] = useLS(formationVariantKey(ageGroup), variants[0].id)
  const activeVariant = variants.find(v => v.id === variantId) ?? variants[0]

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-sm font-semibold shrink-0" style={{ color: '#7B9DE0' }}>← Terug</button>
            <div>
              <h1 className="font-display text-2xl font-bold uppercase tracking-widest leading-none">Opstelling aanpassen</h1>
              <p className="text-xs mt-1" style={{ color: '#7B9DE0' }}>{AGE_CONFIG[ageGroup].label}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <H1Logo height={24} />
          </div>
          <div />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <p className="text-sm text-center" style={{ color: '#6B82B8' }}>
          Sleep de posities naar de gewenste plek op het veld. Dit wordt de standaardopstelling voor {ageGroupLabel(ageGroup)}.
        </p>

        {variants.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>
              Opstellingsvariant
            </label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
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
      <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center justify-center" style={{ border: '1px solid #D0DCFA' }}>
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
                  border: '2px solid #1A3FAB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1A3FAB' }}>{pos.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setPositions(base)}
          className="flex-1 py-3 rounded-xl font-semibold text-sm"
          style={{ background: '#F8FAFF', color: '#3B5299', border: '1.5px solid #D0DCFA' }}>
          Standaardopstelling herstellen
        </button>
        <button onClick={onBack}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white"
          style={{ background: '#1A3FAB' }}>
          Klaar
        </button>
      </div>
    </>
  )
}

// ── Setup View ───────────────────────────────────────────────────────────────

function SetupView({ onStart, onHistory, onProfile, user }: {
  onStart: (p: GameParams) => void
  onHistory: () => void
  onProfile: () => void
  user: AuthUser | null
}) {
  const [club, setClub] = useLS('fh_club', 'SC Muiden')
  const [team, setTeam] = useLS('fh_team', '')
  const ageGroup = team ? ageGroupFromTeamName(team) : 'U7'
  const [opponent, setOpponent] = useState('')
  const [opponentTeam, setOpponentTeam] = useState('')
  const [homeAway, setHomeAway] = useState<'Thuis' | 'Uit'>('Thuis')
  const [squad, setSquad] = useLS<Player[]>('fh_squad', [])
  const [newName, setNewName] = useState('')
  const [clubSearch, setClubSearch] = useState(club)
  const [showList, setShowList] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showFormationEditor, setShowFormationEditor] = useState(false)

  const filtered = KNHB_CLUBS.filter(c => c.toLowerCase().includes(clubSearch.toLowerCase()))

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

  // Selecting a team fills Selectie with its official roster; players can
  // still be added or removed manually afterwards. This only affects the
  // current match setup — it never touches the profile's preferred team,
  // which is only changed explicitly from the Profile page.
  const selectTeam = (newTeam: string) => {
    setTeam(newTeam)
    const roster = SC_MUIDEN_TEAMS[newTeam]
    if (roster) setSquad(roster.map(name => ({ id: uid(), name })))
  }

  // Once signed in, pre-select the coach's remembered team (from their
  // profile) if nothing's been picked locally yet — works across devices.
  useEffect(() => {
    if (user?.defaultTeam && !team && SC_MUIDEN_TEAMS[user.defaultTeam]) {
      selectTeam(user.defaultTeam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.defaultTeam])

  const minPlayers = AGE_CONFIG[ageGroup].total
  const canStart = (club || clubSearch) && team && (opponent || opponentTeam.trim())

  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }

  if (showFormationEditor) {
    return <FormationEditorView ageGroup={ageGroup} onBack={() => setShowFormationEditor(false)} />
  }

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-3">
            <SCMuidenLogo size={46} />
            <div>
              <h1 className="font-display font-bold uppercase leading-none" style={{ fontSize: '22px', letterSpacing: '0.08em' }}>
                SC Muiden
              </h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: '#A8BEF0', letterSpacing: '0.12em' }}>
                HOCKEY ONE
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <H1Logo height={26} />
          </div>
          <div className="flex items-center gap-2 justify-end">
            {user && (
              <button onClick={onHistory}
                className="text-sm px-3 py-1.5 rounded-lg font-semibold"
                style={{ color: '#A8BEF0', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
                Wedstrijden
              </button>
            )}
            <button onClick={onProfile}
              className={user ? 'rounded-full' : 'text-sm px-3 py-1.5 rounded-lg font-semibold'}
              style={user
                ? {}
                : { color: '#A8BEF0', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
              {user ? (
                user.picture ? (
                  <img src={user.picture} alt="Profiel" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: '#1A3FAB' }}>
                    {initials(user.name ?? user.email)}
                  </span>
                )
              ) : (
                'Inloggen'
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Team config */}
        <section className="bg-white rounded-2xl p-6 space-y-5 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Team</h2>

          <div className="relative">
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Club</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
              value={clubSearch}
              onChange={e => { setClubSearch(e.target.value); setShowList(true) }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              placeholder="Zoek club…" />
            {showList && filtered.length > 0 && (
              <div className="absolute z-10 w-full bg-white rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto"
                style={{ border: '1px solid #D0DCFA' }}>
                {filtered.map(c => (
                  <button key={c} className="w-full text-left px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: '#1A2F6B' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EEF3FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onMouseDown={() => { setClub(c); setClubSearch(c); setShowList(false) }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Teamnaam</label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: team ? '#1A2F6B' : '#7B90C8' }}
              value={team} onChange={e => selectTeam(e.target.value)}>
              <option value="">Kies team…</option>
              {SC_MUIDEN_TEAM_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {team && (
              <>
                <p className="text-xs mt-2 font-medium" style={{ color: '#7B90C8' }}>{AGE_CONFIG[ageGroup].label}</p>
                <button onClick={() => setShowFormationEditor(true)}
                  className="text-xs font-bold mt-1"
                  style={{ color: '#1A3FAB' }}>
                  Opstelling aanpassen →
                </button>
              </>
            )}
          </div>
        </section>

        {/* Match */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Tegenstander</h2>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Club</label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: opponent ? '#1A2F6B' : '#7B90C8' }}
              value={opponent} onChange={e => setOpponent(e.target.value)}>
              <option value="">Kies club tegenstander…</option>
              {KNHB_CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" className="w-full rounded-xl px-3 py-2.5 text-sm mt-2" style={inputStyle}
              value={opponentTeam} onChange={e => setOpponentTeam(e.target.value)}
              placeholder="Teamnaam (bijv. MO11-1 of JO9-Blauw)" />
          </div>
          <div className="flex gap-3">
            {(['Thuis', 'Uit'] as const).map(ha => (
              <button key={ha} onClick={() => setHomeAway(ha)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={homeAway === ha
                  ? { background: '#1A3FAB', color: '#fff', border: '1.5px solid #1A3FAB' }
                  : { background: '#F8FAFF', color: '#3B5299', border: '1.5px solid #D0DCFA' }}>
                {ha}
              </button>
            ))}
          </div>
        </section>

        {/* Squad */}
        <section className="bg-white rounded-2xl p-6 space-y-4 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Selectie</h2>
            <span className="text-sm font-bold" style={{ color: squad.length >= minPlayers ? '#16A34A' : '#7B90C8' }}>
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
              style={{ background: '#1A3FAB' }}>+</button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {squad.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: '#A8BEF0' }}>Voeg spelers toe aan de selectie</p>
            )}
            {sortPlayers(squad).map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: '#F0F5FF', border: '1px solid #E4ECFE' }}>
                {editId === p.id ? (
                  <>
                    <input className="flex-1 rounded-lg px-2 py-1 text-sm"
                      style={{ border: '1px solid #D0DCFA', background: 'white' }}
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)} />
                    <button onClick={() => saveEdit(p.id)}
                      className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: '#16A34A' }}>✓</button>
                    <button onClick={() => setEditId(null)}
                      className="text-xs px-2 py-1 rounded-lg" style={{ color: '#7B90C8' }}>✕</button>
                  </>
                ) : (
                  <>
                    {p.number != null && (
                      <span className="font-mono text-sm font-bold w-8 text-center" style={{ color: '#1A3FAB' }}>#{p.number}</span>
                    )}
                    <span className="flex-1 text-sm font-semibold" style={{ color: '#1A2F6B' }}>{p.name}</span>
                    <button onClick={() => { setEditId(p.id); setEditName(p.name) }}
                      className="text-xs px-2 py-0.5 rounded-lg" style={{ color: '#A8BEF0' }}>✎</button>
                    <button onClick={() => setSquad(s => s.filter(x => x.id !== p.id))}
                      className="text-lg leading-none ml-1" style={{ color: '#C8D5F5' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#C8D5F5')}>×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <button
          disabled={!canStart}
          onClick={() => onStart({ club: club || clubSearch, team, ageGroup, opponent: opponentTeam.trim() || opponent, homeAway, squad })}
          className="w-full py-4 rounded-2xl font-display text-xl font-bold uppercase tracking-widest text-white shadow-lg"
          style={{ background: canStart ? '#1A3FAB' : '#B8C8F0', cursor: canStart ? 'pointer' : 'not-allowed' }}>
          Wedstrijd starten →
        </button>
        {!canStart && (
          <p className="text-xs text-center -mt-3" style={{ color: '#A8BEF0' }}>
            Vul club, team en tegenstander in
          </p>
        )}
      </div>
    </div>
  )
}

// ── Game View ────────────────────────────────────────────────────────────────

function normalizeSlots(saved: PositionSlot[] | undefined, ageGroup: AgeGroup): PositionSlot[] {
  const template = getPositions(ageGroup)
  if (!saved) return template.map(p => ({ posId: p.id, label: p.label, playerId: null, x: p.x, y: p.y }))
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

function GameView({ club, team, ageGroup, opponent, homeAway, squad, initial, user, onSave, onBack }: GameParams & {
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

  const [slots, setSlots] = useState<PositionSlot[]>(() => normalizeSlots(initial?.slots, ageGroup))
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
  const [tacticsBoards, setTacticsBoards] = useState<TacticsBoard[]>(() =>
    initial?.tacticsBoards?.length ? initial.tacticsBoards : [{ id: uid(), name: 'Opstelling 1', markers: [], arrows: [] }]
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
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)
  const [activeTab, setActiveTab] = useState<'bench' | 'subs' | 'notes' | 'tactics' | 'media'>('bench')
  const [panelCollapsed, setPanelCollapsed] = useLS('fh_panel_collapsed', false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      markers: [], arrows: [], corner,
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

  const handleTacticsArrowDrawn = (x1: number, y1: number, x2: number, y2: number) => {
    if (readOnly) return
    updateActiveBoard(b => ({ ...b, arrows: [...b.arrows, { id: uid(), x1, y1, x2, y2 }] }))
  }

  const handleTacticsMarkerClick = (id: string) => {
    if (readOnly || tacticsTool !== 'select') return
    setSelectedTacticsMarker(sel => (sel === id ? null : id))
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
    if (readOnly) return
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
    if (readOnly) return
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
      setActiveTab('bench')
    }
  }

  const handleBenchClick = (playerId: string) => {
    if (suppressClickRef.current || readOnly) return
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

  const saveGame = () => {
    if (readOnly) return
    if (!user) {
      alert('Log in met Google om wedstrijden op te slaan (zie Profiel rechtsboven op het startscherm).')
      return
    }
    onSave({
      id: initial?.id ?? uid(),
      date: initial?.date ?? todayStr(),
      club, team, ageGroup, opponent, homeAway, squad, slots, subs, oppMarkers, goals, cards, tacticsBoards, playedSeconds, media, notes, result,
      scoreOwn, scoreOpp,
      finalTime: gameSec,
      ownerId: initial?.ownerId ?? user.id,
      permission: initial?.permission ?? 'owner',
    })
    alert('Wedstrijd opgeslagen!')
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: '#EEF3FF' }}
      onClick={() => setSelected(null)}>

      {/* Header */}
      <div className="shrink-0 text-white px-3 py-2" style={{ background: '#0D2B7A' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={onBack} className="text-xs shrink-0 font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
            <SCMuidenLogo size={30} />
            <div className="min-w-0">
              <div className="font-display font-bold text-sm leading-none truncate">{club} {team}</div>
              <div className="text-xs leading-none mt-0.5 truncate" style={{ color: '#7B9DE0' }}>
                {homeAway === 'Thuis' ? 'vs' : '@'} {opponent} · {ageGroupLabel(ageGroup)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="font-mono font-bold text-sm tabular-nums px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
              {scoreOwn} - {scoreOpp}
            </div>
            <div className="font-mono font-bold text-xl tabular-nums">{fmtSec(gameSec)}</div>
            {!readOnly && (
              <button onClick={e => { e.stopPropagation(); setRunning(r => !r) }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: running ? '#D97706' : '#16A34A', color: '#fff' }}>
                {running ? '⏸' : '▶'}
              </button>
            )}
            {readOnly ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(255,255,255,0.12)', color: '#A8BEF0' }}>
                Alleen-lezen
              </span>
            ) : (
              <button onClick={e => { e.stopPropagation(); saveGame() }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: '#1A3FAB' }}>
                Opslaan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Field column */}
        <div className="flex flex-col flex-1 overflow-hidden p-3 items-center"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between w-full mb-2"
            style={{ maxWidth: isDual ? (panelCollapsed ? '820px' : '540px') : (panelCollapsed ? '460px' : '290px') }}>
            <span className="text-xs font-bold" style={{ color: '#6B82B8' }}>
              Op veld:&nbsp;
              <span style={{ color: onFieldCount < targetCount ? '#DC2626' : '#16A34A' }}>
                {onFieldCount}/{targetCount}
              </span>
            </span>
            {selected ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#DBEAFE', color: '#1A3FAB' }}>
                {selected.type === 'bench'
                  ? `Kies positie voor ${getPlayer(selected.playerId)?.name.split(' ')[0]}`
                  : selected.type === 'opp-pool' || selected.type === 'opp-marker'
                    ? 'Tik op het veld om de tegenstander te plaatsen'
                    : selectedFieldPlayer ? `${selectedFieldPlayer.name.split(' ')[0]} geselecteerd` : 'Positie geselecteerd'}
              </span>
            ) : (
              <span className="text-xs" style={{ color: '#A8BEF0' }}>Sleep of klik om te wisselen</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center w-full"
            style={{ maxWidth: isDual ? (panelCollapsed ? '820px' : '540px') : (panelCollapsed ? '460px' : '290px') }}>
            {activeTab === 'tactics' ? (
              <TacticsFieldEditor
                isDual={isDual}
                slots={slots}
                squad={squad}
                oppMarkers={oppMarkers}
                board={activeBoard}
                tool={tacticsTool}
                selectedMarker={selectedTacticsMarker}
                onFieldClick={handleTacticsFieldClick}
                onMarkerClick={handleTacticsMarkerClick}
                onArrowDrawn={handleTacticsArrowDrawn}
              />
            ) : (
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
            )}
          </div>

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
                style={{ background: '#D0DCFA', color: '#1A3FAB' }}>
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
                style={{ background: '#D0DCFA', color: '#1A3FAB' }}>
                Annuleer
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        {panelCollapsed ? (
          <button
            onClick={e => { e.stopPropagation(); setPanelCollapsed(false) }}
            className="w-8 flex flex-col items-center gap-3 pt-3 bg-white shrink-0"
            style={{ borderLeft: '1px solid #D0DCFA' }}>
            <span style={{ color: '#1A3FAB', fontSize: '14px', fontWeight: 800, lineHeight: 1 }}>‹</span>
            <span className="text-xs font-bold" style={{ color: '#7B90C8', writingMode: 'vertical-rl' }}>
              Bank ({benchPlayers.length})
            </span>
          </button>
        ) : (
        <div className="w-64 flex flex-col bg-white shrink-0 overflow-hidden"
          style={{ borderLeft: '1px solid #D0DCFA' }}
          onClick={e => e.stopPropagation()}>
          {/* Tabs */}
          <div className="flex shrink-0 items-stretch" style={{ borderBottom: '1px solid #E8EFFD' }}>
            <button onClick={() => setPanelCollapsed(true)}
              className="shrink-0 px-2 text-sm font-bold"
              style={{ color: '#A8BEF0' }}>
              ›
            </button>
            {(['bench', 'subs', 'notes', 'tactics', 'media'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  color: activeTab === tab ? '#1A3FAB' : '#A8BEF0',
                  borderBottom: activeTab === tab ? '2.5px solid #1A3FAB' : '2.5px solid transparent',
                }}>
                {tab === 'bench' ? `Bank (${benchPlayers.length})` : tab === 'subs' ? `Wissels (${subs.length})` : tab === 'notes' ? 'Score' : tab === 'tactics' ? 'Tactiek' : 'Media'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'bench' && (
              <div className="p-2 space-y-1.5">
                {benchPlayers.length === 0 ? (
                  <div className="text-xs text-center py-8 rounded-xl border-2 border-dashed m-2"
                    style={{ color: '#A8BEF0', borderColor: '#D0DCFA' }}>
                    Alle spelers staan op het veld
                  </div>
                ) : (
                  [...benchPlayers].sort((a, b) => (a.player.number ?? Infinity) - (b.player.number ?? Infinity) || a.player.name.localeCompare(b.player.name)).map(({ playerId, sinceGameSec, player }) => {
                    const elapsed = Math.max(0, gameSec - sinceGameSec)
                    const isSel = selected?.type === 'bench' && selected.playerId === playerId
                    const isBeingDragged = dragPreview?.type === 'bench' && dragPreview.id === playerId
                    return (
                      <div key={playerId}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-grab transition-all touch-none select-none"
                        style={{
                          background: isSel ? '#EEF3FF' : '#F8FAFF',
                          border: isSel ? '1.5px solid #1A3FAB' : '1.5px solid #E8EFFD',
                          opacity: isBeingDragged ? 0.35 : 1,
                        }}
                        onPointerDown={e => beginDrag('bench', playerId, e)}
                        onClick={() => handleBenchClick(playerId)}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: '#1A3FAB' }}>
                          {player.number ?? initials(player.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: '#1A2F6B' }}>{player.name}</div>
                          <div className="font-mono text-xs font-bold mt-0.5"
                            style={{ color: gameSec > 0 ? benchColor(elapsed) : '#A8BEF0' }}>
                            {gameSec > 0 ? fmtSec(elapsed) : '—:—'}
                          </div>
                        </div>
                        {isSel && <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>↔</span>}
                      </div>
                    )
                  })
                )}

                <div className="mt-4 pt-3 px-1" style={{ borderTop: '1px solid #E8EFFD' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase" style={{ color: '#7B90C8', letterSpacing: '0.08em' }}>
                      Tegenstander ({oppAvailable} beschikbaar)
                    </span>
                    {oppMarkers.length > 0 && !readOnly && (
                      <button onClick={() => setOppMarkers([])} className="text-xs font-bold" style={{ color: '#DC2626' }}>
                        Wis
                      </button>
                    )}
                  </div>
                  <p className="text-xs mb-2" style={{ color: selected?.type === 'opp-pool' ? '#1A3FAB' : '#A8BEF0' }}>
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
                          border: selected?.type === 'opp-pool' ? '2.5px solid #1A3FAB' : '2px solid #fff',
                          boxShadow: selected?.type === 'opp-pool' ? '0 0 0 3px rgba(26,63,171,0.35)' : '0 2px 6px rgba(0,0,0,0.25)',
                        }}
                        onPointerDown={e => beginDrag('opp-pool', 'new', e)}
                        onClick={handleOppPoolClick} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subs' && (
              <div className="p-3 space-y-2">
                {subs.length === 0 && (
                  <p className="text-xs text-center py-8" style={{ color: '#A8BEF0' }}>Nog geen wissels</p>
                )}
                {subs.map((s, i) => {
                  const pIn = getPlayer(s.playerInId)
                  const pOut = getPlayer(s.playerOutId)
                  return (
                    <div key={i} className="py-2.5 rounded-xl px-3"
                      style={{ background: '#F0F5FF', border: '1px solid #E4ECFE' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono text-xs font-bold" style={{ color: '#7B90C8' }}>{fmtSec(s.gameTimeSec)}</span>
                        {s.posLabel && (
                          <span className="text-xs font-bold px-1.5 rounded" style={{ color: '#1A3FAB', background: '#E4ECFE' }}>{s.posLabel}</span>
                        )}
                      </div>
                      <div className="text-xs font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.number ? `#${pIn.number} ` : ''}{pIn?.name}</div>
                      <div className="text-xs font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.number ? `#${pOut.number} ` : ''}{pOut?.name}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Scorebord</label>
                  <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF' }}>
                    <div className="flex-1 text-center min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: '#6B82B8' }}>{team || 'Eigen team'}</div>
                      <div className="flex items-center justify-center gap-2.5 mt-1">
                        <button onClick={() => setScoreOwn(s => Math.max(0, s - 1))} disabled={readOnly}
                          className="w-7 h-7 rounded-lg font-bold text-sm disabled:opacity-50" style={{ background: '#D0DCFA', color: '#1A3FAB' }}>−</button>
                        <span className="font-mono font-bold text-xl w-6 text-center" style={{ color: '#1A2F6B' }}>{scoreOwn}</span>
                        <button onClick={() => setScoreOwn(s => s + 1)} disabled={readOnly}
                          className="w-7 h-7 rounded-lg font-bold text-sm text-white disabled:opacity-50" style={{ background: '#1A3FAB' }}>+</button>
                      </div>
                    </div>
                    <div className="font-bold text-sm shrink-0" style={{ color: '#A8BEF0' }}>–</div>
                    <div className="flex-1 text-center min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: '#6B82B8' }}>{opponent || 'Tegenstander'}</div>
                      <div className="flex items-center justify-center gap-2.5 mt-1">
                        <button onClick={() => setScoreOpp(s => Math.max(0, s - 1))} disabled={readOnly}
                          className="w-7 h-7 rounded-lg font-bold text-sm disabled:opacity-50" style={{ background: '#D0DCFA', color: '#1A3FAB' }}>−</button>
                        <span className="font-mono font-bold text-xl w-6 text-center" style={{ color: '#1A2F6B' }}>{scoreOpp}</span>
                        <button onClick={() => setScoreOpp(s => s + 1)} disabled={readOnly}
                          className="w-7 h-7 rounded-lg font-bold text-sm text-white disabled:opacity-50" style={{ background: '#1A3FAB' }}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Doelpuntenmakers</label>
                  <div className="flex gap-2">
                    <select className="flex-1 rounded-xl px-3 py-2 text-sm" disabled={readOnly}
                      style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: goalPlayerId ? '#1A2F6B' : '#7B90C8', outline: 'none' }}
                      value={goalPlayerId} onChange={e => setGoalPlayerId(e.target.value)}>
                      <option value="">Kies speler…</option>
                      {sortPlayers(squad).map(p => (
                        <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
                      ))}
                    </select>
                    <button onClick={() => {
                      if (readOnly || !goalPlayerId) return
                      setGoals(g => [...g, { id: uid(), playerId: goalPlayerId }])
                    }}
                      disabled={readOnly}
                      className="px-4 py-2 rounded-xl font-bold text-white text-lg shrink-0 disabled:opacity-50"
                      style={{ background: '#1A3FAB' }}>
                      +
                    </button>
                  </div>
                  {goals.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {goals.map(g => {
                        const p = getPlayer(g.playerId)
                        return (
                          <div key={g.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                            style={{ background: '#F8FAFF', border: '1px solid #E8EFFD' }}>
                            <span style={{ color: '#1A2F6B' }}><HockeyBallIcon /> {p ? `${p.number ? `#${p.number} ` : ''}${p.name}` : 'Onbekende speler'}</span>
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
                  <p className="text-xs mt-1.5" style={{ color: goals.length === scoreOwn ? '#7B90C8' : '#D97706' }}>
                    {goals.length} van de {scoreOwn} doelpunten toegewezen
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Kaarten</label>
                  <select className="w-full rounded-xl px-3 py-2 text-sm" disabled={readOnly}
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: cardPlayerId ? '#1A2F6B' : '#7B90C8', outline: 'none' }}
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
                          border: cardColor === c ? '2px solid #1A2F6B' : '2px solid transparent',
                        }}
                        aria-label={c} />
                    ))}
                    <button onClick={() => {
                      if (readOnly || !cardPlayerId) return
                      setCards(c => [...c, { id: uid(), playerId: cardPlayerId, color: cardColor }])
                    }}
                      disabled={readOnly}
                      className="px-4 py-1 rounded-xl font-bold text-white text-lg shrink-0 disabled:opacity-50"
                      style={{ background: '#1A3FAB' }}>
                      +
                    </button>
                  </div>
                  {cards.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {cards.map(c => {
                        const p = getPlayer(c.playerId)
                        return (
                          <div key={c.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                            style={{ background: '#F8FAFF', border: '1px solid #E8EFFD' }}>
                            <span style={{ color: '#1A2F6B' }}>
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
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Speeltijd</label>
                  <div className="space-y-1">
                    {sortPlayers(squad).map(p => {
                      const onField = slots.some(s => s.playerId === p.id)
                      return (
                        <div key={p.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                          style={{ background: '#F8FAFF', border: '1px solid #E8EFFD' }}>
                          <span style={{ color: '#1A2F6B' }}>
                            {onField && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: '#16A34A' }} />}
                            {p.number ? `#${p.number} ` : ''}{p.name}
                          </span>
                          <span className="font-mono font-bold" style={{ color: '#3B5299' }}>{fmtSec(playedSeconds[p.id] ?? 0)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Notities</label>
                  <textarea className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
                    rows={8} value={notes} onChange={e => setNotes(e.target.value)} readOnly={readOnly}
                    placeholder="Tactische notities, bijzonderheden…" />
                </div>
              </div>
            )}

            {activeTab === 'tactics' && (
              <div className="p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold uppercase" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Opstellingen</label>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <button onClick={() => addBoard(false)} className="text-xs font-bold" style={{ color: '#1A3FAB' }}>
                          + Opstelling
                        </button>
                        <button onClick={() => addBoard(true)} className="text-xs font-bold" style={{ color: '#1A3FAB' }}>
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
                            ? { background: '#1A3FAB', color: '#fff' }
                            : { background: '#F8FAFF', color: '#3B5299', border: '1px solid #D0DCFA' }}>
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
                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Gereedschap</label>
                    <div className="flex gap-2">
                      {([
                        { key: 'select', label: 'Selecteer' },
                        { key: 'marker', label: '+ Speler' },
                        { key: 'arrow', label: '+ Pijl' },
                      ] as const).map(t => (
                        <button key={t.key} onClick={() => { setTacticsTool(t.key); setSelectedTacticsMarker(null); setTacticsPlayerId('') }}
                          className="flex-1 py-2 rounded-lg text-xs font-bold"
                          style={tacticsTool === t.key
                            ? { background: '#1A3FAB', color: '#fff' }
                            : { background: '#F8FAFF', color: '#3B5299', border: '1px solid #D0DCFA' }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {tacticsTool === 'marker' ? (
                      <div className="mt-2">
                        <select className="w-full rounded-xl px-3 py-2 text-sm"
                          style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: tacticsPlayerId ? '#1A2F6B' : '#7B90C8', outline: 'none' }}
                          value={tacticsPlayerId} onChange={e => setTacticsPlayerId(e.target.value)}>
                          <option value="">Kies speler…</option>
                          {sortPlayers(squad.filter(p => !activeBoard.markers.some(m => m.playerId === p.id))).map(p => (
                            <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
                          ))}
                        </select>
                        <p className="text-xs mt-1.5" style={{ color: '#A8BEF0' }}>
                          {tacticsPlayerId ? 'Tik op het veld om te plaatsen.' : 'Kies eerst een speler.'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs mt-1.5" style={{ color: '#A8BEF0' }}>
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
                    <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Pijlen</label>
                    <div className="space-y-1">
                      {activeBoard.arrows.map((a, i) => (
                        <div key={a.id} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
                          style={{ background: '#F8FAFF', border: '1px solid #E8EFFD' }}>
                          <span style={{ color: '#1A2F6B' }}>Pijl {i + 1}</span>
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
            )}

            {activeTab === 'media' && (
              <div className="p-3 space-y-3">
                {!readOnly && (
                  <input ref={mediaFileInputRef} type="file" accept="image/*,video/*" multiple
                    className="hidden" onChange={e => { handleMediaUpload(e.target.files); e.target.value = '' }} />
                )}
                {readOnly && media.length === 0 ? (
                  <div className="text-xs text-center py-8 rounded-xl border-2 border-dashed"
                    style={{ color: '#A8BEF0', borderColor: '#D0DCFA' }}>
                    Geen foto's of video's
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {!readOnly && (
                      <button onClick={() => mediaFileInputRef.current?.click()} disabled={uploading}
                        className="flex flex-col items-center justify-center gap-1 h-24 rounded-xl border-2 border-dashed disabled:opacity-50"
                        style={{ borderColor: '#D0DCFA', color: '#7B90C8' }}>
                        <span className="text-2xl leading-none font-bold">+</span>
                        <span className="text-xs font-bold">{uploading ? 'Uploaden…' : 'Toevoegen'}</span>
                      </button>
                    )}
                    {media.map(item => (
                      <button key={item.id} onClick={() => setPreviewMedia(item)}
                        className="relative rounded-xl overflow-hidden h-24" style={{ border: '1px solid #D0DCFA', background: '#0D2B7A' }}>
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
        </div>
        )}
      </div>

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

function HistoryView({ games, user, authLoading, onBack, onDelete, onEdit, onProfile }: {
  games: SavedGame[]
  user: AuthUser | null
  authLoading: boolean
  onBack: () => void
  onDelete: (id: string) => void
  onEdit: (game: SavedGame) => void
  onProfile: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const getPlayer = (g: SavedGame, id: string) => g.squad.find(p => p.id === id)

  // Sum minutes played across every saved match — `games` is already ordered
  // oldest-first (per the API), so overwriting on each pass keeps the most
  // recent name/number for a player whose squad entry changed over time.
  const seasonPlaytime = (() => {
    const totals: Record<string, number> = {}
    const info: Record<string, { name: string; number?: number }> = {}
    for (const g of games) {
      for (const p of g.squad) info[p.id] = { name: p.name, number: p.number }
      for (const [pid, sec] of Object.entries(g.playedSeconds ?? {})) {
        totals[pid] = (totals[pid] ?? 0) + sec
      }
    }
    return Object.entries(totals)
      .map(([id, sec]) => ({ id, sec, ...info[id] }))
      .filter(p => p.name)
      .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name))
  })()

  const expandedGame = games.find(g => g.id === expanded) ?? null
  const canManageSharing = !!expandedGame && (expandedGame.ownerId ?? user?.id) === user?.id
  const { shares, addShare, removeShare } = useGameShares(canManageSharing ? expanded : null)

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-sm font-semibold shrink-0" style={{ color: '#7B9DE0' }}>← Terug</button>
            <SCMuidenLogo size={32} />
            <h1 className="font-display text-2xl font-bold uppercase tracking-widest">Wedstrijd Geschiedenis</h1>
          </div>
          <div className="flex justify-center">
            <H1Logo height={24} />
          </div>
          <div />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {!authLoading && !user ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔒</div>
            <p className="font-display text-xl font-bold uppercase mb-3" style={{ color: '#A8BEF0' }}>Log in om je wedstrijden te zien</p>
            <button onClick={onProfile}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: '#1A3FAB' }}>
              Naar profiel →
            </button>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏑</div>
            <p className="font-display text-xl font-bold uppercase" style={{ color: '#A8BEF0' }}>Nog geen wedstrijden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {seasonPlaytime.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
                <h2 className="font-display text-sm font-bold uppercase mb-3" style={{ color: '#7B90C8', letterSpacing: '0.08em' }}>
                  Speeltijd — alle wedstrijden
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {seasonPlaytime.map(p => (
                    <span key={p.id} className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
                      {p.number != null && <span className="font-mono font-bold" style={{ color: '#1A3FAB' }}>#{p.number} </span>}
                      {p.name} <span style={{ color: '#3B5299' }}>· {fmtHM(p.sec)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {[...games].reverse().map(g => (
              <div key={g.id} className="bg-white rounded-2xl overflow-hidden shadow-sm"
                style={{ border: '1px solid #D0DCFA' }}>
                <button className="w-full text-left px-5 py-4 flex items-center justify-between"
                  onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold leading-tight" style={{ color: '#0D2B7A' }}>
                      {g.club} {g.team}&nbsp;
                      <span style={{ color: '#7B90C8', fontWeight: 400 }}>{g.homeAway === 'Thuis' ? 'vs' : '@'}</span>
                      &nbsp;{g.opponent}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5">
                      <span className="text-xs font-medium" style={{ color: '#7B90C8' }}>{g.date}</span>
                      <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{ageGroupLabel(g.ageGroup)}</span>
                      {typeof g.scoreOwn === 'number' && typeof g.scoreOpp === 'number' ? (
                        <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{g.scoreOwn} - {g.scoreOpp}</span>
                      ) : g.result ? (
                        <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{g.result}</span>
                      ) : null}
                      <span className="text-xs font-mono" style={{ color: '#A8BEF0' }}>{fmtSec(g.finalTime)}</span>
                      {g.ownerId && user && g.ownerId !== user.id && (
                        <span className="text-xs font-bold px-1.5 rounded" style={{ color: '#6D28D9', background: '#EDE9FE' }}>
                          Gedeeld · {g.permission === 'edit' ? 'Bewerken' : 'Bekijken'}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs ml-4 shrink-0" style={{ color: '#C8D5F5' }}>
                    {expanded === g.id ? '▲' : '▼'}
                  </span>
                </button>

                {expanded === g.id && (
                  <div className="px-5 pb-5" style={{ borderTop: '1px solid #EEF3FF' }}>
                    <div className="pt-4 space-y-4">
                      <div>
                        <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>
                          Selectie ({g.squad.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {sortPlayers(g.squad).map(p => (
                            <span key={p.id} className="text-xs px-2 py-1 rounded-lg font-medium"
                              style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
                              {p.number != null && <span className="font-mono font-bold" style={{ color: '#1A3FAB' }}>#{p.number} </span>}{p.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {g.subs.length > 0 && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Wissels</h4>
                          <div className="space-y-1">
                            {g.subs.map((s, i) => {
                              const pIn = getPlayer(g, s.playerInId)
                              const pOut = getPlayer(g, s.playerOutId)
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono font-bold w-10 shrink-0" style={{ color: '#7B90C8' }}>{fmtSec(s.gameTimeSec)}</span>
                                  {s.posLabel && (
                                    <span className="text-xs font-bold px-1.5 rounded shrink-0" style={{ color: '#1A3FAB', background: '#E4ECFE' }}>{s.posLabel}</span>
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
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Doelpunten</h4>
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
                                  style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
                                  <HockeyBallIcon /> {p?.name ?? 'Onbekende speler'}{count > 1 ? ` ×${count}` : ''}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {g.cards && g.cards.length > 0 && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Kaarten</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {g.cards.map(c => {
                              const p = getPlayer(g, c.playerId)
                              return (
                                <span key={c.id} className="text-xs px-2 py-1 rounded-lg font-medium"
                                  style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
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
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Speeltijd</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(g.playedSeconds)
                              .map(([playerId, sec]) => ({ playerId, sec, player: getPlayer(g, playerId) }))
                              .filter((x): x is { playerId: string; sec: number; player: Player } => !!x.player)
                              .sort((a, b) => (a.player.number ?? Infinity) - (b.player.number ?? Infinity) || a.player.name.localeCompare(b.player.name))
                              .map(x => (
                                <span key={x.playerId} className="text-xs px-2 py-1 rounded-lg font-medium"
                                  style={{ background: '#EEF3FF', color: '#1A2F6B', border: '1px solid #D0DCFA' }}>
                                  {x.player.name} <span style={{ color: '#3B5299' }}>· {fmtSec(x.sec)}</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}

                      {g.media && g.media.length > 0 && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Media</h4>
                          <div className="grid grid-cols-4 gap-1.5">
                            {g.media.map(item => (
                              <a key={item.id} href={mediaSrc(item.url)} target="_blank" rel="noreferrer"
                                className="block rounded-lg overflow-hidden" style={{ border: '1px solid #D0DCFA', background: '#0D2B7A' }}>
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
                          <h4 className="font-display text-sm font-bold uppercase mb-1" style={{ color: '#7B90C8' }}>Notities</h4>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: '#3B4F7A' }}>{g.notes}</p>
                        </div>
                      )}

                      {canManageSharing && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-2" style={{ color: '#7B90C8' }}>Delen</h4>
                          <GameShareManager shares={shares} onAdd={addShare} onRemove={removeShare} />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => onEdit(g)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                          style={{ background: '#1A3FAB' }}>
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
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Profile View ─────────────────────────────────────────────────────────────

function ProfileView({ user, loading, onCredential, onRegister, onLoginPassword, onResendVerification, onLogout, onBack, onHistory, gameCount, onUpdateProfile }: {
  user: AuthUser | null
  loading: boolean
  onCredential: (credential: string) => void
  onRegister: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onLoginPassword: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  onResendVerification: (email: string) => Promise<void>
  onLogout: () => void
  onBack: () => void
  onHistory: () => void
  gameCount: number
  onUpdateProfile: (fields: Partial<Pick<AuthUser, 'defaultTeam' | 'firstName' | 'lastName' | 'role' | 'picture'>>) => void
}) {
  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [role, setRole] = useState(user?.role ?? '')
  const [saved, setSaved] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFirstName(user?.firstName ?? '')
    setLastName(user?.lastName ?? '')
    setRole(user?.role ?? '')
  }, [user?.firstName, user?.lastName, user?.role])

  const saveDetails = () => {
    onUpdateProfile({ firstName: firstName || null, lastName: lastName || null, role: role || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-sm font-semibold shrink-0" style={{ color: '#7B9DE0' }}>← Terug</button>
            <SCMuidenLogo size={32} />
            <h1 className="font-display text-2xl font-bold uppercase tracking-widest">Profiel</h1>
          </div>
          <div className="flex justify-center">
            <H1Logo height={24} />
          </div>
          <div />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: '#A8BEF0' }}>Laden…</p>
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
                        style={{ background: '#1A3FAB' }}>
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
                    <div className="font-display font-bold text-lg truncate" style={{ color: '#0D2B7A' }}>{user.name ?? user.email}</div>
                    <div className="text-sm truncate" style={{ color: '#7B90C8' }}>{user.email}</div>
                  </div>
                </div>
                <button onClick={onLogout}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
                  style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                  Uitloggen
                </button>
              </div>
              {photoError && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{photoError}</p>}

              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Voorkeursteam</label>
                <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: user.defaultTeam ? '#1A2F6B' : '#7B90C8' }}
                  value={user.defaultTeam ?? ''}
                  onChange={e => onUpdateProfile({ defaultTeam: e.target.value || null })}>
                  <option value="">Kies team…</option>
                  {SC_MUIDEN_TEAM_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <p className="text-xs mt-1.5" style={{ color: '#7B90C8' }}>Wordt automatisch geselecteerd bij het starten van een wedstrijd.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Naam</label>
                  <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
                    value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Voornaam" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Achternaam</label>
                  <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
                    value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Achternaam" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Rol</label>
                <input className="w-full rounded-xl px-3 py-2.5 text-sm" style={inputStyle}
                  value={role} onChange={e => setRole(e.target.value)} placeholder="Bijv. Coach, Trainer, Manager" />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveDetails}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: '#1A3FAB' }}>
                  Opslaan
                </button>
                {saved && <span className="text-sm font-semibold" style={{ color: '#16A34A' }}>Opgeslagen!</span>}
              </div>

              <button onClick={onHistory} className="text-sm font-medium hover:underline" style={{ color: '#1A3FAB' }}>
                {gameCount} opgeslagen wedstrijd{gameCount !== 1 ? 'en' : ''} →
              </button>
            </div>
          ) : (
            <div className="space-y-5 text-center py-4">
              <p className="text-sm" style={{ color: '#6B82B8' }}>
                Log in om wedstrijden op te slaan en later terug te vinden.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton onCredential={onCredential} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: '#E4ECFE' }} />
                <span className="text-xs font-semibold uppercase" style={{ color: '#A8BEF0' }}>of</span>
                <div className="flex-1 h-px" style={{ background: '#E4ECFE' }} />
              </div>
              <EmailAuthForm onLogin={onLoginPassword} onRegister={onRegister} onResend={onResendVerification} />
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="bg-white rounded-2xl p-6 shadow-sm mt-5" style={{ border: '1px solid #D0DCFA' }}>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide mb-4" style={{ color: '#0D2B7A' }}>
              Beheer — Gebruikers
            </h2>
            {adminLoading ? (
              <p className="text-sm text-center py-4" style={{ color: '#A8BEF0' }}>Laden…</p>
            ) : adminError ? (
              <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>{adminError}</p>
            ) : adminUsers.length === 0 ? (
              <p className="text-sm" style={{ color: '#7B90C8' }}>Nog geen gebruikers.</p>
            ) : (
              <div className="space-y-2">
                {adminUsers.map(u => (
                  <div key={u.id} className="p-3 rounded-xl" style={{ border: '1px solid #E8EFFD', background: '#F8FAFF' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: '#1A2F6B' }}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email}
                        </div>
                        <div className="text-xs truncate" style={{ color: '#7B90C8' }}>{u.email}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {u.id !== user?.id && u.email.toLowerCase() !== ADMIN_EMAIL && (
                          <button onClick={() => {
                            if (!u.isAdmin && !confirm(`${u.email} beheerderstoegang geven? Diegene kan dan ook andere accounts beheren.`)) return
                            setAdmin(u.id, !u.isAdmin)
                          }}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                            style={u.isAdmin
                              ? { color: '#7B90C8', border: '1px solid #D0DCFA' }
                              : { color: '#1A3FAB', border: '1px solid #A8BEF0' }}>
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
                      {u.defaultTeam && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF3FF', color: '#1A3FAB' }}>
                          {u.defaultTeam}
                        </span>
                      )}
                      {u.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF3FF', color: '#1A3FAB' }}>
                          {u.role}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF3FF', color: '#1A3FAB' }}>
                        {u.gameCount} wedstrijd{u.gameCount !== 1 ? 'en' : ''}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={u.emailVerified
                          ? { background: '#DCFCE7', color: '#16A34A' }
                          : { background: '#FEF3C7', color: '#D97706' }}>
                        {u.emailVerified ? 'Geverifieerd' : 'Niet geverifieerd'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF3FF', color: '#1A3FAB' }}>
                        {u.hasPassword ? 'E-mail/wachtwoord' : 'Google'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  // Persists profile fields (team preference, name, role, photo) so they're
  // available next time this coach logs in, on any device. Only the fields
  // passed in are changed — the API leaves the rest untouched.
  const updateProfile = useCallback(async (fields: Partial<Pick<AuthUser, 'defaultTeam' | 'firstName' | 'lastName' | 'role' | 'picture'>>) => {
    const res = await fetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) setUser((await res.json()).user)
  }, [])

  return { user, loading, loginWithCredential, registerWithPassword, loginWithPassword, resendVerification, logout, updateProfile }
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

function EmailAuthForm({ onLogin, onRegister, onResend }: {
  onLogin: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  onRegister: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onResend: (email: string) => Promise<void>
}) {
  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showResend, setShowResend] = useState(false)

  const switchMode = (m: 'login' | 'register') => {
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

  return (
    <div className="space-y-3 text-left">
      <div className="flex gap-2 justify-center">
        <button onClick={() => switchMode('login')}
          className="text-xs font-bold uppercase px-3 py-1.5 rounded-lg"
          style={{ color: mode === 'login' ? '#fff' : '#1A3FAB', background: mode === 'login' ? '#1A3FAB' : '#EEF3FF' }}>
          Inloggen
        </button>
        <button onClick={() => switchMode('register')}
          className="text-xs font-bold uppercase px-3 py-1.5 rounded-lg"
          style={{ color: mode === 'register' ? '#fff' : '#1A3FAB', background: mode === 'register' ? '#1A3FAB' : '#EEF3FF' }}>
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

      {error && <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>{error}</p>}
      {info && <p className="text-xs font-semibold" style={{ color: '#16A34A' }}>{info}</p>}
      {showResend && (
        <button onClick={resend} disabled={busy} className="text-xs font-bold" style={{ color: '#1A3FAB' }}>
          Verificatie-e-mail opnieuw versturen
        </button>
      )}

      <button onClick={submit} disabled={busy || !email || !password}
        className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
        style={{ background: '#1A3FAB' }}>
        {mode === 'register' ? 'Account aanmaken' : 'Inloggen'}
      </button>
    </div>
  )
}

// ── Remote match history (Vercel Postgres via /api/games) ────────────────────
// Saved matches are private per account now, so this only fetches once a
// session exists — logging out clears the list rather than erroring.

function useRemoteGames(enabled: boolean) {
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
  }, [enabled])

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
  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }
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
      <div className="flex gap-2">
        <select className="flex-1 rounded-xl px-3 py-2 text-sm"
          style={{ ...inputStyle, color: userId ? '#1A2F6B' : '#7B90C8' }}
          value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Kies gebruiker…</option>
          {available.map(u => <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>)}
        </select>
        <select className="rounded-xl px-2 py-2 text-sm" style={inputStyle}
          value={permission} onChange={e => setPermission(e.target.value as 'view' | 'edit')}>
          <option value="view">Bekijken</option>
          <option value="edit">Bewerken</option>
        </select>
        <button onClick={submit} disabled={busy || !userId}
          className="px-3 py-2 rounded-xl font-bold text-white text-sm shrink-0 disabled:opacity-50"
          style={{ background: '#1A3FAB' }}>
          Delen
        </button>
      </div>
      {available.length === 0 && (
        <p className="text-xs mt-1" style={{ color: '#A8BEF0' }}>Geen andere gebruikers gevonden om mee te delen.</p>
      )}
      {error && <p className="text-xs font-semibold mt-1" style={{ color: '#DC2626' }}>{error}</p>}
      {shares.length > 0 && (
        <div className="mt-2 space-y-1">
          {shares.map(s => (
            <div key={s.userId} className="flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5"
              style={{ background: '#F8FAFF', border: '1px solid #E8EFFD' }}>
              <span style={{ color: '#1A2F6B' }}>
                {s.name ?? s.email} <span style={{ color: '#7B90C8' }}>· {s.permission === 'edit' ? 'Bewerken' : 'Bekijken'}</span>
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
        style={{ color: '#2563EB', letterSpacing: '0.15em', opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease-out' }}>
        Continue →
      </button>
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

  const [view, setView] = useState<View>('setup')
  const [gameParams, setGameParams] = useState<GameParams | null>(null)
  const [editingGame, setEditingGame] = useState<SavedGame | null>(null)
  const { user, loading: authLoading, loginWithCredential, registerWithPassword, loginWithPassword, resendVerification, logout, updateProfile } = useAuth()
  const { games, error: gamesError, addGame, updateGame, deleteGame } = useRemoteGames(!!user)

  if (showSplash) return <SplashScreen onContinue={dismissSplash} />

  const startEdit = (game: SavedGame) => {
    setEditingGame(game)
    setGameParams({ club: game.club, team: game.team, ageGroup: game.ageGroup, opponent: game.opponent, homeAway: game.homeAway, squad: game.squad })
    setView('game')
  }

  if (view === 'profile')
    return (
      <ProfileView
        user={user}
        loading={authLoading}
        onCredential={loginWithCredential}
        onRegister={registerWithPassword}
        onLoginPassword={loginWithPassword}
        onResendVerification={resendVerification}
        onLogout={logout}
        onBack={() => setView('setup')}
        onHistory={() => setView('history')}
        gameCount={games.length}
        onUpdateProfile={updateProfile}
      />
    )
  if (view === 'history')
    return (
      <HistoryView
        games={games}
        user={user}
        authLoading={authLoading}
        onBack={() => setView('setup')}
        onDelete={deleteGame}
        onEdit={startEdit}
        onProfile={() => setView('profile')}
      />
    )
  if (view === 'game' && gameParams)
    return (
      <GameView
        {...gameParams}
        initial={editingGame ?? undefined}
        user={user}
        onSave={g => { if (editingGame) updateGame(g); else addGame(g); setEditingGame(null) }}
        onBack={() => { setEditingGame(null); setView('setup') }}
      />
    )
  return (
    <>
      <SetupView
        onStart={p => { setEditingGame(null); setGameParams(p); setView('game') }}
        onHistory={() => setView('history')}
        onProfile={() => setView('profile')}
        user={user}
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
