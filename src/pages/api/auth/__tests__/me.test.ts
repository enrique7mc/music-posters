import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../me';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';

vi.mock('@/lib/apple-music-auth', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/apple-music-auth')>('@/lib/apple-music-auth');
  return {
    ...actual,
    generateDeveloperToken: vi.fn(() => 'mock_developer_token'),
  };
});

// Mock rate limit module to avoid rate limiting in tests
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: {
    relaxed: vi.fn(() => ({})),
  },
}));

describe('/api/auth/me', () => {
  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return 401 when not authenticated', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Not authenticated' });
  });

  it('should return user data when authenticated', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        cookie: 'spotify_access_token=mock_access_token',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toEqual({
      id: 'mock_user_id',
      displayName: 'Mock User',
      display_name: 'Mock User', // legacy field
      email: 'mock@example.com',
      platform: 'spotify',
      draftOwnerId: 'mock_user_id',
    });
  });

  it('returns distinct opaque draft owners for Apple users in the same storefront', async () => {
    server.use(
      http.get('https://api.music.apple.com/v1/me/storefront', () =>
        HttpResponse.json({ data: [{ id: 'us', type: 'storefronts' }] })
      )
    );

    const firstToken = 'a'.repeat(120);
    const secondToken = 'b'.repeat(120);
    const requestFor = (token: string) =>
      createMocks({
        method: 'GET',
        headers: {
          cookie: `apple_music_user_token=${token}; music_platform=apple-music`,
        },
      });

    const first = requestFor(firstToken);
    await handler(first.req, first.res);
    const firstData = JSON.parse(first.res._getData());

    const second = requestFor(secondToken);
    await handler(second.req, second.res);
    const secondData = JSON.parse(second.res._getData());

    expect(first.res._getStatusCode()).toBe(200);
    expect(second.res._getStatusCode()).toBe(200);
    expect(firstData.id).toBe('us');
    expect(secondData.id).toBe('us');
    expect(firstData.draftOwnerId).toMatch(/^apple-music:/);
    expect(secondData.draftOwnerId).toMatch(/^apple-music:/);
    expect(firstData.draftOwnerId).not.toBe(secondData.draftOwnerId);
    expect(firstData.draftOwnerId).not.toContain(firstToken);
  });

  // Dev mode test for /api/auth/me is in src/lib/__tests__/api-dev/me-dev.test.ts
  // (kept outside pages/ to avoid Next.js process.env.NODE_ENV replacement)

  it('should return 401 when access token is invalid', async () => {
    server.use(
      http.get('https://api.spotify.com/v1/me', () => {
        return new HttpResponse(null, { status: 401 });
      })
    );

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        cookie: 'spotify_access_token=invalid_token',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Invalid or expired token' });
  });
});
