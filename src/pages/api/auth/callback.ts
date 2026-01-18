import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Legacy callback endpoint - redirects to Spotify callback.
 *
 * @deprecated Use /api/auth/spotify/callback for Spotify
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Reconstruct query string and redirect to the new Spotify callback endpoint
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(`/api/auth/spotify/callback${queryString ? `?${queryString}` : ''}`);
}
