# Music Posters — Agent Guide

Festival posters → playlists via AI image analysis. Next.js 14 (pages router),
React 18, TypeScript, Tailwind. Stateless: OAuth tokens in httpOnly cookies, no DB.

## State

- Spotify is broken (Premium gate + removed endpoints) and migration is deferred —
  see `SPOTIFY_MIGRATION.md`. Do not "fix" it unless asked.
- Apple Music is the working platform (`src/lib/music-platform/`,
  `src/lib/apple-music-auth.ts`), UI-gated by MusicKit readiness.

## Commands

- Install: `npm install`
- Dev: `npm run dev` → `http://127.0.0.1:3000` (never `localhost` — OAuth and CSRF
  checks require 127.0.0.1)
- Build/serve: `npm run build` + `npm start`
- Lint: `npm run lint` · Typecheck: `npm run typecheck` · Tests: `npm run test:run`
  · Format: `npm run format`

Before finishing a change run lint and typecheck plus the nearest tests. A Husky
pre-commit hook formats staged files.

## Layout

- `src/pages/` — pages + API routes (endpoint list in `ARCHITECTURE.md`)
- `src/lib/` — `music-platform/` (platform abstraction); `spotify.ts` and
  `apple-music-auth.ts` (platform APIs + auth); `ocr.ts` / `gemini.ts` /
  `hybrid-analyzer.ts` (image-analysis providers, selected by
  `IMAGE_ANALYSIS_PROVIDER` = `vision` | `gemini` | `hybrid`); `dev-mode.ts` (mocks)
- `src/components/`, `src/contexts/`, `src/hooks/` — frontend
- `src/types/index.ts` — shared interfaces
- Tests: `__tests__/` directories next to the code; setup in `src/test/`
  (Vitest + Testing Library + MSW)

Flow: auth → upload → `/api/analyze` (extract + rank artists) → review →
`/api/create-playlist`.

## Hard rules

- Rate limits (`src/lib/music-platform/index.ts`): Spotify 3 req/batch + 1s pause;
  Apple Music 5 req/batch + 500ms. Do not increase without testing for HTTP 429.
- `/api/analyze`: keep `bodyParser: false` (formidable parses multipart); 10MB max
  upload; always delete the temp file after reading it.
- `/api/create-playlist`: 150-artist cap (`MAX_ARTISTS_PER_SEARCH`) — keep it.
- `DEV_MODE=true` must stay blocked when `NODE_ENV === 'production'`.
- `google-credentials.json` and `.env` are gitignored; never commit secrets.
- Env vars are read at server start; they do not hot-reload.
- API routes: method check → auth check → validation → logic → specific
  405/401/400/429/500.

## Working agreements

- Read a file before editing it; re-read if it may have changed.
- Smallest coherent change; narrowest relevant tests, scaled to risk.
- Never commit, push, deploy, or delete data unless asked; preserve unrelated
  changes in a dirty worktree.
- Explicit user instructions override this guide.
- Report changed files, verification run, and unresolved risks.

## Deeper docs (load only when needed)

`README.md` (product) · `ARCHITECTURE.md` (data flow, endpoints, security) ·
`SETUP.md` (env vars, credentials) · `TESTING.md` (test strategy) ·
`SPOTIFY_MIGRATION.md` (Spotify breakage) · `docs/` (personalization feature)
