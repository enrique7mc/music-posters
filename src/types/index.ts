export interface Artist {
  name: string;
  spotifyId?: string;
}

export interface AnalyzeResponse {
  artists: string[];
  rawText: string;
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
