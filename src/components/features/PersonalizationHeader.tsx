import { motion } from 'framer-motion';
import { Artist } from '@/types';
import Card from '../ui/Card';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fadeIn, staggerContainer, staggerItem } from '@/lib/animations';

/** Summary of the personalize pass, surfaced to the user. */
export interface PersonalizationResult {
  lovedCount: number;
  gemCount: number;
  degraded: boolean;
}

interface PersonalizationHeaderProps {
  /** True while the /api/personalize call is in flight. */
  personalizing: boolean;
  /** Result of the personalize pass, or null before it lands. */
  result: PersonalizationResult | null;
  /** The (possibly edited) lineup; affinity fields are read off it. */
  artists: Artist[];
}

function pct(confidence?: number): number {
  return Math.round((confidence ?? 0) * 100);
}

/**
 * Light, additive header that frames the personalization magic on the
 * review-artists screen ("8 you love, 5 gems"). Per locked decision #6 there are
 * NO toggles here — affinity auto-derives the per-artist track mode downstream in
 * search-tracks. This header is purely informational.
 *
 * Render states:
 *  - personalizing → a quiet "matching your library" loading card.
 *  - result with at least one loved/gem (and not degraded) → the summary.
 *  - otherwise (degraded, or nothing found) → nothing, keeping the screen plain.
 */
export default function PersonalizationHeader({
  personalizing,
  result,
  artists,
}: PersonalizationHeaderProps) {
  if (personalizing) {
    return (
      <motion.div variants={fadeIn} initial="hidden" animate="visible">
        <Card variant="glass" className="p-5 flex items-center gap-4">
          <LoadingSpinner size="sm" />
          <div>
            <p className="text-sm font-semibold text-dark-100">Personalizing your lineup…</p>
            <p className="text-xs text-dark-400 mt-0.5">
              Matching the lineup against your Apple Music library and finding hidden gems.
            </p>
          </div>
        </Card>
      </motion.div>
    );
  }

  // Nothing useful to show — keep the screen plain (degraded or no matches).
  if (!result || result.degraded) {
    return null;
  }

  const loved = artists.filter((a) => a.affinity === 'loved');
  const gems = artists
    .filter((a) => a.affinity === 'gem')
    .sort((a, b) => (b.affinityConfidence ?? 0) - (a.affinityConfidence ?? 0));

  if (loved.length === 0 && gems.length === 0) {
    return null;
  }

  // Summary line: "8 you love · 5 gems", omitting any zero side.
  const parts: string[] = [];
  if (loved.length > 0) {
    parts.push(`${loved.length} you already love`);
  }
  if (gems.length > 0) {
    parts.push(`${gems.length} hidden ${gems.length === 1 ? 'gem' : 'gems'}`);
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible">
      <Card variant="elevated" className="overflow-hidden">
        <div className="p-6 space-y-5">
          {/* Title + summary */}
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              ✨
            </span>
            <div>
              <h3 className="text-xl font-bold text-dark-50">Personalized for you</h3>
              <p className="text-sm text-dark-400 mt-1">
                {parts.join(' · ')} — your playlist is tuned to your taste.
              </p>
            </div>
          </div>

          {/* Artists you already love */}
          {loved.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent-400" aria-hidden>
                  ♥
                </span>
                <h4 className="text-sm font-semibold text-dark-100">Artists you already love</h4>
              </div>
              <p className="text-xs text-dark-400 mb-3">
                Already in your library — we&apos;ll reach for their deep cuts.
              </p>
              <motion.div
                className="flex flex-wrap gap-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {loved.map((artist) => (
                  <motion.span
                    key={artist.name}
                    variants={staggerItem}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent-500/10 text-accent-300 border border-accent-500/30"
                  >
                    <span className="text-xs" aria-hidden>
                      ♥
                    </span>
                    {artist.name}
                  </motion.span>
                ))}
              </motion.div>
            </div>
          )}

          {/* Hidden gems */}
          {gems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-muted-300" aria-hidden>
                  ◆
                </span>
                <h4 className="text-sm font-semibold text-dark-100">Hidden gems</h4>
              </div>
              <p className="text-xs text-dark-400 mb-3">
                New to you, but on-taste — we&apos;ll grab their best-known tracks.
              </p>
              <motion.div
                className="space-y-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {gems.map((artist) => (
                  <motion.div
                    key={artist.name}
                    variants={staggerItem}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted-500/10 border border-muted-500/30"
                  >
                    <span className="text-muted-300 mt-0.5" aria-hidden>
                      ◆
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-dark-100">{artist.name}</span>
                        {artist.affinityConfidence !== undefined && (
                          <span className="text-xs text-muted-300 bg-muted-500/10 px-2 py-0.5 rounded border border-muted-500/30">
                            {pct(artist.affinityConfidence)}% match
                          </span>
                        )}
                      </div>
                      {artist.affinityReason && (
                        <p className="text-xs text-dark-400 mt-1">{artist.affinityReason}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
