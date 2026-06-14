# Music Posters - Poster to Playlist

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)

Convert festival posters into Spotify or Apple Music playlists using AI. Upload a
poster, get a ranked artist lineup, and (on Apple Music) see which artists you
already love plus hidden gems picked for your taste.

> **Note:** The Spotify path is currently broken by Spotify's February 2026 Web
> API changes — **Apple Music is the working platform.** See
> [CLAUDE.md → Known Limitations](CLAUDE.md) for details.

## Quick Start

See **[SETUP.md](SETUP.md)** for detailed setup instructions.

1. Install dependencies:

```bash
npm install
```

2. Set up API credentials:
   - Create a Spotify Developer App
   - Enable Google Cloud Vision API
   - Configure `.env` file

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Features

- Upload festival poster images
- AI-powered artist extraction with three providers: Google Cloud Vision (OCR),
  Gemini 3.5 Flash (vision-first), or Hybrid (OCR + Gemini)
- Artist ranking by visual prominence (Gemini/Hybrid modes), with tier badges
- Playlist generation on **Spotify or Apple Music** with each artist's top track
- **User-aware recommendations (Apple Music):** lineup artists already in your
  library are tagged **loved**, and Gemini surfaces likely-taste-match **gems**
- A review screen to see your ranked lineup (and loved/gems) before creating
- Secure OAuth authentication
- Stateless, serverless architecture

## How It Works

1. User authenticates with Spotify or Apple Music
2. Uploads a festival poster image
3. The chosen provider extracts artists (Vision OCR, Gemini, or Hybrid) and ranks
   them by visual prominence
4. On Apple Music, `POST /api/personalize` tags the lineup against your library
   (loved) and asks Gemini for hidden gems seeded from your loved set
5. User reviews the ranked lineup on the review screen
6. The platform API searches for each artist and picks a track (loved → deep
   cuts, gems → popular, everyone else → the default selection mode)
7. Creates a playlist that appears in the user's Spotify or Apple Music account

## Tech Stack

- **Frontend**: Next.js 14 (React 18 + TypeScript)
- **Styling**: Tailwind CSS
- **Image analysis**: Google Cloud Vision API, Gemini 3.5 Flash, or Hybrid
- **Recommendations**: Gemini 3.5 Flash (hidden-gems engine)
- **Music**: Spotify Web API and Apple Music Web API
- **Deployment**: Vercel (recommended)

## Documentation

- [Quick Start](QUICKSTART.md) - 5-minute setup
- [Setup Guide](SETUP.md) - Detailed setup instructions
- [Architecture](ARCHITECTURE.md) - System design and data flow
- [Testing](TESTING.md) - Testing checklist
- [Changelog](CHANGELOG.md) - Release history
- [CLAUDE.md](CLAUDE.md) - Project guide, providers, and known limitations

## MVP Philosophy

This started as an MVP built for speed and validation, and has since grown an
Apple Music platform, artist ranking, and user-aware recommendations.

Shipped since V1:

- Artist ranking/weighting by visual prominence (Gemini and Hybrid providers)
- Apple Music as a second platform
- A review screen for the lineup before playlist creation
- User-aware recommendations (loved + hidden gems) on Apple Music

Still explicitly out of scope:

- No job queue/async processing (all synchronous)
- No database or caching
- No user accounts or saved playlist history
- No advanced features (sharing, genre filtering, etc.)

See the [Architecture doc](ARCHITECTURE.md) for V2 backlog ideas.

## License

MIT
