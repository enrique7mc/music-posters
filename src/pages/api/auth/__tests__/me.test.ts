import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../me';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';

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
    });
  });

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
