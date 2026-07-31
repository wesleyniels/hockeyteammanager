// One-time seed data for the `teams`/`team_players` tables — see ensureSchema()
// in db.ts. This used to be a client-bundled constant in src/App.tsx (visible
// to anyone loading the app's JS, logged in or not); it now lives server-side
// only and is used exactly once, to populate a fresh database. After the
// initial seed, rosters are managed entirely through api/teams/[action].ts.
export const SEED_TEAMS: Record<string, string[]> = {
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
    'Thinka de Graaff', 'Mijntje Ketting', 'Roos Lubbinge', 'Isa van der Maat',
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
