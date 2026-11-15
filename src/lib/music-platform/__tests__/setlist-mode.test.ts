import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchAndGetTopTracks } from '../index';
import { MusicPlatformService } from '../types';
import { Track } from '@/types';
import { getTypicalSetlist, TypicalSetlistLookup } from '@/lib/setlistfm';
import type { TypicalSetSong } from '@/lib/setlist-select';

vi.mock('@/lib/setlistfm', () => ({ getTypicalSetlist: vi.fn() }));

const LATEST = {
  date: '2026-11-13',
  venue: 'Zénith',
  city: 'Paris',
  url: 'https://www.setlist.fm/setlist/turnstile/x.html',
};

function track(id: string, name: string, artist = 'Turnstile'): Track {
  return {
    id,
    name,
    artist,
    artistId: 'id-Turnstile',
    album: 'Album',
    albumArtwork: null,
    duration: 1000,
    previewUrl: null,
    platformUrl: `https://music.apple.com/song/${id}`,
    platform: 'apple-music',
  };
}

function typical(songs: Array<string | TypicalSetSong>): TypicalSetlistLookup {
  return {
    result: {
      kind: 'typical',
      typicalSet: {
        songs: songs.map((s) => (typeof s === 'string' ? { title: s, isCover: false } : s)),
        sampleSize: 3,
        latest: LATEST,
      },
    },
    calls: 1,
    cacheHit: false,
  };
}

const POOL = ['Mystery', 'Holiday', 'Blackout', 'Never Enough', 'T.L.C.', 'Real Thing'].map(
  (name, i) => track(`p${i}`, name)
);

/** A setlist-capable stub. `catalog` maps a searched title to a track (or null). */
function stubPlatform(catalog: Record<string, Track | null> = {}) {
  const searchArtistSong = vi.fn(async (_artist: string, title: string) => catalog[title] ?? null);
  // Regular-mode tracks get ids of their own, so they never collide with POOL.
  const getArtistTopTracks = vi.fn(async (id: string, _t: string, limit = 1) =>
    POOL.slice(0, limit).map((t) => ({ ...t, id: `${id}:${t.id}`, artistId: id }))
  );
  const platform = {
    platform: 'apple-music',
    setDeveloperToken: vi.fn(),
    searchArtist: async (name: string) => ({
      id: `id-${name}`,
      name,
      matched: true,
      similarity: 1,
    }),
    getArtistTopTracks,
    getTopSongPool: vi.fn(async () => POOL),
    searchArtistSong,
  } as unknown as MusicPlatformService;
  return { platform, searchArtistSong, getArtistTopTracks };
}

const run = (platform: MusicPlatformService, opts: Record<string, unknown> = {}) =>
  searchAndGetTopTracks(
    platform,
    [{ name: 'Turnstile', tier: 'headliner' }, { name: 'Other' }],
    'tok',
    {
      mode: 'tier-based',
      setlistArtistNames: ['Turnstile'],
      ...opts,
    }
  );

describe('searchAndGetTopTracks with tour setlists', () => {
  beforeEach(() => {
    vi.mocked(getTypicalSetlist).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(console.log).mockClear();
  });

  it('resolves pool hits in setlist order without searching', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical(['Never Enough', 'Mystery', 'Blackout', 'Holiday', 'T.L.C.', 'Real Thing'])
    );
    const { platform, searchArtistSong } = stubPlatform();

    const { tracks, setlistArtists } = await run(platform, { mode: 'custom', customCount: 3 });

    const turnstile = tracks.filter((t) => t.artistId === 'id-Turnstile');
    expect(turnstile.map((t) => t.name)).toEqual([
      'Never Enough',
      'Mystery',
      'Blackout',
      'Holiday',
      'T.L.C.',
      'Real Thing',
    ]);
    expect(turnstile.every((t) => t.source === 'setlist')).toBe(true);
    expect(searchArtistSong).not.toHaveBeenCalled();
    expect(setlistArtists).toEqual([
      {
        artist: 'Turnstile',
        latestDate: '2026-11-13',
        venue: 'Zénith',
        city: 'Paris',
        url: LATEST.url,
        setSize: 6,
        resolved: 6,
      },
    ]);
  });

  it('searches titles missing from the pool', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery', 'Endless']));
    const { platform, searchArtistSong } = stubPlatform({ Endless: track('s1', 'ENDLESS') });

    const { tracks } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(searchArtistSong).toHaveBeenCalledWith('Turnstile', 'Endless');
    expect(tracks.filter((t) => t.source === 'setlist').map((t) => t.id)).toEqual(['p0', 's1']);
  });

  it('counts a title whose search finds nothing as unresolved', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical(['Mystery', 'Holiday', 'Blackout', 'Unreleased'])
    );
    const { platform } = stubPlatform({ Unreleased: null });

    const { setlistArtists } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(setlistArtists[0]).toMatchObject({ setSize: 4, resolved: 3 });
  });

  it('tops up a short set to the tier count with the regular mode', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery', 'Holiday']));
    const { platform } = stubPlatform();

    const { tracks } = await run(platform, {
      mode: 'custom-per-tier',
      tierCounts: { headliner: 5, 'sub-headliner': 1, 'mid-tier': 1, undercard: 1 },
    });

    const own = tracks.filter((t) => t.artistId === 'id-Turnstile');
    expect(own).toHaveLength(5);
    expect(own.slice(0, 2).map((t) => t.name)).toEqual(['Mystery', 'Holiday']);
    expect(own.slice(2).every((t) => t.source === undefined)).toBe(true);
  });

  it('tops up to a per-artist count', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery']));
    const { platform } = stubPlatform();

    const { tracks } = await run(platform, {
      mode: 'per-artist',
      perArtistCounts: { Turnstile: 4, Other: 1 },
    });

    expect(tracks.filter((t) => t.artistId === 'id-Turnstile')).toHaveLength(4);
  });

  it('falls back when fewer than 50% of the set resolves', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery', 'X1', 'X2']));
    const { platform, getArtistTopTracks } = stubPlatform();

    const { setlistArtists, setlistFallbacks, tracks } = await run(platform, {
      mode: 'custom',
      customCount: 2,
    });

    expect(setlistArtists).toEqual([]);
    expect(setlistFallbacks).toEqual([
      { artist: 'Turnstile', reason: 'low-resolution', mode: 'popular' },
    ]);
    expect(getArtistTopTracks).toHaveBeenCalledWith('id-Turnstile', 'tok', 2, 'popular');
    expect(tracks.some((t) => t.source === 'setlist')).toBe(false);
  });

  it('keeps a cover the artist released and drops one only the original artist released', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical([
        'Mystery',
        { title: 'Own Cover', isCover: true, coverOf: 'Someone' },
        { title: 'Their Cover', isCover: true, coverOf: 'Green Day' },
      ])
    );
    const { platform } = stubPlatform({
      'Own Cover': track('c1', 'Own Cover'),
      'Their Cover': null, // the resolver never returns the original artist's track
    });

    const { setlistArtists, tracks } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(tracks.map((t) => t.id)).toContain('c1');
    // The dropped cover is not a failure and is not in the denominator.
    expect(setlistArtists[0]).toMatchObject({ setSize: 2, resolved: 2 });
  });

  it('does not count dropped covers against the 50% threshold', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical([
        'Mystery',
        { title: 'C1', isCover: true },
        { title: 'C2', isCover: true },
        { title: 'C3', isCover: true },
      ])
    );
    const { platform } = stubPlatform();

    const { setlistArtists } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(setlistArtists[0]).toMatchObject({ setSize: 1, resolved: 1 });
  });

  it('leaves artists outside setlistArtistNames unchanged', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery']));
    const { platform, getArtistTopTracks } = stubPlatform();

    await run(platform, { mode: 'custom', customCount: 2 });

    expect(getTypicalSetlist).toHaveBeenCalledTimes(1);
    expect(getTypicalSetlist).toHaveBeenCalledWith('Turnstile');
    expect(getArtistTopTracks).toHaveBeenCalledWith('id-Other', 'tok', 2, 'popular');
  });

  it('does not call Setlist.fm when the toggle is off', async () => {
    const { platform } = stubPlatform();
    const result = await run(platform, { setlistArtistNames: [] });
    expect(getTypicalSetlist).not.toHaveBeenCalled();
    expect(result.setlistFallbacks).toEqual([]);
  });

  it('records a Setlist Fallback with its reason and uses the regular mode', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue({
      result: { kind: 'fallback', reason: 'not-on-tour' },
      calls: 1,
      cacheHit: false,
    });
    const { platform, getArtistTopTracks } = stubPlatform();

    const { setlistFallbacks } = await run(platform, { selectionMode: 'deep-cuts' });

    expect(setlistFallbacks).toEqual([
      { artist: 'Turnstile', reason: 'not-on-tour', mode: 'deep-cuts' },
    ]);
    expect(getArtistTopTracks).toHaveBeenCalledWith('id-Turnstile', 'tok', 10, 'deep-cuts');
  });

  it('falls back on a platform without pool/song search (Spotify)', async () => {
    const getArtistTopTracks = vi.fn(async () => [track('sp1', 'Song')]);
    const spotify = {
      platform: 'spotify',
      searchArtist: async (name: string) => ({ id: name, name, matched: true, similarity: 1 }),
      getArtistTopTracks,
    } as unknown as MusicPlatformService;

    const { setlistFallbacks } = await run(spotify);

    expect(getTypicalSetlist).not.toHaveBeenCalled();
    expect(setlistFallbacks).toEqual([
      { artist: 'Turnstile', reason: 'unsupported-platform', mode: 'popular' },
    ]);
  });

  it('logs one line per in-scope artist with the unresolved titles', async () => {
    const log = vi.mocked(console.log);
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical(['Mystery', 'Holiday', 'Blackout', 'Gone'])
    );
    const { platform } = stubPlatform();

    await run(platform, { mode: 'custom', customCount: 1 });

    const lines = log.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('[setlist] Turnstile'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('3/4 resolved (pool 3, search 0)');
    expect(lines[0]).toContain('unresolved: "Gone"');
    expect(lines[0]).toContain('2026-11-13 Paris');
  });

  // Regression (sol S1): the first fuzzy pool match used to win over an exact
  // match later in the pool, so two setlist songs collapsed into one track.
  it('gives each setlist song its closest unused pool track', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(
      typical(['Another Brick in the Wall, Pt. 1', 'Another Brick in the Wall, Pt. 2'])
    );
    const pool = [
      track('pt2', 'Another Brick in the Wall, Pt. 2'),
      track('pt1', 'Another Brick in the Wall, Pt. 1'),
    ];
    const { platform } = stubPlatform();
    vi.mocked(platform.getTopSongPool!).mockResolvedValue(pool);

    const { tracks, setlistArtists } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(tracks.filter((t) => t.source === 'setlist').map((t) => t.id)).toEqual(['pt1', 'pt2']);
    expect(setlistArtists[0]).toMatchObject({ setSize: 2, resolved: 2 });
  });

  it('does not count a search hit that another setlist song already took', async () => {
    vi.mocked(getTypicalSetlist).mockResolvedValue(typical(['Mystery', 'Mystery (Reprise)']));
    const { platform } = stubPlatform({ 'Mystery (Reprise)': POOL[0] });

    const { setlistArtists } = await run(platform, { mode: 'custom', customCount: 1 });

    expect(setlistArtists[0]).toMatchObject({ setSize: 2, resolved: 1 });
  });
});
