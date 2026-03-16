import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDevModeAvailable, getDevConfig, updateDevConfig, resetDevConfig } from '../dev-mode';

describe('dev-mode.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetDevConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDevConfig();
  });

  describe('isDevModeAvailable', () => {
    it('returns false when NODE_ENV=production', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'production';

      expect(isDevModeAvailable()).toBe(false);
    });

    it('returns false when DEV_MODE is unset', () => {
      delete process.env.DEV_MODE;
      process.env.NODE_ENV = 'development';

      expect(isDevModeAvailable()).toBe(false);
    });

    it('returns true when DEV_MODE=true and NODE_ENV is not production', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      expect(isDevModeAvailable()).toBe(true);
    });

    it('returns false when DEV_MODE=false', () => {
      process.env.DEV_MODE = 'false';
      process.env.NODE_ENV = 'development';

      expect(isDevModeAvailable()).toBe(false);
    });
  });

  describe('getDevConfig', () => {
    it('returns all-disabled config when dev mode not available', () => {
      delete process.env.DEV_MODE;
      process.env.NODE_ENV = 'development';

      const config = getDevConfig();

      expect(config.enabled).toBe(false);
      expect(config.mockAnalysis).toBe(false);
      expect(config.mockTrackSearch).toBe(false);
      expect(config.dryRunPlaylist).toBe(false);
      expect(config.skipAuth).toBe(false);
    });

    it('defaults mockAnalysis and mockTrackSearch from USE_MOCK_DATA=true', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';
      process.env.USE_MOCK_DATA = 'true';

      const config = getDevConfig();

      expect(config.enabled).toBe(true);
      expect(config.mockAnalysis).toBe(true);
      expect(config.mockTrackSearch).toBe(true);
    });

    it('reads MOCK_DATA_DELAY_MS for initial delay value', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';
      process.env.MOCK_DATA_DELAY_MS = '2000';

      const config = getDevConfig();

      expect(config.mockDelayMs).toBe(2000);
    });

    it('ignores invalid MOCK_DATA_DELAY_MS values', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';
      process.env.MOCK_DATA_DELAY_MS = 'abc';

      const config = getDevConfig();

      expect(config.mockDelayMs).toBe(0);
    });

    it('defaults fakePlatform to spotify', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      const config = getDevConfig();

      expect(config.fakePlatform).toBe('spotify');
    });
  });

  describe('updateDevConfig', () => {
    it('enforces skipAuth → dryRunPlaylist coupling', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      const config = updateDevConfig({ skipAuth: true, dryRunPlaylist: false });

      expect(config.skipAuth).toBe(true);
      expect(config.dryRunPlaylist).toBe(true);
    });

    it('allows dryRunPlaylist=true without skipAuth', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      const config = updateDevConfig({ dryRunPlaylist: true, skipAuth: false });

      expect(config.dryRunPlaylist).toBe(true);
      expect(config.skipAuth).toBe(false);
    });

    it('throws when dev mode is not available', () => {
      delete process.env.DEV_MODE;
      process.env.NODE_ENV = 'development';

      expect(() => updateDevConfig({ mockAnalysis: true })).toThrow('Dev mode is not available');
    });

    it('throws on invalid config key', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      expect(() => updateDevConfig({ invalidKey: true } as any)).toThrow('Invalid config key');
    });

    it('throws on invalid type', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      expect(() => updateDevConfig({ mockAnalysis: 'yes' } as any)).toThrow('Invalid type');
    });

    it('throws on invalid fakePlatform value', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      expect(() => updateDevConfig({ fakePlatform: 'tidal' as any })).toThrow(
        'Invalid fakePlatform'
      );
    });

    it('throws on out-of-range mockDelayMs', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      expect(() => updateDevConfig({ mockDelayMs: 10000 })).toThrow('mockDelayMs must be between');
    });

    it('merges partial updates', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'development';

      updateDevConfig({ mockAnalysis: true });
      const config = updateDevConfig({ mockTrackSearch: true });

      expect(config.mockAnalysis).toBe(true);
      expect(config.mockTrackSearch).toBe(true);
    });
  });

  describe('security boundary', () => {
    it('NODE_ENV=production + DEV_MODE=true → all dev features OFF', () => {
      process.env.DEV_MODE = 'true';
      process.env.NODE_ENV = 'production';

      expect(isDevModeAvailable()).toBe(false);

      const config = getDevConfig();
      expect(config.enabled).toBe(false);
      expect(config.mockAnalysis).toBe(false);
      expect(config.mockTrackSearch).toBe(false);
      expect(config.dryRunPlaylist).toBe(false);
      expect(config.skipAuth).toBe(false);

      expect(() => updateDevConfig({ mockAnalysis: true })).toThrow('Dev mode is not available');
    });
  });
});
