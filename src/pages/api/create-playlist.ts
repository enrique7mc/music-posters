import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/auth';
import {
  getCurrentUser,
  createPlaylist,
  addTracksToPlaylist,
  getPlaylistTracks,
} from '@/lib/spotify';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

/**
 * API route handler that creates a Spotify playlist for the authenticated user from provided track URIs.
 *
 * Validates that the request is a POST, that the user is authenticated, and that `trackUris` is a non-empty array.
 * Uses an optional `playlistName` or a default name when creating the playlist, adds the provided tracks, and returns
 * a JSON payload containing `playlistUrl`, `playlistId`, and `tracksAdded` on success.
 *
 * Responds with:
 * - 405 if the HTTP method is not POST
 * - 401 if the request is not authenticated or Spotify credentials have expired
 * - 400 if `trackUris` is missing, not an array, or empty
 * - 429 if Spotify rate limits the request
 * - 500 for other failures
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (10 requests per minute for playlist creation)
  if (await applyRateLimit(req, res, RateLimitPresets.moderate())) {
    return; // Rate limit exceeded, response already sent
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { trackUris, playlistName } = req.body;

  if (!trackUris || !Array.isArray(trackUris) || trackUris.length === 0) {
    return res.status(400).json({ error: 'No track URIs provided' });
  }

  try {
    // Get current user
    const user = await getCurrentUser(accessToken);

    // Create playlist
    const name = playlistName || `Festival Mix - ${new Date().toLocaleDateString()}`;
    console.log(`Creating playlist for ${user.display_name} with ${trackUris.length} tracks`);
    const playlist = await createPlaylist(user.id, name, accessToken);

    // Add tracks to playlist
    await addTracksToPlaylist(playlist.id, trackUris, accessToken);

    console.log(`Playlist created successfully: ${playlist.url}`);

    // Fetch and log the actual tracks in the playlist for debugging
    const playlistTracks = await getPlaylistTracks(playlist.id, accessToken);
    console.log('\n=== PLAYLIST CONTENTS ===');
    console.log(`Total tracks in playlist: ${playlistTracks.length}`);
    console.log('\nTracks:');
    playlistTracks.forEach((track, index) => {
      console.log(`${index + 1}. ${track.artists.join(', ')} - ${track.name}`);
    });
    console.log('=== END PLAYLIST CONTENTS ===\n');

    res.status(200).json({
      playlistUrl: playlist.url,
      playlistId: playlist.id,
      tracksAdded: trackUris.length,
    });
  } catch (error: any) {
    console.error('Error creating playlist:', error);

    // Handle Spotify API errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Spotify authentication expired. Please log in again.',
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Spotify rate limit exceeded. Please wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to create playlist',
    });
  }
}
