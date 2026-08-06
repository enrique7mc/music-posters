import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { SpotifyPlatformService } from '../spotify-platform';
import { PlatformAccessError } from '../types';

const SEARCH_URL = 'https://api.spotify.com/v1/search';
const TOP_TRACKS_URL = 'https://api.spotify.com/v1/artists/:id/top-tracks';

const TOKEN = 'super-secret-access-token-do-not-log';

describe('SpotifyPlatformService — access-denied fail-fast', () => {
  let service: SpotifyPlatformService;

  beforeEach(() => {
    service = new SpotifyPlatformService();
  });

  // Spotify's Feb-2026 tier gating returns 403 on /artists/{id}/top-tracks for every
  // request. Degrading to [] per artist meant a 59-artist poster burned 59 requests
  // over 48s and then reported "Could not find any tracks" — the wrong diagnosis.
  it('throws PlatformAccessError on 403 from top-tracks instead of degrading to []', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 403 })));

    await expect(service.getArtistTopTracks('artist_1', TOKEN)).rejects.toBeInstanceOf(
      PlatformAccessError
    );
  });

  it('carries the status, platform and endpoint so the API route can explain itself', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 403 })));

    const error = await service.getArtistTopTracks('artist_1', TOKEN).catch((e) => e);

    expect(error).toBeInstanceOf(PlatformAccessError);
    expect(error.status).toBe(403);
    expect(error.platform).toBe('spotify');
    expect(error.endpoint).toContain('top-tracks');
  });

  it('throws on 401 too — an expired token is not a per-artist failure', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 401 })));

    await expect(service.getArtistTopTracks('artist_1', TOKEN)).rejects.toBeInstanceOf(
      PlatformAccessError
    );
  });

  // /api/search-tracks maps 401 → 401 (so the client re-authenticates) and 403 → 403
  // (an app-tier permission problem no login can fix). That routing depends entirely
  // on `status` surviving the wrap, so pin it: collapsing both to one code would
  // strand the user on a dead session with no way back.
  it('preserves the upstream status so the route can tell 401 from 403', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 401 })));
    const expired = await service.getArtistTopTracks('artist_1', TOKEN).catch((e) => e);
    expect(expired.status).toBe(401);

    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 403 })));
    const forbidden = await service.getArtistTopTracks('artist_1', TOKEN).catch((e) => e);
    expect(forbidden.status).toBe(403);
  });

  it('still degrades to [] for non-access errors (500) — those ARE per-artist', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 500 })));

    await expect(service.getArtistTopTracks('artist_1', TOKEN)).resolves.toEqual([]);
  });

  it('searchArtist throws on 403 but still returns null for a 500', async () => {
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(service.searchArtist('Phoenix', TOKEN)).rejects.toBeInstanceOf(
      PlatformAccessError
    );

    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(service.searchArtist('Phoenix', TOKEN)).resolves.toBeNull();
  });
});

describe('SpotifyPlatformService — never logs credentials', () => {
  let service: SpotifyPlatformService;
  // Explicit MockInstance rather than ReturnType<typeof vi.spyOn>, which infers a
  // constructor signature and fails tsc (see issue #42).
  let errorSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    service = new SpotifyPlatformService();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // A raw axios error carries config.headers.Authorization = `Bearer ${TOKEN}`.
  // console.error prints objects via util.inspect, so passing the error itself put
  // the user's access token straight into the Vercel logs.
  it('never logs the access token when a search errors', async () => {
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 500 })));

    await service.searchArtist('Phoenix', TOKEN);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(TOKEN);
    expect(logged).toContain('status code 500'); // the safe message survived
  });

  it('never logs the access token when top-tracks errors', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 500 })));

    await service.getArtistTopTracks('artist_1', TOKEN);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(TOKEN);
  });

  it('never logs the token on a network-level failure (error has no .response)', async () => {
    server.use(http.get(SEARCH_URL, () => HttpResponse.error()));

    await service.searchArtist('Phoenix', TOKEN);

    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(TOKEN);
  });
});
