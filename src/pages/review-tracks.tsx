import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { Track } from '@/types';

// Helper function to format duration (ms to mm:ss)
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function ReviewTracks() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to get tracks from router state first, fallback to sessionStorage
    const routerTracks = router.query.tracks
      ? JSON.parse(router.query.tracks as string)
      : null;

    const storedTracks = routerTracks ||
      (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('tracks') || '[]') : []);

    if (storedTracks.length === 0) {
      // No tracks found, redirect back to upload
      router.push('/upload');
      return;
    }

    setTracks(storedTracks);
    // Select all tracks by default
    setSelectedTracks(new Set(storedTracks.map((t: Track) => t.uri)));
    setLoading(false);
  }, [router]);

  const handleToggleTrack = useCallback((uri: string) => {
    setSelectedTracks(prev => {
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
    setSelectedTracks(new Set(tracks.map(t => t.uri)));
  }, [tracks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTracks(new Set());
  }, []);

  const handleCreatePlaylist = async () => {
    if (selectedTracks.size === 0) {
      setError('Please select at least one track');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const trackUris = Array.from(selectedTracks);
      const response = await axios.post('/api/create-playlist', {
        trackUris,
        playlistName: `Festival Mix - ${new Date().toLocaleDateString()}`,
      });

      // Clear stored tracks
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('tracks');
      }

      // Redirect to success page
      router.push(`/success?playlistUrl=${encodeURIComponent(response.data.playlistUrl)}`);
    } catch (err: any) {
      console.error('Error creating playlist:', err);
      setError(err.response?.data?.error || 'Failed to create playlist');
      setCreating(false);
    }
  };

  const handleBackToEdit = () => {
    router.push('/upload');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tracks...</p>
        </div>
      </div>
    );
  }

  const selectedCount = selectedTracks.size;
  const totalCount = tracks.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Review Tracks - Music Posters</title>
      </Head>

      {/* Header */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-purple-600">Music Posters</h1>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Title and Actions */}
          <div className="mb-6">
            <h2 className="text-3xl font-semibold mb-2 text-gray-900">Review Your Tracks</h2>
            <p className="text-gray-600">Select the tracks you want in your playlist</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Summary Banner */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 text-white mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-3xl font-bold mb-1">
                  {selectedCount} of {totalCount} tracks selected
                </div>
                <div className="text-sm opacity-90">
                  {selectedCount === totalCount ? 'All tracks selected' :
                   selectedCount === 0 ? 'No tracks selected' :
                   `${totalCount - selectedCount} track${totalCount - selectedCount !== 1 ? 's' : ''} will be excluded`}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSelectAll}
                  className="bg-white text-purple-600 font-semibold py-2 px-4 rounded-lg hover:bg-purple-50 transition duration-200"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                >
                  Deselect All
                </button>
              </div>
            </div>
          </div>

          {/* Track Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {tracks.map((track) => {
              const isSelected = selectedTracks.has(track.uri);
              return (
                <div
                  key={track.uri}
                  onClick={() => handleToggleTrack(track.uri)}
                  className={`bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'ring-2 ring-purple-500 shadow-lg'
                      : 'opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="relative">
                    {/* Album Artwork */}
                    {track.albumArtwork ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.albumArtwork}
                        alt={track.album}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                        <span className="text-6xl">🎵</span>
                      </div>
                    )}
                    {/* Checkbox Overlay */}
                    <div className="absolute top-2 right-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                        isSelected
                          ? 'bg-purple-500'
                          : 'bg-white bg-opacity-80'
                      }`}>
                        {isSelected && (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Track Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-800 mb-1 line-clamp-1">
                      {track.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-1">
                      {track.artist}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="line-clamp-1">{track.album}</span>
                      <span className="ml-2 flex-shrink-0">{formatDuration(track.duration)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-between flex-wrap sticky bottom-4 bg-white rounded-lg shadow-lg p-4">
            <button
              onClick={handleBackToEdit}
              disabled={creating}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
            >
              ← Back to Edit
            </button>

            {creating ? (
              <div className="flex-1 max-w-md bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-4 text-white flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <span className="font-semibold">Creating playlist...</span>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCreatePlaylist}
                disabled={selectedCount === 0}
                className="flex-1 max-w-md bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎵 Create Playlist with {selectedCount} Track{selectedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
