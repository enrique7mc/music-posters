import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/auth';
import {
  getCurrentUser,
  searchAndGetTopTracks,
  createPlaylist,
  addTracksToPlaylist,
} from '@/lib/spotify';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { artists, playlistName } = req.body;

  if (!artists || !Array.isArray(artists) || artists.length === 0) {
    return res.status(400).json({ error: 'No artists provided' });
  }

  // Limit to 100 artists to avoid excessive API calls
  const MAX_ARTISTS = 100;
  const limitedArtists = artists.slice(0, MAX_ARTISTS);

  if (artists.length > MAX_ARTISTS) {
    console.log(`Limiting artists from ${artists.length} to ${MAX_ARTISTS}`);
  }

  try {
    // Get current user
    const user = await getCurrentUser(accessToken);

    // Search for artists and get their top tracks with rate limiting
    console.log(`Creating playlist for ${user.display_name} with ${limitedArtists.length} artists`);
    const { trackUris, foundArtists } = await searchAndGetTopTracks(
      limitedArtists,
      accessToken
    );

    if (trackUris.length === 0) {
      return res.status(400).json({
        error: 'Could not find any tracks for the provided artists',
      });
    }

    // Create playlist
    const name = playlistName || `Festival Mix - ${new Date().toLocaleDateString()}`;
    const playlist = await createPlaylist(user.id, name, accessToken);

    // Add tracks to playlist
    await addTracksToPlaylist(playlist.id, trackUris, accessToken);

    console.log(`Playlist created successfully: ${playlist.url}`);

    res.status(200).json({
      playlistUrl: playlist.url,
      playlistId: playlist.id,
      tracksAdded: trackUris.length,
      artistsFound: foundArtists,
      totalArtists: limitedArtists.length,
      limitApplied: artists.length > MAX_ARTISTS,
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
