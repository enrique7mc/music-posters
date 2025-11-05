import { NextApiRequest, NextApiResponse } from 'next';
import { clearAuthCookies } from '@/lib/auth';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (20 requests per minute for auth endpoints)
  if (await applyRateLimit(req, res, RateLimitPresets.relaxed())) {
    return; // Rate limit exceeded, response already sent
  }

  clearAuthCookies(res);
  res.status(200).json({ success: true });
}
