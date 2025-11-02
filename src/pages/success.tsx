import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function Success() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);

  useEffect(() => {
    if (router.query.playlistUrl) {
      setPlaylistUrl(router.query.playlistUrl as string);
    }
  }, [router.query]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600 flex items-center justify-center">
      <Head>
        <title>Playlist Created! - Music Posters</title>
      </Head>
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-2xl p-12 text-center">
          <div className="mb-6">
            <svg
              className="w-24 h-24 text-green-500 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Playlist Created!
          </h1>

          <p className="text-xl text-gray-600 mb-8">
            Your festival playlist is ready to enjoy
          </p>

          {playlistUrl && (
            <div className="space-y-4">
              <a
                href={playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl transition duration-200 shadow-lg hover:shadow-xl"
              >
                Open in Spotify
              </a>

              <div className="mt-6">
                <button
                  onClick={() => router.push('/upload')}
                  className="text-purple-600 hover:text-purple-800 font-semibold"
                >
                  Create Another Playlist
                </button>
              </div>
            </div>
          )}

          {!playlistUrl && (
            <div className="text-gray-500">
              <p>Loading playlist...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
