import { motion } from 'framer-motion';
import { Artist } from '@/types';
import Card from '../ui/Card';
import { fadeIn } from '@/lib/animations';
import type { TrackCountMode, TierCounts } from './TrackCountModeSelector';

interface PlaylistSummaryPreviewProps {
  artists: Artist[];
  trackCountMode: TrackCountMode;
  tierCounts: TierCounts;
  perArtistCounts: Record<string, number>;
}

const DEFAULT_TIER_COUNTS = {
  headliner: 10,
  'sub-headliner': 5,
  'mid-tier': 3,
  undercard: 1,
  default: 3, // For Vision API (no tier)
};

function calculateEstimatedTracks(
  artists: Artist[],
  mode: TrackCountMode,
  tierCounts: TierCounts,
  perArtistCounts: Record<string, number>
): number {
  if (mode === 'tier-based') {
    // Use default tier-based counts
    return artists.reduce((total, artist) => {
      if (!artist.tier) return total + DEFAULT_TIER_COUNTS.default;
      return total + DEFAULT_TIER_COUNTS[artist.tier];
    }, 0);
  } else if (mode === 'custom-per-tier') {
    // Use custom tier counts
    return artists.reduce((total, artist) => {
      if (!artist.tier) return total + DEFAULT_TIER_COUNTS.default;
      return total + tierCounts[artist.tier];
    }, 0);
  } else {
    // Per-artist mode
    return artists.reduce((total, artist) => {
      const count = perArtistCounts[artist.name] || DEFAULT_TIER_COUNTS.default;
      return total + count;
    }, 0);
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `~${hours}h ${remainingMinutes}m` : `~${hours}h`;
}

export default function PlaylistSummaryPreview({
  artists,
  trackCountMode,
  tierCounts,
  perArtistCounts,
}: PlaylistSummaryPreviewProps) {
  const estimatedTracks = calculateEstimatedTracks(
    artists,
    trackCountMode,
    tierCounts,
    perArtistCounts
  );

  // Estimate: average song is ~3.5 minutes
  const estimatedMinutes = Math.round(estimatedTracks * 3.5);
  const avgTracksPerArtist = artists.length > 0 ? (estimatedTracks / artists.length).toFixed(1) : 0;

  // Warning thresholds
  const isLarge = estimatedTracks > 150;
  const isVeryLarge = estimatedTracks > 300;

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible">
      <Card variant="elevated" className="overflow-hidden">
        <div className="p-6">
          <h4 className="text-lg font-semibold text-dark-100 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-accent-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
            Playlist Preview
          </h4>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-dark-800/50 rounded-lg">
              <div className="text-2xl font-bold text-accent-400">{artists.length}</div>
              <div className="text-xs text-dark-400 mt-1">
                {artists.length === 1 ? 'Artist' : 'Artists'}
              </div>
            </div>

            <div className="text-center p-3 bg-dark-800/50 rounded-lg">
              <div className="text-2xl font-bold text-accent-400">~{estimatedTracks}</div>
              <div className="text-xs text-dark-400 mt-1">
                {estimatedTracks === 1 ? 'Track' : 'Tracks'}
              </div>
            </div>

            <div className="text-center p-3 bg-dark-800/50 rounded-lg">
              <div className="text-2xl font-bold text-accent-400">
                {formatDuration(estimatedMinutes)}
              </div>
              <div className="text-xs text-dark-400 mt-1">Duration</div>
            </div>
          </div>

          {/* Additional info */}
          <div className="text-sm text-dark-400 text-center mb-3">
            Average: {avgTracksPerArtist} tracks per artist
          </div>

          {/* Warnings */}
          {isVeryLarge && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
            >
              <div className="flex items-start gap-2 text-sm text-red-400">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <div className="font-semibold">Very Large Playlist</div>
                  <div className="text-xs mt-1">
                    This playlist will take 3-5 minutes to generate. Consider reducing track counts.
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {isLarge && !isVeryLarge && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
            >
              <div className="flex items-start gap-2 text-sm text-yellow-400">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <div className="font-semibold">Large Playlist</div>
                  <div className="text-xs mt-1">
                    This playlist will take 2-3 minutes to generate due to Spotify API rate limits.
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {!isLarge && estimatedTracks > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-accent-500/10 border border-accent-500/30 rounded-lg"
            >
              <div className="flex items-center gap-2 text-sm text-accent-400">
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <span className="font-semibold">Ready to create!</span> Expected generation time:
                  ~1-2 minutes
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
