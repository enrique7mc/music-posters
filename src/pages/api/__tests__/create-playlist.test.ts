import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import handler from '../create-playlist';

// No rate limiting in tests.
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: { moderate: vi.fn(() => ({})) },
}));

// Avoid needing real Apple signing keys for the developer token.
vi.mock('@/lib/apple-music-auth', () => ({
  generateDeveloperToken: () => 'dev-token',
}));

const APPLE_STOREFRONT_URL = 'https://api.music.apple.com/v1/me/storefront';
const APPLE_PLAYLISTS_URL = 'https://api.music.apple.com/v1/me/library/playlists';
const SPOTIFY_PLAYLISTS_URL = 'https://api.spotify.com/v1/users/:userId/playlists';
const APPLE_COOKIE = 'music_platform=apple-music; apple_music_user_token=user-token';
const SPOTIFY_COOKIE = 'music_platform=spotify; spotify_access_token=access-token';
const APPLE_EXPIRED = 'Apple Music authentication expired. Please log in again.';

function createRequest(cookie: string) {
  return createMocks({
    method: 'POST',
    headers: { cookie },
    body: { trackIds: ['1440818839'], playlistName: 'Test Mix' },
  });
}

describe('/api/create-playlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(http.get(APPLE_STOREFRONT_URL, () => HttpResponse.json({ data: [{ id: 'us' }] })));
  });

  it('returns 405 for non-POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it.each([401, 403])(
    'returns 401 and clears the session when Apple rejects the user token (%i)',
    async (status) => {
      server.use(http.post(APPLE_PLAYLISTS_URL, () => new HttpResponse(null, { status })));
      const { req, res } = createRequest(APPLE_COOKIE);

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData()).error).toBe(APPLE_EXPIRED);
      const cookies = res.getHeader('Set-Cookie') as string[];
      expect(cookies.some((c) => c.startsWith('apple_music_user_token=;'))).toBe(true);
    }
  );

  it('keeps returning 429 when Apple rate-limits the request', async () => {
    server.use(http.post(APPLE_PLAYLISTS_URL, () => new HttpResponse(null, { status: 429 })));
    const { req, res } = createRequest(APPLE_COOKIE);

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(429);
  });

  it('does not map a Spotify 403 to 401 (Apple-only behavior)', async () => {
    server.use(http.post(SPOTIFY_PLAYLISTS_URL, () => new HttpResponse(null, { status: 403 })));
    const { req, res } = createRequest(SPOTIFY_COOKIE);

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(res.getHeader('Set-Cookie')).toBeUndefined();
  });

  it('keeps mapping a Spotify 401 to 401 without clearing cookies', async () => {
    server.use(http.post(SPOTIFY_PLAYLISTS_URL, () => new HttpResponse(null, { status: 401 })));
    const { req, res } = createRequest(SPOTIFY_COOKIE);

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData()).error).toBe(
      'Spotify authentication expired. Please log in again.'
    );
    expect(res.getHeader('Set-Cookie')).toBeUndefined();
  });
});
