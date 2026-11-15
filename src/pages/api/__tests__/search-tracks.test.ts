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
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [track as any],
      foundArtists: 2,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
        { requested: 'B', found: 'B', similarity: 1, matched: true, lookupFailed: false },
        { requested: 'C', found: null, similarity: 0, matched: false, lookupFailed: true },
      ],
      failedArtists: [
        { artist: 'C', stage: 'search', reason: '503' },
        { artist: 'B', stage: 'tracks', reason: '429' },
      ],
      shortArtists: [],
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
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [],
      foundArtists: 1,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
      ],
      failedArtists: [{ artist: 'A', stage: 'tracks', reason: '503' }],
      shortArtists: [],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(503);
  });

  it('reports short artists and missing tracks in the summary log line', async () => {
    const log = vi.mocked(console.log);
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [track as any],
      foundArtists: 2,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
        { requested: 'B', found: 'B', similarity: 1, matched: true, lookupFailed: false },
      ],
      failedArtists: [],
      shortArtists: [
        { artist: 'A', matchedAs: 'A', requested: 8, received: 2 },
        { artist: 'B', matchedAs: 'B', requested: 3, received: 2 },
      ],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    const summary = log.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.startsWith('[search-tracks]'));
    expect(summary).toContain('shortArtists=2 shortTracks=7');
  });

  it('warns about a match below the threshold as "not found", not "matched as"', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [track as any],
      foundArtists: 1,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
        {
          requested: 'Porter',
          found: 'Portera',
          similarity: 0.4,
          matched: false,
          lookupFailed: false,
        },
      ],
      failedArtists: [],
      shortArtists: [],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    const { warnings } = JSON.parse(res._getData());
    expect(warnings).toEqual(['"Porter" was not found on Apple Music']);
  });

  it('does not warn about a whole-name match with a low similarity', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [track as any],
      foundArtists: 2,
      artistMatches: [
        {
          requested: 'Maldita Vecindad',
          found: 'Maldita Vecindad y Los Hijos del Quinto Patio',
          similarity: 0.36,
          matched: true,
          matchType: 'contains',
          lookupFailed: false,
        },
        {
          requested: 'Los Bunkers',
          found: 'Los Bunker',
          similarity: 0.91,
          matched: true,
          matchType: 'fuzzy',
          lookupFailed: false,
        },
        {
          requested: 'Caifanes',
          found: 'Caifan',
          similarity: 0.75,
          matched: true,
          matchType: 'fuzzy',
          lookupFailed: false,
        },
      ],
      failedArtists: [],
      shortArtists: [],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    const { warnings } = JSON.parse(res._getData());
    expect(warnings).toEqual(['"Caifanes" matched as "Caifan" (75% match)']);
  });

  it('warns the user about an artist with fewer tracks than requested', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      setlistArtists: [],
      setlistFallbacks: [],
      tracks: [track as any],
      foundArtists: 2,
      artistMatches: [
        { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
        { requested: 'B', found: 'B', similarity: 1, matched: true, lookupFailed: false },
      ],
      failedArtists: [],
      shortArtists: [
        { artist: 'A', matchedAs: 'A', requested: 8, received: 2 },
        { artist: 'B', matchedAs: 'B Band', requested: 3, received: 1 },
      ],
    });
    const { req, res } = createRequest();

    await handler(req as any, res as any);

    const { warnings } = JSON.parse(res._getData());
    expect(warnings).toEqual([
      'Only 2 of 8 tracks found for "A"',
      'Only 1 of 3 tracks found for "B" (matched as "B Band")',
    ]);
  });
});

describe('/api/search-tracks tour setlists', () => {
  const okResult = {
    tracks: [track as any],
    foundArtists: 1,
    artistMatches: [
      { requested: 'A', found: 'A', similarity: 1, matched: true, lookupFailed: false },
    ],
    failedArtists: [],
    shortArtists: [],
    setlistArtists: [],
    setlistFallbacks: [],
  };

  function requestWith(body: Record<string, unknown>) {
    return createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [{ name: 'A' }, { name: 'B' }], ...body },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('rejects a setlist artist that is not in the request (400)', async () => {
    const { req, res } = requestWith({ setlistArtistNames: ['A', 'Z'] });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(searchAndGetTopTracks).not.toHaveBeenCalled();
  });

  it('rejects more setlist artists than the artist cap (400)', async () => {
    const { req, res } = requestWith({
      setlistArtistNames: Array.from({ length: 151 }, () => 'A'),
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('still answers 405 before validation', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('passes the Setlist Scope through and returns setlistArtists and warnings', async () => {
    const info = {
      artist: 'A',
      latestDate: '2026-11-13',
      venue: 'Zénith',
      city: 'Paris',
      url: 'https://www.setlist.fm/setlist/a.html',
      setSize: 18,
      resolved: 14,
    };
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      ...okResult,
      setlistArtists: [info],
      setlistFallbacks: [{ artist: 'B', reason: 'not-on-tour', mode: 'popular' }],
    });
    const { req, res } = requestWith({ setlistArtistNames: [' A ', 'B'] });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(vi.mocked(searchAndGetTopTracks).mock.calls[0][3]?.setlistArtistNames).toEqual([
      'A',
      'B',
    ]);
    const body = JSON.parse(res._getData());
    expect(body.setlistArtists).toEqual([info]);
    expect(body.warnings).toEqual([
      'No recent setlist for "B", used Popular Hits',
      'Resolved 14 of 18 setlist songs for "A"',
    ]);
  });

  it('adds one warning when the key is missing', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      ...okResult,
      setlistFallbacks: [
        { artist: 'A', reason: 'no-key', mode: 'popular' },
        { artist: 'B', reason: 'no-key', mode: 'popular' },
      ],
    });
    const { req, res } = requestWith({ setlistArtistNames: ['A', 'B'] });

    await handler(req as any, res as any);

    const { warnings } = JSON.parse(res._getData());
    expect(warnings).toEqual([
      'Tour setlists are unavailable: no setlist.fm API key is configured.',
    ]);
  });

  it('omits setlistArtists when the toggle is off', async () => {
    vi.mocked(searchAndGetTopTracks).mockResolvedValue(okResult);
    const { req, res } = requestWith({});
    await handler(req as any, res as any);
    expect(JSON.parse(res._getData()).setlistArtists).toBeUndefined();
  });

  it('puts the missing-key warning first, ahead of artist warnings', async () => {
    const names = Array.from({ length: 11 }, (_, i) => `Missing ${i}`);
    vi.mocked(searchAndGetTopTracks).mockResolvedValue({
      ...okResult,
      artistMatches: [
        ...okResult.artistMatches,
        ...names.map((n) => ({
          requested: n,
          found: null,
          similarity: 0,
          matched: false,
          lookupFailed: false,
        })),
      ],
      setlistFallbacks: [{ artist: 'A', reason: 'no-key', mode: 'popular' }],
    });
    const { req, res } = requestWith({ setlistArtistNames: ['A'] });

    await handler(req as any, res as any);

    const { warnings } = JSON.parse(res._getData());
    expect(warnings[0]).toBe('Tour setlists are unavailable: no setlist.fm API key is configured.');
    expect(warnings).toHaveLength(12);
  });
});
