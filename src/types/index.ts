export interface Artist {
  name: string;
  weight?: number; // 1-10 prominence score (populated by Gemini, undefined for Vision)
  tier?: 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard'; // Visual tier
  reasoning?: string; // Why this weight was assigned
  spotifyId?: string;
}

export interface AnalyzeResponse {
  artists: Artist[]; // Changed from string[] to support both Vision (weight: undefined) and Gemini (weight: 1-10)
  rawText: string;
  provider: 'vision' | 'gemini'; // Which analysis method was used
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
  uri: string;
  artist: string;
  artistId: string;
  album: string;
  albumArtwork: string | null; // URL to album image
  duration: number; // Duration in milliseconds
  previewUrl: string | null; // 30-second preview URL (may be null)
  spotifyUrl: string; // Direct Spotify link
}

export interface SearchTracksResponse {
  tracks: Track[];
  artistsSearched: number;
  tracksFound: number;
}
