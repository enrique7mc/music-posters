# Tutorial: See your lineup personalized (loved + hidden gems)

In this tutorial you will get the **"Personalized for you"** header — the loved
artists and hidden gems — onto your screen and understand what produced it. You
will use dev mode, so you need **no Apple Music account and no Gemini key**. By
the end you will know where personalization fires, what it returns, and how to
switch to the real engine.

Expect about 10 minutes.

## What you'll need

- The app cloned and dependencies installed (`npm install`).
- A `.env` file (copy from `.env.example` if you have not already:
  `cp .env.example .env`). The default values are fine for this tutorial.
- Any festival poster image on disk (a screenshot works; or save a "Coachella
  poster" from an image search).

You do **not** need real credentials — dev mode mocks every external call.

## Step 1: Turn on dev mode

Open `.env` and set:

```env
DEV_MODE=true
```

Start the dev server:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. You now see the landing page with a platform
selector and, because `DEV_MODE=true`, a small floating **dev panel** in the
corner. That panel is your control room for the rest of the tutorial.

## Step 2: Become an Apple Music user (without logging in)

Personalization only runs for Apple Music users, so tell dev mode to pretend you
are one. In the dev panel:

1. Toggle **skipAuth** on. (This auto-enables `mockTrackSearch` and
   `dryRunPlaylist`, so no fake token ever reaches a real API.)
2. Set **fakePlatform** to `apple-music`.
3. Set **mockDelayMs** to about `1500`, so the "Personalizing…" state is visible
   instead of instant.

You are now an authenticated Apple Music user as far as the app is concerned. No
real OAuth happened.

## Step 3: Upload a poster and watch personalization fire

1. Navigate to the upload screen (`http://127.0.0.1:3000/upload`).
2. Choose your poster image and continue. With mocks on, analysis returns a
   sample lineup immediately.
3. You land on **Review Artists**. Within ~1.5 seconds (your `mockDelayMs`) you
   see this sequence:
   - first a quiet card: **"Personalizing your lineup…"**
   - then it resolves into **"Personalized for you — N you already love · M hidden
     gems"**, with heart-tagged loved chips and gem cards showing a `% match` and
     a one-line reason.

That header is the whole feature. You just watched
`review-artists.tsx` fire one `POST /api/personalize` on mount, and
`PersonalizationHeader.tsx` render the result.

Open your browser's network tab and click the `personalize` request. The response
body is the lineup with `affinity`, `affinityConfidence`, and `affinityReason`
fields merged in, plus `lovedCount`, `gemCount`, and `degraded: false`. In dev
mode those tags came from `mockPersonalize()` in `src/lib/mock-data.ts`.

## Step 4: Confirm the affinity actually changes the playlist

The header is informational — there are no toggles. Affinity quietly changes which
tracks get picked downstream: **loved → deep cuts, gem → popular tracks.**

Click **"Search Tracks & Continue"** (notice it was disabled while
"Personalizing…" was on screen — the app refuses to continue with untagged
artists). With `mockTrackSearch` on you get mock tracks, but the routing logic
still runs. In the dev-server console you can see lines like:

```
Fetching N tracks for <Artist> (tier: headliner, affinity: loved → deep-cuts)
Fetching N tracks for <Artist> (tier: mid-tier, affinity: gem → popular)
```

That mapping lives in `getSelectionModeForArtist()`
(`src/lib/music-platform/index.ts`).

## What you built

You drove the personalization feature end to end without any real accounts:

- saw **where** it fires (once, on the review screen, Apple Music only),
- saw **what** it returns (a lineup annotated with `affinity` fields, plus loved
  and gem counts),
- saw **what it changes** (per-artist track selection downstream).

### Switch to the real engine

To run the actual library scan and Gemini gems instead of mocks:

1. Turn `DEV_MODE=false` (or just turn skipAuth off in the panel).
2. Add the Apple Music credentials and `GEMINI_API_KEY` to `.env` (see
   [../SETUP.md](../SETUP.md)).
3. Connect Apple Music for real and upload a poster that overlaps your library.

The exact same screen now shows _your_ loved artists and gems picked for _your_
taste. The step-by-step is in
[howto-personalization.md](./howto-personalization.md#test-with-a-real-apple-music-account).

### Go deeper

- [reference-personalization.md](./reference-personalization.md) — the full API,
  types, and every tunable constant.
- [explanation-personalization.md](./explanation-personalization.md) — why loved
  is a name-match, why Gemini (not a graph) finds gems, and how untrusted model
  output is contained.
