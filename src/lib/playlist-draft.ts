// ============================================================================
// Playlist draft persistence (client-only)
// ============================================================================
//
// Preserves an authenticated user's in-progress playlist while they move
// backward and forward through Upload → Review Artists → Review Tracks. The
// draft lives ONLY in `sessionStorage` under a single versioned key, so writes
// are coherent and future schema changes get an explicit migration boundary.
//
// Lifecycle (the only paths that clear the aggregate draft):
//   - Start over (user-confirmed reset)
//   - /success mount (playlist completed)
//   - Logout
//   - Owner mismatch (another account in the same tab)
//   - Malformed / unknown-version payload (treated as absent)
//
// The app stays stateless: OAuth tokens remain in httpOnly cookies and are
// NEVER part of the draft. Nothing survives closing the tab.

import { Artist, ArtistInputSource, MusicPlatform, Track, TrackSelectionMode } from '@/types';
import { AppError } from '@/lib/error-utils';
import { DEFAULT_TEXT_ARTIST_TRACK_COUNT } from '@/lib/artist-text';
import {
  DEFAULT_TIER_COUNTS,
  TierCounts,
  TrackCountMode,
  TIER_KEYS,
  withDefaultTierCounts,
} from '@/lib/track-counts';

/** Single namespaced, versioned storage key for the whole draft. */
export const PLAYLIST_DRAFT_STORAGE_KEY = 'playlistd:playlist-draft:v1';

/**
 * Legacy per-key flow storage from the pre-draft implementation. `clearPlaylistDraft`
 * removes these alongside the aggregate key so stale posters, tracks, and warnings
 * can't leak across flows. No page may read or write them directly any more.
 */
export const LEGACY_FLOW_SESSION_KEYS = [
  'artists',
  'analysisProvider',
  'posterThumbnail',
  'eventName',
  'tracks',
  'trackWarnings',
  'inputSource',
] as const;

export type AnalysisProvider = 'vision' | 'gemini' | 'hybrid';

export interface PlaylistDraftOwner {
  userId: string;
  platform: MusicPlatform;
}

export interface PlaylistDraftSource {
  kind: ArtistInputSource;
  /** Raw manual-entry textarea content (text drafts only). */
  manualText?: string;
  /** The lineup as it entered the flow, before any artist-review edits. */
  originalArtists: Artist[];
  analysisProvider?: AnalysisProvider;
  /** 300x300 base64 data-URL thumbnail; absent when generation failed. */
  posterThumbnail?: string;
  eventName?: string;
}

export interface PlaylistPersonalizationSummary {
  status: 'complete' | 'degraded';
  lovedCount: number;
  gemCount: number;
}

export interface PlaylistArtistReview {
  artists: Artist[];
  trackCountMode: TrackCountMode;
  tierCounts: TierCounts;
  perArtistCounts: Record<string, number>;
  stagedTierCounts: Partial<TierCounts>;
  trackSelectionMode: TrackSelectionMode;
  personalization?: PlaylistPersonalizationSummary;
}

export interface PlaylistTrackReview {
  /** Fingerprint of the artist-review inputs that produced `tracks`. */
  searchFingerprint: string;
  tracks: Track[];
  selectedTrackIds: string[];
  warnings: string[];
  playlistName: string;
}

export interface PlaylistDraft {
  version: 1;
  updatedAt: number;
  owner: PlaylistDraftOwner;
  source: PlaylistDraftSource;
  artistReview: PlaylistArtistReview;
  trackReview?: PlaylistTrackReview;
}

export type PlaylistDraftSaveResult =
  | { ok: true; draft: PlaylistDraft }
  | { ok: false; reason: 'unavailable' | 'write-failed' };

export type PlaylistDraftUpdateResult =
  | { ok: true; draft: PlaylistDraft }
  | { ok: false; reason: 'absent' | 'unavailable' | 'write-failed' };

/** Shared browser-storage error used when a required (navigation-gating) write fails. */
export const PLAYLIST_DRAFT_STORAGE_ERROR: AppError = {
  type: 'server',
  title: 'Browser storage unavailable',
  message:
    'Your browser blocked session storage, so we cannot save this playlist. Enable browser storage and try again.',
};

const MUSIC_PLATFORMS: readonly MusicPlatform[] = ['spotify', 'apple-music'];
const TRACK_COUNT_MODES: readonly TrackCountMode[] = [
  'tier-based',
  'custom-per-tier',
  'per-artist',
];
const TRACK_SELECTION_MODES: readonly TrackSelectionMode[] = ['popular', 'balanced', 'deep-cuts'];
const ANALYSIS_PROVIDERS: readonly AnalysisProvider[] = ['vision', 'gemini', 'hybrid'];

// ============================================================================
// Storage access
// ============================================================================

/** Safe sessionStorage accessor; null on the server or when access is blocked. */
export function getDraftStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Probe storage with a round-trip write (some browsers throw only on write). */
export function isSessionStorageAvailable(): boolean {
  const storage = getDraftStorage();
  if (!storage) return false;

  const testKey = '__playlistd_storage_test__';
  try {
    storage.setItem(testKey, 'available');
    const isAvailable = storage.getItem(testKey) === 'available';
    storage.removeItem(testKey);
    return isAvailable;
  } catch {
    try {
      storage.removeItem(testKey);
    } catch {
      // Storage is unavailable; there is nothing more to recover here.
    }
    return false;
  }
}

// ============================================================================
// Validation
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

/**
 * Strict Artist validation: every field a screen renders is type-checked, so
 * a hand-edited or half-corrupted draft is cleared (treated as absent) rather
 * than crashing the page mid-render.
 */
function isArtist(value: unknown): value is Artist {
  if (!isRecord(value) || !isNonEmptyString(value.name)) return false;
  if (value.tier !== undefined && !TIER_KEYS.includes(value.tier as keyof TierCounts)) {
    return false;
  }
  if (value.affinity !== undefined && value.affinity !== 'loved' && value.affinity !== 'gem') {
    return false;
  }
  return (
    isOptionalNumber(value.weight) &&
    isOptionalString(value.reasoning) &&
    isOptionalString(value.spotifyId) &&
    isOptionalNumber(value.affinityConfidence) &&
    isOptionalString(value.affinityReason) &&
    isOptionalStringArray(value.affinityLinkedTo)
  );
}

/** Strict Track validation: the full rendered shape must be present and typed. */
function isTrack(value: unknown): value is Track {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id) || typeof value.name !== 'string') return false;
  if (typeof value.artist !== 'string' || typeof value.artistId !== 'string') return false;
  if (typeof value.album !== 'string') return false;
  if (typeof value.duration !== 'number' || !Number.isFinite(value.duration)) return false;
  if (value.albumArtwork !== null && typeof value.albumArtwork !== 'string') return false;
  if (value.previewUrl !== null && typeof value.previewUrl !== 'string') return false;
  if (typeof value.platformUrl !== 'string') return false;
  if (!MUSIC_PLATFORMS.includes(value.platform as MusicPlatform)) return false;
  return value.uri === undefined || typeof value.uri === 'string';
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((count) => typeof count === 'number' && Number.isFinite(count));
}

function isTierCounts(value: unknown): value is TierCounts {
  if (!isRecord(value)) return false;
  return TIER_KEYS.every((tier) => typeof value[tier] === 'number' && Number.isFinite(value[tier]));
}

function isPartialTierCounts(value: unknown): value is Partial<TierCounts> {
  if (!isRecord(value)) return false;
  return TIER_KEYS.every(
    (tier) =>
      value[tier] === undefined || (typeof value[tier] === 'number' && Number.isFinite(value[tier]))
  );
}

function isPersonalization(value: unknown): value is PlaylistPersonalizationSummary {
  if (!isRecord(value)) return false;
  if (value.status !== 'complete' && value.status !== 'degraded') return false;
  return typeof value.lovedCount === 'number' && typeof value.gemCount === 'number';
}

function isTrackReview(value: unknown): value is PlaylistTrackReview {
  if (!isRecord(value)) return false;
  if (typeof value.searchFingerprint !== 'string') return false;
  if (!Array.isArray(value.tracks) || !value.tracks.every(isTrack)) return false;
  if (!isStringArray(value.selectedTrackIds)) return false;
  if (!isStringArray(value.warnings)) return false;
  return typeof value.playlistName === 'string';
}

/**
 * Validate an unknown parsed value as a v1 draft. Returns null for anything
 * malformed or versioned differently — callers treat that as "no draft" and
 * clear the stored payload.
 */
export function parsePlaylistDraft(value: unknown): PlaylistDraft | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;

  const owner = value.owner;
  if (!isRecord(owner) || !isNonEmptyString(owner.userId)) return null;
  if (!MUSIC_PLATFORMS.includes(owner.platform as MusicPlatform)) return null;

  const source = value.source;
  if (!isRecord(source)) return null;
  if (source.kind !== 'poster' && source.kind !== 'text') return null;
  if (!Array.isArray(source.originalArtists) || !source.originalArtists.every(isArtist)) {
    return null;
  }
  if (source.analysisProvider !== undefined) {
    if (!ANALYSIS_PROVIDERS.includes(source.analysisProvider as AnalysisProvider)) return null;
  }
  if (source.manualText !== undefined && typeof source.manualText !== 'string') return null;
  if (source.posterThumbnail !== undefined && typeof source.posterThumbnail !== 'string') {
    return null;
  }
  if (source.eventName !== undefined && typeof source.eventName !== 'string') return null;

  const review = value.artistReview;
  if (!isRecord(review)) return null;
  if (!Array.isArray(review.artists) || !review.artists.every(isArtist)) return null;
  if (!TRACK_COUNT_MODES.includes(review.trackCountMode as TrackCountMode)) return null;
  if (!isTierCounts(review.tierCounts)) return null;
  if (!isNumberRecord(review.perArtistCounts)) return null;
  if (!isPartialTierCounts(review.stagedTierCounts)) return null;
  if (!TRACK_SELECTION_MODES.includes(review.trackSelectionMode as TrackSelectionMode)) {
    return null;
  }
  if (review.personalization !== undefined && !isPersonalization(review.personalization)) {
    return null;
  }

  if (value.trackReview !== undefined && !isTrackReview(value.trackReview)) return null;

  return value as unknown as PlaylistDraft;
}

// ============================================================================
// Read / write / clear
// ============================================================================

function removeStoredDraft(storage: Storage): void {
  try {
    storage.removeItem(PLAYLIST_DRAFT_STORAGE_KEY);
  } catch {
    // Best effort: a blocked storage area already behaves as "no draft".
  }
}

/**
 * Read and validate the stored draft. Malformed JSON and unknown versions are
 * cleared and treated as absent (never surfaced to the user).
 */
export function readPlaylistDraft(): PlaylistDraft | null {
  const storage = getDraftStorage();
  if (!storage) return null;

  let raw: string | null = null;
  try {
    raw = storage.getItem(PLAYLIST_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const draft = parsePlaylistDraft(JSON.parse(raw));
    if (draft) return draft;
  } catch {
    // fall through: malformed payload
  }
  removeStoredDraft(storage);
  return null;
}

/**
 * Read the draft for the authenticated user. A draft owned by a different
 * user/platform is cleared rather than shown, so one account never inherits
 * another's in-progress work in the same tab.
 */
export function readPlaylistDraftForUser(
  userId: string,
  platform: MusicPlatform
): PlaylistDraft | null {
  const draft = readPlaylistDraft();
  if (!draft) return null;
  if (draft.owner.userId !== userId || draft.owner.platform !== platform) {
    clearPlaylistDraft();
    return null;
  }
  return draft;
}

/**
 * Serialize, write, and verify the draft by reading it back. Refreshes
 * `updatedAt` and removes any legacy per-key flow values (a valid aggregate
 * draft supersedes them). Never throws — check the typed result.
 */
export function savePlaylistDraft(draft: PlaylistDraft): PlaylistDraftSaveResult {
  const storage = getDraftStorage();
  if (!storage) return { ok: false, reason: 'unavailable' };

  const enriched: PlaylistDraft = { ...draft, version: 1, updatedAt: Date.now() };
  const serialized = JSON.stringify(enriched);
  try {
    storage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, serialized);
    if (storage.getItem(PLAYLIST_DRAFT_STORAGE_KEY) !== serialized) {
      return { ok: false, reason: 'write-failed' };
    }
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch {
        // Best effort cleanup only.
      }
    });
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
  return { ok: true, draft: enriched };
}

/**
 * Read-modify-write the stored draft. `mutate` receives the validated stored
 * value and returns the next complete draft. Fails with `absent` when there is
 * nothing to update.
 */
export function updatePlaylistDraft(
  mutate: (draft: PlaylistDraft) => PlaylistDraft
): PlaylistDraftUpdateResult {
  const current = readPlaylistDraft();
  if (!current) return { ok: false, reason: 'absent' };
  return savePlaylistDraft(mutate(current));
}

/**
 * Remove the aggregate draft key plus the legacy per-key flow values. Never
 * calls `sessionStorage.clear()` — auth (`returnAfterAuth`) and UI preference
 * keys (`trackViewMode`, theme) are owned by other features and survive.
 */
export function clearPlaylistDraft(): void {
  const storage = getDraftStorage();
  if (!storage) return;
  try {
    storage.removeItem(PLAYLIST_DRAFT_STORAGE_KEY);
    LEGACY_FLOW_SESSION_KEYS.forEach((key) => storage.removeItem(key));
  } catch {
    // Best effort only.
  }
}

/** True when the draft holds source/review data the user would lose on reset. */
export function hasDraftProgress(draft: PlaylistDraft | null): boolean {
  if (!draft) return false;
  if (draft.source.originalArtists.length > 0) return true;
  if (draft.source.manualText?.trim()) return true;
  if (draft.artistReview.artists.length > 0) return true;
  if (draft.trackReview) return true;
  return false;
}

// ============================================================================
// Constructors (single source of truth for initial state)
// ============================================================================

/**
 * Recommended artist-review defaults for a lineup. Poster lineups start in
 * tier-based mode with tier-seeded per-artist counts; manual lineups have no
 * tiers and start in per-artist mode with the text-entry default (5).
 */
export function createRecommendedArtistReview(
  artists: Artist[],
  sourceKind: ArtistInputSource
): PlaylistArtistReview {
  const perArtistCounts: Record<string, number> = Object.create(null);
  artists.forEach((artist) => {
    if (sourceKind === 'text') {
      perArtistCounts[artist.name] = DEFAULT_TEXT_ARTIST_TRACK_COUNT;
    } else if (artist.tier) {
      perArtistCounts[artist.name] = DEFAULT_TIER_COUNTS[artist.tier];
    } else {
      perArtistCounts[artist.name] = DEFAULT_TIER_COUNTS.default;
    }
  });

  return {
    artists: [...artists],
    trackCountMode: sourceKind === 'text' ? 'per-artist' : 'tier-based',
    tierCounts: withDefaultTierCounts(),
    perArtistCounts,
    stagedTierCounts: {},
    trackSelectionMode: 'popular',
  };
}

/** Draft for a completed poster analysis (replaces any previous draft). */
export function createPosterDraft(params: {
  owner: PlaylistDraftOwner;
  artists: Artist[];
  analysisProvider: AnalysisProvider;
  posterThumbnail?: string | null;
  eventName?: string | null;
}): PlaylistDraft {
  const eventName = params.eventName?.trim();
  return {
    version: 1,
    updatedAt: Date.now(),
    owner: { ...params.owner },
    source: {
      kind: 'poster',
      originalArtists: [...params.artists],
      analysisProvider: params.analysisProvider,
      ...(params.posterThumbnail ? { posterThumbnail: params.posterThumbnail } : {}),
      ...(eventName ? { eventName } : {}),
    },
    artistReview: createRecommendedArtistReview(params.artists, 'poster'),
  };
}

/** Draft for manual entry in progress (before the lineup is submitted). */
export function createTextDraft(params: {
  owner: PlaylistDraftOwner;
  manualText?: string;
}): PlaylistDraft {
  return {
    version: 1,
    updatedAt: Date.now(),
    owner: { ...params.owner },
    source: { kind: 'text', manualText: params.manualText ?? '', originalArtists: [] },
    artistReview: createRecommendedArtistReview([], 'text'),
  };
}

/**
 * Store a submitted manual lineup on a draft. A genuinely different lineup
 * resets artist-review edits and downstream track results; the caller decides
 * whether the previous lineup was equivalent (and should keep them).
 */
export function applyTextLineup(
  draft: PlaylistDraft,
  manualText: string,
  artists: Artist[]
): PlaylistDraft {
  return {
    ...draft,
    source: { ...draft.source, kind: 'text' as const, manualText, originalArtists: [...artists] },
    artistReview: createRecommendedArtistReview(artists, 'text'),
    trackReview: undefined,
  };
}

/** Ordered-name comparison used to detect an unchanged re-submission. */
export function artistNamesEqual(a: Artist[], b: Artist[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((artist, index) => artist.name === b[index].name);
}

/**
 * Default playlist name for a fresh track review: the poster's event name, or
 * a neutral default per input source. An existing (user-edited) name is kept
 * by callers, not by this helper.
 */
export function defaultPlaylistName(source: PlaylistDraftSource, now = new Date()): string {
  const eventName = source.eventName?.trim().slice(0, 100);
  if (eventName) return eventName;
  if (source.kind === 'text') return 'Artist Mix';
  return `Festival Mix - ${now.toLocaleDateString()}`;
}

// ============================================================================
// Search fingerprint (track-result reuse / invalidation)
// ============================================================================

export interface SearchFingerprintInput {
  artists: Artist[];
  trackCountMode: TrackCountMode;
  trackSelectionMode: TrackSelectionMode;
  tierCounts?: TierCounts;
  perArtistCounts?: Record<string, number>;
}

function sortedCountEntries(counts: Record<string, number>): Array<[string, number]> {
  return Object.keys(counts)
    .sort()
    .map((key) => [key, counts[key]]);
}

/**
 * Deterministic fingerprint over only the inputs that affect
 * /api/search-tracks: the ordered artists (name, tier, affinity — the fields
 * the route uses for counts and selection), the count mode, the selection
 * mode, and the count map active for that mode (keys sorted). Equal
 * fingerprints mean the stored track result is still valid; any difference
 * means a new search is required.
 */
export function computeSearchFingerprint(input: SearchFingerprintInput): string {
  const counts: Array<[string, number]> =
    input.trackCountMode === 'custom-per-tier'
      ? TIER_KEYS.map(
          (tier) =>
            [tier, input.tierCounts?.[tier] ?? DEFAULT_TIER_COUNTS[tier]] as [string, number]
        )
      : input.trackCountMode === 'per-artist'
        ? sortedCountEntries(input.perArtistCounts ?? {})
        : [];

  const canonical = {
    artists: input.artists.map((artist) => ({
      name: artist.name,
      tier: artist.tier ?? null,
      affinity: artist.affinity ?? null,
    })),
    trackCountMode: input.trackCountMode,
    trackSelectionMode: input.trackSelectionMode,
    counts,
  };
  return JSON.stringify(canonical);
}

/**
 * True when the stored track review can be reused for the given fingerprint:
 * it must be non-empty and have been produced from identical search inputs.
 */
export function trackReviewMatches(
  trackReview: PlaylistTrackReview | undefined,
  fingerprint: string
): boolean {
  if (!trackReview) return false;
  if (trackReview.tracks.length === 0) return false;
  return trackReview.searchFingerprint === fingerprint;
}
