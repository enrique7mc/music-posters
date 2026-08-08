import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { AppleMusicPlatformService } from '../apple-music-platform';

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
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 500 })));

    const result = await service.searchArtist('Phoenix', 'user-token');

    expect(result).toBeNull(); // errors degrade to null, never throw
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
