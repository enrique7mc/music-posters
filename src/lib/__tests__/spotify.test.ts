import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  getPlaylistTracks,
} from '../spotify';

describe('spotify.ts', () => {
  const mockAccessToken = 'mock_access_token';
  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      const tokens = await exchangeCodeForTokens('auth_code_123');

      expect(tokens).toEqual({
        access_token: 'mock_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock_refresh_token',
        scope: 'playlist-modify-private playlist-modify-public',
      });
    });

    it('should throw error on invalid code', async () => {
      server.use(
        http.post('https://accounts.spotify.com/api/token', () => {
          return new HttpResponse(null, { status: 400 });
        })
      );

      await expect(exchangeCodeForTokens('invalid_code')).rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      const tokens = await refreshAccessToken('refresh_token_123');

      expect(tokens.access_token).toBe('mock_refreshed_access_token');
      expect(tokens.expires_in).toBe(3600);
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user profile', async () => {
      const user = await getCurrentUser(mockAccessToken);

      expect(user).toEqual({
        id: 'mock_user_id',
        display_name: 'Mock User',
        email: 'mock@example.com',
        images: [{ url: 'https://example.com/avatar.jpg' }],
      });
    });

    it('should throw error on unauthorized request', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/me', () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      await expect(getCurrentUser('invalid_token')).rejects.toThrow();
    });
  });

  describe('getPlaylistTracks', () => {
    it('should get playlist tracks', async () => {
      const tracks = await getPlaylistTracks('playlist_123', mockAccessToken);

      expect(tracks).toHaveLength(2);
      expect(tracks[0]).toEqual({
        name: 'Track 1',
        uri: 'spotify:track:1',
        artists: ['Artist 1'],
      });
    });

    it('should return empty array on error', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/playlists/:playlistId/tracks', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const tracks = await getPlaylistTracks('invalid_playlist', mockAccessToken);

      expect(tracks).toEqual([]);
    });
  });
});
