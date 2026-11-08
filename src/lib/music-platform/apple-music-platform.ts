import axios from 'axios';
import { Track, PlatformUser, TrackSelectionMode } from '@/types';
import {
  MusicPlatformService,
  ArtistSearchResult,
  PlaylistResult,
  PlatformAccessError,
  PartialAddError,
} from './types';
import {
  similarity,
  containsName,
  isDerivativeName,
  CATALOG_MATCH_THRESHOLD,
} from '@/lib/artist-match';
// Shared with the Spotify adapter — see safe-log.ts for why raw axios errors must
// never reach console.error (config.headers carries the developer bearer token and
// the Music-User-Token).
import { errMessage } from '@/lib/safe-log';

const APPLE_MUSIC_API_BASE_URL = 'https://api.music.apple.com/v1';
// Origin only (no `/v1`). Apple's pagination `next` is an absolute path like
// `/v1/me/library/artists?offset=100`, so we prepend the origin to it — prepending
// the base URL would produce a broken `/v1/v1` path (observed in the spike).
const APPLE_MUSIC_API_ORIGIN = 'https://api.music.apple.com';
const DEFAULT_STOREFRONT = 'us'; // US storefront for search

// Library scan tuning (getLibraryArtists)
const LIBRARY_PAGE_LIMIT = 100; // Apple's max page size for library endpoints
const MAX_LIBRARY_PAGES = 50; // hard ceiling (~5000 artists) to protect the 30s route budget
const LIBRARY_PAGE_THROTTLE_MS = 50; // inter-page delay to stay under rate limits
const LIBRARY_PAGE_TIMEOUT_MS = 8000; // per-page deadline so one slow page can't ride to the 30s kill

// Transient-error retry (429, 5xx, network). These retries only add waiting on
// top of the fixed batch pacing in music-platform/index.ts; they never send
// requests faster.
const MAX_ATTEMPTS = 3; // 1 try + 2 retries
const DEFAULT_RETRY_BASE_MS = 1000; // backoff 1s, then 2s
const MAX_RETRY_AFTER_MS = 5000; // cap on an upstream Retry-After hint

const PLAYLIST_ADD_BATCH_SIZE = 100;
const PLAYLIST_TRACKS_PAGE_LIMIT = 100;
const PLAYLIST_READBACK_PAGE_TIMEOUT_MS = 5000; // per-page cap; the caller sets the overall deadline
const DEFAULT_READBACK_BUDGET_MS = 10_000;

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/**
 * True only for a 429. Use it for non-idempotent requests: a 429 means Apple
 * refused the request before processing it, whereas a 5xx or a dropped
 * connection can arrive after Apple already applied it (RFC 9110 §9.2.2).
 */
function isRateLimited(error: unknown): boolean {
  return httpStatus(error) === 429;
}

/**
 * True for failures worth retrying: rate limiting (429), Apple server errors
 * (5xx), and network failures (an axios error with no response). Everything
 * else (4xx, programming errors) fails at once.
 */
function isTransient(error: unknown): boolean {
  const status = httpStatus(error);
  if (status !== undefined) return status === 429 || status >= 500;
  return axios.isAxiosError(error) && error.code !== 'ERR_CANCELED';
}

function retryDelayMs(error: unknown, attempt: number, baseMs: number): number {
  const header = (error as { response?: { headers?: Record<string, unknown> } })?.response
    ?.headers?.['retry-after'];
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return baseMs * 2 ** (attempt - 1);
}

/**
 * Selects tracks from a pool based on the selection mode.
 * Randomizes within the filtered pool to provide variety.
 */
function selectTracksFromPool(tracks: any[], limit: number, mode: TrackSelectionMode): any[] {
  if (tracks.length === 0) return [];

  let pool: any[];

  switch (mode) {
    case 'popular': {
      const popularPoolSize = Math.max(limit, Math.ceil(tracks.length * 0.5));
      pool = tracks.slice(0, Math.min(popularPoolSize, tracks.length));
      break;
    }

    case 'deep-cuts': {
      const skipCount = Math.floor(tracks.length * 0.2);
      const deepCutsPool = tracks.slice(skipCount);
      pool = deepCutsPool.length >= limit ? deepCutsPool : tracks;
      break;
    }

    case 'balanced':
    default:
      pool = tracks;
      break;
  }

  // Fisher-Yates shuffle for unbiased randomization
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Return up to `limit` tracks
  return shuffled.slice(0, Math.min(limit, shuffled.length));
}

interface CatalogCandidate {
  artist: any;
  sim: number;
  /**
   * Albums listed in the search result. Apple caps the list at 25 and adds
   * `next` when there are more, so every larger catalog counts as 26.
   */
  albums: number;
  /** A tribute, karaoke, live or hits page that contains the poster name. */
  derivative: boolean;
}

interface CatalogPick {
  best: CatalogCandidate;
  closest: CatalogCandidate;
  matched: boolean;
  matchType: 'exact' | 'fuzzy' | 'contains';
}

function albumCount(artist: any): number {
  const albums = artist.relationships?.albums;
  return (albums?.data?.length ?? 0) + (albums?.next ? 1 : 0);
}

/** True when b ranks above a: real artist first, then more albums, then closer spelling. */
function outranks(b: CatalogCandidate, a: CatalogCandidate): boolean {
  if (a.derivative !== b.derivative) return a.derivative;
  if (b.albums !== a.albums) return b.albums > a.albums;
  return b.sim > a.sim;
}

/**
 * Chooses the catalog artist for a poster name from Apple's search results.
 *
 * 1. An exact name match (after normalization) wins, first in Apple's order.
 * 2. If the closest spelling is below CATALOG_MATCH_THRESHOLD, there is no
 *    match. A containing name alone never creates a match.
 * 3. Otherwise the candidates are the closest spelling plus every artist whose
 *    name contains the poster name as a phrase (see containsName), except
 *    tribute, karaoke, live and hits pages (see isDerivativeName). A real
 *    artist beats a derived page, then the most albums wins, then the higher
 *    similarity, then Apple's order. Album counts stop at 26 (see
 *    CatalogCandidate), so two large catalogs tie and the closer spelling wins.
 * 4. If the search response has no album lists, rule 3 cannot rank the
 *    candidates, so the closest spelling wins and a warning is logged.
 *
 * Rule 3 exists because the closest spelling is often a thin secondary page.
 * Example: "Maldita Vecindad" is closest to "La Maldita Vecindad" (2 singles as
 * a featured artist), but the band is "Maldita Vecindad y Los Hijos del Quinto
 * Patio" (18 albums). The album count comes with the search response, so this
 * costs no extra request.
 */
function pickCatalogArtist(name: string, artists: any[]): CatalogPick {
  const candidates: CatalogCandidate[] = artists.map((artist) => ({
    artist,
    sim: similarity(name, artist.attributes.name),
    albums: albumCount(artist),
    derivative: isDerivativeName(artist.attributes.name, name),
  }));

  // First candidate with the highest similarity (Apple's order breaks ties).
  const closest = candidates.reduce((a, b) => (b.sim > a.sim ? b : a));
  if (closest.sim === 1) return { best: closest, closest, matched: true, matchType: 'exact' };
  if (closest.sim < CATALOG_MATCH_THRESHOLD) {
    return { best: closest, closest, matched: false, matchType: 'fuzzy' };
  }

  const containing = candidates.filter(
    (c) => c !== closest && !c.derivative && containsName(c.artist.attributes.name, name)
  );
  const fuzzy: CatalogPick = { best: closest, closest, matched: true, matchType: 'fuzzy' };
  if (containing.length === 0) {
    if (containsName(closest.artist.attributes.name, name) && !closest.derivative) {
      fuzzy.matchType = 'contains';
    }
    return fuzzy;
  }

  if (!candidates.some((c) => c.artist.relationships?.albums)) {
    console.warn(
      `[Apple Music] No album counts in search results for "${name}"; ` +
        `kept closest spelling "${closest.artist.attributes.name}" over ` +
        `${containing.length} containing name(s)`
    );
    return fuzzy;
  }

  const best = [closest, ...containing].reduce((a, b) => (outranks(b, a) ? b : a));
  const contains = !best.derivative && containsName(best.artist.attributes.name, name);
  return { best, closest, matched: true, matchType: contains ? 'contains' : 'fuzzy' };
}

/**
 * Helper function to add delay between requests
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apple Music implementation of MusicPlatformService
 *
 * Note: Apple Music API requires two tokens:
 * - Developer Token (JWT): Generated server-side, used in Authorization header
 * - Music User Token: Obtained client-side via MusicKit JS, used in Music-User-Token header
 *
 * For this service, the `token` parameter is the Music User Token.
 * The Developer Token is generated separately via the auth module.
 */
export class AppleMusicPlatformService implements MusicPlatformService {
  readonly platform = 'apple-music' as const;
  private developerToken: string | null = null;
  /** Base backoff for transient-error retries. Tests set it to 0. */
  retryBaseMs = DEFAULT_RETRY_BASE_MS;

  /**
   * Set the developer token for API requests
   */
  setDeveloperToken(token: string) {
    this.developerToken = token;
  }

  /**
   * Get headers for Apple Music API requests
   */
  private getHeaders(userToken: string) {
    if (!this.developerToken) {
      throw new Error('Developer token not set. Call setDeveloperToken() first.');
    }
    return {
      Authorization: `Bearer ${this.developerToken}`,
      'Music-User-Token': userToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Run an Apple Music request, retrying transient failures (429, 5xx, network)
   * with backoff. Rethrows the last error when retries run out or `shouldRetry`
   * rejects the error. Logs only errMessage(): raw axios errors carry both tokens.
   */
  private async withRetry<T>(
    label: string,
    request: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = isTransient
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await request();
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS || !shouldRetry(error)) throw error;
        const waitMs = retryDelayMs(error, attempt, this.retryBaseMs);
        console.warn(
          `[Apple Music] ${label} failed (${errMessage(error)}); ` +
            `retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms`
        );
        await delay(waitMs);
      }
    }
  }

  /**
   * Get headers for catalog-only requests (no user token needed)
   */
  private getCatalogHeaders() {
    if (!this.developerToken) {
      throw new Error('Developer token not set. Call setDeveloperToken() first.');
    }
    return {
      Authorization: `Bearer ${this.developerToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Returns null when the catalog has no usable match. Throws when the lookup
   * itself fails after retries, so the caller can report "lookup failed"
   * instead of the misleading "not found". 401/403 (developer token rejected)
   * throws PlatformAccessError, which aborts the whole search.
   */
  async searchArtist(name: string, token: string): Promise<ArtistSearchResult | null> {
    try {
      // Search in the Apple Music catalog (doesn't require user token)
      const response = await this.withRetry(`Search for "${name}"`, () =>
        axios.get(`${APPLE_MUSIC_API_BASE_URL}/catalog/${DEFAULT_STOREFRONT}/search`, {
          params: {
            types: 'artists',
            term: name,
            limit: 5,
          },
          headers: this.getCatalogHeaders(),
        })
      );

      const artists = response.data.results?.artists?.data;

      if (!artists || artists.length === 0) {
        console.warn(`[Apple Music] No results for "${name}"`);
        return null;
      }

      const { best, closest, matched, matchType } = pickCatalogArtist(name, artists);
      const bestMatch = best.artist;
      const bestSimilarity = best.sim;

      if (!matched) {
        console.warn(
          `[Apple Music] Low match for "${name}": got "${bestMatch.attributes.name}" (${(bestSimilarity * 100).toFixed(0)}% similar)`
        );
      } else if (best !== closest) {
        console.log(
          `[Apple Music] Catalog match: "${name}" -> "${bestMatch.attributes.name}" ` +
            `(${best.albums} albums), preferred over closer spelling ` +
            `"${closest.artist.attributes.name}" (${closest.albums} albums)`
        );
      } else if (bestMatch.attributes.name !== name) {
        console.log(
          `[Apple Music] Fuzzy match: "${name}" -> "${bestMatch.attributes.name}" (${(bestSimilarity * 100).toFixed(0)}%)`
        );
      } else {
        console.log(`[Apple Music] Exact match: "${name}"`);
      }

      return {
        id: bestMatch.id,
        name: bestMatch.attributes.name,
        matched,
        similarity: bestSimilarity,
        matchType,
      };
    } catch (error) {
      console.error(`[Apple Music] Error searching for artist "${name}":`, errMessage(error));
      const status = httpStatus(error);
      if (status === 401 || status === 403) {
        throw new PlatformAccessError('apple-music', status, '/catalog/search');
      }
      throw error;
    }
  }

  async getArtistTopTracks(
    artistId: string,
    token: string,
    limit: number = 1,
    selectionMode: TrackSelectionMode = 'popular'
  ): Promise<Track[]> {
    try {
      // Get artist's top songs from catalog
      const response = await this.withRetry(`Top songs for artist ${artistId}`, () =>
        axios.get(
          `${APPLE_MUSIC_API_BASE_URL}/catalog/${DEFAULT_STOREFRONT}/artists/${artistId}/view/top-songs`,
          {
            params: {
              limit: 25, // Get up to 25 songs to select from (API max for view endpoints)
            },
            headers: this.getCatalogHeaders(),
          }
        )
      );

      const tracks = response.data.data;
      if (!tracks || tracks.length === 0) return [];

      // Select tracks based on mode
      const selectedTracks = selectTracksFromPool(tracks, limit, selectionMode);

      // Map to our Track interface
      return selectedTracks.map((track: any) => {
        const attributes = track.attributes;

        // Generate artwork URL (Apple Music uses {w}x{h} placeholders)
        let artworkUrl = null;
        if (attributes.artwork?.url) {
          artworkUrl = attributes.artwork.url.replace('{w}', '300').replace('{h}', '300');
        }

        return {
          name: attributes.name,
          id: track.id,
          uri: undefined, // Apple Music doesn't use URIs
          artist: attributes.artistName || 'Unknown Artist',
          artistId: artistId,
          album: attributes.albumName || 'Unknown Album',
          albumArtwork: artworkUrl,
          duration: attributes.durationInMillis || 0,
          previewUrl: attributes.previews?.[0]?.url || null,
          platformUrl: attributes.url || `https://music.apple.com/song/${track.id}`,
          platform: 'apple-music' as const,
        };
      });
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404) return []; // no top songs for this artist: not a failure
      console.error(
        `[Apple Music] Error getting top tracks for artist ${artistId}:`,
        errMessage(error)
      );
      // Throw instead of returning []: an empty result here used to drop the
      // artist from the playlist with no warning (e.g. under a 429 burst).
      if (status === 401 || status === 403) {
        throw new PlatformAccessError('apple-music', status, '/catalog/artists/top-songs');
      }
      throw error;
    }
  }

  /**
   * Scan the authenticated user's full library of artists (the "loved" set used
   * by personalization). Paginated, throttled, and capped:
   *  - 100 artists/page (Apple's max for library endpoints)
   *  - 50ms inter-page throttle to stay under rate limits
   *  - MAX_LIBRARY_PAGES ceiling so a huge library can't blow the route budget
   *  - per-page timeout so one slow page can't ride to the 30s serverless kill
   *  - origin-prepend on `next` (never `/v1/v1`)
   *  - partial-success: on any page error, return what was collected so far
   *    rather than throwing — but report `complete: false` so the caller can
   *    mark the result degraded and skip gems (an unscanned loved artist must
   *    not be mislabeled a "gem"). `complete` is also false when the page
   *    ceiling is hit with more pages remaining.
   *
   * Requires the Music User Token (library data is user-scoped).
   */
  async getLibraryArtists(token: string): Promise<{ artists: string[]; complete: boolean }> {
    const names: string[] = [];
    let url: string | null =
      `${APPLE_MUSIC_API_BASE_URL}/me/library/artists?limit=${LIBRARY_PAGE_LIMIT}`;
    let pages = 0;
    let complete = true;

    while (url && pages < MAX_LIBRARY_PAGES) {
      // Apple's `next` is an absolute path (`/v1/me/...`). Prepend the ORIGIN
      // only — prepending the base URL (which ends in `/v1`) yields `/v1/v1`.
      const requestUrl = url.startsWith('http') ? url : `${APPLE_MUSIC_API_ORIGIN}${url}`;

      // `next` is attacker-influenceable (it comes from the upstream response
      // body). We attach the developer bearer token + Music-User-Token to this
      // request, so it must ONLY ever go to Apple — otherwise a malformed or
      // compromised `next` URL exfiltrates both tokens. Refuse anything else.
      let requestOrigin = '';
      try {
        requestOrigin = new URL(requestUrl).origin;
      } catch {
        requestOrigin = '';
      }
      if (requestOrigin !== APPLE_MUSIC_API_ORIGIN) {
        console.error(
          `[Apple Music] Refusing to follow non-Apple pagination URL (page ${pages + 1}); stopping scan.`
        );
        complete = false; // partial scan — treat like a failed page
        break;
      }

      let data: any;
      try {
        const response = await axios.get(requestUrl, {
          headers: this.getHeaders(token),
          timeout: LIBRARY_PAGE_TIMEOUT_MS,
        });
        data = response.data;
      } catch (error) {
        console.error(
          `[Apple Music] Error scanning library artists (page ${pages + 1}):`,
          errMessage(error)
        );
        // Apple rejects an expired/revoked Music-User-Token with 401 or 403. Every
        // later user-scoped call fails the same way, so surface it instead of
        // degrading to an empty "success" that hides the need to reconnect.
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          throw new PlatformAccessError('apple-music', status, '/me/library/artists');
        }
        complete = false; // partial/failed scan — keep what we have, flag incompleteness
        break;
      }

      pages++;
      for (const artist of data?.data || []) {
        const name = artist?.attributes?.name;
        if (name) names.push(name);
      }

      url = typeof data?.next === 'string' ? data.next : null;
      if (url && pages < MAX_LIBRARY_PAGES) await delay(LIBRARY_PAGE_THROTTLE_MS);
    }

    if (url && pages >= MAX_LIBRARY_PAGES) {
      complete = false; // truncated by the ceiling — more pages remained
      console.warn(
        `[Apple Music] Library scan hit the ${MAX_LIBRARY_PAGES}-page ceiling; loved set may be truncated.`
      );
    }
    console.log(
      `[Apple Music] Library scan: ${names.length} artists across ${pages} pages (complete: ${complete})`
    );
    return { artists: names, complete };
  }

  async createPlaylist(
    userId: string,
    name: string,
    token: string,
    description?: string
  ): Promise<PlaylistResult> {
    try {
      const response = await axios.post(
        `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists`,
        {
          attributes: {
            name,
            description: description || 'Generated from festival poster by Playlistd',
          },
        },
        {
          headers: this.getHeaders(token),
        }
      );

      const playlist = response.data.data?.[0];
      if (!playlist) {
        throw new Error('Apple Music API returned empty playlist response');
      }

      // Apple Music doesn't return a direct URL in the response
      // We construct it from the playlist ID
      const playlistUrl = playlist.attributes?.playParams?.globalId
        ? `https://music.apple.com/library/playlist/${playlist.attributes.playParams.globalId}`
        : `https://music.apple.com/library/playlist/${playlist.id}`;

      return {
        id: playlist.id,
        url: playlistUrl,
      };
    } catch (error) {
      // errMessage() only: a raw axios error carries config.headers (the bearer
      // developer token + Music-User-Token), which util.inspect would print to logs.
      console.error('[Apple Music] Error creating playlist:', errMessage(error));
      throw error;
    }
  }

  /**
   * Add tracks in batches of 100 with a 500ms pause between batches. A batch
   * retries only on 429: the POST is not idempotent, and a retry after a 5xx
   * or network error could add the same tracks twice. When a batch fails, throws PartialAddError
   * with the count of tracks added so far: the playlist already exists, so the
   * caller can report a partial result.
   */
  async addTracksToPlaylist(playlistId: string, trackIds: string[], token: string): Promise<void> {
    const chunks: string[][] = [];
    for (let i = 0; i < trackIds.length; i += PLAYLIST_ADD_BATCH_SIZE) {
      chunks.push(trackIds.slice(i, i + PLAYLIST_ADD_BATCH_SIZE));
    }

    let added = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const label = `Add batch ${i + 1}/${chunks.length} (${chunk.length} tracks)`;

      try {
        const response = await this.withRetry(
          label,
          () =>
            axios.post(
              `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists/${playlistId}/tracks`,
              { data: chunk.map((id) => ({ id, type: 'songs' })) },
              { headers: this.getHeaders(token) }
            ),
          isRateLimited
        );
        added += chunk.length;
        console.log(`[Apple Music] ${label} → HTTP ${response.status}`);
      } catch (error) {
        console.error(`[Apple Music] ${label} failed after retries:`, errMessage(error));
        throw new PartialAddError(added, trackIds.length, error);
      }

      // Add delay between batches to respect rate limits
      if (i < chunks.length - 1) {
        await delay(500);
      }
    }
  }

  /**
   * Count the tracks a library playlist stores, paginating 100 per page.
   * Apple answers 404 for an empty playlist. Follows `next` only to Apple's
   * origin, because the request carries both tokens. Bounded: each page has a
   * timeout, and the whole read-back (pages and retries) stops at `budgetMs`.
   */
  async getPlaylistTrackCount(
    playlistId: string,
    token: string,
    budgetMs: number = DEFAULT_READBACK_BUDGET_MS
  ): Promise<number> {
    const deadline = Date.now() + budgetMs;
    let count = 0;
    let url: string | null =
      `${APPLE_MUSIC_API_BASE_URL}/me/library/playlists/${playlistId}/tracks?limit=${PLAYLIST_TRACKS_PAGE_LIMIT}`;

    while (url) {
      const requestUrl: string = url.startsWith('http') ? url : `${APPLE_MUSIC_API_ORIGIN}${url}`;
      if (new URL(requestUrl).origin !== APPLE_MUSIC_API_ORIGIN) {
        throw new Error('Refusing to follow non-Apple pagination URL');
      }

      if (Date.now() >= deadline) {
        throw new Error(`Read-back exceeded its ${budgetMs}ms budget`);
      }

      let data: any;
      try {
        const response = await this.withRetry(
          'Read back playlist tracks',
          () =>
            axios.get(requestUrl, {
              headers: this.getHeaders(token),
              timeout: PLAYLIST_READBACK_PAGE_TIMEOUT_MS,
              // Hard stop at the overall deadline, whatever the transport does
              // with `timeout`. An abort is not transient, so it is not retried.
              signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
            }),
          // Retry only while the budget leaves room for the backoff and a request.
          (error) => isTransient(error) && Date.now() + this.retryBaseMs * 2 < deadline
        );
        data = response.data;
      } catch (error) {
        if (httpStatus(error) === 404 && count === 0) return 0;
        throw error;
      }

      count += Array.isArray(data?.data) ? data.data.length : 0;
      url = typeof data?.next === 'string' ? data.next : null;
    }
    return count;
  }

  async getCurrentUser(token: string): Promise<PlatformUser> {
    // Apple Music doesn't have a direct "me" endpoint that returns user profile
    // The user info is typically obtained client-side via MusicKit JS
    // For now, we return a placeholder that will be populated from MusicKit
    // The actual user info should be passed from the client

    // Try to get the storefront (which can indicate user location)
    try {
      const response = await axios.get(`${APPLE_MUSIC_API_BASE_URL}/me/storefront`, {
        headers: this.getHeaders(token),
      });

      const storefront = response.data.data?.[0];

      return {
        id: storefront?.id || 'apple-music-user',
        displayName: 'Apple Music User', // Apple doesn't expose user display name
        platform: 'apple-music',
      };
    } catch (error) {
      // If we can't get storefront, return a basic user object
      return {
        id: 'apple-music-user',
        displayName: 'Apple Music User',
        platform: 'apple-music',
      };
    }
  }

  // Apple Music doesn't support custom playlist artwork upload via API
  // This method is intentionally not implemented
}

// Export a singleton instance
export const appleMusicPlatform = new AppleMusicPlatformService();
