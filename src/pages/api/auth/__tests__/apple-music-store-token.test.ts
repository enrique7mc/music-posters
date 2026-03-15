import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../auth/apple-music/store-token';

// Mock rate limiting to not interfere with tests
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: () => false,
  RateLimitPresets: { relaxed: () => ({}) },
}));

// Valid token (100+ chars, valid characters)
const VALID_TOKEN = 'a'.repeat(200);

describe('POST /api/auth/apple-music/store-token', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', 'http://127.0.0.1:3000');
  });

  it('should reject non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('should accept request from same hostname on different port', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3002' },
      body: { musicUserToken: VALID_TOKEN },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('should accept request from same hostname on same port', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3000' },
      body: { musicUserToken: VALID_TOKEN },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('should reject request from different hostname', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { origin: 'http://evil.com:3000' },
      body: { musicUserToken: VALID_TOKEN },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('should accept request when no origin header is sent', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { musicUserToken: VALID_TOKEN },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('should reject missing musicUserToken', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('musicUserToken is required');
  });

  it('should reject token with invalid format', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { musicUserToken: 'short' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Invalid musicUserToken format');
  });

  it('should accept tokens with dots, hyphens, and underscores', async () => {
    const jwtLikeToken =
      'eyJhbGciOiJFUzI1NiJ9.' + 'a'.repeat(50) + '.' + 'b'.repeat(50) + '-_padding';

    const { req, res } = createMocks({
      method: 'POST',
      body: { musicUserToken: jwtLikeToken },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });
});
