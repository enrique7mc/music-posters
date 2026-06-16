# Architecture Overview

Music Posters (Playlistd) turns a festival poster image into a music playlist. It
is a stateless Next.js app: no database, OAuth tokens in httpOnly cookies, all
work synchronous. Since V1 it has grown a second music platform (Apple Music),
three image-analysis providers, a review screen, and user-aware recommendations.

> **Spotify status:** the Spotify path is broken by Spotify's February 2026 Web
> API changes (Premium-gated Development Mode + removed endpoints). **Apple Music
> is the working platform.** See [CLAUDE.md → Known Limitations](CLAUDE.md).

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend (Next.js Pages)                      │
│  index → upload → review-artists → review-tracks → success            │
│  (platform select)  (image)   (loved/gems, edit)  (track edit)        │
└───────────────┬───────────────────────────────────────┬──────────────┘
                │ HTTP (axios)                            │ httpOnly cookie auth
┌───────────────▼───────────────────────────────────────▼──────────────┐
│                      Backend (Next.js API Routes)                      │
│                                                                        │
│  /api/auth/*       /api/analyze     /api/personalize   /api/search-    │
│  spotify + apple   image → ranked   lineup → loved +   tracks          │
│                    Artist[]         gems (Apple only)   Artist[]→Track[]│
│                                                        /api/create-     │
│                                                         playlist        │
└──────┬───────────────┬────────────────┬──────────────────┬───────────┘
       │               │                │                  │
┌──────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐ ┌────────▼──────────┐
│ Spotify     │ │ Image analysis│ │ Gemini 3.5   │ │ Music platform    │
│ OAuth +     │ │ Vision (OCR)  │ │ Flash         │ │ Spotify Web API   │
│ Apple Music │ │ Gemini (AI)   │ │ (gem engine)  │ │ Apple Music API   │
│ MusicKit JS │ │ Hybrid        │ │               │ │ search/tracks/    │
│             │ │               │ │               │ │ playlists/library │
└─────────────┘ └───────────────┘ └───────────────┘ └───────────────────┘
```

## Data Flow

### 1. Authentication (auth-first)

The user picks a platform on the landing page, then authenticates before
uploading. Two flows:

**Spotify (OAuth 2.0):**

```
Choose Spotify → GET /api/auth/spotify/login (sets state cookie, redirects)
  → Spotify consent → GET /api/auth/spotify/callback (validates state,
    exchanges code for tokens) → httpOnly cookies → /upload
```

**Apple Music (MusicKit JS):**

```
MusicKit init uses GET /api/auth/apple-music/developer-token (ES256 JWT)
  → user authorizes in MusicKit → client posts the Music User Token to
    POST /api/auth/apple-music/store-token (origin-checked) → httpOnly cookie → /upload
```

A `music_platform` cookie records which platform is active. `src/lib/auth.ts`
exposes platform-agnostic helpers (`getAuthenticatedPlatform`,
`getPlatformAccessToken`) plus dev-mode wrappers. `GET /api/auth/login` and
`/api/auth/callback` are thin redirects to the Spotify routes (legacy aliases).

### 2. Image analysis

```
Upload image → POST /api/analyze (formidable, bodyParser off, 10MB cap)
  → branch on IMAGE_ANALYSIS_PROVIDER:
       vision → Google Vision OCR + heuristic filtering (no ranking)
       gemini → Gemini vision analysis with weight/tier ranking
       hybrid → Vision OCR text + Gemini analysis (ranking + completeness)
  → Artist[] (name, optional weight/tier/reasoning) + rawText + provider
```

See [CLAUDE.md → Image Analysis Methods](CLAUDE.md) for the per-provider detail.

### 3. Personalization — loved + hidden gems (Apple Music)

```
review-artists mounts → POST /api/personalize (once, Apple Music only)
  → scan the user's library (getLibraryArtists, paginated/capped/partial-success)
  → match lineup ∩ library (similarity ≥ 0.85) → tag LOVED
  → seed Gemini with the loved set → rank unknown lineup → sanitize → tag GEM
  → return annotated Artist[] + lovedCount + gemCount + degraded
Client merges affinity fields by name (preserving edits) and shows the
"Personalized for you" header. Continue is blocked while this is in flight.
```

This is the headline v0.2.0 feature. Full docs:
[docs/reference-personalization.md](docs/reference-personalization.md) and
[docs/explanation-personalization.md](docs/explanation-personalization.md).

### 4. Track search + playlist creation

```
Continue → POST /api/search-tracks (Artist[] + track-count + selection options)
  → per-artist track count from tier / per-artist overrides
  → per-artist selection mode from affinity:
       loved → deep-cuts, gem → popular, untagged → global mode
  → search each artist + fetch tracks (rate-limited batches) → Track[]
review-tracks (edit) → POST /api/create-playlist (trackIds/URIs + name + cover)
  → create playlist → add tracks in chunks of 100 → playlist URL → /success
```

## Technology Stack

### Frontend

- **Framework:** Next.js 14 (Pages Router) + React 18 + TypeScript
- **Styling:** Tailwind CSS; **motion:** framer-motion
- **HTTP:** axios (`src/lib/api-client.ts`)
- **Apple Music:** MusicKit JS (client-side authorization)

### Backend

- **Runtime:** Node.js on Next.js API Routes (serverless)
- **Validation:** Zod (`src/lib/validation.ts`)
- **File uploads:** Formidable; image processing: sharp (poster thumbnails)
- **Auth tokens:** httpOnly cookies (`cookie`); Apple developer token: jsonwebtoken (ES256)
- **Rate limiting:** in-memory LRU (`src/lib/rate-limit.ts`, `lru-cache`)

### External services

- **Google Cloud Vision API** — OCR text extraction (`vision`, `hybrid`)
- **Google Gemini 3.5 Flash** — image ranking (`gemini`, `hybrid`) and the gem engine
- **Spotify Web API** — auth, search, playlists (currently broken; see above)
- **Apple Music API** — catalog search, top songs, library scan, playlists

### Tooling

- **Tests:** Vitest + Testing Library + MSW (`npm run test`)
- **Lint/format:** ESLint + Prettier; Husky + lint-staged pre-commit
- **Deploy:** Vercel (serverless functions)

## API Endpoints

### Authentication

- `GET /api/auth/login` — redirect to Spotify login (legacy alias)
- `GET /api/auth/callback` — redirect to Spotify callback (legacy alias)
- `GET /api/auth/spotify/login` — start Spotify OAuth (sets state cookie)
- `GET /api/auth/spotify/callback` — finish Spotify OAuth, set cookies
- `GET /api/auth/apple-music/developer-token` — ES256 developer JWT for MusicKit
- `POST /api/auth/apple-music/store-token` — store the Music User Token (origin-checked)
- `GET /api/auth/me` — current user (platform-aware) or `401`
- `POST /api/auth/logout` — clear all auth cookies

### Features

- `POST /api/analyze` — image → ranked `Artist[]` (`vision` | `gemini` | `hybrid`)
- `POST /api/personalize` — lineup → affinity-tagged `Artist[]` (Apple Music)
- `POST /api/search-tracks` — `Artist[]` → `Track[]` (affinity-driven selection)
- `POST /api/create-playlist` — track IDs/URIs → playlist (Spotify or Apple Music)
- `POST /api/preview-cover` — generate a playlist cover thumbnail from the poster
- `GET /api/health` — health check

### Dev mode (only when `DEV_MODE=true` and `NODE_ENV !== production`)

- `GET/POST /api/dev/config` — read/update runtime dev toggles
- `POST /api/dev/mock-session` — fabricate a mock session

## Environment Variables

| Variable                                      | Description                          | Used by                  |
| --------------------------------------------- | ------------------------------------ | ------------------------ |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app credentials              | Spotify auth             |
| `SPOTIFY_REDIRECT_URI`                        | OAuth callback (use `127.0.0.1`)     | Spotify auth             |
| `APPLE_MUSIC_TEAM_ID`                         | Apple Developer Team ID              | Apple Music              |
| `APPLE_MUSIC_KEY_ID`                          | MusicKit private key ID              | Apple Music              |
| `APPLE_MUSIC_PRIVATE_KEY`                     | PEM private key (`\n`-escaped)       | Apple Music              |
| `IMAGE_ANALYSIS_PROVIDER`                     | `vision` \| `gemini` \| `hybrid`     | image analysis           |
| `GOOGLE_APPLICATION_CREDENTIALS`              | path to Vision service-account JSON  | `vision`, `hybrid`       |
| `GEMINI_API_KEY`                              | Google AI Studio key                 | `gemini`, `hybrid`, gems |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET`            | app base URL / session secret        | app                      |
| `DEV_MODE`                                    | enable the dev panel (never in prod) | dev only                 |

Full setup walkthrough: [SETUP.md](SETUP.md).

## File Structure

```
src/
├── pages/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.ts, callback.ts, logout.ts, me.ts   # Spotify aliases + session
│   │   │   ├── spotify/{login,callback}.ts               # Spotify OAuth
│   │   │   └── apple-music/{developer-token,store-token}.ts
│   │   ├── analyze.ts            # image → Artist[]
│   │   ├── personalize.ts        # lineup → loved/gems (Apple Music)
│   │   ├── search-tracks.ts      # Artist[] → Track[]
│   │   ├── create-playlist.ts    # tracks → playlist
│   │   ├── preview-cover.ts      # poster → cover thumbnail
│   │   ├── health.ts
│   │   └── dev/{config,mock-session}.ts
│   ├── index.tsx                 # landing + platform selector
│   ├── upload.tsx                # image upload + analysis
│   ├── review-artists.tsx        # ranked lineup + personalization header
│   ├── review-tracks.tsx         # track review/edit
│   └── success.tsx
├── lib/
│   ├── auth.ts, apple-music-auth.ts        # cookies + Apple developer token
│   ├── ocr.ts, gemini.ts, gemini-parser.ts, hybrid-analyzer.ts  # image analysis
│   ├── personalize.ts, artist-match.ts     # loved + gems engine
│   ├── music-platform/                     # platform abstraction
│   │   ├── types.ts, index.ts              # MusicPlatformService + orchestration
│   │   ├── spotify-platform.ts, apple-music-platform.ts
│   ├── validation.ts, rate-limit.ts, error-utils.ts
│   ├── cover-generator.ts, dev-mode.ts, mock-data.ts, constants.ts
├── components/   # ui/, layout/, features/ (incl. PersonalizationHeader), dev/
├── contexts/AuthContext.tsx
├── types/index.ts
└── styles/globals.css
```

## Security Considerations

### Authentication

- **httpOnly cookies** for all tokens (no `localStorage`); `secure` in production;
  `sameSite=lax` for CSRF; OAuth `state` parameter on Spotify.
- Apple `store-token` enforces an **origin check** (must match `NEXTAUTH_URL`).
- Apple developer token is an ES256 JWT minted server-side and cached.

### Personalization-specific hardening

- `POST /api/personalize` **strips client-supplied affinity** — the server is the
  sole authority on loved/gem.
- Gemini gem output is **untrusted**: names are allowlisted to the submitted
  lineup, fields stripped, confidence clamped, results deduped/capped, and the
  reason text is sanitized (control / zero-width / bidi chars) and length-capped
  before reaching the DOM.
- The Apple library scan **refuses any non-Apple pagination `next` URL** so the
  developer + user tokens can't be exfiltrated, and **redacts axios errors** so
  those tokens never reach logs.

### Data privacy

- **No database, no persistence, no analytics.** Uploaded images are deleted after
  processing. The library scan and Gemini calls happen per-request and nothing is
  stored.

### Input validation

- Zod schemas validate every API body; uploads are checked by magic bytes
  (`file-type`) and capped at 10MB; artist counts and name lengths are bounded.

## Rate Limiting

- **Per-route limiting** via an in-memory LRU (`RateLimitPresets`) applied after
  the auth check, so anonymous traffic can't burn legitimate users' slots.
- **Provider batching** in `searchAndGetTopTracks`: Spotify 3/batch @ 1000ms
  (180 req/min), Apple Music 5/batch @ 500ms. The Apple library scan throttles
  50ms/page and is capped at 50 pages.

## Scalability & Future Work

Current limits: serverless function budget (`maxDuration: 30` on personalize and
create-playlist), provider rate limits, in-memory rate-limit state (per-instance).

Deferred (see [TODOS.md](TODOS.md)): a 30s cumulative budget across the
scan + Gemini, degraded-state UX polish, Gemini taste-data consent gating,
streaming personalization, Redis caching of search results, and an async job queue
for very large posters.

## Testing

Vitest unit + integration tests live under `src/**/__tests__/` and
`src/pages/api/**/__tests__/` (MSW mocks external HTTP). Coverage includes the
matching primitives, the personalization engine and its hardening, affinity →
track-mode selection, validation schemas, auth, and the API routes. Run with
`npm run test` (watch) or `npm run test:run` (once). See [TESTING.md](TESTING.md)
for the manual checklist.
