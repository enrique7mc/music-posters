import axios from 'axios';
import { SpotifyTokens, SpotifyUser, Track, Artist } from '@/types';

const SPOTIFY_ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokens> {
  const response = await axios.post(
    `${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const response = await axios.post(
    `${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data;
}

export async function getCurrentUser(accessToken: string): Promise<SpotifyUser> {
  const response = await axios.get(`${SPOTIFY_API_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

// Helper function to calculate string similarity (Levenshtein distance-based)
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export async function searchArtist(
  artistName: string,
  accessToken: string
): Promise<{ id: string; name: string; matched: boolean; similarity: number } | null> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/search`, {
      params: {
        q: artistName,
        type: 'artist',
        limit: 5, // Get top 5 to find best match
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const artists = response.data.artists.items;

    if (!artists || artists.length === 0) {
      console.warn(`❌ No results for "${artistName}"`);
      return null;
    }

    // Find the best matching artist by name similarity
    let bestMatch = artists[0];
    let bestSimilarity = similarity(artistName, artists[0].name);

    for (const artist of artists) {
      const sim = similarity(artistName, artist.name);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = artist;
      }
    }

    // Require at least 60% similarity to avoid completely wrong matches
    const SIMILARITY_THRESHOLD = 0.6;
    const matched = bestSimilarity >= SIMILARITY_THRESHOLD;

    if (!matched) {
      console.warn(
        `⚠️  Low match for "${artistName}": got "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}% similar)`
      );
    } else if (bestMatch.name !== artistName) {
      console.log(
        `✓ Fuzzy match: "${artistName}" → "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}%)`
      );
    } else {
      console.log(`✓ Exact match: "${artistName}"`);
    }

    return {
      id: bestMatch.id,
      name: bestMatch.name,
      matched,
      similarity: bestSimilarity,
    };
  } catch (error) {
    console.error(`Error searching for artist "${artistName}":`, error);
    return null;
  }
}

/**
 * Retrieves an artist's top track (market: US) and maps it to a Track object.
 *
 * @param artistId - Spotify artist ID to retrieve the top track for
 * @param accessToken - OAuth Bearer token with permission to read Spotify data
 * @returns A `Track` object representing the artist's highest-ranked top track, or `null` if no top track is available or an error occurs. The returned `Track` includes `name`, `uri`, `artist`, `artistId`, `album`, `albumArtwork`, `duration`, `previewUrl`, and `spotifyUrl`.
 */
export async function getArtistTopTrack(
  artistId: string,
  accessToken: string
): Promise<Track | null> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/artists/${artistId}/top-tracks`, {
      params: {
        market: 'US',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const topTrack = response.data.tracks[0];
    if (!topTrack) return null;

    // Log warning if spotifyUrl is missing (unexpected for valid tracks)
    if (!topTrack.external_urls?.spotify) {
      console.warn(`Track "${topTrack.name}" missing Spotify URL - this is unexpected`);
    }

    // Extract full track details
    return {
      name: topTrack.name,
      uri: topTrack.uri,
      artist: topTrack.artists[0]?.name || 'Unknown Artist',
      artistId: topTrack.artists[0]?.id || artistId,
      album: topTrack.album?.name || 'Unknown Album',
      albumArtwork: topTrack.album?.images?.[0]?.url || null,
      duration: topTrack.duration_ms || 0,
      previewUrl: topTrack.preview_url || null,
      spotifyUrl: topTrack.external_urls?.spotify || '',
    };
  } catch (error) {
    console.error(`Error getting top track for artist ${artistId}:`, error);
    return null;
  }
}

/**
 * Retrieves multiple top tracks for an artist (market: US) and maps them to Track objects.
 *
 * @param artistId - Spotify artist ID to retrieve top tracks for
 * @param accessToken - OAuth Bearer token with permission to read Spotify data
 * @param limit - Number of top tracks to retrieve (1-10, default: 1)
 * @returns An array of `Track` objects representing the artist's top tracks, or an empty array if no tracks are available or an error occurs
 */
export async function getArtistTopTracks(
  artistId: string,
  accessToken: string,
  limit: number = 1
): Promise<Track[]> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/artists/${artistId}/top-tracks`, {
      params: {
        market: 'US',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const tracks = response.data.tracks;
    if (!tracks || tracks.length === 0) return [];

    // Take only the requested number of tracks (Spotify returns up to 10)
    const limitedTracks = tracks.slice(0, Math.min(limit, 10));

    // Map to our Track interface
    return limitedTracks.map((track: any) => ({
      name: track.name,
      uri: track.uri,
      artist: track.artists[0]?.name || 'Unknown Artist',
      artistId: track.artists[0]?.id || artistId,
      album: track.album?.name || 'Unknown Album',
      albumArtwork: track.album?.images?.[0]?.url || null,
      duration: track.duration_ms || 0,
      previewUrl: track.preview_url || null,
      spotifyUrl: track.external_urls?.spotify || '',
    }));
  } catch (error) {
    console.error(`Error getting top tracks for artist ${artistId}:`, error);
    return [];
  }
}

export async function createPlaylist(
  userId: string,
  playlistName: string,
  accessToken: string
): Promise<{ id: string; url: string }> {
  const response = await axios.post(
    `${SPOTIFY_API_BASE_URL}/users/${userId}/playlists`,
    {
      name: playlistName,
      description: 'Generated from festival poster by Music Posters',
      public: false,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    id: response.data.id,
    url: response.data.external_urls.spotify,
  };
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackUris: string[],
  accessToken: string
): Promise<void> {
  // Spotify API allows max 100 tracks per request
  const chunks = [];
  for (let i = 0; i < trackUris.length; i += 100) {
    chunks.push(trackUris.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await axios.post(
      `${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`,
      {
        uris: chunk,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

export async function getPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<Array<{ name: string; artists: string[]; uri: string }>> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data.items.map((item: any) => ({
      name: item.track.name,
      artists: item.track.artists.map((artist: any) => artist.name),
      uri: item.track.uri,
    }));
  } catch (error) {
    console.error(`Error fetching playlist tracks:`, error);
    return [];
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
 *
 * @param tier - The artist tier (headliner, sub-headliner, mid-tier, undercard)
 * @returns Number of tracks to fetch (1-10)
 */
function getTrackCountForTier(tier?: string): number {
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
 * Searches Spotify for a list of artists, retrieves top tracks based on tier, and returns the collected tracks and match metadata.
 *
 * @param artists - Array of Artist objects to search for on Spotify
 * @param accessToken - OAuth bearer token with permission to read Spotify artist and track data
 * @returns An object containing:
 *  - `tracks`: an array of `Track` objects for artists that were matched and had available tracks (quantity based on tier),
 *  - `foundArtists`: the number of artists that were successfully matched,
 *  - `artistMatches`: an array of match records `{ requested, found, similarity }` where `requested` is the original query, `found` is the matched artist name or `null` if none, and `similarity` is the similarity score (0–1) between the requested and found names
 */
export async function searchAndGetTopTracks(
  artists: Artist[],
  accessToken: string
): Promise<{
  tracks: Track[];
  foundArtists: number;
  artistMatches: Array<{ requested: string; found: string | null; similarity: number }>;
}> {
  console.log(`\n=== SEARCHING SPOTIFY ===`);
  console.log(`Searching for ${artists.length} artists...`);

  // Extract artist names for searching
  const artistNames = artists.map((a) => a.name);

  // Process artist searches in batches to avoid rate limiting
  // Spotify allows ~180 req/min = 3 req/sec
  // Use batch of 3 with 1 second delay = ~3 req/sec (safe, within limit)
  const searchResults = await processBatch(
    artistNames,
    (name) => searchArtist(name, accessToken),
    3, // batch size (reduced from 10)
    1000 // delay in ms (increased from 100)
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

  // Filter out null results and poorly matched results, and pair with original Artist data
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

  // Get top tracks in batches (same conservative rate)
  // Use tier-based track count for each artist
  const trackArrays = await processBatch(
    validArtists,
    async (pair) => {
      const trackCount = getTrackCountForTier(pair.originalArtist.tier);
      console.log(
        `  Fetching ${trackCount} tracks for ${pair.searchResult.name} (tier: ${pair.originalArtist.tier || 'unknown'})`
      );
      return getArtistTopTracks(pair.searchResult.id, accessToken, trackCount);
    },
    3,
    1000
  );

  // Flatten array of arrays into single array of tracks
  const tracks = trackArrays.flat();
  console.log(`Retrieved ${tracks.length} total tracks from ${validArtists.length} artists`);
  console.log(`=== END SPOTIFY SEARCH ===\n`);

  return {
    tracks,
    foundArtists: validArtists.length,
    artistMatches,
  };
}
