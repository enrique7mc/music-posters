import axios from 'axios';
import { SpotifyTokens, SpotifyUser } from '@/types';

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

export async function searchArtist(
  artistName: string,
  accessToken: string
): Promise<{ id: string; name: string } | null> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/search`, {
      params: {
        q: artistName,
        type: 'artist',
        limit: 1,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const artist = response.data.artists.items[0];
    return artist ? { id: artist.id, name: artist.name } : null;
  } catch (error) {
    console.error(`Error searching for artist "${artistName}":`, error);
    return null;
  }
}

export async function getArtistTopTrack(
  artistId: string,
  accessToken: string
): Promise<string | null> {
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
    return topTrack ? topTrack.uri : null;
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
): Promise<{ trackUris: string[]; foundArtists: number }> {
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

  // Filter out null results
  const validArtists = artists.filter((artist): artist is { id: string; name: string } => artist !== null);
  console.log(`Found ${validArtists.length}/${artistNames.length} artists on Spotify`);

  // Get top tracks in batches (same conservative rate)
  const tracks = await processBatch(
    validArtists,
    (artist) => getArtistTopTrack(artist.id, accessToken),
    3,
    1000
  );

  // Filter out null tracks
  const trackUris = tracks.filter((uri): uri is string => uri !== null);
  console.log(`Retrieved ${trackUris.length} tracks`);

  return {
    trackUris,
    foundArtists: validArtists.length,
  };
}
