import { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';
import jwt from 'jsonwebtoken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// Cache for developer token (valid for 6 months, but we refresh more often)
let cachedDeveloperToken: string | null = null;
let cachedTokenExpiry: number = 0;

/**
 * Generates a developer token (JWT) for Apple Music API.
 * The token is signed using ES256 algorithm with the private key from Apple Developer Portal.
 *
 * Developer tokens are valid for up to 6 months, but we generate them more frequently
 * for security best practices.
 *
 * @returns Signed JWT developer token
 * @throws Error if required environment variables are missing
 */
export function generateDeveloperToken(): string {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 5 minute buffer)
  if (cachedDeveloperToken && cachedTokenExpiry > now + 300) {
    return cachedDeveloperToken;
  }

  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!teamId) {
    throw new Error('APPLE_MUSIC_TEAM_ID environment variable is not set');
  }
  if (!keyId) {
    throw new Error('APPLE_MUSIC_KEY_ID environment variable is not set');
  }
  if (!privateKey) {
    throw new Error('APPLE_MUSIC_PRIVATE_KEY environment variable is not set');
  }

  // Parse the private key (handle escaped newlines from env vars)
  const parsedPrivateKey = privateKey.replace(/\\n/g, '\n');

  // Token expires in 30 days (less than max 6 months for better security)
  const expiresIn = 30 * 24 * 60 * 60; // 30 days in seconds
  const expiry = now + expiresIn;

  const token = jwt.sign(
    {
      iss: teamId,
      iat: now,
      exp: expiry,
    },
    parsedPrivateKey,
    {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: keyId,
      },
    }
  );

  // Cache the token
  cachedDeveloperToken = token;
  cachedTokenExpiry = expiry;

  return token;
}

/**
 * Sets Apple Music authentication cookies.
 * The Music User Token is obtained client-side via MusicKit JS and stored in an httpOnly cookie.
 *
 * @param res - Next.js API response
 * @param musicUserToken - The Music User Token from MusicKit JS authorization
 */
export function setAppleMusicCookies(res: NextApiResponse, musicUserToken: string) {
  // Apple Music User Tokens expire after approximately 24 hours
  const maxAge = 24 * 60 * 60; // 24 hours

  res.setHeader('Set-Cookie', [
    serialize('apple_music_user_token', musicUserToken, {
      ...COOKIE_OPTIONS,
      maxAge,
    }),
    // Also set a flag to indicate which platform is authenticated
    serialize('music_platform', 'apple-music', {
      ...COOKIE_OPTIONS,
      maxAge,
    }),
  ]);
}

/**
 * Gets the Apple Music User Token from cookies.
 *
 * @param req - Next.js API request
 * @returns The Music User Token or null if not authenticated
 */
export function getAppleMusicToken(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  return cookies.apple_music_user_token || null;
}

/**
 * Clears Apple Music authentication cookies.
 *
 * @param res - Next.js API response
 */
export function clearAppleMusicCookies(res: NextApiResponse) {
  res.setHeader('Set-Cookie', [
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

/**
 * Validates that the Apple Music User Token is in the expected format.
 * Note: We can't fully validate the token server-side without making an API call.
 *
 * @param token - The token to validate
 * @returns True if the token appears valid
 */
export function isValidAppleMusicToken(token: string): boolean {
  // Apple Music User Tokens are base64-encoded strings
  // They're typically quite long (several hundred characters)
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Basic format validation
  if (token.length < 100) {
    return false;
  }

  // Should be base64-like characters
  const base64Pattern = /^[A-Za-z0-9+/=]+$/;
  return base64Pattern.test(token);
}
