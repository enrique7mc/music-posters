import { NextApiRequest, NextApiResponse } from 'next';
import { parse, serialize } from 'cookie';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookies(
  res: NextApiResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) {
  res.setHeader('Set-Cookie', [
    serialize('spotify_access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: expiresIn,
    }),
    serialize('spotify_refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    }),
  ]);
}

export function getAccessToken(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  return cookies.spotify_access_token || null;
}

export function getRefreshToken(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  return cookies.spotify_refresh_token || null;
}

export function clearAuthCookies(res: NextApiResponse) {
  res.setHeader('Set-Cookie', [
    serialize('spotify_access_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
    serialize('spotify_refresh_token', '', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    }),
  ]);
}

export function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

export function isAuthenticated(req: NextApiRequest): boolean {
  return !!getAccessToken(req);
}
