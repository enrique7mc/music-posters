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

  // Spotify PROHIBITS `localhost` in redirect URIs — the loopback IP is required.
  // In dev we derive the redirect URI from the request host, so browsing to
  // http://localhost:3000 (what `next dev` prints) would produce a rejected
  // `redirect_uri=http://localhost:3000/...`.
  //
  // Rewriting just the redirect URI is NOT enough: Spotify would then send the user
  // back to 127.0.0.1, a different origin from the one that set the state cookie
  // below — cookies are host-scoped, so state validation in the callback would fail
  // with `invalid_state`. Bounce to the loopback host FIRST, before the cookie is
  // set, so the entire flow (cookie, redirect URI, callback) shares one origin.
  const host = req.headers.host || '';
  if (process.env.NODE_ENV !== 'production' && /^localhost(:|$)/.test(host)) {
    const loopbackHost = host.replace(/^localhost/, '127.0.0.1');
    return res.redirect(307, `http://${loopbackHost}${req.url || '/api/auth/spotify/login'}`);
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

  // In development, derive the redirect URI from the request host so the port can
  // float (Next picks 3001+ when 3000 is taken). Both environments use the SAME
  // path — /api/auth/spotify/callback — so only one URI shape has to be registered
  // in the Spotify dashboard. (/api/auth/callback still exists as a legacy shim,
  // but we no longer ask Spotify to redirect there.)
  //
  // Spotify requires an exact match on the registered URI, and prohibits
  // `localhost` — register the loopback IP. For a floating port you can register
  // without one (`http://127.0.0.1/api/auth/spotify/callback`) and Spotify accepts
  // any port at authorization time; otherwise pin the port and run on it.
  // https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
  const redirectUri =
    process.env.NODE_ENV !== 'production'
      ? `http://${req.headers.host}/api/auth/spotify/callback`
      : process.env.SPOTIFY_REDIRECT_URI!;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  res.redirect(authUrl);
}
