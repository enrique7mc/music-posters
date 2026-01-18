import axios, { AxiosError } from 'axios';
import { Track, PlatformUser, TrackSelectionMode } from '@/types';
import { MusicPlatformService, ArtistSearchResult, PlaylistResult } from './types';

const APPLE_MUSIC_API_BASE_URL = 'https://api.music.apple.com/v1';
const DEFAULT_STOREFRONT = 'us'; // US storefront for search

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
 * Helper function to add delay between requests
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apple Music implementation of MusicPlatformService
 *
 * Note: Apple Music API requires two tokens:
 * - Developer Token (JWT): Generated server-side, used in Authorization header
 * - Music User Token: Obtained client-side via MusicKit JS, used in Music-User-Token header
 *
 * For this service, the `token` parameter is the Music User Token.
 * The Developer Token is generated separately via the auth module.
 */
export class AppleMusicPlatformService implements MusicPlatformService {
  readonly platform = 'apple-music' as const;
  private developerToken: string | null = null;

  /**
   * Set the developer token for API requests
   */
  setDeveloperToken(token: string) {
    this.developerToken = token;
  }

  /**
   * Get headers for Apple Music API requests
   */
  private getHeaders(userToken: string) {
    if (!this.developerToken) {
      throw new Error('Developer token not set. Call setDeveloperToken() first.');
    }
    return {
      Authorization: `Bearer ${this.developerToken}`,
      'Music-User-Token': userToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get headers for catalog-only requests (no user token needed)
   */
  private getCatalogHeaders() {
    if (!this.developerToken) {
      throw new Error('Developer token not set. Call setDeveloperToken() first.');
    }
    return {
      Authorization: `Bearer ${this.developerToken}`,
      'Content-Type': 'application/json',
    };
  }

  async searchArtist(name: string, token: string): Promise<ArtistSearchResult | null> {
    try {
      // Search in the Apple Music catalog (doesn't require user token)
      const response = await axios.get(
        `${APPLE_MUSIC_API_BASE_URL}/catalog/${DEFAULT_STOREFRONT}/search`,
        {
          params: {
            types: 'artists',
            term: name,
            limit: 5,
          },
          headers: this.getCatalogHeaders(),
        }
      );

      const artists = response.data.results?.artists?.data;

      if (!artists || artists.length === 0) {
        console.warn(`[Apple Music] No results for "${name}"`);
        return null;
      }

      // Find the best matching artist by name similarity
      let bestMatch = artists[0];
      let bestSimilarity = similarity(name, artists[0].attributes.name);

      for (const artist of artists) {
        const sim = similarity(name, artist.attributes.name);
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
          `[Apple Music] Low match for "${name}": got "${bestMatch.attributes.name}" (${(bestSimilarity * 100).toFixed(0)}% similar)`
        );
      } else if (bestMatch.attributes.name !== name) {
        console.log(
          `[Apple Music] Fuzzy match: "${name}" -> "${bestMatch.attributes.name}" (${(bestSimilarity * 100).toFixed(0)}%)`
        );
      } else {
        console.log(`[Apple Music] Exact match: "${name}"`);
      }

      return {
        id: bestMatch.id,
        name: bestMatch.attributes.name,
        matched,
        similarity: bestSimilarity,
      };
    } catch (error) {
      console.error(`[Apple Music] Error searching for artist "${name}":`, error);
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
      // Get artist's top songs from catalog
      const response = await axios.get(
        `${APPLE_MUSIC_API_BASE_URL}/catalog/${DEFAULT_STOREFRONT}/artists/${artistId}/view/top-songs`,
        {
          params: {
            limit: 10, // Get up to 10 songs to select from
          },
          headers: this.getCatalogHeaders(),
        }
      );

      const tracks = response.data.data;
      if (!tracks || tracks.length === 0) return [];

      // Select tracks based on mode
      const selectedTracks = selectTracksFromPool(tracks, limit, selectionMode);

      // Map to our Track interface
      return selectedTracks.map((track: any) => {
        const attributes = track.attributes;

        // Generate artwork URL (Apple Music uses {w}x{h} placeholders)
        let artworkUrl = null;
        if (attributes.artwork?.url) {
          artworkUrl = attributes.artwork.url.replace('{w}', '300').replace('{h}', '300');
        }

        return {
          name: attributes.name,
          id: track.id,
          uri: undefined, // Apple Music doesn't use URIs
          artist: attributes.artistName || 'Unknown Artist',
          artistId: artistId,
          album: attributes.albumName || 'Unknown Album',
          albumArtwork: artworkUrl,
          duration: attributes.durationInMillis || 0,
          previewUrl: attributes.previews?.[0]?.url || null,
          platformUrl: attributes.url || `https://music.apple.com/song/${track.id}`,
          platform: 'apple-music' as const,
        };
      });
    } catch (error) {
      console.error(`[Apple Music] Error getting top tracks for artist ${artistId}:`, error);
      return [];
    }
  }

  async createPlaylist(
    userId: string,
    name: string,
    token: string,
    description?: string
  ): Promise<PlaylistResult> {
    try {
      const response = await axios.post(
        `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists`,
        {
          attributes: {
            name,
            description: description || 'Generated from festival poster by Music Posters',
          },
        },
        {
          headers: this.getHeaders(token),
        }
      );

      const playlist = response.data.data[0];

      // Apple Music doesn't return a direct URL in the response
      // We construct it from the playlist ID
      const playlistUrl = playlist.attributes?.playParams?.globalId
        ? `https://music.apple.com/library/playlist/${playlist.attributes.playParams.globalId}`
        : `https://music.apple.com/library/playlist/${playlist.id}`;

      return {
        id: playlist.id,
        url: playlistUrl,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('[Apple Music] Error creating playlist:', axiosError.response?.data || error);
      throw error;
    }
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[], token: string): Promise<void> {
    // Apple Music allows adding tracks in batches of 100
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Format tracks for Apple Music API
      const tracksData = chunk.map((id) => ({
        id,
        type: 'songs',
      }));

      await axios.post(
        `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists/${playlistId}/tracks`,
        {
          data: tracksData,
        },
        {
          headers: this.getHeaders(token),
        }
      );

      // Add delay between batches to respect rate limits
      if (i < chunks.length - 1) {
        await delay(500);
      }
    }
  }

  async getCurrentUser(token: string): Promise<PlatformUser> {
    // Apple Music doesn't have a direct "me" endpoint that returns user profile
    // The user info is typically obtained client-side via MusicKit JS
    // For now, we return a placeholder that will be populated from MusicKit
    // The actual user info should be passed from the client

    // Try to get the storefront (which can indicate user location)
    try {
      const response = await axios.get(`${APPLE_MUSIC_API_BASE_URL}/me/storefront`, {
        headers: this.getHeaders(token),
      });

      const storefront = response.data.data?.[0];

      return {
        id: storefront?.id || 'apple-music-user',
        displayName: 'Apple Music User', // Apple doesn't expose user display name
        platform: 'apple-music',
      };
    } catch (error) {
      // If we can't get storefront, return a basic user object
      return {
        id: 'apple-music-user',
        displayName: 'Apple Music User',
        platform: 'apple-music',
      };
    }
  }

  // Apple Music doesn't support custom playlist artwork upload via API
  // This method is intentionally not implemented
}

// Export a singleton instance
export const appleMusicPlatform = new AppleMusicPlatformService();
