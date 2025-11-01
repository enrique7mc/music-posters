import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

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
  const [artists, setArtists] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  // Rotate loading messages while creating playlist
  useEffect(() => {
    if (creating) {
      const interval = setInterval(() => {
        setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
      }, 2000); // Change message every 2 seconds

      return () => clearInterval(interval);
    }
  }, [creating]);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
      setLoading(false);
    } catch (err) {
      router.push('/');
    }
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

      const response = await axios.post('/api/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setArtists(response.data.artists);

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
      const response = await axios.post('/api/create-playlist', {
        artists: artists,
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
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-8">
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
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                Choose Image
              </button>
            </div>

            {previewUrl && (
              <div className="mb-6">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-96 mx-auto rounded-lg shadow-md"
                />
              </div>
            )}

            {selectedFile && !analyzing && artists.length === 0 && (
              <button
                onClick={handleAnalyze}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
              >
                Analyze Poster
              </button>
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

            {artists.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-semibold mb-4">
                  Found {artists.length} artists:
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto mb-6">
                  <ul className="space-y-2">
                    {artists.map((artist, index) => (
                      <li key={index} className="flex items-center">
                        <span className="text-purple-600 mr-2">•</span>
                        <span className="text-gray-800">{artist}</span>
                      </li>
                    ))}
                  </ul>
                </div>

{creating ? (
                  <div className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-8 text-white">
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
