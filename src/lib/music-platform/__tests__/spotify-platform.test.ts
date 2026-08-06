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

  // Degrading to [] per artist meant 59 requests over 48s, then the wrong diagnosis.
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

  // The route tells them apart by type: wrapped → 403, raw → 401 "log in again".
  it('rethrows 401 raw, not wrapped, so the route can return 401', async () => {
    server.use(http.get(TOP_TRACKS_URL, () => new HttpResponse(null, { status: 401 })));

    const error = await service.getArtistTopTracks('artist_1', TOKEN).catch((e) => e);

    expect(error).not.toBeInstanceOf(PlatformAccessError);
    expect(error.response?.status).toBe(401);
  });

  // Returning null here is what would produce "Could not find any tracks" instead.
  it('does not swallow 401 into an empty result', async () => {
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(service.searchArtist('Phoenix', TOKEN)).rejects.toBeTruthy();
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
  // Explicit type: ReturnType<typeof vi.spyOn> infers a constructor and fails tsc (#42).
  let errorSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    service = new SpotifyPlatformService();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // A raw axios error carries the token in config.headers; console.error prints it.
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
