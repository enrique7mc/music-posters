import { NextApiRequest, NextApiResponse } from 'next';
import { exchangeCodeForTokens } from '@/lib/spotify';
import { setAuthCookies } from '@/lib/auth';
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

    setAuthCookies(res, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    // Redirect to upload page after successful authentication
    res.redirect('/upload');
  } catch (err) {
    console.error('Error exchanging code for tokens:', err);
    res.redirect('/?error=auth_failed');
  }
}
