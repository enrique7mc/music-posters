# Reference: User-Aware Recommendations (loved + hidden gems)

Complete technical reference for the personalization feature shipped in v0.2.0.
Personalization tags a poster lineup with the signed-in user's taste relationship
to each artist:

- **loved** — the lineup artist is already in the user's library (deterministic
  fuzzy name match).
- **gem** — the user does not know them yet, but they are a likely taste match
  (surfaced by Gemini, seeded from the loved set).

Personalization is **Apple Music only** — it is the platform that exposes a user
library. On every other platform the lineup comes back untagged.

For the _why_ behind these choices, see
[explanation-personalization.md](./explanation-personalization.md). For setup and
local testing, see [howto-personalization.md](./howto-personalization.md).

---

## Data types

### `Affinity`

```typescript
// src/types/index.ts
export type Affinity = 'loved' | 'gem';
```

The user-taste tag. Populated only by `POST /api/personalize`. Prefixed fields
(below) avoid colliding with the existing `reasoning` field, which explains an
artist's visual-prominence weight.

### `Artist` (affinity fields)

```typescript
// src/types/index.ts
export interface Artist {
  name: string;
  weight?: number; // 1-10 visual-prominence score (Gemini/Hybrid)
  tier?: 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard';
  reasoning?: string; // why this weight was assigned
  spotifyId?: string;
  affinity?: Affinity; // 'loved' | 'gem'; undefined = untagged
  affinityConfidence?: number; // 0-1 match/recommendation confidence
  affinityReason?: string; // gem rationale, or how a loved match was made
  affinityLinkedTo?: string[]; // loved/seed names a gem was linked to
}
```

| Field                | Set for `loved`               | Set for `gem`                                       |
| -------------------- | ----------------------------- | --------------------------------------------------- |
| `affinity`           | `'loved'`                     | `'gem'`                                             |
| `affinityConfidence` | the match similarity (≥ 0.85) | Gemini confidence (≥ 0.5, clamped to `[0,1]`)       |
| `affinityReason`     | `'Already in your library'`   | Gemini's one-phrase reason (sanitized, ≤ 200 chars) |
| `affinityLinkedTo`   | _unset_                       | up to 3 loved seed names ("for fans of …")          |

### `PersonalizeResponse`

```typescript
// src/types/index.ts
export interface PersonalizeResponse {
  artists: Artist[]; // input lineup with affinity fields merged in
  lovedCount: number;
  gemCount: number;
  degraded: boolean; // true if a sub-step failed; client hides the loved/gems UI
}
```

`PersonalizeResult` (in `src/lib/personalize.ts`) is the same shape, returned by
the engine; the API route serializes it directly.

---

## HTTP API: `POST /api/personalize`

Tags a lineup against the authenticated user's library. Returns one annotated flat
`Artist[]` — the client renders the lineup instantly and merges the affinity
fields when this single (~10s) response lands.

- **File:** `src/pages/api/personalize.ts`
- **Method:** `POST` (anything else → `405`)
- **Auth:** required — platform cookie set by login (`401` if missing)
- **Rate limit:** `RateLimitPresets.moderate()`, applied after the auth check
- **`maxDuration`:** `30` seconds (Vercel function config; the scan + Gemini pass
  can take ~10s, library scans longer)

### Request body

```jsonc
{
  "artists": [
    { "name": "Pulp", "tier": "headliner", "weight": 9 },
    { "name": "Kaiser Chiefs", "tier": "mid-tier" },
  ],
  "platform": "apple-music", // optional; defaults to the authenticated platform
}
```

Validated by `personalizeSchema` (`src/lib/validation.ts`), which:

- requires `1..MAX_ARTISTS_PER_SEARCH` artists,
- caps each `name` at 100 chars (trimmed, non-empty),
- **strips any client-supplied affinity metadata.** Zod drops unrecognized keys,
  so `affinity`, `affinityConfidence`, `affinityReason`, and `affinityLinkedTo`
  in the request are discarded. The server is the sole authority on affinity.

If `platform` is present and disagrees with the authenticated platform, the route
returns `401` ("Authenticated with X. Please log in to Y.").

### Response `200`

```jsonc
{
  "artists": [
    {
      "name": "Pulp",
      "tier": "headliner",
      "affinity": "loved",
      "affinityConfidence": 1,
      "affinityReason": "Already in your library",
    },
    {
      "name": "Kaiser Chiefs",
      "tier": "mid-tier",
      "affinity": "gem",
      "affinityConfidence": 0.85,
      "affinityReason": "Brit-pop energy in the same lane as Pulp",
      "affinityLinkedTo": ["Pulp"],
    },
  ],
  "lovedCount": 1,
  "gemCount": 1,
  "degraded": false,
}
```

The route **never 500s the user out of their lineup.** On any unexpected error it
returns `200` with the plain lineup and `degraded: true`.

### Status codes

| Code  | Meaning                                                              |
| ----- | -------------------------------------------------------------------- |
| `200` | Success (possibly `degraded: true` — see below)                      |
| `400` | Request failed `personalizeSchema` validation (`{ error, details }`) |
| `401` | Not authenticated, or requested platform ≠ authenticated platform    |
| `405` | Method not `POST`                                                    |
| `429` | Rate limit exceeded (moderate preset)                                |

### `degraded: true` cases

The client hides the loved/gems header whenever `degraded` is true. It is set when:

- the platform exposes no library (`getLibraryArtists` absent — e.g. Spotify),
- the library scan threw or was truncated (`complete === false`),
- the developer-token generation or another unexpected error was caught.

A `degraded` response can still carry real `loved` tags (matches found before a
later failure), but the gem pass is skipped so a half-scanned library cannot
mislabel a genuinely-loved artist as an unknown "gem".

### Dev-mode mock

When dev mode is available and `mockTrackSearch` is on, the route returns
`mockPersonalize(artists)` (`src/lib/mock-data.ts`) with no external calls,
honoring `mockDelayMs` so you can feel the "Personalizing…" state. See
[howto-personalization.md](./howto-personalization.md#test-without-an-apple-account-dev-mode).

---

## Engine: `src/lib/personalize.ts`

### `personalizeLineup(lineup, platform, userToken)`

```typescript
async function personalizeLineup(
  lineup: Artist[],
  platform: MusicPlatformService,
  userToken: string
): Promise<PersonalizeResult>;
```

Returns a **copy** of the lineup with affinity fields merged in (the input is
untouched). Steps:

1. Index lineup artists by name → **all** artists with that name (a lineup can
   repeat a name; every duplicate is tagged identically).
2. If `platform.getLibraryArtists` is absent → return the plain lineup,
   `degraded: true`.
3. Scan the library; on throw or `complete === false`, mark `degraded` and skip
   gems.
4. `matchLineup(lineupNames, lovedNames, LOVED_MATCH_THRESHOLD)` → tag `loved`.
5. If there are no loved seeds, no unknowns, or the scan was incomplete → return
   loved-only.
6. Seed Gemini with up to `GEM_SEED_CAP` loved names → `requestGems` →
   `selectGems` → tag `gem`.
7. Recount `lovedCount`/`gemCount` from the **tagged artists** (not the match-list
   lengths), so counts stay in lockstep with the rendered chips.

### `selectGems(rawGems, unknownLineup, opts?)`

```typescript
function selectGems(
  rawGems: RawGem[],
  unknownLineup: string[],
  opts?: { minConfidence?: number; maxCount?: number; matchThreshold?: number }
): SelectedGem[];
```

Pure (no I/O), so the entire hardening surface is unit-testable. Turns untrusted
Gemini output into sanitized, lineup-anchored gems:

- **allowlist** — a gem survives only if its name maps (≥ `matchThreshold`,
  default `0.85`) to a submitted **unknown** lineup name. Gemini cannot invent
  artists or re-tag a loved one.
- **strip** — only `name`, `confidence`, `reason` are read; other fields ignored.
- **confidence gate + clamp** — drop below `minConfidence` (default `0.5`); clamp
  to `[0,1]`; non-finite → `0`.
- **reason sanitize** — collapse whitespace, strip control / zero-width /
  bidi-override characters, cap at `GEM_REASON_MAX_LEN` (200).
- **dedupe** by mapped lineup name, keeping the highest confidence.
- **sort** by confidence desc, **cap** at `maxCount` (default `12`).

### `buildGemsPrompt(seedNames, unknownLineup)` → `string`

Builds the Gemini prompt. Exported for prompt evaluation. Asks for
`{"gems":[{"name,confidence,reason}]}` ordered by confidence, "omit weak ones
rather than padding".

### `parseGemsResponse(responseText)` → `RawGem[]`

Extracts a gems array from a possibly-fenced, possibly-noisy Gemini reply.
**Never throws** — returns `[]` on any parse failure (so callers degrade to
loved-only rather than 500). Handles a bare array, a `{gems:[...]}` object, and
JSON embedded in surrounding prose.

### `requestGems(seedNames, unknownLineup)` → `Promise<RawGem[]>` (internal)

Calls Gemini with retry + backoff. Returns `[]` (never throws) when
`GEMINI_API_KEY` is unset, on network failure, or on non-JSON. A parsed-but-empty
result is a legitimate "no strong matches" and is **not** retried.

---

## Matching primitives: `src/lib/artist-match.ts`

Shared by two call sites that keep **different thresholds** because the cost of a
wrong match differs.

| Constant                  | Value  | Used by                                      |
| ------------------------- | ------ | -------------------------------------------- |
| `LOVED_MATCH_THRESHOLD`   | `0.85` | loved-overlap (a false "loved" breaks trust) |
| `CATALOG_MATCH_THRESHOLD` | `0.6`  | catalog search (recall-oriented)             |

### `normalize(s)` → `string`

Lowercase → NFD → strip combining accents → `&` becomes `and` → drop a `feat.`
tail → strip non-`[a-z0-9 ]` → collapse whitespace → trim.

### `similarity(a, b)` → `number`

Normalizes both sides, then `1 - editDistance(longer, shorter) / longer.length`.
`1.0` = identical. If either side normalizes to `""` (e.g. `"&"`, `"feat."`,
emoji-only) the score is `0` — never a false `1.0`.

### `matchLineup(lineup, lovedNames, threshold = 0.85)` → `MatchLineupResult`

```typescript
interface LineupMatch {
  poster: string;
  matched: string;
  similarity: number;
}
interface MatchLineupResult {
  loved: LineupMatch[];
  unknown: string[];
}
```

For each lineup name, finds its best match in `lovedNames`; ≥ threshold → `loved`,
else → `unknown` (the gem-candidate pool).

---

## Library scan: `AppleMusicPlatformService.getLibraryArtists`

```typescript
// src/lib/music-platform/apple-music-platform.ts
async getLibraryArtists(token: string): Promise<{ artists: string[]; complete: boolean }>
```

Scans the user's full library of artists (the "loved" set). Requires the Music
User Token. Optional on `MusicPlatformService` — callers must guard on its
presence.

| Constant                   | Value  | Purpose                                                       |
| -------------------------- | ------ | ------------------------------------------------------------- |
| `LIBRARY_PAGE_LIMIT`       | `100`  | Apple's max page size for library endpoints                   |
| `MAX_LIBRARY_PAGES`        | `50`   | hard ceiling (~5000 artists) protecting the 30s budget        |
| `LIBRARY_PAGE_THROTTLE_MS` | `50`   | inter-page delay to stay under rate limits                    |
| `LIBRARY_PAGE_TIMEOUT_MS`  | `8000` | per-page deadline so one slow page can't ride to the 30s kill |

Behavior:

- Pages via Apple's `next` cursor, **prepending the origin only** (`next` is an
  absolute `/v1/...` path; prepending the base URL would yield a broken `/v1/v1`).
- **Refuses any `next` URL whose origin is not `https://api.music.apple.com`** —
  the request carries the developer bearer + Music-User-Token, so a malformed or
  compromised `next` must never exfiltrate them. Such a page stops the scan with
  `complete: false`.
- **Partial success:** on a page error, returns what was collected with
  `complete: false` (never throws).
- Hitting `MAX_LIBRARY_PAGES` with pages remaining also sets `complete: false`.

`complete: false` propagates to `degraded: true` and skips the gem pass.

---

## Affinity → track selection (downstream)

After review, `POST /api/search-tracks` derives each artist's track-selection mode
from its affinity tag. There are **no UI toggles** for this — it auto-derives.

### `getSelectionModeForArtist(artist, globalMode)`

```typescript
// src/lib/music-platform/index.ts
function getSelectionModeForArtist(
  artist: Artist,
  globalMode: TrackSelectionMode
): TrackSelectionMode;
```

| `affinity` | Selection mode                     | Rationale                                   |
| ---------- | ---------------------------------- | ------------------------------------------- |
| `'loved'`  | `'deep-cuts'`                      | the user knows the hits; reach deeper       |
| `'gem'`    | `'popular'`                        | a discovery deserves its gateway hit        |
| _untagged_ | `globalMode` (default `'popular'`) | unchanged — preserves non-personalized runs |

`TrackSelectionMode = 'popular' | 'balanced' | 'deep-cuts'`. The pool is built in
`selectTracksFromPool` (Apple Music): `popular` = top ~50% of top-songs,
`deep-cuts` = skip the first ~20%, `balanced` = full pool — then a Fisher–Yates
shuffle picks `limit` tracks.

> `searchArtistSchema` (search-tracks) **accepts** the `affinity` tag because it
> needs it for this mapping, while `personalizeSchema` **strips** it. Only the tag
> crosses the wire to search-tracks; the display fields are not needed there.

---

## Tunable constants (quick index)

| Constant                  | Value   | File                      | Meaning                                       |
| ------------------------- | ------- | ------------------------- | --------------------------------------------- |
| `LOVED_MATCH_THRESHOLD`   | `0.85`  | `artist-match.ts`         | min similarity to count as loved              |
| `CATALOG_MATCH_THRESHOLD` | `0.6`   | `artist-match.ts`         | min similarity for catalog search             |
| `GEM_MATCH_THRESHOLD`     | `0.85`  | `personalize.ts`          | gem name must map this close to a lineup name |
| `GEM_MIN_CONFIDENCE`      | `0.5`   | `personalize.ts`          | drop low-confidence gems                      |
| `GEM_MAX_COUNT`           | `12`    | `personalize.ts`          | cap surfaced gems                             |
| `GEM_SEED_CAP`            | `8`     | `personalize.ts`          | loved artists used to seed Gemini             |
| `GEM_LINKED_CAP`          | `3`     | `personalize.ts`          | loved seeds surfaced per gem                  |
| `GEM_REASON_MAX_LEN`      | `200`   | `personalize.ts`          | cap untrusted reason text                     |
| `GEMINI_MAX_ATTEMPTS`     | `3`     | `personalize.ts`          | Gemini retries                                |
| `GEMINI_TIMEOUT_MS`       | `12000` | `personalize.ts`          | per-attempt Gemini deadline                   |
| `MAX_LIBRARY_PAGES`       | `50`    | `apple-music-platform.ts` | library scan page ceiling                     |

---

## Environment variables

Personalization needs the Apple Music credentials (for the library scan) and the
Gemini key (for gems):

| Variable                  | Required for                  | Notes                                            |
| ------------------------- | ----------------------------- | ------------------------------------------------ |
| `APPLE_MUSIC_TEAM_ID`     | library scan, developer token | Apple Developer Team ID                          |
| `APPLE_MUSIC_KEY_ID`      | library scan, developer token | MusicKit private key ID                          |
| `APPLE_MUSIC_PRIVATE_KEY` | library scan, developer token | PEM, `\n`-escaped in env                         |
| `GEMINI_API_KEY`          | gems                          | from https://ai.google.dev; missing → loved-only |

Without `GEMINI_API_KEY` the feature degrades cleanly to loved-only (no gems, no
cost). See [SETUP.md](../SETUP.md) for how to obtain each credential.

---

## Related

- [explanation-personalization.md](./explanation-personalization.md) — why the
  design works this way (name-match vs similarity, Gemini vs graph, hardening).
- [howto-personalization.md](./howto-personalization.md) — enable, test, tune,
  and debug personalization.
- [tutorial-personalization.md](./tutorial-personalization.md) — see the loved +
  gems header on screen in a few minutes.
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — where personalization sits in the app.
- [../CHANGELOG.md](../CHANGELOG.md) — the v0.2.0 entry.
