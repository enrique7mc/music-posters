import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { Track } from '@/types';
import { apiClient } from '@/lib/api-client';
import { AppError, parseApiError } from '@/lib/error-utils';
import { MAX_PLAYLIST_TRACKS } from '@/lib/constants';
import { readPlaylistDraftForUser, updatePlaylistDraft } from '@/lib/playlist-draft';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LoadingSpinner, { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ProgressStepper from '@/components/ui/ProgressStepper';
import Illustration from '@/components/ui/Illustration';
import StartOverButton from '@/components/features/StartOverButton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

// Helper function to format duration (ms to mm:ss)
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

type ViewMode = 'card' | 'list';

/**
 * Page component that lets a user review, select, and create a playlist from a list of tracks.
 *
 * The available tracks, the exact selected-track IDs, warnings, and the playlist
 * name are hydrated from — and persisted to — the session playlist draft, so
 * refreshes and Back/Forward navigation lose nothing. Card/list view is an
 * independent preference (localStorage) and is not part of the draft.
 */
export default function ReviewTracks() {
  const router = useRouter();
  const { platform, loading: authLoading, user } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';

  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [playlistName, setPlaylistName] = useState(
    `Festival Mix - ${new Date().toLocaleDateString()}`
  );
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);
  const didHydrateRef = useRef(false);

  // Mirrors of the persisted track-review fields, updated synchronously by the
  // mutation handlers so a fast click can never beat persistence.
  const selectedRef = useRef<Set<string>>(new Set());
  const playlistNameRef = useRef('');
  const warningsRef = useRef<string[]>([]);

  /** Write the current selection/name/warnings into the stored draft (best effort). */
  const persistTrackReview = useCallback(() => {
    updatePlaylistDraft((draft) => {
      if (!draft.trackReview) return draft;
      return {
        ...draft,
        trackReview: {
          ...draft.trackReview,
          selectedTrackIds: [...selectedRef.current],
          playlistName: playlistNameRef.current,
          warnings: [...warningsRef.current],
        },
      };
    });
  }, []);

  // Load view mode from localStorage (user preference, independent of the draft)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('trackViewMode') as ViewMode | null;
      if (savedViewMode === 'card' || savedViewMode === 'list') {
        setViewMode(savedViewMode);
      }
    }
  }, []);

  // Save view mode to localStorage when it changes
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('trackViewMode', mode);
    }
  }, []);

  // Generate cover preview whenever playlist name or poster thumbnail changes.
  // The cover is derived data and may regenerate freely.
  useEffect(() => {
    // Track if this effect is still current to prevent race conditions
    let isCurrent = true;

    const generatePreview = async () => {
      if (!playlistName.trim()) {
        if (isCurrent) {
          setCoverPreview(null);
        }
        return;
      }

      if (isCurrent) {
        setGeneratingCover(true);
      }

      try {
        const response = await axios.post('/api/preview-cover', {
          playlistName: playlistName.trim(),
          posterThumbnail: posterThumbnail || undefined,
        });

        // Only update state if this effect is still current
        if (isCurrent) {
          // Convert to data URI for preview
          setCoverPreview(`data:image/jpeg;base64,${response.data.coverPreview}`);
        }
      } catch (error) {
        if (isCurrent) {
          console.error('Failed to generate cover preview:', error);
          setCoverPreview(null);
        }
      } finally {
        if (isCurrent) {
          setGeneratingCover(false);
        }
      }
    };

    // Debounce the preview generation to avoid too many updates while typing
    const timeoutId = setTimeout(generatePreview, 500);

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
    };
  }, [playlistName, posterThumbnail]);

  // Hydrate the exact track-review state from the draft. Waits for the router
  // and auth so a refresh never triggers a premature missing-state redirect.
  useEffect(() => {
    if (!router.isReady || authLoading || !user) {
      return;
    }
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    const draft = platform ? readPlaylistDraftForUser(user.draftOwnerId, platform) : null;

    if (!draft?.trackReview || draft.trackReview.tracks.length === 0) {
      // Missing prerequisites: route to the nearest page that still has data.
      router.push(draft?.artistReview.artists.length ? '/review-artists' : '/upload');
      return;
    }

    const { trackReview } = draft;
    const trackIds = new Set(trackReview.tracks.map((t) => t.id));
    // Drop stale selected IDs that no longer map to an available track.
    const selected = new Set(trackReview.selectedTrackIds.filter((id) => trackIds.has(id)));

    setTracks(trackReview.tracks);
    selectedRef.current = selected;
    setSelectedTracks(new Set(selected));
    warningsRef.current = [...trackReview.warnings];
    setWarnings([...trackReview.warnings]);
    playlistNameRef.current = trackReview.playlistName;
    setPlaylistName(trackReview.playlistName);
    setPosterThumbnail(draft.source.posterThumbnail ?? null);

    setLoading(false);
  }, [router.isReady, authLoading, user, platform, router]);

  const handleToggleTrack = useCallback(
    (trackId: string) => {
      const next = new Set(selectedRef.current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      selectedRef.current = next;
      setSelectedTracks(new Set(next));
      persistTrackReview();
    },
    [persistTrackReview]
  );

  const handleSelectAll = useCallback(() => {
    const next = new Set(tracks.map((t) => t.id));
    selectedRef.current = next;
    setSelectedTracks(new Set(next));
    persistTrackReview();
  }, [tracks, persistTrackReview]);

  const handleDeselectAll = useCallback(() => {
    selectedRef.current = new Set();
    setSelectedTracks(new Set());
    persistTrackReview();
  }, [persistTrackReview]);

  const handlePlaylistNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      playlistNameRef.current = value;
      setPlaylistName(value);
      persistTrackReview();
    },
    [persistTrackReview]
  );

  const handleDismissWarnings = useCallback(() => {
    warningsRef.current = [];
    setWarnings([]);
    persistTrackReview();
  }, [persistTrackReview]);

  const handleCreatePlaylist = async () => {
    if (selectedTracks.size === 0) {
      setError({ type: 'validation', message: 'Please select at least one track' });
      return;
    }

    if (selectedTracks.size > MAX_PLAYLIST_TRACKS) {
      setError({
        type: 'validation',
        message: `Too many tracks selected (${selectedTracks.size}). The maximum is ${MAX_PLAYLIST_TRACKS} — deselect some tracks to continue.`,
      });
      return;
    }

    if (!playlistName.trim()) {
      setError({ type: 'validation', message: 'Please enter a playlist name' });
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const trackIds = Array.from(selectedTracks);
      const response = await apiClient.post('/api/create-playlist', {
        trackIds,
        playlistName: playlistName.trim(),
        posterThumbnail: posterThumbnail || undefined,
      });

      // DON'T clear the draft here - it causes the component to re-render
      // and redirect before navigation completes.
      // The success page clears it when it mounts.

      // Redirect to success page
      router.push(`/success?playlistUrl=${encodeURIComponent(response.data.playlistUrl)}`);
    } catch (err: any) {
      console.error('Error creating playlist:', err);
      const appError = parseApiError(err, 'create playlist');
      if (appError.type === 'server') {
        appError.action = { label: 'Try again', onClick: handleCreatePlaylist };
      }
      setError(appError);
      setCreating(false);
    }
  };

  // Back goes to the immediately preceding step and never clears or rewrites
  // the stored track selections.
  const handleBackToEdit = () => {
    router.push('/review-artists');
  };

  // Wait for auth to complete
  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    router.push('/');
    return null;
  }

  if (loading) {
    return <LoadingScreen message="Loading your tracks..." />;
  }

  const selectedCount = selectedTracks.size;
  const totalCount = tracks.length;
  const overTrackLimit = selectedCount > MAX_PLAYLIST_TRACKS;
  const excessTracks = selectedCount - MAX_PLAYLIST_TRACKS;

  const toggleWithKeyboard = (event: React.KeyboardEvent<HTMLElement>, trackId: string) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handleToggleTrack(trackId);
    }
  };

  return (
    <PageLayout showNav>
      <Head>
        <title>Review Tracks - Playlistd</title>
      </Head>

      <div className="studio-shell pb-40 pt-28 sm:pt-32">
        <div className="mb-6">
          <ProgressStepper
            steps={[
              { label: 'Upload', href: '/upload' },
              { label: 'Review Artists', href: '/review-artists' },
              { label: 'Review Tracks' },
              { label: 'Done' },
            ]}
            currentStep={2}
          />
        </div>

        <header className="mb-6 border-b border-dark-700/70 pb-6">
          <p className="eyebrow mb-3">03 / Final selection</p>
          <div className="flex flex-col justify-between gap-2 sm:gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="page-heading">Make the final cut.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dark-300 sm:text-base">
                Name your mix and choose the songs you want to keep.
              </p>
            </div>
            <p className="hidden text-sm text-dark-300 lg:block">
              <span className="font-semibold text-accent-500">{totalCount}</span> tracks found
            </p>
          </div>
        </header>

        <AnimatePresence>
          {warnings.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-2xl border border-amber-700/50 bg-amber-950/20 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-amber-200">Some artists had issues</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-100/70">
                    {warnings.slice(0, 10).map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                    {warnings.length > 10 && <li>…and {warnings.length - 10} more</li>}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={handleDismissWarnings}
                  className="rounded-lg px-2 py-1 text-sm text-amber-200 hover:bg-amber-200/10 focus-ring"
                  aria-label="Dismiss warnings"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <ErrorMessage
                message={error.message}
                title={error.title}
                action={error.action}
                onDismiss={() => setError(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <section
          className="surface mb-6 flex items-center gap-4 p-4 sm:gap-5"
          aria-labelledby="playlist-details-heading"
        >
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-dark-700 bg-dark-800 sm:h-24 sm:w-24">
            {generatingCover ? (
              <div
                className="absolute inset-0 flex items-center justify-center bg-dark-900"
                role="status"
                aria-label="Generating cover preview"
              >
                <LoadingSpinner size="sm" />
              </div>
            ) : coverPreview ? (
              <img
                src={coverPreview}
                alt="Playlist cover preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-dark-300">
                <Illustration name="cover" size={48} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="playlist-details-heading" className="eyebrow mb-1">
              Your playlist
            </h2>
            <label htmlFor="playlistName" className="sr-only">
              Playlist Name
            </label>
            <input
              id="playlistName"
              type="text"
              value={playlistName}
              onChange={handlePlaylistNameChange}
              disabled={creating}
              className="w-full rounded-xl border border-dark-600 bg-dark-950 px-3 py-2.5 text-sm text-white placeholder-dark-400 outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 sm:px-4"
              placeholder="Enter playlist name…"
              maxLength={100}
            />
            <p className="mt-1.5 text-xs text-dark-300">
              This name will appear in your {platformName} library · {playlistName.length}/100
            </p>
            {posterThumbnail && (
              <p className="mt-1 text-xs text-accent-400">Cover artwork uses your poster</p>
            )}
          </div>
        </section>

        <section aria-labelledby="tracks-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              <h2 id="tracks-heading" className="text-2xl font-bold tracking-tight text-white">
                Review your tracks
              </h2>
              <p role="status" aria-label="Track selection" className="text-xs text-dark-300">
                <span className="text-lg sm:text-3xl font-bold tabular-nums tracking-tight text-accent-500">
                  {selectedCount} <span className="text-dark-300">of</span> {totalCount}
                </span>{' '}
                <span className="text-dark-300">selected</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex rounded-xl border border-dark-700 bg-dark-900 p-1"
                role="group"
                aria-label="Track view"
              >
                <button
                  type="button"
                  onClick={() => handleViewModeChange('card')}
                  aria-label="Switch to card view"
                  aria-pressed={viewMode === 'card'}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm focus-ring',
                    viewMode === 'card'
                      ? 'bg-dark-700 text-white'
                      : 'text-dark-300 hover:text-white'
                  )}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('list')}
                  aria-label="Switch to list view"
                  aria-pressed={viewMode === 'list'}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm focus-ring',
                    viewMode === 'list'
                      ? 'bg-dark-700 text-white'
                      : 'text-dark-300 hover:text-white'
                  )}
                >
                  List
                </button>
              </div>
              <Button variant="secondary" size="sm" onClick={handleSelectAll} disabled={creating}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeselectAll} disabled={creating}>
                Deselect All
              </Button>
            </div>
          </div>

          {viewMode === 'card' ? (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              role="group"
              aria-label="Select tracks"
            >
              {tracks.map((track) => {
                const isSelected = selectedTracks.has(track.id);
                return (
                  <Card
                    key={track.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`${track.name} by ${track.artist}`}
                    tabIndex={0}
                    onClick={() => handleToggleTrack(track.id)}
                    onKeyDown={(event) => toggleWithKeyboard(event, track.id)}
                    className={cn(
                      'group cursor-pointer overflow-hidden rounded-2xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                      isSelected
                        ? 'border-accent-500/80 bg-dark-800'
                        : 'border-dark-700 bg-dark-900 hover:border-dark-500'
                    )}
                  >
                    <div className="relative aspect-square bg-dark-800">
                      {track.albumArtwork ? (
                        <img
                          src={track.albumArtwork}
                          alt={track.album}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Illustration name="tracks" size={72} />
                        </div>
                      )}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border text-sm font-bold',
                          isSelected
                            ? 'border-accent-500 bg-accent-500 text-dark-950'
                            : 'border-white/50 bg-dark-950/80 text-white'
                        )}
                      >
                        {isSelected && '✓'}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-sm font-semibold text-white" title={track.name}>
                        {track.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-dark-300" title={track.artist}>
                        {track.artist}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-dark-700 pt-2 text-xs text-dark-300">
                        <span className="truncate" title={track.album}>
                          {track.album}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatDuration(track.duration)}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-2xl border border-dark-700 bg-dark-900"
              role="group"
              aria-label="Select tracks"
            >
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_3rem_1.5rem] items-center gap-3 border-b border-dark-700 bg-dark-800/70 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-dark-300 sm:grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_3.5rem_1.5rem] sm:gap-4 sm:px-6">
                <span aria-hidden="true">#</span>
                <span className="sm:hidden">Song / artist</span>
                <span className="hidden sm:block">Song name</span>
                <span className="hidden sm:block">Artist</span>
                <span className="hidden sm:block">Album</span>
                <span className="text-right">Time</span>
                <span className="sr-only">Selected</span>
              </div>
              {tracks.map((track, index) => {
                const isSelected = selectedTracks.has(track.id);
                return (
                  <div
                    key={track.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`${track.name} by ${track.artist}`}
                    tabIndex={0}
                    onClick={() => handleToggleTrack(track.id)}
                    onKeyDown={(event) => toggleWithKeyboard(event, track.id)}
                    className={cn(
                      'grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_3rem_1.5rem] items-center gap-3 border-b border-l-2 border-dark-700/70 px-4 py-3.5 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 sm:grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_3.5rem_1.5rem] sm:gap-4 sm:px-6',
                      isSelected
                        ? 'border-l-transparent bg-dark-900 hover:bg-dark-800'
                        : 'border-l-dark-600 bg-dark-950 hover:bg-dark-800/70'
                    )}
                  >
                    <span
                      className="font-mono text-xs tabular-nums text-dark-400"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex min-w-0 items-center gap-3">
                      {track.albumArtwork ? (
                        <img
                          src={track.albumArtwork}
                          alt=""
                          className={cn(
                            'h-11 w-11 shrink-0 rounded-md object-cover',
                            !isSelected && 'grayscale opacity-50'
                          )}
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-dark-800',
                            !isSelected && 'opacity-50'
                          )}
                        >
                          <Illustration name="tracks" size={32} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-sm font-semibold',
                            isSelected
                              ? 'text-white'
                              : 'text-dark-300 line-through decoration-dark-500'
                          )}
                          title={track.name}
                        >
                          {track.name}
                        </p>
                        <p
                          className={cn(
                            'truncate text-xs sm:hidden',
                            isSelected ? 'text-dark-300' : 'text-dark-400'
                          )}
                          title={track.artist}
                        >
                          {track.artist}
                        </p>
                      </div>
                    </div>
                    <p
                      className={cn(
                        'hidden truncate text-sm sm:block',
                        isSelected ? 'text-dark-300' : 'text-dark-400'
                      )}
                      title={track.artist}
                    >
                      {track.artist}
                    </p>
                    <p
                      className={cn(
                        'hidden truncate text-sm sm:block',
                        isSelected ? 'text-dark-300' : 'text-dark-400'
                      )}
                      title={track.album}
                    >
                      {track.album}
                    </p>
                    <p
                      className={cn(
                        'text-right text-xs tabular-nums',
                        isSelected ? 'text-dark-300' : 'text-dark-400'
                      )}
                    >
                      {formatDuration(track.duration)}
                    </p>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold',
                        isSelected
                          ? 'border-dark-400 bg-dark-700 text-white'
                          : 'border-dark-600 bg-dark-800 text-dark-400'
                      )}
                    >
                      {isSelected ? '✓' : '−'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div
          className="sticky bottom-3 z-20 mt-8 rounded-2xl border border-dark-600 bg-dark-900/95 p-3 shadow-hard backdrop-blur-md sm:p-4"
          role="region"
          aria-label="Playlist actions"
        >
          {overTrackLimit && (
            <p className="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              Too many tracks selected ({selectedCount}/{MAX_PLAYLIST_TRACKS}). Deselect{' '}
              {excessTracks} track{excessTracks !== 1 ? 's' : ''} to create the playlist.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleBackToEdit} disabled={creating}>
                Back to Edit
              </Button>
              <StartOverButton />
            </div>
            {creating ? (
              <div
                className="flex items-center gap-3 rounded-xl bg-accent-500 px-5 py-3 text-sm font-semibold text-dark-950"
                role="status"
              >
                <LoadingSpinner size="sm" className="border-dark-950/30 border-t-dark-950" />
                Creating your playlist…
              </div>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleCreatePlaylist}
                disabled={selectedCount === 0 || overTrackLimit}
                className="rounded-xl bg-accent-500 text-dark-950 hover:bg-accent-400"
              >
                Create Playlist with {selectedCount} Track{selectedCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
