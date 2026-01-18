import { MusicPlatform, Artist, Track, TrackSelectionMode } from '@/types';
import { MusicPlatformService, TrackCountOptions } from './types';
import { spotifyPlatform, SpotifyPlatformService } from './spotify-platform';
import { appleMusicPlatform, AppleMusicPlatformService } from './apple-music-platform';

// Re-export types
export * from './types';
export { SpotifyPlatformService } from './spotify-platform';
export { AppleMusicPlatformService } from './apple-music-platform';

/**
 * Get the music platform service for the specified platform.
 * @param platform - The music platform ('spotify' or 'apple-music')
 * @returns The appropriate MusicPlatformService implementation
 */
export function getMusicPlatform(platform: MusicPlatform): MusicPlatformService {
  switch (platform) {
    case 'spotify':
      return spotifyPlatform;
    case 'apple-music':
      return appleMusicPlatform;
    default:
      throw new Error(`Unknown music platform: ${platform}`);
  }
}

// Helper function to add delay between requests
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Process requests in batches to avoid rate limiting
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`
    );

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

/**
 * Maps artist tier to the number of tracks to fetch.
 */
function getTrackCountForTier(tier?: string, options?: TrackCountOptions): number {
  // Note: Per-artist overrides are handled by the caller before calling this function.
  // This function provides the fallback for artists without explicit overrides.

  // Check for custom-per-tier mode
  if (options?.mode === 'custom-per-tier' && options.tierCounts && tier) {
    const tierKey = tier as keyof typeof options.tierCounts;
    const override = options.tierCounts[tierKey];
    if (override !== undefined) {
      return Math.max(1, Math.min(10, override));
    }
  }

  // Check for custom mode (same count for all artists)
  if (options?.mode === 'custom' && options.customCount !== undefined) {
    return Math.max(1, Math.min(10, options.customCount));
  }

  // Default to tier-based
  if (!tier) return 3; // Default for Vision API (no tier info)

  switch (tier) {
    case 'headliner':
      return 10;
    case 'sub-headliner':
      return 5;
    case 'mid-tier':
      return 3;
    case 'undercard':
      return 1;
    default:
      return 3;
  }
}

/**
 * Platform-agnostic function to search for artists and get their top tracks.
 * Uses the specified platform service with rate limiting.
 *
 * @param platform - The music platform service to use
 * @param artists - Array of Artist objects to search for
 * @param token - Platform-specific auth token
 * @param trackCountOptions - Optional settings to customize track counts per artist
 * @param developerToken - Developer token (required for Apple Music)
 * @returns Object containing tracks, foundArtists count, and artistMatches array
 */
export async function searchAndGetTopTracks(
  platform: MusicPlatformService,
  artists: Artist[],
  token: string,
  trackCountOptions?: TrackCountOptions,
  developerToken?: string
): Promise<{
  tracks: Track[];
  foundArtists: number;
  artistMatches: Array<{ requested: string; found: string | null; similarity: number }>;
}> {
  // Set developer token for Apple Music if needed
  if (platform.platform === 'apple-music' && developerToken) {
    (platform as AppleMusicPlatformService).setDeveloperToken(developerToken);
  }

  console.log(`\n=== SEARCHING ${platform.platform.toUpperCase()} ===`);
  console.log(`Searching for ${artists.length} artists...`);

  const artistNames = artists.map((a) => a.name);

  // Configure rate limiting based on platform
  // Spotify: 3 req/batch, 1000ms delay (180 req/min limit)
  // Apple Music: 5 req/batch, 500ms delay (~10 req/sec)
  const batchSize = platform.platform === 'spotify' ? 3 : 5;
  const batchDelay = platform.platform === 'spotify' ? 1000 : 500;

  // Process artist searches in batches
  const searchResults = await processBatch(
    artistNames,
    (name) => platform.searchArtist(name, token),
    batchSize,
    batchDelay
  );

  // Track all matches for debugging
  const artistMatches = artistNames.map((requested, index) => {
    const found = searchResults[index];
    return {
      requested,
      found: found ? found.name : null,
      similarity: found ? found.similarity : 0,
      matched: found ? found.matched : false,
    };
  });

  // Filter out null results and poorly matched results
  const validArtists = searchResults
    .map((result, index) => ({
      searchResult: result,
      originalArtist: artists[index],
    }))
    .filter(
      (
        pair
      ): pair is {
        searchResult: { id: string; name: string; matched: boolean; similarity: number };
        originalArtist: Artist;
      } => pair.searchResult !== null && pair.searchResult.matched
    );

  console.log(`\n📊 Match Statistics:`);
  console.log(`✓ Exact/Good matches: ${validArtists.length}/${artistNames.length}`);
  console.log(
    `⚠️  Poor/No matches: ${artistNames.length - validArtists.length}/${artistNames.length}`
  );

  // Get top tracks in batches
  const trackArrays = await processBatch(
    validArtists,
    async (pair) => {
      // Check for per-artist override
      let trackCount: number;
      if (
        trackCountOptions?.mode === 'per-artist' &&
        trackCountOptions.perArtistCounts &&
        trackCountOptions.perArtistCounts[pair.originalArtist.name] !== undefined
      ) {
        trackCount = Math.max(
          1,
          Math.min(10, trackCountOptions.perArtistCounts[pair.originalArtist.name])
        );
      } else {
        trackCount = getTrackCountForTier(pair.originalArtist.tier, trackCountOptions);
      }

      console.log(
        `  Fetching ${trackCount} tracks for ${pair.searchResult.name} (tier: ${pair.originalArtist.tier || 'unknown'})`
      );
      return platform.getArtistTopTracks(
        pair.searchResult.id,
        token,
        trackCount,
        trackCountOptions?.selectionMode || 'popular'
      );
    },
    batchSize,
    batchDelay
  );

  // Flatten array of arrays into single array of tracks
  const tracks = trackArrays.flat();
  console.log(`Retrieved ${tracks.length} total tracks from ${validArtists.length} artists`);
  console.log(`=== END ${platform.platform.toUpperCase()} SEARCH ===\n`);

  return {
    tracks,
    foundArtists: validArtists.length,
    artistMatches,
  };
}
