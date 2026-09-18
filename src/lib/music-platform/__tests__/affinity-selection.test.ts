import { describe, it, expect, vi } from 'vitest';
import { getSelectionModeForArtist, searchAndGetTopTracks } from '../index';
import { Artist, Track, TrackSelectionMode } from '@/types';
import { MusicPlatformService } from '../types';

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
