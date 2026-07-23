import { useState, useEffect, useCallback, useRef } from 'react'

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
  notes: string
  result: string
  finalTime: number
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

// U7/U8 dual field — left field center x≈22.5%, right≈77.5%
const POS_DUAL = [
  { id: 'a_b', label: 'VD', x: 22.5, y: 82 },
  { id: 'a_m', label: 'MV', x: 22.5, y: 50 },
  { id: 'a_f', label: 'ST', x: 22.5, y: 18 },
  { id: 'b_b', label: 'VD', x: 77.5, y: 82 },
  { id: 'b_m', label: 'MV', x: 77.5, y: 50 },
  { id: 'b_f', label: 'ST', x: 77.5, y: 18 },
]

// U9 (KNHB O9, 6-tegen-6): GK + 2-2-1
const POS_U9 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 66 }, { id: 'd2', label: 'LB', x: 72, y: 66 },
  { id: 'm1', label: 'RM', x: 28, y: 40 }, { id: 'm2', label: 'LM', x: 72, y: 40 },
  { id: 'f1', label: 'ST', x: 50, y: 20 },
]

// U10: GK + 2-3-2
const POS_U10 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 70 }, { id: 'd2', label: 'LB', x: 72, y: 70 },
  { id: 'm1', label: 'RH', x: 16, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 84, y: 50 },
  { id: 'f1', label: 'RS', x: 30, y: 26 }, { id: 'f2', label: 'LS', x: 70, y: 26 },
]

// U11: GK + 2-3-3
const POS_U11 = [
  { id: 'gk', label: 'K',  x: 50, y: 86 },
  { id: 'd1', label: 'RB', x: 28, y: 70 }, { id: 'd2', label: 'LB', x: 72, y: 70 },
  { id: 'm1', label: 'RH', x: 16, y: 50 }, { id: 'm2', label: 'MH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 84, y: 50 },
  { id: 'f1', label: 'RW', x: 22, y: 28 }, { id: 'f2', label: 'ST', x: 50, y: 21 }, { id: 'f3', label: 'LW', x: 78, y: 28 },
]

// U12+: GK + 4-3-3
const POS_11 = [
  { id: 'gk', label: 'K',   x: 50, y: 86 },
  { id: 'd1', label: 'RB',  x: 15, y: 70 }, { id: 'd2', label: 'CB', x: 38, y: 70 }, { id: 'd3', label: 'CB', x: 62, y: 70 }, { id: 'd4', label: 'LB', x: 85, y: 70 },
  { id: 'm1', label: 'RH',  x: 22, y: 50 }, { id: 'm2', label: 'CH', x: 50, y: 50 }, { id: 'm3', label: 'LH', x: 78, y: 50 },
  { id: 'f1', label: 'RW',  x: 22, y: 27 }, { id: 'f2', label: 'ST', x: 50, y: 20 }, { id: 'f3', label: 'LW', x: 78, y: 27 },
]

interface PosDef {
  id: string
  label: string
  x: number
  y: number
}

function getBasePos(ag: AgeGroup): PosDef[] {
  if (ag === 'U7' || ag === 'U8') return POS_DUAL
  if (ag === 'U9')  return POS_U9
  if (ag === 'U10') return POS_U10
  if (ag === 'U11') return POS_U11
  return POS_11
}

// Custom (dragged) position layouts are saved per age group so a club can
// tweak the default formation to match how they actually line up.
const layoutKey = (ag: AgeGroup) => `fh_layout_${ag}`

function getPositions(ag: AgeGroup): PosDef[] {
  const base = getBasePos(ag)
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey(ag)) ?? 'null') as PosDef[] | null
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
const p2 = (n: number) => n.toString().padStart(2, '0')
const fmtSec = (s: number) => `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
const todayStr = () => new Date().toISOString().slice(0, 10)
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const sortPlayers = <T extends { number?: number; name: string }>(list: T[]) =>
  [...list].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name))
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

// ── Field Hockey Field SVG (standard portrait) ───────────────────────────────
// viewBox="0 0 62 97" — field lines from y=4.5 to y=92.5, goals at y=0-4.5 and y=92.5-97

function FieldSVG() {
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

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 62 97" preserveAspectRatio="xMidYMid meet">
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

interface FieldViewProps {
  ageGroup: AgeGroup
  slots: PositionSlot[]
  squad: Player[]
  selected: { type: 'field'; posId: string } | { type: 'bench'; playerId: string } | null
  dragOverPos: string | null
  dragPreview: { type: 'field' | 'bench'; id: string; x: number; y: number } | null
  fieldRef: React.RefObject<HTMLDivElement | null>
  onFieldClick: (posId: string) => void
  onBackgroundClick: (x: number, y: number) => void
  onMarkerPointerDown: (posId: string, e: React.PointerEvent) => void
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

function FieldView({ ageGroup, slots, squad, selected, dragOverPos, dragPreview, fieldRef, onFieldClick, onBackgroundClick, onMarkerPointerDown }: FieldViewProps) {
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
    </div>
  )
}

// ── Formation Editor ─────────────────────────────────────────────────────────
// Lets a club drag the default position markers to match how they actually
// line up; saved per age group in localStorage and picked up by getPositions().

function FormationEditorView({ ageGroup, onBack }: { ageGroup: AgeGroup; onBack: () => void }) {
  const isDual = ageGroup === 'U7' || ageGroup === 'U8'
  const base = getBasePos(ageGroup)
  const [positions, setPositions] = useLS<PosDef[]>(layoutKey(ageGroup), base)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingId = useRef<string | null>(null)

  // If the underlying formation changed (e.g. a different total player count)
  // since this layout was saved, the ids won't line up — fall back to base.
  useEffect(() => {
    const valid = positions.length === base.length && positions.every(p => base.some(b => b.id === p.id))
    if (!valid) setPositions(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroup])

  const movePos = (clientX: number, clientY: number) => {
    if (!draggingId.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    const id = draggingId.current
    setPositions(ps => ps.map(p => (p.id === id ? { ...p, x, y } : p)))
  }

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-widest leading-none">Opstelling aanpassen</h1>
            <p className="text-xs mt-1" style={{ color: '#7B9DE0' }}>{AGE_CONFIG[ageGroup].label}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <p className="text-sm text-center" style={{ color: '#6B82B8' }}>
          Sleep de posities naar de gewenste plek op het veld. Dit wordt de standaardopstelling voor {ageGroupLabel(ageGroup)}.
        </p>

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
      </div>
    </div>
  )
}

// ── Setup View ───────────────────────────────────────────────────────────────

function SetupView({ onStart, onHistory, onProfile, gameCount, user }: {
  onStart: (p: GameParams) => void
  onHistory: () => void
  onProfile: () => void
  gameCount: number
  user: AuthUser | null
}) {
  const [club, setClub] = useLS('fh_club', 'SC Muiden')
  const [team, setTeam] = useLS('fh_team', '')
  const ageGroup = team ? ageGroupFromTeamName(team) : 'U7'
  const [opponent, setOpponent] = useState('')
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
  // still be added or removed manually afterwards.
  const selectTeam = (newTeam: string) => {
    setTeam(newTeam)
    const roster = SC_MUIDEN_TEAMS[newTeam]
    if (roster) setSquad(roster.map(name => ({ id: uid(), name })))
  }

  const minPlayers = AGE_CONFIG[ageGroup].total
  const canStart = (club || clubSearch) && team && opponent

  const inputStyle = { border: '1.5px solid #D0DCFA', background: '#F8FAFF', outline: 'none' }

  if (showFormationEditor) {
    return <FormationEditorView ageGroup={ageGroup} onBack={() => setShowFormationEditor(false)} />
  }

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SCMuidenLogo size={46} />
            <div>
              <h1 className="font-display font-bold uppercase leading-none" style={{ fontSize: '22px', letterSpacing: '0.08em' }}>
                SC Muiden
              </h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: '#A8BEF0', letterSpacing: '0.12em' }}>
                HOCKEY TEAMMANAGER
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onHistory}
              className="text-sm px-3 py-1.5 rounded-lg font-semibold"
              style={{ color: '#A8BEF0', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
              {gameCount} wedstrijd{gameCount !== 1 ? 'en' : ''}
            </button>
            <button onClick={onProfile}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-semibold"
              style={{ color: '#A8BEF0', border: '1px solid rgba(168,190,240,0.35)', background: 'rgba(255,255,255,0.08)' }}>
              {user ? (
                <>
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: '#1A3FAB' }}>
                      {initials(user.name ?? user.email)}
                    </span>
                  )}
                  <span className="max-w-[100px] truncate">{user.name ?? user.email}</span>
                </>
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
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide" style={{ color: '#0D2B7A' }}>Wedstrijd</h2>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: '#6B82B8', letterSpacing: '0.12em' }}>Tegenstander</label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ ...inputStyle, color: opponent ? '#1A2F6B' : '#7B90C8' }}
              value={opponent} onChange={e => setOpponent(e.target.value)}>
              <option value="">Kies club tegenstander…</option>
              {KNHB_CLUBS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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
          onClick={() => onStart({ club: club || clubSearch, team, ageGroup, opponent, homeAway, squad })}
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

  const [slots, setSlots] = useState<PositionSlot[]>(() => normalizeSlots(initial?.slots, ageGroup))
  const [bench, setBench] = useState<BenchEntry[]>(() => {
    const onField = new Set((initial?.slots ?? []).map(s => s.playerId).filter(Boolean))
    return squad.filter(p => !onField.has(p.id)).map(p => ({ playerId: p.id, sinceGameSec: initial?.finalTime ?? 0 }))
  })
  const [subs, setSubs] = useState<SubRecord[]>(() => initial?.subs ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [result, setResult] = useState(initial?.result ?? '')
  const [gameSec, setGameSec] = useState(initial?.finalTime ?? 0)
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<{ type: 'field'; posId: string } | { type: 'bench'; playerId: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'bench' | 'subs' | 'notes'>('bench')
  const [panelCollapsed, setPanelCollapsed] = useLS('fh_panel_collapsed', false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setGameSec(s => s + 1), 1000)
    else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  const getPlayer = (id: string | null) => id ? squad.find(p => p.id === id) ?? null : null

  const doSub = (inId: string, posId: string) => {
    const outId = slots.find(s => s.posId === posId)?.playerId ?? null
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: inId } : s))
    setBench(b => b.filter(e => e.playerId !== inId).concat(outId ? [{ playerId: outId, sinceGameSec: gameSec }] : []))
    if (outId) setSubs(s => [...s, { gameTimeSec: gameSec, playerInId: inId, playerOutId: outId }])
    setSelected(null)
  }

  const swapField = (posA: string, posB: string) => {
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
    const pid = slots.find(s => s.posId === posId)?.playerId
    if (!pid) return
    setSlots(sl => sl.map(s => s.posId === posId ? { ...s, playerId: null } : s))
    setBench(b => [...b.filter(e => e.playerId !== pid), { playerId: pid, sinceGameSec: gameSec }])
    setSelected(null)
  }

  // Freeform positioning: move a slot (and whoever's on it) to an arbitrary spot on the field.
  const movePosition = (posId: string, x: number, y: number) => {
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
  const [dragPreview, setDragPreview] = useState<{ type: 'field' | 'bench'; id: string; x: number; y: number } | null>(null)
  const dragInfoRef = useRef<{ type: 'field' | 'bench'; id: string } | null>(null)
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
    let pendingPreview: { type: 'field' | 'bench'; id: string; x: number; y: number } | null | undefined
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
      const target = nearestSlot(slotsRef.current, pt.x, pt.y, info.type === 'field' ? info.id : undefined)
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

  const beginDrag = (type: 'field' | 'bench', id: string, e: React.PointerEvent) => {
    dragInfoRef.current = { type, id }
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleFieldClick = (posId: string) => {
    if (suppressClickRef.current) return
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
    } else {
      setSelected({ type: 'field', posId })
      setActiveTab('bench')
    }
  }

  const handleBenchClick = (playerId: string) => {
    if (suppressClickRef.current) return
    if (selected?.type === 'field') {
      doSub(playerId, selected.posId)
    } else if (selected?.type === 'bench' && selected.playerId === playerId) {
      setSelected(null)
    } else {
      setSelected({ type: 'bench', playerId })
    }
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
    if (suppressClickRef.current) return
    if (!selected) return
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
  const selectedFieldPos = selected?.type === 'field' ? selected.posId : null
  const selectedFieldPlayer = selectedFieldPos ? getPlayer(slots.find(s => s.posId === selectedFieldPos)?.playerId ?? null) : null

  const saveGame = () => {
    if (!user) {
      alert('Log in met Google om wedstrijden op te slaan (zie Profiel rechtsboven op het startscherm).')
      return
    }
    onSave({
      id: initial?.id ?? uid(),
      date: initial?.date ?? todayStr(),
      club, team, ageGroup, opponent, homeAway, squad, slots, subs, notes, result,
      finalTime: gameSec,
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
            <div className="font-mono font-bold text-xl tabular-nums">{fmtSec(gameSec)}</div>
            <button onClick={e => { e.stopPropagation(); setRunning(r => !r) }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: running ? '#D97706' : '#16A34A', color: '#fff' }}>
              {running ? '⏸' : '▶'}
            </button>
            <button onClick={e => { e.stopPropagation(); saveGame() }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: '#1A3FAB' }}>
              Opslaan
            </button>
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
                  : selectedFieldPlayer ? `${selectedFieldPlayer.name.split(' ')[0]} geselecteerd` : 'Positie geselecteerd'}
              </span>
            ) : (
              <span className="text-xs" style={{ color: '#A8BEF0' }}>Sleep of klik om te wisselen</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center w-full"
            style={{ maxWidth: isDual ? (panelCollapsed ? '820px' : '540px') : (panelCollapsed ? '460px' : '290px') }}>
            <FieldView
              ageGroup={ageGroup}
              slots={slots}
              squad={squad}
              selected={selected}
              dragOverPos={dragOverPos}
              dragPreview={dragPreview}
              fieldRef={fieldRef}
              onFieldClick={handleFieldClick}
              onBackgroundClick={handleBackgroundClick}
              onMarkerPointerDown={(posId, e) => beginDrag('field', posId, e)}
            />
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
            {(['bench', 'subs', 'notes'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  color: activeTab === tab ? '#1A3FAB' : '#A8BEF0',
                  borderBottom: activeTab === tab ? '2.5px solid #1A3FAB' : '2.5px solid transparent',
                }}>
                {tab === 'bench' ? `Bank (${benchPlayers.length})` : tab === 'subs' ? `Wissels (${subs.length})` : 'Notities'}
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
                      <div className="font-mono text-xs font-bold mb-1" style={{ color: '#7B90C8' }}>{fmtSec(s.gameTimeSec)}</div>
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
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Uitslag</label>
                  <input className="w-full rounded-xl px-3 py-2 text-sm font-bold"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
                    value={result} onChange={e => setResult(e.target.value)}
                    placeholder="bijv. 3-1" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1" style={{ color: '#7B90C8', letterSpacing: '0.1em' }}>Notities</label>
                  <textarea className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ border: '1.5px solid #D0DCFA', background: '#F8FAFF', color: '#1A2F6B', outline: 'none' }}
                    rows={8} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Tactische notities, bijzonderheden…" />
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
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

  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
          <SCMuidenLogo size={32} />
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest">Wedstrijd Geschiedenis</h1>
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
                      {g.result && <span className="text-xs font-bold" style={{ color: '#1A3FAB' }}>{g.result}</span>}
                      <span className="text-xs font-mono" style={{ color: '#A8BEF0' }}>{fmtSec(g.finalTime)}</span>
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
                                  <span className="font-semibold" style={{ color: '#16A34A' }}>↑ {pIn?.name}</span>
                                  <span className="font-semibold" style={{ color: '#DC2626' }}>↓ {pOut?.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {g.notes && (
                        <div>
                          <h4 className="font-display text-sm font-bold uppercase mb-1" style={{ color: '#7B90C8' }}>Notities</h4>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: '#3B4F7A' }}>{g.notes}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => onEdit(g)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                          style={{ background: '#1A3FAB' }}>
                          Bewerken
                        </button>
                        <button onClick={() => { if (confirm('Wedstrijd verwijderen?')) onDelete(g.id) }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg"
                          style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                          Verwijder
                        </button>
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

function ProfileView({ user, loading, onCredential, onLogout, onBack, gameCount }: {
  user: AuthUser | null
  loading: boolean
  onCredential: (credential: string) => void
  onLogout: () => void
  onBack: () => void
  gameCount: number
}) {
  return (
    <div className="min-h-screen" style={{ background: '#EEF3FF' }}>
      <header style={{ background: '#0D2B7A' }} className="text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={onBack} className="text-sm font-semibold" style={{ color: '#7B9DE0' }}>← Terug</button>
          <SCMuidenLogo size={32} />
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest">Profiel</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: '1px solid #D0DCFA' }}>
          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: '#A8BEF0' }}>Laden…</p>
          ) : user ? (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-16 h-16 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
                    style={{ background: '#1A3FAB' }}>
                    {initials(user.name ?? user.email)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-display font-bold text-lg truncate" style={{ color: '#0D2B7A' }}>{user.name ?? user.email}</div>
                  <div className="text-sm truncate" style={{ color: '#7B90C8' }}>{user.email}</div>
                </div>
              </div>
              <p className="text-sm font-medium" style={{ color: '#7B90C8' }}>
                {gameCount} opgeslagen wedstrijd{gameCount !== 1 ? 'en' : ''}
              </p>
              <button onClick={onLogout}
                className="px-4 py-2.5 rounded-xl font-bold text-sm"
                style={{ color: '#DC2626', border: '1px solid #FCA5A5' }}>
                Uitloggen
              </button>
            </div>
          ) : (
            <div className="space-y-4 text-center py-4">
              <p className="text-sm" style={{ color: '#6B82B8' }}>
                Log in met je Google-account om wedstrijden op te slaan en later terug te vinden.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton onCredential={onCredential} />
              </div>
            </div>
          )}
        </section>
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

  const loginWithCredential = useCallback(async (credential: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (res.ok) setUser((await res.json()).user)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return { user, loading, loginWithCredential, logout }
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

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('setup')
  const [gameParams, setGameParams] = useState<GameParams | null>(null)
  const [editingGame, setEditingGame] = useState<SavedGame | null>(null)
  const { user, loading: authLoading, loginWithCredential, logout } = useAuth()
  const { games, error: gamesError, addGame, updateGame, deleteGame } = useRemoteGames(!!user)

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
        onLogout={logout}
        onBack={() => setView('setup')}
        gameCount={games.length}
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
        gameCount={games.length}
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
