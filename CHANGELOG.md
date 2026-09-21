# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Manual artist entry.** Users can now type a lineup one artist per line instead
  of uploading a poster, then review the artists, adjust the default five tracks
  per artist, and continue through the existing track and playlist flow.

### Changed

- **Agent-friendly repo instructions.** `AGENTS.md` is now the canonical,
  cross-agent project guide (state, commands, layout, hard rules, working
  agreements); `CLAUDE.md` is a thin `@AGENTS.md` import for Claude Code. Stale
  guidance removed (the old file predated the Apple Music integration), and the
  Vercel production-logs section moved to `SETUP.md`. All hard-rule claims are
  verified against the code.

### Fixed

- **Playlist size cap (#49).** Track totals are now capped at 2,000 per playlist
  (shared `MAX_PLAYLIST_TRACKS` constant): the estimate on the artist review
  screen warns when a selection exceeds the cap, the create button on the track
  review screen is disabled with the overage spelled out, and
  `/api/create-playlist` rejects larger payloads with a 400. Worst-case Apple
  Music population (20 chunked requests plus mandatory delays) now fits the
  route's 30s budget, so partial playlists after timeout are no longer possible.
  The resumable/async population path is deferred indefinitely.
- **Create-playlist payload strictness.** `/api/create-playlist` now rejects
  requests that supply both `trackUris` and `trackIds` with a 400 (provide
  exactly one; the UI only ever sends `trackIds`). Previously a request with
  both could populate the playlist from one array while reporting
  `tracksAdded` from the other.
- **Over-cap warning styling.** The blocking "Too Many Tracks" warning on the
  artist review screen now uses the same amber treatment as the track review
  screen's blocked-create banner, instead of sharing the red styling of the
  advisory "Very Large Playlist" warning.
- **Reset stale bulk tier counts (#50).** "Reset to Recommended" on the artist
  review screen now also resets the bulk tier inputs to their recommended
  defaults. Previously a custom count applied to a tier survived the reset in
  the bulk bar, so returning to per-artist mode showed the stale value and
  clicking Apply silently restored the old count.

## [0.2.0] - 2026-06-14

### Added

- **User-aware recommendations (loved + hidden gems).** Apple Music users now see
  their poster lineup annotated against their own library: artists already in
  their library are tagged **loved**, and Gemini surfaces likely-taste-match
  **gems** seeded from that loved set. Adds `POST /api/personalize`, a
  `PersonalizationHeader` on the review-artists screen, and affinity-driven
  per-artist track selection downstream (loved → deep cuts, gems → popular).
- Shared artist-name matching primitives (`src/lib/artist-match.ts`):
  accent/punctuation-insensitive `normalize`/`similarity`, with separate
  thresholds for catalog search (0.6) and the conservative loved-overlap (0.85).
- Apple Music library scan (`getLibraryArtists`): paginated, throttled, capped at
  50 pages, per-page timeout, and partial-success degradation rather than failure.

### Security

- `getLibraryArtists` refuses to follow a non-Apple pagination `next` URL,
  preventing developer-token / Music-User-Token exfiltration if an upstream
  response is malformed or compromised.
- Apple Music error logging redacts axios errors — the bearer developer token and
  Music-User-Token in `config.headers` are never written to logs.
- `/api/personalize` strips client-supplied affinity metadata; the server is the
  sole authority on whether an artist is loved or a gem.

### Notes

- Gemini gem output is treated as untrusted: gem names are allowlisted to the
  submitted lineup, unexpected fields stripped, confidence clamped, results
  deduped and capped, and the reason text is sanitized (control / zero-width /
  bidi-override characters) and length-capped before it reaches the DOM.
- The Spotify path remains broken by Spotify's February 2026 Web API changes (see
  `SPOTIFY_MIGRATION.md`). Apple Music is the working platform.
