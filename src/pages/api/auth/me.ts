import { NextApiRequest, NextApiResponse } from 'next';
import {
  getAuthenticatedPlatform,
  getSpotifyAccessToken,
  getPlatformAccessToken,
} from '@/lib/auth';
import { getCurrentUser as getSpotifyUser } from '@/lib/spotify';
import { getMusicPlatform } from '@/lib/music-platform';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { PlatformUser } from '@/types';

/**
 * API route that returns the current authenticated user.
 *
 * Supports both Spotify and Apple Music platforms.
 * Returns user info along with the authenticated platform.
 *
 * GET /api/auth/me
 *
 * Response:
 * - Spotify: { id, display_name, email, platform: 'spotify' }
 * - Apple Music: { id, displayName, platform: 'apple-music' }
 * - Not authenticated: 401
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  const platform = getAuthenticatedPlatform(req);

  if (!platform) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = getPlatformAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let user: PlatformUser;

    if (platform === 'spotify') {
      // Use the existing Spotify function for backward compatibility
      const spotifyUser = await getSpotifyUser(accessToken);
      user = {
        id: spotifyUser.id,
        displayName: spotifyUser.display_name,
        email: spotifyUser.email,
        platform: 'spotify',
      };
    } else if (platform === 'apple-music') {
      // Use the Apple Music platform service
      const appleMusicService = getMusicPlatform('apple-music') as AppleMusicPlatformService;
      const developerToken = generateDeveloperToken();
      appleMusicService.setDeveloperToken(developerToken);
      user = await appleMusicService.getCurrentUser(accessToken);
    } else {
      return res.status(401).json({ error: 'Unknown platform' });
    }

    // Return user with platform info
    res.status(200).json({
      ...user,
      // Include legacy fields for backward compatibility
      display_name: user.displayName,
    });
  } catch (err: any) {
    console.error('Error fetching user:', err);
    // Differentiate auth failures from server/config errors
    if (err?.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Config errors (e.g., missing env vars) or server errors
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}
