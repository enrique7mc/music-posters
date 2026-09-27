import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';
import TrackCountInput from './TrackCountInput';
import type { TierCounts, TrackCountMode } from '@/lib/track-counts';

// Shared with src/lib (draft persistence); re-exported here for the pages and
// tests that already import them from this component.
export { DEFAULT_TIER_COUNTS } from '@/lib/track-counts';
export type { TierCounts, TrackCountMode } from '@/lib/track-counts';

interface TrackCountModeSelectorProps {
  mode: TrackCountMode;
  tierCounts: TierCounts;
  onModeChange: (mode: TrackCountMode) => void;
  onTierCountChange: (tier: keyof TierCounts, count: number) => void;
  disabled?: boolean;
  showTierModes?: boolean;
  showTierControls?: boolean;
}

interface TierCountControlsProps {
  tierCounts: TierCounts;
  onTierCountChange: (tier: keyof TierCounts, count: number) => void;
  disabled?: boolean;
}

const tierFields: Array<{
  tier: keyof TierCounts;
  id: string;
  label: string;
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

export function TierCountControls({
  tierCounts,
  onTierCountChange,
  disabled = false,
}: TierCountControlsProps) {
  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">Custom counts by tier</h4>
        <p className="text-xs text-dark-300">Whole numbers, 1–25 tracks per tier.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 md:grid-cols-4">
        {tierFields.map(({ tier, id, label, inputLabel }) => (
          <div
            key={tier}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-2.5 sm:flex-col sm:items-start"
          >
            <label htmlFor={id} className="text-xs font-medium text-white/70">
              {label}
            </label>
            <TrackCountInput
              id={id}
              value={tierCounts[tier]}
              onCommit={(count) => onTierCountChange(tier, count)}
              label={inputLabel}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrackCountModeSelector({
  mode,
  tierCounts,
  onModeChange,
  onTierCountChange,
  disabled = false,
  showTierModes = true,
  showTierControls = true,
}: TrackCountModeSelectorProps) {
  const modes: Array<{ value: TrackCountMode; label: string; description: string }> = [
    {
      value: 'tier-based',
      label: 'Recommended (Tier-based)',
      description: '10 · 5 · 3 · 1 tracks by tier',
    },
    {
      value: 'custom-per-tier',
      label: 'Custom Per Tier',
      description: 'Set a count for each tier',
    },
    { value: 'per-artist', label: 'Per-Artist', description: 'Edit counts in the lineup' },
  ];

  return (
    <Card variant="default" className="rounded-2xl border-white/10 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h4 className="text-lg font-semibold text-white">Tracks per artist</h4>
        <span className="text-xs text-dark-300">01–25 each</span>
      </div>
      <div className={cn('grid gap-2', showTierModes ? 'sm:grid-cols-3' : 'sm:grid-cols-1')}>
        {modes
          .filter((option) => showTierModes || option.value === 'per-artist')
          .map((option) => (
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
      {mode === 'custom-per-tier' && showTierControls && (
        <div className="mt-4">
          <TierCountControls
            tierCounts={tierCounts}
            onTierCountChange={onTierCountChange}
            disabled={disabled}
          />
        </div>
      )}
      {mode === 'per-artist' && (
        <p className="mt-3 text-xs text-dark-300">
          Customize track counts (1–25 tracks) for each artist individually in the list below
        </p>
      )}
    </Card>
  );
}
