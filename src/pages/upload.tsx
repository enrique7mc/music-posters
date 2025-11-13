import { useEffect, useState, useCallback } from 'react';
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
import { fadeIn } from '@/lib/animations';

export default function Upload() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
      setLoading(false);
    } catch (err) {
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setArtists([]);

    // Auto-analyze on file select
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post<AnalyzeResponse>('/api/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setArtists(response.data.artists);
      setAnalysisProvider(response.data.provider);
      setPosterThumbnail(response.data.posterThumbnail || null);

      if (response.data.artists.length === 0) {
        setError('No artists found in the image. Try a different poster.');
      }
    } catch (err: any) {
      console.error('Error analyzing image:', err);
      const errorMessage = err.response?.data?.error || 'Failed to analyze image';
      setError(errorMessage);
    } finally {
      setAnalyzing(false);
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

  if (loading) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  if (analyzing) {
    return <LoadingScreen message="Analyzing poster with AI..." />;
  }

  if (creating) {
    return <LoadingScreen message="Finding tracks on Spotify... This may take a minute." />;
  }

  return (
    <>
      <Head>
        <title>Upload Poster - Music Posters</title>
      </Head>

      <PageLayout>
        <div className="min-h-[calc(100vh-4rem)] pt-20">
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

                  {/* Track count selector */}
                  <TrackCountSelector
                    mode={trackCountMode}
                    customCount={customTrackCount}
                    onModeChange={setTrackCountMode}
                    onCustomCountChange={setCustomTrackCount}
                    disabled={creating}
                  />

                  {/* Create playlist button */}
                  <Card variant="glass" className="p-6">
                    <h4 className="text-lg font-semibold text-dark-100 mb-4">
                      Ready to create your playlist?
                    </h4>
                    <p className="text-sm text-dark-400 mb-6">
                      We&apos;ll search Spotify for top tracks from each artist and create a curated
                      playlist for you. This usually takes 30-60 seconds.
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleCreatePlaylist}
                      className="w-full"
                      isLoading={creating}
                    >
                      Create Spotify Playlist
                    </Button>
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
