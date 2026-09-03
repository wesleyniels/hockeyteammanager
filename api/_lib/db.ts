import { neon } from '@neondatabase/serverless'
import { list as listBlobs } from '@vercel/blob'
import { randomUUID } from './crypto.js'
import { slugify } from './slug.js'
import { SEED_TEAMS } from './seed-teams.js'
import { TEAM_FIXTURES, ageGroupFromTeamName } from './team-fixtures.js'
import { TEAM_STAFF } from './team-staff-roster.js'
import { CURRENT_VERSION, RELEASE_NOTES } from './changelog.js'
import { sendNotificationEmail } from './email.js'

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

  // Both inserts are independent of each other (no data one depends on the
  // other having already run), so one transaction round-trip covers both.
  await sql.transaction([
    sql`
      INSERT INTO teams (id, name)
      SELECT * FROM unnest(${teamIds}::text[], ${teamNames}::text[])
      ON CONFLICT (id) DO NOTHING
    `,
    sql`
      INSERT INTO team_players (id, team_id, name, sort_order)
      SELECT * FROM unnest(${playerIds}::text[], ${playerTeamIds}::text[], ${playerNames}::text[], ${playerOrders}::int[])
    `,
  ])

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
// (fixture-<team-slug>-<date>[-<n>]), so ON CONFLICT DO NOTHING makes the
// whole batch safely re-runnable — this can just run on every cold start
// instead of needing an "already seeded" flag, and picks up newly-added
// teams or fixtures on the next deploy without wiping existing ones. The
// `-<n>` suffix only appears on the 2nd+ fixture a team has on the same
// date (the senior Mix Hockey7 teams play two matches some evenings) —
// every existing team+date pair has exactly one fixture and keeps its
// original bare id, so this doesn't reseed anything already inserted.
//
// 'hockey-one' / 'admin@hockeyone.nl' here must stay in sync with
// HOCKEY_ONE_ID/HOCKEY_ONE_EMAIL in _lib/messages.ts — duplicated rather
// than imported to avoid a circular dependency (messages.ts already imports
// `sql` from this file).
async function seedTeamFixtures() {
  const ids: string[] = []
  const datas: string[] = []
  for (const [team, fixtures] of Object.entries(TEAM_FIXTURES)) {
    const seenDates = new Map<string, number>()
    for (const fx of fixtures) {
      const occurrence = (seenDates.get(fx.date) ?? 0) + 1
      seenDates.set(fx.date, occurrence)
      const id = occurrence === 1 ? `fixture-${slugify(team)}-${fx.date}` : `fixture-${slugify(team)}-${fx.date}-${occurrence}`
      ids.push(id)
      datas.push(JSON.stringify({
        id, date: fx.date, club: 'SC Muiden', team, ageGroup: ageGroupFromTeamName(team),
        opponent: fx.opponent, homeAway: fx.homeAway, squad: [], slots: [], subs: [], oppMarkers: [],
        goals: [], cards: [], tacticsBoards: [], playedSeconds: {}, media: [], notes: '', result: '',
        scoreOwn: 0, scoreOpp: 0, finalTime: 0,
      }))
    }
  }

  // The hockey-one user insert must run before the games insert (games.user_id
  // references it) — a transaction preserves that order in one round-trip
  // instead of two sequential ones.
  const queries = [sql`
    INSERT INTO users (id, email, name, email_verified) VALUES ('hockey-one', 'admin@hockeyone.nl', 'Hockey One', true)
    ON CONFLICT (id) DO NOTHING
  `]
  if (ids.length > 0) {
    queries.push(sql`
      INSERT INTO games (id, data, user_id)
      SELECT id, data::jsonb, 'hockey-one' FROM unnest(${ids}::text[], ${datas}::text[]) AS t(id, data)
      ON CONFLICT (id) DO NOTHING
    `)
  }
  await sql.transaction(queries)
}

// Unlike seedTeamFixtures (immutable history once a match happens),
// TEAM_STAFF (team-staff-roster.ts) is a live lookup table with no
// downstream references — the source file is the single source of truth,
// so the simplest correct approach is to make the table match it exactly
// on every cold start rather than trying to diff/upsert.
async function seedTeamStaff() {
  const entries = Object.entries(TEAM_STAFF)
  if (entries.length === 0) return
  // A typo'd team name in TEAM_STAFF would otherwise violate team_id's FK
  // and fail the whole batch, silently leaving every *other* team's staff
  // unseeded too — checking against real team ids first means one bad key
  // just gets skipped (and logged) instead of taking the rest down with it.
  const knownTeamIds = new Set((await sql`SELECT id FROM teams`).map(r => r.id as string))
  const ids: string[] = []
  const teamIds: string[] = []
  const roles: string[] = []
  const firsts: string[] = []
  const lasts: string[] = []
  for (const [team, staff] of entries) {
    const teamId = slugify(team)
    if (!knownTeamIds.has(teamId)) {
      console.error(`Team staff seeding: skipping unknown team "${team}"`)
      continue
    }
    for (const s of staff) {
      ids.push(randomUUID())
      teamIds.push(teamId)
      roles.push(s.role)
      firsts.push(s.firstName)
      lasts.push(s.lastName)
    }
  }
  // DELETE-then-INSERT in one transaction instead of two round-trips.
  const queries = [sql`DELETE FROM team_staff`]
  if (ids.length > 0) {
    queries.push(sql`
      INSERT INTO team_staff (id, team_id, role, first_name, last_name)
      SELECT * FROM unnest(${ids}::text[], ${teamIds}::text[], ${roles}::text[], ${firsts}::text[], ${lasts}::text[])
    `)
  }
  await sql.transaction(queries)
}

// Broadcasts RELEASE_NOTES[CURRENT_VERSION] (changelog.ts) to every user's
// Meldingen the first time any cold start sees a version that hasn't been
// announced yet — shipping a notable feature and telling the coaches/
// players about it become the same step, instead of a manual announcement
// someone has to remember to send. A version with no RELEASE_NOTES entry is
// a silent release (bug fixes/internal work only): the marker still
// advances so it can't re-trigger later, but nobody gets notified.
async function announceReleaseIfNeeded() {
  const last = await sql`SELECT value FROM app_meta WHERE key = 'last_announced_version'`
  if (last[0]?.value === CURRENT_VERSION) return
  const note = RELEASE_NOTES[CURRENT_VERSION]
  if (note) {
    const users = await sql`SELECT id, email, first_name, name FROM users`
    if (users.length > 0) {
      const ids = users.map(() => randomUUID())
      const userIds = users.map(u => u.id as string)
      const types = users.map(() => 'release')
      const bodies = users.map(() => note)
      await sql`
        INSERT INTO notifications (id, user_id, type, body)
        SELECT * FROM unnest(${ids}::text[], ${userIds}::text[], ${types}::text[], ${bodies}::text[])
      `
      // Every registered user at once — sendNotificationEmail's own
      // concurrency limit (email.ts) keeps this from blasting the shared
      // SMTP mailbox all at once; one failed recipient doesn't stop the
      // rest. This does mean the very first request after a release-note
      // deploy waits for every email to finish (best-effort, but still
      // awaited) — acceptable since it only happens once per version.
      await Promise.all(users.map((u, i) => {
        if (!u.email) return
        return sendNotificationEmail(u.email, u.first_name ?? u.name ?? null, note, ids[i])
          .catch(err => console.error('Failed to email release notification', err))
      }))
    }
  }
  await sql`
    INSERT INTO app_meta (key, value) VALUES ('last_announced_version', ${CURRENT_VERSION})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
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
    // All of this is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
    // and Postgres DDL is transactional, so batching it into one transaction
    // is safe. This is what actually made "loading staff/players" feel slow:
    // every route calls ensureSchema(), and on a cold serverless instance
    // this used to be ~28 sequential HTTP round-trips to Neon before the
    // route's own query even started. Now it's 1.
    await sql.transaction([
      sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          name TEXT,
          picture TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_team TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_club TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INT NOT NULL DEFAULT 0`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ`,
      // Extra teams a user wants to browse (Wedstrijden/Team) beyond their
      // own default_team, each with its own role (e.g. Manager of your own
      // team, Supporter of another) — see effectiveRoleForTeam in
      // team-roles.ts, the single place that resolves "what role does this
      // user hold for team X" across default_team and this list. An elevated
      // role here needs the same Lisa verification default_team/role does
      // (isVerifiedStaffName, checked per team in PUT /api/auth/me).
      // JSONB array of {team, role}; started out as a plain TEXT[] of team
      // names before roles-per-followed-team existed, hence the one-time
      // ARRAY->JSONB conversion below (dev-only data at the time, so
      // discarding old contents on that single transition is fine).
      sql`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'followed_teams'
          ) THEN
            ALTER TABLE users ADD COLUMN followed_teams JSONB NOT NULL DEFAULT '[]'::jsonb;
          ELSIF (
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'followed_teams'
          ) = 'ARRAY' THEN
            ALTER TABLE users ALTER COLUMN followed_teams DROP DEFAULT;
            ALTER TABLE users ALTER COLUMN followed_teams TYPE JSONB USING '[]'::jsonb;
            ALTER TABLE users ALTER COLUMN followed_teams SET DEFAULT '[]'::jsonb;
          END IF;
        END $$;
      `,
      sql`
        CREATE TABLE IF NOT EXISTS games (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`,
      sql`
        CREATE TABLE IF NOT EXISTS game_shares (
          game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (game_id, user_id)
        )
      `,
      // id is slugify(name) — stable and human-readable, and lets team_players
      // reference a team without an extra lookup when seeding.
      sql`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS team_players (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          photo_url TEXT,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS team_players_team_idx ON team_players (team_id)`,
      // Free text, not a fixed set of position codes — a player can list more
      // than one favorite position (e.g. "Middenvelder, Verdediger"), which a
      // single-select or a single point on a formation doesn't accommodate.
      sql`ALTER TABLE team_players ADD COLUMN IF NOT EXISTS position TEXT`,
      // Reference-only lookup ("is this name really a trainer/coach/manager of
      // this team") used to gate self-selecting an elevated Rol in Profile —
      // see team-staff.ts and team-staff-roster.ts. Not linked to `users` at
      // all: someone can be listed here long before (or without ever) creating
      // an account.
      sql`
        CREATE TABLE IF NOT EXISTS team_staff (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('Trainer', 'Coach', 'Manager')),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS team_staff_team_idx ON team_staff (team_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          read_at TIMESTAMPTZ
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, read_at)`,
      sql`CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (sender_id, recipient_id, created_at)`,
      // game_id is nullable and SET NULL on delete — a notification about a
      // match that's since been removed should stick around (just without a
      // working deep link) rather than disappear or block the game's deletion.
      sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          body TEXT NOT NULL,
          game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          read_at TIMESTAMPTZ
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at)`,
      // Tiny key-value store for one-off app state that doesn't belong on
      // any existing table — currently just the last app version announced
      // via announceReleaseIfNeeded below.
      sql`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `,
    ])

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

    try {
      await announceReleaseIfNeeded()
    } catch (err) {
      console.error('Release announcement failed:', err)
    }
  })()
  return schemaReady
}
