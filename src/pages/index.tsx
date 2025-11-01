import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated
    checkAuth();

    // Handle OAuth errors
    if (router.query.error) {
      setError('Authentication failed. Please try again.');
    }
  }, [router.query.error]);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      if (response.status === 200) {
        // User is authenticated, redirect to upload
        router.push('/upload');
      }
    } catch (err) {
      // Not authenticated, stay on this page
      setLoading(false);
    }
  };

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
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
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center text-white">
          <h1 className="text-6xl font-bold mb-6">Music Posters</h1>
          <p className="text-2xl mb-8">
            Turn festival posters into Spotify playlists instantly
          </p>

          <div className="bg-white rounded-lg shadow-2xl p-8 text-gray-800">
            <div className="mb-8">
              <h2 className="text-3xl font-semibold mb-4">How it works</h2>
              <div className="space-y-4 text-left">
                <div className="flex items-start">
                  <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                    1
                  </div>
                  <p className="pt-1">Upload a photo of any festival or concert poster</p>
                </div>
                <div className="flex items-start">
                  <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                    2
                  </div>
                  <p className="pt-1">Our AI extracts all the artist names</p>
                </div>
                <div className="flex items-start">
                  <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">
                    3
                  </div>
                  <p className="pt-1">Get a Spotify playlist with their top tracks</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl transition duration-200 shadow-lg hover:shadow-xl"
            >
              Connect with Spotify
            </button>

            <p className="mt-4 text-sm text-gray-500">
              We&apos;ll create playlists in your account
            </p>
          </div>

          <div className="mt-8 text-white text-sm">
            <p>Made with AI-powered OCR and the Spotify Web API</p>
          </div>
        </div>
      </div>
    </div>
  );
}
