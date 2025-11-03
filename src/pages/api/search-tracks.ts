import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/auth';
import { searchAndGetTopTracks } from '@/lib/spotify';
import { SearchTracksResponse } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { artists } = req.body;

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
    // Search for artists and get their top tracks with rate limiting
    console.log(`Searching tracks for ${limitedArtists.length} artists`);
    const { tracks, foundArtists, artistMatches } = await searchAndGetTopTracks(
      limitedArtists,
      accessToken
    );

    // Log mismatches for debugging
    const poorMatches = artistMatches.filter(m => m.found && m.similarity < 0.9);
    const noMatches = artistMatches.filter(m => !m.found);

    if (poorMatches.length > 0) {
      console.log(`\n⚠️  Artists with fuzzy matches (might be wrong):`);
      poorMatches.forEach(m => {
        console.log(`  "${m.requested}" → "${m.found}" (${(m.similarity * 100).toFixed(0)}%)`);
      });
    }

    if (noMatches.length > 0) {
      console.log(`\n❌ Artists not found on Spotify:`);
      noMatches.forEach(m => {
        console.log(`  "${m.requested}"`);
      });
    }

    if (tracks.length === 0) {
      return res.status(400).json({
        error: 'Could not find any tracks for the provided artists',
      });
    }

    console.log(`Successfully found ${tracks.length} tracks`);

    const response: SearchTracksResponse = {
      tracks,
      artistsSearched: limitedArtists.length,
      tracksFound: tracks.length,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error searching tracks:', error);

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
      error: error.message || 'Failed to search tracks',
    });
  }
}
