import { NextApiRequest, NextApiResponse } from 'next';
import {
  getAuthenticatedPlatform,
  getSpotifyAccessToken,
  getPlatformAccessToken,
} from '@/lib/auth';
import { isDevModeAvailable, getDevConfig } from '@/lib/dev-mode';
import { getCurrentUser as getSpotifyUser } from '@/lib/spotify';
import { getMusicPlatform } from '@/lib/music-platform';
import { deriveAppleMusicDraftOwnerId, generateDeveloperToken } from '@/lib/apple-music-auth';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { errDetail } from '@/lib/safe-log';
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
 * - Spotify: { id, display_name, email, platform, draftOwnerId }
 * - Apple Music: { id, displayName, platform, draftOwnerId }
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

  // Dev mode: return fake user when skipAuth is enabled
  if (isDevModeAvailable()) {
    const devConfig = getDevConfig();
    if (devConfig.skipAuth) {
      console.log('[DEV MODE] Returning fake user (skipAuth=true)');
      return res.status(200).json({
        id: 'dev-user',
        displayName: 'Dev Mode User',
        display_name: 'Dev Mode User',
        platform: devConfig.fakePlatform,
        draftOwnerId: `dev-user:${devConfig.fakePlatform}`,
      });
    }
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
      // Spotify exposes a stable account ID. Apple Music does not, so bind
      // drafts to an opaque fingerprint of its user-specific credential rather
      // than the shared storefront returned as user.id.
      draftOwnerId:
        platform === 'apple-music' ? deriveAppleMusicDraftOwnerId(accessToken) : user.id,
      // Include legacy fields for backward compatibility
      display_name: user.displayName,
    });
  } catch (err: any) {
    // errDetail() only — the raw axios error carries the access token in config.headers.
    console.error('Error fetching user:', errDetail(err));
    // Differentiate auth failures from server/config errors
    if (err?.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Config errors (e.g., missing env vars) or server errors
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}
