import type { Profile, Game } from '../types'

const BASE = 'https://api.chess.com/pub'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 404) throw new Error('Player not found')
  if (res.status === 429) throw new Error('Too many requests, try again shortly')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export async function getProfile(username: string): Promise<Profile> {
  return getJson<Profile>(`${BASE}/player/${encodeURIComponent(username.toLowerCase())}`)
}

export async function getArchives(username: string): Promise<string[]> {
  const data = await getJson<{ archives: string[] }>(
    `${BASE}/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
  )
  return data.archives
}

export async function getGames(archiveUrl: string): Promise<Game[]> {
  const data = await getJson<{ games: Game[] }>(archiveUrl)
  return data.games
}
