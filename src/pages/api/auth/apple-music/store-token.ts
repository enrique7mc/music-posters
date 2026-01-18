import { NextApiRequest, NextApiResponse } from 'next';
import { setAppleMusicCookies, isValidAppleMusicToken } from '@/lib/apple-music-auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

/**
 * API route that stores the Apple Music User Token in an httpOnly cookie.
 *
 * The Music User Token is obtained client-side via MusicKit JS authorization.
 * After the user authorizes the app, the client sends the token here to be stored
 * securely in an httpOnly cookie.
 *
 * POST /api/auth/apple-music/store-token
 *
 * Request body: { musicUserToken: string }
 * Response: { success: boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute - same as other auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  // CSRF protection: verify origin matches allowed origin
  const allowedOrigin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  const origin = req.headers.origin;
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: 'Invalid origin' });
  }

  const { musicUserToken } = req.body;

  // Validate the token
  if (!musicUserToken || typeof musicUserToken !== 'string') {
    return res.status(400).json({
      error: 'musicUserToken is required',
    });
  }

  if (!isValidAppleMusicToken(musicUserToken)) {
    return res.status(400).json({
      error: 'Invalid musicUserToken format',
    });
  }

  try {
    // Store the token in httpOnly cookie
    setAppleMusicCookies(res, musicUserToken);

    console.log('[Apple Music Auth] Successfully stored user token');

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Apple Music Auth] Error storing user token:', error.message);
    res.status(500).json({
      error: 'Failed to store authentication token',
    });
  }
}
