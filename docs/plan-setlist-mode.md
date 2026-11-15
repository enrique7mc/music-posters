# Plan: "Prefer tour setlists" toggle (Setlist.fm → Apple Music)

> Status (2026-11-15): planned and grilled, NOT implemented. Repo: `~/Documents/projects/music-posters`.
> Implement in a worktree per the global CLAUDE.md workflow (`claude/setlist-mode` off `main`).
> The main checkout has uncommitted changes in `ArtistList.tsx`, `PersonalizationHeader.tsx`,
> `Section.tsx`, and `review-tracks.tsx`. Terms in **bold** are defined in `GLOSSARY.md`.

## Context

Today each artist's tracks come from Apple Music `top-songs` (25-song pool), filtered by
Popular / Balanced / Deep Cuts. This feature builds an artist's tracks from the songs the
artist plays live on the current tour, using Setlist.fm.

## Decisions

- **Toggle.** One "Prefer tour setlists" toggle, layered on any selection mode.
- **Setlist Scope.**
  - Poster Lineup: headliners only (`tier === 'headliner'`, Gemini weight ≥ 8).
  - Manual Lineup: every artist.
  - Deferred: a per-artist toggle, and per-artist set totals on posters.
- **Count rule.** For an artist in scope: count = max(resolved Typical Set, the artist's
  count). "The artist's count" is the tier count or the per-artist count, whichever mode is
  active. A Setlist Fallback gets the artist's count from the regular mode. This applies to
  per-artist mode too, so Manual Lineups are not blocked.
- **Partial resolution.** If fewer than 50% of the Typical Set resolves on Apple Music, the
  artist is a Setlist Fallback.
- **Over 2,000 tracks.** No new code. `review-tracks.tsx` already blocks creation over
  `MAX_PLAYLIST_TRACKS` and asks the user to deselect tracks. We will evaluate auto-trimming later.
- **Key.** Use the shared concert-history key. This is a personal app that is not open to
  the public, so quota exhaustion is not a real risk. No daily-cap machinery.
- **Terms.** Setlist.fm's free API is non-commercial only, and this app is non-commercial.
  Wherever the app uses Setlist.fm data, it MUST show the attribution link from the API
  response (the setlist `url`), with no `nofollow`.

## Feasibility (verified)

- **Key:** `SETLISTFM_API_KEY` exists in `~/Documents/projects/concert-history/.env.local`.
  A secret-read hook blocks the agent from reading it. The user MUST copy it into
  `music-posters/.env` (see "Live testing" below).
- **Quota:** the key allows 16 req/s and 50,000 calls/day, and concert-history shares that quota.
  This feature self-limits to 4 req/s, 2 in flight. A poster costs one or two calls per
  headliner. A 59-artist Manual Lineup costs ~59–118 calls (~15–30 s, overlapped with the
  Apple artist search).
- **Data, sampled on setlist.fm (2026-11-14):**
  - Fontaines D.C., Turnstile, Charli xcx: 10+ full setlists in the last 6 weeks. Good fit.
  - Promo/TV sets are short: Turnstile on SNL (3 songs), Charli xcx at Milk Studios (2 songs),
    Daft Punk at the Grammys (1 song). These MUST be filtered out.
  - Past shows can be empty (Mannequin Pussy: 4 of the last 10 have no songs yet). Upcoming
    shows are empty too.
  - Tour names are unreliable: festival sets have none, and one Mannequin Pussy tour shows
    "Bitch Cabal" on some dates and nothing on others. Grouping MUST use dates, not tour names.
  - Duplicate artist entries exist (two "Turnstile" MBIDs: 864 vs 15 setlists).
  - Dormant artists (Daft Punk, last full set 2007) MUST fall back.
- **Terms (setlist.fm/help/terms, read 2026-11-15):** attribution link required, non-commercial
  only, "cached information for short periods" allowed. No numeric rate limit is published.

## Approach

### 1. Setlist.fm client — new `src/lib/setlistfm.ts`
- `getTypicalSetlist(artistName): Promise<TypicalSetlistResult>`, where the result is
  either a Typical Set or a Setlist Fallback with a reason.
- One call: `GET https://api.setlist.fm/rest/1.0/search/setlists?artistName=<name>&p=1`
  (headers `x-api-key`, `Accept: application/json`; 10 s `AbortSignal.timeout`).
  Keep entries whose `artist.name` normalizes equal to the request (`normalize` from
  `src/lib/artist-match.ts`). If page 1 has fewer than 3 Qualifying Setlists, fetch `p=2` once.
- **MBID choice:** group by `artist.mbid`. Pick the MBID with the most Qualifying Setlists
  in the last 180 days. Total entries break a tie. This stops a famous dormant band from
  winning over an active band with the same name.
- Module-level limiter (4 req/s, 2 in flight) and an in-memory TTL cache (6 h; also cache
  fallbacks, 1 h).
- Errors (403, 429, timeout, 5xx) MUST NOT fail the request. They return a fallback with a
  reason. A missing key disables the feature and adds one warning.
- Keep each setlist's `url` for attribution.
- Port the fetch/timeout/error shape from `concert-history/src/lib/setlistfm-client.ts` and
  the types from `concert-history/src/types/setlistfm.ts`. Do not copy its daily-cap machinery.

### 2. Typical Set selection — new pure module `src/lib/setlist-select.ts`
- Qualifying Setlist: `eventDate` (dd-MM-yyyy) ≤ today, AND ≥ 8 performed songs
  (non-tape, non-empty name). Short festival, promo, and TV sets do not qualify, so they never
  enter the sample.
- On Tour: the newest Qualifying Setlist is ≤ 180 days old. Otherwise → fallback
  (`not-on-tour`).
- Sample: up to 5 newest Qualifying Setlists within 90 days of the newest one.
- Aggregate by normalized song title. Keep songs that appear in ≥ 50% of the sample (all songs
  if the sample has 1 setlist). Order them by median position. Output:
  `{ songs: {title, isCover, coverOf?}[], sampleSize, latest: {date, venue, city, tour?, url} }`.
- Song filters:
  - Tape songs (`tape: true`: intros, interludes, walk-on music) MUST be excluded everywhere:
    from the 8-song threshold, the frequency count, positions, and the output.
  - Songs with an empty name MUST be excluded.
  - Covers (`cover` present) stay in the output with `isCover: true`. Step 3 keeps a cover only
    if the current artist's own recording exists on Apple Music.

### 3. Resolve songs to Apple tracks — `src/lib/music-platform/`
- `apple-music-platform.ts`: split `getArtistTopTracks` into `getTopSongPool(artistId)`
  (the 25 mapped tracks, unshuffled) plus the existing selection. Add
  `searchArtistSong(artistName, title)`: `GET /catalog/us/search?types=songs&term=<artist> <title>&limit=5`,
  through `withRetry`. Accept a hit only if the artist name matches (`similarity` ≥ 0.85, or
  `containsName`) and the title matches after stripping "(Live…)", "- Remastered…", "feat.…"
  (`similarity` ≥ 0.85). Prefer a non-live album. Return null otherwise.
- Cover rule: resolve a cover only to a track credited to the current artist (the same
  artist-name check). The resolver MUST NOT fall back to the original artist's recording. If
  the current artist has not released the cover on Apple Music, drop the song. A dropped cover
  does not count as a resolution failure, and it does not count toward the 50% threshold.
- `types.ts`: add optional `getTopSongPool?` and `searchArtistSong?` to `MusicPlatformService`,
  plus `setlistArtistNames?: string[]` on `TrackCountOptions`. Spotify does not implement them,
  so its artists always fall back.
- `index.ts` `searchAndGetTopTracks`:
  - When `setlistArtistNames` is non-empty, start the Setlist.fm lookups for those artists at
    the start, concurrent with the Apple artist-search phase.
  - Per in-scope artist with a Typical Set: match each title against the top-song pool first
    (free). Search the rest one at a time inside the artist's slot, so Apple concurrency stays
    within the existing 5/batch + 500 ms rule (AGENTS.md hard rule; no limit increase).
  - If fewer than 50% of the Typical Set (excluding dropped covers) resolves → fallback
    (`low-resolution`).
  - Otherwise keep setlist order and dedupe by track id. Apply the count rule. If the resolved
    set is shorter than the artist's count, top up from the pool with the artist's normal mode.
  - A Typical Set overrides the affinity rule (`getSelectionModeForArtist`) for that artist.
    The top-up still uses the affinity-derived mode.
  - Return `setlistArtists: {artist, latestDate, venue, city, tour?, url, setSize, resolved}[]`
    and `setlistFallbacks: {artist, reason}[]`.

### 4. API + types
- `src/lib/validation.ts` `searchTracksSchema`: `setlistArtistNames: z.array(z.string()).max(MAX_ARTISTS_PER_SEARCH).optional()`.
  Every name MUST be in the request's artist list; otherwise respond 400.
- `src/pages/api/search-tracks.ts`: pass it through. Add warnings ("No recent setlist for X,
  used Popular", "Resolved 14 of 18 setlist songs for X"). Keep the method/auth/rate-limit/
  validation order and all existing status codes. Include `setlistArtists` in the response.
- `src/types/index.ts`: `Track.source?: 'setlist'`. Add `setlistArtists` to `SearchTracksResponse`.

### 5. Logging (server only, no storage)
- One line per in-scope artist with a Typical Set:
  `[setlist] Turnstile: 10/12 resolved (pool 7, search 3), 1 cover dropped, unresolved: "Mystery", "Holiday" · 2026-11-13 Paris`
- One line per Setlist Fallback: `[setlist] Daft Punk: fallback (not-on-tour)`.
  Reasons: `not-on-tour`, `no-match`, `low-resolution`, `api-error:<status>`, `no-key`.
- One summary line per request: in-scope artist count, Typical Sets used, fallbacks,
  Setlist.fm calls, cache hits, total latency.

### 6. UI and draft
- `src/lib/playlist-draft.ts`:
  - Add `preferSetlist: boolean` to the review draft (default `false`; validate on restore,
    like `trackSelectionMode`).
  - Add `setlistArtistNames: string[]` to `SearchFingerprintInput` and
    `computeSearchFingerprint`, so a toggle change (or a Setlist Scope change) forces a new search.
- `src/pages/review-artists.tsx`:
  - Add a "Prefer tour setlists" switch under `TrackSelectionModeSelector`.
  - Compute the Setlist Scope from `inputSource`: `'poster'` → headliners; `'text'` → all artists.
  - Hint text names the scope and the count:
    - Poster: "Headliners (3) get their live set when they've played recently."
    - Manual: "Every artist gets their live set when they've played recently."
    - Poster with no headliners: disable the switch and show "No headliners on this poster."
  - When the toggle is on, send `setlistArtistNames` with the search request (the request build
    is near lines 385/416).
- `src/pages/review-tracks.tsx`: show a chip per artist with `source: 'setlist'` tracks:
  "Live set · Paris, Nov 13 2026 · setlist.fm". The chip links to that setlist's `url`
  (a plain link with no `nofollow`). **This file has uncommitted local changes.** Implement in
  the worktree and keep the edit minimal.
- `src/lib/track-counts.ts`: mention the toggle in the track-count summary, so the estimate
  shows that in-scope artists may get more tracks.

### 7. Dev mode, config, docs
- `src/lib/dev-mode.ts` / `mock-data.ts`: mock setlist results under `DEV_MODE` (still blocked
  in production).
- `.env.example`, `SETUP.md`, `ARCHITECTURE.md`: document `SETLISTFM_API_KEY` (optional),
  the shared quota, the fallback rules, and that the free key requires non-commercial use.
- Dev probe `scripts/probe-setlists.mjs`: prints only derived summaries (MBID choice,
  Qualifying Setlist count, Typical Set). The user runs it with
  `! node --env-file=.env scripts/probe-setlists.mjs "Turnstile" "Daft Punk" …`.

## Verification
1. `src/lib/__tests__/setlist-select.test.ts`, with fixtures built from the sampled cases:
   a full tour; promo 3-song sets; a 5-song festival set mixed with full sets (festival set
   excluded); empty past shows; a future show; two MBIDs; a famous dormant MBID vs an active
   same-name MBID (active wins); a dormant artist; a single-setlist sample; a set with tape
   entries, where tape does not count toward the 8-song threshold and does not appear in the output.
2. `setlistfm.test.ts` (MSW): 200, 404, 403, 429, timeout, missing key, cache hit.
3. `src/lib/music-platform/__tests__/`: pool hit; search hit; title-match rejection; top-up to
   the tier count; top-up to a per-artist count; < 50% resolved → fallback; cover released by
   the current artist kept; cover only under the original artist dropped (and not counted
   against the 50% threshold); artists outside `setlistArtistNames` unchanged; Spotify falls back;
   one log line per in-scope artist with unresolved titles.
4. `src/pages/api/__tests__/search-tracks`: `setlistArtistNames` validation (unknown name → 400,
   over cap → 400), warnings, unchanged status codes.
5. `playlist-draft` tests: `preferSetlist` restores and validates; a change in
   `setlistArtistNames` changes the fingerprint.
6. `src/test/pages/review-artists.test.tsx`: the toggle persists in the draft; a poster sends
   only headliners; a Manual Lineup sends all artists; a poster with no headliners disables the switch.
7. Run `npm run lint`, `npm run typecheck`, `npm run test:run`.
8. **Live testing:**
   - The user adds `SETLISTFM_API_KEY=<key>` to `music-posters/.env` (the main checkout).
   - The worktree has no `.env`. Link it: `ln -s ../../music-posters/.env .env` from the
     worktree root (`../music-posters-claude-fix/setlist-mode`). Restart the dev server after any
     env change.
   - Run the probe.
   - `npm run dev` at `http://127.0.0.1:3000` with Apple Music. Use a Manual Lineup of
     Fontaines D.C., Turnstile, Mannequin Pussy, Daft Punk. Expect three artists with full sets
     and linked setlist chips, and Daft Punk on its count with a fallback warning. Check the
     `[setlist]` log lines for resolution counts, call count, and latency.
   - Then a poster: only headliners get chips.

## Risks
- Apple title mismatches (live-only titles, medleys, covers) drop songs. The top-up keeps the
  count at least at the artist's count. The `[setlist]` log lines show which titles fail.
- A large Manual Lineup with full sets can go over 2,000 tracks. The existing review-tracks
  block makes the user deselect tracks. Auto-trimming is deferred.
- Latency rises by roughly 1 Apple search per Typical Set song missing from the top-25 pool.
- The module-level limiter and cache are per instance. Concurrent instances can go over
  4 req/s together, but the key allows 16 req/s.
- The quota is shared with concert-history. This is acceptable for a personal app.
