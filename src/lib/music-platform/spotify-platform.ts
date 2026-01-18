import axios from 'axios';
import { Track, PlatformUser, TrackSelectionMode } from '@/types';
import { MusicPlatformService, ArtistSearchResult, PlaylistResult } from './types';

const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

/**
 * Helper function to calculate string similarity (Levenshtein distance-based)
 */
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

/**
 * Selects tracks from a pool based on the selection mode.
 * Randomizes within the filtered pool to provide variety.
 */
function selectTracksFromPool(tracks: any[], limit: number, mode: TrackSelectionMode): any[] {
  if (tracks.length === 0) return [];

  let pool: any[];

  switch (mode) {
    case 'popular':
      const popularPoolSize = Math.max(limit, Math.ceil(tracks.length * 0.5));
      pool = tracks.slice(0, Math.min(popularPoolSize, tracks.length));
      break;

    case 'deep-cuts':
      const skipCount = Math.floor(tracks.length * 0.2);
      const deepCutsPool = tracks.slice(skipCount);
      pool = deepCutsPool.length >= limit ? deepCutsPool : tracks;
      break;

    case 'balanced':
    default:
      pool = tracks;
      break;
  }

  // Shuffle pool for randomization
  const shuffled = pool.sort(() => Math.random() - 0.5);

  // Return up to `limit` tracks
  return shuffled.slice(0, Math.min(limit, shuffled.length));
}

/**
 * Spotify implementation of MusicPlatformService
 */
export class SpotifyPlatformService implements MusicPlatformService {
  readonly platform = 'spotify' as const;

  async searchArtist(name: string, token: string): Promise<ArtistSearchResult | null> {
    try {
      const response = await axios.get(`${SPOTIFY_API_BASE_URL}/search`, {
        params: {
          q: name,
          type: 'artist',
          limit: 5,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const artists = response.data.artists.items;

      if (!artists || artists.length === 0) {
        console.warn(`[Spotify] No results for "${name}"`);
        return null;
      }

      // Find the best matching artist by name similarity
      let bestMatch = artists[0];
      let bestSimilarity = similarity(name, artists[0].name);

      for (const artist of artists) {
        const sim = similarity(name, artist.name);
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
          `[Spotify] Low match for "${name}": got "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}% similar)`
        );
      } else if (bestMatch.name !== name) {
        console.log(
          `[Spotify] Fuzzy match: "${name}" -> "${bestMatch.name}" (${(bestSimilarity * 100).toFixed(0)}%)`
        );
      } else {
        console.log(`[Spotify] Exact match: "${name}"`);
      }

      return {
        id: bestMatch.id,
        name: bestMatch.name,
        matched,
        similarity: bestSimilarity,
      };
    } catch (error) {
      console.error(`[Spotify] Error searching for artist "${name}":`, error);
      return null;
    }
  }

  async getArtistTopTracks(
    artistId: string,
    token: string,
    limit: number = 1,
    selectionMode: TrackSelectionMode = 'popular'
  ): Promise<Track[]> {
    try {
      const response = await axios.get(`${SPOTIFY_API_BASE_URL}/artists/${artistId}/top-tracks`, {
        params: {
          market: 'US',
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const tracks = response.data.tracks;
      if (!tracks || tracks.length === 0) return [];

      // Select tracks based on mode
      const selectedTracks = selectTracksFromPool(tracks, limit, selectionMode);

      // Map to our Track interface
      return selectedTracks.map((track: any) => ({
        name: track.name,
        id: track.id,
        uri: track.uri,
        artist: track.artists[0]?.name || 'Unknown Artist',
        artistId: track.artists[0]?.id || artistId,
        album: track.album?.name || 'Unknown Album',
        albumArtwork: track.album?.images?.[0]?.url || null,
        duration: track.duration_ms || 0,
        previewUrl: track.preview_url || null,
        platformUrl: track.external_urls?.spotify || '',
        platform: 'spotify' as const,
      }));
    } catch (error) {
      console.error(`[Spotify] Error getting top tracks for artist ${artistId}:`, error);
      return [];
    }
  }

  async createPlaylist(
    userId: string,
    name: string,
    token: string,
    description?: string
  ): Promise<PlaylistResult> {
    const response = await axios.post(
      `${SPOTIFY_API_BASE_URL}/users/${userId}/playlists`,
      {
        name,
        description: description || 'Generated from festival poster by Music Posters',
        public: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      id: response.data.id,
      url: response.data.external_urls.spotify,
    };
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[], token: string): Promise<void> {
    // Convert track IDs to Spotify URIs if they're not already
    const trackUris = trackIds.map((id) =>
      id.startsWith('spotify:') ? id : `spotify:track:${id}`
    );

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
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }

  async getCurrentUser(token: string): Promise<PlatformUser> {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return {
      id: response.data.id,
      displayName: response.data.display_name,
      email: response.data.email,
      platform: 'spotify',
    };
  }

  async uploadPlaylistCover(
    playlistId: string,
    base64ImageData: string,
    token: string
  ): Promise<void> {
    // Validate base64 image size (Spotify limit: 256 KB)
    const sizeInBytes = Math.ceil((base64ImageData.length * 3) / 4);
    console.log(`[Spotify] Uploading playlist cover: ${sizeInBytes} bytes (limit: 256000 bytes)`);

    if (sizeInBytes > 256000) {
      throw new Error(`Cover image size ${sizeInBytes} bytes exceeds Spotify's 256 KB limit`);
    }

    const response = await axios.put(
      `${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/images`,
      base64ImageData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        transformRequest: [(data) => data],
      }
    );

    if (response.status === 202) {
      console.log(`[Spotify] Successfully uploaded custom cover for playlist ${playlistId}`);
    }
  }
}

// Export a singleton instance
export const spotifyPlatform = new SpotifyPlatformService();
