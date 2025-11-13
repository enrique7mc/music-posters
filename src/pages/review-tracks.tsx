import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Track } from '@/types';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { fadeIn, slideUp, staggerContainer, staggerItem } from '@/lib/animations';
import { cn } from '@/lib/utils';

// Helper function to format duration (ms to mm:ss)
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

type ViewMode = 'card' | 'list';

/**
 * Page component that lets a user review, select, and create a playlist from a list of tracks.
 */
export default function ReviewTracks() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState(
    `Festival Mix - ${new Date().toLocaleDateString()}`
  );
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);

  // Load view mode from localStorage
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

  // Generate cover preview whenever playlist name or poster thumbnail changes
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

  useEffect(() => {
    // Try to get tracks from router state first, fallback to sessionStorage
    let routerTracks: Track[] | null = null;
    if (router.query.tracks) {
      const raw = Array.isArray(router.query.tracks) ? router.query.tracks[0] : router.query.tracks;
      try {
        routerTracks = JSON.parse(raw);
      } catch (parseError) {
        console.warn('Invalid tracks payload in query parameter', parseError);
      }
    }

    let storedTracks: Track[] = [];
    if (routerTracks) {
      storedTracks = routerTracks;
    } else if (typeof window !== 'undefined') {
      try {
        storedTracks = JSON.parse(sessionStorage.getItem('tracks') || '[]');
      } catch (parseError) {
        console.warn('Invalid tracks in sessionStorage', parseError);
      }
    }

    if (storedTracks.length === 0) {
      // No tracks found, redirect back to upload
      router.push('/upload');
      return;
    }

    setTracks(storedTracks);
    // Select all tracks by default
    setSelectedTracks(new Set(storedTracks.map((t: Track) => t.uri)));

    // Load poster thumbnail from sessionStorage (if available)
    if (typeof window !== 'undefined') {
      const storedThumbnail = sessionStorage.getItem('posterThumbnail');
      if (storedThumbnail) {
        setPosterThumbnail(storedThumbnail);
      }
    }

    setLoading(false);
  }, [router]);

  const handleToggleTrack = useCallback((uri: string) => {
    setSelectedTracks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uri)) {
        newSet.delete(uri);
      } else {
        newSet.add(uri);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedTracks(new Set(tracks.map((t) => t.uri)));
  }, [tracks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTracks(new Set());
  }, []);

  const handleCreatePlaylist = async () => {
    if (selectedTracks.size === 0) {
      setError('Please select at least one track');
      return;
    }

    if (!playlistName.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const trackUris = Array.from(selectedTracks);
      const response = await axios.post('/api/create-playlist', {
        trackUris,
        playlistName: playlistName.trim(),
        posterThumbnail: posterThumbnail || undefined,
      });

      // DON'T clear sessionStorage here - it causes the component to re-render
      // and redirect to /upload before navigation completes.
      // The success page will clear it when it mounts.

      // Redirect to success page
      router.push(`/success?playlistUrl=${encodeURIComponent(response.data.playlistUrl)}`);
    } catch (err: any) {
      console.error('Error creating playlist:', err);
      const errorMessage = err.response?.data?.error || 'Failed to create playlist';
      const errorDetails = err.response?.data?.details;
      setError(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
      setCreating(false);
    }
  };

  const handleBackToEdit = () => {
    router.push('/upload');
  };

  if (loading) {
    return <LoadingScreen message="Loading your tracks..." />;
  }

  const selectedCount = selectedTracks.size;
  const totalCount = tracks.length;

  return (
    <PageLayout showNav>
      <Head>
        <title>Review Tracks - Music Posters</title>
      </Head>

      <div className="container mx-auto px-4 py-8 lg:py-12">
        <motion.div
          className="max-w-7xl mx-auto"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.div className="mb-8" variants={slideUp}>
            <h1 className="text-4xl lg:text-5xl font-display font-bold tracking-tight text-dark-50 mb-3">
              Review Your Tracks
            </h1>
            <p className="text-lg text-dark-300">Select the tracks you want in your playlist</p>
          </motion.div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6"
              >
                <ErrorMessage message={error} onDismiss={() => setError(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary Card */}
          <motion.div variants={slideUp}>
            <Card variant="glass" className="mb-8 overflow-hidden">
              <div className="relative">
                {/* Ambient gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-accent-500/20 via-accent-600/10 to-transparent opacity-50" />

                <CardContent className="relative p-6 lg:p-8">
                  <div className="flex items-center justify-between flex-wrap gap-6">
                    <div>
                      <div className="text-4xl lg:text-5xl font-display font-bold text-dark-50 mb-2">
                        {selectedCount} <span className="text-dark-300">of</span> {totalCount}
                      </div>
                      <div className="text-dark-300">
                        {selectedCount === totalCount
                          ? 'All tracks selected'
                          : selectedCount === 0
                            ? 'No tracks selected'
                            : `${totalCount - selectedCount} track${totalCount - selectedCount !== 1 ? 's' : ''} excluded`}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 items-center">
                      {/* View Toggle */}
                      <div className="flex gap-1 glass rounded-lg p-1">
                        <button
                          onClick={() => handleViewModeChange('card')}
                          className={cn(
                            'p-2 rounded-md transition-all duration-200',
                            viewMode === 'card'
                              ? 'bg-accent-500 text-white shadow-glow'
                              : 'text-dark-300 hover:text-dark-50 hover:bg-dark-700'
                          )}
                          title="Card View"
                          aria-label="Switch to card view"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleViewModeChange('list')}
                          className={cn(
                            'p-2 rounded-md transition-all duration-200',
                            viewMode === 'list'
                              ? 'bg-accent-500 text-white shadow-glow'
                              : 'text-dark-300 hover:text-dark-50 hover:bg-dark-700'
                          )}
                          title="List View"
                          aria-label="Switch to list view"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 6h16M4 12h16M4 18h16"
                            />
                          </svg>
                        </button>
                      </div>

                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleSelectAll}
                        disabled={creating}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={handleDeselectAll}
                        disabled={creating}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>
          </motion.div>

          {/* Track Grid - Card View */}
          <AnimatePresence mode="wait">
            {viewMode === 'card' && (
              <motion.div
                key="card-view"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8"
              >
                {tracks.map((track) => {
                  const isSelected = selectedTracks.has(track.uri);
                  return (
                    <motion.div key={track.uri} variants={staggerItem}>
                      <Card
                        variant="default"
                        hover
                        onClick={() => handleToggleTrack(track.uri)}
                        className={cn(
                          'cursor-pointer overflow-hidden transition-all duration-200',
                          isSelected
                            ? 'ring-2 ring-accent-500 shadow-glow'
                            : 'opacity-60 hover:opacity-100'
                        )}
                      >
                        <div className="relative">
                          {/* Album Artwork */}
                          {track.albumArtwork ? (
                            <img
                              src={track.albumArtwork}
                              alt={track.album}
                              className="w-full h-48 object-cover"
                            />
                          ) : (
                            <div className="w-full h-48 bg-gradient-to-br from-dark-700 to-dark-800 flex items-center justify-center">
                              <span className="text-6xl">🎵</span>
                            </div>
                          )}

                          {/* Checkbox Overlay */}
                          <motion.div
                            className="absolute top-3 right-3"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <div
                              className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center shadow-md transition-all duration-200',
                                isSelected
                                  ? 'bg-accent-500 shadow-glow'
                                  : 'bg-dark-800/80 backdrop-blur-sm'
                              )}
                            >
                              {isSelected && (
                                <motion.svg
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-4 h-4 text-white"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </motion.svg>
                              )}
                            </div>
                          </motion.div>
                        </div>

                        {/* Track Info */}
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-dark-50 mb-1 line-clamp-1">
                            {track.name}
                          </h3>
                          <p className="text-sm text-dark-300 mb-2 line-clamp-1">{track.artist}</p>
                          <div className="flex items-center justify-between text-xs text-dark-400">
                            <span className="line-clamp-1">{track.album}</span>
                            <span className="ml-2 flex-shrink-0 tabular-nums">
                              {formatDuration(track.duration)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <motion.div
                key="list-view"
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0 }}
                className="mb-8"
              >
                <Card variant="default" className="overflow-hidden">
                  <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                    {tracks.map((track, index) => {
                      const isSelected = selectedTracks.has(track.uri);
                      return (
                        <motion.div
                          key={track.uri}
                          variants={staggerItem}
                          onClick={() => handleToggleTrack(track.uri)}
                          className={cn(
                            'flex items-center gap-3 p-4 cursor-pointer transition-all duration-200',
                            index % 2 === 0 ? 'bg-dark-900/30' : 'bg-dark-900/10',
                            isSelected
                              ? 'border-l-4 border-accent-500 bg-accent-500/10'
                              : 'border-l-4 border-transparent hover:bg-dark-800/50'
                          )}
                        >
                          {/* Album Artwork Thumbnail */}
                          <div className="flex-shrink-0">
                            {track.albumArtwork ? (
                              <img
                                src={track.albumArtwork}
                                alt={track.album}
                                className="w-14 h-14 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-14 h-14 bg-gradient-to-br from-dark-700 to-dark-800 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">🎵</span>
                              </div>
                            )}
                          </div>

                          {/* Track Info */}
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4">
                            {/* Track Name */}
                            <div className="sm:col-span-4">
                              <p className="font-semibold text-dark-50 truncate">{track.name}</p>
                            </div>
                            {/* Artist */}
                            <div className="sm:col-span-3">
                              <p className="text-sm text-dark-300 truncate">{track.artist}</p>
                            </div>
                            {/* Album */}
                            <div className="sm:col-span-3 hidden sm:block">
                              <p className="text-sm text-dark-400 truncate">{track.album}</p>
                            </div>
                            {/* Duration */}
                            <div className="sm:col-span-2 flex items-center justify-end">
                              <p className="text-sm text-dark-400 tabular-nums">
                                {formatDuration(track.duration)}
                              </p>
                            </div>
                          </div>

                          {/* Checkbox */}
                          <motion.div
                            className="flex-shrink-0"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <div
                              className={cn(
                                'w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all duration-200',
                                isSelected
                                  ? 'bg-accent-500 border-accent-500 shadow-glow'
                                  : 'bg-dark-800 border-dark-600'
                              )}
                            >
                              {isSelected && (
                                <motion.svg
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-4 h-4 text-white"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </motion.svg>
                              )}
                            </div>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Playlist Details */}
          <motion.div variants={slideUp}>
            <Card variant="glass" className="mb-8">
              <CardHeader>
                <CardTitle>Playlist Details</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex gap-6 items-start flex-col lg:flex-row">
                  {/* Cover Preview */}
                  <div className="flex-shrink-0">
                    <div className="text-sm font-semibold text-dark-200 mb-3">Cover Preview</div>
                    <div className="relative w-48 h-48 rounded-xl overflow-hidden border-2 border-dark-700 bg-dark-800">
                      {generatingCover ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500 mx-auto mb-2"></div>
                            <p className="text-xs text-dark-400">Generating...</p>
                          </div>
                        </div>
                      ) : coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="Playlist cover preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-dark-800 to-dark-900">
                          <div className="text-center px-4">
                            <div className="text-4xl mb-2">🎵</div>
                            <p className="text-xs text-dark-400">Cover preview</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Playlist Name Input */}
                  <div className="flex-1 w-full">
                    <label
                      htmlFor="playlistName"
                      className="block text-sm font-semibold text-dark-200 mb-3"
                    >
                      Playlist Name
                    </label>
                    <input
                      id="playlistName"
                      type="text"
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      disabled={creating}
                      className={cn(
                        'w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg',
                        'text-dark-50 placeholder-dark-400',
                        'focus:ring-2 focus:ring-accent-500 focus:border-transparent focus-ring',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-all duration-200'
                      )}
                      placeholder="Enter playlist name..."
                      maxLength={100}
                    />
                    <p className="text-xs text-dark-400 mt-2">
                      This will be the name of your Spotify playlist ({playlistName.length}/100
                      characters)
                    </p>
                    {posterThumbnail && (
                      <p className="text-xs text-accent-400 mt-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Custom cover with poster background
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Action Bar - Sticky at bottom */}
          <motion.div variants={slideUp} className="sticky bottom-4 z-20">
            <Card variant="glass" className="shadow-hard">
              <CardContent className="p-4">
                <div className="flex gap-4 justify-between flex-wrap items-center">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleBackToEdit}
                    disabled={creating}
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back to Edit
                  </Button>

                  {creating ? (
                    <div className="flex-1 max-w-md bg-gradient-to-r from-accent-500 to-accent-600 rounded-lg p-4 text-white flex items-center justify-center shadow-glow">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span className="font-semibold">Creating your playlist...</span>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleCreatePlaylist}
                      disabled={selectedCount === 0}
                      className="flex-1 max-w-md"
                    >
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                      </svg>
                      Create Playlist with {selectedCount} Track{selectedCount !== 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </PageLayout>
  );
}
