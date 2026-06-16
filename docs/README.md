# Documentation

Deep documentation for Music Posters (Playlistd), organized by the
[Diátaxis](https://diataxis.fr/) framework — each document serves a different
reader need.

## User-aware recommendations (loved + hidden gems)

The personalization feature shipped in v0.2.0: Apple Music users see their poster
lineup tagged against their own library (**loved**) plus on-taste unknowns
surfaced by Gemini (**hidden gems**).

| Document                                                           | Quadrant    | Read it when you want to…                                                                |
| ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| [tutorial-personalization.md](./tutorial-personalization.md)       | Tutorial    | See the loved + gems header on screen and learn how it works, no real accounts needed    |
| [howto-personalization.md](./howto-personalization.md)             | How-to      | Enable it, test it (dev mode or a real account), tune thresholds, or debug it            |
| [reference-personalization.md](./reference-personalization.md)     | Reference   | Look up the exact API, types, constants, and the `POST /api/personalize` contract        |
| [explanation-personalization.md](./explanation-personalization.md) | Explanation | Understand why it's built this way (name-match vs Gemini, the rejected graph, hardening) |

## Project docs (repository root)

- [../README.md](../README.md) — project overview and features
- [../QUICKSTART.md](../QUICKSTART.md) — 5-minute setup
- [../SETUP.md](../SETUP.md) — detailed setup (Spotify, Apple Music, Vision, Gemini)
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — system design and data flow
- [../TESTING.md](../TESTING.md) — testing checklist
- [../CHANGELOG.md](../CHANGELOG.md) — release history
- [../CLAUDE.md](../CLAUDE.md) — provider guide and known limitations (incl. the
  Spotify February 2026 breakage)
