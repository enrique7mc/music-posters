import { http, HttpResponse } from 'msw';

const SPOTIFY_ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

// Mock Spotify API responses
export const handlers = [
  // Token exchange endpoint
  http.post(`${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`, async ({ request }) => {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const grantType = params.get('grant_type');

    if (grantType === 'authorization_code') {
      return HttpResponse.json({
        access_token: 'mock_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock_refresh_token',
        scope: 'playlist-modify-private playlist-modify-public',
      });
    }

    if (grantType === 'refresh_token') {
      return HttpResponse.json({
        access_token: 'mock_refreshed_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'playlist-modify-private playlist-modify-public',
      });
    }

    return new HttpResponse(null, { status: 400 });
  }),

  // Get current user
  http.get(`${SPOTIFY_API_BASE_URL}/me`, () => {
    return HttpResponse.json({
      id: 'mock_user_id',
      display_name: 'Mock User',
      email: 'mock@example.com',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    });
  }),

  // Search for artist
  http.get(`${SPOTIFY_API_BASE_URL}/search`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.toLowerCase() || '';

    // Mock artist database
    const mockArtists: Record<string, any> = {
      'taylor swift': {
        id: 'artist_taylor_swift',
        name: 'Taylor Swift',
        images: [{ url: 'https://example.com/taylor.jpg' }],
      },
      drake: {
        id: 'artist_drake',
        name: 'Drake',
        images: [{ url: 'https://example.com/drake.jpg' }],
      },
      'bad bunny': {
        id: 'artist_bad_bunny',
        name: 'Bad Bunny',
        images: [{ url: 'https://example.com/badbunny.jpg' }],
      },
      'the weeknd': {
        id: 'artist_the_weeknd',
        name: 'The Weeknd',
        images: [{ url: 'https://example.com/weeknd.jpg' }],
      },
      'unknown artist': null, // Simulate not found
    };

    const artist = mockArtists[query];

    if (!artist) {
      return HttpResponse.json({
        artists: { items: [] },
      });
    }

    return HttpResponse.json({
      artists: {
        items: [artist],
      },
    });
  }),

  // Get artist's top tracks
  http.get(`${SPOTIFY_API_BASE_URL}/artists/:artistId/top-tracks`, ({ params }) => {
    const { artistId } = params;

    // Return mock tracks
    const mockTracks = [
      {
        id: `track_1_${artistId}`,
        name: `Top Track 1`,
        uri: `spotify:track:${artistId}_1`,
        duration_ms: 180000,
        preview_url: 'https://example.com/preview1.mp3',
        external_urls: { spotify: `https://open.spotify.com/track/${artistId}_1` },
        artists: [{ id: artistId, name: 'Artist Name' }],
        album: {
          name: 'Album Name',
          images: [{ url: 'https://example.com/album.jpg' }],
        },
      },
      {
        id: `track_2_${artistId}`,
        name: `Top Track 2`,
        uri: `spotify:track:${artistId}_2`,
        duration_ms: 200000,
        preview_url: 'https://example.com/preview2.mp3',
        external_urls: { spotify: `https://open.spotify.com/track/${artistId}_2` },
        artists: [{ id: artistId, name: 'Artist Name' }],
        album: {
          name: 'Album Name 2',
          images: [{ url: 'https://example.com/album2.jpg' }],
        },
      },
    ];

    return HttpResponse.json({
      tracks: mockTracks,
    });
  }),

  // Create playlist
  http.post(`${SPOTIFY_API_BASE_URL}/users/:userId/playlists`, async ({ params }) => {
    const { userId } = params;

    return HttpResponse.json({
      id: 'mock_playlist_id',
      name: 'Mock Playlist',
      external_urls: {
        spotify: `https://open.spotify.com/playlist/mock_playlist_id`,
      },
    });
  }),

  // Add tracks to playlist
  http.post(`${SPOTIFY_API_BASE_URL}/playlists/:playlistId/tracks`, () => {
    return HttpResponse.json({
      snapshot_id: 'mock_snapshot_id',
    });
  }),

  // Get playlist tracks
  http.get(`${SPOTIFY_API_BASE_URL}/playlists/:playlistId/tracks`, () => {
    return HttpResponse.json({
      items: [
        {
          track: {
            name: 'Track 1',
            uri: 'spotify:track:1',
            artists: [{ name: 'Artist 1' }],
          },
        },
        {
          track: {
            name: 'Track 2',
            uri: 'spotify:track:2',
            artists: [{ name: 'Artist 2' }],
          },
        },
      ],
    });
  }),
];

// Error handlers for testing error scenarios
export const errorHandlers = [
  // Rate limit error (429)
  http.get(`${SPOTIFY_API_BASE_URL}/search`, () => {
    return new HttpResponse(null, { status: 429 });
  }),

  // Unauthorized error (401)
  http.get(`${SPOTIFY_API_BASE_URL}/me`, () => {
    return new HttpResponse(null, { status: 401 });
  }),
];
