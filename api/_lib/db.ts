import { neon } from '@neondatabase/serverless'
import { list as listBlobs } from '@vercel/blob'
import { randomUUID } from './crypto.js'
import { slugify } from './slug.js'
import { SEED_TEAMS } from './seed-teams.js'
import { TEAM_FIXTURES, ageGroupFromTeamName } from './team-fixtures.js'
import { TEAM_STAFF } from './team-staff-roster.js'

export const sql = neon(process.env.POSTGRES_URL!)

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
    ?? process.env.TEST_BLOB_READ_WRITE_TOKEN
    ?? process.env.PROD_BLOB_READ_WRITE_TOKEN
}

// Runs exactly once, the first time team_players is empty (a brand new
// database, or the moment this migration first reaches an existing one).
// Player photos previously lived at deterministic Blob paths keyed by
// team+name slugs (players/{team-slug}/{name-slug}.jpg); this adopts any
// that already exist into the new DB-tracked photo_url column so uploads
// made before this migration don't just disappear.
async function seedTeams() {
  const teamNames = Object.keys(SEED_TEAMS)
  const teamIds = teamNames.map(slugify)
  await sql`
    INSERT INTO teams (id, name)
    SELECT * FROM unnest(${teamIds}::text[], ${teamNames}::text[])
    ON CONFLICT (id) DO NOTHING
  `

  const playerIds: string[] = []
  const playerTeamIds: string[] = []
  const playerNames: string[] = []
  const playerOrders: number[] = []
  teamNames.forEach((name, ti) => {
    SEED_TEAMS[name].forEach((playerName, i) => {
      playerIds.push(randomUUID())
      playerTeamIds.push(teamIds[ti])
      playerNames.push(playerName)
      playerOrders.push(i)
    })
  })
  await sql`
    INSERT INTO team_players (id, team_id, name, sort_order)
    SELECT * FROM unnest(${playerIds}::text[], ${playerTeamIds}::text[], ${playerNames}::text[], ${playerOrders}::int[])
  `

  try {
    const allPlayers = await sql`
      SELECT tp.id, tp.name, tp.team_id FROM team_players tp
    `
    const bySlug = new Map(allPlayers.map(p => [`${p.team_id}/${slugify(p.name)}`, p.id as string]))
    const { blobs } = await listBlobs({ prefix: 'players/', token: blobToken() })
    const matchedIds: string[] = []
    const matchedUrls: string[] = []
    for (const b of blobs) {
      const key = b.pathname.replace(/^players\//, '').replace(/\.[^./]+$/, '')
      const playerId = bySlug.get(key)
      if (playerId) { matchedIds.push(playerId); matchedUrls.push(b.url) }
    }
    if (matchedIds.length > 0) {
      await sql`
        UPDATE team_players AS tp SET photo_url = u.url
        FROM (SELECT * FROM unnest(${matchedIds}::text[], ${matchedUrls}::text[]) AS t(id, url)) AS u
        WHERE tp.id = u.id
      `
    }
  } catch (err) {
    // Best-effort — a missing/misconfigured Blob token shouldn't block the
    // rest of schema setup, it would just mean old photos need re-uploading.
    console.error('Player-photo backfill skipped:', err)
  }
}

// Seeds TEAM_FIXTURES (see team-fixtures.ts) as real games, owned by the
// Hockey One system account rather than any individual coach — so they're
// visible (see the GET/PUT handlers in games.ts) to every coach, trainer,
// player, and supporter whose own default_team matches, not just whoever
// happened to trigger an import. Ids are deterministic
// (fixture-<team-slug>-<date>), so ON CONFLICT DO NOTHING makes the whole
// batch safely re-runnable — this can just run on every cold start instead
// of needing an "already seeded" flag, and picks up newly-added teams or
// fixtures on the next deploy without wiping existing ones.
//
// 'hockey-one' / 'admin@hockeyone.nl' here must stay in sync with
// HOCKEY_ONE_ID/HOCKEY_ONE_EMAIL in _lib/messages.ts — duplicated rather
// than imported to avoid a circular dependency (messages.ts already imports
// `sql` from this file).
async function seedTeamFixtures() {
  await sql`
    INSERT INTO users (id, email, name, email_verified) VALUES ('hockey-one', 'admin@hockeyone.nl', 'Hockey One', true)
    ON CONFLICT (id) DO NOTHING
  `

  const ids: string[] = []
  const datas: string[] = []
  for (const [team, fixtures] of Object.entries(TEAM_FIXTURES)) {
    for (const fx of fixtures) {
      const id = `fixture-${slugify(team)}-${fx.date}`
      ids.push(id)
      datas.push(JSON.stringify({
        id, date: fx.date, club: 'SC Muiden', team, ageGroup: ageGroupFromTeamName(team),
        opponent: fx.opponent, homeAway: fx.homeAway, squad: [], slots: [], subs: [], oppMarkers: [],
        goals: [], cards: [], tacticsBoards: [], playedSeconds: {}, media: [], notes: '', result: '',
        scoreOwn: 0, scoreOpp: 0, finalTime: 0,
      }))
    }
  }
  if (ids.length === 0) return
  await sql`
    INSERT INTO games (id, data, user_id)
    SELECT id, data::jsonb, 'hockey-one' FROM unnest(${ids}::text[], ${datas}::text[]) AS t(id, data)
    ON CONFLICT (id) DO NOTHING
  `
}

// Unlike seedTeamFixtures (immutable history once a match happens),
// TEAM_STAFF (team-staff-roster.ts) is a live lookup table with no
// downstream references — the source file is the single source of truth,
// so the simplest correct approach is to make the table match it exactly
// on every cold start rather than trying to diff/upsert.
async function seedTeamStaff() {
  const entries = Object.entries(TEAM_STAFF)
  if (entries.length === 0) return
  await sql`DELETE FROM team_staff`
  const ids: string[] = []
  const teamIds: string[] = []
  const roles: string[] = []
  const firsts: string[] = []
  const lasts: string[] = []
  for (const [team, staff] of entries) {
    const teamId = slugify(team)
    for (const s of staff) {
      ids.push(randomUUID())
      teamIds.push(teamId)
      roles.push(s.role)
      firsts.push(s.firstName)
      lasts.push(s.lastName)
    }
  }
  if (ids.length === 0) return
  await sql`
    INSERT INTO team_staff (id, team_id, role, first_name, last_name)
    SELECT * FROM unnest(${ids}::text[], ${teamIds}::text[], ${roles}::text[], ${firsts}::text[], ${lasts}::text[])
  `
}

// Every serverless invocation is a cold-start candidate, so this runs on
// (almost) every request; `??=` memoizes it per warm instance rather than
// re-running the ALTERs every time. Intentionally no unique index on
// lower(email) here — unverified test data from earlier development could
// collide and break this for every route, so uniqueness is enforced at the
// application layer (register.ts) instead.
let schemaReady: Promise<unknown> | null = null
export function ensureSchema() {
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_team TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_club TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ`
    await sql`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`
    await sql`
      CREATE TABLE IF NOT EXISTS game_shares (
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (game_id, user_id)
      )
    `
    // id is slugify(name) — stable and human-readable, and lets team_players
    // reference a team without an extra lookup when seeding.
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS team_players (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        photo_url TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS team_players_team_idx ON team_players (team_id)`
    // Reference-only lookup ("is this name really a trainer/coach/manager of
    // this team") used to gate self-selecting an elevated Rol in Profile —
    // see team-staff.ts and team-staff-roster.ts. Not linked to `users` at
    // all: someone can be listed here long before (or without ever) creating
    // an account.
    await sql`
      CREATE TABLE IF NOT EXISTS team_staff (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('Trainer', 'Coach', 'Manager')),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS team_staff_team_idx ON team_staff (team_id)`
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, read_at)`
    await sql`CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (sender_id, recipient_id, created_at)`
    // game_id is nullable and SET NULL on delete — a notification about a
    // match that's since been removed should stick around (just without a
    // working deep link) rather than disappear or block the game's deletion.
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        body TEXT NOT NULL,
        game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at)`

    // A failure here must not take the rest of the app down with it — every
    // route calls ensureSchema(), so an unhandled rejection here would 500
    // login/games/everything, not just teams. It's also safe to retry: the
    // "is it seeded yet" check runs again on the next cold start, and the
    // inserts inside seedTeams() are all-or-nothing per statement.
    try {
      const seeded = await sql`SELECT 1 FROM team_players LIMIT 1`
      if (seeded.length === 0) await seedTeams()
    } catch (err) {
      console.error('Team seeding failed:', err)
    }

    try {
      await seedTeamFixtures()
    } catch (err) {
      console.error('Fixture seeding failed:', err)
    }

    try {
      await seedTeamStaff()
    } catch (err) {
      console.error('Team staff seeding failed:', err)
    }

    // One-time rename of the stored role value — 'Player' is now labeled
    // 'Speler' in ROLE_OPTIONS (src/App.tsx). The WHERE clause makes this
    // safely re-runnable: a no-op once every existing row has been migrated.
    try {
      await sql`UPDATE users SET role = 'Speler' WHERE role = 'Player'`
    } catch (err) {
      console.error('Player->Speler role migration failed:', err)
    }
  })()
  return schemaReady
}
