// ============================================================================
// Shared track-count configuration
// ============================================================================
//
// Moved out of `src/components/features/TrackCountModeSelector.tsx` so the
// client-only draft-storage module (`src/lib/playlist-draft.ts`) can share the
// exact same types without `src/lib` importing from `src/components`. The
// component re-exports these for backward compatibility.

export type TrackCountMode = 'tier-based' | 'custom-per-tier' | 'per-artist';

export interface TierCounts {
  headliner: number;
  'sub-headliner': number;
  'mid-tier': number;
  undercard: number;
}

export const DEFAULT_TIER_COUNTS: TierCounts & { default: number } = {
  headliner: 10,
  'sub-headliner': 5,
  'mid-tier': 3,
  undercard: 1,
  default: 3, // For Vision API (no tier)
};

/** Tier keys in canonical (fingerprint) order. */
export const TIER_KEYS: Array<keyof TierCounts> = [
  'headliner',
  'sub-headliner',
  'mid-tier',
  'undercard',
];

/**
 * A complete `TierCounts` object with any missing tier filled from the
 * recommended defaults. Used when normalizing parsed/hydrated data so
 * downstream code never reads `undefined` counts.
 */
export function withDefaultTierCounts(counts?: Partial<TierCounts> | null): TierCounts {
  return {
    headliner: counts?.headliner ?? DEFAULT_TIER_COUNTS.headliner,
    'sub-headliner': counts?.['sub-headliner'] ?? DEFAULT_TIER_COUNTS['sub-headliner'],
    'mid-tier': counts?.['mid-tier'] ?? DEFAULT_TIER_COUNTS['mid-tier'],
    undercard: counts?.undercard ?? DEFAULT_TIER_COUNTS.undercard,
  };
}
