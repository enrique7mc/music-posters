import { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';
import { exchangeCodeForTokens } from '@/lib/spotify';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  const { code, error, state } = req.query;

  // Verify OAuth state to prevent CSRF attacks
  const cookies = parse(req.headers.cookie || '');
  const storedState = cookies.spotify_oauth_state;

  if (!state || !storedState || state !== storedState) {
    return res.redirect('/?error=invalid_state');
  }

  if (error) {
    return res.redirect(`/?error=${error}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/?error=missing_code');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Build cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    // Set all cookies together: auth tokens, platform, and clear state cookie
    res.setHeader('Set-Cookie', [
      serialize('spotify_access_token', tokens.access_token, {
        ...cookieOptions,
        maxAge: tokens.expires_in,
      }),
      serialize('spotify_refresh_token', tokens.refresh_token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      }),
      serialize('music_platform', 'spotify', {
        ...cookieOptions,
        maxAge: tokens.expires_in,
      }),
      // Clear the state cookie
      serialize('spotify_oauth_state', '', {
        ...cookieOptions,
        maxAge: 0,
      }),
    ]);

    // Redirect to upload page after successful authentication
    res.redirect('/upload');
  } catch (err) {
    console.error('Error exchanging code for tokens:', err);
    res.redirect('/?error=auth_failed');
  }
}
