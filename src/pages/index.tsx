import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
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
    initMusicKit,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<MusicPlatform>('spotify');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  // True only while an on-demand MusicKit load is in flight.
  const [appleLoading, setAppleLoading] = useState(false);

  // Selecting Apple Music is what triggers the (lazy) MusicKit load. Kicking it off
  // here rather than on click of Connect means the script is usually warm by the time
  // the user commits, without costing Spotify-only visitors anything.
  const handleSelectAppleMusic = async () => {
    setSelectedPlatform('apple-music');
    if (musicKitReady || appleLoading) return;
    setError(null); // clear a previous failure so a successful retry looks successful
    setAppleLoading(true);
    try {
      const ok = await initMusicKit();
      if (!ok) {
        setError('Apple Music is unavailable right now. You can still connect with Spotify.');
      }
    } finally {
      // finally: a future throw in initMusicKit would otherwise stick on "(Loading...)".
      setAppleLoading(false);
    }
  };

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

  // Persist the return path the 401 interceptor passed in the URL — it travels as a
  // param because a localhost → 127.0.0.1 bounce crosses an origin boundary.
  useEffect(() => {
    // router.query is empty until hydration completes, so waiting on isReady is what
    // makes this fire at all on a cold load.
    if (!router.isReady) return;

    const returnTo = router.query.returnTo;
    if (typeof returnTo !== 'string' || !returnTo) return;

    // Same-origin paths only — a crafted URL must not bounce the user off-site.
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      try {
        sessionStorage.setItem(
          'returnAfterAuth',
          JSON.stringify({ url: returnTo, timestamp: Date.now() })
        );
      } catch {
        /* sessionStorage unavailable — fall through, the user lands on /upload */
      }
    }
    // Strip the param so a refresh or share doesn't carry it around.
    router.replace('/', undefined, { shallow: true });
  }, [router, router.isReady, router.query.returnTo]);

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

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return (
    <>
      <Head>
        <title>Playlistd — Your lineup. On repeat.</title>
        <meta
          name="description"
          content="Turn a festival poster or artist lineup into a playlist on Spotify or Apple Music."
        />
      </Head>

      <PageLayout showNav={false} className="overflow-hidden">
        <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-dark-800 px-5 py-5 sm:px-8 lg:px-10">
          <div
            className="flex items-center gap-3 text-xl font-bold tracking-tight"
            aria-label="Playlistd"
          >
            <span className="h-3 w-3 rounded-full bg-accent-500" aria-hidden="true" />
            <span>
              Playlistd<span className="text-accent-500">.</span>
            </span>
          </div>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-dark-300 sm:block">
            Festival music, kept close
          </span>
        </header>

        <section className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-14 sm:px-8 lg:min-h-[720px] lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-8 lg:px-10 lg:pb-24 lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.23em] text-accent-400">
              From festival poster to playlist
            </p>
            <h1 className="max-w-2xl font-display text-[clamp(4rem,8vw,7.75rem)] font-black leading-[0.88] tracking-[-0.075em] text-dark-50">
              Your lineup.
              <br />
              <span className="text-accent-500">On repeat.</span>
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-relaxed text-dark-300 sm:text-xl">
              The artists on your poster deserve more than a saved photo. Turn any lineup into a
              playlist you can actually play.
            </p>

            <div className="mt-10 max-w-lg border-t border-dark-700 pt-6">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-dark-300">
                Choose where to listen
              </p>
              <div
                className="grid grid-cols-2 gap-3"
                role="group"
                aria-label="Choose your music platform"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPlatform('spotify')}
                  aria-pressed={selectedPlatform === 'spotify'}
                  className={`flex min-h-[66px] items-center gap-3 rounded-2xl border px-4 text-left transition-colors focus-ring ${selectedPlatform === 'spotify' ? 'border-accent-500 bg-accent-500/10 text-dark-50' : 'border-dark-700 bg-dark-900 text-dark-300 hover:border-dark-500'}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 shrink-0 fill-[#1DB954]"
                    aria-hidden="true"
                  >
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  <span className="font-semibold">Spotify</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectAppleMusic}
                  aria-pressed={selectedPlatform === 'apple-music'}
                  className={`flex min-h-[66px] items-center gap-3 rounded-2xl border px-4 text-left transition-colors focus-ring ${selectedPlatform === 'apple-music' ? 'border-accent-500 bg-accent-500/10 text-dark-50' : 'border-dark-700 bg-dark-900 text-dark-300 hover:border-dark-500'}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 shrink-0 fill-[#FA243C]"
                    aria-hidden="true"
                  >
                    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.8.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.8-.335-2.22-1.09-.46-.83-.196-1.89.632-2.512.456-.342.98-.53 1.528-.625.39-.066.784-.115 1.178-.17.186-.025.376-.04.56-.075a.853.853 0 00.688-.837c.002-1.264.002-2.527 0-3.79-.003-.22-.086-.336-.305-.378-.447-.088-.895-.17-1.344-.248-.856-.15-1.713-.296-2.57-.44a12953.932 12953.932 0 00-2.65-.447c-.143-.023-.273.044-.305.207-.013.064-.02.13-.02.194v7.516c0 .164-.012.326-.04.488-.1.58-.356 1.068-.84 1.418-.47.34-1.003.5-1.576.537-.793.053-1.52-.13-2.11-.678-.47-.44-.675-.99-.58-1.636.113-.78.574-1.303 1.28-1.623.396-.18.818-.29 1.245-.364.447-.075.893-.146 1.34-.22a1.082 1.082 0 00.758-.538.9.9 0 00.113-.437V6.085c0-.197.015-.39.06-.582.108-.44.413-.723.838-.822.212-.05.43-.062.646-.08.945-.077 1.89-.153 2.837-.228.586-.047 1.172-.09 1.758-.14.558-.047 1.115-.102 1.673-.15.438-.038.877-.068 1.315-.107.17-.015.273.085.29.265.004.042.006.084.006.127v5.746z" />
                  </svg>
                  <span className="font-semibold">Apple Music</span>
                  {appleLoading && <span className="sr-only">Loading...</span>}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleLogin}
                  disabled={isLoggingIn || (selectedPlatform === 'apple-music' && appleLoading)}
                  className="min-h-[56px] rounded-xl px-7 text-base font-bold"
                >
                  {isLoggingIn
                    ? 'Connecting...'
                    : appleLoading
                      ? 'Loading Apple Music...'
                      : `Connect with ${selectedPlatform === 'spotify' ? 'Spotify' : 'Apple Music'}`}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() =>
                    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="min-h-[56px] text-base"
                >
                  See how it works{' '}
                  <span aria-hidden="true" className="ml-2">
                    ↓
                  </span>
                </Button>
              </div>
              {error && (
                <div className="mt-4">
                  <ErrorMessage message={error} onDismiss={() => setError(null)} />
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            className="relative mx-auto w-full max-w-[560px] lg:ml-auto"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            aria-hidden="true"
          >
            <div className="relative min-h-[480px] rounded-[2rem] border border-dark-700 bg-dark-900 p-5 sm:min-h-[580px] sm:p-8">
              <div className="flex items-center justify-between border-b border-dark-700 pb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-dark-300">
                <span>01 / The source</span>
                <span>Lineup study</span>
              </div>
              <div className="mx-auto mt-6 max-w-[360px] rotate-[-4deg] border-[8px] border-[#e6d9bc] bg-[#e6d9bc] shadow-[0_24px_48px_rgba(0,0,0,0.35)] sm:mt-10 sm:border-[12px]">
                <div className="relative overflow-hidden bg-[#ee8e1c] px-5 pb-7 pt-5 text-dark-950 sm:px-7 sm:pb-10 sm:pt-7">
                  <div className="mb-9 flex items-center justify-between border-b border-dark-950/50 pb-2 text-[9px] font-black uppercase tracking-widest">
                    <span>PLAYLISTD PRESENTS</span>
                    <span>NO. 001</span>
                  </div>
                  <div className="font-display text-[clamp(2.5rem,7vw,4.1rem)] font-black uppercase leading-[0.82] tracking-[-0.085em]">
                    THE
                    <br />
                    NEXT
                    <br />
                    SOUND<span className="text-[#e6d9bc]">.</span>
                  </div>
                  <div className="mt-8 border-t-2 border-dark-950 pt-3 font-display text-xl font-black uppercase leading-tight tracking-tight sm:text-2xl">
                    Alvvays <span className="text-[#e6d9bc]">/</span> The Beths
                    <br />
                    Men I Trust <span className="text-[#e6d9bc]">/</span> Khruangbin
                  </div>
                  <div className="mt-6 flex justify-between border-t border-dark-950/50 pt-2 text-[9px] font-black uppercase tracking-widest">
                    <span>Your favorite lineup</span>
                    <span>Everywhere you go</span>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-7 right-4 w-[65%] rotate-[3deg] rounded-2xl border border-dark-600 bg-dark-950 p-4 shadow-[0_24px_44px_rgba(0,0,0,0.5)] sm:bottom-10 sm:right-3 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500 text-dark-950">
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M10 4v12.26A4 4 0 1 0 12 20V8h7V4h-9z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-400">
                      Ready to play
                    </p>
                    <p className="text-sm font-bold text-dark-50 sm:text-base">The Next Sound</p>
                  </div>
                </div>
                {[
                  ['01', 'Alvvays', 'Dreams Tonite'],
                  ['02', 'The Beths', 'Expert In A Dying Field'],
                  ['03', 'Men I Trust', 'Show Me How'],
                ].map(([number, artist, song]) => (
                  <div
                    key={number}
                    className="flex items-center gap-3 border-t border-dark-800 py-2 text-xs"
                  >
                    <span className="text-dark-300">{number}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-dark-200">
                      {artist}
                    </span>
                    <span className="hidden max-w-[100px] truncate text-dark-300 sm:block">
                      {song}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section
          id="how-it-works"
          className="border-t border-dark-800 bg-dark-900/50 px-5 py-20 sm:px-8 lg:px-10 lg:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.23em] text-accent-400">
                  The process
                </p>
                <h2 className="font-display text-4xl font-black tracking-tight text-dark-50 sm:text-5xl">
                  Three steps to the good stuff.
                </h2>
              </div>
              <p className="max-w-sm text-dark-300">
                You choose the artists and tracks before anything lands in your library.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                [
                  '01',
                  'Start with a lineup',
                  'Upload a festival poster or type the artist names yourself.',
                ],
                [
                  '02',
                  'Make it yours',
                  'Review the artists, choose your track mix, and fine-tune the songs.',
                ],
                ['03', 'Hit play', 'Save the finished playlist to your music library.'],
              ].map(([number, title, description]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-dark-700 bg-dark-900 p-6 sm:p-8"
                >
                  <span className="font-display text-4xl font-black text-accent-500">{number}</span>
                  <h3 className="mt-10 text-xl font-bold text-dark-50">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-dark-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </PageLayout>
    </>
  );
}
