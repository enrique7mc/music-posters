import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { fadeIn, slideUp, staggerContainer, staggerItem } from '@/lib/animations';
import { useAuth } from '@/contexts/AuthContext';
import { MusicPlatform } from '@/types';

export default function Home() {
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    loginWithSpotify,
    loginWithAppleMusic,
    musicKitReady,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<MusicPlatform>('spotify');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Redirect if user is already authenticated
    if (!authLoading && user) {
      router.push('/upload');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    // Handle OAuth errors
    if (router.query.error) {
      setError('Authentication failed. Please try again.');
    }
  }, [router.query.error]);

  const handleLogin = async () => {
    setError(null);
    setIsLoggingIn(true);

    try {
      if (selectedPlatform === 'spotify') {
        loginWithSpotify();
      } else {
        await loginWithAppleMusic();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
      setIsLoggingIn(false);
    }
  };

  const isAppleMusicAvailable = musicKitReady;

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return (
    <>
      <Head>
        <title>Music Posters - Turn Festival Posters into Playlists</title>
        <meta
          name="description"
          content="Transform festival and concert posters into curated playlists instantly using AI-powered image analysis. Supports Spotify and Apple Music."
        />
      </Head>

      <PageLayout showNav={false} className="relative overflow-hidden">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center">
          {/* Background with concert imagery effect */}
          <div className="absolute inset-0 bg-dark-950">
            {/* Gradient mesh for depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-dark-900 via-dark-950 to-dark-950 opacity-90" />

            {/* Simulated stage lights effect */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-ember-600/10 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-muted-600/10 rounded-full blur-3xl" />
          </div>

          {/* Content */}
          <div className="relative container mx-auto px-4 py-20">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Bold Typography */}
              <motion.div
                className="space-y-6"
                variants={fadeIn}
                initial="hidden"
                animate="visible"
              >
                {/* Large overlapping text */}
                <div className="relative">
                  <motion.h1
                    className="text-6xl sm:text-7xl lg:text-8xl xl:text-9xl font-display font-black tracking-tighter"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                  >
                    <span className="block text-dark-200">TURN</span>
                    <span className="block text-gradient">POSTERS</span>
                    <span className="block text-dark-100">INTO</span>
                    <span className="block text-accent-500">PLAYLISTS</span>
                  </motion.h1>

                  {/* Accent box for asymmetry */}
                  <motion.div
                    className="absolute -right-4 top-1/2 w-32 h-32 bg-accent-600/20 border border-accent-500/30 rounded-lg -z-10"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  />
                </div>

                <motion.p
                  className="text-xl text-dark-300 max-w-md"
                  variants={slideUp}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.4 }}
                >
                  Transform festival posters into curated playlists on Spotify or Apple Music.
                  AI-powered. Artist-ranked. Ready in seconds.
                </motion.p>

                {/* Platform Selector */}
                <motion.div
                  className="pt-4 space-y-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <p className="text-sm text-dark-400 mb-2">Choose your music platform:</p>
                  <div className="flex gap-3">
                    {/* Spotify Option */}
                    <button
                      onClick={() => setSelectedPlatform('spotify')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                        selectedPlatform === 'spotify'
                          ? 'border-[#1DB954] bg-[#1DB954]/10'
                          : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#1DB954]">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                      </svg>
                      <span
                        className={`font-medium ${selectedPlatform === 'spotify' ? 'text-dark-50' : 'text-dark-300'}`}
                      >
                        Spotify
                      </span>
                    </button>

                    {/* Apple Music Option */}
                    <button
                      onClick={() => isAppleMusicAvailable && setSelectedPlatform('apple-music')}
                      disabled={!isAppleMusicAvailable}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all ${
                        !isAppleMusicAvailable
                          ? 'border-dark-800 bg-dark-900/50 cursor-not-allowed opacity-50'
                          : selectedPlatform === 'apple-music'
                            ? 'border-[#FA243C] bg-[#FA243C]/10'
                            : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`w-6 h-6 ${isAppleMusicAvailable ? 'fill-[#FA243C]' : 'fill-dark-600'}`}
                      >
                        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.8.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.8-.335-2.22-1.09-.46-.83-.196-1.89.632-2.512.456-.342.98-.53 1.528-.625.39-.066.784-.115 1.178-.17.186-.025.376-.04.56-.075a.853.853 0 00.688-.837c.002-1.264.002-2.527 0-3.79-.003-.22-.086-.336-.305-.378-.447-.088-.895-.17-1.344-.248-.856-.15-1.713-.296-2.57-.44a12953.932 12953.932 0 00-2.65-.447c-.143-.023-.273.044-.305.207-.013.064-.02.13-.02.194v7.516c0 .164-.012.326-.04.488-.1.58-.356 1.068-.84 1.418-.47.34-1.003.5-1.576.537-.793.053-1.52-.13-2.11-.678-.47-.44-.675-.99-.58-1.636.113-.78.574-1.303 1.28-1.623.396-.18.818-.29 1.245-.364.447-.075.893-.146 1.34-.22a1.082 1.082 0 00.758-.538.9.9 0 00.113-.437V6.085c0-.197.015-.39.06-.582.108-.44.413-.723.838-.822.212-.05.43-.062.646-.08.945-.077 1.89-.153 2.837-.228.586-.047 1.172-.09 1.758-.14.558-.047 1.115-.102 1.673-.15.438-.038.877-.068 1.315-.107.17-.015.273.085.29.265.004.042.006.084.006.127v5.746z" />
                      </svg>
                      <span
                        className={`font-medium ${
                          !isAppleMusicAvailable
                            ? 'text-dark-600'
                            : selectedPlatform === 'apple-music'
                              ? 'text-dark-50'
                              : 'text-dark-300'
                        }`}
                      >
                        Apple Music
                      </span>
                      {!isAppleMusicAvailable && (
                        <span className="text-xs text-dark-500">(Loading...)</span>
                      )}
                    </button>
                  </div>

                  {/* Connect Button */}
                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleLogin}
                      disabled={
                        isLoggingIn ||
                        (selectedPlatform === 'apple-music' && !isAppleMusicAvailable)
                      }
                      className="text-lg"
                    >
                      {isLoggingIn ? (
                        'Connecting...'
                      ) : (
                        <>
                          Connect with {selectedPlatform === 'spotify' ? 'Spotify' : 'Apple Music'}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => {
                        document.getElementById('how-it-works')?.scrollIntoView({
                          behavior: 'smooth',
                        });
                      }}
                    >
                      See how it works
                    </Button>
                  </div>
                </motion.div>

                {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
              </motion.div>

              {/* Right: Floating "How It Works" Panel (Asymmetric) */}
              <motion.div
                className="lg:pl-12"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <Card variant="glass" className="p-8 lg:p-10">
                  <h2 className="text-2xl font-bold text-dark-50 mb-6">How it works</h2>

                  <motion.div
                    className="space-y-6"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {[
                      {
                        number: '01',
                        title: 'Upload your poster',
                        description: 'Any festival or concert poster, photo or screenshot',
                      },
                      {
                        number: '02',
                        title: 'AI extracts artists',
                        description: 'Advanced vision AI ranks artists by prominence',
                      },
                      {
                        number: '03',
                        title: 'Get your playlist',
                        description: 'Curated playlist with top tracks on your preferred platform',
                      },
                    ].map((step, index) => (
                      <motion.div key={index} variants={staggerItem} className="flex gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-lg bg-accent-500/10 border border-accent-500/30 flex items-center justify-center">
                            <span className="text-accent-400 font-bold text-sm">{step.number}</span>
                          </div>
                        </div>
                        <div className="pt-1">
                          <h3 className="text-dark-100 font-semibold mb-1">{step.title}</h3>
                          <p className="text-sm text-dark-400">{step.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>

                  <div className="mt-8 pt-6 border-t border-dark-700">
                    <p className="text-xs text-dark-500">
                      Powered by Google Gemini AI, Spotify, and Apple Music
                    </p>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            <motion.div
              className="text-dark-500 text-sm"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <svg
                className="w-6 h-6 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </motion.div>
          </motion.div>
        </section>

        {/* Features Section (optional, could be expanded) */}
        <section id="how-it-works" className="relative py-20 bg-dark-900/50">
          <div className="container mx-auto px-4">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-bold text-dark-50 mb-4">Why Music Posters?</h2>
              <p className="text-dark-400 max-w-2xl mx-auto">
                The fastest way to discover and enjoy music from any festival or concert.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  icon: '⚡',
                  title: 'Lightning Fast',
                  description: 'From poster to playlist in under 60 seconds',
                },
                {
                  icon: '🎯',
                  title: 'Artist Ranking',
                  description: 'Headliners first, undercard last - naturally ordered',
                },
                {
                  icon: '🎵',
                  title: 'Top Tracks',
                  description: "Curated with each artist's most popular song",
                },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                >
                  <Card hover className="p-6 text-center h-full">
                    <div className="text-4xl mb-4">{feature.icon}</div>
                    <h3 className="text-lg font-bold text-dark-50 mb-2">{feature.title}</h3>
                    <p className="text-sm text-dark-400">{feature.description}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </PageLayout>
    </>
  );
}
