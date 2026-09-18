/**
 * Maximum number of artists allowed per search request.
 * Limits API calls to prevent rate limiting and excessive processing time.
 */
export const MAX_ARTISTS_PER_SEARCH = 150;

/** Shared client/server limit for a single artist name. */
export const MAX_ARTIST_NAME_LENGTH = 100;
