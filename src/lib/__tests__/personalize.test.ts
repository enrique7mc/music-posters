import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseGemsResponse, selectGems, personalizeLineup } from '../personalize';
import { Artist } from '@/types';
import { MusicPlatformService } from '@/lib/music-platform/types';

describe('parseGemsResponse', () => {
  it('parses a fenced ```json block', () => {
    const text = '```json\n{"gems":[{"name":"Anz","confidence":0.9,"reason":"x"}]}\n```';
    expect(parseGemsResponse(text)).toEqual([{ name: 'Anz', confidence: 0.9, reason: 'x' }]);
  });

  it('parses a raw object with a gems array', () => {
    expect(parseGemsResponse('{"gems":[{"name":"Anz","confidence":0.8}]}')).toEqual([
      { name: 'Anz', confidence: 0.8 },
    ]);
  });

  it('parses a bare array', () => {
    expect(parseGemsResponse('[{"name":"Anz","confidence":0.8}]')).toEqual([
      { name: 'Anz', confidence: 0.8 },
    ]);
  });

  it('returns [] for a missing gems key', () => {
    expect(parseGemsResponse('{"notGems":1}')).toEqual([]);
  });

  it('returns [] for non-JSON (degrade, never throw)', () => {
    expect(parseGemsResponse('sorry, I cannot help with that')).toEqual([]);
  });
});

describe('selectGems', () => {
  const unknown = ['Anz', 'Overmono', 'Lane 8'];

  it('keeps gems that map to a lineup name and drops hallucinated ones', () => {
    const gems = selectGems(
      [
        { name: 'Anz', confidence: 0.9, reason: 'techno' },
        { name: 'Some Artist Not On The Poster', confidence: 0.95, reason: 'nope' },
      ],
      unknown
    );
    expect(gems).toHaveLength(1);
    expect(gems[0].lineupName).toBe('Anz');
  });

  it('maps a fuzzy gem name back to the original lineup name', () => {
    // 'over mono' (spaced) vs 'Overmono' ≈ 0.89 — clears the default 0.85 bar.
    const gems = selectGems([{ name: 'over mono', confidence: 0.9 }], unknown);
    expect(gems[0].lineupName).toBe('Overmono');
  });

  it('drops gems below the confidence floor', () => {
    expect(selectGems([{ name: 'Anz', confidence: 0.2 }], unknown)).toHaveLength(0);
  });

  it('clamps out-of-range confidence into [0,1]', () => {
    const gems = selectGems([{ name: 'Anz', confidence: 5 }], unknown);
    expect(gems[0].confidence).toBe(1);
  });

  it('ignores gems with a missing/invalid name', () => {
    expect(selectGems([{ confidence: 0.9 } as never], unknown)).toHaveLength(0);
  });

  it('dedupes by lineup name, keeping the highest confidence', () => {
    const gems = selectGems(
      [
        { name: 'Anz', confidence: 0.7, reason: 'low' },
        { name: 'Anz', confidence: 0.95, reason: 'high' },
      ],
      unknown
    );
    expect(gems).toHaveLength(1);
    expect(gems[0].confidence).toBe(0.95);
    expect(gems[0].reason).toBe('high');
  });

  it('sorts by confidence desc and caps at maxCount', () => {
    const gems = selectGems(
      [
        { name: 'Anz', confidence: 0.6 },
        { name: 'Overmono', confidence: 0.9 },
        { name: 'Lane 8', confidence: 0.7 },
      ],
      unknown,
      { maxCount: 2 }
    );
    expect(gems.map((g) => g.lineupName)).toEqual(['Overmono', 'Lane 8']);
  });

  it('strips unexpected fields (only name/confidence/reason survive)', () => {
    const gems = selectGems(
      [{ name: 'Anz', confidence: 0.9, reason: 'r', evil: 'x' } as never],
      unknown
    );
    expect(gems[0]).toEqual({ lineupName: 'Anz', confidence: 0.9, reason: 'r' });
  });
});

describe('personalizeLineup', () => {
  const lineup: Artist[] = [{ name: 'Phoenix' }, { name: 'Anz' }, { name: 'Overmono' }];

  // Platform stub: only getLibraryArtists matters here.
  function stubPlatform(
    libraryArtists: string[] | (() => Promise<string[]>)
  ): MusicPlatformService {
    return {
      getLibraryArtists: async () =>
        typeof libraryArtists === 'function' ? libraryArtists() : libraryArtists,
    } as unknown as MusicPlatformService;
  }

  // No GEMINI_API_KEY → the gem path returns [] without any network call, so we
  // can exercise orchestration deterministically.
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  });

  it('returns a plain, degraded result when the platform has no library support', async () => {
    const platform = {} as MusicPlatformService; // no getLibraryArtists
    const result = await personalizeLineup(lineup, platform, 'token');
    expect(result.degraded).toBe(true);
    expect(result.lovedCount).toBe(0);
    expect(result.artists.every((a) => a.affinity === undefined)).toBe(true);
  });

  it('tags library matches as loved (and leaves unknowns untagged with no key)', async () => {
    const result = await personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');
    const phoenix = result.artists.find((a) => a.name === 'Phoenix');
    expect(phoenix?.affinity).toBe('loved');
    expect(phoenix?.affinityReason).toBe('Already in your library');
    expect(result.lovedCount).toBe(1);
    expect(result.gemCount).toBe(0); // no Gemini key → loved-only
    expect(result.artists.find((a) => a.name === 'Anz')?.affinity).toBeUndefined();
  });

  it('skips gems entirely when there is no loved overlap', async () => {
    const result = await personalizeLineup(lineup, stubPlatform([]), 'token');
    expect(result.lovedCount).toBe(0);
    expect(result.gemCount).toBe(0);
    expect(result.artists.every((a) => a.affinity === undefined)).toBe(true);
  });

  it('does not mutate the input lineup', async () => {
    await personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');
    expect(lineup.find((a) => a.name === 'Phoenix')?.affinity).toBeUndefined();
  });

  it('degrades gracefully if the library scan throws', async () => {
    const platform = stubPlatform(async () => {
      throw new Error('boom');
    });
    const result = await personalizeLineup(lineup, platform, 'token');
    expect(result.degraded).toBe(true);
    expect(result.lovedCount).toBe(0);
  });
});
