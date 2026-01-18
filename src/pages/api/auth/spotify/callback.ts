import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { exchangeCodeForTokens } from '@/lib/spotify';
import { setSpotifyAuthCookies } from '@/lib/auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?error=${error}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/?error=missing_code');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    setSpotifyAuthCookies(res, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    // Also set the platform cookie to indicate Spotify is authenticated
    const existingCookies = res.getHeader('Set-Cookie') as string[] | undefined;
    const platformCookie = serialize('music_platform', 'spotify', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expires_in,
    });

    res.setHeader('Set-Cookie', [...(existingCookies || []), platformCookie]);

    // Redirect to upload page after successful authentication
    res.redirect('/upload');
  } catch (err) {
    console.error('Error exchanging code for tokens:', err);
    res.redirect('/?error=auth_failed');
  }
}
