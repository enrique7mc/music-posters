import { motion } from 'framer-motion';
import { Artist } from '@/types';
import { TierBadge } from '../ui/Badge';
import Card from '../ui/Card';
import { staggerContainer, staggerItem } from '@/lib/animations';
import {
  HeadlinerIcon,
  SubHeadlinerIcon,
  CustomMusicNote,
  Sparkles,
} from '@/components/icons';

interface ArtistListProps {
  artists: Artist[];
  provider: 'vision' | 'gemini' | 'hybrid';
}

export default function ArtistList({ artists, provider }: ArtistListProps) {
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

  return (
    <div className="space-y-6">
      {/* Header with provider badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-dark-50">Extracted Artists ({artists.length})</h3>
        <span className="text-xs text-dark-400 bg-dark-800 px-3 py-1.5 rounded-md border border-dark-700">
          {provider === 'hybrid'
            ? 'Hybrid AI'
            : provider === 'gemini'
              ? 'Gemini AI'
              : 'Vision API'}
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
            { tier: 'headliner', label: 'Headliners', Icon: HeadlinerIcon },
            { tier: 'sub-headliner', label: 'Sub-Headliners', Icon: SubHeadlinerIcon },
            { tier: 'mid-tier', label: 'Mid-Tier', Icon: CustomMusicNote },
            { tier: 'undercard', label: 'Undercard', Icon: CustomMusicNote },
          ].map(({ tier, label, Icon }) => (
            <motion.div key={tier} variants={staggerItem}>
              <Card variant="glass" className="p-3 text-center">
                <div className="mb-1 flex justify-center">
                  <Icon className="w-8 h-8 text-accent-400" />
                </div>
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
            <Card hover className="p-4 flex items-center justify-between gap-4">
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
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-dark-900/50 rounded-lg border border-dark-800">
        <p className="text-sm text-dark-400 flex items-center gap-2">
          {hasRanking ? (
            <>
              <Sparkles className="w-4 h-4 text-accent-400 flex-shrink-0" />
              <span>
                Artists are ranked by visual prominence on the poster. Headliners get more tracks
                in your playlist.
              </span>
            </>
          ) : (
            <>
              <CustomMusicNote className="w-4 h-4 text-accent-400 flex-shrink-0" />
              <span>All artists extracted from the poster. Review and create your playlist below.</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
