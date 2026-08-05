# Music Posters - Setup Guide

This guide walks you through setting up Music Posters (Playlistd) from scratch.

> **Which platform should I set up?** The **Spotify path is currently broken** by
> Spotify's February 2026 Web API changes (Development Mode now requires the app
> owner's Premium, plus removed endpoints). **Apple Music is the working
> platform.** If you only want a working app, set up **Apple Music + Gemini** and
> skip the Spotify steps. See [CLAUDE.md → Known Limitations](CLAUDE.md).

## What you need

Pick based on what you want to run:

| Goal                       | Required                                             |
| -------------------------- | ---------------------------------------------------- |
| Working app (recommended)  | Node.js 18+, Apple Developer account, Gemini API key |
| Spotify (currently broken) | Node.js 18+, Spotify account, Google Cloud account   |
| Best image analysis        | add Google Cloud Vision (for `hybrid` mode)          |

Image analysis is chosen with `IMAGE_ANALYSIS_PROVIDER`:

- `hybrid` (recommended) — Vision OCR + Gemini ranking. Needs **both** Vision and
  Gemini credentials.
- `gemini` — Gemini vision only. Needs `GEMINI_API_KEY`.
- `vision` — OCR only, no ranking. Needs Google Cloud Vision.

`GEMINI_API_KEY` is also what powers the **hidden gems** in personalization, so
setting up Gemini is recommended regardless.

## 1. Install Dependencies

```bash
npm install
```

## 1b. Run with no credentials at all (fastest path)

If you just want the app running — to work on the UI, or because Spotify is blocked
and you don't have a paid Apple Developer membership — you need **no credentials**:

```env
DEV_MODE=true
```

Then `npm run dev` and open **http://127.0.0.1:3000**. A floating dev panel appears;
toggle **skipAuth** (which auto-enables `dryRunPlaylist` + `mockTrackSearch`, so a
fake token can never reach a real API) and **mockAnalysis**. The full
upload → review-artists → review-tracks → success flow runs against mock data with
no external calls.

Add `GEMINI_API_KEY` + `IMAGE_ANALYSIS_PROVIDER=gemini` (§3) and switch
`mockAnalysis` off to analyze real posters — that still needs no music platform.

> The dev endpoints are localhost-only, and env vars are read at process start:
> restart `npm run dev` after editing `.env`.

## 2. Set Up Apple Music (recommended — the working platform)

Apple Music needs three credentials from the
[Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
(requires a paid Apple Developer membership).

### 2.1 Create a MusicKit key

1. Go to **Certificates, Identifiers & Profiles → Keys**.
2. Create a new key, enable **MusicKit**, and download the `.p8` private key file
   (you can only download it once).
3. Note the **Key ID** (shown next to the key).
4. Note your **Team ID** (top-right of the developer account, or under Membership).

### 2.2 Add the credentials to `.env`

```env
APPLE_MUSIC_TEAM_ID=your_apple_team_id
APPLE_MUSIC_KEY_ID=your_apple_music_key_id
# Paste the full PEM contents of the .p8 file, with literal \n for newlines:
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
```

The server signs a short-lived **developer token** (ES256 JWT) from these. The
**Music User Token** is obtained in the browser via MusicKit JS when the user
connects, and stored in an httpOnly cookie — no extra config needed.

> Apple Music authorization requires the browser host to match `NEXTAUTH_URL`.
> Use `127.0.0.1`, not `localhost`, or `store-token` returns `403 Invalid origin`.

## 3. Set Up Google Gemini API (recommended)

Gemini powers image ranking (in `gemini`/`hybrid` modes) and the hidden-gems
recommendations.

1. Visit https://ai.google.dev and sign in.
2. Create or select a project and generate an **API key**.
3. Add it to `.env`:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   IMAGE_ANALYSIS_PROVIDER=hybrid   # or 'gemini'
   ```

Cost is about $0.0001 per poster analysis. Without `GEMINI_API_KEY`,
personalization degrades to loved-only (no gems) and `gemini`/`hybrid` analysis
won't work.

## 4. Set Up Google Cloud Vision API (for `vision` or `hybrid`)

Skip this if you use `IMAGE_ANALYSIS_PROVIDER=gemini`.

### 4.1 Create a project and enable billing

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create or select a project and enable billing (required for Vision).

### 4.2 Enable the Vision API

1. **APIs & Services → Library**, search "Cloud Vision API", click **Enable**.

### 4.3 Create a service account key

1. **APIs & Services → Credentials → Create Credentials → Service Account**.
2. Name it (e.g. `music-posters-vision`) and grant **Cloud Vision API User**.
3. Open the service account → **Keys → Add Key → Create New Key → JSON**.
4. Rename the downloaded file to `google-credentials.json` and move it to the
   project root.
5. Point `.env` at it:

   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
   ```

   **Or** paste the JSON inline instead of using a file — `src/lib/ocr.ts` prefers
   this when set, and it's the easier option on Vercel (no file to upload):

   ```env
   GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...",...}
   ```

## 5. Set Up Spotify (optional — currently broken)

> The Spotify path won't create playlists until both the owner reconnects Premium
> and the removed endpoints are migrated. These steps are kept for reference.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app. Set the Redirect URI to
   `http://127.0.0.1:3000/api/auth/spotify/callback`.
3. Copy the **Client ID** and **Client Secret** into `.env`:

   ```env
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
   ```

## 6. Configure Environment Variables

```bash
cp .env.example .env
```

A complete `.env` for the recommended (Apple Music + hybrid) setup:

```env
# Apple Music (the working platform)
APPLE_MUSIC_TEAM_ID=your_apple_team_id
APPLE_MUSIC_KEY_ID=your_apple_music_key_id
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Image analysis: 'vision' | 'gemini' | 'hybrid'
IMAGE_ANALYSIS_PROVIDER=hybrid
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json   # needed for vision/hybrid

# Spotify (optional, currently broken)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback

# Next.js
# NEXTAUTH_URL is used only by the Apple Music CSRF origin check
# (src/pages/api/auth/apple-music/store-token.ts). Omit it if you're not using
# Apple Music. Must be 127.0.0.1, not localhost.
NEXTAUTH_URL=http://127.0.0.1:3000

# Dev panel (never set true in production)
DEV_MODE=false
```

> **`NEXTAUTH_SECRET` is not needed.** Despite the name, this app doesn't use
> NextAuth (it isn't a dependency) — the only reference to the variable anywhere is
> `src/test/setup.ts`. Nothing in production reads it.

> Environment variables are read when the Node process starts — restart
> `npm run dev` after editing `.env`.

## 7. Verify Setup

For the recommended setup, confirm:

- ✅ MusicKit key created; `APPLE_MUSIC_TEAM_ID` / `KEY_ID` / `PRIVATE_KEY` set
- ✅ `GEMINI_API_KEY` set and `IMAGE_ANALYSIS_PROVIDER` chosen
- ✅ `google-credentials.json` in the project root, **or** `GOOGLE_CREDENTIALS_JSON`
  set inline (if using `vision`/`hybrid`)
- ✅ `NEXTAUTH_URL=http://127.0.0.1:3000` (Apple Music origin check)

## 8. Run the Development Server

```bash
npm run dev
```

Open **http://127.0.0.1:3000** (not `localhost` — the Apple Music origin check and
Spotify OAuth both require `127.0.0.1`).

## 9. Test the Application

1. On the landing page, choose **Apple Music** and connect (authorize in the
   MusicKit prompt).
2. Upload a festival poster (search an image site for "Coachella poster").
3. On **Review Artists**, watch the **"Personalized for you"** header appear with
   the artists you already love and hidden gems (give it ~10s).
4. Click **Search Tracks & Continue**, review the tracks, and create the playlist.
5. Check your Apple Music library for the new playlist.

To exercise the UI without real credentials, set `DEV_MODE=true` and use the dev
panel — see
[docs/howto-personalization.md](docs/howto-personalization.md#test-without-an-apple-account-dev-mode).

## Troubleshooting

### "403 Invalid origin" when connecting Apple Music

- The browser host must match `NEXTAUTH_URL`. Use `http://127.0.0.1:3000` and set
  `NEXTAUTH_URL=http://127.0.0.1:3000`.

### Apple Music developer-token errors

- Verify `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, and `APPLE_MUSIC_PRIVATE_KEY`
  are set. The private key must be the full PEM with `\n`-escaped newlines.

### The personalization header never appears

- It runs on **Apple Music only**, and only when the lineup overlaps your library.
  See [docs/howto-personalization.md → Troubleshooting](docs/howto-personalization.md#troubleshooting).

### "Failed to analyze image"

- `gemini`/`hybrid`: check `GEMINI_API_KEY`. `vision`/`hybrid`: check
  `google-credentials.json` exists, Vision API is enabled, and billing is on.

### "Could not find any tracks"

- The analyzer may have extracted non-artist text, or the lineup didn't match the
  catalog. Try a clearer poster; check the server console for per-artist matches.

### Spotify OAuth / "INVALID_CLIENT: Invalid redirect URI"

- Use `127.0.0.1` (not `localhost`) and make the redirect URI match **exactly** in
  both `.env` and the Spotify Dashboard. (Spotify playlist creation is currently
  broken regardless — see the banner above.)

## Production Deployment (Vercel)

1. Push to GitHub (`.env` and `google-credentials.json` stay in `.gitignore`).
2. Import the repo in [Vercel](https://vercel.com).
3. Add every variable from your `.env` in the Vercel dashboard. For
   `GOOGLE_APPLICATION_CREDENTIALS`, paste the JSON contents as the value (or use
   Vercel's file feature).
4. Update `SPOTIFY_REDIRECT_URI` and `NEXTAUTH_URL` to the production URL, and add
   the production redirect URI in the Spotify Dashboard.
5. Deploy. Production runs at `https://playlistd.xemc.dev`.

## Cost Considerations

- **Apple Music API / Spotify API:** free (a paid Apple Developer membership is
  required to issue MusicKit keys).
- **Gemini:** ~$0.0001 per poster analysis.
- **Google Vision:** first 1,000 requests/month free, then $1.50 per 1,000.

## Next Steps

- [QUICKSTART.md](QUICKSTART.md) — condensed setup
- [docs/](docs/README.md) — deep docs, including the personalization feature
- [TESTING.md](TESTING.md) — full test checklist
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
