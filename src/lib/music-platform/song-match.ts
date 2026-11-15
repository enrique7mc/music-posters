/**
 * Matching a setlist song title (and its artist) to a catalog track.
 * Used by "Prefer tour setlists" for both the free top-song pool match and
 * the per-song catalog search.
 */

import { similarity, containsName } from '@/lib/artist-match';

/** Minimum similarity for a title, and for an artist credit, to match. */
export const SONG_MATCH_THRESHOLD = 0.85;

/**
 * Strip version tags that differ between a setlist title and a catalog title:
 * "(Live …)", "[Live …]", "- Live …", "- Remastered …", "(Remastered …)",
 * "(feat. …)", "feat. …".
 */
export function cleanSongTitle(title: string): string {
  return title
    .replace(/\s*[([](?:live|remaster(?:ed)?|\d{4} remaster(?:ed)?)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:live|remaster(?:ed)?|\d{4} remaster(?:ed)?)\b.*$/i, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, '')
    .trim();
}

/** Similarity of two song titles after cleaning (see cleanSongTitle). */
export function titleSimilarity(a: string, b: string): number {
  return similarity(cleanSongTitle(a), cleanSongTitle(b));
}

/** True when two song titles name the same song after cleaning. */
export function titlesMatch(a: string, b: string): boolean {
  return titleSimilarity(a, b) >= SONG_MATCH_THRESHOLD;
}

/**
 * True when a catalog credit ("Turnstile", "Charli xcx & Billie Eilish",
 * "Fontaines D.C., Other") names the artist.
 */
export function artistCredited(credit: string, artistName: string): boolean {
  if (similarity(credit, artistName) >= SONG_MATCH_THRESHOLD) return true;
  if (containsName(credit, artistName)) return true;
  return credit
    .split(/\s*(?:,|&|\band\b|\bx\b|\bfeat\.?|\bwith\b)\s*/i)
    .some((part) => part.trim() && similarity(part, artistName) >= SONG_MATCH_THRESHOLD);
}

/** True when a catalog track or album looks like a live recording. */
export function isLiveRecording(trackName: string, albumName: string): boolean {
  return /[([-]\s*live\b/i.test(trackName) || /\blive\b/i.test(albumName);
}
