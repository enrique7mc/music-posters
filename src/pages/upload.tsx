import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Artist, AnalyzeResponse } from '@/types';
import PageLayout from '@/components/layout/PageLayout';
import { AsymmetricSection } from '@/components/layout/Section';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import UploadZone from '@/components/features/UploadZone';
import ArtistList from '@/components/features/ArtistList';
import TrackCountSelector, { TrackCountMode } from '@/components/features/TrackCountSelector';
import ProgressStepper from '@/components/ui/ProgressStepper';
import { fadeIn } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

export default function Upload() {
  const router = useRouter();
  const { user, loading: authLoading, platform } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackCountMode, setTrackCountMode] = useState<TrackCountMode>('tier-based');
  const [customTrackCount, setCustomTrackCount] = useState<number>(3);
  // Track latest analysis request to prevent race conditions
  const latestAnalysisToken = useRef<Symbol | null>(null);

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setArtists([]);

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
        setError('No artists found in the image. Try a different poster.');
      }
    } catch (err: any) {
      // Only show error if this is still the latest request
      if (latestAnalysisToken.current !== requestToken) {
        return;
      }

      console.error('Error analyzing image:', err);
      const errorMessage = err.response?.data?.error || 'Failed to analyze image';
      setError(errorMessage);
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

  const handleCreatePlaylist = async () => {
    if (artists.length === 0) return;

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

      const response = await axios.post('/api/search-tracks', requestBody);

      // Store tracks and poster thumbnail for review page
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tracks', JSON.stringify(response.data.tracks));
        if (posterThumbnail) {
          sessionStorage.setItem('posterThumbnail', posterThumbnail);
        }
      }

      router.push('/review-tracks');
    } catch (err: any) {
      console.error('Error searching tracks:', err);
      const errorMessage = err.response?.data?.error || 'Failed to search tracks';
      setError(errorMessage);
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
        <title>Upload Poster - Music Posters</title>
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
              <ErrorMessage message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          {/* Empty state - no poster uploaded */}
          {!selectedFile && !previewUrl && (
            <motion.div
              className="container mx-auto px-4 py-12"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <UploadZone onFileSelect={handleFileSelect} />
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
