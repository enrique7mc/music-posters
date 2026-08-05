# Codebase Audit — music-posters (Playlistd)

**Date:** 2026-08-03 · **Version audited:** v0.2.0 (`main` @ `53ef59a`)
**Scope:** all of `src/` (72 production files, 12,051 LOC; 23 test files, 3,125 LOC)
**Method:** full read of `src/lib`, `src/pages`, `src/pages/api`, `src/contexts`, `src/types`; static
usage analysis per export; `npm run build`, `npm run lint`, `npx vitest run`, `npx tsc --noEmit`.

**Baseline health:** 221/221 tests pass · build succeeds · lint clean (3 warnings) ·
`tsc --noEmit` fails with 16 errors, all inside test files (no `typecheck` script, CI never runs it).

---

## 1. Size metrics

### 1.1 Headline numbers

| Metric            | Production | Tests |
| ----------------- | ---------- | ----- |
| Files             | 72         | 23    |
| Total LOC         | 12,051     | 3,125 |
| **Mean LOC/file** | **167.4**  | 135.9 |
| Median LOC/file   | 110.5      | 105   |
| p90               | 371        | 328   |
| Max               | 828        | 451   |
| Std. deviation    | 158.3      | —     |

The mean (167) sits well above the median (110), which is the signature of a long tail: most files
are small and a handful are very large. Test-to-production LOC ratio is **0.26** — low for a
codebase with this much untested UI (see §4.5).

### 1.2 Outliers

Statistical outliers (> mean + 2σ, i.e. > 484 LOC):

| File                           | LOC     | Assessment                                                                                                                                                                                                                            |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/review-tracks.tsx`  | **828** | **Genuine problem.** Single component doing session-storage hydration, playlist naming, cover preview fetching, track selection/removal, create-playlist call, warning display, and ~400 lines of JSX. Highest-risk file in the repo. |
| `src/lib/spotify.ts`           | **656** | **~370 lines are dead** (see §3.1). Legacy pre-abstraction module.                                                                                                                                                                    |
| `src/pages/review-artists.tsx` | **538** | Borderline. Carries real orchestration (personalize lifecycle, bulk selection, four count modes). Splitting the state into a `useReviewArtists` hook would halve it.                                                                  |
| `src/lib/mock-data.ts`         | **531** | **Acceptable** — it's fixture data, not logic. Excluded from any refactor target.                                                                                                                                                     |

Next tier (300–500 LOC), for context rather than alarm:
`apple-music-platform.ts` (440) · `upload.tsx` (410) · `validation.ts` (375) · `index.tsx` (371) ·
`cover-generator.ts` (344) · `personalize.ts` (324) · `success.tsx` (312).

Of these, `validation.ts`, `cover-generator.ts`, and `personalize.ts` are cohesive — length reflects
genuine domain complexity plus dense explanatory comments, not tangled responsibility. `index.tsx`
(371) is ~330 lines of static marketing JSX and inline SVG paths; it's long but trivially so.

### 1.3 By area

| Area                      | Files | LOC   | Mean      |
| ------------------------- | ----- | ----- | --------- |
| `src/lib`                 | 19    | 4,126 | 217.2     |
| `src/pages` (screens)     | 7     | 2,502 | **357.4** |
| `src/components/features` | 9     | 1,508 | 167.6     |
| `src/pages/api`           | 16    | 1,266 | **79.1**  |
| `src/lib/music-platform`  | 4     | 1,091 | 272.8     |
| `src/components/ui`       | 8     | 621   | 77.6      |
| `src/components/layout`   | 4     | 277   | 69.2      |
| `src/contexts`            | 1     | 254   | 254.0     |

The distribution tells a clear story: **API routes are consistently thin and disciplined (79 LOC
mean)** — they validate, delegate, and map errors. **Page components are 4.5× heavier (357 LOC
mean)** and are where the architecture degrades. The layering is sound on the server and thin on the
client.

---

## 2. SOLID assessment

Overall: **the codebase makes a serious, mostly successful attempt at DIP through
`MusicPlatformService`, then leaks that abstraction at nearly every call site.** Grades below are
relative to what's reasonable for a personal app, not enterprise dogma.

### 2.1 Single Responsibility — ⚠️ Mixed

**Good:** `artist-match.ts`, `gemini-parser.ts`, `error-utils.ts`, `rate-limit.ts`, `constants.ts`
each do exactly one thing. The extraction of matching primitives out of the platform adapters into
`artist-match.ts` (with a header explaining _why_ the two call sites keep different thresholds) is
exemplary.

**Violations:**

- `src/pages/review-tracks.tsx` (828) — at least six responsibilities in one component (§1.2).
- `src/lib/spotify.ts` (656) — token exchange + artist search + track selection + playlist writes +
  batching utilities + tier policy in one module, from before the platform abstraction existed.
- `src/lib/music-platform/index.ts` (240) — is simultaneously the **factory** (`getMusicPlatform`),
  the **rate-limit policy** (`processBatch`, per-platform batch tuning at :152), the **track-count
  policy** (`getTrackCountForTier`), the **affinity policy** (`getSelectionModeForArtist`), and the
  **orchestrator** (`searchAndGetTopTracks`). Five reasons to change. Splitting into
  `factory.ts` / `policy.ts` / `orchestrator.ts` would be a low-risk, high-clarity win.
- `src/lib/auth.ts` (257) — cookie management for two platforms _plus_ dev-mode bypass wrappers
  (`isAuthenticatedOrDev` etc., :220–257). Production auth logic and dev tooling in one file.

### 2.2 Open/Closed — ❌ Weakest principle

Adding a third music platform requires editing **at least six existing files**, none of which should
need to know a platform was added:

| Location                      | What must change                                             |
| ----------------------------- | ------------------------------------------------------------ |
| `music-platform/index.ts:152` | `platform.platform === 'spotify' ? 3 : 5` batch-size ternary |
| `search-tracks.ts:130`        | `if (platform === 'apple-music')` → `setDeveloperToken`      |
| `create-playlist.ts:118`      | same developer-token branch                                  |
| `personalize.ts:97`           | same developer-token branch                                  |
| `auth/me.ts:67–83`            | `if spotify / else if apple-music` user fetch                |
| `auth.ts:120–135`             | hardcoded cookie-name → platform mapping                     |

Each of these is a place where the abstraction exists but the call site reaches past it. The
per-platform rate-limit tuning in particular belongs _on the adapter_ (a `rateLimit: {batchSize,
delayMs}` readonly member), not in a ternary in the shared orchestrator.

The same pattern repeats in image analysis: `analyze.ts:102–114` is an `if/else if/else` on
`IMAGE_ANALYSIS_PROVIDER`. There are three interchangeable providers with identical signatures and
**no interface** — the natural parallel to `MusicPlatformService` was never drawn. An
`ImageAnalyzer` interface + provider map would make `analyze.ts` closed to modification.

### 2.3 Liskov Substitution — ⚠️ Broken by the developer-token protocol

`MusicPlatformService` implementations are **not** substitutable:

- `AppleMusicPlatformService` requires `setDeveloperToken()` to be called before _any_ method, or
  every call throws (`apple-music-platform.ts:100`). That method is **not on the interface**, so
  three call sites downcast: `(platformService as AppleMusicPlatformService)`
  (`search-tracks.ts:132`, `create-playlist.ts:120`, `personalize.ts:98`). A downcast to make an
  interface work is the definition of an LSP break. Fix: fold credential setup into a factory
  (`getMusicPlatform(platform)` returns a fully-initialized instance) or add an `init()` to the
  interface.
- `getArtistTopTracks(limit)` has **different semantics per platform**: Spotify selects from a
  10-track pool, Apple Music from 25 (`apple-music-platform.ts:196`). A headliner asking for 10
  tracks gets Spotify's entire top-10 (no selection effect at all) vs. a sampled 10-of-25 on Apple.
  `selectionMode` therefore means something materially different depending on the platform.
- Error contracts differ: `AppleMusicPlatformService.createPlaylist` throws on an empty response
  body (:348); the Spotify one would throw a `TypeError` on `.external_urls` instead.

**Also a genuine concurrency hazard:** both adapters are exported as module-level singletons
(`apple-music-platform.ts:440`, `spotify-platform.ts:291`) and `AppleMusicPlatformService` holds
_mutable_ per-request state (`developerToken`). Two concurrent requests in one warm Lambda share the
instance. Today the token value is identical for all users so nothing breaks, but it's a
state-sharing bug waiting for the first per-user credential.

### 2.4 Interface Segregation — ⚠️ Fat interface with optional members

`MusicPlatformService` (`music-platform/types.ts:25`) has 7 members, **2 of them optional**:

- `uploadPlaylistCover?` — Spotify only; callers feature-detect (`create-playlist.ts:155`).
- `getLibraryArtists?` — Apple Music only; callers feature-detect (`personalize.ts:260`).

Optional interface members are ISP's classic smell: they push "does this implementation actually
support X?" onto every consumer. The interface's own doc-comment even instructs callers to guard on
presence. Cleaner: a narrow `MusicPlatformService` core plus capability interfaces
(`SupportsPlaylistCover`, `SupportsLibraryScan`) narrowed via type guards. Low priority — the
current version is honest and documented — but it's the reason `create-playlist.ts:155` reads as a
four-clause conditional.

### 2.5 Dependency Inversion — ⚠️ Good intent, incomplete execution

**Good:** `searchAndGetTopTracks` (`music-platform/index.ts:128`) and `personalizeLineup`
(`personalize.ts:241`) both depend on the `MusicPlatformService` _interface_, injected as a
parameter. `personalize.ts` is testable precisely because of this, and
`__tests__/affinity-selection.test.ts` exploits it with a hand-rolled fake — exactly the payoff DIP
is supposed to deliver.

**Violations:**

- API routes import the **concrete** legacy module: `auth/me.ts:8` and `create-playlist.ts:8` pull
  functions from `@/lib/spotify` directly, bypassing the abstraction they otherwise use in the same
  file. `create-playlist.ts` ends up using _both_ mechanisms — the adapter for
  `uploadPlaylistCover` (:163) and a direct import for `getPlaylistTracks` (:181), with a third,
  unused import of the legacy `uploadPlaylistCover` sitting on line 8.
- `personalize.ts:209` instantiates `GoogleGenerativeAI` directly — no `GemProvider` seam. Same in
  `gemini.ts` and `hybrid-analyzer.ts`. Consistent with the codebase's style, but it means the gem
  pass can only be tested through the parse/select boundary, never end-to-end.

---

## 3. Duplication & dead code

### 3.1 `src/lib/spotify.ts` — 4 of 11 exports live, ~370 LOC deletable

| Export                  | Production callers                                | Status                                                           |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `exchangeCodeForTokens` | `spotify/callback.ts:41`                          | **Live**                                                         |
| `getCurrentUser`        | `auth/me.ts:8`                                    | **Live**, but duplicates `SpotifyPlatformService.getCurrentUser` |
| `getPlaylistTracks`     | `create-playlist.ts:181` (debug-gated)            | **Live**                                                         |
| `uploadPlaylistCover`   | imported `create-playlist.ts:8`, **never called** | **Dead import + dead copy**                                      |
| `refreshAccessToken`    | **none**                                          | Dead — but see §5.1, it should be wired up, not deleted          |
| `searchArtist`          | none                                              | Dead                                                             |
| `getArtistTopTrack`     | none                                              | Dead (and calls a deleted Spotify endpoint)                      |
| `getArtistTopTracks`    | none                                              | Dead (deleted endpoint)                                          |
| `createPlaylist`        | none                                              | Dead (deleted endpoint)                                          |
| `addTracksToPlaylist`   | none                                              | Dead (renamed endpoint)                                          |
| `searchAndGetTopTracks` | none                                              | Dead — superseded by `music-platform/index.ts:128`               |

All seven dead exports are still exercised by `src/lib/__tests__/spotify.test.ts`, so the test suite
gives no signal that they're unreachable. **~370 of 656 lines can be deleted** once the live four are
relocated.

### 3.2 Copy-paste inventory

| Logic                                | Copies | Locations                                                                                |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| `levenshteinDistance` + `similarity` | **3**  | `artist-match.ts:43` (canonical, normalizing), `spotify-platform.ts:10`, `spotify.ts:60` |
| `selectTracksFromPool`               | **3**  | `spotify.ts:212`, `spotify-platform.ts:45`, `apple-music-platform.ts:32`                 |
| `processBatch` + `delay`             | **2**  | `music-platform/index.ts:33`, `spotify.ts:454`                                           |
| `getTrackCountForTier`               | **2**  | `music-platform/index.ts:62`, `spotify.ts:487`                                           |
| Cookie-clearing serialization        | **3**  | `auth.ts:85`, `auth.ts:160`, `apple-music-auth.ts:118`                                   |
| Developer-token setup block          | **3**  | `search-tracks.ts:130`, `create-playlist.ts:118`, `personalize.ts:97`                    |

The copies have already **diverged**, which is the cost being paid: `spotify.ts:246` shuffles with
`pool.sort(() => Math.random() - 0.5)` (statistically biased, and mutates the caller's array), while
the two adapters use correct Fisher-Yates. The `similarity` copies differ more seriously — only
`artist-match.ts` normalizes accents/`&`/`feat.` and guards the empty-string case, so the same two
artist names score differently depending on which platform is asked.

---

## 4. Other findings

### 4.1 Test files ship as production API routes — 🔴 High

No `pageExtensions` restriction in `next.config.js`, so `src/pages/api/**/__tests__/*.test.ts` are
compiled into routes. Confirmed in the build output and in `.next/server/pages/api/__tests__/`:

```
ƒ /api/__tests__/health.test
ƒ /api/__tests__/personalize.test
ƒ /api/auth/__tests__/apple-music-store-token.test
ƒ /api/auth/__tests__/me.test
```

They have no default export (so they 500 rather than do damage), but they are publicly routable and
drag `msw`/`vitest` into the serverless bundle — `personalize.test.js.nft.json` traces 52 KB of
dependencies. Fix: set `pageExtensions`, or move these four files under `src/lib/__tests__/api/`
where the rest already live.

### 4.2 No token refresh — 🟠 Medium

`refreshAccessToken` (`spotify.ts:30`) and `getRefreshToken` (`auth.ts:70`) have **zero production
callers**. The refresh token is persisted for 30 days (`spotify/callback.ts:57`) and never used, so
sessions die when the ~1h access token expires and the user must re-authenticate. Independent of the
Feb-2026 API changes.

### 4.3 Temp-file leak on the error path — 🟠 Medium

`analyze.ts` unlinks the formidable temp file on success (:117) and on validation failure (:62), but
**not** in the `catch` (:172). Any OCR/Gemini failure leaks the uploaded image. Bounded on Vercel;
unbounded on a long-running local dev server.

### 4.4 Inconsistent rate-limit ordering — 🟡 Low

`search-tracks.ts:41`, `personalize.ts:52`, and `preview-cover.ts:29` all deliberately rate-limit
_after_ the auth check, each with a comment explaining that anonymous traffic shouldn't burn real
users' slots. `create-playlist.ts:41` does it **before**. Looks like the one that was missed.

### 4.5 Test coverage is structurally uneven — 🟡 Low

23 test files, 3,125 LOC, all targeting `src/lib` and `src/pages/api`. **Zero component or page
tests** — the four largest, most stateful client files (`review-tracks.tsx` 828,
`review-artists.tsx` 538, `upload.tsx` 410, `AuthContext.tsx` 254) are entirely untested despite
carrying the trickiest logic in the app (personalize merge-by-name, race-token guards, Strict-Mode
double-fire handling). `@testing-library/react` is already installed. Coverage thresholds in
`vitest.config.ts` are set to 8–10%, which is effectively a no-op gate.

### 4.6 Documentation drift — 🟡 Low

- `CLAUDE.md` "MVP Constraints" still lists **Apple Music** under _"Intentionally NOT Included"_,
  though it's the only working platform.
- `CLAUDE.md`'s Data Flow section describes the old two-step Spotify-only path — no
  `review-artists` → `review-tracks` stages, no personalization.
- `.env.example` uses `localhost:3000` for `SPOTIFY_REDIRECT_URI`/`NEXTAUTH_URL` while `CLAUDE.md`
  states `127.0.0.1` is mandatory; the two also disagree on the callback path
  (`/api/auth/spotify/callback` vs `/api/auth/callback`).

### 4.7 Stale session state — 🟡 Low

`success.tsx:34` clears `tracks`, `posterThumbnail`, and `eventName`, but not `artists` or
`analysisProvider`, so a previous run's lineup survives into the next session.

---

## 5. Prioritized recommendations

### Now (correctness / deployment hygiene)

1. **Stop shipping test files as API routes** (§4.1) — one-line `pageExtensions` change or move four
   files.
2. **Wire up token refresh** (§4.2) — required for any Spotify work to feel usable.
3. **Unlink the temp file in `analyze.ts`'s catch block** (§4.3) — three lines.
4. **Delete the unused `uploadPlaylistCover` import** at `create-playlist.ts:8` and move the rate
   limit below the auth check (§4.4).

### Next (paying down the largest structural debt)

5. **Retire `src/lib/spotify.ts`** (§3.1) — move `exchangeCodeForTokens` + `refreshAccessToken` into
   `spotify-platform.ts` (or a small `spotify-oauth.ts`), fold `getCurrentUser`/`getPlaylistTracks`
   into the adapter, delete the remaining ~370 lines and the tests that only cover dead code.
   Natural to do _with_ the Feb-2026 endpoint migration.
6. **Close the platform abstraction** (§2.2, §2.3) — move the developer-token setup into
   `getMusicPlatform()` so the three downcasts disappear, and move rate-limit tuning onto the adapter
   as a readonly member. Removes 4 of the 6 "edit me to add a platform" sites.
7. **Split `review-tracks.tsx`** (§1.2) — extract a `useReviewTracks` hook for the session-storage
   hydration + create-playlist call, and lift the cover-preview panel into its own component. Target
   ≤ 300 LOC for the page.
8. **Deduplicate `selectTracksFromPool`** into `music-platform/track-selection.ts` (§3.2) — one
   correct Fisher-Yates implementation, one place to reason about `deep-cuts` semantics.

### Later (design polish, only if the app grows)

9. Introduce an `ImageAnalyzer` interface so `analyze.ts` stops branching on an env string (§2.2).
10. Split `music-platform/index.ts` into factory / policy / orchestrator (§2.1).
11. Add component tests for the four untested client files and raise the coverage floor above no-op
    (§4.5).
12. Segregate `MusicPlatformService`'s optional members into capability interfaces (§2.4).

---

## 6. What this codebase does well

Worth stating plainly, because the sections above are by construction a list of problems:

- **The validation layer is excellent.** `validation.ts` uses Zod's strip-unknown-keys behaviour as a
  deliberate security control (`personalizeSchema` drops client-supplied affinity so the server stays
  the sole authority), and the _reason_ is written down at the schema.
- **`personalize.ts` is the strongest module in the repo.** Untrusted LLM output is allowlisted
  against the submitted lineup, confidence-gated, deduped, capped, control-character-stripped before
  reaching the DOM, and degrades to partial success at every sub-step rather than throwing.
- **The Apple Music library scan** (`apple-music-platform.ts:258`) refuses to follow a pagination URL
  that isn't Apple's origin — a real token-exfiltration vector, anticipated and closed.
- **Error hygiene:** `errMessage()` exists specifically because a raw axios error carries bearer
  tokens in `config.headers` that `util.inspect` would print into production logs.
- **API routes are uniformly thin and consistent** — 79 LOC mean, same validate → delegate → map
  shape everywhere.
- **Comments explain _why_, not _what_** — thresholds, rate-limit constants, and degradation
  decisions all carry their rationale, several with the review date that settled them. This is rare
  and it made auditing this codebase substantially faster.
