# Music Posters - Poster to Playlist

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)

Convert festival posters into Spotify playlists using AI.

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
- AI-powered text extraction (Google Cloud Vision)
- Automatic artist detection and filtering
- Spotify playlist generation with top tracks
- Secure OAuth authentication
- Stateless, serverless architecture

## How It Works

1. User authenticates with Spotify
2. Uploads a festival poster image
3. Google Cloud Vision extracts text from the image
4. Smart filtering identifies artist names
5. Spotify API searches for each artist
6. Creates a playlist with each artist's top track
7. Playlist appears in user's Spotify account

## Tech Stack

- **Frontend**: Next.js 14 (React 18 + TypeScript)
- **Styling**: Tailwind CSS
- **OCR**: Google Cloud Vision API
- **Music**: Spotify Web API
- **Deployment**: Vercel (recommended)

## Documentation

- [Setup Guide](SETUP.md) - Detailed setup instructions
- [Architecture](ARCHITECTURE.md) - System design and data flow

## MVP Philosophy

This is an MVP built for speed and validation. Features explicitly cut for V1:

- No artist ranking/weighting by font size
- No manual artist review/editing
- No Apple Music integration
- No job queue/async processing
- No database or caching
- No advanced features (sharing, genre filtering, etc.)

See the [Architecture doc](ARCHITECTURE.md) for V2 backlog ideas.

## License

MIT
