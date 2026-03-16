import { NextApiRequest } from 'next';
import { MusicPlatform } from '@/types';

export interface DevConfig {
  enabled: boolean;
  mockAnalysis: boolean;
  mockTrackSearch: boolean;
  dryRunPlaylist: boolean;
  skipAuth: boolean;
  mockDelayMs: number;
  fakePlatform: MusicPlatform;
}

const DEFAULT_CONFIG: DevConfig = {
  enabled: false,
  mockAnalysis: false,
  mockTrackSearch: false,
  dryRunPlaylist: false,
  skipAuth: false,
  mockDelayMs: 0,
  fakePlatform: 'spotify',
};

// Use globalThis to survive Next.js HMR module re-evaluation in dev mode
const GLOBAL_KEY = '__MUSIC_POSTERS_DEV_CONFIG__';
const GLOBAL_INIT_KEY = '__MUSIC_POSTERS_DEV_INIT__';

let config: DevConfig = (globalThis as any)[GLOBAL_KEY] || { ...DEFAULT_CONFIG };
let initialized: boolean = (globalThis as any)[GLOBAL_INIT_KEY] || false;

/**
 * Returns true if dev mode is available (DEV_MODE=true AND not production).
 */
export function isDevModeAvailable(): boolean {
  return process.env.DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

function syncToGlobal() {
  (globalThis as any)[GLOBAL_KEY] = config;
  (globalThis as any)[GLOBAL_INIT_KEY] = initialized;
}

function initConfig() {
  if (initialized) return;
  initialized = true;

  if (!isDevModeAvailable()) {
    config = { ...DEFAULT_CONFIG };
    syncToGlobal();
    return;
  }

  config.enabled = true;

  // Read MOCK_DATA_DELAY_MS for initial delay value
  const delayMs = parseInt(process.env.MOCK_DATA_DELAY_MS || '0', 10);
  if (!isNaN(delayMs) && delayMs >= 0 && delayMs <= 5000) {
    config.mockDelayMs = delayMs;
  }

  syncToGlobal();
}

/**
 * Returns the current dev config. All toggles disabled if dev mode is not available.
 */
export function getDevConfig(): DevConfig {
  initConfig();
  if (!isDevModeAvailable()) {
    return { ...DEFAULT_CONFIG };
  }
  return { ...config };
}

/**
 * Updates the dev config with a partial update. Enforces coupling rules.
 * Throws if dev mode is not available.
 */
export function updateDevConfig(partial: Partial<DevConfig>): DevConfig {
  if (!isDevModeAvailable()) {
    throw new Error('Dev mode is not available');
  }

  initConfig();

  // Validate types
  const validKeys: Record<keyof DevConfig, string> = {
    enabled: 'boolean',
    mockAnalysis: 'boolean',
    mockTrackSearch: 'boolean',
    dryRunPlaylist: 'boolean',
    skipAuth: 'boolean',
    mockDelayMs: 'number',
    fakePlatform: 'string',
  };

  for (const [key, value] of Object.entries(partial)) {
    if (!(key in validKeys)) {
      throw new Error(`Invalid config key: ${key}`);
    }
    const expectedType = validKeys[key as keyof DevConfig];
    if (typeof value !== expectedType) {
      throw new Error(`Invalid type for ${key}: expected ${expectedType}, got ${typeof value}`);
    }
  }

  // Validate fakePlatform value
  if (partial.fakePlatform && !['spotify', 'apple-music'].includes(partial.fakePlatform)) {
    throw new Error(`Invalid fakePlatform: ${partial.fakePlatform}`);
  }

  // Validate mockDelayMs range
  if (
    partial.mockDelayMs !== undefined &&
    (partial.mockDelayMs < 0 || partial.mockDelayMs > 5000)
  ) {
    throw new Error('mockDelayMs must be between 0 and 5000');
  }

  // Merge update
  Object.assign(config, partial);

  // Enforce coupling: skipAuth → dryRunPlaylist and mockTrackSearch must be true
  // (a fake token should never reach real APIs)
  if (config.skipAuth) {
    config.dryRunPlaylist = true;
    config.mockTrackSearch = true;
  }

  syncToGlobal();
  return { ...config };
}

/**
 * Returns true if the request originates from localhost.
 */
export function isLocalhost(req: NextApiRequest): boolean {
  const ip = req.socket?.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Resets config to defaults. Used for testing.
 */
export function resetDevConfig() {
  config = { ...DEFAULT_CONFIG };
  initialized = false;
  syncToGlobal();
}
