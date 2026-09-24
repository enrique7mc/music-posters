import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

type Subject = 'poster' | 'manual' | 'speed' | 'ranking' | 'tracks' | 'cover';
type Style = 'print' | 'neon' | 'collage';

const subjects: { id: Subject; title: string; use: string }[] = [
  { id: 'poster', title: 'Poster upload', use: 'Upload choice and drop zone' },
  { id: 'manual', title: 'Enter artists', use: 'Manual entry choice' },
  { id: 'speed', title: 'Lightning fast', use: 'Landing page feature' },
  { id: 'ranking', title: 'Artist ranking', use: 'Landing page feature and artist review' },
  { id: 'tracks', title: 'Top tracks', use: 'Landing page feature and missing artwork' },
  { id: 'cover', title: 'Cover preview', use: 'Playlist cover and poster placeholders' },
];

const styles: { id: Style; title: string; description: string }[] = [
  { id: 'print', title: 'A · Festival print', description: 'Bold, graphic, high contrast' },
  { id: 'neon', title: 'B · Stage neon', description: 'Light lines and concert glow' },
  { id: 'collage', title: 'C · Paper collage', description: 'Tactile, warm, editorial' },
];

export default function IconDemo() {
  const [selected, setSelected] = useState<Record<Subject, Style>>({
    poster: 'collage',
    manual: 'collage',
    speed: 'collage',
    ranking: 'collage',
    tracks: 'collage',
    cover: 'collage',
  });

  return (
    <>
      <Head>
        <title>Icon concepts · Playlistd</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <main className="min-h-screen bg-dark-950 text-dark-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-accent-400">
                Playlistd visual study
              </p>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                Emoji replacement concepts
              </h1>
              <p className="mt-4 max-w-2xl text-dark-300">
                Three directions for each recurring image. Select a favorite in each row to compare
                a possible mixed set. The small preview shows the image close to its UI size.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-dark-700 px-4 py-2 text-sm text-dark-200 hover:border-accent-500 hover:text-accent-400"
            >
              Back to app
            </Link>
          </div>

          <div className="mb-8 grid gap-3 rounded-xl border border-dark-700 bg-dark-900 p-5 sm:grid-cols-3">
            {styles.map((style) => (
              <div key={style.id}>
                <h2 className="font-semibold text-accent-400">{style.title}</h2>
                <p className="text-sm text-dark-400">{style.description}</p>
              </div>
            ))}
          </div>

          <section className="mb-10 flex flex-wrap items-center gap-6 rounded-xl border border-accent-500/40 bg-accent-500/10 p-5">
            <Image
              src="/apple-touch-icon.png"
              alt="Paper collage favicon: a music note on a torn poster"
              width={96}
              height={96}
              unoptimized
              className="rounded-lg"
            />
            <div className="flex-1">
              <h2 className="text-xl font-bold">Paper collage is live</h2>
              <p className="mt-1 text-sm text-dark-300">
                The app now uses direction C. The matching favicon is shown here at a larger size
                and at its 32px browser-tab size.
              </p>
            </div>
            <Image
              src="/favicon-32x32.png"
              alt="Favicon at 32 pixels"
              width={32}
              height={32}
              unoptimized
            />
          </section>

          <div className="space-y-10">
            {subjects.map((subject) => (
              <section key={subject.id} aria-labelledby={`${subject.id}-title`}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 id={`${subject.id}-title`} className="text-2xl font-bold">
                      {subject.title}
                    </h2>
                    <p className="text-sm text-dark-400">{subject.use}</p>
                  </div>
                  {selected[subject.id] && (
                    <span className="text-sm text-accent-400">
                      Selected: {styles.find((style) => style.id === selected[subject.id])?.title}
                    </span>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {styles.map((style) => {
                    const isSelected = selected[subject.id] === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelected((current) => ({ ...current, [subject.id]: style.id }))
                        }
                        className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 ${
                          isSelected
                            ? 'border-accent-500 bg-accent-500/10'
                            : 'border-dark-700 bg-dark-900 hover:border-dark-500'
                        }`}
                      >
                        <div className="flex items-center justify-center rounded-lg bg-dark-950 p-2">
                          <Image
                            src={`/icon-demo/${subject.id}-${style.id}.webp`}
                            alt={`${subject.title}, ${style.title} concept`}
                            width={320}
                            height={320}
                            className="h-44 w-44 object-contain sm:h-52 sm:w-52"
                          />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-dark-100">{style.title}</p>
                            <p className="text-xs text-dark-400">{style.description}</p>
                          </div>
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dark-700 bg-dark-800">
                            <Image
                              src={`/icon-demo/${subject.id}-${style.id}.webp`}
                              alt=""
                              width={48}
                              height={48}
                              className="h-12 w-12 object-contain"
                            />
                          </div>
                        </div>
                        <span
                          className={`mt-3 block text-sm ${isSelected ? 'text-accent-400' : 'text-dark-400'}`}
                        >
                          {isSelected ? 'Selected' : 'Select this option'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-dark-700 pt-6 text-sm text-dark-500">
            This gallery remains available for comparing the original concepts.
          </p>
        </div>
      </main>
    </>
  );
}
