import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Artist } from '@/types';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ProgressStepper from '@/components/ui/ProgressStepper';
import EditableArtistList from '@/components/features/EditableArtistList';
import TrackCountModeSelector, {
  TrackCountMode,
  TierCounts,
  DEFAULT_TIER_COUNTS,
} from '@/components/features/TrackCountModeSelector';
import BulkActionsBar from '@/components/features/BulkActionsBar';
import PlaylistSummaryPreview from '@/components/features/PlaylistSummaryPreview';
import { fadeIn, slideUp } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

export default function ReviewArtists() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from upload page
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);

  // Track count configuration
  const [trackCountMode, setTrackCountMode] = useState<TrackCountMode>('tier-based');
  const [tierCounts, setTierCounts] = useState<TierCounts>(DEFAULT_TIER_COUNTS);
  const [perArtistCounts, setPerArtistCounts] = useState<Record<string, number>>({});

  // Selection state for bulk operations
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Redirect if not authenticated
    if (!authLoading && !user) {
      router.push('/');
      return;
    }

    // Wait for auth to finish before loading data
    if (authLoading) {
      return;
    }

    // Load data from sessionStorage
    if (typeof window !== 'undefined') {
      const storedArtists = sessionStorage.getItem('artists');
      const storedProvider = sessionStorage.getItem('analysisProvider');
      const storedThumbnail = sessionStorage.getItem('posterThumbnail');

      if (!storedArtists) {
        // No artists in session, redirect to upload
        router.push('/upload');
        return;
      }

      try {
        const parsedArtists: Artist[] = JSON.parse(storedArtists);
        setArtists(parsedArtists);
        setAnalysisProvider((storedProvider as 'vision' | 'gemini' | 'hybrid') || 'vision');
        setPosterThumbnail(storedThumbnail);

        // Initialize per-artist counts with defaults
        const initialCounts: Record<string, number> = {};
        parsedArtists.forEach((artist) => {
          if (artist.tier) {
            initialCounts[artist.name] = DEFAULT_TIER_COUNTS[artist.tier];
          } else {
            initialCounts[artist.name] = 3;
          }
        });
        setPerArtistCounts(initialCounts);
      } catch (err) {
        console.error('Error parsing stored artists:', err);
        router.push('/upload');
        return;
      }
    }

    setLoading(false);
  }, [authLoading, user, router]);

  // Toggle artist selection
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
    setArtists((prev) => prev.filter((a) => a.name !== artistName));
    setSelectedArtists((prev) => {
      const newSet = new Set(prev);
      newSet.delete(artistName);
      return newSet;
    });
    // Clean up perArtistCounts to prevent stale entries
    setPerArtistCounts((prev) => {
      const updated = { ...prev };
      delete updated[artistName];
      return updated;
    });
  };

  // Remove selected artists (bulk)
  const handleRemoveSelected = () => {
    setArtists((prev) => prev.filter((a) => !selectedArtists.has(a.name)));
    // Clean up perArtistCounts for removed artists
    setPerArtistCounts((prev) => {
      const updated = { ...prev };
      selectedArtists.forEach((artistName) => {
        delete updated[artistName];
      });
      return updated;
    });
    setSelectedArtists(new Set());
  };

  // Reset to recommended tier-based counts
  const handleResetToRecommended = () => {
    setTrackCountMode('tier-based');
    setTierCounts(DEFAULT_TIER_COUNTS);
    // Reset per-artist counts to defaults
    const resetCounts: Record<string, number> = {};
    artists.forEach((artist) => {
      if (artist.tier) {
        resetCounts[artist.name] = DEFAULT_TIER_COUNTS[artist.tier];
      } else {
        resetCounts[artist.name] = 3;
      }
    });
    setPerArtistCounts(resetCounts);
  };

  // Apply track count to all artists in a tier
  const handleApplyToTier = (tier: string, count: number) => {
    setPerArtistCounts((prev) => {
      const updated = { ...prev };
      artists.forEach((artist) => {
        if (artist.tier === tier) {
          updated[artist.name] = count;
        }
      });
      return updated;
    });
  };

  // Update per-artist track count
  const handlePerArtistCountChange = (artistName: string, count: number) => {
    setPerArtistCounts((prev) => ({
      ...prev,
      [artistName]: count,
    }));
  };

  // Update tier count (for custom-per-tier mode)
  const handleTierCountChange = (tier: keyof TierCounts, count: number) => {
    setTierCounts((prev) => ({
      ...prev,
      [tier]: count,
    }));
  };

  // Continue to search tracks
  const handleContinue = async () => {
    if (artists.length === 0) {
      setError('No artists to search. Please upload a new poster.');
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const requestBody: any = {
        artists: artists,
        trackCountMode: trackCountMode,
      };

      // Add appropriate track count data based on mode
      if (trackCountMode === 'custom-per-tier') {
        requestBody.tierCounts = tierCounts;
      } else if (trackCountMode === 'per-artist') {
        requestBody.perArtistCounts = perArtistCounts;
      }

      const response = await axios.post('/api/search-tracks', requestBody);

      console.log('[ReviewArtists] Received tracks from API:', response.data.tracks.length);

      // Store tracks and poster thumbnail for review page
      if (typeof window !== 'undefined') {
        const tracksJson = JSON.stringify(response.data.tracks);
        sessionStorage.setItem('tracks', tracksJson);
        console.log(
          '[ReviewArtists] Stored tracks in sessionStorage:',
          response.data.tracks.length,
          'tracks'
        );

        if (posterThumbnail) {
          sessionStorage.setItem('posterThumbnail', posterThumbnail);
          console.log('[ReviewArtists] Stored poster thumbnail');
        }

        // Verify storage
        const verification = sessionStorage.getItem('tracks');
        console.log(
          '[ReviewArtists] Verification - tracks in storage:',
          verification ? 'YES' : 'NO'
        );

        // DON'T clean up artists here - keep them until we successfully navigate
        // The review-tracks page or success page will clean up when appropriate
        // sessionStorage.removeItem('artists');
        // sessionStorage.removeItem('analysisProvider');
      }

      console.log('[ReviewArtists] Navigating to /review-tracks...');
      router.push('/review-tracks');
    } catch (err: any) {
      console.error('Error searching tracks:', err);
      const errorMessage = err.response?.data?.error || 'Failed to search tracks';
      setError(errorMessage);
      setSearching(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  if (searching) {
    return <LoadingScreen message="Finding tracks on Spotify... This may take a minute." />;
  }

  return (
    <>
      <Head>
        <title>Review Artists - Music Posters</title>
      </Head>

      <PageLayout showNav>
        <div className="container mx-auto px-4 py-8 lg:py-12">
          <motion.div
            className="max-w-7xl mx-auto"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            {/* Progress Stepper */}
            <div className="mb-8">
              <ProgressStepper
                steps={[
                  { label: 'Upload' },
                  { label: 'Review Artists' },
                  { label: 'Review Tracks' },
                  { label: 'Done' },
                ]}
                currentStep={1}
              />
            </div>

            {/* Header */}
            <motion.div className="mb-8" variants={slideUp}>
              <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight text-dark-50 mb-3">
                Customize Your Artists
              </h1>
              <p className="text-lg text-dark-300">
                Review artists, adjust track counts, and remove unwanted artists
              </p>
            </motion.div>

            {/* Error message */}
            {error && (
              <div className="mb-6">
                <ErrorMessage message={error} onDismiss={() => setError(null)} />
              </div>
            )}

            {/* Main content in grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column - 2/3 width on desktop */}
              <div className="lg:col-span-2 space-y-6">
                {/* Bulk Actions Bar */}
                <BulkActionsBar
                  artists={artists}
                  trackCountMode={trackCountMode}
                  selectedCount={selectedArtists.size}
                  onResetToRecommended={handleResetToRecommended}
                  onRemoveSelected={handleRemoveSelected}
                  onApplyToTier={handleApplyToTier}
                />

                {/* Editable Artist List */}
                <EditableArtistList
                  artists={artists}
                  provider={analysisProvider}
                  trackCountMode={trackCountMode}
                  perArtistCounts={perArtistCounts}
                  selectedArtists={selectedArtists}
                  onToggleSelection={handleToggleSelection}
                  onRemoveArtist={handleRemoveArtist}
                  onPerArtistCountChange={handlePerArtistCountChange}
                />
              </div>

              {/* Right column - 1/3 width on desktop, sticky */}
              <div className="lg:col-span-1 space-y-6">
                <div className="lg:sticky lg:top-24 space-y-6">
                  {/* Track Count Mode Selector */}
                  <TrackCountModeSelector
                    mode={trackCountMode}
                    tierCounts={tierCounts}
                    onModeChange={setTrackCountMode}
                    onTierCountChange={handleTierCountChange}
                    disabled={searching}
                  />

                  {/* Playlist Summary Preview */}
                  <PlaylistSummaryPreview
                    artists={artists}
                    trackCountMode={trackCountMode}
                    tierCounts={tierCounts}
                    perArtistCounts={perArtistCounts}
                  />

                  {/* Continue button */}
                  <Card variant="glass" className="p-6">
                    <h4 className="text-lg font-semibold text-dark-100 mb-4">
                      Ready to find tracks?
                    </h4>
                    <p className="text-sm text-dark-400 mb-6">
                      We&apos;ll search Spotify for tracks from {artists.length}{' '}
                      {artists.length === 1 ? 'artist' : 'artists'} and let you review them before
                      creating your playlist.
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handleContinue}
                        className="w-full"
                        isLoading={searching}
                        disabled={artists.length === 0}
                      >
                        Search Tracks & Continue
                      </Button>
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
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </PageLayout>
    </>
  );
}
