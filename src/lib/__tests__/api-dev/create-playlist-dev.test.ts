import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/create-playlist';
import { resetDevConfig, updateDevConfig } from '@/lib/dev-mode';

// Mock rate limit module
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: {
    moderate: vi.fn(() => ({})),
  },
}));

describe('/api/create-playlist (dev mode)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetDevConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDevConfig();
  });

  it('dry-run returns fake URL without hitting APIs', async () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';
    resetDevConfig();
    updateDevConfig({ skipAuth: true, dryRunPlaylist: true });

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        trackIds: ['spotify:track:0VjIjW4GlUZAMYd2vXMi3b', 'spotify:track:5QO79kh1waicV47BqGRL3g'],
        playlistName: 'Test Playlist',
        platform: 'spotify',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.dryRun).toBe(true);
    expect(data.tracksAdded).toBe(2);
    expect(data.playlistUrl).toContain('dev-dry-run');
    expect(data.platform).toBe('spotify');
  });
});
