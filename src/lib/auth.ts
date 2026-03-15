import { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';
import { MusicPlatform } from '@/types';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// ============================================================================
// Spotify Cookie Management
// ============================================================================

/**
 * Sets Spotify authentication cookies.
 * @deprecated Use setSpotifyAuthCookies instead for clarity
 */
export function setAuthCookies(
  res: NextApiResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) {
  setSpotifyAuthCookies(res, accessToken, refreshToken, expiresIn);
}

/**
 * Sets Spotify authentication cookies with access and refresh tokens.
 */
export function setSpotifyAuthCookies(
  res: NextApiResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) {
  res.setHeader('Set-Cookie', [
    serialize('spotify_access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: expiresIn,
    }),
    serialize('spotify_refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    }),
  ]);
}

/**
 * Gets the Spotify access token from cookies.
 * @deprecated Use getSpotifyAccessToken instead for clarity
 */
export function getAccessToken(req: NextApiRequest): string | null {
  return getSpotifyAccessToken(req);
}

/**
 * Gets the Spotify access token from cookies.
 */
export function getSpotifyAccessToken(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  return cookies.spotify_access_token || null;
}

/**
 * Gets the Spotify refresh token from cookies.
 */
export function getRefreshToken(req: NextApiRequest): string | null {
  return getSpotifyRefreshToken(req);
}

/**
 * Gets the Spotify refresh token from cookies.
 */
export function getSpotifyRefreshToken(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  return cookies.spotify_refresh_token || null;
}

/**
 * Clears Spotify authentication cookies.
 */
export function clearSpotifyAuthCookies(res: NextApiResponse) {
  res.setHeader('Set-Cookie', [
    serialize('spotify_access_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('spotify_refresh_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('music_platform', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
  ]);
}

/**
 * @deprecated Use clearSpotifyAuthCookies instead for clarity
 */
export function clearAuthCookies(res: NextApiResponse) {
  clearSpotifyAuthCookies(res);
}

// ============================================================================
// Platform-Agnostic Helpers
// ============================================================================

/**
 * Gets the currently authenticated music platform from cookies.
 */
export function getAuthenticatedPlatform(req: NextApiRequest): MusicPlatform | null {
  const cookies = parse(req.headers.cookie || '');

  // Check platform cookie first
  if (cookies.music_platform === 'apple-music' && cookies.apple_music_user_token) {
    return 'apple-music';
  }
  if (cookies.music_platform === 'spotify' && cookies.spotify_access_token) {
    return 'spotify';
  }

  // Fallback: check for tokens directly
  if (cookies.apple_music_user_token) {
    return 'apple-music';
  }
  if (cookies.spotify_access_token) {
    return 'spotify';
  }

  return null;
}

/**
 * Gets the access token for the currently authenticated platform.
 */
export function getPlatformAccessToken(req: NextApiRequest): string | null {
  const platform = getAuthenticatedPlatform(req);
  if (!platform) return null;

  const cookies = parse(req.headers.cookie || '');

  if (platform === 'spotify') {
    return cookies.spotify_access_token || null;
  }
  if (platform === 'apple-music') {
    return cookies.apple_music_user_token || null;
  }

  return null;
}

/**
 * Clears all authentication cookies for all platforms.
 */
export function clearAllAuthCookies(res: NextApiResponse) {
  res.setHeader('Set-Cookie', [
    serialize('spotify_access_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('spotify_refresh_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('apple_music_user_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('music_platform', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
  ]);
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

/**
 * Checks if the request is authenticated with any platform.
 */
export function isAuthenticated(req: NextApiRequest): boolean {
  return getAuthenticatedPlatform(req) !== null;
}

/**
 * Checks if the request is authenticated with Spotify.
 */
export function isSpotifyAuthenticated(req: NextApiRequest): boolean {
  return !!getSpotifyAccessToken(req);
}

/**
 * Checks if the request is authenticated with Apple Music.
 */
export function isAppleMusicAuthenticated(req: NextApiRequest): boolean {
  const cookies = parse(req.headers.cookie || '');
  return !!cookies.apple_music_user_token;
}
