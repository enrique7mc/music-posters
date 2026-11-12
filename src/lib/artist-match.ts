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

/**
 * Leading words that do not make a name distinctive. "Los Lobos" is one
 * distinctive word, as weak a signal as "Lobos" alone.
 */
const LEADING_PARTICLES = new Set([
  'the', 'a', 'an', 'los', 'las', 'la', 'el', 'lo', 'les', 'le', 'il',
  'die', 'der', 'das', 'dj', 'mc', 'lil',
]); // prettier-ignore

/**
 * Words that mark a catalog page as derived from the artist, not the artist:
 * tributes, karaoke, covers, live or hits compilations, "& Friends" projects.
 * Such pages often list more albums than the real artist.
 */
const DERIVATIVE_MARKERS = new Set([
  'tribute', 'tributo', 'homenaje', 'karaoke', 'cover', 'covers', 'style',
  'live', 'vivo', 'friends', 'amigos', 'hits', 'exitos', 'greatest',
  'unplugged', 'acoustic', 'acustico', 'symphonic', 'sinfonico',
]); // prettier-ignore

/** Words of a normalized name after its leading particles. */
function distinctiveWords(normalized: string): string[] {
  const words = normalized.split(' ').filter(Boolean);
  let i = 0;
  while (i < words.length && LEADING_PARTICLES.has(words[i])) i++;
  return words.slice(i);
}

/** Number of words in a normalized name after its leading particles. */
function distinctiveWordCount(normalized: string): number {
  return distinctiveWords(normalized).length;
}

/** Minimum similarity for two different words to count as one word with a typo. */
const WORD_MATCH_THRESHOLD = 0.5;

/**
 * True when `short` abbreviates `long`: same first letter, and the letters of
 * `short` appear in order in `long`. Examples: "sr" → "senor", "dr" → "doctor",
 * "st" → "saint".
 */
function isAbbreviation(short: string, long: string): boolean {
  if (short.length >= long.length || short[0] !== long[0]) return false;
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

/**
 * Words that mean the same in artist names but share no spelling: "and" in
 * its short and Spanish forms ("Guns N' Roses", "Jesse y Joy"), and numbers
 * as digits or as English or Spanish words ("Maroon Five", "Calle Trece").
 */
const WORD_ALIASES: Record<string, string> = Object.fromEntries([
  ['n', 'and'], ['y', 'and'],
  ...[
    ['zero', 'cero'], ['one', 'uno'], ['two', 'dos'], ['three', 'tres'], ['four', 'cuatro'],
    ['five', 'cinco'], ['six', 'seis'], ['seven', 'siete'], ['eight', 'ocho'], ['nine', 'nueve'],
    ['ten', 'diez'], ['eleven', 'once'], ['twelve', 'doce'], ['thirteen', 'trece'],
    ['fourteen', 'catorce'], ['fifteen', 'quince'], ['sixteen', 'dieciseis'],
    ['seventeen', 'diecisiete'], ['eighteen', 'dieciocho'], ['nineteen', 'diecinueve'],
    ['twenty', 'veinte'],
  ].flatMap((words, digit) => words.map((w) => [w, String(digit)])),
]); // prettier-ignore

/** True when two normalized words can be the same word: equal, an alias, a typo, or an abbreviation. */
function wordsCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if ((WORD_ALIASES[a] ?? a) === (WORD_ALIASES[b] ?? b)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (isAbbreviation(short, long)) return true;
  return (long.length - levenshteinDistance(long, short)) / long.length >= WORD_MATCH_THRESHOLD;
}

/**
 * True when the two names differ by a whole word: each name has a distinctive
 * word that matches no word of the other name. Example: "LTD Rock" and "Kid
 * Rock" ("ltd" vs "kid"). Character similarity cannot see this on short names:
 * the pair scores 75%.
 *
 * Both sides need an unmatched word. A word that is only added or dropped
 * ("The Skatalites", "Maldita Vecindad y Los Hijos del Quinto Patio") is not a
 * conflict. Typos ("Tacvba" vs "Tacuba"), abbreviations ("Sr." vs "Señor") and
 * aliases ("N" vs "and", "5" vs "five"; see WORD_ALIASES) are not conflicts.
 */
export function hasWordConflict(a: string, b: string): boolean {
  const x = distinctiveWords(normalize(a));
  const y = distinctiveWords(normalize(b));
  const unmatched = (words: string[], other: string[]) =>
    words.some((w) => !other.some((o) => wordsCompatible(w, o)));
  return unmatched(x, y) && unmatched(y, x);
}

/**
 * True when `name` appears as a whole-word phrase inside `candidate` after
 * normalization, e.g. "Maldita Vecindad" in "Maldita Vecindad y Los Hijos del
 * Quinto Patio". Poster names are often shortened forms of the catalog name.
 * The name needs at least 2 distinctive words (leading articles and prefixes
 * such as "The", "Los" or "DJ" do not count): a single word ("Porter", "Los
 * Lobos") also appears inside many unrelated names, so it is too weak a signal.
 */
export function containsName(candidate: string, name: string): boolean {
  const n = normalize(name);
  if (distinctiveWordCount(n) < 2) return false;
  return ` ${normalize(candidate)} `.includes(` ${n} `);
}

/**
 * True when `candidate` contains `name` (see containsName) and its other words
 * mark it as a derived page, e.g. "Café Tacvba Tribute Band" or "Los Fabulosos
 * Cadillacs en Vivo".
 */
export function isDerivativeName(candidate: string, name: string): boolean {
  if (!containsName(candidate, name)) return false;
  const n = normalize(name);
  const rest = ` ${normalize(candidate)} `.replace(` ${n} `, ' ').trim();
  return rest.split(' ').some((word) => DERIVATIVE_MARKERS.has(word));
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
