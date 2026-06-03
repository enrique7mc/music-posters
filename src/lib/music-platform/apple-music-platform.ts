import axios, { AxiosError } from 'axios';
import { Track, PlatformUser, TrackSelectionMode } from '@/types';
import { MusicPlatformService, ArtistSearchResult, PlaylistResult } from './types';
import { similarity, CATALOG_MATCH_THRESHOLD } from '@/lib/artist-match';

const APPLE_MUSIC_API_BASE_URL = 'https://api.music.apple.com/v1';
// Origin only (no `/v1`). Apple's pagination `next` is an absolute path like
// `/v1/me/library/artists?offset=100`, so we prepend the origin to it — prepending
// the base URL would produce a broken `/v1/v1` path (observed in the spike).
const APPLE_MUSIC_API_ORIGIN = 'https://api.music.apple.com';
const DEFAULT_STOREFRONT = 'us'; // US storefront for search

// Library scan tuning (getLibraryArtists)
const LIBRARY_PAGE_LIMIT = 100; // Apple's max page size for library endpoints
const MAX_LIBRARY_PAGES = 50; // hard ceiling (~5000 artists) to protect the 30s route budget
const LIBRARY_PAGE_THROTTLE_MS = 50; // inter-page delay to stay under rate limits

/**
 * Selects tracks from a pool based on the selection mode.
 * Randomizes within the filtered pool to provide variety.
 */
function selectTracksFromPool(tracks: any[], limit: number, mode: TrackSelectionMode): any[] {
  if (tracks.length === 0) return [];

  let pool: any[];

  switch (mode) {
    case 'popular': {
      const popularPoolSize = Math.max(limit, Math.ceil(tracks.length * 0.5));
      pool = tracks.slice(0, Math.min(popularPoolSize, tracks.length));
      break;
    }

    case 'deep-cuts': {
      const skipCount = Math.floor(tracks.length * 0.2);
      const deepCutsPool = tracks.slice(skipCount);
      pool = deepCutsPool.length >= limit ? deepCutsPool : tracks;
      break;
    }

    case 'balanced':
    default:
      pool = tracks;
      break;
  }

  // Fisher-Yates shuffle for unbiased randomization
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

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

      // Require at least 60% similarity to avoid completely wrong matches.
      // Catalog search is recall-oriented; loved-overlap uses a stricter bar.
      const matched = bestSimilarity >= CATALOG_MATCH_THRESHOLD;

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
            limit: 25, // Get up to 25 songs to select from (API max for view endpoints)
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

  /**
   * Scan the authenticated user's full library of artists (the "loved" set used
   * by personalization). Paginated, throttled, and capped:
   *  - 100 artists/page (Apple's max for library endpoints)
   *  - 50ms inter-page throttle to stay under rate limits
   *  - MAX_LIBRARY_PAGES ceiling so a huge library can't blow the route budget
   *  - origin-prepend on `next` (never `/v1/v1`)
   *  - partial-success: on any page error, return what was collected so far
   *    rather than throwing (caller falls back to a plain, unpersonalized list).
   *
   * Requires the Music User Token (library data is user-scoped).
   */
  async getLibraryArtists(token: string): Promise<string[]> {
    const names: string[] = [];
    let url: string | null =
      `${APPLE_MUSIC_API_BASE_URL}/me/library/artists?limit=${LIBRARY_PAGE_LIMIT}`;
    let pages = 0;

    while (url && pages < MAX_LIBRARY_PAGES) {
      // Apple's `next` is an absolute path (`/v1/me/...`). Prepend the ORIGIN
      // only — prepending the base URL (which ends in `/v1`) yields `/v1/v1`.
      const requestUrl = url.startsWith('http') ? url : `${APPLE_MUSIC_API_ORIGIN}${url}`;

      let data: any;
      try {
        const response = await axios.get(requestUrl, { headers: this.getHeaders(token) });
        data = response.data;
      } catch (error) {
        console.error(`[Apple Music] Error scanning library artists (page ${pages + 1}):`, error);
        break; // partial-success: keep whatever we already gathered
      }

      pages++;
      for (const artist of data?.data || []) {
        const name = artist?.attributes?.name;
        if (name) names.push(name);
      }

      url = typeof data?.next === 'string' ? data.next : null;
      if (url && pages < MAX_LIBRARY_PAGES) await delay(LIBRARY_PAGE_THROTTLE_MS);
    }

    if (url && pages >= MAX_LIBRARY_PAGES) {
      console.warn(
        `[Apple Music] Library scan hit the ${MAX_LIBRARY_PAGES}-page ceiling; loved set may be truncated.`
      );
    }
    console.log(`[Apple Music] Library scan: ${names.length} artists across ${pages} pages`);
    return names;
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
            description: description || 'Generated from festival poster by Playlistd',
          },
        },
        {
          headers: this.getHeaders(token),
        }
      );

      const playlist = response.data.data?.[0];
      if (!playlist) {
        throw new Error('Apple Music API returned empty playlist response');
      }

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

      console.log(
        `[Apple Music] Adding tracks batch ${i + 1}/${chunks.length} (${chunk.length} tracks)`
      );
      await axios.post(
        `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists/${playlistId}/tracks`,
        {
          data: tracksData,
        },
        {
          headers: this.getHeaders(token),
        }
      );
      console.log(`[Apple Music] Batch ${i + 1}/${chunks.length} completed`);

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
