import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Card, { CardContent } from '@/components/ui/Card';
import type { TrackSelectionMode } from '@/types';

interface TrackSelectionModeSelectorProps {
  mode: TrackSelectionMode;
  onModeChange: (mode: TrackSelectionMode) => void;
  disabled?: boolean;
}

/**
 * Component for selecting track selection mode on the Review Artists page.
 * Controls whether to fetch popular hits, balanced mix, or deep cuts.
 */
export default function TrackSelectionModeSelector({
  mode,
  onModeChange,
  disabled = false,
}: TrackSelectionModeSelectorProps) {
  const modes: Array<{
    value: TrackSelectionMode;
    label: string;
    description: string;
  }> = [
    {
      value: 'popular',
      label: 'Popular Hits',
      description: 'Top chart-topping tracks from each artist',
    },
    {
      value: 'balanced',
      label: 'Balanced Mix',
      description: 'Mix of popular tracks and lesser-known favorites',
    },
    {
      value: 'deep-cuts',
      label: 'Deep Cuts',
      description: 'Hidden gems and fan favorites',
    },
  ];

  return (
    <Card variant="glass" className="overflow-hidden">
      <CardContent className="p-6">
        <h4 className="text-lg font-semibold text-dark-100 mb-4">Track Selection</h4>

        <div className="flex flex-col gap-3">
          {modes.map((option) => (
            <button
              key={option.value}
              onClick={() => onModeChange(option.value)}
              disabled={disabled}
              className={cn(
                'p-4 rounded-lg transition-all duration-200',
                'border-2 text-left',
                mode === option.value
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-dark-700 bg-dark-800 hover:border-dark-600',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    mode === option.value
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-dark-600 bg-dark-800'
                  )}
                >
                  {mode === option.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2.5 h-2.5 rounded-full bg-white"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-dark-100 mb-1">{option.label}</div>
                  <div className="text-sm text-dark-400">{option.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 p-3 bg-dark-800/50 rounded-lg border border-dark-700">
          <p className="text-xs text-dark-400">
            💡 Tip: Different modes help create unique playlists even with the same artists
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
