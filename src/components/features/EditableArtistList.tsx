import { motion } from 'framer-motion';
import { Artist } from '@/types';
import { TierBadge } from '../ui/Badge';
import Card from '../ui/Card';
import Checkbox from '../ui/Checkbox';
import Button from '../ui/Button';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';
import type { TrackCountMode } from './TrackCountModeSelector';

interface EditableArtistListProps {
  artists: Artist[];
  provider: 'vision' | 'gemini' | 'hybrid';
  trackCountMode: TrackCountMode;
  perArtistCounts: Record<string, number>;
  selectedArtists: Set<string>;
  onToggleSelection: (artistName: string) => void;
  onRemoveArtist: (artistName: string) => void;
  onPerArtistCountChange: (artistName: string, count: number) => void;
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

  const hasRanking = provider === 'gemini' || provider === 'hybrid';
  const trackCountOptions = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Header with provider badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-dark-50">Review Artists ({artists.length})</h3>
        <span className="text-xs text-dark-400 bg-dark-800 px-3 py-1.5 rounded-md border border-dark-700">
          {provider === 'hybrid'
            ? '🔄 Hybrid AI'
            : provider === 'gemini'
              ? '🤖 Gemini AI'
              : '👁️ Vision API'}
        </span>
      </div>

      {/* Tier summary cards (only for Gemini/Hybrid) */}
      {hasRanking && Object.keys(tierCounts).length > 0 && (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {[
            { tier: 'headliner', label: 'Headliners', icon: '★' },
            { tier: 'sub-headliner', label: 'Sub-Headliners', icon: '⭐' },
            { tier: 'mid-tier', label: 'Mid-Tier', icon: '•' },
            { tier: 'undercard', label: 'Undercard', icon: '·' },
          ].map(({ tier, label, icon }) => (
            <motion.div key={tier} variants={staggerItem}>
              <Card variant="glass" className="p-3 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="text-xl font-bold text-dark-100">{tierCounts[tier] || 0}</div>
                <div className="text-xs text-dark-400">{label}</div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Artist list */}
      <motion.div
        className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide"
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
              hover
              className={cn(
                'p-4 flex items-center gap-4 transition-all',
                selectedArtists.has(artist.name) && 'ring-2 ring-accent-500/50'
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
                  <span className="text-sm text-dark-500 flex-shrink-0">#{index + 1}</span>
                  <h4
                    className={`font-semibold truncate ${
                      artist.weight && artist.weight >= 8
                        ? 'text-lg text-dark-50'
                        : artist.weight && artist.weight >= 6
                          ? 'text-base text-dark-100'
                          : 'text-sm text-dark-200'
                    }`}
                  >
                    {artist.name}
                  </h4>
                </div>
              </div>

              {/* Track count selector (only in per-artist mode) */}
              {trackCountMode === 'per-artist' && (
                <div className="flex-shrink-0">
                  <select
                    value={perArtistCounts[artist.name] || 3}
                    onChange={(e) => onPerArtistCountChange(artist.name, parseInt(e.target.value))}
                    className="px-3 py-2 bg-dark-800 border border-dark-700 rounded text-sm text-dark-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                    aria-label={`Track count for ${artist.name}`}
                  >
                    {trackCountOptions.map((count) => (
                      <option key={count} value={count}>
                        {count} {count === 1 ? 'track' : 'tracks'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tier/Weight indicators */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Weight indicator */}
                {artist.weight !== undefined && (
                  <span className="text-xs text-dark-400 bg-dark-800 px-2 py-1 rounded">
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
                  className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
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
          <p className="text-dark-400 text-lg">No artists to display</p>
          <p className="text-dark-500 text-sm mt-2">
            All artists have been removed. Upload a new poster to start over.
          </p>
        </div>
      )}

      {/* Instructions */}
      {artists.length > 0 && (
        <div className="mt-6 p-4 bg-dark-900/50 rounded-lg border border-dark-800">
          <p className="text-sm text-dark-400">
            {hasRanking
              ? '✨ Artists are ranked by visual prominence. Remove unwanted artists or adjust track counts before continuing.'
              : '📋 Review the extracted artists. Remove any incorrect detections before continuing.'}
          </p>
        </div>
      )}
    </div>
  );
}
