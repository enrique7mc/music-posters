import { Track, PlatformUser, MusicPlatform, TrackSelectionMode } from '@/types';

/**
 * Result of searching for an artist on a music platform
 */
export interface ArtistSearchResult {
  id: string;
  name: string;
  matched: boolean;
  similarity: number;
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
   * @param limit - Number of tracks to fetch (1-10)
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
