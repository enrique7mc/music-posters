import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { Artist, AnalyzeResponse } from '@/types';

// Fun loading messages
const loadingMessages = [
  '🎸 Tuning the guitars...',
  '🎤 Setting up the microphones...',
  '🎵 Finding the perfect tracks...',
  '🎧 Mixing the beats...',
  '🎹 Playing the piano intro...',
  '🥁 Getting the drums ready...',
  '🎺 Warming up the horns...',
  '🎻 Tuning the strings...',
  '🎶 Arranging the setlist...',
  '🔊 Testing the speakers...',
  '💿 Spinning the records...',
  '🎼 Reading the music sheets...',
  '🎪 Setting up the stage...',
  '✨ Adding some magic...',
  '🌟 Making it perfect...',
];

// Helper function to get CSS classes for artist name based on weight
const getArtistNameClasses = (weight?: number): string => {
  if (!weight) return 'text-gray-800';
  if (weight >= 8) return 'text-gray-800 font-bold text-lg';
  if (weight >= 6) return 'text-gray-800 font-semibold';
  return 'text-gray-800';
};

// Helper function to get tier badge configuration
const getTierBadge = (tier?: string) => {
  if (!tier) return null;

  const tierConfig = {
    headliner: {
      bgColor: 'bg-yellow-200 text-yellow-800',
      label: '🎸 Headliner',
    },
    'sub-headliner': {
      bgColor: 'bg-blue-200 text-blue-800',
      label: '⭐ Sub-headliner',
    },
    'mid-tier': {
      bgColor: 'bg-green-200 text-green-800',
      label: 'Mid-tier',
    },
    undercard: {
      bgColor: 'bg-gray-200 text-gray-800',
      label: 'Undercard',
    },
  };

  return tierConfig[tier as keyof typeof tierConfig];
};

/**
 * Render the Upload page UI that lets an authenticated user upload a festival poster, extract artists from the image, and continue to track selection.
 *
 * The component handles authentication check, image selection and preview, poster analysis (calling /api/analyze), displaying extracted artists with tier/weight badges, and initiating a track search (POST /api/search-tracks) whose results are saved to sessionStorage before navigating to the review page.
 *
 * @returns The Upload page React element composed of the upload/analyze UI, artist results panel, and controls for creating/searching tracks and logging out.
 */
export default function Upload() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini' | 'hybrid'>(
    'vision'
  );
  const [posterThumbnail, setPosterThumbnail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track count customization state
  const [trackCountMode, setTrackCountMode] = useState<'tier-based' | 'custom'>('tier-based');
  const [customTrackCount, setCustomTrackCount] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perArtistCounts, setPerArtistCounts] = useState<Record<string, number>>({});

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

  // Rotate loading messages while creating playlist
  useEffect(() => {
    if (creating) {
      const interval = setInterval(() => {
        setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [creating]);

  // Calculate tier counts for summary (memoized to avoid recomputation)
  const tierCounts = useMemo(() => {
    const counts = {
      headliner: 0,
      'sub-headliner': 0,
      'mid-tier': 0,
      undercard: 0,
    };

    artists.forEach((artist) => {
      if (artist.tier && artist.tier in counts) {
        counts[artist.tier as keyof typeof counts]++;
      }
    });

    return counts;
  }, [artists]);

  // Calculate estimated total track count based on current settings
  const estimatedTrackCount = useMemo(() => {
    if (artists.length === 0) return 0;

    return artists.reduce((total, artist) => {
      // Check if there's a per-artist override
      if (perArtistCounts[artist.name] !== undefined) {
        return total + perArtistCounts[artist.name];
      }

      // Otherwise use the mode setting
      if (trackCountMode === 'custom') {
        return total + customTrackCount;
      }

      // Tier-based (default)
      const tierTrackCounts: Record<string, number> = {
        headliner: 10,
        'sub-headliner': 5,
        'mid-tier': 3,
        undercard: 1,
      };
      return total + (artist.tier ? tierTrackCounts[artist.tier] || 3 : 3);
    }, 0);
  }, [artists, trackCountMode, customTrackCount, perArtistCounts]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
      setArtists([]);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const response = await axios.post<AnalyzeResponse>('/api/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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
      const errorDetails = err.response?.data?.details;
      setError(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (artists.length === 0) return;

    setCreating(true);
    setError(null);

    try {
      // Search for tracks (this will take 20-70 seconds with rate limiting)
      // Pass full Artist objects to preserve tier information for dynamic track counts
      const response = await axios.post('/api/search-tracks', {
        artists: artists,
        trackCountMode: trackCountMode,
        customTrackCount: trackCountMode === 'custom' ? customTrackCount : undefined,
        perArtistCounts: Object.keys(perArtistCounts).length > 0 ? perArtistCounts : undefined,
      });

      // Store tracks and poster thumbnail in sessionStorage for the review page
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tracks', JSON.stringify(response.data.tracks));
        if (posterThumbnail) {
          sessionStorage.setItem('posterThumbnail', posterThumbnail);
        }
      }

      // Navigate to review-tracks page
      router.push('/review-tracks');
    } catch (err: any) {
      console.error('Error searching tracks:', err);
      const errorMessage = err.response?.data?.error || 'Failed to search tracks';
      const errorDetails = err.response?.data?.details;
      setError(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      router.push('/');
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Upload Poster - Music Posters</title>
      </Head>
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-purple-600">Music Posters</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Hi, {user?.display_name}</span>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-800">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-8">
            {/* Shared file input - used by all upload buttons */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Empty state - show when no image selected */}
            {!selectedFile && !analyzing && artists.length === 0 && (
              <div className="text-center py-12">
                <div className="mb-6">
                  <div className="text-8xl mb-4">🎸</div>
                  <h2 className="text-3xl font-semibold mb-3">Upload Festival Poster</h2>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload a photo of any festival lineup poster and we&apos;ll extract the artists
                    to create a Spotify playlist
                  </p>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-8 rounded-lg transition duration-200 inline-flex items-center gap-2"
                >
                  <span>📁</span>
                  Choose Image
                </button>

                <div className="mt-8 text-sm text-gray-500">
                  <p>Supports JPG, PNG, and other image formats</p>
                </div>
              </div>
            )}

            {/* Show title and button when image is selected but not analyzed yet */}
            {selectedFile && !analyzing && artists.length === 0 && (
              <>
                <h2 className="text-3xl font-semibold mb-6">Upload Festival Poster</h2>
                <div className="mb-6 flex justify-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 inline-flex items-center gap-2 mb-4"
                  >
                    <span>📁</span>
                    Choose Different Image
                  </button>
                </div>
              </>
            )}

            {/* Show title when analyzing or results are shown */}
            {(analyzing || artists.length > 0) && (
              <h2 className="text-3xl font-semibold mb-6">Upload Festival Poster</h2>
            )}

            {analyzing && (
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-8 text-white">
                <div className="flex flex-col items-center space-y-4">
                  {/* Animated magnifying glass/search */}
                  <div className="text-6xl animate-bounce">🔍</div>
                  <p className="text-xl font-semibold">Scanning the poster...</p>
                  <div className="flex space-x-2">
                    <div
                      className="w-2 h-2 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: '0ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: '200ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: '400ms' }}
                    ></div>
                  </div>
                  <p className="text-sm opacity-90">Using AI to extract artist names...</p>
                </div>
              </div>
            )}

            {/* Two-pane layout: Image on left, Artist list on right */}
            {previewUrl && artists.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Left Pane: Image Preview */}
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold mb-3">Festival Poster</h3>
                  <div className="bg-gray-100 rounded-lg p-4 flex items-start justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Festival Poster"
                      className="max-w-full h-auto rounded-lg shadow-lg"
                      style={{ maxHeight: '70vh' }}
                    />
                  </div>
                </div>

                {/* Right Pane: Artist List with Summary */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Extracted Artists</h3>
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {analysisProvider === 'hybrid'
                        ? '🔄 Hybrid (Vision + Gemini)'
                        : analysisProvider === 'gemini'
                          ? '🤖 Gemini AI'
                          : '👁️ Vision API'}
                    </span>
                  </div>

                  {/* Summary Cards */}
                  {(analysisProvider === 'gemini' || analysisProvider === 'hybrid') &&
                  artists.some((a) => a.tier) ? (
                    (() => {
                      const counts = tierCounts;
                      return (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {/* Total Artists */}
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="text-2xl font-bold text-purple-800">
                              {artists.length}
                            </div>
                            <div className="text-xs text-purple-600">🎵 Total Artists</div>
                          </div>
                          {counts.headliner > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-yellow-800">
                                {counts.headliner}
                              </div>
                              <div className="text-xs text-yellow-600">🎸 Headliners</div>
                            </div>
                          )}
                          {counts['sub-headliner'] > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-blue-800">
                                {counts['sub-headliner']}
                              </div>
                              <div className="text-xs text-blue-600">⭐ Sub-headliners</div>
                            </div>
                          )}
                          {counts['mid-tier'] > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-green-800">
                                {counts['mid-tier']}
                              </div>
                              <div className="text-xs text-green-600">Mid-tier</div>
                            </div>
                          )}
                          {counts.undercard > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-gray-800">
                                {counts.undercard}
                              </div>
                              <div className="text-xs text-gray-600">Undercard</div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    /* Vision API - just show total count */
                    <div className="mb-4">
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 inline-block">
                        <div className="text-3xl font-bold text-purple-800">{artists.length}</div>
                        <div className="text-sm text-purple-600">🎵 Total Artists</div>
                      </div>
                    </div>
                  )}

                  {/* Artist List */}
                  <div
                    className="bg-gray-50 rounded-lg p-4 flex-1 overflow-y-auto"
                    style={{ maxHeight: '60vh' }}
                  >
                    <ul className="space-y-2">
                      {[...artists]
                        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                        .map((artist, index) => (
                          <li key={index} className="flex items-center justify-between py-1">
                            <div className="flex items-center flex-1">
                              <span className="text-purple-600 font-semibold mr-3 min-w-[2rem] text-right">
                                {index + 1}.
                              </span>
                              <span className={getArtistNameClasses(artist.weight)}>
                                {artist.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const tierBadge = getTierBadge(artist.tier);
                                return (
                                  tierBadge && (
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full ${tierBadge.bgColor}`}
                                    >
                                      {tierBadge.label}
                                    </span>
                                  )
                                );
                              })()}
                              {artist.weight && (
                                <span className="text-xs text-gray-500 font-mono">
                                  {artist.weight}/10
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>

                  {/* Track Count Configuration */}
                  <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-3">Track Count Settings</h4>

                    {/* Radio options for mode selection */}
                    <div className="space-y-2">
                      <label className="flex items-start cursor-pointer">
                        <input
                          type="radio"
                          name="trackCountMode"
                          value="tier-based"
                          checked={trackCountMode === 'tier-based'}
                          onChange={(e) => setTrackCountMode(e.target.value as 'tier-based')}
                          className="mt-1 mr-2"
                        />
                        <div>
                          <div className="font-medium text-gray-800">
                            Use tier-based{' '}
                            <span className="text-green-600 text-sm">(Recommended)</span>
                          </div>
                          {(analysisProvider === 'gemini' || analysisProvider === 'hybrid') &&
                          artists.some((a) => a.tier) ? (
                            <div className="text-xs text-gray-500 ml-0 mt-1">
                              Headliners: 10 tracks, Sub-headliners: 5 tracks, Mid-tier: 3 tracks,
                              Undercard: 1 track
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 ml-0 mt-1">
                              3 tracks per artist (no tier information available)
                            </div>
                          )}
                        </div>
                      </label>

                      <label className="flex items-start cursor-pointer">
                        <input
                          type="radio"
                          name="trackCountMode"
                          value="custom"
                          checked={trackCountMode === 'custom'}
                          onChange={(e) => setTrackCountMode(e.target.value as 'custom')}
                          className="mt-1 mr-2"
                        />
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">Custom:</span>
                          <select
                            value={String(customTrackCount)}
                            onChange={(e) => setCustomTrackCount(parseInt(e.target.value))}
                            disabled={trackCountMode !== 'custom'}
                            className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed w-16 bg-white text-gray-900"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                          <span className="text-sm text-gray-600">tracks for all artists</span>
                        </div>
                      </label>
                    </div>

                    {/* Advanced customization toggle */}
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="mt-3 text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                    >
                      <span>{showAdvanced ? '▼' : '▶'}</span>
                      <span>⚙️ Advanced: Customize Individual Artists</span>
                    </button>

                    {/* Advanced per-artist controls */}
                    {showAdvanced && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="text-sm text-gray-600">Bulk actions:</span>
                          <select
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-32 bg-white text-gray-900"
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (value > 0) {
                                const newCounts: Record<string, number> = {};
                                artists.forEach((artist) => {
                                  newCounts[artist.name] = value;
                                });
                                setPerArtistCounts(newCounts);
                              }
                            }}
                          >
                            <option value="">Set all to...</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <option key={num} value={num}>
                                {num} tracks
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setPerArtistCounts({})}
                            className="text-sm text-gray-600 hover:text-gray-800 underline"
                          >
                            Reset all
                          </button>
                        </div>

                        <div
                          className="space-y-2 max-h-60 overflow-y-auto bg-gray-50 rounded p-2"
                          style={{ maxHeight: '15rem' }}
                        >
                          {artists.map((artist, index) => {
                            const defaultCount =
                              trackCountMode === 'custom'
                                ? customTrackCount
                                : artist.tier
                                  ? {
                                      headliner: 10,
                                      'sub-headliner': 5,
                                      'mid-tier': 3,
                                      undercard: 1,
                                    }[artist.tier] || 3
                                  : 3;

                            const currentCount = perArtistCounts[artist.name] ?? defaultCount;

                            return (
                              <div
                                key={index}
                                className="flex items-center justify-between text-sm py-1"
                              >
                                <div className="flex items-center flex-1">
                                  <span className="text-purple-600 font-semibold mr-2 min-w-[2rem] text-right">
                                    {index + 1}.
                                  </span>
                                  <span className="text-gray-800 truncate">{artist.name}</span>
                                  {artist.tier && (
                                    <span className="ml-2 text-xs text-gray-500">
                                      ({artist.tier})
                                    </span>
                                  )}
                                </div>
                                <select
                                  value={String(currentCount)}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    setPerArtistCounts((prev) => ({
                                      ...prev,
                                      [artist.name]: value,
                                    }));
                                  }}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs ml-2 w-14 bg-white text-gray-900"
                                >
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <option key={num} value={num}>
                                      {num}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Estimated track count preview */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        Estimated total:{' '}
                        <span className="font-semibold text-purple-600">
                          ~{estimatedTrackCount} tracks
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Create Playlist Button */}
                  <div className="mt-4">
                    {creating ? (
                      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-8 text-white">
                        <div className="flex flex-col items-center space-y-6">
                          {/* Animated music notes */}
                          <div className="flex space-x-4">
                            <div
                              className="text-5xl animate-bounce"
                              style={{ animationDelay: '0ms' }}
                            >
                              🎵
                            </div>
                            <div
                              className="text-5xl animate-bounce"
                              style={{ animationDelay: '150ms' }}
                            >
                              🎶
                            </div>
                            <div
                              className="text-5xl animate-bounce"
                              style={{ animationDelay: '300ms' }}
                            >
                              🎵
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-white bg-opacity-30 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-white h-full rounded-full animate-pulse"
                              style={{ width: '100%' }}
                            ></div>
                          </div>

                          {/* Rotating message */}
                          <p className="text-xl font-semibold text-center animate-pulse">
                            {loadingMessage}
                          </p>

                          <p className="text-sm text-center opacity-90">
                            This might take a minute for large lineups...
                          </p>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleCreatePlaylist}
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
                      >
                        Continue to Track Selection
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Single image preview when no results yet */}
            {previewUrl && artists.length === 0 && !analyzing && (
              <div className="flex flex-col items-center mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-96 rounded-lg shadow-md mb-4"
                />
                <button
                  onClick={handleAnalyze}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-8 rounded-lg transition duration-200 inline-flex items-center gap-2"
                >
                  <span>🔍</span>
                  Analyze Poster
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
