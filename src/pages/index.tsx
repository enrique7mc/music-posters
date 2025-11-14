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

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

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

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return (
    <>
      <Head>
        <title>Music Posters - Turn Festival Posters into Spotify Playlists</title>
        <meta
          name="description"
          content="Transform festival and concert posters into curated Spotify playlists instantly using AI-powered image analysis."
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
                  Transform festival posters into curated Spotify playlists instantly. AI-powered.
                  Artist-ranked. Ready in seconds.
                </motion.p>

                <motion.div
                  className="flex flex-col sm:flex-row gap-4 pt-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button variant="primary" size="lg" onClick={handleLogin} className="text-lg">
                    Connect with Spotify
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
                        description: 'Curated Spotify playlist with top tracks, ready to play',
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
                      Powered by Google Gemini AI and Spotify Web API
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
