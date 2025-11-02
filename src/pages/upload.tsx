import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import { Artist, AnalyzeResponse } from '@/types';

// Fun loading messages
const loadingMessages = [
  "🎸 Tuning the guitars...",
  "🎤 Setting up the microphones...",
  "🎵 Finding the perfect tracks...",
  "🎧 Mixing the beats...",
  "🎹 Playing the piano intro...",
  "🥁 Getting the drums ready...",
  "🎺 Warming up the horns...",
  "🎻 Tuning the strings...",
  "🎶 Arranging the setlist...",
  "🔊 Testing the speakers...",
  "💿 Spinning the records...",
  "🎼 Reading the music sheets...",
  "🎪 Setting up the stage...",
  "✨ Adding some magic...",
  "🌟 Making it perfect...",
];

export default function Upload() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [analysisProvider, setAnalysisProvider] = useState<'vision' | 'gemini'>('vision');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Calculate tier counts for summary
  const getTierCounts = () => {
    const counts = {
      headliner: 0,
      'sub-headliner': 0,
      'mid-tier': 0,
      undercard: 0,
    };

    artists.forEach(artist => {
      if (artist.tier && artist.tier in counts) {
        counts[artist.tier as keyof typeof counts]++;
      }
    });

    return counts;
  };

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

      if (response.data.artists.length === 0) {
        setError('No artists found in the image. Try a different poster.');
      }
    } catch (err: any) {
      console.error('Error analyzing image:', err);
      setError(err.response?.data?.error || 'Failed to analyze image');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (artists.length === 0) return;

    setCreating(true);
    setError(null);

    try {
      // Extract artist names from Artist objects
      const artistNames = artists.map(a => a.name);

      const response = await axios.post('/api/create-playlist', {
        artists: artistNames,
        playlistName: `Festival Mix - ${new Date().toLocaleDateString()}`,
      });

      // Redirect to success page with playlist URL
      router.push(`/success?playlistUrl=${encodeURIComponent(response.data.playlistUrl)}`);
    } catch (err: any) {
      console.error('Error creating playlist:', err);
      setError(err.response?.data?.error || 'Failed to create playlist');
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
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-800"
            >
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
            {/* Empty state - show when no image selected */}
            {!selectedFile && !analyzing && artists.length === 0 && (
              <div className="text-center py-12">
                <div className="mb-6">
                  <div className="text-8xl mb-4">🎸</div>
                  <h2 className="text-3xl font-semibold mb-3">Upload Festival Poster</h2>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload a photo of any festival lineup poster and we&apos;ll extract the artists to create a Spotify playlist
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
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
                <div className="mb-6">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
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
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
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
                    <h3 className="text-lg font-semibold">
                      Extracted Artists
                    </h3>
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {analysisProvider === 'gemini' ? '🤖 Gemini AI' : '👁️ Vision API'}
                    </span>
                  </div>

                  {/* Summary Cards */}
                  {analysisProvider === 'gemini' && artists.some(a => a.tier) ? (
                    (() => {
                      const counts = getTierCounts();
                      return (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {/* Total Artists */}
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="text-2xl font-bold text-purple-800">{artists.length}</div>
                            <div className="text-xs text-purple-600">🎵 Total Artists</div>
                          </div>
                          {counts.headliner > 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-yellow-800">{counts.headliner}</div>
                              <div className="text-xs text-yellow-600">🎸 Headliners</div>
                            </div>
                          )}
                          {counts['sub-headliner'] > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-blue-800">{counts['sub-headliner']}</div>
                              <div className="text-xs text-blue-600">⭐ Sub-headliners</div>
                            </div>
                          )}
                          {counts['mid-tier'] > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-green-800">{counts['mid-tier']}</div>
                              <div className="text-xs text-green-600">Mid-tier</div>
                            </div>
                          )}
                          {counts.undercard > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                              <div className="text-2xl font-bold text-gray-800">{counts.undercard}</div>
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
                  <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                    <ul className="space-y-2">
                      {[...artists]
                        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                        .map((artist, index) => (
                          <li key={index} className="flex items-center justify-between py-1">
                            <div className="flex items-center flex-1">
                              <span className="text-purple-600 font-semibold mr-3 min-w-[2rem] text-right">{index + 1}.</span>
                              <span className={`text-gray-800 ${artist.weight && artist.weight >= 8 ? 'font-bold text-lg' : artist.weight && artist.weight >= 6 ? 'font-semibold' : ''}`}>
                                {artist.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {artist.tier && (
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  artist.tier === 'headliner' ? 'bg-yellow-200 text-yellow-800' :
                                  artist.tier === 'sub-headliner' ? 'bg-blue-200 text-blue-800' :
                                  artist.tier === 'mid-tier' ? 'bg-green-200 text-green-800' :
                                  'bg-gray-200 text-gray-800'
                                }`}>
                                  {artist.tier === 'headliner' ? '🎸 Headliner' :
                                   artist.tier === 'sub-headliner' ? '⭐ Sub-headliner' :
                                   artist.tier === 'mid-tier' ? 'Mid-tier' :
                                   'Undercard'}
                                </span>
                              )}
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

                  {/* Create Playlist Button */}
                  <div className="mt-4">
                    {creating ? (
                      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-8 text-white">
                        <div className="flex flex-col items-center space-y-6">
                          {/* Animated music notes */}
                          <div className="flex space-x-4">
                            <div className="text-5xl animate-bounce" style={{ animationDelay: '0ms' }}>🎵</div>
                            <div className="text-5xl animate-bounce" style={{ animationDelay: '150ms' }}>🎶</div>
                            <div className="text-5xl animate-bounce" style={{ animationDelay: '300ms' }}>🎵</div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-white bg-opacity-30 rounded-full h-2 overflow-hidden">
                            <div className="bg-white h-full rounded-full animate-pulse" style={{ width: '100%' }}></div>
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
                        Create Spotify Playlist
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
