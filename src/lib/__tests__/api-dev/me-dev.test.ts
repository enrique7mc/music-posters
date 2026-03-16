import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/auth/me';
import { resetDevConfig, updateDevConfig } from '@/lib/dev-mode';

// Mock rate limit module to avoid rate limiting in tests
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: {
    relaxed: vi.fn(() => ({})),
  },
}));

describe('/api/auth/me (dev mode)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDevConfig();
  });

  it('returns fake user when skipAuth is enabled', async () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';
    resetDevConfig();
    updateDevConfig({ skipAuth: true, fakePlatform: 'spotify' });

    const { req, res } = createMocks({
      method: 'GET',
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.id).toBe('dev-user');
    expect(data.displayName).toBe('Dev Mode User');
    expect(data.platform).toBe('spotify');
  });
});
