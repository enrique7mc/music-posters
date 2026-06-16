/**
 * Shared artist-name matching primitives.
 *
 * Two call-sites share these FUNCTIONS but keep their own THRESHOLDS, because
 * the cost of a wrong match differs:
 *  - apple-music-platform.searchArtist — catalog search, recall-oriented (0.6).
 *    A near miss just picks a slightly-off catalog entry.
 *  - personalize.ts loved-overlap — conservative (0.85). A false "loved" tells
 *    the user we recognized an artist they don't actually listen to, which
 *    breaks trust, so the bar is higher.
 *
 * The normalization + similarity here was validated by a throwaway latency
 * spike: 12/14 zero false-positives at the 0.85 loved-overlap threshold on a
 * real Apple Music library.
 */

/** Default threshold for loved-overlap matching (conservative — see file header). */
export const LOVED_MATCH_THRESHOLD = 0.85;

/** Default threshold for catalog search matching (recall-oriented). */
export const CATALOG_MATCH_THRESHOLD = 0.6;

/**
 * Normalize an artist name for comparison: lowercase, strip accents, unify
 * ampersands, drop "feat." tails and punctuation, collapse whitespace.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accent marks
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\bfeat\.?\b.*$/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein edit distance between two strings (operates on the strings as
 * given — callers normalize first via `similarity`).
 */
function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Similarity score in [0, 1] between two artist names. Normalizes both sides
 * first, then computes 1 - (editDistance / longerLength). 1.0 = identical.
 */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  // A name that normalizes to "" (e.g. "&", "feat.", emoji-only) must NOT score
  // 1.0 against another empty-normalizing name — that would be a false "loved".
  if (x.length === 0 || y.length === 0) return 0;
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
}

/** A lineup artist matched to a name in the user's loved set. */
export interface LineupMatch {
  poster: string; // lineup name as submitted
  matched: string; // loved-set name it matched
  similarity: number;
}

export interface MatchLineupResult {
  loved: LineupMatch[]; // lineup artists found in the loved set
  unknown: string[]; // lineup artists not in the loved set (gem candidates)
}

/**
 * Partition a poster lineup into artists the user already loves and artists
 * they don't. For each lineup name, finds the best match in `lovedNames`; if
 * it clears `threshold`, it's loved, otherwise unknown.
 *
 * @param lineup - artist names extracted from the poster
 * @param lovedNames - names from the user's library/loved set
 * @param threshold - min similarity to count as loved (default 0.85)
 */
export function matchLineup(
  lineup: string[],
  lovedNames: string[],
  threshold: number = LOVED_MATCH_THRESHOLD
): MatchLineupResult {
  const loved: LineupMatch[] = [];
  const unknown: string[] = [];

  for (const name of lineup) {
    let best = { matched: '', sim: 0 };
    for (const lovedName of lovedNames) {
      const sim = similarity(name, lovedName);
      if (sim > best.sim) best = { matched: lovedName, sim };
    }
    if (best.sim >= threshold) {
      loved.push({ poster: name, matched: best.matched, similarity: best.sim });
    } else {
      unknown.push(name);
    }
  }

  return { loved, unknown };
}
