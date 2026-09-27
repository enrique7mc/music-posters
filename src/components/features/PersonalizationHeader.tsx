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
 * review-artists screen ("8 you already love · 5 hidden gems"). Per locked
 * decision #6 there are
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
        <Card
          variant="default"
          role="status"
          aria-live="polite"
          className="flex items-center gap-4 rounded-2xl border-white/10 p-4 sm:px-5"
        >
          <LoadingSpinner size="sm" className="mx-0 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">
              Finding your favorites and hidden gems…
            </p>
            <p className="mt-0.5 text-xs text-dark-300">
              Matching this lineup against your Apple Music library. Your settings are ready below.
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

  // Summary line: "8 you already love · 5 hidden gems", omitting any zero side.
  const parts: string[] = [];
  if (loved.length > 0) {
    parts.push(`${loved.length} you already love`);
  }
  if (gems.length > 0) {
    parts.push(`${gems.length} hidden ${gems.length === 1 ? 'gem' : 'gems'}`);
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible">
      <Card variant="default" className="overflow-hidden rounded-2xl border-white/10">
        <div className="p-4 sm:px-5 sm:py-4">
          <div>
            <p className="eyebrow mb-1">Curated from your library</p>
            <h3 className="text-lg font-semibold text-white">Personalized for you</h3>
            <p className="mt-0.5 text-xs text-dark-300">
              {parts.join(' · ')} — your playlist is tuned to your taste.
            </p>
          </div>

          <details className="group mt-3 border-t border-white/10 pt-3">
            <summary className="w-fit cursor-pointer text-xs font-semibold text-[#f29520] focus-ring">
              See your recommendations
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-6">
              {/* Artists you already love */}
              {loved.length > 0 && (
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[#f29520]" aria-hidden>
                      ♥
                    </span>
                    <h4 className="text-sm font-semibold text-dark-100">
                      Artists you already love
                    </h4>
                  </div>
                  <p className="mb-2 text-xs text-dark-300">
                    Already in your library — we&apos;ll reach for their deep cuts.
                  </p>
                  <motion.div
                    className="flex flex-wrap content-start gap-1.5"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {loved.map((artist) => (
                      <motion.span
                        key={artist.name}
                        variants={staggerItem}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#f29520]/25 bg-[#f29520]/[0.08] px-2.5 py-1 text-xs text-[#f29520]"
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
                <div className="min-w-0 md:border-l md:border-white/10 md:pl-6">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[#f29520]" aria-hidden>
                      ◆
                    </span>
                    <h4 className="text-sm font-semibold text-dark-100">Hidden gems</h4>
                  </div>
                  <p className="mb-2 text-xs text-dark-300">
                    New to you, but on-taste — we&apos;ll grab their best-known tracks.
                  </p>
                  <motion.div
                    className="space-y-1.5"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {gems.map((artist) => (
                      <motion.div
                        key={artist.name}
                        variants={staggerItem}
                        className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-1.5"
                      >
                        <span className="mt-0.5 text-xs text-[#f29520]" aria-hidden>
                          ◆
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-dark-100">
                              {artist.name}
                            </span>
                            {artist.affinityConfidence !== undefined && (
                              <span className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-dark-300">
                                {pct(artist.affinityConfidence)}% match
                              </span>
                            )}
                          </div>
                          {artist.affinityReason && (
                            <p className="mt-0.5 text-xs leading-snug text-dark-300">
                              {artist.affinityReason}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )}
            </div>
          </details>
        </div>
      </Card>
    </motion.div>
  );
}
