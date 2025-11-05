import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@/lib/auth';
import { searchAndGetTopTracks } from '@/lib/spotify';
import { SearchTracksResponse, Artist } from '@/types';
import { searchTracksSchema, validateRequest } from '@/lib/validation';

/**
 * API route handler that searches Spotify for top tracks for a list of artists with tier-based track counts.
 *
 * Expects a POST request with a JSON body containing `artists` (an array of Artist objects with name and optional tier).
 * Requires an access token retrievable from the incoming request; responds with 401 if missing.
 * Limits processing to 100 artists and returns a JSON response containing `tracks`, `artistsSearched`, and `tracksFound`.
 * Track count per artist is determined by tier: headliner (10), sub-headliner (5), mid-tier (3), undercard (1), unknown (3).
 * Responds with appropriate HTTP status codes for invalid method (405), invalid input (400), expired Spotify auth (401), rate limiting (429), and other server errors (500).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate request body
  let validatedData;
  try {
    validatedData = validateRequest(searchTracksSchema, req.body);
  } catch (error: any) {
    console.error('[Search Tracks API] Validation error:', error.message);
    return res.status(400).json({
      error: 'Invalid request data',
      details: error.message,
    });
  }

  const { artists, trackCountMode, customTrackCount, perArtistCounts } = validatedData;

  // Check if mock data mode is enabled
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('⚠️  Using mock data (USE_MOCK_DATA=true)');
    const { mockTracks } = await import('@/lib/mock-data');

    // Simulate API delay for realistic testing (1-2 seconds)
    const delay = 1000 + Math.random() * 1000; // Random delay between 1-2 seconds
    await new Promise((resolve) => setTimeout(resolve, delay));

    const response: SearchTracksResponse = {
      tracks: mockTracks,
      artistsSearched: artists.length,
      tracksFound: mockTracks.length,
    };

    console.log(
      `✅ Returned ${mockTracks.length} mock tracks (simulated ${(delay / 1000).toFixed(1)}s delay)`
    );
    return res.status(200).json(response);
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Artist names are already trimmed by the validation schema
  // The schema also enforces the 100 artist limit
  console.log(`Validated ${artists.length} artists for track search`);

  // Sanitize perArtistCounts by trimming keys to match normalized artist names
  // (already validated by schema, just need to normalize keys)
  const sanitizedPerArtistCounts =
    perArtistCounts && typeof perArtistCounts === 'object'
      ? Object.entries(perArtistCounts as Record<string, number>).reduce(
          (acc, [artistName, count]) => {
            acc[artistName.trim()] = count;
            return acc;
          },
          {} as Record<string, number>
        )
      : undefined;

  try {
    // Search for artists and get their top tracks with rate limiting
    console.log(`Searching tracks for ${artists.length} artists`);
    const { tracks, foundArtists, artistMatches } = await searchAndGetTopTracks(
      artists,
      accessToken,
      {
        mode: trackCountMode || 'tier-based',
        customCount: customTrackCount,
        perArtistCounts: sanitizedPerArtistCounts,
      }
    );

    // Log mismatches for debugging
    const poorMatches = artistMatches.filter((m) => m.found && m.similarity < 0.9);
    const noMatches = artistMatches.filter((m) => !m.found);

    if (poorMatches.length > 0) {
      console.log(`\n⚠️  Artists with fuzzy matches (might be wrong):`);
      poorMatches.forEach((m) => {
        console.log(`  "${m.requested}" → "${m.found}" (${(m.similarity * 100).toFixed(0)}%)`);
      });
    }

    if (noMatches.length > 0) {
      console.log(`\n❌ Artists not found on Spotify:`);
      noMatches.forEach((m) => {
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
      artistsSearched: artists.length,
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
