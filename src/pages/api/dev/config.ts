import { NextApiRequest, NextApiResponse } from 'next';
import { isDevModeAvailable, getDevConfig, updateDevConfig, isLocalhost } from '@/lib/dev-mode';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
