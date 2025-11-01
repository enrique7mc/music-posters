import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/auth';
import { getCurrentUser } from '@/lib/spotify';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await getCurrentUser(accessToken);
    res.status(200).json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
