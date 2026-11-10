import { Track, PlatformUser, MusicPlatform, TrackSelectionMode } from '@/types';

/**
 * Thrown when a platform rejects us at the access-control layer (401/403) rather
 * than failing on data. These are NOT per-artist failures — if the platform won't
 * authorize one call it won't authorize the next 58 either, so callers should abort
 * the whole batch instead of degrading to an empty result per artist.
 *
 * Motivating case: Spotify's Feb-2026 tier gating returns 403 on
 * `/artists/{id}/top-tracks` for every request. Before this existed, a 59-artist
 * poster burned 59 requests over 48 seconds and then reported the useless
 * "Could not find any tracks" — instead of "Spotify denied access to this endpoint."
 */
export class PlatformAccessError extends Error {
  readonly status: number;
  readonly platform: MusicPlatform;
  readonly endpoint: string;

  constructor(platform: MusicPlatform, status: number, endpoint: string, message?: string) {
    super(
      message ??
        `${platform} denied access to ${endpoint} (HTTP ${status}). ` +
          `This is an app-permission problem, not a per-artist failure.`
    );
    this.name = 'PlatformAccessError';
    this.status = status;
    this.platform = platform;
    this.endpoint = endpoint;
  }
}

/**
 * Thrown by addTracksToPlaylist when a batch still fails after its retries.
 * The playlist already exists and holds the first `added` tracks, so the caller
 * can report a partial result instead of a bare failure. `failure` is the
 * underlying error; it may be a raw axios error, so log it with errDetail() only.
 */
export class PartialAddError extends Error {
  readonly added: number;
  readonly total: number;
  readonly failure: unknown;

  constructor(added: number, total: number, failure: unknown) {
    super(`Added ${added} of ${total} tracks before a batch failed`);
    this.name = 'PartialAddError';
    this.added = added;
    this.total = total;
    this.failure = failure;
  }
}

/**
 * Result of searching for an artist on a music platform
 */
export interface ArtistSearchResult {
  id: string;
  name: string;
  matched: boolean;
  similarity: number;
  /**
   * How the name matched. 'contains' means the catalog name contains the
   * poster name as a phrase, so a low similarity does not signal a doubtful
   * match. Optional: the Spotify adapter does not set it.
   */
  matchType?: 'exact' | 'fuzzy' | 'contains';
}

/**
 * Result of creating a playlist on a music platform
 */
export interface PlaylistResult {
  id: string;
  url: string;
}

/**
 * Common interface for music platform services.
 * Both Spotify and Apple Music implement this interface.
 */
export interface MusicPlatformService {
  /**
   * The platform identifier
   */
  readonly platform: MusicPlatform;

  /**
   * Search for an artist by name
   * @param name - Artist name to search for
   * @param token - Platform-specific auth token
   * @returns Artist search result or null if not found
   */
  searchArtist(name: string, token: string): Promise<ArtistSearchResult | null>;

  /**
   * Get top tracks for an artist
   * @param artistId - Platform-specific artist ID
   * @param token - Platform-specific auth token
   * @param limit - Number of tracks to fetch (1-25; Apple Music selects from a
   *   single 25-song top-songs request, Spotify may return fewer upstream)
   * @param selectionMode - Track selection mode (popular, balanced, deep-cuts)
   * @returns Array of Track objects
   */
  getArtistTopTracks(
    artistId: string,
    token: string,
    limit?: number,
    selectionMode?: TrackSelectionMode
  ): Promise<Track[]>;

  /**
   * Create a new playlist
   * @param userId - Platform-specific user ID
   * @param name - Playlist name
   * @param token - Platform-specific auth token
   * @param description - Optional playlist description
   * @returns Playlist result with ID and URL
   */
  createPlaylist(
    userId: string,
    name: string,
    token: string,
    description?: string
  ): Promise<PlaylistResult>;

  /**
   * Add tracks to a playlist
   * @param playlistId - Platform-specific playlist ID
   * @param trackIds - Array of platform-specific track IDs
   * @param token - Platform-specific auth token
   */
  addTracksToPlaylist(playlistId: string, trackIds: string[], token: string): Promise<void>;

  /**
   * Count the tracks a playlist actually stores, read back from the platform.
   * Optional: only platforms that support a cheap read-back implement it.
   * @param playlistId - Platform-specific playlist ID
   * @param token - Platform-specific auth token
   * @param budgetMs - Overall deadline for the read-back, including retries
   */
  getPlaylistTrackCount?(playlistId: string, token: string, budgetMs?: number): Promise<number>;

  /**
   * Get the current authenticated user
   * @param token - Platform-specific auth token
   * @returns Platform user information
   */
  getCurrentUser(token: string): Promise<PlatformUser>;

  /**
   * Upload a custom cover image to a playlist (optional, not all platforms support this)
   * @param playlistId - Platform-specific playlist ID
   * @param base64ImageData - Base64-encoded image data
   * @param token - Platform-specific auth token
   */
  uploadPlaylistCover?(playlistId: string, base64ImageData: string, token: string): Promise<void>;

  /**
   * Scan the authenticated user's full library of artists, used to detect which
   * lineup artists the user already "loves" for personalization. Optional — only
   * platforms that expose a user library implement it (currently Apple Music).
   * Callers must guard on its presence and treat absence as "no personalization".
   * @param token - Platform-specific auth token (user-scoped)
   * @returns `artists`: names in the user's library. `complete`: false if the
   *   scan was truncated by an error or the page ceiling — callers should mark
   *   the result degraded and skip gems so a partial library can't mislabel a
   *   genuinely-loved artist as an unknown "gem".
   */
  getLibraryArtists?(token: string): Promise<{ artists: string[]; complete: boolean }>;
}

/**
 * Options for track count customization
 */
export interface TrackCountOptions {
  mode?: 'tier-based' | 'custom' | 'custom-per-tier' | 'per-artist';
  customCount?: number;
  tierCounts?: {
    headliner: number;
    'sub-headliner': number;
    'mid-tier': number;
    undercard: number;
  };
  perArtistCounts?: Record<string, number>;
  selectionMode?: TrackSelectionMode;
}
