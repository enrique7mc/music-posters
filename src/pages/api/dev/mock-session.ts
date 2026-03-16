import { NextApiRequest, NextApiResponse } from 'next';
import { isDevModeAvailable, isLocalhost } from '@/lib/dev-mode';
import { mockGeminiArtists, mockTracks } from '@/lib/mock-data';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDevModeAvailable()) {
    return res.status(403).json({ error: 'Dev mode is not available' });
  }

  if (!isLocalhost(req)) {
    return res.status(403).json({ error: 'Dev endpoints are localhost-only' });
  }

  const page = req.query.page as string;

  switch (page) {
    case 'review-artists':
      return res.status(200).json({
        artists: mockGeminiArtists,
        analysisProvider: 'hybrid',
        posterThumbnail: null,
      });

    case 'review-tracks':
      return res.status(200).json({
        tracks: mockTracks,
      });

    case 'success':
      return res.status(200).json({
        playlistUrl: 'https://open.spotify.com/playlist/dev-mock-session',
      });

    default:
      return res.status(400).json({
        error: 'Invalid page parameter',
        validPages: ['review-artists', 'review-tracks', 'success'],
      });
  }
}
