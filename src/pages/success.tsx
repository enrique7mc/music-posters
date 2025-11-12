import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function Success() {
  const router = useRouter();
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (router.query.playlistUrl) {
      setPlaylistUrl(router.query.playlistUrl as string);
    }
  }, [router.query]);

  const handleCopyLink = async () => {
    if (!playlistUrl) return;

    try {
      await navigator.clipboard.writeText(playlistUrl);
      setCopied(true);

      // Reset the copied state after 3 seconds
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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

          <h1 className="text-4xl font-bold text-gray-800 mb-4">Playlist Created!</h1>

          <p className="text-xl text-gray-600 mb-8">Your festival playlist is ready to enjoy</p>

          {playlistUrl && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href={playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl transition duration-200 shadow-lg hover:shadow-xl"
                >
                  Open in Spotify
                </a>

                <button
                  onClick={handleCopyLink}
                  className={`relative inline-flex items-center gap-2 font-bold py-4 px-8 rounded-full text-xl transition-all duration-200 shadow-lg hover:shadow-xl ${
                    copied
                      ? 'bg-purple-500 text-white scale-105'
                      : 'bg-white text-purple-600 hover:bg-purple-50'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg
                        className="w-6 h-6 animate-bounce"
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
                      <span className="animate-pulse">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

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
