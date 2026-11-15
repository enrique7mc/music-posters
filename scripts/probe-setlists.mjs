#!/usr/bin/env node
/**
 * Dev probe for "Prefer tour setlists": runs the real Setlist.fm client
 * (src/lib/setlistfm.ts) for each artist and prints only derived summaries —
 * never the API key or raw payloads.
 *
 * Usage:
 *   node --env-file=.env scripts/probe-setlists.mjs "Turnstile" "Daft Punk"
 *
 * Loads the TypeScript sources through jiti (installed with Tailwind CSS).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let jiti;
try {
  jiti = require('jiti')(import.meta.url, {
    alias: { '@': path.join(root, 'src') },
    interopDefault: true,
  });
} catch {
  console.error('jiti is not installed. Run `npm install` first.');
  process.exit(1);
}

const artists = process.argv.slice(2);
if (artists.length === 0) {
  console.error('Usage: node --env-file=.env scripts/probe-setlists.mjs "Artist" ["Artist" ...]');
  process.exit(1);
}
if (!process.env.SETLISTFM_API_KEY?.trim()) {
  console.error('SETLISTFM_API_KEY is not set (did you pass --env-file=.env?).');
  process.exit(1);
}

const { getTypicalSetlist } = jiti(path.join(root, 'src/lib/setlistfm.ts'));

let totalCalls = 0;
const started = Date.now();
for (const name of artists) {
  const t0 = Date.now();
  const { result, calls, diagnostics } = await getTypicalSetlist(name);
  totalCalls += calls;
  const d = diagnostics
    ? `entries=${diagnostics.entries} mbids=${diagnostics.mbids} qualifying=${diagnostics.qualifying}`
    : 'cached';
  console.log(`\n${name}  (${calls} call${calls === 1 ? '' : 's'}, ${Date.now() - t0} ms, ${d})`);
  if (result.kind === 'fallback') {
    console.log(`  → fallback: ${result.reason}`);
    continue;
  }
  const { songs, sampleSize, latest } = result.typicalSet;
  console.log(
    `  → Typical Set: ${songs.length} songs from ${sampleSize} show${sampleSize === 1 ? '' : 's'}; ` +
      `latest ${latest.date} ${latest.venue}, ${latest.city}${latest.tour ? ` (${latest.tour})` : ''}`
  );
  console.log(`    ${latest.url}`);
  songs.forEach((song, i) => {
    const cover = song.isCover ? `  [cover${song.coverOf ? ` of ${song.coverOf}` : ''}]` : '';
    console.log(`    ${String(i + 1).padStart(2)}. ${song.title}${cover}`);
  });
}
console.log(
  `\n${artists.length} artists, ${totalCalls} Setlist.fm calls, ${Date.now() - started} ms`
);
