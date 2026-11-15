import { describe, it, expect } from 'vitest';
import {
  SetlistFmSetlist,
  SetlistFmSong,
  chooseMbid,
  isQualifying,
  parseEventDate,
  performedSongs,
  selectTypicalSet,
} from '../setlist-select';

const NOW = new Date(Date.UTC(2026, 10, 15)); // 15 Nov 2026

let nextId = 1;

/** dd-MM-yyyy for a day `daysAgo` before NOW (negative = future). */
function daysAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

function songs(...names: string[]): SetlistFmSong[] {
  return names.map((name) => ({ name }));
}

function setlist(
  date: string,
  songList: SetlistFmSong[],
  opts: { mbid?: string; name?: string; city?: string } = {}
): SetlistFmSetlist {
  const id = nextId++;
  return {
    id: `s${id}`,
    eventDate: date,
    artist: { mbid: opts.mbid ?? 'mbid-a', name: opts.name ?? 'Turnstile' },
    venue: { name: `Venue ${id}`, city: { name: opts.city ?? 'Paris' } },
    sets: { set: [{ song: songList }] },
    url: `https://www.setlist.fm/setlist/turnstile/${id}.html`,
  };
}

const FULL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

describe('parseEventDate', () => {
  it('parses dd-MM-yyyy as a UTC day', () => {
    expect(parseEventDate('13-11-2026')?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('rejects malformed and rolled-over dates', () => {
    expect(parseEventDate('2026-11-13')).toBeNull();
    expect(parseEventDate('31-02-2026')).toBeNull();
    expect(parseEventDate(undefined)).toBeNull();
  });
});

describe('Qualifying Setlist', () => {
  it('rejects promo/TV sets shorter than 8 performed songs', () => {
    expect(isQualifying(setlist(daysAgo(3), songs('A', 'B', 'C')), NOW)).toBe(false);
  });

  it('rejects an empty past show', () => {
    expect(isQualifying(setlist(daysAgo(3), []), NOW)).toBe(false);
  });

  it('rejects a future show even with songs', () => {
    expect(isQualifying(setlist(daysAgo(-5), songs(...FULL)), NOW)).toBe(false);
  });

  it('accepts a show from today', () => {
    expect(isQualifying(setlist(daysAgo(0), songs(...FULL)), NOW)).toBe(true);
  });

  it('does not count tape entries or empty names toward the 8-song threshold', () => {
    const list = [
      { name: 'Intro', tape: true },
      ...songs('A', 'B', 'C', 'D', 'E', 'F', 'G'),
      { name: '  ' },
      { name: 'Outro', tape: true },
    ];
    const entry = setlist(daysAgo(3), list);
    expect(performedSongs(entry).map((s) => s.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(isQualifying(entry, NOW)).toBe(false);
  });
});

describe('selectTypicalSet', () => {
  it('builds a Typical Set from a full tour in median order', () => {
    const entries = [
      setlist(daysAgo(1), songs(...FULL)),
      setlist(daysAgo(3), songs('B', 'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J')),
      setlist(daysAgo(5), songs(...FULL)),
    ];
    const result = selectTypicalSet(entries, NOW);
    expect(result.kind).toBe('typical');
    if (result.kind !== 'typical') return;
    expect(result.typicalSet.songs.map((s) => s.title)).toEqual(FULL);
    expect(result.typicalSet.sampleSize).toBe(3);
    expect(result.typicalSet.latest.url).toBe(entries[0].url);
    expect(result.typicalSet.latest.city).toBe('Paris');
  });

  it('keeps only songs played at ≥ 50% of the sampled shows', () => {
    const entries = [
      setlist(daysAgo(1), songs(...FULL, 'Rare')),
      setlist(daysAgo(2), songs(...FULL, 'Half')),
      setlist(daysAgo(3), songs(...FULL)),
      setlist(daysAgo(4), songs(...FULL, 'Half')),
    ];
    const result = selectTypicalSet(entries, NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    const titles = result.typicalSet.songs.map((s) => s.title);
    expect(titles).not.toContain('Rare'); // 1 of 4 shows
    expect(titles).toContain('Half'); // 2 of 4 shows
  });

  it('excludes a 5-song festival set from the sample', () => {
    const entries = [
      setlist(daysAgo(1), songs('X1', 'X2', 'X3', 'X4', 'X5')), // festival slot
      setlist(daysAgo(4), songs(...FULL)),
      setlist(daysAgo(6), songs(...FULL)),
    ];
    const result = selectTypicalSet(entries, NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.sampleSize).toBe(2);
    expect(result.typicalSet.songs.map((s) => s.title)).toEqual(FULL);
    expect(result.typicalSet.latest.url).toBe(entries[1].url);
  });

  it('ignores promo 3-song sets, empty past shows and future shows', () => {
    const entries = [
      setlist(daysAgo(-10), songs(...FULL)), // upcoming
      setlist(daysAgo(1), []), // not entered yet
      setlist(daysAgo(2), songs('A', 'B', 'C')), // TV slot
      setlist(daysAgo(8), songs(...FULL)),
    ];
    const result = selectTypicalSet(entries, NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.sampleSize).toBe(1);
    expect(result.typicalSet.latest.url).toBe(entries[3].url);
  });

  it('uses every song of a single-setlist sample', () => {
    const result = selectTypicalSet([setlist(daysAgo(10), songs(...FULL, 'K'))], NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.songs).toHaveLength(11);
  });

  it('samples at most 5 shows within 90 days of the newest', () => {
    const entries = [
      ...[1, 2, 3, 4, 5, 6].map((d) => setlist(daysAgo(d), songs(...FULL))),
      setlist(daysAgo(150), songs(...FULL)),
    ];
    const result = selectTypicalSet(entries, NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.sampleSize).toBe(5);

    const sparse = [setlist(daysAgo(1), songs(...FULL)), setlist(daysAgo(120), songs(...FULL))];
    const sparseResult = selectTypicalSet(sparse, NOW);
    if (sparseResult.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(sparseResult.typicalSet.sampleSize).toBe(1);
  });

  it('falls back (not-on-tour) for a dormant artist', () => {
    const entries = [setlist('20-06-2007', songs(...FULL), { name: 'Daft Punk' })];
    expect(selectTypicalSet(entries, NOW)).toEqual({ kind: 'fallback', reason: 'not-on-tour' });
  });

  it('falls back (not-on-tour) when only short or empty recent sets exist', () => {
    const entries = [setlist(daysAgo(2), songs('One')), setlist(daysAgo(4), [])];
    expect(selectTypicalSet(entries, NOW)).toEqual({ kind: 'fallback', reason: 'not-on-tour' });
  });

  it('falls back (no-match) with no entries', () => {
    expect(selectTypicalSet([], NOW)).toEqual({ kind: 'fallback', reason: 'no-match' });
  });

  it('excludes tape entries from frequency, positions and output', () => {
    const list = [
      { name: 'Walk-on', tape: true },
      ...songs(...FULL),
      { name: 'Interlude', tape: true },
    ];
    const result = selectTypicalSet([setlist(daysAgo(1), list), setlist(daysAgo(2), list)], NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    const titles = result.typicalSet.songs.map((s) => s.title);
    expect(titles).toEqual(FULL);
  });

  it('marks covers with the original artist', () => {
    const list = [...songs(...FULL), { name: 'Holiday', cover: { name: 'Green Day' } }];
    const result = selectTypicalSet([setlist(daysAgo(1), list)], NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.songs.at(-1)).toEqual({
      title: 'Holiday',
      isCover: true,
      coverOf: 'Green Day',
    });
  });

  it('merges title spellings that normalize equal', () => {
    const a = setlist(daysAgo(1), songs(...FULL, "DON'T PLAY"));
    const b = setlist(daysAgo(2), songs(...FULL, 'Dont Play'));
    const result = selectTypicalSet([a, b], NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.songs.filter((s) => /play/i.test(s.title))).toHaveLength(1);
  });
});

describe('MBID choice', () => {
  it('uses the MBID with more recent Qualifying Setlists (two Turnstile entries)', () => {
    const entries = [
      setlist(daysAgo(1), songs(...FULL), { mbid: 'big' }),
      setlist(daysAgo(3), songs(...FULL), { mbid: 'big' }),
      setlist(daysAgo(2), songs(...FULL.map((s) => `${s}-other`)), { mbid: 'small' }),
    ];
    expect(chooseMbid(entries, NOW)).toBe('big');
    const result = selectTypicalSet(entries, NOW);
    if (result.kind !== 'typical') throw new Error('expected a Typical Set');
    expect(result.typicalSet.songs.map((s) => s.title)).toEqual(FULL);
  });

  it('lets an active band win over a famous dormant band with the same name', () => {
    const dormant = Array.from({ length: 15 }, (_, i) =>
      setlist(`0${(i % 9) + 1}-06-2007`, songs(...FULL), { mbid: 'famous' })
    );
    const active = [setlist(daysAgo(10), songs(...FULL.map((s) => `${s}!`)), { mbid: 'active' })];
    expect(chooseMbid([...dormant, ...active], NOW)).toBe('active');
  });

  it('breaks a tie on recent sets with the total entry count', () => {
    const entries = [
      setlist(daysAgo(300), songs(...FULL), { mbid: 'two' }),
      setlist(daysAgo(400), songs(...FULL), { mbid: 'two' }),
      setlist(daysAgo(500), songs(...FULL), { mbid: 'one' }),
    ];
    expect(chooseMbid(entries, NOW)).toBe('two');
  });
});
