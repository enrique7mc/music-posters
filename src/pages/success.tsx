import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { clearPlaylistDraft } from '@/lib/playlist-draft';
import { useAuth } from '@/contexts/AuthContext';

export default function Success() {
  const router = useRouter();
  const { platform, loading: authLoading, user } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';

  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [buttonsEnabled, setButtonsEnabled] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  // Clear the complete playlist draft now that we've successfully navigated
  // here (aggregate key plus legacy flow keys). "Create another" then opens a
  // clean Upload chooser; auth and preference keys are untouched.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      clearPlaylistDraft();
    }
  }, []);

  // Track playlistUrl changes
  useEffect(() => {
    if (router.query.playlistUrl) {
      setPlaylistUrl(router.query.playlistUrl as string);
    }
  }, [router.query]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Delay enabling buttons to prevent accidental double-clicks
  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonsEnabled(true);
    }, 1000); // 1 second delay

    return () => clearTimeout(timer);
  }, []);

  const handleCopyLink = async () => {
    if (!playlistUrl) return;

    if (!navigator.clipboard) {
      console.error('Clipboard API not available');
      return;
    }

    try {
      await navigator.clipboard.writeText(playlistUrl);
      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenSpotify = () => {
    if (playlistUrl) {
      window.open(playlistUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateAnother = () => {
    router.push('/upload');
  };

  // Wait for auth check before rendering
  if (authLoading || !user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Playlist Created! - Playlistd</title>
      </Head>

      <PageLayout showNav={false}>
        <div className="studio-shell flex min-h-screen flex-col justify-center py-12 sm:py-20">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-8 flex items-center justify-between border-b border-dark-700 pb-5">
              <span className="text-sm font-black uppercase tracking-[0.24em] text-white">
                Playlistd
              </span>
              <span className="eyebrow">04 / Complete</span>
            </div>

            <div className="mb-8">
              <div
                className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-500/60 bg-accent-500/10 text-accent-500"
                aria-hidden="true"
              >
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12.5l4.5 4.5L19 7.5"
                  />
                </svg>
              </div>
              <p className="eyebrow mb-3">Saved to {platformName}</p>
              <h1 className="page-heading">Your playlist is ready.</h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-dark-300">
                The tracks you chose are together in your {platformName} library. Your next listen
                starts here.
              </p>
            </div>

            <section className="surface p-5 sm:p-8" aria-labelledby="playlist-receipt-heading">
              <div className="mb-6 flex items-center justify-between border-b border-dark-700 pb-5">
                <div>
                  <p className="eyebrow mb-2">Playlist receipt</p>
                  <h2
                    id="playlist-receipt-heading"
                    className="text-xl font-bold tracking-tight text-white"
                  >
                    Ready to listen
                  </h2>
                </div>
                <span className="rounded-full border border-accent-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-400">
                  Created
                </span>
              </div>

              {playlistUrl ? (
                <>
                  <p className="mb-6 text-sm leading-relaxed text-dark-300">
                    Open your new playlist in {platformName}, or copy its link to share it.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleOpenSpotify}
                      disabled={!buttonsEnabled}
                      className="flex-1 rounded-xl bg-accent-500 text-dark-950 hover:bg-accent-400"
                    >
                      Open in {platformName}
                      <svg
                        className="ml-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 12h14m-6-6l6 6-6 6"
                        />
                      </svg>
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={handleCopyLink}
                      disabled={!buttonsEnabled}
                      className="flex-1 rounded-xl"
                    >
                      {copied ? 'Link copied' : 'Copy playlist link'}
                    </Button>
                  </div>
                  <p className="mt-5 text-xs text-dark-300" role="status">
                    {copied
                      ? 'Link copied to clipboard.'
                      : `Added to your ${platformName} library.`}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-3 py-4 text-sm text-dark-300" role="status">
                  <LoadingSpinner size="sm" />
                  Loading playlist…
                </div>
              )}
            </section>

            {playlistUrl && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="ghost"
                  onClick={handleCreateAnother}
                  disabled={!buttonsEnabled}
                  className="text-dark-300 hover:text-white"
                >
                  <span aria-hidden="true" className="mr-2 text-lg leading-none">
                    +
                  </span>
                  Create Another Playlist
                </Button>
              </div>
            )}
          </div>
        </div>
      </PageLayout>
    </>
  );
}
