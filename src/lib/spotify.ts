/**
 * Spotify OAuth + the handful of direct API calls that haven't moved to the
 * platform adapter yet.
 *
 * Everything else that used to live here (searchArtist, getArtistTopTrack(s),
 * createPlaylist, addTracksToPlaylist, uploadPlaylistCover, searchAndGetTopTracks,
 * plus private similarity/levenshtein/processBatch/getTrackCountForTier helpers)
 * was removed: it had no production callers — `src/lib/music-platform/` superseded
 * it — and most of it called endpoints Spotify withdrew in Feb 2026. See
 * SPOTIFY_MIGRATION.md.
 */
import axios from 'axios';
import { SpotifyTokens, SpotifyUser } from '@/types';
import { errMessage } from '@/lib/safe-log';

const SPOTIFY_ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

export async function exchangeCodeForTokens(
  code: string,
  redirectUri?: string
): Promise<SpotifyTokens> {
  const response = await axios.post(
    `${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri || process.env.SPOTIFY_REDIRECT_URI!,
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

/**
 * Exchange a refresh token for a fresh access token.
 *
 * NOTE: currently has no production caller — the refresh token is stored for 30
 * days at login but never used, so Spotify sessions die when the ~1h access token
 * expires. Kept (rather than deleted with the rest of the dead code) because
 * wiring it up is a tracked fix; see SPOTIFY_MIGRATION.md §7 phase 2.
 */
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

/**
 * Debug helper: list the tracks actually in a playlist. Only called when
 * LOG_PLAYLIST_CONTENTS=true.
 *
 * NOTE: `GET /playlists/{id}/tracks` was renamed to `/items` in Feb 2026 and the
 * response field `tracks` became `items` — this still calls the old shape and will
 * need updating with the rest of the migration.
 */
export async function getPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<Array<{ name: string; artists: string[]; uri: string }>> {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data.items.map((item: any) => ({
      name: item.track.name,
      artists: item.track.artists.map((artist: any) => artist.name),
      uri: item.track.uri,
    }));
  } catch (error) {
    // errMessage() only — a raw axios error carries the access token in config.headers.
    console.error('Error fetching playlist tracks:', errMessage(error));
    return [];
  }
}
