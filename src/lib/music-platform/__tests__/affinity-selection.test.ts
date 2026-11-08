import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { getSelectionModeForArtist, searchAndGetTopTracks } from '../index';
import { Artist, Track, TrackSelectionMode } from '@/types';
import { MusicPlatformService, PlatformAccessError } from '../types';

describe('getSelectionModeForArtist', () => {
  it('maps loved → deep-cuts (they know the hits)', () => {
    expect(getSelectionModeForArtist({ name: 'A', affinity: 'loved' }, 'popular')).toBe(
      'deep-cuts'
    );
  });

  it('maps gem → popular (gateway hit for a discovery)', () => {
    expect(getSelectionModeForArtist({ name: 'A', affinity: 'gem' }, 'deep-cuts')).toBe('popular');
  });

  // MANDATORY REGRESSION: untagged artists must use the user's global mode,
  // exactly as before affinity existed.
  it.each<TrackSelectionMode>(['popular', 'balanced', 'deep-cuts'])(
    'leaves an untagged artist on the global mode (%s)',
    (globalMode) => {
      expect(getSelectionModeForArtist({ name: 'A' }, globalMode)).toBe(globalMode);
    }
  );
});

describe('searchAndGetTopTracks track count limits', () => {
  // Stub platform that records the limit used for each artist id.
  function limitRecordingPlatform(limitByArtist: Record<string, number>): MusicPlatformService {
    return {
      platform: 'apple-music',
      setDeveloperToken: vi.fn(),
      searchArtist: async (name: string) => ({ id: name, name, matched: true, similarity: 1 }),
      getArtistTopTracks: async (
        artistId: string,
        _token: string,
        limit?: number
      ): Promise<Track[]> => {
        limitByArtist[artistId] = limit ?? 0;
        return [];
      },
    } as unknown as MusicPlatformService;
  }

  // MANDATORY REGRESSION (1–25 range): a requested count must reach the
  // platform unreduced — the old 1–10 clamp silently turned 25 into 10.
  it('passes a per-artist count of 25 through instead of reducing it to 10', async () => {
    const limitByArtist: Record<string, number> = {};
    await searchAndGetTopTracks(limitRecordingPlatform(limitByArtist), [{ name: 'A' }], 'token', {
      mode: 'per-artist',
      perArtistCounts: { A: 25 },
    });
    expect(limitByArtist.A).toBe(25);
  });

  it('passes custom-per-tier counts above 10 through', async () => {
    const limitByArtist: Record<string, number> = {};
    await searchAndGetTopTracks(
      limitRecordingPlatform(limitByArtist),
      [
        { name: 'A', tier: 'headliner' },
        { name: 'B', tier: 'undercard' },
      ],
      'token',
      {
        mode: 'custom-per-tier',
        tierCounts: { headliner: 17, 'sub-headliner': 5, 'mid-tier': 3, undercard: 25 },
      }
    );
    expect(limitByArtist).toEqual({ A: 17, B: 25 });
  });

  it('aligns the uniform custom mode with the 1–25 range', async () => {
    const limitByArtist: Record<string, number> = {};
    await searchAndGetTopTracks(limitRecordingPlatform(limitByArtist), [{ name: 'A' }], 'token', {
      mode: 'custom',
      customCount: 25,
    });
    expect(limitByArtist.A).toBe(25);
  });

  it('defensively clamps out-of-range counts to the 1–25 range', async () => {
    const limitByArtist: Record<string, number> = {};
    await searchAndGetTopTracks(
      limitRecordingPlatform(limitByArtist),
      [{ name: 'A' }, { name: 'B' }],
      'token',
      {
        mode: 'per-artist',
        perArtistCounts: { A: 99, B: 0 },
      }
    );
    expect(limitByArtist).toEqual({ A: 25, B: 1 });
  });
});

describe('searchAndGetTopTracks affinity → per-artist mode', () => {
  // Stub platform that records the selectionMode used for each artist id.
  function recordingPlatform(
    modeByArtist: Record<string, TrackSelectionMode>
  ): MusicPlatformService {
    return {
      platform: 'apple-music',
      setDeveloperToken: vi.fn(),
      searchArtist: async (name: string) => ({ id: name, name, matched: true, similarity: 1 }),
      getArtistTopTracks: async (
        artistId: string,
        _token: string,
        _limit?: number,
        selectionMode: TrackSelectionMode = 'popular'
      ): Promise<Track[]> => {
        modeByArtist[artistId] = selectionMode;
        return [{ id: `${artistId}-t`, name: 't', artist: artistId } as unknown as Track];
      },
    } as unknown as MusicPlatformService;
  }

  it('uses deep-cuts for loved, popular for gem, and the global mode for untagged', async () => {
    const modeByArtist: Record<string, TrackSelectionMode> = {};
    const artists: Artist[] = [
      { name: 'Loved', affinity: 'loved' },
      { name: 'Gem', affinity: 'gem' },
      { name: 'Plain' }, // untagged
    ];

    await searchAndGetTopTracks(recordingPlatform(modeByArtist), artists, 'token', {
      selectionMode: 'balanced', // the user's global choice
    });

    expect(modeByArtist).toEqual({
      Loved: 'deep-cuts',
      Gem: 'popular',
      Plain: 'balanced', // untagged inherits the global mode — regression guard
    });
  });

  it('untagged artists still default to popular when no global mode is set', async () => {
    const modeByArtist: Record<string, TrackSelectionMode> = {};
    await searchAndGetTopTracks(recordingPlatform(modeByArtist), [{ name: 'Plain' }], 'token');
    expect(modeByArtist.Plain).toBe('popular');
  });
});

describe('searchAndGetTopTracks per-artist failures', () => {
  const track = (artist: string): Track =>
    ({ id: `${artist}-1`, name: 'Song', artist, platform: 'apple-music' }) as Track;

  function failingPlatform(fail: Record<string, 'search' | 'tracks' | 'access' | 'expired'>) {
    return {
      platform: 'apple-music',
      setDeveloperToken: vi.fn(),
      searchArtist: async (name: string) => {
        if (fail[name] === 'search') throw new Error('Request failed with status code 503');
        return { id: name, name, matched: true, similarity: 1 };
      },
      getArtistTopTracks: async (artistId: string): Promise<Track[]> => {
        if (fail[artistId] === 'tracks') throw new Error('Request failed with status code 429');
        if (fail[artistId] === 'access') throw new PlatformAccessError('apple-music', 403, '/x');
        if (fail[artistId] === 'expired')
          throw Object.assign(new Error('401'), { response: { status: 401 } });
        return [track(artistId)];
      },
    } as unknown as MusicPlatformService;
  }

  // Explicit type: ReturnType<typeof vi.spyOn> infers a constructor signature.
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  let logSpy: MockInstance<(...args: unknown[]) => void>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  // Regression: a failed top-songs request used to return [] and the artist
  // vanished from the playlist with no warning.
  it('reports failed artists and keeps the tracks of the others', async () => {
    const result = await searchAndGetTopTracks(
      failingPlatform({ B: 'tracks', C: 'search' }),
      [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      'token'
    );

    expect(result.tracks.map((t) => t.artist)).toEqual(['A']);
    expect(result.failedArtists).toEqual([
      { artist: 'C', stage: 'search', reason: expect.stringContaining('503') },
      { artist: 'B', stage: 'tracks', reason: expect.stringContaining('429') },
    ]);
    // A failed lookup is flagged, so the route does not call it "not found".
    expect(result.artistMatches.find((m) => m.requested === 'C')).toMatchObject({
      found: null,
      lookupFailed: true,
    });
  });

  it('still aborts the whole search on PlatformAccessError', async () => {
    await expect(
      searchAndGetTopTracks(
        failingPlatform({ B: 'access' }),
        [{ name: 'A' }, { name: 'B' }],
        'token'
      )
    ).rejects.toBeInstanceOf(PlatformAccessError);
  });

  it('still aborts on a raw 401 so the route can send the user to re-auth', async () => {
    await expect(
      searchAndGetTopTracks(
        failingPlatform({ B: 'expired' }),
        [{ name: 'A' }, { name: 'B' }],
        'token'
      )
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('searchAndGetTopTracks short artists', () => {
  let warn: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression: "Maldita Vecindad" matched a 2-song page and silently gave 2 of 8.
  it('reports an artist that returns fewer tracks than requested', async () => {
    const available: Record<string, number> = { A: 2, B: 10 };
    const platform = {
      platform: 'apple-music',
      setDeveloperToken: vi.fn(),
      searchArtist: async (name: string) => ({
        id: name,
        name: `${name} (catalog)`,
        matched: true,
        similarity: 1,
      }),
      getArtistTopTracks: async (artistId: string, _t: string, limit = 1): Promise<Track[]> =>
        Array.from({ length: Math.min(limit, available[artistId]) }, (_, i) => ({
          id: `${artistId}-${i}`,
        })) as Track[],
    } as unknown as MusicPlatformService;

    const result = await searchAndGetTopTracks(platform, [{ name: 'A' }, { name: 'B' }], 'token', {
      mode: 'custom',
      customCount: 8,
    });

    expect(result.tracks).toHaveLength(10);
    expect(result.shortArtists).toEqual([
      { artist: 'A', matchedAs: 'A (catalog)', requested: 8, received: 2 },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Only 2 of 8 tracks available for "A"')
    );
  });
});

describe('searchAndGetTopTracks duplicate matches', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function platformWith(
    idByName: Record<string, string>,
    tracksById: Record<string, string[]>,
    fetched: string[] = []
  ): MusicPlatformService {
    return {
      platform: 'apple-music',
      setDeveloperToken: vi.fn(),
      searchArtist: async (name: string) => ({
        id: idByName[name],
        name: `catalog ${idByName[name]}`,
        matched: true,
        similarity: 1,
      }),
      getArtistTopTracks: async (artistId: string): Promise<Track[]> => {
        fetched.push(artistId);
        return tracksById[artistId].map((id) => ({ id }) as Track);
      },
    } as unknown as MusicPlatformService;
  }

  it('fetches an artist once when two poster names match it', async () => {
    const fetched: string[] = [];
    const platform = platformWith(
      { 'Maldita Vecindad': '302942', 'Maldita Vecindad y Los Hijos': '302942' },
      { '302942': ['t1', 't2'] },
      fetched
    );

    const result = await searchAndGetTopTracks(
      platform,
      [{ name: 'Maldita Vecindad' }, { name: 'Maldita Vecindad y Los Hijos' }],
      'token'
    );

    expect(fetched).toEqual(['302942']);
    expect(result.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(result.foundArtists).toBe(2);
  });

  it('keeps one copy of a track that two artists share', async () => {
    const platform = platformWith({ A: 'a', B: 'b' }, { a: ['t1', 'collab'], b: ['collab', 't2'] });

    const result = await searchAndGetTopTracks(platform, [{ name: 'A' }, { name: 'B' }], 'token');

    expect(result.tracks.map((t) => t.id)).toEqual(['t1', 'collab', 't2']);
  });
});
