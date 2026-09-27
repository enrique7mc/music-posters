import { motion } from 'framer-motion';
import { Artist, ArtistInputSource } from '@/types';
import { TierBadge } from '../ui/Badge';
import Card from '../ui/Card';
import Checkbox from '../ui/Checkbox';
import Button from '../ui/Button';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';
import type { TrackCountMode } from './TrackCountModeSelector';
import TrackCountInput from './TrackCountInput';

interface EditableArtistListProps {
  artists: Artist[];
  provider: 'vision' | 'gemini' | 'hybrid';
  trackCountMode: TrackCountMode;
  perArtistCounts: Record<string, number>;
  selectedArtists: Set<string>;
  onToggleSelection: (artistName: string) => void;
  onRemoveArtist: (artistName: string) => void;
  onPerArtistCountChange: (artistName: string, count: number) => void;
  /** How the lineup entered the flow. Defaults to 'poster' for older sessions. */
  inputSource?: ArtistInputSource;
}

export default function EditableArtistList({
  artists,
  provider,
  trackCountMode,
  perArtistCounts,
  selectedArtists,
  onToggleSelection,
  onRemoveArtist,
  onPerArtistCountChange,
  inputSource = 'poster',
}: EditableArtistListProps) {
  // Calculate tier counts for summary
  const tierCounts = artists.reduce(
    (acc, artist) => {
      if (artist.tier) {
        acc[artist.tier] = (acc[artist.tier] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const isManual = inputSource === 'text';
  const hasRanking = !isManual && (provider === 'gemini' || provider === 'hybrid');

  return (
    <div className="surface space-y-4 p-4 sm:p-5">
      {/* Header with provider badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight text-white">
          Review Artists ({artists.length})
        </h3>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50">
          {isManual
            ? 'Entered manually'
            : provider === 'hybrid'
              ? 'Hybrid AI'
              : provider === 'gemini'
                ? 'Gemini AI'
                : 'Vision API'}
        </span>
      </div>

      {/* Tier summary cards (only for Gemini/Hybrid) */}
      {hasRanking && Object.keys(tierCounts).length > 0 && (
        <motion.div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {[
            { tier: 'headliner', label: 'Headliners', icon: '★' },
            { tier: 'sub-headliner', label: 'Sub-Headliners', icon: '☆' },
            { tier: 'mid-tier', label: 'Mid-Tier', icon: '•' },
            { tier: 'undercard', label: 'Undercard', icon: '·' },
          ].map(({ tier, label, icon }) => (
            <motion.div key={tier} variants={staggerItem}>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                <span className="text-sm text-[#f29520]" aria-hidden>
                  {icon}
                </span>
                <span className="text-sm font-semibold tabular-nums text-white">
                  {tierCounts[tier] || 0}
                </span>
                <span className="truncate text-xs text-dark-300">{label}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Artist list */}
      <motion.div
        className="max-h-[600px] space-y-2 overflow-y-auto pr-1"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {artists.map((artist, index) => (
          <motion.div
            key={artist.spotifyId || `${artist.name}-${artist.tier || 'unknown'}`}
            variants={staggerItem}
          >
            <Card
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.055] sm:flex-nowrap sm:px-4',
                selectedArtists.has(artist.name) && 'border-[#f29520]/60 bg-[#f29520]/[0.06]'
              )}
            >
              {/* Checkbox for multi-select */}
              <div className="flex-shrink-0">
                <Checkbox
                  checked={selectedArtists.has(artist.name)}
                  onChange={() => onToggleSelection(artist.name)}
                  aria-label={`Select ${artist.name}`}
                />
              </div>

              {/* Artist info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="w-7 flex-shrink-0 text-xs tabular-nums text-dark-300">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h4
                    className={`font-semibold truncate ${
                      artist.weight && artist.weight >= 8
                        ? 'text-base text-white'
                        : artist.weight && artist.weight >= 6
                          ? 'text-sm text-white'
                          : 'text-sm text-white/75'
                    }`}
                  >
                    {artist.name}
                  </h4>
                </div>
              </div>

              {/* Track count selector (only in per-artist mode) */}
              {trackCountMode === 'per-artist' && (
                <div className="flex-shrink-0">
                  <TrackCountInput
                    value={perArtistCounts[artist.name] ?? 3}
                    onCommit={(count) => onPerArtistCountChange(artist.name, count)}
                    label={`Track count for ${artist.name}`}
                  />
                </div>
              )}

              {/* Tier/Weight indicators */}
              <div className="flex flex-shrink-0 items-center gap-2">
                {/* Weight indicator */}
                {artist.weight !== undefined && (
                  <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-dark-300">
                    {artist.weight}/10
                  </span>
                )}

                {/* Tier badge */}
                {artist.tier && <TierBadge tier={artist.tier} />}
              </div>

              {/* Remove button */}
              <div className="flex-shrink-0">
                <button
                  onClick={() => onRemoveArtist(artist.name)}
                  className="rounded-lg p-2 text-dark-300 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-ring"
                  aria-label={`Remove ${artist.name}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Empty state */}
      {artists.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg text-dark-300">No artists to display</p>
          <p className="mt-2 text-sm text-dark-300">
            {isManual
              ? 'All artists have been removed. Go back and enter artists again to start over.'
              : 'All artists have been removed. Upload a new poster to start over.'}
          </p>
        </div>
      )}

      {/* Instructions */}
      {artists.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs text-dark-300">
            {isManual
              ? 'You entered these artists manually. Adjust track counts or remove artists before continuing.'
              : hasRanking
                ? 'Artists are ranked by visual prominence. Remove unwanted artists or adjust track counts before continuing.'
                : 'Review the extracted artists. Remove any incorrect detections before continuing.'}
          </p>
        </div>
      )}
    </div>
  );
}
