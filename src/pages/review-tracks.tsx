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

/**
 * Page component that lets a user review, select, and create a playlist from a list of tracks.
 *
 * Loads tracks from the router state or sessionStorage (redirecting to `/upload` if none are found),
 * allows toggling individual tracks or selecting/deselecting all, and submits the selected track URIs
 * to the server to create a playlist. On successful creation the stored tracks are cleared and the
 * user is redirected to a success page; errors are surfaced inline.
 *
 * @returns A JSX element rendering the review tracks page UI
 */
type ViewMode = 'card' | 'list';

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
      });

      // Clear stored tracks
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('tracks');
      }

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
                  {selectedCount === totalCount
                    ? 'All tracks selected'
                    : selectedCount === 0
                      ? 'No tracks selected'
                      : `${totalCount - selectedCount} track${totalCount - selectedCount !== 1 ? 's' : ''} will be excluded`}
                </div>
              </div>
              <div className="flex gap-3 items-center">
                {/* View Toggle */}
                <div className="flex gap-1 bg-white bg-opacity-20 rounded-lg p-1">
                  <button
                    onClick={() => handleViewModeChange('card')}
                    className={`p-2 rounded-md transition duration-200 ${
                      viewMode === 'card'
                        ? 'bg-white text-purple-600'
                        : 'text-white hover:bg-white hover:bg-opacity-10'
                    }`}
                    title="Card View"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className={`p-2 rounded-md transition duration-200 ${
                      viewMode === 'list'
                        ? 'bg-white text-purple-600'
                        : 'text-white hover:bg-white hover:bg-opacity-10'
                    }`}
                    title="List View"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>
                </div>

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

          {/* Track Grid - Card View */}
          {viewMode === 'card' && (
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
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${
                            isSelected ? 'bg-purple-500' : 'bg-white bg-opacity-80'
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="w-4 h-4 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
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
                      <p className="text-sm text-gray-600 mb-2 line-clamp-1">{track.artist}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="line-clamp-1">{track.album}</span>
                        <span className="ml-2 flex-shrink-0">{formatDuration(track.duration)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compact List View */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
              {tracks.map((track, index) => {
                const isSelected = selectedTracks.has(track.uri);
                return (
                  <div
                    key={track.uri}
                    onClick={() => handleToggleTrack(track.uri)}
                    className={`flex items-center gap-3 p-3 cursor-pointer transition-all duration-150 ${
                      index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    } ${
                      isSelected
                        ? 'border-l-4 border-purple-500 bg-purple-50'
                        : 'border-l-4 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    {/* Album Artwork Thumbnail */}
                    <div className="flex-shrink-0">
                      {track.albumArtwork ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={track.albumArtwork}
                          alt={track.album}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded flex items-center justify-center">
                          <span className="text-2xl">🎵</span>
                        </div>
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4">
                      {/* Track Name */}
                      <div className="sm:col-span-4">
                        <p className="font-semibold text-gray-800 truncate">{track.name}</p>
                      </div>
                      {/* Artist */}
                      <div className="sm:col-span-3">
                        <p className="text-sm text-gray-600 truncate">{track.artist}</p>
                      </div>
                      {/* Album */}
                      <div className="sm:col-span-3 hidden sm:block">
                        <p className="text-sm text-gray-500 truncate">{track.album}</p>
                      </div>
                      {/* Duration */}
                      <div className="sm:col-span-2 flex items-center justify-end">
                        <p className="text-sm text-gray-500 tabular-nums">
                          {formatDuration(track.duration)}
                        </p>
                      </div>
                    </div>

                    {/* Checkbox */}
                    <div className="flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border-2 ${
                          isSelected
                            ? 'bg-purple-500 border-purple-500'
                            : 'bg-white border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Playlist Name Input */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <label
              htmlFor="playlistName"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Playlist Name
            </label>
            <input
              id="playlistName"
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              disabled={creating}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 text-gray-800"
              placeholder="Enter playlist name..."
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-2">
              This will be the name of your Spotify playlist ({playlistName.length}/100 characters)
            </p>
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
