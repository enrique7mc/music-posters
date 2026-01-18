import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { scaleIn, slideUp } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';

export default function Success() {
  const router = useRouter();
  const { platform } = useAuth();

  // Helper to get display name for music platform
  const platformName = platform === 'apple-music' ? 'Apple Music' : 'Spotify';

  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [buttonsEnabled, setButtonsEnabled] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear sessionStorage and set up component
  useEffect(() => {
    // Clear sessionStorage now that we've successfully navigated here
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tracks');
      sessionStorage.removeItem('posterThumbnail');
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

  return (
    <>
      <Head>
        <title>Playlist Created! - Music Posters</title>
      </Head>

      <PageLayout showNav={false}>
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 bg-dark-950">
            {/* Celebratory gradient effects */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-600/20 rounded-full blur-3xl animate-pulse" />
            <div
              className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl animate-pulse"
              style={{ animationDelay: '1s' }}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-muted-600/10 rounded-full blur-3xl" />
          </div>

          {/* Content */}
          <div className="relative container mx-auto px-4 py-20">
            <div className="max-w-3xl mx-auto">
              {/* Success icon */}
              <motion.div
                className="flex justify-center mb-8"
                variants={scaleIn}
                initial="hidden"
                animate="visible"
              >
                <motion.div
                  className="relative"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <div className="w-32 h-32 bg-accent-500/20 rounded-full flex items-center justify-center border border-accent-500/30">
                    <svg
                      className="w-16 h-16 text-accent-400"
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
                  {/* Decorative rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-accent-500/30"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>
              </motion.div>

              {/* Heading */}
              <motion.div
                className="text-center mb-12"
                variants={slideUp}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-black tracking-tighter mb-4">
                  <span className="block text-dark-100">PLAYLIST</span>
                  <span className="block text-gradient">CREATED</span>
                </h1>
                <p className="text-xl text-dark-300 mt-4">
                  Your festival soundtrack is ready to play
                </p>
              </motion.div>

              {/* Actions card */}
              {playlistUrl ? (
                <>
                  <motion.div
                    variants={slideUp}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.4 }}
                  >
                    <Card variant="glass" className="p-8 lg:p-10">
                      <div className="space-y-6">
                        {/* Primary actions */}
                        <div className="flex flex-col sm:flex-row gap-4">
                          <Button
                            variant="primary"
                            size="lg"
                            onClick={handleOpenSpotify}
                            disabled={!buttonsEnabled}
                            className="flex-1"
                          >
                            {platform === 'apple-music' ? (
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.802.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81a5.046 5.046 0 0 0 1.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.785-.56-2.07-1.494-.3-.982.152-2.074 1.08-2.48.373-.163.77-.25 1.17-.296.39-.045.78-.088 1.168-.14.33-.04.53-.234.583-.567.014-.09.02-.18.02-.27V7.414c0-.37-.116-.5-.478-.413-.616.15-1.233.303-1.847.46l-3.66.917c-.018.004-.036.01-.054.013-.258.053-.373.187-.39.453-.003.053-.006.107-.006.16v7.544c0 .407-.04.812-.194 1.194-.287.71-.803 1.167-1.54 1.37-.36.098-.73.15-1.103.168-.873.04-1.673-.454-2.015-1.27-.378-.892-.063-1.994.75-2.49.457-.28.96-.4 1.48-.46.413-.05.826-.096 1.236-.15.378-.05.6-.267.638-.653.01-.097.014-.195.014-.293V5.9c0-.24.067-.43.27-.545.107-.06.222-.1.34-.125 1.086-.27 2.173-.54 3.26-.807 1.287-.318 2.574-.636 3.862-.95.38-.092.77-.178 1.152-.27.25-.062.435.052.5.31.027.106.038.217.038.33v6.193z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                              </svg>
                            )}
                            Open in {platformName}
                          </Button>

                          <Button
                            variant="secondary"
                            size="lg"
                            onClick={handleCopyLink}
                            disabled={!buttonsEnabled}
                            className="flex-1 relative"
                          >
                            {copied ? (
                              <>
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
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                Copied!
                              </>
                            ) : (
                              <>
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
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                                Copy Link
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Info text */}
                        <p className="text-center text-sm text-dark-400">
                          Your playlist has been added to your {platformName} library
                        </p>
                      </div>
                    </Card>
                  </motion.div>

                  {/* Secondary action - moved outside card and delayed */}
                  <motion.div
                    className="mt-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: buttonsEnabled ? 1 : 0.5 }}
                    transition={{ delay: 1 }}
                  >
                    <Button
                      variant="ghost"
                      onClick={handleCreateAnother}
                      disabled={!buttonsEnabled}
                      className="text-dark-400 hover:text-dark-200"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Create Another Playlist
                    </Button>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  className="text-center"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <p className="text-dark-400">Loading playlist...</p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </PageLayout>
    </>
  );
}
