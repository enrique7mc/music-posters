import { NextApiRequest, NextApiResponse } from 'next';
import { isDevModeAvailable, getDevConfig, updateDevConfig } from '@/lib/dev-mode';

function isLocalhost(req: NextApiRequest): boolean {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? typeof forwarded === 'string'
      ? forwarded
      : forwarded[0]
    : req.socket?.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isDevModeAvailable()) {
    return res.status(403).json({ error: 'Dev mode is not available' });
  }

  if (!isLocalhost(req)) {
    return res.status(403).json({ error: 'Dev endpoints are localhost-only' });
  }

  if (req.method === 'GET') {
    return res.status(200).json(getDevConfig());
  }

  if (req.method === 'PATCH') {
    try {
      const updated = updateDevConfig(req.body);
      console.log('[DEV MODE] Config updated:', updated);
      return res.status(200).json(updated);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
