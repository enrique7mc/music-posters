import { MusicPlatform, Artist, Track, TrackSelectionMode, SetlistArtistInfo } from '@/types';
import {
  MusicPlatformService,
  TrackCountOptions,
  PlatformAccessError,
  ArtistSearchResult,
} from './types';
import { errDetail } from '@/lib/safe-log';
import { spotifyPlatform, SpotifyPlatformService } from './spotify-platform';
import { appleMusicPlatform, AppleMusicPlatformService } from './apple-music-platform';
import { MIN_TRACKS_PER_ARTIST, MAX_TRACKS_PER_ARTIST } from '@/lib/constants';
import { getTypicalSetlist, SetlistFallbackReason, TypicalSetlistLookup } from '@/lib/setlistfm';
import type { TypicalSet } from '@/lib/setlist-select';
import { selectTracksFromPool } from './apple-music-platform';
import { SONG_MATCH_THRESHOLD, titleSimilarity } from './song-match';

// Re-export types
export * from './types';
export { SpotifyPlatformService } from './spotify-platform';
export { AppleMusicPlatformService } from './apple-music-platform';

/**
 * Get the music platform service for the specified platform.
 * @param platform - The music platform ('spotify' or 'apple-music')
 * @returns The appropriate MusicPlatformService implementation
 */
export function getMusicPlatform(platform: MusicPlatform): MusicPlatformService {
  switch (platform) {
    case 'spotify':
      return spotifyPlatform;
    case 'apple-music':
      return appleMusicPlatform;
    default:
      throw new Error(`Unknown music platform: ${platform}`);
  }
}

/** An artist dropped from the results because a platform request failed. */
export interface FailedArtist {
  artist: string; // Name as requested (from the poster / user list)
  stage: 'search' | 'tracks'; // Which request failed
  reason: string; // Log-safe error detail (errDetail)
}

/** An artist whose catalog has fewer tracks than the playlist asked for. */
export interface ShortArtist {
  artist: string; // Name as requested (from the poster / user list)
  matchedAs: string; // Catalog name it matched
  requested: number;
  received: number;
}

/** An in-scope artist that got no Typical Set; its tracks come from the regular mode. */
export interface SetlistFallback {
  artist: string; // Name as requested
  reason: SetlistFallbackReason;
  mode: TrackSelectionMode; // The regular mode its tracks came from
}

/** Minimum share of a Typical Set (dropped covers excluded) that must resolve. */
export const MIN_SETLIST_RESOLUTION = 0.5;

/** Pause between song searches inside one artist slot (keeps Apple near 10 req/s). */
export const SETLIST_SONG_SEARCH_DELAY_MS = 500;

// Helper function to add delay between requests
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Process requests in batches to avoid rate limiting
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`
    );

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

/**
 * Maps artist tier to the number of tracks to fetch.
 */
function getTrackCountForTier(tier?: string, options?: TrackCountOptions): number {
  // Note: Per-artist overrides are handled by the caller before calling this function.
  // This function provides the fallback for artists without explicit overrides.

  // Check for custom-per-tier mode
  if (options?.mode === 'custom-per-tier' && options.tierCounts && tier) {
    const tierKey = tier as keyof typeof options.tierCounts;
    const override = options.tierCounts[tierKey];
    if (override !== undefined) {
      return Math.max(MIN_TRACKS_PER_ARTIST, Math.min(MAX_TRACKS_PER_ARTIST, override));
    }
  }

  // Check for custom mode (same count for all artists)
  if (options?.mode === 'custom' && options.customCount !== undefined) {
    return Math.max(MIN_TRACKS_PER_ARTIST, Math.min(MAX_TRACKS_PER_ARTIST, options.customCount));
  }

  // Default to tier-based
  if (!tier) return 3; // Default for Vision API (no tier info)

  switch (tier) {
    case 'headliner':
      return 10;
    case 'sub-headliner':
      return 5;
    case 'mid-tier':
      return 3;
    case 'undercard':
      return 1;
    default:
      return 3;
  }
}

/**
 * Derive the track selection mode for a single artist from its affinity tag:
 *  - loved → 'deep-cuts': the user already knows the hits, so reach for deeper tracks.
 *  - gem   → 'popular':   a new discovery deserves its gateway hit.
 *  - untagged → the user's global mode (unchanged — preserves non-personalized runs).
 */
export function getSelectionModeForArtist(
  artist: Artist,
  globalMode: TrackSelectionMode
): TrackSelectionMode {
  switch (artist.affinity) {
    case 'loved':
      return 'deep-cuts';
    case 'gem':
      return 'popular';
    default:
      return globalMode;
  }
}

/**
 * Platform-agnostic function to search for artists and get their top tracks.
 * Uses the specified platform service with rate limiting.
 *
 * @param platform - The music platform service to use
 * @param artists - Array of Artist objects to search for
 * @param token - Platform-specific auth token
 * @param trackCountOptions - Optional settings to customize track counts per artist
 * @param developerToken - Developer token (required for Apple Music)
 * @returns Object containing tracks, foundArtists count, artistMatches array, and
 *   failedArtists: artists whose lookup or top-tracks request failed (after the
 *   platform's own retries). They are missing from `tracks`, so callers MUST
 *   surface them instead of treating them as "not found". shortArtists: matched
 *   artists that returned fewer tracks than requested (logged, not an error).
 */
export async function searchAndGetTopTracks(
  platform: MusicPlatformService,
  artists: Artist[],
  token: string,
  trackCountOptions?: TrackCountOptions,
  developerToken?: string
): Promise<{
  tracks: Track[];
  foundArtists: number;
  artistMatches: Array<{
    requested: string;
    found: string | null;
    similarity: number;
    matched: boolean;
    matchType?: ArtistSearchResult['matchType'];
    lookupFailed: boolean;
  }>;
  failedArtists: FailedArtist[];
  shortArtists: ShortArtist[];
  setlistArtists: SetlistArtistInfo[];
  setlistFallbacks: SetlistFallback[];
}> {
  // Set developer token for Apple Music if needed
  if (platform.platform === 'apple-music' && developerToken) {
    (platform as AppleMusicPlatformService).setDeveloperToken(developerToken);
  }

  console.log(`\n=== SEARCHING ${platform.platform.toUpperCase()} ===`);
  console.log(`Searching for ${artists.length} artists...`);

  const artistNames = artists.map((a) => a.name);

  // "Prefer tour setlists": start the Setlist.fm lookups now, so they overlap
  // the Apple artist-search phase. getTypicalSetlist never rejects.
  const setlistStartedAt = Date.now();
  const setlistScope = new Set(trackCountOptions?.setlistArtistNames ?? []);
  const setlistCapable = Boolean(platform.getTopSongPool && platform.searchArtistSong);
  const setlistLookups = new Map<string, Promise<TypicalSetlistLookup>>();
  if (setlistCapable) {
    for (const name of setlistScope) setlistLookups.set(name, getTypicalSetlist(name));
  }
  const setlistArtists: SetlistArtistInfo[] = [];
  const setlistFallbacks: SetlistFallback[] = [];

  // Configure rate limiting based on platform
  // Spotify: 3 req/batch, 1000ms delay (180 req/min limit)
  // Apple Music: 5 req/batch, 500ms delay (~10 req/sec)
  const batchSize = platform.platform === 'spotify' ? 3 : 5;
  const batchDelay = platform.platform === 'spotify' ? 1000 : 500;

  // A per-artist failure must not sink the batch or vanish silently. Record it
  // and continue. Access failures still abort everything: if the platform
  // refuses one call it refuses them all. That covers PlatformAccessError and a
  // raw 401 (expired token), which the route maps to 401 so the client re-auths.
  const failedArtists: FailedArtist[] = [];
  const recordFailure = (artist: string, stage: FailedArtist['stage'], error: unknown) => {
    if (error instanceof PlatformAccessError) throw error;
    if ((error as { response?: { status?: number } })?.response?.status === 401) throw error;
    const reason = errDetail(error); // never the raw error: axios carries tokens
    console.error(`  ✗ ${stage} failed for "${artist}": ${reason}`);
    failedArtists.push({ artist, stage, reason });
  };

  // Process artist searches in batches
  const searchResults = await processBatch(
    artistNames,
    async (name) => {
      try {
        return { result: await platform.searchArtist(name, token), failed: false };
      } catch (error) {
        recordFailure(name, 'search', error);
        return { result: null, failed: true };
      }
    },
    batchSize,
    batchDelay
  );

  // Track all matches for debugging
  const artistMatches = artistNames.map((requested, index) => {
    const { result: found, failed } = searchResults[index];
    return {
      requested,
      found: found ? found.name : null,
      similarity: found ? found.similarity : 0,
      matched: found ? found.matched : false,
      matchType: found?.matchType,
      lookupFailed: failed,
    };
  });

  // Filter out null results and poorly matched results
  const validArtists = searchResults
    .map(({ result }, index) => ({
      searchResult: result,
      originalArtist: artists[index],
    }))
    .filter(
      (
        pair
      ): pair is {
        searchResult: ArtistSearchResult;
        originalArtist: Artist;
      } => pair.searchResult !== null && pair.searchResult.matched
    );

  console.log(`\n📊 Match Statistics:`);
  console.log(`✓ Exact/Good matches: ${validArtists.length}/${artistNames.length}`);
  console.log(
    `⚠️  Poor/No matches: ${artistNames.length - validArtists.length}/${artistNames.length}`
  );

  // Two poster names can match the same catalog artist (e.g. a short and a
  // long form of one band name). Fetch that artist once, for the first name.
  const fetchedIds = new Map<string, string>();
  const uniqueArtists = validArtists.filter((pair) => {
    const firstName = fetchedIds.get(pair.searchResult.id);
    if (firstName !== undefined) {
      console.log(
        `  ↺ "${pair.originalArtist.name}" matched the same artist as "${firstName}" ` +
          `("${pair.searchResult.name}"); skipping the duplicate`
      );
      return false;
    }
    fetchedIds.set(pair.searchResult.id, pair.originalArtist.name);
    return true;
  });

  // Get top tracks in batches
  const shortArtists: ShortArtist[] = [];
  const trackArrays = await processBatch(
    uniqueArtists,
    async (pair) => {
      // Check for per-artist override
      let trackCount: number;
      if (
        trackCountOptions?.mode === 'per-artist' &&
        trackCountOptions.perArtistCounts &&
        trackCountOptions.perArtistCounts[pair.originalArtist.name] !== undefined
      ) {
        trackCount = Math.max(
          MIN_TRACKS_PER_ARTIST,
          Math.min(
            MAX_TRACKS_PER_ARTIST,
            trackCountOptions.perArtistCounts[pair.originalArtist.name]
          )
        );
      } else {
        trackCount = getTrackCountForTier(pair.originalArtist.tier, trackCountOptions);
      }

      // Per-artist selection mode derived from affinity; untagged artists fall
      // back to the user's global mode (default 'popular' as before).
      const globalMode = trackCountOptions?.selectionMode || 'popular';
      const selectionMode = getSelectionModeForArtist(pair.originalArtist, globalMode);

      try {
        let artistTracks: Track[] | null = null;
        if (setlistScope.has(pair.originalArtist.name)) {
          const lookup = setlistLookups.get(pair.originalArtist.name);
          const outcome = lookup ? (await lookup).result : null;
          const reason: SetlistFallbackReason | null = !lookup
            ? 'unsupported-platform'
            : outcome!.kind === 'fallback'
              ? outcome!.reason
              : null;
          if (outcome?.kind === 'typical') {
            const built = await buildSetlistTracks(
              platform,
              pair.searchResult,
              outcome.typicalSet,
              trackCount,
              selectionMode
            );
            if (built.kind === 'tracks') {
              artistTracks = built.tracks;
              const { latest } = outcome.typicalSet;
              setlistArtists.push({
                artist: pair.originalArtist.name,
                latestDate: latest.date,
                venue: latest.venue,
                city: latest.city,
                ...(latest.tour ? { tour: latest.tour } : {}),
                url: latest.url,
                setSize: built.setSize,
                resolved: built.resolved,
              });
            } else {
              setlistFallbacks.push({
                artist: pair.originalArtist.name,
                reason: 'low-resolution',
                mode: selectionMode,
              });
            }
          } else if (reason) {
            console.log(`[setlist] ${pair.originalArtist.name}: fallback (${reason})`);
            setlistFallbacks.push({
              artist: pair.originalArtist.name,
              reason,
              mode: selectionMode,
            });
          }
        }

        if (!artistTracks) {
          console.log(
            `  Fetching ${trackCount} tracks for ${pair.searchResult.name} ` +
              `(tier: ${pair.originalArtist.tier || 'unknown'}, ` +
              `affinity: ${pair.originalArtist.affinity || 'none'} → ${selectionMode})`
          );
          artistTracks = await platform.getArtistTopTracks(
            pair.searchResult.id,
            token,
            trackCount,
            selectionMode
          );
        }
        // A short result is not an error, but it shrinks the playlist silently.
        // It often means the match picked a thin catalog page.
        if (artistTracks.length < trackCount) {
          console.warn(
            `  ⚠ Only ${artistTracks.length} of ${trackCount} tracks available for ` +
              `"${pair.originalArtist.name}" (matched "${pair.searchResult.name}")`
          );
          shortArtists.push({
            artist: pair.originalArtist.name,
            matchedAs: pair.searchResult.name,
            requested: trackCount,
            received: artistTracks.length,
          });
        }
        return artistTracks;
      } catch (error) {
        recordFailure(pair.originalArtist.name, 'tracks', error);
        return [];
      }
    },
    batchSize,
    batchDelay
  );

  // Flatten, keeping one copy of a track that two artists share (a collaboration).
  const seenTracks = new Set<string>();
  const tracks = trackArrays.flat().filter((t) => {
    if (seenTracks.has(t.id)) return false;
    seenTracks.add(t.id);
    return true;
  });
  console.log(`Retrieved ${tracks.length} total tracks from ${uniqueArtists.length} artists`);
  console.log(`=== END ${platform.platform.toUpperCase()} SEARCH ===\n`);

  if (failedArtists.length > 0) {
    console.error(`⚠️  ${failedArtists.length} artists failed and are missing from the results`);
  }

  if (setlistScope.size > 0) {
    let calls = 0;
    let cacheHits = 0;
    for (const lookup of setlistLookups.values()) {
      const done = await lookup;
      calls += done.calls;
      if (done.cacheHit) cacheHits++;
    }
    console.log(
      `[setlist] summary: inScope=${setlistScope.size} typicalSets=${setlistArtists.length} ` +
        `fallbacks=${setlistFallbacks.length} calls=${calls} cacheHits=${cacheHits} ` +
        `latencyMs=${Date.now() - setlistStartedAt}`
    );
  }

  return {
    tracks,
    foundArtists: validArtists.length,
    artistMatches,
    failedArtists,
    shortArtists,
    setlistArtists,
    setlistFallbacks,
  };
}

type SetlistBuild =
  | { kind: 'tracks'; tracks: Track[]; setSize: number; resolved: number }
  | { kind: 'low-resolution' };

/**
 * Resolve a Typical Set to platform tracks, in setlist order.
 *
 * 1. Match each title against the artist's top-song pool (no extra request).
 * 2. Search the rest one at a time, SETLIST_SONG_SEARCH_DELAY_MS apart, so
 *    this artist's slot never sends parallel requests.
 * 3. A cover that the artist has not released is dropped. It is neither a
 *    failure nor part of the MIN_SETLIST_RESOLUTION denominator.
 * 4. Fewer than MIN_SETLIST_RESOLUTION resolved → low-resolution (fallback).
 * 5. Count rule: max(resolved songs, the artist's count). A short set is
 *    topped up from the pool with the artist's regular mode.
 *
 * Throws only what the caller already handles (access errors, a failed pool
 * request). A failed song search counts as unresolved.
 */
async function buildSetlistTracks(
  platform: MusicPlatformService,
  catalogArtist: ArtistSearchResult,
  typicalSet: TypicalSet,
  artistCount: number,
  selectionMode: TrackSelectionMode
): Promise<SetlistBuild> {
  const pool = await platform.getTopSongPool!(catalogArtist.id);
  const resolvedTracks: Track[] = [];
  const unresolved: string[] = [];
  let fromPool = 0;
  let fromSearch = 0;
  let coversDropped = 0;
  let searches = 0;

  for (const song of typicalSet.songs) {
    // Closest unused pool title wins, so a fuzzy match ("Pt. 2" for "Pt. 1")
    // cannot take a track that an exact match needs.
    const used = new Set(resolvedTracks.map((t) => t.id));
    let track: Track | null = null;
    let best = SONG_MATCH_THRESHOLD;
    for (const candidate of pool) {
      if (used.has(candidate.id)) continue;
      const score = titleSimilarity(candidate.name, song.title);
      if (score >= best && (!track || score > best)) {
        track = candidate;
        best = score;
      }
    }
    let viaPool = track !== null;
    if (!track) {
      if (searches > 0) await delay(SETLIST_SONG_SEARCH_DELAY_MS);
      searches++;
      try {
        track = await platform.searchArtistSong!(catalogArtist.name, song.title);
      } catch (error) {
        if (error instanceof PlatformAccessError) throw error;
        if ((error as { response?: { status?: number } })?.response?.status === 401) throw error;
        track = null;
      }
      // A search hit that another setlist song already took is not a new song.
      if (track && used.has(track.id)) track = null;
      viaPool = false;
    }

    if (!track) {
      if (song.isCover) coversDropped++;
      else unresolved.push(song.title);
      continue;
    }
    if (viaPool) fromPool++;
    else fromSearch++;
    resolvedTracks.push({ ...track, artistId: catalogArtist.id, source: 'setlist' });
  }

  const setSize = typicalSet.songs.length;
  const counted = setSize - coversDropped;
  const resolvedCount = fromPool + fromSearch;
  const latest = `${typicalSet.latest.date} ${typicalSet.latest.city}`.trim();
  const unresolvedNote =
    unresolved.length > 0 ? `, unresolved: ${unresolved.map((t) => `"${t}"`).join(', ')}` : '';
  console.log(
    `[setlist] ${catalogArtist.name}: ${resolvedCount}/${counted} resolved ` +
      `(pool ${fromPool}, search ${fromSearch}), ${coversDropped} cover` +
      `${coversDropped === 1 ? '' : 's'} dropped${unresolvedNote} · ${latest}`
  );

  if (counted === 0 || resolvedCount < counted * MIN_SETLIST_RESOLUTION) {
    console.log(`[setlist] ${catalogArtist.name}: fallback (low-resolution)`);
    return { kind: 'low-resolution' };
  }

  const tracks = [...resolvedTracks];
  if (tracks.length < artistCount) {
    const chosen = new Set(tracks.map((t) => t.id));
    const remaining = pool.filter((t) => !chosen.has(t.id));
    tracks.push(...selectTracksFromPool(remaining, artistCount - tracks.length, selectionMode));
  }
  return { kind: 'tracks', tracks, setSize: counted, resolved: resolvedCount };
}
