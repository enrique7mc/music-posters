import { NextApiRequest, NextApiResponse } from 'next';
import { clearAuthCookies } from '@/lib/auth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  clearAuthCookies(res);
  res.status(200).json({ success: true });
}
