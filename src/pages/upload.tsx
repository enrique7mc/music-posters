import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Artist, AnalyzeResponse, Track } from '@/types';
import { apiClient } from '@/lib/api-client';
import { AppError, parseApiError } from '@/lib/error-utils';
import { MAX_ARTISTS_PER_SEARCH } from '@/lib/constants';
import { ArtistTextParseResult } from '@/lib/artist-text';
import {
  PlaylistDraft,
  PlaylistTrackReview,
  PLAYLIST_DRAFT_STORAGE_ERROR,
  artistNamesEqual,
  computeSearchFingerprint,
  createPosterDraft,
  createRecommendedArtistReview,
  createTextDraft,
  applyTextLineup,
  defaultPlaylistName,
  hasDraftProgress,
  isSessionStorageAvailable,
  readPlaylistDraftForUser,
  savePlaylistDraft,
  trackReviewMatches,
  updatePlaylistDraft,
} from '@/lib/playlist-draft';
import PageLayout from '@/components/layout/PageLayout';
import { AsymmetricSection } from '@/components/layout/Section';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import UploadZone from '@/components/features/UploadZone';
import ArtistTextInput from '@/components/features/ArtistTextInput';
import ArtistList from '@/components/features/ArtistList';
import ProgressStepper from '@/components/ui/ProgressStepper';
import Illustration from '@/components/ui/Illustration';
import StartOverButton, { confirmStartOver } from '@/components/features/StartOverButton';
import { fadeIn } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

/** null = no choice made yet (poster/text chooser is shown). */
type UploadInputMode = 'poster' | 'text' | null;

const COULD_NOT_SAVE_LINEUP_ERROR: AppError = {
  type: 'server',
  title: 'Could not save your lineup',
  message:
    'Your browser blocked local storage, so the lineup could not be saved. Try again, or upload a poster instead.',
};

/** Distinguishes a failed draft write (recoverable, storage-flavored) from API errors. */
class DraftWriteError extends Error {}

export default function Upload() {
  const router = useRouter();
  const { user, loading: authLoading, platform } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';
  const [hydrated, setHydrated] = useState(false);
  const [inputMode, setInputMode] = useState<UploadInputMode>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  // Raw manual-entry text; part of the draft so it survives refresh and Back.
  const [artistText, setArtistText] = useState('');
  const [hasProgress, setHasProgress] = useState(false);
  // Track latest analysis request to prevent race conditions
  const latestAnalysisToken = useRef<Symbol | null>(null);
  // Mirror of the stored draft; avoids re-parsing storage on every keystroke.
  const draftRef = useRef<PlaylistDraft | null>(null);
  const didHydrateRef = useRef(false);
  // Live blob URLs are revoked on replace/unmount; persisted thumbnails are
  // inline data URLs and never need revocation.
  const previewUrlRef = useRef<string | null>(null);
  // Progress can exist in memory even when sessionStorage is blocked. Those
  // users still deserve the same confirmation before a destructive switch.
  const hasMeaningfulUploadState = hasProgress || artistText.length > 0 || artists.length > 0;

  const setDraft = useCallback((draft: PlaylistDraft | null) => {
    draftRef.current = draft;
    setHasProgress(hasDraftProgress(draft));
  }, []);

  const setPreview = useCallback((url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  // Revoke the live object URL when the page unmounts.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  // Hydrate the draft once auth resolves: restores the text screen with its
  // exact value, or a completed poster analysis (with thumbnail) without
  // re-analyzing. Pages wait for this before rendering, so no chooser flashes
  // and no premature missing-state redirects fire.
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
      return;
    }
    if (authLoading || !user || !platform) return;
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    const draft = readPlaylistDraftForUser(user.draftOwnerId, platform);
    setDraft(draft);
    setStorageAvailable(isSessionStorageAvailable());

    if (draft) {
      if (draft.source.kind === 'text') {
        setInputMode('text');
        setArtistText(draft.source.manualText ?? '');
      } else if (draft.source.originalArtists.length > 0) {
        setInputMode('poster');
        setArtists(draft.source.originalArtists);
        setAnalysisProvider(draft.source.analysisProvider ?? 'vision');
        setPosterThumbnail(draft.source.posterThumbnail ?? null);
      }
      // A poster draft without results (analysis never completed) falls
      // through to the empty chooser.
    }

    setHydrated(true);

    // After fresh auth callback, check for return URL
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('returnAfterAuth');
        if (stored) {
          const { url, timestamp } = JSON.parse(stored);
          sessionStorage.removeItem('returnAfterAuth');
          if (
            Date.now() - timestamp < 5 * 60 * 1000 &&
            url.startsWith('/') &&
            !url.startsWith('//') &&
            url !== '/upload'
          ) {
            router.push(url);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, [authLoading, user, platform, router, setDraft]);

  /**
   * Ask before discarding meaningful progress (new poster over an analyzed
   * one, or switching away from a populated input method). On confirm the
   * draft is cleared and the caller may proceed; on cancel nothing changes.
   */
  const confirmDiscardIfNeeded = useCallback((): boolean => {
    if (!hasMeaningfulUploadState) return true;
    if (!confirmStartOver()) return false;
    setDraft(null);
    return true;
  }, [hasMeaningfulUploadState, setDraft]);

  /**
   * Drop any poster-analysis state (in-flight and completed). Bumping the
   * token means a late /api/analyze response can never repopulate state.
   */
  const resetAnalysisState = () => {
    latestAnalysisToken.current = Symbol('superseded');
    setAnalyzing(false);
    setSelectedFile(null);
    setPreview(null);
    setArtists([]);
    setPosterThumbnail(null);
    setError(null);
  };

  /** Reset every piece of in-memory flow state (used after a confirmed discard). */
  const resetFlowState = () => {
    resetAnalysisState();
    setArtistText('');
    setAnalysisProvider('vision');
    setStorageAvailable(true);
    setCreating(false);
  };

  const handleFileSelect = async (file: File) => {
    if (!confirmDiscardIfNeeded()) return;

    resetAnalysisState();
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));

    // Create a token for this analysis request to prevent race conditions
    const requestToken = Symbol('analysis');
    latestAnalysisToken.current = requestToken;

    // Auto-analyze on file select
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post<AnalyzeResponse>('/api/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Only update state if this is still the latest request
      if (latestAnalysisToken.current !== requestToken) {
        console.log('Ignoring stale analysis response');
        return;
      }

      setArtists(response.data.artists);
      setAnalysisProvider(response.data.provider);
      setPosterThumbnail(response.data.posterThumbnail || null);

      if (response.data.artists.length === 0) {
        setError({
          type: 'validation',
          message: 'No artists found in the image. Try a different poster.',
        });
        return;
      }

      // Persist the complete analyzed result so every flow page can restore
      // it without calling /api/analyze again. A failed write keeps the
      // result visible but blocks advancing (storage error shown).
      if (user && platform) {
        const draft = createPosterDraft({
          owner: { userId: user.draftOwnerId, platform },
          artists: response.data.artists,
          analysisProvider: response.data.provider,
          posterThumbnail: response.data.posterThumbnail ?? null,
          eventName: response.data.eventName ?? null,
        });
        const write = savePlaylistDraft(draft);
        if (write.ok) {
          setDraft(write.draft);
          setStorageAvailable(true);
        } else {
          setDraft(null);
          setStorageAvailable(false);
          setError(PLAYLIST_DRAFT_STORAGE_ERROR);
        }
      } else {
        setStorageAvailable(false);
        setError(PLAYLIST_DRAFT_STORAGE_ERROR);
      }
    } catch (err: any) {
      // Only show error if this is still the latest request
      if (latestAnalysisToken.current !== requestToken) {
        return;
      }

      console.error('Error analyzing image:', err);
      const appError = parseApiError(err, 'analyze image');
      setError(appError);
      // Clear upload state on error for better recovery
      setSelectedFile(null);
      setPreview(null);
      setPosterThumbnail(null);
    } finally {
      // Only update analyzing state if this is still the latest request
      if (latestAnalysisToken.current === requestToken) {
        setAnalyzing(false);
      }
    }
  };

  // Choose "Enter artists" on the chooser, or switch mid-flow.
  const handleSwitchToText = () => {
    if (!confirmDiscardIfNeeded()) return;
    resetFlowState();
    setInputMode('text');
  };

  // Back to poster input; destructive when a populated text draft exists.
  const handleSwitchToPoster = () => {
    if (!confirmDiscardIfNeeded()) return;
    resetFlowState();
    setError(null);
    setInputMode('poster');
  };

  // Two-pane "Upload Different Poster": confirm, then return to the drop zone.
  const handleUploadDifferentPoster = () => {
    if (!confirmDiscardIfNeeded()) return;
    resetFlowState();
    setInputMode('poster');
  };

  const handleArtistTextChange = useCallback(
    (value: string) => {
      setArtistText(value);
      // Persist the raw text as it changes (best effort; the submit path
      // performs the verified, navigation-gating write).
      const draft = draftRef.current;
      if (draft && draft.source.kind === 'text') {
        const write = updatePlaylistDraft((d) => ({
          ...d,
          source: { ...d.source, manualText: value },
        }));
        if (write.ok) setDraft(write.draft);
      } else if (!draft && value.length > 0) {
        if (user && platform) {
          const write = savePlaylistDraft(
            createTextDraft({ owner: { userId: user.draftOwnerId, platform }, manualText: value })
          );
          if (write.ok) setDraft(write.draft);
        }
      }
    },
    [user, platform, setDraft]
  );

  const handleSubmitArtistText = (result: ArtistTextParseResult) => {
    if (result.errorCode || result.invalidNames.length > 0 || result.artists.length === 0) return;
    if (result.artists.length > MAX_ARTISTS_PER_SEARCH) return; // guarded by parser
    if (!user || !platform) return;

    const existing = readPlaylistDraftForUser(user.draftOwnerId, platform);

    // Re-submitting the same lineup is a Back-then-Continue round trip: keep
    // artist-review edits and stored track results untouched.
    if (
      existing &&
      existing.source.kind === 'text' &&
      artistNamesEqual(existing.source.originalArtists, result.artists)
    ) {
      const write = updatePlaylistDraft((d) => ({
        ...d,
        source: { ...d.source, manualText: artistText },
      }));
      if (!write.ok) {
        setDraft(existing);
        setError(COULD_NOT_SAVE_LINEUP_ERROR);
        return;
      }
      setDraft(write.draft);
      router.push('/review-artists');
      return;
    }

    // A genuinely different lineup replaces the source and discards downstream
    // work (artist-review edits, track results) — confirm it like any other
    // destructive reset. Typed-but-never-submitted text is not downstream work.
    const replacesDownstreamWork =
      !!existing && (existing.source.originalArtists.length > 0 || !!existing.trackReview);
    if (replacesDownstreamWork && !confirmStartOver()) {
      return; // Cancelled: stay on the text screen; nothing is written.
    }

    const base =
      existing ??
      createTextDraft({
        owner: { userId: user.draftOwnerId, platform },
        manualText: artistText,
      });
    const write = savePlaylistDraft(applyTextLineup(base, artistText, result.artists));
    if (!write.ok) {
      setDraft(existing);
      setError(COULD_NOT_SAVE_LINEUP_ERROR);
      return;
    }
    setDraft(write.draft);
    router.push('/review-artists');
  };

  const handleCreatePlaylist = async () => {
    if (artists.length === 0) return;
    if (artists.length > MAX_ARTISTS_PER_SEARCH) {
      setError({
        type: 'validation',
        title: 'Too many artists',
        message: `You have ${artists.length} artists but the maximum is ${MAX_ARTISTS_PER_SEARCH}. Please use "Customize Artists" to remove some before continuing.`,
      });
      return;
    }
    if (!user || !platform) return;

    if (!isSessionStorageAvailable()) {
      setStorageAvailable(false);
      setError(PLAYLIST_DRAFT_STORAGE_ERROR);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const owner = { userId: user.draftOwnerId, platform };
      // Quick Create explicitly uses recommended defaults; initializing the
      // same complete artistReview here gives Review Tracks a valid Review
      // Artists destination (including drafts that skipped customization).
      const recommended = createRecommendedArtistReview(artists, 'poster');
      const fingerprint = computeSearchFingerprint({
        artists: recommended.artists,
        trackCountMode: recommended.trackCountMode,
        trackSelectionMode: recommended.trackSelectionMode,
        tierCounts: recommended.tierCounts,
        perArtistCounts: recommended.perArtistCounts,
      });

      const existing = readPlaylistDraftForUser(owner.userId, owner.platform);

      // A previous search with identical inputs is still valid — skip the
      // rate-limited API call and restore its exact results.
      if (existing && trackReviewMatches(existing.trackReview, fingerprint)) {
        const write = updatePlaylistDraft((d) => ({ ...d, artistReview: recommended }));
        if (!write.ok) throw new DraftWriteError();
        setDraft(write.draft);
        router.push('/review-tracks');
        return;
      }

      const response = await apiClient.post('/api/search-tracks', {
        artists: artists,
        trackCountMode: recommended.trackCountMode,
        trackSelectionMode: recommended.trackSelectionMode,
      });
      const tracks: Track[] = response.data.tracks;
      const playlistName = existing?.trackReview?.playlistName?.trim()
        ? existing.trackReview.playlistName
        : defaultPlaylistName(existing?.source ?? { kind: 'poster', originalArtists: artists });

      const trackReview: PlaylistTrackReview = {
        searchFingerprint: fingerprint,
        tracks,
        selectedTrackIds: tracks.map((track) => track.id),
        warnings: response.data.warnings ?? [],
        playlistName,
      };

      const nextDraft: PlaylistDraft = existing
        ? { ...existing, artistReview: recommended, trackReview }
        : {
            ...createPosterDraft({
              owner,
              artists,
              analysisProvider,
              posterThumbnail,
            }),
            trackReview,
          };
      const write = savePlaylistDraft(nextDraft);
      if (!write.ok) throw new DraftWriteError();
      setDraft(write.draft);
      router.push('/review-tracks');
    } catch (err: any) {
      if (err instanceof DraftWriteError) {
        console.error('Failed to store quick-create review state:', err);
        setStorageAvailable(false);
        setError(PLAYLIST_DRAFT_STORAGE_ERROR);
        setCreating(false);
        return;
      }

      console.error('Error searching tracks:', err);
      const appError = parseApiError(err, 'search tracks');
      if (appError.type === 'rate_limit' || appError.type === 'server') {
        appError.action = { label: 'Try again', onClick: handleCreatePlaylist };
      }
      setError(appError);
      setCreating(false);
    }
  };

  const handleCustomizeArtists = () => {
    if (artists.length === 0) return;
    if (!user || !platform) return;
    if (!isSessionStorageAvailable()) {
      setStorageAvailable(false);
      setError(PLAYLIST_DRAFT_STORAGE_ERROR);
      return;
    }

    const existing = readPlaylistDraftForUser(user.draftOwnerId, platform);

    if (!existing) {
      // The analysis-time write failed; rebuild the draft before navigating.
      const write = savePlaylistDraft(
        createPosterDraft({
          owner: { userId: user.draftOwnerId, platform },
          artists,
          analysisProvider,
          posterThumbnail,
        })
      );
      if (!write.ok) {
        setStorageAvailable(false);
        setError(PLAYLIST_DRAFT_STORAGE_ERROR);
        return;
      }
      setDraft(write.draft);
    } else if (existing.artistReview.artists.length === 0) {
      // Initialize (never overwrite) the artist review before navigating.
      const write = updatePlaylistDraft((d) => ({
        ...d,
        artistReview: createRecommendedArtistReview(artists, 'poster'),
      }));
      if (!write.ok) {
        setStorageAvailable(false);
        setError(PLAYLIST_DRAFT_STORAGE_ERROR);
        return;
      }
      setDraft(write.draft);
    } else {
      setDraft(existing);
    }

    router.push('/review-artists');
  };

  if (authLoading || !hydrated) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  if (analyzing) {
    return <LoadingScreen message="Analyzing poster with AI..." />;
  }

  if (creating) {
    return (
      <LoadingScreen message={`Finding tracks on ${platformName}... This may take a minute.`} />
    );
  }

  // Live blob preview during a session; the stored 300x300 thumbnail after a
  // restore (the API returns bare base64, so prefix it for display only — the
  // draft keeps the API-compatible value); a neutral placeholder when
  // thumbnail generation failed.
  const posterPreviewSrc =
    previewUrl ??
    (posterThumbnail
      ? posterThumbnail.startsWith('data:')
        ? posterThumbnail
        : `data:image/jpeg;base64,${posterThumbnail}`
      : null);
  const showResult = artists.length > 0;

  return (
    <>
      <Head>
        <title>Upload Poster - Playlistd</title>
      </Head>

      <PageLayout>
        <div className="min-h-screen pb-20 pt-28 sm:pt-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="mb-8 border-b border-dark-800 pb-5">
              <ProgressStepper
                steps={[
                  { label: 'Upload' },
                  { label: 'Review Artists' },
                  { label: 'Review Tracks' },
                  { label: 'Done' },
                ]}
                currentStep={0}
              />
            </div>
            <div className="mb-7">
              {inputMode === null && !showResult && (
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.23em] text-accent-400">
                  Start Your Playlist
                </p>
              )}
              <h1 className="font-display text-4xl font-black tracking-tight text-dark-50 sm:text-5xl">
                Build your playlist.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-dark-300 sm:text-base">
                Choose a poster or enter a lineup. Review the artists and songs before saving.
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mx-auto mb-6 max-w-7xl px-5 sm:px-8 lg:px-10">
              <ErrorMessage
                message={error.message}
                title={error.title}
                action={error.action}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {/* Empty state - choose how to start */}
          {inputMode === null && !showResult && (
            <motion.div
              className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                {/* Upload a poster */}
                <button
                  onClick={() => {
                    resetFlowState();
                    setInputMode('poster');
                  }}
                  className="group flex min-h-[230px] sm:min-h-[310px] flex-col items-start justify-between overflow-hidden rounded-[1.75rem] border border-accent-500/60 bg-dark-900 p-7 text-left transition-colors hover:border-accent-400 hover:bg-dark-800 focus-ring sm:p-9"
                >
                  <div className="flex w-full items-start justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-400">
                      Recommended · 01
                    </span>
                    <span className="text-2xl text-accent-400" aria-hidden="true">
                      ↗
                    </span>
                  </div>
                  <div className="mt-8 flex w-full items-end justify-between gap-4">
                    <div>
                      <div className="font-display text-3xl font-black tracking-tight text-dark-50 transition-colors group-hover:text-accent-400 sm:text-4xl">
                        Upload a Poster
                      </div>
                      <p className="mt-3 max-w-sm text-sm leading-relaxed text-dark-300">
                        Start with a festival or concert image. We&apos;ll read the lineup and bring
                        the artists into review.
                      </p>
                    </div>
                    <div
                      className="hidden h-36 w-28 shrink-0 rotate-[7deg] flex-col justify-between border-[7px] border-[#e5d6b9] bg-accent-500 p-3 text-left text-dark-950 shadow-xl sm:flex"
                      aria-hidden="true"
                    >
                      <span className="border-b border-dark-950/50 pb-1 text-[8px] font-black uppercase">
                        Lineup
                      </span>
                      <span className="font-display text-2xl font-black uppercase leading-[0.8] tracking-tighter">
                        LIVE
                        <br />
                        LOUD
                        <br />
                        NOW.
                      </span>
                      <span className="border-t border-dark-950/50 pt-1 text-[7px] font-black uppercase">
                        No. 001
                      </span>
                    </div>
                  </div>
                </button>

                {/* Enter artists */}
                <button
                  onClick={handleSwitchToText}
                  className="group flex min-h-[230px] sm:min-h-[310px] flex-col items-start justify-between rounded-[1.75rem] border border-dark-700 bg-dark-900 p-7 text-left transition-colors hover:border-accent-500 hover:bg-dark-800 focus-ring sm:p-9"
                >
                  <div className="flex w-full items-start justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-dark-300">
                      Or make your own · 02
                    </span>
                    <span className="text-2xl text-accent-400" aria-hidden="true">
                      ↗
                    </span>
                  </div>
                  <div className="w-full">
                    <div className="mb-5 space-y-2" aria-hidden="true">
                      <span className="block h-2 w-2/3 rounded-full bg-dark-700" />
                      <span className="block h-2 w-1/2 rounded-full bg-dark-700" />
                      <span className="block h-2 w-3/4 rounded-full bg-dark-700" />
                    </div>
                    <div className="font-display text-3xl font-black tracking-tight text-dark-50 transition-colors group-hover:text-accent-400">
                      Enter Artists
                    </div>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-dark-300">
                      Already know who you want? Type the artist names yourself, one per line.
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* Poster mode - upload zone */}
          {inputMode === 'poster' && !showResult && (
            <motion.div
              className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-dark-300">Poster upload</p>
                <Button variant="text" onClick={() => setInputMode(null)}>
                  Change starting point
                </Button>
              </div>
              <UploadZone onFileSelect={handleFileSelect} />
              <div className="mt-6 text-center">
                <Button variant="text" onClick={handleSwitchToText}>
                  Or enter artists manually instead
                </Button>
              </div>
            </motion.div>
          )}

          {/* Text mode - manual artist entry */}
          {inputMode === 'text' && (
            <motion.div
              className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="mx-auto max-w-3xl">
                {hasMeaningfulUploadState && (
                  <div className="flex justify-end mb-2">
                    <StartOverButton
                      onDiscard={() => {
                        setDraft(null);
                        resetFlowState();
                        setInputMode(null);
                      }}
                    />
                  </div>
                )}
                <ArtistTextInput
                  value={artistText}
                  onChange={handleArtistTextChange}
                  onSubmit={handleSubmitArtistText}
                  disabled={creating || analyzing}
                />
                <div className="mt-6 text-center">
                  <Button variant="text" onClick={handleSwitchToPoster}>
                    Or upload a poster instead
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Two-pane layout with poster and artists */}
          {showResult && (
            <AsymmetricSection
              className="!max-w-7xl !px-5 !py-0 sm:!px-8 lg:!px-10"
              left={
                <div className="space-y-6">
                  {/* Poster preview (blob URL, stored thumbnail, or placeholder) */}
                  <Card variant="elevated" className="rounded-[1.75rem] border-dark-700 p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-dark-100">Your Poster</h3>
                      <span className="text-xs font-bold uppercase tracking-widest text-accent-400">
                        Analyzed
                      </span>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl bg-dark-950">
                      {posterPreviewSrc ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={posterPreviewSrc}
                          alt="Festival Poster"
                          className="w-full h-auto"
                          style={{ maxHeight: '60vh', objectFit: 'contain' }}
                        />
                      ) : (
                        <div className="w-full aspect-square flex flex-col items-center justify-center text-dark-300">
                          <Illustration name="poster" size={64} className="mb-3" />
                          <span className="text-sm">Poster preview unavailable</span>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Upload new button */}
                  <Button variant="ghost" onClick={handleUploadDifferentPoster} className="w-full">
                    Upload Different Poster
                  </Button>

                  <StartOverButton
                    className="w-full"
                    onDiscard={() => {
                      setDraft(null);
                      resetFlowState();
                      setInputMode(null);
                    }}
                  />
                </div>
              }
              right={
                <div className="space-y-6">
                  {/* Artist list */}
                  <ArtistList artists={artists} provider={analysisProvider} />

                  {/* Flow choice: Quick Create or Customize */}
                  <Card variant="elevated" className="rounded-[1.75rem] border-dark-700 p-6 sm:p-8">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-400">
                      Next up
                    </p>
                    <h4 className="font-display text-2xl font-black tracking-tight text-dark-50 sm:text-3xl">
                      Make the lineup yours.
                    </h4>
                    <p className="mb-6 mt-3 text-sm text-dark-300">
                      We found {artists.length} {artists.length === 1 ? 'artist' : 'artists'}.
                      Choose how much you want to customize.
                    </p>

                    <div className="space-y-3">
                      {/* Quick Create */}
                      <button
                        onClick={handleCreatePlaylist}
                        disabled={creating || !storageAvailable}
                        className="group w-full rounded-2xl border border-dark-700 bg-dark-950 p-5 text-left transition-colors hover:border-accent-500 hover:bg-dark-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-accent-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-accent-500/30 transition-colors">
                            <svg
                              className="w-5 h-5 text-accent-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-dark-100 mb-1 group-hover:text-accent-400 transition-colors">
                              Quick Create Playlist
                            </div>
                            <div className="text-sm text-dark-300">
                              Use recommended tier-based track counts and create your playlist now
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Customize Artists */}
                      <button
                        onClick={handleCustomizeArtists}
                        disabled={creating || !storageAvailable}
                        className="group w-full rounded-2xl border border-dark-700 bg-dark-950 p-5 text-left transition-colors hover:border-accent-500 hover:bg-dark-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-accent-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-accent-500/30 transition-colors">
                            <svg
                              className="w-5 h-5 text-accent-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-dark-100 mb-1 group-hover:text-accent-400 transition-colors">
                              Customize Artists
                            </div>
                            <div className="text-sm text-dark-300">
                              Review artists, adjust track counts, and remove unwanted artists
                              before creating
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </Card>
                </div>
              }
            />
          )}
        </div>
      </PageLayout>
    </>
  );
}
