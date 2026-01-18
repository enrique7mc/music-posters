import { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedPlatform, getPlatformAccessToken } from '@/lib/auth';
import { getMusicPlatform } from '@/lib/music-platform';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { SpotifyPlatformService } from '@/lib/music-platform/spotify-platform';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { getPlaylistTracks, uploadPlaylistCover } from '@/lib/spotify';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { createPlaylistSchema, validateRequest } from '@/lib/validation';
import { generatePlaylistCover } from '@/lib/cover-generator';
import { MusicPlatform } from '@/types';

/**
 * API route handler that creates a playlist for the authenticated user from provided tracks.
 *
 * Supports both Spotify and Apple Music platforms.
 *
 * Validates that the request is a POST, that the user is authenticated, and that tracks are provided.
 * Uses an optional `playlistName` or a default name when creating the playlist, adds the provided tracks, and returns
 * a JSON payload containing `playlistUrl`, `playlistId`, and `tracksAdded` on success.
 *
 * Responds with:
 * - 405 if the HTTP method is not POST
 * - 401 if the request is not authenticated or credentials have expired
 * - 400 if tracks are missing or invalid
 * - 429 if rate limits are exceeded
 * - 500 for other failures
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (10 requests per minute for playlist creation)
  if (applyRateLimit(req, res, RateLimitPresets.moderate())) {
    return; // Rate limit exceeded, response already sent
  }

  const accessToken = getPlatformAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Validate request body
  let validatedData;
  try {
    validatedData = validateRequest(createPlaylistSchema, req.body);
  } catch (error: any) {
    console.error('[Create Playlist API] Validation error:', error.message);
    return res.status(400).json({
      error: 'Invalid request data',
      details: error.message,
    });
  }

  const {
    trackUris,
    trackIds,
    platform: requestedPlatform,
    playlistName,
    posterThumbnail,
  } = validatedData;

  // Determine which platform to use
  const authenticatedPlatform = getAuthenticatedPlatform(req);

  // Reject if requested platform doesn't match authenticated platform
  if (requestedPlatform && authenticatedPlatform && requestedPlatform !== authenticatedPlatform) {
    return res.status(400).json({
      error: `Requested platform (${requestedPlatform}) does not match authenticated platform (${authenticatedPlatform})`,
    });
  }

  const platform: MusicPlatform =
    (requestedPlatform as MusicPlatform) || authenticatedPlatform || 'spotify';

  // Get the track identifiers (support both trackUris for backward compatibility and trackIds for new API)
  const tracks = trackIds || trackUris;
  if (!tracks || tracks.length === 0) {
    return res.status(400).json({ error: 'No tracks provided' });
  }

  try {
    // Get the platform service
    const platformService = getMusicPlatform(platform);

    // For Apple Music, we need to set the developer token
    if (platform === 'apple-music') {
      const developerToken = generateDeveloperToken();
      (platformService as AppleMusicPlatformService).setDeveloperToken(developerToken);
    }

    // Get current user
    const user = await platformService.getCurrentUser(accessToken);

    // Create playlist
    const name = playlistName || `Festival Mix - ${new Date().toLocaleDateString()}`;
    console.log(
      `Creating ${platform} playlist for ${user.displayName} with ${tracks.length} tracks`
    );
    const playlist = await platformService.createPlaylist(user.id, name, accessToken);

    // Add tracks to playlist
    // For Spotify, if we have URIs, use them directly
    // For Apple Music or with track IDs, extract the ID portion
    let trackIdsToAdd: string[];
    if (platform === 'spotify' && trackUris) {
      // Spotify can use URIs directly
      trackIdsToAdd = trackUris;
    } else {
      // Extract track IDs from URIs if needed, or use trackIds directly
      trackIdsToAdd = tracks.map((t: string) => {
        if (t.startsWith('spotify:track:')) {
          return t.replace('spotify:track:', '');
        }
        return t;
      });
    }

    await platformService.addTracksToPlaylist(playlist.id, trackIdsToAdd, accessToken);

    console.log(`Playlist created successfully: ${playlist.url}`);

    // Generate and upload custom playlist cover (Spotify only, non-blocking)
    if (posterThumbnail && platform === 'spotify' && platformService.uploadPlaylistCover) {
      try {
        console.log('Generating custom playlist cover...');
        const posterBuffer = Buffer.from(posterThumbnail, 'base64');
        const coverBase64 = await generatePlaylistCover({
          playlistName: name,
          posterBuffer,
        });
        await (platformService as SpotifyPlatformService).uploadPlaylistCover(
          playlist.id,
          coverBase64,
          accessToken
        );
      } catch (coverError) {
        // Non-critical error - log but don't fail the request
        console.error('Failed to upload playlist cover (non-critical):', coverError);
      }
    } else if (posterThumbnail && platform === 'apple-music') {
      console.log('Note: Apple Music does not support custom playlist artwork upload via API');
    } else {
      console.log('No poster thumbnail provided, skipping custom cover generation');
    }

    // Fetch and log the actual tracks in the playlist for debugging (Spotify only, debug mode)
    if (platform === 'spotify' && process.env.LOG_PLAYLIST_CONTENTS === 'true') {
      try {
        const playlistTracks = await getPlaylistTracks(playlist.id, accessToken);
        console.log('\n=== PLAYLIST CONTENTS ===');
        console.log(`Total tracks in playlist: ${playlistTracks.length}`);
        console.log('\nTracks:');
        playlistTracks.forEach((track, index) => {
          console.log(`${index + 1}. ${track.artists.join(', ')} - ${track.name}`);
        });
        console.log('=== END PLAYLIST CONTENTS ===\n');
      } catch (fetchError) {
        console.log('Note: Could not fetch playlist contents for logging');
      }
    }

    res.status(200).json({
      playlistUrl: playlist.url,
      playlistId: playlist.id,
      tracksAdded: tracks.length,
      platform,
    });
  } catch (error: any) {
    console.error('Error creating playlist:', error);

    // Handle API errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} authentication expired. Please log in again.`,
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} rate limit exceeded. Please wait a moment and try again.`,
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to create playlist',
    });
  }
}
