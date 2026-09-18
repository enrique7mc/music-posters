import type { Artist } from '@/types';
import { MAX_ARTISTS_PER_SEARCH, MAX_ARTIST_NAME_LENGTH } from './constants';

export { MAX_ARTIST_NAME_LENGTH } from './constants';

// ============================================================================
// Manually entered artist lineups (browser-safe, pure)
// ============================================================================

/**
 * Maximum length of a single artist name.
 * Mirrors the server-side limit in `src/lib/validation.ts` (artistSchema),
 * which remains authoritative for API requests.
 */
/**
 * Maximum size of the raw artist textarea input, in characters.
 * 150 artists x 100 characters + ~150 line separators ≈ 15,200 characters,
 * so 20,000 comfortably bounds every legal lineup. Inputs beyond this size
 * are rejected with a visible error (never silently truncated).
 */
export const MAX_ARTIST_TEXT_LENGTH = 20_000;

/**
 * Default track count for each manually entered artist on the review screen.
 * Five is the expected common case for a typed lineup; users can change it
 * per artist (10 is available for more). This default only applies to text
 * input — poster defaults and the backend's three-track fallback for
 * unranked artists are unchanged.
 */
export const DEFAULT_TEXT_ARTIST_TRACK_COUNT = 5;

export type ArtistTextErrorCode = 'input-too-long' | 'empty' | 'too-many-artists';

export interface ArtistTextParseResult {
  /**
   * Unique, valid artists in input order. Only `name` is populated —
   * tier, weight, and reasoning are deliberately left unset because they
   * describe image analysis, not manual entry.
   */
  artists: Artist[];
  /** Later spellings dropped as case-insensitive duplicates of an earlier line. */
  duplicates: string[];
  /** Non-blank lines longer than MAX_ARTIST_NAME_LENGTH — reported, never truncated or included. */
  invalidNames: string[];
  /** Non-null when the input cannot be submitted. */
  errorCode: ArtistTextErrorCode | null;
}

/**
 * Parse a manually entered artist lineup: one artist per line.
 *
 * Rules:
 * - Names are trimmed; blank lines are skipped; input order is preserved.
 * - Names are never split on commas, ampersands, slashes, or "and" —
 *   "Simon & Garfunkel" and "AC/DC" stay single artists.
 * - Case-insensitive exact duplicates are removed, keeping the first spelling.
 * - Names longer than MAX_ARTIST_NAME_LENGTH are reported in `invalidNames`
 *   (not silently truncated or dropped) and excluded from `artists`.
 * - 1–150 unique artists are required.
 *
 * Pure and dependency-free (safe to import in the browser). The server-side
 * Zod schemas in `src/lib/validation.ts` remain authoritative for requests.
 */
export function parseArtistText(raw: string): ArtistTextParseResult {
  const artists: Artist[] = [];
  const duplicates: string[] = [];
  const invalidNames: string[] = [];
  const seen = new Set<string>();

  if (raw.length > MAX_ARTIST_TEXT_LENGTH) {
    return { artists, duplicates, invalidNames, errorCode: 'input-too-long' };
  }

  // Split on newlines only (\r from Windows line endings is removed by trim).
  for (const line of raw.split('\n')) {
    const name = line.trim();
    if (!name) continue;

    if (name.length > MAX_ARTIST_NAME_LENGTH) {
      invalidNames.push(name);
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(name);
      continue;
    }
    seen.add(key);
    artists.push({ name });
  }

  let errorCode: ArtistTextErrorCode | null = null;
  if (artists.length === 0) {
    errorCode = 'empty';
  } else if (artists.length > MAX_ARTISTS_PER_SEARCH) {
    errorCode = 'too-many-artists';
  }

  return { artists, duplicates, invalidNames, errorCode };
}
