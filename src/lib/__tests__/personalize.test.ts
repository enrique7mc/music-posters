import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseGemsResponse, selectGems, personalizeLineup } from '../personalize';
import { Artist } from '@/types';
import { MusicPlatformService } from '@/lib/music-platform/types';

// Mock the Gemini SDK so the gem path can be driven deterministically. The
// no-key tests below never reach it (requestGems short-circuits on a missing
// key before constructing the model), so the mock only matters where a key is set.
// vi.hoisted makes `generateContent` available to the hoisted vi.mock factory;
// mockImplementation keeps GoogleGenerativeAI constructable via `new`.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/generative-ai', () => ({
  // A class so `new GoogleGenerativeAI(key)` is constructable (an arrow-function
  // implementation is not).
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

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

  it('extracts a bare array embedded in prose (noisy-response fallback)', () => {
    const text =
      'Here are the gems you asked for: [{"name":"Anz","confidence":0.9,"reason":"techno"}] — enjoy!';
    expect(parseGemsResponse(text)).toEqual([{ name: 'Anz', confidence: 0.9, reason: 'techno' }]);
  });

  it('extracts a gems object embedded in prose (noisy-response fallback)', () => {
    const text = 'Sure! {"gems":[{"name":"Anz","confidence":0.8}]} Hope this helps.';
    expect(parseGemsResponse(text)).toEqual([{ name: 'Anz', confidence: 0.8 }]);
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

  it('sanitizes control + bidi-override chars in the reason (untrusted DOM text)', () => {
    // BEL, an RLO bidi override mid-word, a zero-width space, and a newline run.
    const gems = selectGems(
      [{ name: 'Anz', confidence: 0.9, reason: 'great\u0007 te\u202echno\u200b set\n\nnow' }],
      unknown
    );
    expect(gems[0].reason).toBe('great techno set now');
  });
});

describe('personalizeLineup', () => {
  const lineup: Artist[] = [{ name: 'Phoenix' }, { name: 'Anz' }, { name: 'Overmono' }];

  // Platform stub: only getLibraryArtists matters here. A bare string[] is the
  // common complete-scan case; pass a function to model an incomplete scan or a throw.
  function stubPlatform(
    libraryArtists: string[] | (() => Promise<{ artists: string[]; complete: boolean }>),
    complete = true
  ): MusicPlatformService {
    return {
      getLibraryArtists: async () =>
        typeof libraryArtists === 'function'
          ? libraryArtists()
          : { artists: libraryArtists, complete },
    } as unknown as MusicPlatformService;
  }

  // No GEMINI_API_KEY → the gem path returns [] without any network call, so we
  // can exercise orchestration deterministically. Tests that need gems set the
  // key locally and drive the mocked generateContent.
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    generateContent.mockReset();
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
    else delete process.env.GEMINI_API_KEY;
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

  it('tags every artist sharing a duplicated loved name (counts stay consistent)', async () => {
    // "Phoenix" appears twice (e.g. on two stages). Both must be tagged loved,
    // and lovedCount must equal the number of tagged artists — not a deduped
    // count and not just the last instance (the server/client by-name bug).
    const dupLineup: Artist[] = [{ name: 'Phoenix' }, { name: 'Anz' }, { name: 'Phoenix' }];
    const result = await personalizeLineup(dupLineup, stubPlatform(['Phoenix']), 'token');
    const phoenixes = result.artists.filter((a) => a.name === 'Phoenix');
    expect(phoenixes).toHaveLength(2);
    expect(phoenixes.every((a) => a.affinity === 'loved')).toBe(true);
    expect(result.lovedCount).toBe(2);
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

  it('annotates gems end-to-end when Gemini returns matches (key set)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{"gems":[{"name":"Anz","confidence":0.9,"reason":"techno"}]}' },
    });

    // Loved = [Phoenix]; unknown = [Anz, Overmono]; Gemini surfaces Anz as a gem.
    const result = await personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');

    const anz = result.artists.find((a) => a.name === 'Anz');
    expect(anz?.affinity).toBe('gem');
    expect(anz?.affinityConfidence).toBe(0.9);
    expect(anz?.affinityReason).toBe('techno');
    expect(anz?.affinityLinkedTo).toEqual(['Phoenix']); // seeded from the loved set
    expect(result.gemCount).toBe(1);
    expect(result.lovedCount).toBe(1);
    expect(result.degraded).toBe(false);
  });

  it('caps a runaway Gemini reason at the max length', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const longReason = 'x'.repeat(5000);
    generateContent.mockResolvedValueOnce({
      response: {
        text: () => `{"gems":[{"name":"Anz","confidence":0.9,"reason":"${longReason}"}]}`,
      },
    });

    const result = await personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');

    const anz = result.artists.find((a) => a.name === 'Anz');
    expect(anz?.affinityReason?.length).toBeLessThanOrEqual(200);
  });

  it('marks degraded and skips gems when the library scan is incomplete', async () => {
    process.env.GEMINI_API_KEY = 'test-key'; // even with a key, an incomplete scan must skip gems
    generateContent.mockResolvedValue({
      response: { text: () => '{"gems":[{"name":"Anz","confidence":0.9}]}' },
    });

    const platform = stubPlatform(async () => ({ artists: ['Phoenix'], complete: false }));
    const result = await personalizeLineup(lineup, platform, 'token');

    expect(result.degraded).toBe(true); // incomplete scan surfaces as degraded
    expect(result.lovedCount).toBe(1); // the loved match we DID find still stands
    expect(result.gemCount).toBe(0); // gems skipped — an unscanned page could hold a "gem"
    expect(generateContent).not.toHaveBeenCalled(); // no Gemini call at all
  });

  it('retries with backoff on a transient Gemini failure, then succeeds', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValueOnce(new Error('transient 503')).mockResolvedValueOnce({
        response: { text: () => '{"gems":[{"name":"Anz","confidence":0.9}]}' },
      });

      const promise = personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');
      await vi.runAllTimersAsync(); // flush the exponential-backoff delay between attempts
      const result = await promise;

      expect(generateContent).toHaveBeenCalledTimes(2); // failed once, retried, succeeded
      expect(result.gemCount).toBe(1);
      expect(result.artists.find((a) => a.name === 'Anz')?.affinity).toBe('gem');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after GEMINI_MAX_ATTEMPTS and keeps loved-only (a gem failure is NOT degraded)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValue(new Error('persistent 500'));

      const promise = personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(generateContent).toHaveBeenCalledTimes(3); // GEMINI_MAX_ATTEMPTS exhausted
      expect(result.gemCount).toBe(0);
      expect(result.lovedCount).toBe(1); // loved annotations still stand
      // A complete library scan is NOT degraded even when the gem pass fails —
      // gems are a best-effort enhancement, not a failure of the core result.
      expect(result.degraded).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a hung Gemini call with a per-attempt timeout (never waits forever)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.useFakeTimers();
    try {
      // A call that never settles — without withTimeout this would ride to the
      // 30s serverless kill. The per-attempt deadline must reject and move on.
      generateContent.mockReturnValue(new Promise(() => {}));

      const promise = personalizeLineup(lineup, stubPlatform(['Phoenix']), 'token');
      await vi.runAllTimersAsync(); // fires each per-attempt timeout + the backoffs
      const result = await promise;

      expect(generateContent).toHaveBeenCalledTimes(3); // timed out each attempt, then gave up
      expect(result.gemCount).toBe(0);
      expect(result.lovedCount).toBe(1); // loved still stands despite the hung gem pass
    } finally {
      vi.useRealTimers();
    }
  });
});
