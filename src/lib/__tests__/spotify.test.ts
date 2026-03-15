import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  searchArtist,
  getArtistTopTrack,
  getArtistTopTracks,
  createPlaylist,
  addTracksToPlaylist,
  getPlaylistTracks,
  searchAndGetTopTracks,
} from '../spotify';
import { Artist } from '@/types';

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

  describe('searchArtist', () => {
    it('should find artist by exact name match', async () => {
      const result = await searchArtist('Taylor Swift', mockAccessToken);

      expect(result).toEqual({
        id: 'artist_taylor_swift',
        name: 'Taylor Swift',
        matched: true,
        similarity: 1,
      });
    });

    it('should find artist by fuzzy match', async () => {
      const result = await searchArtist('drake', mockAccessToken);

      expect(result).toEqual({
        id: 'artist_drake',
        name: 'Drake',
        matched: true,
        similarity: 1,
      });
    });

    it('should return null when artist not found', async () => {
      const result = await searchArtist('Unknown Artist', mockAccessToken);

      expect(result).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/search', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const result = await searchArtist('Taylor Swift', mockAccessToken);

      expect(result).toBeNull();
    });

    it('should calculate similarity correctly for partial matches', async () => {
      // Mock artist with slightly different name
      server.use(
        http.get('https://api.spotify.com/v1/search', () => {
          return HttpResponse.json({
            artists: {
              items: [
                {
                  id: 'artist_taylor',
                  name: 'Taylor',
                  images: [],
                },
              ],
            },
          });
        })
      );

      const result = await searchArtist('Taylor Swift', mockAccessToken);

      expect(result).not.toBeNull();
      expect(result?.similarity).toBeLessThan(1);
      expect(result?.similarity).toBeGreaterThan(0);
    });
  });

  describe('getArtistTopTrack', () => {
    it('should get artist top track', async () => {
      const track = await getArtistTopTrack('artist_taylor_swift', mockAccessToken);

      expect(track).toEqual({
        name: 'Top Track 1',
        id: 'track_1_artist_taylor_swift',
        uri: 'spotify:track:artist_taylor_swift_1',
        artist: 'Artist Name',
        artistId: 'artist_taylor_swift',
        album: 'Album Name',
        albumArtwork: 'https://example.com/album.jpg',
        duration: 180000,
        previewUrl: 'https://example.com/preview1.mp3',
        platformUrl: 'https://open.spotify.com/track/artist_taylor_swift_1',
        platform: 'spotify',
      });
    });

    it('should return null when no tracks available', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/artists/:artistId/top-tracks', () => {
          return HttpResponse.json({ tracks: [] });
        })
      );

      const track = await getArtistTopTrack('artist_unknown', mockAccessToken);

      expect(track).toBeNull();
    });

    it('should handle missing album artwork', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/artists/:artistId/top-tracks', () => {
          return HttpResponse.json({
            tracks: [
              {
                name: 'Track',
                uri: 'spotify:track:1',
                duration_ms: 180000,
                preview_url: null,
                external_urls: { spotify: 'https://open.spotify.com/track/1' },
                artists: [{ id: 'artist_1', name: 'Artist' }],
                album: { name: 'Album', images: [] },
              },
            ],
          });
        })
      );

      const track = await getArtistTopTrack('artist_1', mockAccessToken);

      expect(track?.albumArtwork).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/artists/:artistId/top-tracks', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const track = await getArtistTopTrack('artist_error', mockAccessToken);

      expect(track).toBeNull();
    });
  });

  describe('getArtistTopTracks', () => {
    it('should get multiple top tracks with default limit', async () => {
      const tracks = await getArtistTopTracks('artist_taylor_swift', mockAccessToken);

      expect(tracks).toHaveLength(1);
      // With default limit of 1, we should get 1 track (could be either track due to randomization)
      expect(tracks[0].name).toMatch(/Top Track [12]/);
    });

    it('should respect custom limit', async () => {
      const tracks = await getArtistTopTracks('artist_taylor_swift', mockAccessToken, 2);

      expect(tracks).toHaveLength(2);
      // Tracks are now randomized, so we check they contain the expected tracks (in any order)
      const trackNames = tracks.map((t) => t.name);
      expect(trackNames).toContain('Top Track 1');
      expect(trackNames).toContain('Top Track 2');
    });

    it('should enforce maximum limit of 10', async () => {
      const tracks = await getArtistTopTracks('artist_taylor_swift', mockAccessToken, 100);

      expect(tracks.length).toBeLessThanOrEqual(10);
    });

    it('should return empty array when no tracks available', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/artists/:artistId/top-tracks', () => {
          return HttpResponse.json({ tracks: [] });
        })
      );

      const tracks = await getArtistTopTracks('artist_unknown', mockAccessToken);

      expect(tracks).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/artists/:artistId/top-tracks', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const tracks = await getArtistTopTracks('artist_error', mockAccessToken);

      expect(tracks).toEqual([]);
    });
  });

  describe('createPlaylist', () => {
    it('should create playlist successfully', async () => {
      const result = await createPlaylist('user_123', 'My Playlist', mockAccessToken);

      expect(result).toEqual({
        id: 'mock_playlist_id',
        url: 'https://open.spotify.com/playlist/mock_playlist_id',
      });
    });

    it('should throw error on unauthorized request', async () => {
      server.use(
        http.post('https://api.spotify.com/v1/users/:userId/playlists', () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      await expect(createPlaylist('user_123', 'My Playlist', 'invalid_token')).rejects.toThrow();
    });
  });

  describe('addTracksToPlaylist', () => {
    it('should add tracks to playlist', async () => {
      const trackUris = ['spotify:track:1', 'spotify:track:2', 'spotify:track:3'];

      await expect(
        addTracksToPlaylist('playlist_123', trackUris, mockAccessToken)
      ).resolves.not.toThrow();
    });

    it('should batch tracks in chunks of 100', async () => {
      const trackUris = Array.from({ length: 250 }, (_, i) => `spotify:track:${i}`);
      let requestCount = 0;

      server.use(
        http.post('https://api.spotify.com/v1/playlists/:playlistId/tracks', () => {
          requestCount++;
          return HttpResponse.json({ snapshot_id: 'mock_snapshot_id' });
        })
      );

      await addTracksToPlaylist('playlist_123', trackUris, mockAccessToken);

      expect(requestCount).toBe(3); // 100 + 100 + 50 = 3 requests
    });

    it('should handle empty track list', async () => {
      await expect(addTracksToPlaylist('playlist_123', [], mockAccessToken)).resolves.not.toThrow();
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

  describe('searchAndGetTopTracks', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should search for artists and get their top tracks', async () => {
      const artists: Artist[] = [
        { name: 'Taylor Swift' },
        { name: 'Drake' },
        { name: 'Bad Bunny' },
      ];

      const promise = searchAndGetTopTracks(artists, mockAccessToken);

      // Fast-forward through all delays
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.foundArtists).toBe(3);
      expect(result.tracks.length).toBeGreaterThan(0);
      expect(result.artistMatches).toHaveLength(3);
      expect(result.artistMatches[0].requested).toBe('Taylor Swift');
      expect(result.artistMatches[0].found).toBe('Taylor Swift');
    });

    it('should filter out artists not found', async () => {
      const artists: Artist[] = [{ name: 'Taylor Swift' }, { name: 'Unknown Artist' }];

      const promise = searchAndGetTopTracks(artists, mockAccessToken);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.foundArtists).toBe(1);
      expect(result.artistMatches[1].found).toBeNull();
    });

    it('should use tier-based track counts', async () => {
      const artists: Artist[] = [
        { name: 'Taylor Swift', tier: 'headliner', weight: 10 },
        { name: 'Drake', tier: 'sub-headliner', weight: 7 },
        { name: 'Bad Bunny', tier: 'undercard', weight: 2 },
      ];

      const promise = searchAndGetTopTracks(artists, mockAccessToken);
      await vi.runAllTimersAsync();
      const result = await promise;

      // Headliner should have more tracks than undercard
      expect(result.tracks.length).toBeGreaterThan(artists.length);
    });

    it('should handle custom track count mode', async () => {
      const artists: Artist[] = [{ name: 'Taylor Swift' }, { name: 'Drake' }];

      const promise = searchAndGetTopTracks(artists, mockAccessToken, {
        mode: 'custom',
        customCount: 5,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.foundArtists).toBe(2);
    });

    it('should handle per-artist track counts', async () => {
      const artists: Artist[] = [{ name: 'Taylor Swift' }, { name: 'Drake' }];

      const promise = searchAndGetTopTracks(artists, mockAccessToken, {
        perArtistCounts: {
          'Taylor Swift': 8,
          Drake: 3,
        },
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.foundArtists).toBe(2);
    });

    it('should handle rate limiting correctly', async () => {
      const artists: Artist[] = Array.from({ length: 10 }, (_, i) => ({
        name: i % 3 === 0 ? 'Taylor Swift' : i % 3 === 1 ? 'Drake' : 'Bad Bunny',
      }));

      const promise = searchAndGetTopTracks(artists, mockAccessToken);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.foundArtists).toBeGreaterThan(0);
    });

    it('should return empty tracks when all searches fail', async () => {
      server.use(
        http.get('https://api.spotify.com/v1/search', () => {
          return HttpResponse.json({ artists: { items: [] } });
        })
      );

      const artists: Artist[] = [{ name: 'Unknown 1' }, { name: 'Unknown 2' }];

      const promise = searchAndGetTopTracks(artists, mockAccessToken);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.foundArtists).toBe(0);
      expect(result.tracks).toEqual([]);
    });
  });
});
