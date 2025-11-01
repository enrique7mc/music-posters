import { NextApiRequest, NextApiResponse } from 'next';
import { generateRandomString } from '@/lib/auth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-read-email',
    'user-read-private',
  ].join(' ');

  const state = generateRandomString(16);

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
