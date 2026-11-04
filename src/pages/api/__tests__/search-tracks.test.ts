import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../search-tracks';
import { searchAndGetTopTracks } from '@/lib/music-platform';

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: { moderate: vi.fn(() => ({})) },
}));

vi.mock('@/lib/apple-music-auth', () => ({
  generateDeveloperToken: () => 'dev-token',
}));

vi.mock('@/lib/music-platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/music-platform')>()),
  searchAndGetTopTracks: vi.fn(),
}));

const APPLE_COOKIE = 'music_platform=apple-music; apple_music_user_token=user-token';
const track = { id: '1', name: 'Song', artist: 'A', platform: 'apple-music' };

function createRequest() {
  return createMocks({
    method: 'POST',
    headers: { cookie: APPLE_COOKIE },
    body: { artists: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
  });
}

describe('/api/search-tracks per-artist failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // Regression: an artist whose request failed used to vanish without a warning.
  it('warns about failed artists first, and does not call them "not found"', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      tracks: [track as any],
      foundArtists: 2,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, lookupFailed: false },
        { requested: 'B', found: 'B', similarity: 1, lookupFailed: false },
        { requested: 'C', found: null, similarity: 0, lookupFailed: true },
      ],
      failedArtists: [
        { artist: 'C', stage: 'search', reason: '503' },
        { artist: 'B', stage: 'tracks', reason: '429' },
      ],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const { warnings } = JSON.parse(res._getData());
    expect(warnings[0]).toMatch(/didn't respond for 2 artists/);
    expect(warnings).toContain('Couldn\'t load tracks for "C" (Apple Music error)');
    expect(warnings).toContain('Couldn\'t load tracks for "B" (Apple Music error)');
    expect(warnings.some((w: string) => w.includes('was not found'))).toBe(false);
  });

  it('returns 503 (not "no tracks found") when every matched artist failed', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      tracks: [],
      foundArtists: 1,
      artistMatches: [{ requested: 'A', found: 'A', similarity: 1, lookupFailed: false }],
      failedArtists: [{ artist: 'A', stage: 'tracks', reason: '503' }],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(503);
  });
});
