export interface ProfileUser {
  id: string
  email: string
  name: string | null
  picture: string | null
  defaultTeam: string | null
  firstName: string | null
  lastName: string | null
  role: string | null
}

// Maps a raw `users` table row (snake_case columns) to the camelCase shape
// the frontend expects.
export function toUser(row: any): ProfileUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    defaultTeam: row.default_team,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
  }
}
