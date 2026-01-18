import { NextApiRequest, NextApiResponse } from 'next';
import { clearAllAuthCookies } from '@/lib/auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

/**
 * API route that logs out the user by clearing all authentication cookies.
 *
 * Clears cookies for all platforms (Spotify and Apple Music).
 *
 * POST /api/auth/logout
 *
 * Response: { success: true }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  // Clear cookies for all platforms
  clearAllAuthCookies(res);
  res.status(200).json({ success: true });
}
