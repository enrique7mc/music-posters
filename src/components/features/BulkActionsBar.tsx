import { motion } from 'framer-motion';
import { Artist } from '@/types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import type { TrackCountMode, TierCounts } from './TrackCountModeSelector';
import { DEFAULT_TIER_COUNTS } from './TrackCountModeSelector';
import TrackCountInput from './TrackCountInput';

interface BulkActionsBarProps {
  artists: Artist[];
  trackCountMode: TrackCountMode;
  selectedCount: number;
  onResetToRecommended: () => void;
  onRemoveSelected: () => void;
  onApplyToTier: (tier: string, count: number) => void;
  /**
   * Bulk tier counts staged since the last Reset to Recommended. Held by the
   * page so Reset can clear them alongside the lineup counts; tiers without
   * an entry show (and Apply) their recommended default.
   */
  stagedTierCounts: Partial<TierCounts>;
  onStagedTierCountChange: (tier: keyof TierCounts, count: number) => void;
}

export default function BulkActionsBar({
  artists,
  trackCountMode,
  selectedCount,
  onResetToRecommended,
  onRemoveSelected,
  onApplyToTier,
  stagedTierCounts,
  onStagedTierCountChange,
}: BulkActionsBarProps) {
  // Calculate available tiers
  const availableTiers = Array.from(new Set(artists.filter((a) => a.tier).map((a) => a.tier)));

  const hasRanking = availableTiers.length > 0;

  return (
    <Card variant="glass" className="overflow-hidden">
      <div className="p-4">
        <h4 className="text-sm font-semibold text-dark-100 mb-3">Bulk Actions</h4>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Reset to Recommended */}
          {trackCountMode !== 'tier-based' && (
            <Button variant="secondary" size="sm" onClick={onResetToRecommended} className="flex-1">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reset to Recommended
            </Button>
          )}

          {/* Remove Selected */}
          {selectedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRemoveSelected}
              className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Remove Selected ({selectedCount})
            </Button>
          )}
        </div>

        {/* Apply to Tier (only in per-artist mode with ranking) */}
        {trackCountMode === 'per-artist' && hasRanking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-dark-700 space-y-3"
          >
            <p className="text-xs text-dark-400 mb-2">
              Apply a track count (1–25) to all artists in a tier:
            </p>

            {availableTiers.map((tier) => {
              if (!tier) return null;

              const tierLabels = {
                headliner: 'Headliners',
                'sub-headliner': 'Sub-Headliners',
                'mid-tier': 'Mid-Tier',
                undercard: 'Undercard',
              };

              const tierIcons = {
                headliner: '★',
                'sub-headliner': '☆',
                'mid-tier': '•',
                undercard: '·',
              };

              const tierLabel = tierLabels[tier as keyof typeof tierLabels];
              const artistCount = artists.filter((a) => a.tier === tier).length;
              const stagedCount = stagedTierCounts[tier] ?? DEFAULT_TIER_COUNTS[tier];

              return (
                <div
                  key={tier}
                  className="flex flex-wrap items-center gap-3 p-2 bg-dark-800/50 rounded"
                >
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-lg">{tierIcons[tier as keyof typeof tierIcons]}</span>
                    <span className="text-sm text-dark-200">{tierLabel}</span>
                    <span className="text-xs text-dark-500">({artistCount})</span>
                  </div>

                  <TrackCountInput
                    value={stagedCount}
                    onCommit={(count) => onStagedTierCountChange(tier, count)}
                    label={`Track count for ${tierLabel} tier`}
                  />

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onApplyToTier(tier, stagedCount)}
                    aria-label={`Apply track count to ${tierLabel}`}
                  >
                    Apply
                  </Button>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>
    </Card>
  );
}
