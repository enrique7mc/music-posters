import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { Artist, ArtistInputSource, PersonalizeResponse, TrackSelectionMode } from '@/types';
import { apiClient } from '@/lib/api-client';
import { AppError, parseApiError } from '@/lib/error-utils';
import { MAX_ARTISTS_PER_SEARCH } from '@/lib/constants';
import { DEFAULT_TEXT_ARTIST_TRACK_COUNT } from '@/lib/artist-text';
import {
  PlaylistArtistReview,
  PlaylistPersonalizationSummary,
  PLAYLIST_DRAFT_STORAGE_ERROR,
  computeSearchFingerprint,
  defaultPlaylistName,
  readPlaylistDraftForUser,
  trackReviewMatches,
  updatePlaylistDraft,
} from '@/lib/playlist-draft';
import { DEFAULT_TIER_COUNTS, withDefaultTierCounts } from '@/lib/track-counts';
import type { TierCounts, TrackCountMode } from '@/lib/track-counts';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ProgressStepper from '@/components/ui/ProgressStepper';
import EditableArtistList from '@/components/features/EditableArtistList';
import TrackCountModeSelector, {
  TierCountControls,
} from '@/components/features/TrackCountModeSelector';
import TrackSelectionModeSelector from '@/components/features/TrackSelectionModeSelector';
import BulkActionsBar from '@/components/features/BulkActionsBar';
import PlaylistSummaryPreview from '@/components/features/PlaylistSummaryPreview';
import PersonalizationHeader, {
  PersonalizationResult,
} from '@/components/features/PersonalizationHeader';
import StartOverButton from '@/components/features/StartOverButton';
import { fadeIn, slideUp } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

/** Recommended per-artist count for an artist (tier default, or text default). */
function recommendedCount(artist: Artist, source: ArtistInputSource): number {
  if (source === 'text') return DEFAULT_TEXT_ARTIST_TRACK_COUNT;
  return artist.tier ? DEFAULT_TIER_COUNTS[artist.tier] : DEFAULT_TIER_COUNTS.default;
}

export default function ReviewArtists() {
  const router = useRouter();
  const { user, loading: authLoading, platform } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // Source metadata restored from the draft.
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [inputSource, setInputSource] = useState<ArtistInputSource>('poster');

  // The whole artist-review state lives in one object so every mutation can
  // be persisted to the draft atomically (list, counts, staged bulk inputs,
  // selection mode, personalization).
  const [review, setReview] = useState<PlaylistArtistReview | null>(null);
  const reviewRef = useRef<PlaylistArtistReview | null>(null);
  const didHydrateRef = useRef(false);

  // Selection state for bulk operations (ephemeral UI state, not part of the draft).
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());

  // Personalization (loved + hidden gems). Restored from the draft when a
  // completed/degraded result is already stored; otherwise fires once.
  const [personalizing, setPersonalizing] = useState(false);
  const [personalizeResult, setPersonalizeResult] = useState<PersonalizationResult | null>(null);
  // Guards a single fire (incl. React Strict-Mode double-mount, which preserves refs).
  const personalizeStartedRef = useRef(false);
  // True while this component instance is mounted; gates late/stale responses so a
  // navigation away (or Strict-Mode unmount/remount) can't merge into a dead screen.
  const activeRef = useRef(true);

  /**
   * Apply the next artist-review state and persist it to the draft in the same
   * breath. Mid-edit persistence is best-effort (a later verified write gates
   * navigation); the ref update is synchronous so Back/Continue always see the
   * values on screen.
   */
  const commitReview = useCallback((next: PlaylistArtistReview) => {
    reviewRef.current = next;
    setReview(next);
    updatePlaylistDraft((draft) => ({ ...draft, artistReview: next }));
  }, []);

  // Hydrate the full artist review (and source metadata) from the draft. Do
  // not overwrite restored values with text/poster defaults — the draft is
  // authoritative once it exists. Wait for auth before redirecting so a
  // refresh never bounces a valid user to Upload.
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
      return;
    }
    if (authLoading || !user || !platform) return;
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    const draft = readPlaylistDraftForUser(user.draftOwnerId, platform);
    if (!draft || draft.artistReview.artists.length === 0) {
      router.push('/upload');
      return;
    }

    setAnalysisProvider(draft.source.analysisProvider ?? 'vision');
    setPosterThumbnail(draft.source.posterThumbnail ?? null);
    setInputSource(draft.source.kind);

    // Defensive fill: guarantee every restored artist has a per-artist count.
    const perArtistCounts: Record<string, number> = Object.assign(
      Object.create(null),
      draft.artistReview.perArtistCounts
    );
    draft.artistReview.artists.forEach((artist) => {
      if (typeof perArtistCounts[artist.name] !== 'number') {
        perArtistCounts[artist.name] = recommendedCount(artist, draft.source.kind);
      }
    });

    const restored: PlaylistArtistReview = {
      ...draft.artistReview,
      tierCounts: withDefaultTierCounts(draft.artistReview.tierCounts),
      perArtistCounts,
    };
    reviewRef.current = restored;
    setReview(restored);

    // A completed or degraded personalization result is already stored:
    // restore its summary and never re-run the request for this lineup.
    if (draft.artistReview.personalization) {
      setPersonalizeResult({
        lovedCount: draft.artistReview.personalization.lovedCount,
        gemCount: draft.artistReview.personalization.gemCount,
        degraded: draft.artistReview.personalization.status === 'degraded',
      });
    }

    setLoading(false);
  }, [authLoading, user, platform, router]);

  // Track mount status. Refs survive Strict-Mode's unmount/remount, so after the
  // double-invoke settles activeRef is back to true; on a real unmount it stays false.
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  // Personalize the lineup against the user's library (Apple Music only — it's the
  // platform exposing a user library). Fires once; merges affinity fields by name so
  // any edits made during the ~10s wait are preserved (locked decision #9).
  useEffect(() => {
    if (loading || authLoading) return;
    if (personalizeStartedRef.current) return;
    if (platform !== 'apple-music') return;
    const current = reviewRef.current;
    if (!current || current.artists.length === 0) return;
    if (current.personalization) return; // stored complete/degraded result

    personalizeStartedRef.current = true;
    setPersonalizing(true);

    apiClient
      .post('/api/personalize', { artists: current.artists, platform })
      .then((res) => {
        if (!activeRef.current) return; // navigated away / stale
        const data = res.data as PersonalizeResponse;

        setPersonalizeResult({
          lovedCount: data.lovedCount,
          gemCount: data.gemCount,
          degraded: data.degraded,
        });

        // Store the counts the server actually reported — a degraded scan can
        // still carry real loved matches (its annotations stand server-side).
        const summary: PlaylistPersonalizationSummary = {
          status: data.degraded ? 'degraded' : 'complete',
          lovedCount: data.lovedCount,
          gemCount: data.gemCount,
        };

        const base = reviewRef.current;
        if (!base) return;

        if (data.degraded) {
          // The server finished (partially); persist so a return visit skips the retry.
          commitReview({ ...base, personalization: summary });
          return;
        }

        // Merge ONLY affinity fields, keyed by name, into current state — never
        // replace the artist objects (protects removals/edits during the wait).
        const affinityByName = new Map(data.artists.map((a) => [a.name, a]));
        const merged = base.artists.map((artist) => {
          const annotated = affinityByName.get(artist.name);
          if (!annotated?.affinity) return artist;
          return {
            ...artist,
            affinity: annotated.affinity,
            affinityConfidence: annotated.affinityConfidence,
            affinityReason: annotated.affinityReason,
            affinityLinkedTo: annotated.affinityLinkedTo,
          };
        });
        commitReview({ ...base, artists: merged, personalization: summary });
      })
      .catch((err) => {
        if (!activeRef.current) return;
        console.error('[ReviewArtists] Personalize failed:', err);
        // Degrade quietly for this visit; nothing is persisted, so returning
        // to the page retries the interrupted personalization.
        setPersonalizeResult({ lovedCount: 0, gemCount: 0, degraded: true });
      })
      .finally(() => {
        if (activeRef.current) setPersonalizing(false);
      });
  }, [loading, authLoading, platform, commitReview]);

  // Toggle artist selection (ephemeral bulk-selection UI state)
  const handleToggleSelection = (artistName: string) => {
    setSelectedArtists((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(artistName)) {
        newSet.delete(artistName);
      } else {
        newSet.add(artistName);
      }
      return newSet;
    });
  };

  // Remove single artist
  const handleRemoveArtist = (artistName: string) => {
    const current = reviewRef.current;
    if (!current) return;
    const perArtistCounts = { ...current.perArtistCounts };
    delete perArtistCounts[artistName];
    commitReview({
      ...current,
      artists: current.artists.filter((a) => a.name !== artistName),
      perArtistCounts,
    });
    setSelectedArtists((prev) => {
      const newSet = new Set(prev);
      newSet.delete(artistName);
      return newSet;
    });
  };

  // Remove selected artists (bulk)
  const handleRemoveSelected = () => {
    const current = reviewRef.current;
    if (!current) return;
    const perArtistCounts = { ...current.perArtistCounts };
    selectedArtists.forEach((artistName) => {
      delete perArtistCounts[artistName];
    });
    commitReview({
      ...current,
      artists: current.artists.filter((a) => !selectedArtists.has(a.name)),
      perArtistCounts,
    });
    setSelectedArtists(new Set());
  };

  // Reset to recommended tier-based counts. Keeps the selection mode and any
  // stored personalization; clears the staged bulk inputs so a later Apply
  // can't restore pre-reset values.
  const handleResetToRecommended = () => {
    const current = reviewRef.current;
    if (!current) return;
    const perArtistCounts: Record<string, number> = Object.create(null);
    current.artists.forEach((artist) => {
      perArtistCounts[artist.name] = recommendedCount(artist, inputSource);
    });
    commitReview({
      ...current,
      trackCountMode: inputSource === 'text' ? 'per-artist' : 'tier-based',
      tierCounts: withDefaultTierCounts(),
      perArtistCounts,
      stagedTierCounts: {},
    });
  };

  // Apply track count to all artists in a tier
  const handleApplyToTier = (tier: string, count: number) => {
    const current = reviewRef.current;
    if (!current) return;
    const perArtistCounts = { ...current.perArtistCounts };
    current.artists.forEach((artist) => {
      if (artist.tier === tier) {
        perArtistCounts[artist.name] = count;
      }
    });
    commitReview({ ...current, perArtistCounts });
  };

  // Stage a bulk tier count edit; reaches the lineup only via the explicit
  // Apply action in the bulk bar.
  const handleStagedTierCountChange = (tier: keyof TierCounts, count: number) => {
    const current = reviewRef.current;
    if (!current) return;
    commitReview({
      ...current,
      stagedTierCounts: { ...current.stagedTierCounts, [tier]: count },
    });
  };

  // Update per-artist track count
  const handlePerArtistCountChange = (artistName: string, count: number) => {
    const current = reviewRef.current;
    if (!current) return;
    commitReview({
      ...current,
      perArtistCounts: { ...current.perArtistCounts, [artistName]: count },
    });
  };

  // Update tier count (for custom-per-tier mode)
  const handleTierCountChange = (tier: keyof TierCounts, count: number) => {
    const current = reviewRef.current;
    if (!current) return;
    commitReview({ ...current, tierCounts: { ...current.tierCounts, [tier]: count } });
  };

  const handleTrackCountModeChange = (mode: TrackCountMode) => {
    const current = reviewRef.current;
    if (!current) return;
    commitReview({ ...current, trackCountMode: mode });
  };

  const handleTrackSelectionModeChange = (mode: TrackSelectionMode) => {
    const current = reviewRef.current;
    if (!current) return;
    commitReview({ ...current, trackSelectionMode: mode });
  };

  const artists = review?.artists ?? [];
  const overLimit = artists.length > MAX_ARTISTS_PER_SEARCH;

  /**
   * Continue to track review. When the stored track result was produced from
   * identical search inputs (fingerprint), reuse it — no new API call — and
   * keep the exact selections, warnings, and playlist name. Otherwise search,
   * then atomically store the updated artist review and track review (verified
   * write) before routing.
   */
  const handleContinue = async () => {
    const current = reviewRef.current;
    if (!current) return;

    if (current.artists.length === 0) {
      setError({
        type: 'validation',
        message:
          inputSource === 'text'
            ? 'No artists to search. Go back and enter some artists.'
            : 'No artists to search. Please upload a new poster.',
      });
      return;
    }

    if (overLimit) {
      return; // Button should be disabled, but guard anyway
    }

    if (!user || !platform) return;

    const fingerprint = computeSearchFingerprint({
      artists: current.artists,
      trackCountMode: current.trackCountMode,
      trackSelectionMode: current.trackSelectionMode,
      tierCounts: current.tierCounts,
      perArtistCounts: current.perArtistCounts,
    });

    const draft = readPlaylistDraftForUser(user.draftOwnerId, platform);
    if (!draft) {
      // Prerequisites vanished (cleared draft / owner change) — restart the flow.
      router.push('/upload');
      return;
    }

    setSearching(true);
    setError(null);

    try {
      if (trackReviewMatches(draft.trackReview, fingerprint)) {
        // Same effective inputs: navigate without another /api/search-tracks.
        const write = updatePlaylistDraft((d) => ({ ...d, artistReview: current }));
        if (!write.ok) {
          setSearching(false);
          setError(PLAYLIST_DRAFT_STORAGE_ERROR);
          return;
        }
        router.push('/review-tracks');
        return;
      }

      const requestBody: any = {
        artists: current.artists,
        trackCountMode: current.trackCountMode,
        trackSelectionMode: current.trackSelectionMode,
      };

      // Add appropriate track count data based on mode
      if (current.trackCountMode === 'custom-per-tier') {
        requestBody.tierCounts = current.tierCounts;
      } else if (current.trackCountMode === 'per-artist') {
        requestBody.perArtistCounts = current.perArtistCounts;
      }

      const response = await apiClient.post('/api/search-tracks', requestBody);

      const tracks = response.data.tracks;
      // Preserve an independently edited playlist name; only a first-ever
      // result gets the source-derived default.
      const playlistName = draft.trackReview?.playlistName?.trim()
        ? draft.trackReview.playlistName
        : defaultPlaylistName(draft.source);

      const write = updatePlaylistDraft((d) => ({
        ...d,
        artistReview: current,
        trackReview: {
          searchFingerprint: fingerprint,
          tracks,
          selectedTrackIds: tracks.map((t: { id: string }) => t.id),
          warnings: response.data.warnings ?? [],
          playlistName,
        },
      }));
      if (!write.ok) {
        setSearching(false);
        setError(PLAYLIST_DRAFT_STORAGE_ERROR);
        return;
      }

      router.push('/review-tracks');
    } catch (err: any) {
      console.error('Error searching tracks:', err);
      const appError = parseApiError(err, 'search tracks');
      if (appError.type === 'rate_limit' || appError.type === 'server') {
        appError.action = { label: 'Try again', onClick: handleContinue };
      }
      setError(appError);
      setSearching(false);
    }
  };

  if (authLoading || loading || !review) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  return (
    <>
      <Head>
        <title>Review Artists - Playlistd</title>
      </Head>

      <PageLayout showNav>
        <div className="studio-shell pb-12 pt-28 lg:pt-32">
          <motion.div className="mx-auto" variants={fadeIn} initial="hidden" animate="visible">
            {/* Progress Stepper */}
            <div className="mb-8 border-b border-white/10 pb-6">
              <ProgressStepper
                steps={[
                  { label: 'Upload', href: '/upload' },
                  { label: 'Review Artists' },
                  { label: 'Review Tracks' },
                  { label: 'Done' },
                ]}
                currentStep={1}
              />
            </div>

            {/* Header */}
            <motion.div className="mb-8" variants={slideUp}>
              <p className="eyebrow mb-3">02 / Shape the lineup</p>
              <h1 className="page-heading mb-3">Make it yours.</h1>
              <p className="max-w-2xl text-base text-white/55">
                Review the artists, set the sound, and decide how many tracks each one gets.
              </p>
            </motion.div>

            {/* Error message */}
            {error && (
              <div className="mb-6">
                <ErrorMessage
                  message={error.message}
                  title={error.title}
                  action={error.action}
                  onDismiss={() => setError(null)}
                />
              </div>
            )}

            {/* Personalization header (loved + hidden gems) */}
            {(personalizing || personalizeResult) && (
              <div className="mb-6">
                <PersonalizationHeader
                  personalizing={personalizing}
                  result={personalizeResult}
                  artists={artists}
                />
              </div>
            )}

            {/* Settings stay above the lineup, including when tier counts are expanded. */}
            <section aria-label="Playlist settings" className="mb-8">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="eyebrow">01 / Set the direction</span>
                <span className="text-xs text-dark-300">Choose the sound and the size</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <TrackSelectionModeSelector
                  mode={review.trackSelectionMode}
                  onModeChange={handleTrackSelectionModeChange}
                  disabled={searching}
                />
                <TrackCountModeSelector
                  mode={review.trackCountMode}
                  tierCounts={review.tierCounts}
                  onModeChange={handleTrackCountModeChange}
                  onTierCountChange={handleTierCountChange}
                  disabled={searching}
                  showTierModes={inputSource !== 'text'}
                  showTierControls={false}
                />
              </div>
              {review.trackCountMode === 'tier-based' && (
                <p className="mt-3 text-xs text-dark-300">
                  Recommended counts: Headliners 10 · Sub-headliners 5 · Mid-tier 3 · Undercard 1
                </p>
              )}
              {review.trackCountMode === 'custom-per-tier' && (
                <div className="mt-4">
                  <TierCountControls
                    tierCounts={review.tierCounts}
                    onTierCountChange={handleTierCountChange}
                    disabled={searching}
                  />
                </div>
              )}
            </section>

            <section aria-label="Artist lineup" className="mb-8">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="eyebrow">02 / Edit the lineup</span>
                <span className="text-xs text-dark-300">Select or remove artists below</span>
              </div>
              <div className="space-y-4">
                <BulkActionsBar
                  artists={artists}
                  trackCountMode={review.trackCountMode}
                  selectedCount={selectedArtists.size}
                  onResetToRecommended={handleResetToRecommended}
                  onRemoveSelected={handleRemoveSelected}
                  onApplyToTier={handleApplyToTier}
                  stagedTierCounts={review.stagedTierCounts}
                  onStagedTierCountChange={handleStagedTierCountChange}
                />

                <EditableArtistList
                  artists={artists}
                  provider={analysisProvider}
                  trackCountMode={review.trackCountMode}
                  perArtistCounts={review.perArtistCounts}
                  selectedArtists={selectedArtists}
                  onToggleSelection={handleToggleSelection}
                  onRemoveArtist={handleRemoveArtist}
                  onPerArtistCountChange={handlePerArtistCountChange}
                  inputSource={inputSource}
                />
              </div>
            </section>

            <section aria-label="Playlist summary and next steps">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="eyebrow">03 / Check the mix</span>
                <span className="text-xs text-dark-300">A preview before the track search</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:items-start">
                <PlaylistSummaryPreview
                  artists={artists}
                  trackCountMode={review.trackCountMode}
                  tierCounts={review.tierCounts}
                  perArtistCounts={review.perArtistCounts}
                />

                <Card variant="default" className="rounded-2xl border-white/10 p-5 sm:p-6">
                  <h4 className="mb-2 text-lg font-semibold text-white">Ready for the tracks?</h4>
                  <p className="mb-5 text-sm leading-relaxed text-white/50">
                    We&apos;ll search {platformName} for tracks from {artists.length}{' '}
                    {artists.length === 1 ? 'artist' : 'artists'} and let you review them before
                    creating your playlist.
                  </p>
                  {overLimit && (
                    <div className="mb-4 rounded-lg border border-amber-600/50 bg-amber-950/50 p-3">
                      <p className="text-sm text-amber-200">
                        Too many artists ({artists.length}/{MAX_ARTISTS_PER_SEARCH}). Please remove{' '}
                        {artists.length - MAX_ARTISTS_PER_SEARCH} artist
                        {artists.length - MAX_ARTISTS_PER_SEARCH !== 1 ? 's' : ''} to continue.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleContinue}
                      className="w-full rounded-xl bg-[#f29520] text-black hover:bg-[#ffa837]"
                      isLoading={searching}
                      // Block Continue while personalization is in flight: posting
                      // early would send untagged artists to search-tracks, so loved
                      // artists silently lose deep-cuts and gems lose popular tracks.
                      // The PersonalizationHeader above shows the "Personalizing…" state.
                      disabled={artists.length === 0 || overLimit || personalizing}
                    >
                      Search Tracks & Continue
                    </Button>
                    {/* Navigation only — Back never clears draft state. */}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => router.push('/upload')}
                      className="w-full"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Back to Upload
                    </Button>
                    <StartOverButton className="w-full" />
                  </div>
                </Card>
              </div>
            </section>
          </motion.div>
        </div>
      </PageLayout>
    </>
  );
}
