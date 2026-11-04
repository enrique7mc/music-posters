import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '@/test/mocks/server';
import { AppleMusicPlatformService } from '../apple-music-platform';
import { PlatformAccessError, PartialAddError } from '../types';

const LIBRARY_URL = 'https://api.music.apple.com/v1/me/library/artists';
const SEARCH_URL = 'https://api.music.apple.com/v1/catalog/us/search';

describe('AppleMusicPlatformService.getLibraryArtists', () => {
  let service: AppleMusicPlatformService;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
  });

  it('paginates via `next`, prepending origin only (never /v1/v1)', async () => {
    const requested: string[] = [];
    server.use(
      http.get(LIBRARY_URL, ({ request }) => {
        requested.push(request.url);
        const offset = new URL(request.url).searchParams.get('offset');
        if (!offset) {
          return HttpResponse.json({
            data: [{ attributes: { name: 'Phoenix' } }, { attributes: { name: 'Caribou' } }],
            next: '/v1/me/library/artists?offset=2&limit=100',
          });
        }
        return HttpResponse.json({ data: [{ attributes: { name: 'Overmono' } }] }); // last page
      })
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix', 'Caribou', 'Overmono']);
    expect(complete).toBe(true); // read every page, no error
    // The second request resolves the relative `next` against the origin only —
    // it must keep a single `/v1`, not a doubled `/v1/v1`.
    expect(requested[1]).toBe(
      'https://api.music.apple.com/v1/me/library/artists?offset=2&limit=100'
    );
    expect(requested[1]).not.toContain('/v1/v1');
  });

  it('returns partial results AND complete:false on a mid-scan page error (no throw)', async () => {
    server.use(
      http.get(LIBRARY_URL, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset');
        if (!offset) {
          return HttpResponse.json({
            data: [{ attributes: { name: 'Phoenix' } }],
            next: '/v1/me/library/artists?offset=1&limit=100',
          });
        }
        return new HttpResponse(null, { status: 500 });
      })
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix']); // kept the first page, swallowed the error
    expect(complete).toBe(false); // a failed page means the scan is incomplete
  });

  it.each([401, 403])(
    'throws PlatformAccessError when Apple rejects the user token (%i)',
    async (status) => {
      server.use(http.get(LIBRARY_URL, () => new HttpResponse(null, { status })));

      const scan = service.getLibraryArtists('user-token');

      await expect(scan).rejects.toBeInstanceOf(PlatformAccessError);
      await expect(scan).rejects.toMatchObject({ status, platform: 'apple-music' });
    }
  );

  it('skips entries with no name and handles an empty library', async () => {
    server.use(
      http.get(LIBRARY_URL, () =>
        HttpResponse.json({
          data: [{ attributes: { name: 'Phoenix' } }, { attributes: {} }, {}],
        })
      )
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix']);
    expect(complete).toBe(true); // clean single page
  });

  it('stops at the MAX_LIBRARY_PAGES ceiling instead of looping forever', async () => {
    let calls = 0;
    server.use(
      // A library that ALWAYS returns another `next` — without the ceiling this loops forever.
      http.get(LIBRARY_URL, ({ request }) => {
        calls++;
        const offset = Number(new URL(request.url).searchParams.get('offset') || 0);
        return HttpResponse.json({
          data: [{ attributes: { name: `Artist ${offset}` } }],
          next: `/v1/me/library/artists?offset=${offset + 1}&limit=100`,
        });
      })
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(calls).toBe(50); // MAX_LIBRARY_PAGES — did not loop unbounded
    expect(artists).toHaveLength(50);
    expect(complete).toBe(false); // truncated by the ceiling
  });

  it('refuses to follow a non-Apple pagination `next` URL (token-exfil guard)', async () => {
    let evilHit = false;
    let leakedAuth: string | null = null;
    server.use(
      // A hostile/compromised upstream tries to redirect the authed scan off-Apple.
      http.get(LIBRARY_URL, () =>
        HttpResponse.json({
          data: [{ attributes: { name: 'Phoenix' } }],
          next: 'https://evil.example.com/v1/me/library/artists?offset=1',
        })
      ),
      http.get('https://evil.example.com/v1/me/library/artists', ({ request }) => {
        evilHit = true;
        leakedAuth = request.headers.get('authorization');
        return HttpResponse.json({ data: [{ attributes: { name: 'Pwned' } }] });
      })
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(evilHit).toBe(false); // the guard stopped the request before it left for the attacker
    expect(leakedAuth).toBeNull(); // bearer + Music-User-Token never sent off-Apple
    expect(artists).toEqual(['Phoenix']); // only the real Apple page survives
    expect(complete).toBe(false); // scan marked incomplete (treated like a failed page)
  });
});

describe('AppleMusicPlatformService.searchArtist', () => {
  let service: AppleMusicPlatformService;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
  });

  // Stub the catalog search to return artists with the given names.
  function stubCatalog(names: string[]) {
    server.use(
      http.get(SEARCH_URL, () =>
        HttpResponse.json({
          results: {
            artists: {
              data: names.map((name, i) => ({ id: `id-${i}`, attributes: { name } })),
            },
          },
        })
      )
    );
  }

  it('matches an accented search term to a de-accented catalog name (normalize regression)', async () => {
    // Post-refactor searchArtist runs both sides through the shared
    // artist-match.normalize(), which strips accents. "Beyoncé" must still match
    // a catalog "Beyonce" — a regression here would silently mismatch artists.
    stubCatalog(['Beyonce']);
    const result = await service.searchArtist('Beyoncé', 'user-token');
    expect(result).not.toBeNull();
    expect(result!.matched).toBe(true);
    expect(result!.name).toBe('Beyonce');
    expect(result!.similarity).toBe(1); // accents normalize away on both sides
  });

  it('picks the closest catalog entry, ignoring case/punctuation (normalize regression)', async () => {
    // "Tyler, the Creator" vs "Tyler, The Creator" differ only by case;
    // "Tyler Childers" is a different artist. normalize() must let the engine
    // pick the right one, not just the first result.
    stubCatalog(['Tyler Childers', 'Tyler, The Creator']);
    const result = await service.searchArtist('Tyler, the Creator', 'user-token');
    expect(result!.name).toBe('Tyler, The Creator');
    expect(result!.matched).toBe(true);
    expect(result!.similarity).toBe(1);
  });

  it('reports matched:false when the best catalog entry is below CATALOG_MATCH_THRESHOLD', async () => {
    stubCatalog(['Caribou']); // nothing like "Phoenix"
    const result = await service.searchArtist('Phoenix', 'user-token');
    expect(result).not.toBeNull();
    expect(result!.matched).toBe(false);
    expect(result!.similarity).toBeLessThan(0.6);
  });

  it('returns null when the catalog has no results', async () => {
    server.use(http.get(SEARCH_URL, () => HttpResponse.json({ results: {} })));
    expect(await service.searchArtist('Nobody', 'user-token')).toBeNull();
  });
});

describe('AppleMusicPlatformService.getArtistTopTracks', () => {
  let service: AppleMusicPlatformService;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
  });

  const TOP_SONGS_URL = 'https://api.music.apple.com/v1/catalog/us/artists/artist-1/view/top-songs';

  it('serves a request for 25 tracks from a single top-songs request (limit 25)', async () => {
    const requestedLimits: string[] = [];
    server.use(
      http.get(TOP_SONGS_URL, ({ request }) => {
        requestedLimits.push(new URL(request.url).searchParams.get('limit') ?? '');
        return HttpResponse.json({
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `t-${i}`,
            attributes: { name: `Track ${i}`, artistName: 'Phoenix', albumName: 'Album' },
          })),
        });
      })
    );

    const tracks = await service.getArtistTopTracks('artist-1', 'user-token', 25);

    // One top-songs request with limit 25 — the whole 1–25 range is served from
    // that pool with no extra calls (no rate-limit change needed).
    expect(requestedLimits).toEqual(['25']);
    expect(tracks).toHaveLength(25);
    expect(tracks.every((t) => t.platform === 'apple-music')).toBe(true);
  });
});

describe('AppleMusicPlatformService error redaction (errMessage)', () => {
  const SECRET = 'SUPERSECRET_DEV_TOKEN_do_not_log';
  let service: AppleMusicPlatformService;
  // Explicit type: ReturnType<typeof vi.spyOn> infers a constructor signature.
  let errorSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken(SECRET);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('never logs the bearer developer token when a search errors', async () => {
    service.retryBaseMs = 0;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 500 })));

    // After retries the lookup throws, so the caller reports "lookup failed"
    // instead of "not found".
    await expect(service.searchArtist('Phoenix', 'user-token')).rejects.toBeTruthy();
    warnSpy.mockRestore();
    expect(errorSpy).toHaveBeenCalled();
    // The raw axios error carries config.headers.Authorization = `Bearer ${SECRET}`.
    // errMessage() extracts only error.message, so the token must never appear.
    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('status code 500'); // logged the safe message instead
  });

  it('never logs the bearer/user tokens when createPlaylist hits a network error', async () => {
    // A network-level failure makes axios throw an error with NO `.response` —
    // exactly the case the old `response?.data || error` fallback leaked, since
    // it fell through to the raw axios error (config.headers carry both tokens).
    server.use(
      http.post('https://api.music.apple.com/v1/me/library/playlists', () => HttpResponse.error())
    );

    await expect(
      service.createPlaylist('user-id', 'My Playlist', 'user-token-SECRET')
    ).rejects.toBeTruthy();

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(SECRET); // developer bearer token
    expect(logged).not.toContain('user-token-SECRET'); // Music-User-Token
  });
});

describe('AppleMusicPlatformService transient-error retries', () => {
  const TOP_SONGS_URL = 'https://api.music.apple.com/v1/catalog/us/artists/artist-1/view/top-songs';
  let service: AppleMusicPlatformService;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
    service.retryBaseMs = 0;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const song = (id: string) => ({ id, attributes: { name: id, artistName: 'A', albumName: 'B' } });

  it('retries a 429 on top songs and returns the tracks', async () => {
    let calls = 0;
    server.use(
      http.get(TOP_SONGS_URL, () => {
        calls++;
        return calls === 1
          ? new HttpResponse(null, { status: 429 })
          : HttpResponse.json({ data: [song('t-1'), song('t-2')] });
      })
    );

    const tracks = await service.getArtistTopTracks('artist-1', 'user-token', 2);

    expect(calls).toBe(2);
    expect(tracks).toHaveLength(2);
  });

  // Regression: a persistent failure used to return [] and drop the artist
  // from the playlist with no warning.
  it('throws (not []) when top songs keep failing, after 3 attempts', async () => {
    let calls = 0;
    server.use(
      http.get(TOP_SONGS_URL, () => {
        calls++;
        return new HttpResponse(null, { status: 503 });
      })
    );

    await expect(service.getArtistTopTracks('artist-1', 'user-token', 2)).rejects.toBeTruthy();
    expect(calls).toBe(3);
  });

  it('returns [] for a 404 (artist has no top songs) without retrying', async () => {
    let calls = 0;
    server.use(
      http.get(TOP_SONGS_URL, () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      })
    );

    expect(await service.getArtistTopTracks('artist-1', 'user-token', 2)).toEqual([]);
    expect(calls).toBe(1);
  });

  it('throws PlatformAccessError when Apple rejects the developer token (403)', async () => {
    server.use(http.get(TOP_SONGS_URL, () => new HttpResponse(null, { status: 403 })));

    await expect(service.getArtistTopTracks('artist-1', 'user-token', 2)).rejects.toBeInstanceOf(
      PlatformAccessError
    );
  });
});

describe('AppleMusicPlatformService.addTracksToPlaylist', () => {
  const TRACKS_URL = 'https://api.music.apple.com/v1/me/library/playlists/p.1/tracks';
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(1000 + i));
  let service: AppleMusicPlatformService;
  let spies: MockInstance<(...args: unknown[]) => void>[];

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
    service.retryBaseMs = 0;
    spies = (['log', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
  });

  afterEach(() => spies.forEach((s) => s.mockRestore()));

  it('retries a rate-limited batch (429) and sends every batch', async () => {
    const batchSizes: number[] = [];
    let calls = 0;
    server.use(
      http.post(TRACKS_URL, async ({ request }) => {
        calls++;
        if (calls === 2) return new HttpResponse(null, { status: 429 }); // batch 2, first try
        const body = (await request.json()) as { data: unknown[] };
        batchSizes.push(body.data.length);
        return new HttpResponse(null, { status: 204 });
      })
    );

    await service.addTracksToPlaylist('p.1', ids(250), 'user-token');

    expect(batchSizes).toEqual([100, 100, 50]);
  });

  // A 5xx can arrive after Apple stored the batch, so a retry could add the
  // same tracks twice. Only 429 (refused before processing) is retried.
  it('does not retry a batch after a 5xx and reports what landed', async () => {
    let calls = 0;
    server.use(
      http.post(TRACKS_URL, () => {
        calls++;
        return calls === 1
          ? new HttpResponse(null, { status: 204 })
          : new HttpResponse(null, { status: 503 });
      })
    );

    const error = await service
      .addTracksToPlaylist('p.1', ids(250), 'user-token')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PartialAddError);
    expect(error).toMatchObject({ added: 100, total: 250 });
    expect(calls).toBe(2); // batch 1 + one attempt at batch 2; batch 3 never sent
  });
});

describe('AppleMusicPlatformService.getPlaylistTrackCount', () => {
  const TRACKS_URL = 'https://api.music.apple.com/v1/me/library/playlists/p.1/tracks';
  let service: AppleMusicPlatformService;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
    service.retryBaseMs = 0;
  });

  it('counts across pages by following `next`', async () => {
    server.use(
      http.get(TRACKS_URL, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset');
        return offset === '100'
          ? HttpResponse.json({ data: Array.from({ length: 50 }, () => ({})) })
          : HttpResponse.json({
              data: Array.from({ length: 100 }, () => ({})),
              next: '/v1/me/library/playlists/p.1/tracks?offset=100',
            });
      })
    );

    expect(await service.getPlaylistTrackCount('p.1', 'user-token')).toBe(150);
  });

  it('gives up at its budget when a page stalls', async () => {
    server.use(
      http.get(TRACKS_URL, async () => {
        await delay('infinite');
        return HttpResponse.json({ data: [] });
      })
    );
    const startedAt = Date.now();

    await expect(service.getPlaylistTrackCount('p.1', 'user-token', 200)).rejects.toBeTruthy();
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('returns 0 for an empty playlist (Apple answers 404)', async () => {
    server.use(http.get(TRACKS_URL, () => new HttpResponse(null, { status: 404 })));

    expect(await service.getPlaylistTrackCount('p.1', 'user-token')).toBe(0);
  });

  it('refuses to follow a non-Apple `next` URL (token-exfil guard)', async () => {
    server.use(
      http.get(TRACKS_URL, () =>
        HttpResponse.json({ data: [{}], next: 'https://evil.example/steal' })
      )
    );

    await expect(service.getPlaylistTrackCount('p.1', 'user-token')).rejects.toThrow(/non-Apple/);
  });
});
