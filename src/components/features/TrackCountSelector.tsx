import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Card, { CardContent } from '@/components/ui/Card';

export type TrackCountMode = 'tier-based' | 'custom';

interface TrackCountSelectorProps {
  mode: TrackCountMode;
  customCount: number;
  onModeChange: (mode: TrackCountMode) => void;
  onCustomCountChange: (count: number) => void;
  disabled?: boolean;
}

/**
 * Component for selecting how many tracks per artist to fetch from Spotify.
 * Supports tier-based (automatic based on artist prominence) or custom count (same for all).
 */
export default function TrackCountSelector({
  mode,
  customCount,
  onModeChange,
  onCustomCountChange,
  disabled = false,
}: TrackCountSelectorProps) {
  const trackCounts = [1, 2, 3, 5, 10];

  return (
    <Card variant="glass" className="overflow-hidden">
      <CardContent className="p-6">
        <h4 className="text-lg font-semibold text-dark-100 mb-4">Tracks Per Artist</h4>

        {/* Mode Selection */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <button
            onClick={() => onModeChange('tier-based')}
            disabled={disabled}
            className={cn(
              'flex-1 p-4 rounded-lg transition-all duration-200',
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
                <div className="font-semibold text-dark-100 mb-1">Smart (Tier-based)</div>
                <div className="text-sm text-dark-400">
                  Headliners get 10 tracks, sub-headliners 5, mid-tier 3, undercard 1
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onModeChange('custom')}
            disabled={disabled}
            className={cn(
              'flex-1 p-4 rounded-lg transition-all duration-200',
              'border-2 text-left',
              mode === 'custom'
                ? 'border-accent-500 bg-accent-500/10'
                : 'border-dark-700 bg-dark-800 hover:border-dark-600',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                  mode === 'custom'
                    ? 'border-accent-500 bg-accent-500'
                    : 'border-dark-600 bg-dark-800'
                )}
              >
                {mode === 'custom' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-dark-100 mb-1">Custom</div>
                <div className="text-sm text-dark-400">Same number of tracks for all artists</div>
              </div>
            </div>
          </button>
        </div>

        {/* Custom Count Selector */}
        {mode === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1">
              <label className="block text-sm font-medium text-dark-200 mb-3">
                Number of tracks per artist
              </label>
              <div className="flex gap-2">
                {trackCounts.map((count) => (
                  <button
                    key={count}
                    onClick={() => onCustomCountChange(count)}
                    disabled={disabled}
                    className={cn(
                      'flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200',
                      customCount === count
                        ? 'bg-accent-500 text-white shadow-glow'
                        : 'bg-dark-800 text-dark-300 hover:bg-dark-700 hover:text-dark-100',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="text-xs text-dark-400 mt-3">
                {customCount === 1
                  ? 'One top track per artist'
                  : `Top ${customCount} tracks per artist`}
              </p>
            </div>
          </motion.div>
        )}

        {/* Info for tier-based mode */}
        {mode === 'tier-based' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-3 bg-dark-800/50 rounded-lg border border-dark-700"
          >
            <p className="text-xs text-dark-400">
              The number of tracks is automatically determined by each artist&apos;s visual
              prominence on the poster
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
