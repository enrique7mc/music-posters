# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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
  `CLAUDE.md` → Known Limitations). Apple Music is the working platform.
