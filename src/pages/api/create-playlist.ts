import { NextApiRequest, NextApiResponse } from 'next';
import {
  clearAllAuthCookies,
  getAuthenticatedPlatformOrDev,
  getPlatformAccessTokenOrDev,
} from '@/lib/auth';
import { isDevModeAvailable, getDevConfig } from '@/lib/dev-mode';
import { getMusicPlatform, PartialAddError } from '@/lib/music-platform';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { SpotifyPlatformService } from '@/lib/music-platform/spotify-platform';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { getPlaylistTracks } from '@/lib/spotify';
import { errDetail } from '@/lib/safe-log';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { createPlaylistSchema, validateRequest } from '@/lib/validation';
import { generatePlaylistCover } from '@/lib/cover-generator';
import { MusicPlatform } from '@/types';

// Large playlists need many sequential batch calls. A measured Apple batch
// takes ~1.5–2.5s plus the 500ms pause, and transient errors add retry
// backoff, so 2,000 tracks (20 batches) does not fit in 30s.
export const config = {
  maxDuration: 60,
};

// Skip the read-back when the add step ran long, so the route still answers
// inside maxDuration. The read-back is evidence only, never required.
const VERIFY_BUDGET_MS = 40_000;

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

  const devConfig = isDevModeAvailable() ? getDevConfig() : null;
  const accessToken = getPlatformAccessTokenOrDev(req);

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
  const authenticatedPlatform = getAuthenticatedPlatformOrDev(req);

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

  // Dev mode: dry-run returns fake response without hitting any APIs
  if (devConfig?.dryRunPlaylist) {
    const ts = Date.now();
    const dryRunPlatform = platform;
    const fakeUrl =
      dryRunPlatform === 'apple-music'
        ? `https://music.apple.com/library/playlist/dev-dry-run-${ts}`
        : `https://open.spotify.com/playlist/dev-dry-run-${ts}`;

    console.log(
      `[DEV MODE] Dry-run playlist creation: ${tracks.length} tracks, platform: ${dryRunPlatform}`
    );

    return res.status(200).json({
      playlistUrl: fakeUrl,
      playlistId: `dev-dry-run-${ts}`,
      tracksAdded: tracks.length,
      tracksRequested: tracks.length,
      tracksVerified: null,
      partial: false,
      platform: dryRunPlatform,
      dryRun: true,
    });
  }

  const startedAt = Date.now();
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

    // The playlist exists from here on. When a batch fails after its retries,
    // report what landed (with the link) instead of a bare error: a generic
    // 500 would hide a half-filled playlist, and "Try again" would make a
    // second one.
    let tracksAdded = trackIdsToAdd.length;
    let partial = false;
    try {
      await platformService.addTracksToPlaylist(playlist.id, trackIdsToAdd, accessToken);
    } catch (error) {
      if (!(error instanceof PartialAddError)) throw error;
      if (error.added === 0) throw error.failure; // nothing landed: normal error handling
      partial = true;
      tracksAdded = error.added;
      console.error(
        `[create-playlist] partial add: ${error.added}/${error.total} tracks, then:`,
        errDetail(error.failure)
      );
    }

    // Read the stored count back so a silent platform-side drop shows up in the
    // logs and on the success page. Non-fatal.
    let tracksVerified: number | null = null;
    if (platformService.getPlaylistTrackCount && Date.now() - startedAt < VERIFY_BUDGET_MS) {
      try {
        tracksVerified = await platformService.getPlaylistTrackCount(playlist.id, accessToken);
      } catch (error) {
        console.warn('[create-playlist] read-back failed (non-fatal):', errDetail(error));
      }
    }

    // One summary line per request so each run can be traced in the Vercel logs.
    console.log(
      `[create-playlist] platform=${platform} playlist=${playlist.id} ` +
        `requested=${trackIdsToAdd.length} added=${tracksAdded} ` +
        `verified=${tracksVerified ?? 'skipped'} partial=${partial} ` +
        `elapsedMs=${Date.now() - startedAt}`
    );

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
      tracksAdded,
      tracksRequested: trackIdsToAdd.length,
      tracksVerified,
      partial,
      platform,
    });
  } catch (error: any) {
    // errDetail() only — createPlaylist/addTracksToPlaylist rethrow raw axios errors,
    // whose config.headers carry the Spotify bearer or Apple Music-User-Token.
    console.error('Error creating playlist:', errDetail(error));

    const status = error.response?.status;

    // Apple reports a rejected Music-User-Token (expired, revoked, lapsed
    // subscription) as 403, not 401. Clear the dead session so the sign-in page
    // offers Apple Music again instead of redirecting the user straight back.
    if (platform === 'apple-music' && (status === 401 || status === 403)) {
      clearAllAuthCookies(res);
      return res.status(401).json({
        error: 'Apple Music authentication expired. Please log in again.',
      });
    }

    // Handle API errors
    if (status === 401) {
      return res.status(401).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} authentication expired. Please log in again.`,
      });
    }

    if (status === 429) {
      return res.status(429).json({
        error: `${platform === 'spotify' ? 'Spotify' : 'Apple Music'} rate limit exceeded. Please wait a moment and try again.`,
      });
    }

    res.status(500).json({
      error: 'Failed to create playlist. Please try again.',
    });
  }
}
