import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import handler from '../personalize';

// No rate limiting in tests.
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: { moderate: vi.fn(() => ({})) },
}));

// Avoid needing real Apple signing keys for the developer token.
vi.mock('@/lib/apple-music-auth', () => ({
  generateDeveloperToken: () => 'dev-token',
}));

const LIBRARY_URL = 'https://api.music.apple.com/v1/me/library/artists';
const APPLE_COOKIE = 'music_platform=apple-music; apple_music_user_token=user-token';

function libraryReturning(names: string[]) {
  server.use(
    http.get(LIBRARY_URL, () =>
      HttpResponse.json({ data: names.map((name) => ({ attributes: { name } })) })
    )
  );
}

describe('/api/personalize', () => {
  // Keep gems out of these tests (no key → loved-only, fully deterministic).
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 401 when not authenticated', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {},
      body: { artists: [{ name: 'Phoenix' }] },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 400 for an empty artists array', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [] },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('tags library matches as loved (Apple Music, no Gemini key)', async () => {
    libraryReturning(['Phoenix', 'Caribou']);
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [{ name: 'Phoenix' }, { name: 'Anz' }] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.lovedCount).toBe(1);
    expect(data.gemCount).toBe(0);
    expect(data.degraded).toBe(false);
    const phoenix = data.artists.find((a: any) => a.name === 'Phoenix');
    expect(phoenix.affinity).toBe('loved');
    expect(data.artists.find((a: any) => a.name === 'Anz').affinity).toBeUndefined();
  });

  it('strips client-supplied affinity metadata (server is the sole authority)', async () => {
    libraryReturning(['Phoenix']);
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      // Client lies: claims a gem with bogus confidence. Must be ignored.
      body: {
        artists: [{ name: 'Phoenix', affinity: 'gem', affinityConfidence: 0.99 }],
      },
    });

    await handler(req as any, res as any);

    const data = JSON.parse(res._getData());
    const phoenix = data.artists.find((a: any) => a.name === 'Phoenix');
    expect(phoenix.affinity).toBe('loved'); // not the client's 'gem'
    expect(phoenix.affinityConfidence).not.toBe(0.99);
  });

  it('returns a plain, degraded lineup when nothing matches the library', async () => {
    libraryReturning([]);
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [{ name: 'Phoenix' }, { name: 'Anz' }] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.lovedCount).toBe(0);
    expect(data.gemCount).toBe(0);
    expect(data.artists.every((a: any) => a.affinity === undefined)).toBe(true);
  });

  it('degrades to a plain lineup when the library scan errors (never 500s)', async () => {
    server.use(http.get(LIBRARY_URL, () => new HttpResponse(null, { status: 500 })));
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [{ name: 'Phoenix' }] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.lovedCount).toBe(0);
    expect(data.artists[0].affinity).toBeUndefined();
  });

  it('returns 401 on a platform mismatch (authed apple-music, body asks spotify)', async () => {
    // Security boundary: a user authed with one platform must not run a
    // personalize scan against another. A regression loosening this would
    // otherwise pass every other test (none send a mismatched platform).
    const { req, res } = createMocks({
      method: 'POST',
      headers: { cookie: APPLE_COOKIE },
      body: { artists: [{ name: 'Phoenix' }], platform: 'spotify' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData()).error).toMatch(/log in to spotify/i);
  });
});
