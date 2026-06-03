// ============================================================================
// Music Platform Types
// ============================================================================

export type MusicPlatform = 'spotify' | 'apple-music';

export interface PlatformUser {
  id: string;
  displayName: string;
  email?: string;
  platform: MusicPlatform;
}

// ============================================================================
// Artist Types
// ============================================================================

/**
 * User-taste relationship to an artist, derived from the authed user's library.
 * - 'loved': the lineup artist is already in the user's library (fuzzy match).
 * - 'gem':   the user doesn't know them, but they're a likely taste match
 *            (surfaced by Gemini, seeded from the loved set).
 * Populated by POST /api/personalize. Prefixed to avoid colliding with the
 * existing `reasoning` field (which explains the visual-prominence weight).
 */
export type Affinity = 'loved' | 'gem';

export interface Artist {
  name: string;
  weight?: number; // 1-10 prominence score (populated by Gemini, undefined for Vision)
  tier?: 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard'; // Visual tier
  reasoning?: string; // Why this weight was assigned
  spotifyId?: string;
  affinity?: Affinity; // User-taste tag (loved/gem); undefined = untagged
  affinityConfidence?: number; // 0-1 match/recommendation confidence
  affinityReason?: string; // Why this is a gem (or how the loved match was made)
  affinityLinkedTo?: string[]; // Loved/seed artist names a gem was linked to
}

export interface AnalyzeResponse {
  artists: Artist[]; // Changed from string[] to support Vision (no weights), Gemini (weighted), and Hybrid (weighted with OCR)
  rawText: string;
  provider: 'vision' | 'gemini' | 'hybrid'; // Which analysis method was used
  posterThumbnail?: string; // Optional: base64 encoded 300x300 JPEG thumbnail for playlist cover
  eventName?: string; // Extracted festival/event name from poster (Gemini/Hybrid only)
}

export interface CreatePlaylistResponse {
  playlistUrl: string;
  playlistId: string;
  tracksAdded: number;
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
}

export interface Track {
  name: string;
  id: string; // Platform-specific track ID
  uri?: string; // Spotify URI (e.g., spotify:track:xxx) - optional for Apple Music
  artist: string;
  artistId: string;
  album: string;
  albumArtwork: string | null; // URL to album image
  duration: number; // Duration in milliseconds
  previewUrl: string | null; // 30-second preview URL (may be null)
  platformUrl: string; // Direct link to track on the platform
  platform: MusicPlatform; // Which platform this track is from
}

export interface SearchTracksResponse {
  tracks: Track[];
  artistsSearched: number;
  tracksFound: number;
  warnings?: string[];
}

export type TrackSelectionMode = 'popular' | 'balanced' | 'deep-cuts';
