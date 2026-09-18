/**
 * Maximum number of artists allowed per search request.
 * Limits API calls to prevent rate limiting and excessive processing time.
 */
export const MAX_ARTISTS_PER_SEARCH = 150;

/** Shared client/server limit for a single artist name. */
export const MAX_ARTIST_NAME_LENGTH = 100;

/**
 * Smallest number of tracks a user may request per artist.
 * Shared by client inputs, API validation, and service-level defensive clamping.
 */
export const MIN_TRACKS_PER_ARTIST = 1;

/**
 * Largest number of tracks a user may request per artist.
 * Matches the pool size Apple Music's top-songs view endpoint returns in a
 * single request (limit: 25), so any value in range is served without extra
 * API calls or rate-limit changes. Shared by client inputs, API validation,
 * and service-level defensive clamping.
 */
export const MAX_TRACKS_PER_ARTIST = 25;
