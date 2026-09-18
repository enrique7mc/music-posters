import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Card, { CardContent } from '@/components/ui/Card';
import TrackCountInput from './TrackCountInput';

export type TrackCountMode = 'tier-based' | 'custom-per-tier' | 'per-artist';

export interface TierCounts {
  headliner: number;
  'sub-headliner': number;
  'mid-tier': number;
  undercard: number;
}

interface TrackCountModeSelectorProps {
  mode: TrackCountMode;
  tierCounts: TierCounts;
  onModeChange: (mode: TrackCountMode) => void;
  onTierCountChange: (tier: keyof TierCounts, count: number) => void;
  disabled?: boolean;
  /**
   * Show the tier-based and custom-per-tier modes. Defaults to true; pass
   * false for manually entered lineups, which have no tiers.
   */
  showTierModes?: boolean;
}

export const DEFAULT_TIER_COUNTS: TierCounts & { default: number } = {
  headliner: 10,
  'sub-headliner': 5,
  'mid-tier': 3,
  undercard: 1,
  default: 3, // For Vision API (no tier)
};

/**
 * Component for selecting track count mode on the Review Artists page.
 * Supports tier-based (recommended), custom-per-tier, or per-artist customization.
 */
export default function TrackCountModeSelector({
  mode,
  tierCounts,
  onModeChange,
  onTierCountChange,
  disabled = false,
  showTierModes = true,
}: TrackCountModeSelectorProps) {
  const tierFields: Array<{
    tier: keyof TierCounts;
    id: string;
    label: string;
    // Accessible names include the visible label text (WCAG 2.5.3 Label in Name).
    inputLabel: string;
  }> = [
    {
      tier: 'headliner',
      id: 'tier-count-headliner',
      label: 'Headliners',
      inputLabel: 'Headliners track count',
    },
    {
      tier: 'sub-headliner',
      id: 'tier-count-sub-headliner',
      label: 'Sub-headliners',
      inputLabel: 'Sub-headliners track count',
    },
    {
      tier: 'mid-tier',
      id: 'tier-count-mid-tier',
      label: 'Mid-tier',
      inputLabel: 'Mid-tier track count',
    },
    {
      tier: 'undercard',
      id: 'tier-count-undercard',
      label: 'Undercard',
      inputLabel: 'Undercard track count',
    },
  ];

  return (
    <Card variant="glass" className="overflow-hidden">
      <CardContent className="p-6">
        <h4 className="text-lg font-semibold text-dark-100 mb-4">Track Count Mode</h4>

        {/* Mode Selection */}
        <div className="flex flex-col gap-3 mb-4">
          {/* Recommended (Tier-based) */}
          {showTierModes && (
            <button
              onClick={() => onModeChange('tier-based')}
              disabled={disabled}
              className={cn(
                'p-4 rounded-lg transition-all duration-200',
                'border-2 text-left',
                mode === 'tier-based'
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-dark-700 bg-dark-800 hover:border-dark-600',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    mode === 'tier-based'
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-dark-600 bg-dark-800'
                  )}
                >
                  {mode === 'tier-based' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2.5 h-2.5 rounded-full bg-white"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-dark-100 mb-1">Recommended (Tier-based)</div>
                  <div className="text-sm text-dark-400">
                    Headliners: 10 • Sub-headliners: 5 • Mid-tier: 3 • Undercard: 1
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Custom Per Tier */}
          {showTierModes && (
            <button
              onClick={() => onModeChange('custom-per-tier')}
              disabled={disabled}
              className={cn(
                'p-4 rounded-lg transition-all duration-200',
                'border-2 text-left',
                mode === 'custom-per-tier'
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-dark-700 bg-dark-800 hover:border-dark-600',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    mode === 'custom-per-tier'
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-dark-600 bg-dark-800'
                  )}
                >
                  {mode === 'custom-per-tier' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2.5 h-2.5 rounded-full bg-white"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-dark-100 mb-1">Custom Per Tier</div>
                  <div className="text-sm text-dark-400">
                    Set different track counts for each tier
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Per-Artist */}
          <button
            onClick={() => onModeChange('per-artist')}
            disabled={disabled}
            className={cn(
              'p-4 rounded-lg transition-all duration-200',
              'border-2 text-left',
              mode === 'per-artist'
                ? 'border-accent-500 bg-accent-500/10'
                : 'border-dark-700 bg-dark-800 hover:border-dark-600',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                  mode === 'per-artist'
                    ? 'border-accent-500 bg-accent-500'
                    : 'border-dark-600 bg-dark-800'
                )}
              >
                {mode === 'per-artist' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-dark-100 mb-1">Per-Artist</div>
                <div className="text-sm text-dark-400">
                  Customize track count for each artist individually
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Custom Per Tier Controls */}
        {mode === 'custom-per-tier' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-2">
              <p className="text-xs text-dark-400">Whole numbers, 1–25 tracks per tier.</p>
              {tierFields.map(({ tier, id, label, inputLabel }) => (
                <div key={tier}>
                  <label htmlFor={id} className="block text-sm font-medium text-dark-200 mb-2">
                    {label}
                  </label>
                  <TrackCountInput
                    id={id}
                    value={tierCounts[tier]}
                    onCommit={(count) => onTierCountChange(tier, count)}
                    label={inputLabel}
                    disabled={disabled}
                    className="w-24"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Info for per-artist mode */}
        {mode === 'per-artist' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-3 bg-dark-800/50 rounded-lg border border-dark-700"
          >
            <p className="text-xs text-dark-400">
              Customize track counts (1–25 tracks) for each artist individually in the list below
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
