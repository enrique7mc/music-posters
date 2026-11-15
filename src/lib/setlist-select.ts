/**
 * Typical Set selection: pure functions that turn raw Setlist.fm search
 * results into the songs an On Tour artist plays at most recent shows.
 *
 * Terms (see GLOSSARY.md):
 *  - Qualifying Setlist: a past show with at least MIN_QUALIFYING_SONGS
 *    performed songs. Promo, TV and short festival slots do not qualify.
 *  - On Tour: the newest Qualifying Setlist is at most ON_TOUR_DAYS old.
 *  - Typical Set: the songs played at ≥ 50% of the sampled shows, in their
 *    median position.
 *
 * No I/O here, so every rule is unit-testable with fixtures.
 */

import { normalize } from '@/lib/artist-match';

export const MIN_QUALIFYING_SONGS = 8;
export const ON_TOUR_DAYS = 180;
export const SAMPLE_WINDOW_DAYS = 90;
export const MAX_SAMPLE_SETLISTS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Setlist.fm API shapes (subset; ported from concert-history/src/types/setlistfm.ts)
// ---------------------------------------------------------------------------

export interface SetlistFmArtistRef {
  mbid?: string;
  name: string;
  url?: string;
}

export interface SetlistFmSong {
  name?: string;
  tape?: boolean;
  cover?: SetlistFmArtistRef;
  with?: SetlistFmArtistRef;
  info?: string;
}

export interface SetlistFmSet {
  name?: string;
  encore?: number;
  song?: SetlistFmSong[];
}

export interface SetlistFmSetlist {
  id: string;
  eventDate: string; // dd-MM-yyyy
  artist: SetlistFmArtistRef;
  venue?: {
    name?: string;
    city?: { name?: string; country?: { code?: string; name?: string } };
  };
  tour?: { name?: string };
  sets?: { set?: SetlistFmSet[] };
  url: string;
}

export interface SetlistFmSearchResponse {
  type?: string;
  itemsPerPage?: number;
  page?: number;
  total?: number;
  setlist?: SetlistFmSetlist[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface TypicalSetSong {
  title: string;
  isCover: boolean;
  coverOf?: string;
}

export interface TypicalSetShow {
  date: string; // ISO yyyy-MM-dd
  venue: string;
  city: string;
  tour?: string;
  url: string; // setlist.fm attribution link
}

export interface TypicalSet {
  songs: TypicalSetSong[];
  sampleSize: number;
  latest: TypicalSetShow;
}

export type SelectionFallbackReason = 'no-match' | 'not-on-tour';

export type TypicalSetSelection =
  | { kind: 'typical'; typicalSet: TypicalSet; mbid: string }
  | { kind: 'fallback'; reason: SelectionFallbackReason };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a Setlist.fm `dd-MM-yyyy` date as a UTC day. Null when malformed. */
export function parseEventDate(value: string | undefined): Date | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value ?? '');
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject rollovers such as 31-02-2026.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;
  return date;
}

function startOfUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Performed songs of a setlist, in show order across all sets. Tape entries
 * (intros, interludes, walk-on music) and empty names are excluded.
 */
export function performedSongs(setlist: SetlistFmSetlist): SetlistFmSong[] {
  const sets = setlist.sets?.set ?? [];
  return sets
    .flatMap((set) => set.song ?? [])
    .filter((song) => !song.tape && typeof song.name === 'string' && song.name.trim().length > 0);
}

/** A past show (on or before today, UTC) with enough performed songs to be a real set. */
export function isQualifying(setlist: SetlistFmSetlist, now: Date): boolean {
  const date = parseEventDate(setlist.eventDate);
  if (!date || date.getTime() > startOfUtcDay(now)) return false;
  return performedSongs(setlist).length >= MIN_QUALIFYING_SONGS;
}

/** Key for grouping one song across setlists. */
export function songKey(title: string): string {
  return normalize(title) || title.trim().toLowerCase();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function byDateDesc(a: SetlistFmSetlist, b: SetlistFmSetlist): number {
  const da = parseEventDate(a.eventDate)?.getTime() ?? 0;
  const db = parseEventDate(b.eventDate)?.getTime() ?? 0;
  return db - da;
}

/**
 * Choose the artist entry (MBID) to use when Setlist.fm has more than one
 * artist with the requested name. The MBID with the most Qualifying Setlists
 * in the last ON_TOUR_DAYS wins; the total entry count breaks a tie. This
 * keeps a famous dormant band from winning over an active same-name band.
 */
export function chooseMbid(entries: SetlistFmSetlist[], now: Date): string | null {
  const cutoff = startOfUtcDay(now) - ON_TOUR_DAYS * DAY_MS;
  const stats = new Map<string, { recent: number; total: number }>();
  for (const entry of entries) {
    const mbid = entry.artist.mbid ?? '';
    const stat = stats.get(mbid) ?? { recent: 0, total: 0 };
    stat.total++;
    const date = parseEventDate(entry.eventDate);
    if (date && date.getTime() >= cutoff && isQualifying(entry, now)) stat.recent++;
    stats.set(mbid, stat);
  }
  let best: { mbid: string; recent: number; total: number } | null = null;
  for (const [mbid, stat] of stats) {
    if (
      !best ||
      stat.recent > best.recent ||
      (stat.recent === best.recent && stat.total > best.total)
    ) {
      best = { mbid, ...stat };
    }
  }
  return best ? best.mbid : null;
}

// ---------------------------------------------------------------------------
// Typical Set
// ---------------------------------------------------------------------------

/**
 * Build the Typical Set from search entries that already match the requested
 * artist name. Returns a fallback when there are no entries (`no-match`) or
 * the chosen artist has no recent Qualifying Setlist (`not-on-tour`).
 */
export function selectTypicalSet(entries: SetlistFmSetlist[], now: Date): TypicalSetSelection {
  if (entries.length === 0) return { kind: 'fallback', reason: 'no-match' };

  const mbid = chooseMbid(entries, now);
  const qualifying = entries
    .filter((entry) => (entry.artist.mbid ?? '') === mbid)
    .filter((entry) => isQualifying(entry, now))
    .sort(byDateDesc);

  const newest = qualifying[0];
  const newestTime = newest ? parseEventDate(newest.eventDate)!.getTime() : 0;
  if (!newest || newestTime < startOfUtcDay(now) - ON_TOUR_DAYS * DAY_MS) {
    return { kind: 'fallback', reason: 'not-on-tour' };
  }

  const sample = qualifying
    .filter(
      (entry) =>
        parseEventDate(entry.eventDate)!.getTime() >= newestTime - SAMPLE_WINDOW_DAYS * DAY_MS
    )
    .slice(0, MAX_SAMPLE_SETLISTS);

  // Aggregate by normalized title. A song played twice in one show counts once,
  // at its first position. Positions are relative (0..1) so a long and a short
  // set of the same tour compare fairly.
  const songs = new Map<
    string,
    { song: TypicalSetSong; shows: number; positions: number[]; firstSeen: number }
  >();
  let seenOrder = 0;
  sample.forEach((setlist) => {
    const performed = performedSongs(setlist);
    const seenInShow = new Set<string>();
    performed.forEach((song, index) => {
      const title = song.name!.trim();
      const key = songKey(title);
      if (seenInShow.has(key)) return;
      seenInShow.add(key);
      const position = performed.length > 1 ? index / (performed.length - 1) : 0;
      const existing = songs.get(key);
      if (existing) {
        existing.shows++;
        existing.positions.push(position);
        return;
      }
      songs.set(key, {
        song: {
          title,
          isCover: Boolean(song.cover),
          ...(song.cover?.name ? { coverOf: song.cover.name } : {}),
        },
        shows: 1,
        positions: [position],
        firstSeen: seenOrder++,
      });
    });
  });

  const minShows = sample.length === 1 ? 1 : sample.length / 2;
  const typical = [...songs.values()]
    .filter((entry) => entry.shows >= minShows)
    .sort((a, b) => median(a.positions) - median(b.positions) || a.firstSeen - b.firstSeen)
    .map((entry) => entry.song);

  const date = parseEventDate(newest.eventDate)!;
  return {
    kind: 'typical',
    mbid: mbid ?? '',
    typicalSet: {
      songs: typical,
      sampleSize: sample.length,
      latest: {
        date: date.toISOString().slice(0, 10),
        venue: newest.venue?.name ?? '',
        city: newest.venue?.city?.name ?? '',
        ...(newest.tour?.name ? { tour: newest.tour.name } : {}),
        url: newest.url,
      },
    },
  };
}
