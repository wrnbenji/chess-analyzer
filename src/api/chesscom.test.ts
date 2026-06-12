import { describe, it, expect, vi, afterEach } from 'vitest'
import { getProfile, getArchives, getGames } from './chesscom'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

describe('getProfile', () => {
  it('returns profile json on success', async () => {
    mockFetch(200, { username: 'magnus', url: 'u', avatar: 'a' })
    const p = await getProfile('magnus')
    expect(p.username).toBe('magnus')
  })
  it('throws "Player not found" on 404', async () => {
    mockFetch(404, {})
    await expect(getProfile('nobody')).rejects.toThrow('Player not found')
  })
  it('throws rate-limit message on 429', async () => {
    mockFetch(429, {})
    await expect(getProfile('x')).rejects.toThrow(/Too many requests/)
  })
})

describe('getArchives', () => {
  it('returns the archives array', async () => {
    mockFetch(200, { archives: ['url1', 'url2'] })
    expect(await getArchives('magnus')).toEqual(['url1', 'url2'])
  })
})

describe('getGames', () => {
  it('returns the games array', async () => {
    mockFetch(200, { games: [{ url: 'g1' }] })
    const g = await getGames('archiveUrl')
    expect(g).toHaveLength(1)
  })
})
