# How to enable, test, and tune personalization

Task recipes for the loved + hidden gems feature. Assumes the app already runs
locally — see [../SETUP.md](../SETUP.md) for first-time setup. For the contract
and the design rationale, see
[reference-personalization.md](./reference-personalization.md) and
[explanation-personalization.md](./explanation-personalization.md).

---

## How to enable personalization

Personalization runs automatically on the review-artists screen when **all** of
these hold:

1. The user is signed in with **Apple Music** (it is the only platform with a
   readable library).
2. `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, and `APPLE_MUSIC_PRIVATE_KEY` are
   set (the library scan and developer token need them).
3. `GEMINI_API_KEY` is set (gems only — loved still works without it).

### Steps

1. Add the credentials to `.env`:

   ```env
   APPLE_MUSIC_TEAM_ID=your_apple_team_id
   APPLE_MUSIC_KEY_ID=your_apple_music_key_id
   APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   GEMINI_API_KEY=your_gemini_api_key
   ```

2. Restart the dev server (env vars are read at startup, not hot-reloaded):

   ```bash
   npm run dev
   ```

3. Open the app at `http://127.0.0.1:3000`, connect **Apple Music**, upload a
   poster, and continue to the review screen.

### Verification

On the review-artists screen you should see, within ~10 seconds, a "Personalizing
your lineup…" card that resolves into a **"Personalized for you"** header reading
something like _"8 you already love · 5 hidden gems"_. The browser network tab
shows one `POST /api/personalize` returning `200` with `lovedCount` / `gemCount`.

---

## Test without an Apple account (dev mode)

You do not need a real Apple Music library or a Gemini key to exercise the UI. Dev
mode fabricates loved/gem tags with no external calls.

### Steps

1. In `.env`:

   ```env
   DEV_MODE=true
   ```

2. Restart: `npm run dev`.
3. Open the floating **dev panel**, enable **skipAuth** (auto-enables
   `mockTrackSearch` and `dryRunPlaylist`) and set **fakePlatform** to
   `apple-music`. Optionally raise **mockDelayMs** to feel the "Personalizing…"
   state.
4. Upload any poster and continue to the review screen.

### Verification

The personalization header renders from `mockPersonalize()`
(`src/lib/mock-data.ts`) — loved chips and gem cards appear with no real library
scan or Gemini call. This is the fastest way to iterate on
`PersonalizationHeader.tsx`.

> Dev mode is blocked when `NODE_ENV=production`, so it is safe to leave
> `DEV_MODE=true` in a local `.env`.

---

## Test with a real Apple Music account

The library scan and Gemini gems only run against a real Music User Token.

### Steps

1. Ensure the four credentials above are set and `DEV_MODE` is `false` (or skipAuth
   off).
2. Connect Apple Music in the browser. MusicKit prompts for authorization and the
   token is stored in an httpOnly cookie by `POST /api/auth/apple-music/store-token`.
3. Upload a poster whose lineup overlaps your library (otherwise there are no loved
   seeds and gems are skipped by design).
4. Watch the dev-server console for the engine logs.

### Verification

The server logs show the scan and the result, for example:

```
[Apple Music] Library scan: 304 artists across 4 pages (complete: true)
[Personalize API] apple-music: 8 loved, 5 gems
```

If `lovedCount` is 0, the gem pass is skipped (nothing to seed from) — pick a
poster with artists you actually follow.

> **Token gotcha:** `store-token` returns `403 Invalid origin` unless the browser
> host matches `NEXTAUTH_URL`'s host. Use `127.0.0.1`, not `localhost`. MusicKit
> still returns the token regardless, so in a pinch you can grab it from the
> console: `await window.MusicKit.getInstance().authorize().then(t => copy(t))`.

---

## How to tune the matching thresholds

All thresholds live as named constants — change them at the source and restart.

| Want to…                            | Change                                   | In                                               |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Be stricter/looser about "loved"    | `LOVED_MATCH_THRESHOLD` (default `0.85`) | `src/lib/artist-match.ts`                        |
| Accept lower-confidence gems        | `GEM_MIN_CONFIDENCE` (default `0.5`)     | `src/lib/personalize.ts`                         |
| Surface more/fewer gems             | `GEM_MAX_COUNT` (default `12`)           | `src/lib/personalize.ts`                         |
| Seed Gemini with more loved artists | `GEM_SEED_CAP` (default `8`)             | `src/lib/personalize.ts`                         |
| Scan larger libraries               | `MAX_LIBRARY_PAGES` (default `50`)       | `src/lib/music-platform/apple-music-platform.ts` |

> Lowering `LOVED_MATCH_THRESHOLD` raises the risk of a false "loved", which is the
> feature's worst failure mode (see
> [explanation-personalization.md](./explanation-personalization.md#loved-is-a-name-match-problem-not-a-similarity-problem)).
> The spike validated `0.85`; move it down only with fresh evidence.

After changing a threshold, run the unit tests that cover it:

```bash
npm run test:run -- artist-match personalize affinity-selection
```

---

## How to change how affinity affects track selection

The mapping from affinity to track-selection mode is one function:

```typescript
// src/lib/music-platform/index.ts
export function getSelectionModeForArtist(artist, globalMode) {
  switch (artist.affinity) {
    case 'loved':
      return 'deep-cuts'; // they know the hits
    case 'gem':
      return 'popular'; // gateway hit for a discovery
    default:
      return globalMode; // untagged → the user's global choice
  }
}
```

Edit the cases to change behavior. The regression test in
`src/lib/music-platform/__tests__/affinity-selection.test.ts` pins the current
mapping (including that untagged artists keep the global mode) — update it
deliberately if you change the rules.

---

## Troubleshooting

### The personalization header never appears

- **Not on Apple Music.** The feature only runs for Apple Music. The header is
  hidden on Spotify (and `degraded: true` is returned).
- **No loved overlap.** If 0 lineup artists are in your library, gems are skipped
  and (if there are also no loved) the header hides itself. Try a poster with
  artists you follow.
- **`degraded: true`.** Check the server console for a scan or Gemini error. The
  client hides the header whenever the response is degraded.

### Loved chips show but no gems

- **`GEMINI_API_KEY` not set** → the engine logs
  `GEMINI_API_KEY not set — skipping gems` and returns loved-only. Add the key.
- **Incomplete library scan.** If the scan logged `complete: false` (a page error
  or the 50-page ceiling), the gem pass is skipped on purpose so a half-scanned
  library cannot mislabel a loved artist as a gem. Large libraries may need a
  higher `MAX_LIBRARY_PAGES`.
- **Gemini found nothing strong.** A parsed-but-empty Gemini reply is a legitimate
  "no strong matches" and is not retried. The header simply shows loved only.

### Wrong / surprising "loved" tags

- Inspect `affinityConfidence` in the `POST /api/personalize` response. Anything
  ≥ `0.85` matched. If a clearly-wrong artist matched, the offender is usually
  short or generic after normalization — consider raising the threshold and
  re-running the matching tests.

### `403 Invalid origin` when connecting Apple Music

- The browser host must equal `NEXTAUTH_URL`'s host. Use `127.0.0.1:3000`, and set
  `NEXTAUTH_URL=http://127.0.0.1:3000`. See the token gotcha above.

### `POST /api/personalize` returns `401`

- Not authenticated, or the requested `platform` disagrees with the authenticated
  one. Re-connect Apple Music; do not send a `platform` that differs from your
  login.

### The request is slow / times out near 30s

- The route's `maxDuration` is 30s. A very large library plus Gemini can approach
  it; the per-page (8s) and per-Gemini-attempt (12s) timeouts bound individual
  calls so one hung call can't ride to the kill. If you routinely hit the wall,
  lower `MAX_LIBRARY_PAGES` or `GEM_SEED_CAP`.

---

## Related

- [reference-personalization.md](./reference-personalization.md) — every constant
  and the endpoint contract.
- [explanation-personalization.md](./explanation-personalization.md) — why these
  defaults were chosen.
- [tutorial-personalization.md](./tutorial-personalization.md) — a guided first
  run.
