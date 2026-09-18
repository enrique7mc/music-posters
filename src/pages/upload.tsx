import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Artist, AnalyzeResponse, ArtistInputSource } from '@/types';
import { apiClient } from '@/lib/api-client';
import { AppError, parseApiError } from '@/lib/error-utils';
import { MAX_ARTISTS_PER_SEARCH } from '@/lib/constants';
import { ArtistTextParseResult } from '@/lib/artist-text';
import PageLayout from '@/components/layout/PageLayout';
import { AsymmetricSection } from '@/components/layout/Section';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import UploadZone from '@/components/features/UploadZone';
import ArtistTextInput from '@/components/features/ArtistTextInput';
import ArtistList from '@/components/features/ArtistList';
import TrackCountSelector, { TrackCountMode } from '@/components/features/TrackCountSelector';
import ProgressStepper from '@/components/ui/ProgressStepper';
import { fadeIn } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

/** null = no choice made yet (poster/text chooser is shown). */
type UploadInputMode = ArtistInputSource | null;

/**
 * sessionStorage keys owned by the upload → review flow. Cleared (never the
 * whole store) when a new lineup starts so stale poster thumbnails, event
 * names, tracks, and warnings can't leak across input modes. `returnAfterAuth`
 * belongs to the auth flow and is deliberately excluded.
 */
const FLOW_SESSION_KEYS = [
  'artists',
  'analysisProvider',
  'posterThumbnail',
  'eventName',
  'tracks',
  'trackWarnings',
  'inputSource',
] as const;

function clearFlowSessionState() {
  if (typeof window === 'undefined') return;
  FLOW_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
}

export default function Upload() {
  const router = useRouter();
  const { user, loading: authLoading, platform } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';
  const [inputMode, setInputMode] = useState<UploadInputMode>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [trackCountMode, setTrackCountMode] = useState<TrackCountMode>('tier-based');
  const [customTrackCount, setCustomTrackCount] = useState<number>(3);
  // Raw manual-entry text; lifted here so the draft survives mode switches.
  const [artistText, setArtistText] = useState('');
  // Track latest analysis request to prevent race conditions
  const latestAnalysisToken = useRef<Symbol | null>(null);

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!authLoading && !user) {
      router.push('/');
      return;
    }

    // After fresh Spotify auth callback, check for return URL
    if (!authLoading && user && typeof window !== 'undefined') {
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
  }, [authLoading, user, router]);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setArtists([]);

    // Clear stale results immediately when a new upload starts, then mark this
    // run as poster input (overwrites any previous text-run marker).
    if (typeof window !== 'undefined') {
      try {
        clearFlowSessionState();
        sessionStorage.setItem('inputSource', 'poster');
      } catch (err) {
        // Storage is only needed when advancing to review; don't prevent image
        // analysis in browsers that restrict it.
        console.warn('Could not update poster flow session state:', err);
        try {
          sessionStorage.removeItem('inputSource');
        } catch {
          // Best effort: a missing source is safely treated as poster input.
        }
      }
    }

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

      // Store poster metadata without letting restricted browser storage turn a
      // successful analysis into an apparent API failure.
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('inputSource', 'poster');
          if (response.data.eventName?.trim()) {
            sessionStorage.setItem('eventName', response.data.eventName.trim());
          }
        } catch (err) {
          console.warn('Could not store poster analysis metadata:', err);
        }
      }

      if (response.data.artists.length === 0) {
        setError({
          type: 'validation',
          message: 'No artists found in the image. Try a different poster.',
        });
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
      setPreviewUrl(null);
      setPosterThumbnail(null);
    } finally {
      // Only update analyzing state if this is still the latest request
      if (latestAnalysisToken.current === requestToken) {
        setAnalyzing(false);
      }
    }
  };

  /**
   * Drop any poster-analysis state (in-flight and completed) when leaving
   * poster input. Bumping the token means a late /api/analyze response can
   * never repopulate state after the switch.
   */
  const resetPosterAnalysisState = () => {
    latestAnalysisToken.current = Symbol('superseded');
    setAnalyzing(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setArtists([]);
    setPosterThumbnail(null);
    setError(null);
  };

  // Choose "Enter artists" on the chooser, or switch mid-flow.
  const handleSwitchToText = () => {
    resetPosterAnalysisState();
    try {
      clearFlowSessionState();
    } catch (err) {
      // Let the user enter a lineup. Submission performs the required writes
      // and surfaces a recoverable error if storage is still unavailable.
      console.warn('Could not clear previous flow session state:', err);
    }
    setInputMode('text');
  };

  // Back to poster input; the manual text draft is kept, poster behavior is
  // fully restored (handleFileSelect re-marks inputSource on upload).
  const handleSwitchToPoster = () => {
    setError(null);
    setInputMode('poster');
  };

  const handleSubmitArtistText = (result: ArtistTextParseResult) => {
    if (result.errorCode || result.invalidNames.length > 0 || result.artists.length === 0) return;
    if (result.artists.length > MAX_ARTISTS_PER_SEARCH) return; // guarded by parser

    resetPosterAnalysisState();

    if (typeof window !== 'undefined') {
      try {
        // Clear previous result state (poster or text) before storing the new
        // lineup so stale thumbnails, event names, tracks, and warnings die here.
        clearFlowSessionState();
        const artistsJson = JSON.stringify(result.artists);
        sessionStorage.setItem('artists', artistsJson);
        sessionStorage.setItem('inputSource', 'text');
        // Verify the write — never navigate with incomplete state.
        if (
          sessionStorage.getItem('artists') !== artistsJson ||
          sessionStorage.getItem('inputSource') !== 'text'
        ) {
          throw new Error('sessionStorage verification failed');
        }
      } catch (err) {
        console.error('Failed to store manually entered lineup:', err);
        try {
          clearFlowSessionState();
        } catch {
          // Best-effort cleanup only; preserve the recoverable UI below.
        }
        setError({
          type: 'server',
          title: 'Could not save your lineup',
          message:
            'Your browser blocked local storage, so the lineup could not be saved. Try again, or upload a poster instead.',
        });
        return;
      }
    }

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

    setCreating(true);
    setError(null);

    try {
      const requestBody: any = {
        artists: artists,
        trackCountMode: trackCountMode,
      };

      // Add custom track count if in custom mode
      if (trackCountMode === 'custom') {
        requestBody.customTrackCount = customTrackCount;
      }

      const response = await apiClient.post('/api/search-tracks', requestBody);

      // Store tracks and poster thumbnail for review page
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tracks', JSON.stringify(response.data.tracks));
        if (response.data.warnings?.length) {
          sessionStorage.setItem('trackWarnings', JSON.stringify(response.data.warnings));
        }
        if (posterThumbnail) {
          sessionStorage.setItem('posterThumbnail', posterThumbnail);
        }
      }

      router.push('/review-tracks');
    } catch (err: any) {
      console.error('Error searching tracks:', err);
      const appError = parseApiError(err, 'search tracks');
      if (appError.type === 'rate_limit' || appError.type === 'server') {
        appError.action = { label: 'Try again', onClick: handleCreatePlaylist };
      }
      setError(appError);
      setCreating(false);
    }
  };

  if (authLoading) {
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

  return (
    <>
      <Head>
        <title>Upload Poster - Playlistd</title>
      </Head>

      <PageLayout>
        <div className="min-h-[calc(100vh-4rem)] pt-20">
          {/* Progress Stepper (only show when artists are analyzed) */}
          {artists.length > 0 && (
            <div className="container mx-auto px-4 mb-8">
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
          )}

          {/* Error message */}
          {error && (
            <div className="container mx-auto px-4 mb-6">
              <ErrorMessage
                message={error.message}
                title={error.title}
                action={error.action}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {/* Empty state - choose how to start */}
          {!selectedFile && !previewUrl && inputMode === null && (
            <motion.div
              className="container mx-auto px-4 py-12"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="max-w-3xl mx-auto text-center mb-8">
                <h2 className="text-3xl font-bold text-dark-50 mb-3">Start Your Playlist</h2>
                <p className="text-dark-400">
                  Upload a festival poster for us to analyze, or type the artists yourself.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {/* Upload a poster */}
                <button
                  onClick={() => setInputMode('poster')}
                  className="p-8 rounded-lg border-2 border-dark-700 bg-dark-800 hover:border-accent-500 hover:bg-accent-500/10 transition-all text-left group"
                >
                  <div className="text-5xl mb-4">🎸</div>
                  <div className="text-lg font-semibold text-dark-100 mb-2 group-hover:text-accent-400 transition-colors">
                    Upload a Poster
                  </div>
                  <p className="text-sm text-dark-400">
                    We&apos;ll read the lineup from a festival or concert poster image.
                  </p>
                </button>

                {/* Enter artists */}
                <button
                  onClick={() => handleSwitchToText()}
                  className="p-8 rounded-lg border-2 border-dark-700 bg-dark-800 hover:border-accent-500 hover:bg-accent-500/10 transition-all text-left group"
                >
                  <div className="text-5xl mb-4">✍️</div>
                  <div className="text-lg font-semibold text-dark-100 mb-2 group-hover:text-accent-400 transition-colors">
                    Enter Artists
                  </div>
                  <p className="text-sm text-dark-400">
                    Type the artists you want, one per line — no poster needed.
                  </p>
                </button>
              </div>
            </motion.div>
          )}

          {/* Poster mode - upload zone */}
          {!selectedFile && !previewUrl && inputMode === 'poster' && (
            <motion.div
              className="container mx-auto px-4 py-12"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <UploadZone onFileSelect={handleFileSelect} />
              <div className="max-w-3xl mx-auto mt-6 text-center">
                <Button variant="text" onClick={handleSwitchToText}>
                  Or enter artists manually instead
                </Button>
              </div>
            </motion.div>
          )}

          {/* Text mode - manual artist entry */}
          {!selectedFile && !previewUrl && inputMode === 'text' && (
            <motion.div
              className="container mx-auto px-4 py-12"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="max-w-3xl mx-auto">
                <ArtistTextInput
                  value={artistText}
                  onChange={setArtistText}
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
          {previewUrl && artists.length > 0 && (
            <AsymmetricSection
              left={
                <div className="space-y-6">
                  {/* Poster preview */}
                  <Card variant="elevated" className="p-6">
                    <h3 className="text-lg font-semibold text-dark-100 mb-4">Your Poster</h3>
                    <div className="relative rounded-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Festival Poster"
                        className="w-full h-auto"
                        style={{ maxHeight: '60vh', objectFit: 'contain' }}
                      />
                    </div>
                  </Card>

                  {/* Upload new button */}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setArtists([]);
                      setError(null);
                    }}
                    className="w-full"
                  >
                    Upload Different Poster
                  </Button>
                </div>
              }
              right={
                <div className="space-y-6">
                  {/* Artist list */}
                  <ArtistList artists={artists} provider={analysisProvider} />

                  {/* Flow choice: Quick Create or Customize */}
                  <Card variant="glass" className="p-6">
                    <h4 className="text-lg font-semibold text-dark-100 mb-4">
                      What would you like to do?
                    </h4>
                    <p className="text-sm text-dark-400 mb-6">
                      Choose how to proceed with your {artists.length}{' '}
                      {artists.length === 1 ? 'artist' : 'artists'}
                    </p>

                    <div className="space-y-3">
                      {/* Quick Create */}
                      <button
                        onClick={handleCreatePlaylist}
                        disabled={creating}
                        className="w-full p-4 rounded-lg border-2 border-dark-700 bg-dark-800 hover:border-accent-500 hover:bg-accent-500/10 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div className="text-sm text-dark-400">
                              Use recommended tier-based track counts and create your playlist now
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Customize Artists */}
                      <button
                        onClick={() => {
                          // Store artists in sessionStorage for review-artists page
                          if (typeof window !== 'undefined') {
                            sessionStorage.setItem('artists', JSON.stringify(artists));
                            sessionStorage.setItem('analysisProvider', analysisProvider);
                            if (posterThumbnail) {
                              sessionStorage.setItem('posterThumbnail', posterThumbnail);
                            }
                          }
                          router.push('/review-artists');
                        }}
                        disabled={creating}
                        className="w-full p-4 rounded-lg border-2 border-dark-700 bg-dark-800 hover:border-accent-500 hover:bg-accent-500/10 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div className="text-sm text-dark-400">
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

          {/* Analyzing state - show poster if available */}
          {previewUrl && analyzing && (
            <div className="container mx-auto px-4">
              <div className="max-w-2xl mx-auto text-center">
                <motion.div
                  className="mb-8"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Festival Poster"
                    className="w-full h-auto rounded-lg shadow-hard"
                    style={{ maxHeight: '50vh', objectFit: 'contain' }}
                  />
                </motion.div>
                <p className="text-lg text-dark-300">Analyzing poster with AI...</p>
              </div>
            </div>
          )}
        </div>
      </PageLayout>
    </>
  );
}
