import { NextApiRequest, NextApiResponse } from 'next';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

/**
 * API route that returns a signed Apple Music developer token (JWT).
 *
 * This token is used by the client to initialize MusicKit JS for Apple Music authorization.
 * The token is signed with the team's private key and cached server-side.
 *
 * GET /api/auth/apple-music/developer-token
 *
 * Response: { token: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute - same as other auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  try {
    const token = generateDeveloperToken();

    res.status(200).json({ token });
  } catch (error: any) {
    console.error('[Apple Music Auth] Error generating developer token:', error.message);

    // Don't expose detailed error messages to clients
    if (error.message.includes('environment variable')) {
      return res.status(500).json({
        error: 'Apple Music is not configured. Please set up the required credentials.',
      });
    }

    res.status(500).json({
      error: 'Failed to generate developer token',
    });
  }
}
