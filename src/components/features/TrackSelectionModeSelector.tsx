import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';
import type { TrackSelectionMode } from '@/types';

interface TrackSelectionModeSelectorProps {
  mode: TrackSelectionMode;
  onModeChange: (mode: TrackSelectionMode) => void;
  disabled?: boolean;
}

export default function TrackSelectionModeSelector({
  mode,
  onModeChange,
  disabled = false,
}: TrackSelectionModeSelectorProps) {
  const modes: Array<{ value: TrackSelectionMode; label: string; description: string }> = [
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
    { value: 'deep-cuts', label: 'Deep Cuts', description: 'Hidden gems and fan favorites' },
  ];

  return (
    <Card variant="default" className="rounded-2xl border-white/10 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h4 className="text-lg font-semibold text-white">Track selection</h4>
        <span className="text-xs text-dark-300">Choose the mood</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {modes.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onModeChange(option.value)}
            disabled={disabled}
            aria-pressed={mode === option.value}
            className={cn(
              'min-h-[76px] rounded-xl border px-3 py-3 text-left transition-colors focus-ring',
              mode === option.value
                ? 'border-[#f29520] bg-[#f29520]/10 text-white'
                : 'border-white/10 bg-white/[0.03] text-white/75 hover:border-white/25 hover:bg-white/[0.06]',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <span className="block text-sm font-semibold leading-tight">{option.label}</span>
            <span className="mt-1 block text-xs leading-snug text-dark-300">
              {option.description}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-dark-300">
        Different modes help create unique playlists even with the same artists.
      </p>
    </Card>
  );
}
