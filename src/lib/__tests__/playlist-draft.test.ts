import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYLIST_DRAFT_STORAGE_KEY,
  LEGACY_FLOW_SESSION_KEYS,
  PlaylistDraft,
  applyTextLineup,
  artistNamesEqual,
  clearPlaylistDraft,
  computeSearchFingerprint,
  createPosterDraft,
  createRecommendedArtistReview,
  createTextDraft,
  defaultPlaylistName,
  parsePlaylistDraft,
  readPlaylistDraft,
  readPlaylistDraftForUser,
  savePlaylistDraft,
  trackReviewMatches,
  updatePlaylistDraft,
} from '../playlist-draft';
import { Artist, Track } from '@/types';

const OWNER = { userId: 'user-1', platform: 'apple-music' as const };
const OTHER_OWNER = { userId: 'user-2', platform: 'apple-music' as const };

const POSTER_ARTISTS: Artist[] = [
  { name: 'Alvvays', tier: 'headliner' },
  { name: 'The Beths', tier: 'mid-tier' },
];

const TRACK: Track = {
  id: 'track-1',
  name: 'Archie, Marry Me',
  artist: 'Alvvays',
  artistId: 'artist-1',
  album: 'Alvvays',
  albumArtwork: null,
  duration: 252_000,
  previewUrl: null,
  platformUrl: 'https://music.apple.com/track-1',
  platform: 'apple-music',
};

function posterDraft(overrides: Partial<PlaylistDraft> = {}): PlaylistDraft {
  return {
    ...createPosterDraft({
      owner: OWNER,
      artists: POSTER_ARTISTS,
      analysisProvider: 'hybrid',
      posterThumbnail: 'data:image/jpeg;base64,thumb',
      eventName: 'Test Fest 2026',
    }),
    ...overrides,
  };
}

describe('playlist-draft round trips', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saves and reads back a complete draft unchanged', () => {
    const draft = posterDraft();
    const result = savePlaylistDraft(draft);

    expect(result.ok).toBe(true);
    const read = readPlaylistDraft();
    expect(read).not.toBeNull();
    expect(read!.owner).toEqual(OWNER);
    expect(read!.source.kind).toBe('poster');
    expect(read!.source.originalArtists).toEqual(POSTER_ARTISTS);
    expect(read!.source.analysisProvider).toBe('hybrid');
    expect(read!.source.posterThumbnail).toBe('data:image/jpeg;base64,thumb');
    expect(read!.source.eventName).toBe('Test Fest 2026');
    expect(read!.artistReview.trackCountMode).toBe('tier-based');
    expect(read!.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
  });

  it('round-trips a draft containing a track review with selections', () => {
    const draft = posterDraft({
      trackReview: {
        searchFingerprint: 'fp-1',
        tracks: [TRACK],
        selectedTrackIds: ['track-1'],
        warnings: ['"X" was not found on Apple Music'],
        playlistName: 'My Fest Mix',
      },
    });
    savePlaylistDraft(draft);

    const read = readPlaylistDraft();
    expect(read!.trackReview).toEqual(draft.trackReview);
  });

  it('refreshes updatedAt on every save', () => {
    const draft = posterDraft();
    const first = savePlaylistDraft(draft);
    if (!first.ok) throw new Error('expected save to succeed');

    vi.spyOn(Date, 'now').mockReturnValue(first.draft.updatedAt + 5000);
    try {
      const second = savePlaylistDraft(first.draft);
      expect(second.ok && second.draft.updatedAt).toBe(first.draft.updatedAt + 5000);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('playlist-draft validation', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('treats malformed JSON as absent and clears the stored value', () => {
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, '{not json');

    expect(readPlaylistDraft()).toBeNull();
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('treats an unknown version as absent and clears the stored value', () => {
    const draft = posterDraft();
    const future = { ...draft, version: 99 as unknown as 1 };
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(future));

    expect(readPlaylistDraft()).toBeNull();
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('rejects drafts with invalid nested values', () => {
    const bad = [
      { ...posterDraft(), owner: { userId: '', platform: 'apple-music' } },
      { ...posterDraft(), source: { ...posterDraft().source, kind: 'flyer' } },
      {
        ...posterDraft(),
        source: { ...posterDraft().source, originalArtists: [{ name: '   ' }] },
      },
      { ...posterDraft(), artistReview: { ...posterDraft().artistReview, trackCountMode: 'tons' } },
      {
        ...posterDraft(),
        artistReview: { ...posterDraft().artistReview, tierCounts: { headliner: 'many' } },
      },
      {
        ...posterDraft(),
        trackReview: { searchFingerprint: 1, tracks: [], selectedTrackIds: [], warnings: [] },
      },
    ];

    for (const payload of bad) {
      expect(parsePlaylistDraft(payload)).toBeNull();
      sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      expect(readPlaylistDraft(), JSON.stringify(payload)).toBeNull();
      sessionStorage.removeItem(PLAYLIST_DRAFT_STORAGE_KEY);
    }
  });

  it('rejects artists with invalid tier or affinity values', () => {
    const draft = posterDraft();
    const bad = {
      ...draft,
      artistReview: {
        ...draft.artistReview,
        artists: [{ name: 'Alvvays', tier: 'top-billing' }],
      },
    };
    expect(parsePlaylistDraft(bad)).toBeNull();

    const badAffinity = {
      ...draft,
      artistReview: {
        ...draft.artistReview,
        artists: [{ name: 'Alvvays', affinity: 'meh' }],
      },
    };
    expect(parsePlaylistDraft(badAffinity)).toBeNull();
  });

  it('accepts artists with affinity and optional fields', () => {
    const draft = posterDraft();
    draft.artistReview.artists = [
      { name: 'Alvvays', tier: 'headliner', affinity: 'loved', affinityConfidence: 0.9 },
    ];
    expect(parsePlaylistDraft(draft)).not.toBeNull();
  });
});

describe('playlist-draft owner matching', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns the draft for the owning user', () => {
    savePlaylistDraft(posterDraft());

    expect(readPlaylistDraftForUser('user-1', 'apple-music')).not.toBeNull();
  });

  it('clears the draft when another user reads it', () => {
    savePlaylistDraft(posterDraft());

    expect(readPlaylistDraftForUser(OTHER_OWNER.userId, OTHER_OWNER.platform)).toBeNull();
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('clears the draft when the platform differs', () => {
    savePlaylistDraft(posterDraft());

    expect(readPlaylistDraftForUser('user-1', 'spotify')).toBeNull();
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
  });
});

describe('playlist-draft writes', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reports write-failed when the quota is exceeded', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    try {
      const result = savePlaylistDraft(posterDraft());
      expect(result).toEqual({ ok: false, reason: 'write-failed' });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('reports write-failed when the read-back verification mismatches', () => {
    const originalSetItem = Storage.prototype.setItem;
    // Simulate a storage area that silently truncates writes: the stored value
    // never equals the requested one.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      return originalSetItem.call(this, key, value.slice(0, -1));
    });
    try {
      const result = savePlaylistDraft(posterDraft());
      expect(result).toEqual({ ok: false, reason: 'write-failed' });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('removes legacy flow keys after a successful write', () => {
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => sessionStorage.setItem(key, 'stale'));

    const result = savePlaylistDraft(posterDraft());

    expect(result.ok).toBe(true);
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => {
      expect(sessionStorage.getItem(key)).toBeNull();
    });
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).not.toBeNull();
  });

  it('updates the stored draft through a read-modify-write', () => {
    savePlaylistDraft(posterDraft());

    const result = updatePlaylistDraft((draft) => ({
      ...draft,
      artistReview: { ...draft.artistReview, trackSelectionMode: 'balanced' },
    }));

    expect(result.ok).toBe(true);
    expect(readPlaylistDraft()!.artistReview.trackSelectionMode).toBe('balanced');
  });

  it('reports absent when updating with no stored draft', () => {
    expect(updatePlaylistDraft((draft) => draft)).toEqual({ ok: false, reason: 'absent' });
  });

  it('does not throw when storage access is blocked entirely', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });
    try {
      expect(savePlaylistDraft(posterDraft())).toEqual({ ok: false, reason: 'unavailable' });
      expect(readPlaylistDraft()).toBeNull();
      expect(() => clearPlaylistDraft()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'sessionStorage', descriptor);
    }
  });
});

describe('clearPlaylistDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('removes the aggregate key and legacy flow keys, preserving unrelated keys', () => {
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(posterDraft()));
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => sessionStorage.setItem(key, 'stale'));
    sessionStorage.setItem('returnAfterAuth', JSON.stringify({ url: '/upload', timestamp: 1 }));
    localStorage.setItem('trackViewMode', 'list');

    clearPlaylistDraft();

    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => {
      expect(sessionStorage.getItem(key)).toBeNull();
    });
    expect(sessionStorage.getItem('returnAfterAuth')).not.toBeNull();
    expect(localStorage.getItem('trackViewMode')).toBe('list');
  });
});

describe('constructors', () => {
  it('createRecommendedArtistReview uses tier defaults for posters', () => {
    const review = createRecommendedArtistReview(POSTER_ARTISTS, 'poster');
    expect(review.trackCountMode).toBe('tier-based');
    expect(review.trackSelectionMode).toBe('popular');
    expect(review.perArtistCounts).toEqual({ Alvvays: 10, 'The Beths': 3 });
    expect(review.stagedTierCounts).toEqual({});
  });

  it('createRecommendedArtistReview uses per-artist mode with 5 for text', () => {
    const review = createRecommendedArtistReview([{ name: 'Alvvays' }], 'text');
    expect(review.trackCountMode).toBe('per-artist');
    expect(review.perArtistCounts).toEqual({ Alvvays: 5 });
  });

  it('createPosterDraft omits empty thumbnails and event names', () => {
    const draft = createPosterDraft({
      owner: OWNER,
      artists: POSTER_ARTISTS,
      analysisProvider: 'vision',
      posterThumbnail: null,
      eventName: '   ',
    });
    expect(draft.source.posterThumbnail).toBeUndefined();
    expect(draft.source.eventName).toBeUndefined();
  });

  it('applyTextLineup resets artist review and downstream track results', () => {
    const draft = posterDraft({
      trackReview: {
        searchFingerprint: 'fp',
        tracks: [TRACK],
        selectedTrackIds: ['track-1'],
        warnings: [],
        playlistName: 'Old',
      },
    });

    const next = applyTextLineup(draft, 'Alvvays\nThe Beths', POSTER_ARTISTS);

    expect(next.source.kind).toBe('text');
    expect(next.source.manualText).toBe('Alvvays\nThe Beths');
    expect(next.source.originalArtists).toEqual(POSTER_ARTISTS);
    expect(next.artistReview.trackCountMode).toBe('per-artist');
    expect(next.trackReview).toBeUndefined();
  });

  it('artistNamesEqual compares ordered names only', () => {
    expect(artistNamesEqual([{ name: 'A' }, { name: 'B' }], [{ name: 'A' }, { name: 'B' }])).toBe(
      true
    );
    expect(artistNamesEqual([{ name: 'A' }], [{ name: 'B' }])).toBe(false);
    expect(artistNamesEqual([{ name: 'A' }], [{ name: 'A' }, { name: 'B' }])).toBe(false);
  });

  it('createTextDraft starts empty with text defaults', () => {
    const draft = createTextDraft({ owner: OWNER, manualText: 'Alvvays' });
    expect(draft.source.kind).toBe('text');
    expect(draft.source.manualText).toBe('Alvvays');
    expect(draft.source.originalArtists).toEqual([]);
    expect(draft.artistReview.artists).toEqual([]);
  });
});

describe('defaultPlaylistName', () => {
  it('prefers a trimmed event name (capped at 100 chars)', () => {
    const source = { kind: 'poster' as const, originalArtists: [], eventName: '  Test Fest  ' };
    expect(defaultPlaylistName(source)).toBe('Test Fest');
  });

  it('uses Artist Mix for manual lineups without an event name', () => {
    expect(defaultPlaylistName({ kind: 'text', originalArtists: [] })).toBe('Artist Mix');
  });

  it('falls back to a dated Festival Mix for posters without an event name', () => {
    const now = new Date('2026-09-21T12:00:00');
    expect(defaultPlaylistName({ kind: 'poster', originalArtists: [] }, now)).toBe(
      `Festival Mix - ${now.toLocaleDateString()}`
    );
  });
});

describe('computeSearchFingerprint', () => {
  const base = {
    artists: POSTER_ARTISTS,
    trackCountMode: 'tier-based' as const,
    trackSelectionMode: 'popular' as const,
  };

  it('is deterministic across key insertion order', () => {
    const a = computeSearchFingerprint({
      ...base,
      trackCountMode: 'per-artist',
      perArtistCounts: { Alvvays: 5, TheBeths: 3 },
    });
    const b = computeSearchFingerprint({
      ...base,
      trackCountMode: 'per-artist',
      perArtistCounts: { TheBeths: 3, Alvvays: 5 },
    });
    expect(a).toBe(b);
  });

  it('changes when an artist is removed', () => {
    const full = computeSearchFingerprint(base);
    const reduced = computeSearchFingerprint({ ...base, artists: POSTER_ARTISTS.slice(0, 1) });
    expect(full).not.toBe(reduced);
  });

  it('changes when affinity changes (selection is affinity-driven)', () => {
    const tagged = [{ name: 'Alvvays', tier: 'headliner' as const, affinity: 'loved' as const }];
    const untagged = [{ name: 'Alvvays', tier: 'headliner' as const }];
    expect(computeSearchFingerprint({ ...base, artists: tagged })).not.toBe(
      computeSearchFingerprint({ ...base, artists: untagged })
    );
  });

  it('changes when the selection mode or count mode changes', () => {
    expect(computeSearchFingerprint({ ...base, trackSelectionMode: 'deep-cuts' })).not.toBe(
      computeSearchFingerprint(base)
    );
    expect(computeSearchFingerprint({ ...base, trackCountMode: 'per-artist' })).not.toBe(
      computeSearchFingerprint(base)
    );
  });

  it('changes when active tier counts change in custom-per-tier mode', () => {
    const defaults = computeSearchFingerprint({ ...base, trackCountMode: 'custom-per-tier' });
    const custom = computeSearchFingerprint({
      ...base,
      trackCountMode: 'custom-per-tier',
      tierCounts: {
        headliner: 7,
        'sub-headliner': 5,
        'mid-tier': 3,
        undercard: 1,
      },
    });
    expect(defaults).not.toBe(custom);
  });

  it('ignores per-artist counts when the mode is tier-based', () => {
    expect(computeSearchFingerprint({ ...base, perArtistCounts: { X: 25 } })).toBe(
      computeSearchFingerprint(base)
    );
  });

  it('ignores non-semantic artist fields like weight and reasoning', () => {
    const plain = computeSearchFingerprint({ ...base, artists: [{ name: 'Alvvays' }] });
    const chatty = computeSearchFingerprint({
      ...base,
      artists: [{ name: 'Alvvays', weight: 10, reasoning: 'top of poster', spotifyId: 'x' }],
    });
    expect(plain).toBe(chatty);
  });

  it('trackReviewMatches requires a non-empty matching result', () => {
    const fingerprint = computeSearchFingerprint(base);
    expect(trackReviewMatches(undefined, fingerprint)).toBe(false);
    expect(
      trackReviewMatches(
        {
          searchFingerprint: fingerprint,
          tracks: [],
          selectedTrackIds: [],
          warnings: [],
          playlistName: 'X',
        },
        fingerprint
      )
    ).toBe(false);
    expect(
      trackReviewMatches(
        {
          searchFingerprint: fingerprint,
          tracks: [TRACK],
          selectedTrackIds: ['track-1'],
          warnings: [],
          playlistName: 'X',
        },
        fingerprint
      )
    ).toBe(true);
    expect(
      trackReviewMatches(
        {
          searchFingerprint: fingerprint,
          tracks: [TRACK],
          selectedTrackIds: ['track-1'],
          warnings: [],
          playlistName: 'X',
        },
        'different'
      )
    ).toBe(false);
  });
});
