import axios from 'axios';
import { SpotifyTokens, SpotifyUser, Track } from '@/types';

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
      console.warn(`⚠️  Low match for "${artistName}": got "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}% similar)`);
    } else if (bestMatch.name !== artistName) {
      console.log(`✓ Fuzzy match: "${artistName}" → "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}%)`);
    } else {
      console.log(`✓ Exact match: "${artistName}"`);
    }

    return {
      id: bestMatch.id,
      name: bestMatch.name,
      matched,
      similarity: bestSimilarity
    };
  } catch (error) {
    console.error(`Error searching for artist "${artistName}":`, error);
    return null;
  }
}

export async function getArtistTopTrack(
  artistId: string,
  accessToken: string
): Promise<Track | null> {
  try {
    const response = await axios.get(
      `${SPOTIFY_API_BASE_URL}/artists/${artistId}/top-tracks`,
      {
        params: {
          market: 'US',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

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
    const response = await axios.get(
      `${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

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
  return new Promise(resolve => setTimeout(resolve, ms));
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
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

export async function searchAndGetTopTracks(
  artistNames: string[],
  accessToken: string
): Promise<{ tracks: Track[]; foundArtists: number; artistMatches: Array<{ requested: string; found: string | null; similarity: number }> }> {
  console.log(`\n=== SEARCHING SPOTIFY ===`);
  console.log(`Searching for ${artistNames.length} artists...`);

  // Process artist searches in batches to avoid rate limiting
  // Spotify allows ~180 req/min = 3 req/sec
  // Use batch of 3 with 1 second delay = ~3 req/sec (safe, within limit)
  const artists = await processBatch(
    artistNames,
    (name) => searchArtist(name, accessToken),
    3,    // batch size (reduced from 10)
    1000  // delay in ms (increased from 100)
  );

  // Track all matches for debugging
  const artistMatches = artistNames.map((requested, index) => {
    const found = artists[index];
    return {
      requested,
      found: found ? found.name : null,
      similarity: found ? found.similarity : 0,
      matched: found ? found.matched : false
    };
  });

  // Filter out null results and poorly matched results
  const validArtists = artists.filter((artist): artist is { id: string; name: string; matched: boolean; similarity: number } =>
    artist !== null && artist.matched
  );

  console.log(`\n📊 Match Statistics:`);
  console.log(`✓ Exact/Good matches: ${validArtists.length}/${artistNames.length}`);
  console.log(`⚠️  Poor/No matches: ${artistNames.length - validArtists.length}/${artistNames.length}`);

  // Get top tracks in batches (same conservative rate)
  const trackResults = await processBatch(
    validArtists,
    (artist) => getArtistTopTrack(artist.id, accessToken),
    3,
    1000
  );

  // Filter out null tracks
  const tracks = trackResults.filter((track): track is Track => track !== null);
  console.log(`Retrieved ${tracks.length} tracks`);
  console.log(`=== END SPOTIFY SEARCH ===\n`);

  return {
    tracks,
    foundArtists: validArtists.length,
    artistMatches,
  };
}
