import { NextApiRequest, NextApiResponse } from 'next';
import { generatePlaylistCover } from '@/lib/cover-generator';

/**
 * API endpoint to generate a playlist cover preview.
 * Returns the cover as a base64-encoded JPEG image.
 *
 * Accepts:
 * - playlistName: string (required)
 * - posterThumbnail: string (optional, base64-encoded)
 *
 * Returns:
 * - coverPreview: string (base64-encoded JPEG)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playlistName, posterThumbnail } = req.body;

  if (!playlistName || typeof playlistName !== 'string') {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  try {
    const posterBuffer = posterThumbnail ? Buffer.from(posterThumbnail, 'base64') : undefined;

    const coverBase64 = await generatePlaylistCover({
      playlistName: playlistName.trim(),
      posterBuffer,
    });

    res.status(200).json({ coverPreview: coverBase64 });
  } catch (error: any) {
    console.error('Error generating cover preview:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate cover preview',
    });
  }
}
