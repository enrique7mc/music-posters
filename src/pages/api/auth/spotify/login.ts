import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { generateRandomString } from '@/lib/auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'ugc-image-upload', // Required for uploading custom playlist covers
    'user-read-email',
    'user-read-private',
  ].join(' ');

  const state = generateRandomString(16);

  // Store state in a short-lived httpOnly cookie to prevent CSRF attacks
  res.setHeader(
    'Set-Cookie',
    serialize('spotify_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60, // 5 minutes
    })
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: scopes,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state: state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  res.redirect(authUrl);
}
