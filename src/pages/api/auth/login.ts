import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Legacy login endpoint - redirects to Spotify login.
 *
 * @deprecated Use /api/auth/spotify/login for Spotify
 *             Use /api/auth/apple-music/developer-token + client-side MusicKit for Apple Music
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Redirect to the new Spotify login endpoint for backward compatibility
  res.redirect('/api/auth/spotify/login');
}
