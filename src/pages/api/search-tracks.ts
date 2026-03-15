import { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedPlatform, getPlatformAccessToken } from '@/lib/auth';
import { getMusicPlatform, searchAndGetTopTracks } from '@/lib/music-platform';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { SearchTracksResponse, MusicPlatform } from '@/types';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { searchTracksSchema, validateRequest } from '@/lib/validation';

/**
 * API route handler that searches for top tracks for a list of artists with tier-based track counts.
 *
 * Supports both Spotify and Apple Music platforms.
 *
 * Expects a POST request with a JSON body containing:
 * - `artists`: Array of Artist objects with name and optional tier
 * - `platform`: Optional platform to use ('spotify' or 'apple-music'). Defaults to authenticated platform.
 *
 * Requires authentication; responds with 401 if missing.
 * Track count per artist is determined by tier: headliner (10), sub-headliner (5), mid-tier (3), undercard (1), unknown (3).
 * Responds with appropriate HTTP status codes for invalid method (405), invalid input (400), expired auth (401), rate limiting (429), and other server errors (500).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (10 requests per minute for track searches)
  if (applyRateLimit(req, res, RateLimitPresets.moderate())) {
    return; // Rate limit exceeded, response already sent
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

  const {
    artists,
    platform: requestedPlatform,
    trackCountMode,
    customTrackCount,
    tierCounts,
    perArtistCounts,
    trackSelectionMode = 'popular',
  } = validatedData;

  // Determine which platform to use
  const authenticatedPlatform = getAuthenticatedPlatform(req);

  // Reject if requested platform doesn't match authenticated platform
  if (requestedPlatform && authenticatedPlatform && requestedPlatform !== authenticatedPlatform) {
    return res.status(401).json({
      error: `Authenticated with ${authenticatedPlatform}. Please log in to ${requestedPlatform}.`,
    });
  }

  const platform: MusicPlatform =
    (requestedPlatform as MusicPlatform) || authenticatedPlatform || 'spotify';

  // Check if mock data mode is enabled
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('⚠️  Using mock data (USE_MOCK_DATA=true)');
    const { mockTracks, getMockTracksForPlatform } = await import('@/lib/mock-data');

    // Simulate API delay for realistic testing (1-2 seconds)
    const delay = 1000 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Get platform-specific mock tracks
    const platformTracks = getMockTracksForPlatform
      ? getMockTracksForPlatform(platform)
      : mockTracks;

    const response: SearchTracksResponse = {
      tracks: platformTracks,
      artistsSearched: artists.length,
      tracksFound: platformTracks.length,
    };

    console.log(
      `✅ Returned ${platformTracks.length} mock tracks for ${platform} (simulated ${(delay / 1000).toFixed(1)}s delay)`
    );
    return res.status(200).json(response);
  }

  const accessToken = getPlatformAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Artist names are already trimmed by the validation schema
  console.log(`Validated ${artists.length} artists for ${platform} track search`);

  // Sanitize perArtistCounts by trimming keys to match normalized artist names
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
    // Get the platform service
    const platformService = getMusicPlatform(platform);

    // For Apple Music, we need to set the developer token
    let developerToken: string | undefined;
    if (platform === 'apple-music') {
      developerToken = generateDeveloperToken();
      (platformService as AppleMusicPlatformService).setDeveloperToken(developerToken);
    }

    // Search for artists and get their top tracks with rate limiting
    console.log(`Searching tracks for ${artists.length} artists on ${platform}`);
    const { tracks, foundArtists, artistMatches } = await searchAndGetTopTracks(
      platformService,
      artists,
      accessToken,
      {
        mode: trackCountMode || 'tier-based',
        customCount: customTrackCount,
        tierCounts: tierCounts,
        perArtistCounts: sanitizedPerArtistCounts,
        selectionMode: trackSelectionMode,
      },
      developerToken
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
      console.log(`\n❌ Artists not found on ${platform}:`);
      noMatches.forEach((m) => {
        console.log(`  "${m.requested}"`);
      });
    }

    if (tracks.length === 0) {
      return res.status(400).json({
        error: 'Could not find any tracks for the provided artists',
      });
    }

    console.log(`Successfully found ${tracks.length} tracks on ${platform}`);

    const response: SearchTracksResponse = {
      tracks,
      artistsSearched: artists.length,
      tracksFound: tracks.length,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error searching tracks:', error);

    // Handle API errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} authentication expired. Please log in again.`,
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} rate limit exceeded. Please wait a moment and try again.`,
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to search tracks',
    });
  }
}
