# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Home    │  │  Upload  │  │ Success  │  │   Auth   │   │
│  │  Page    │→ │  Page    │→ │  Page    │  │  Check   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────┬──────────────────────────────────────┬──────────┘
            │                                       │
            │ HTTP/HTTPS                           │ Cookie Auth
            │                                       │
┌───────────▼──────────────────────────────────────▼──────────┐
│                   Backend (Next.js API Routes)               │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │ /api/auth/*    │  │ /api/analyze   │  │ /api/create-   ││
│  │ - login        │  │ - Upload image │  │   playlist     ││
│  │ - callback     │  │ - Extract text │  │ - Search       ││
│  │ - logout       │  │ - Parse artists│  │ - Create       ││
│  │ - me           │  │                │  │ - Add tracks   ││
│  └────────┬───────┘  └───────┬────────┘  └───────┬────────┘│
│           │                  │                    │          │
└───────────┼──────────────────┼────────────────────┼──────────┘
            │                  │                    │
            │                  │                    │
    ┌───────▼───────┐  ┌───────▼────────┐  ┌───────▼────────┐
    │   Spotify     │  │  Google Cloud  │  │    Spotify     │
    │   OAuth API   │  │   Vision API   │  │   Web API      │
    │               │  │                │  │                │
    │ - Auth flow   │  │ - OCR text     │  │ - Search       │
    │ - Token mgmt  │  │   extraction   │  │ - Playlists    │
    └───────────────┘  └────────────────┘  └────────────────┘
```

## Data Flow

### 1. Authentication Flow (Auth-First Approach)

```
User → Click "Connect Spotify"
  ↓
/api/auth/login
  ↓
Redirect to Spotify OAuth
  ↓
User approves
  ↓
Spotify redirects to /api/auth/callback with auth code
  ↓
Exchange code for access_token + refresh_token
  ↓
Store tokens in httpOnly cookies
  ↓
Redirect to /upload page
```

### 2. Image Analysis Flow

```
User uploads image → POST /api/analyze
  ↓
Read image file (FormData)
  ↓
Send to Google Cloud Vision API
  ↓
Receive raw OCR text
  ↓
Parse and filter text:
  - Remove URLs, dates, times
  - Remove common keywords (festival, tickets, etc.)
  - Remove low alpha-ratio lines
  - Remove duplicates
  - Sort by length
  ↓
Return { artists: [...], rawText: "..." }
  ↓
Frontend displays artist list
```

### 3. Playlist Creation Flow

```
User clicks "Create Playlist" → POST /api/create-playlist
  ↓
Read access_token from cookie
  ↓
Get current user info from Spotify
  ↓
For each artist (in parallel):
  ├─ Search Spotify for artist name
  ├─ Get artist's top track URI
  └─ Collect valid track URIs
  ↓
Create empty playlist
  ↓
Add all tracks to playlist (chunks of 100)
  ↓
Return { playlistUrl, playlistId, tracksAdded }
  ↓
Redirect to /success page with playlist URL
```

## Technology Stack

### Frontend

- **Framework**: Next.js 14 (React 18)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **HTTP Client**: Axios

### Backend

- **Runtime**: Node.js
- **Framework**: Next.js API Routes
- **Language**: TypeScript
- **File Uploads**: Formidable
- **Cookie Handling**: cookie package

### External APIs

- **Google Cloud Vision API**: OCR text extraction
- **Spotify Web API**: Authentication, search, playlist management

### Deployment

- **Platform**: Vercel (recommended)
- **Environment**: Serverless Functions

## Security Considerations

### Authentication

- **httpOnly cookies**: Prevents XSS attacks from accessing tokens
- **Secure flag**: HTTPS-only cookies in production
- **SameSite=Lax**: CSRF protection
- **State parameter**: OAuth CSRF protection

### Data Privacy

- **No database**: Zero user data persistence
- **Stateless**: Each request is independent
- **Temporary files**: Image uploads are deleted after processing
- **No tracking**: No analytics or user behavior tracking

### API Security

- **Authentication checks**: All sensitive endpoints verify auth
- **Input validation**: File type, size limits
- **Rate limiting**: Handled by Vercel and API providers
- **Error handling**: Generic error messages to users

## Performance Optimizations

### Parallel Processing

```typescript
// Instead of sequential:
for (const artist of artists) {
  await searchArtist(artist);
}

// Use parallel:
await Promise.all(artists.map((artist) => searchArtist(artist)));
```

### Spotify API Batching

- Get top tracks: 1 request per artist (includes track data)
- Add tracks: Batched in chunks of 100

### Caching

- No caching in MVP (stateless design)
- Future: Add Redis for API response caching

## File Structure

```
music-posters/
├── src/
│   ├── pages/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login.ts
│   │   │   │   ├── callback.ts
│   │   │   │   ├── logout.ts
│   │   │   │   └── me.ts
│   │   │   ├── analyze.ts
│   │   │   └── create-playlist.ts
│   │   ├── index.tsx          # Home page (login)
│   │   ├── upload.tsx         # Upload page
│   │   └── success.tsx        # Success page
│   ├── lib/
│   │   ├── auth.ts            # Auth utilities
│   │   ├── spotify.ts         # Spotify API client
│   │   └── ocr.ts             # Google Vision utilities
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── styles/
│       └── globals.css        # Global styles
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── README.md
```

## API Endpoints

### Authentication

- `GET /api/auth/login` - Initiates Spotify OAuth flow
- `GET /api/auth/callback` - Handles OAuth callback
- `POST /api/auth/logout` - Clears auth cookies
- `GET /api/auth/me` - Returns current user info

### Features

- `POST /api/analyze` - Analyzes image, returns artist list
- `POST /api/create-playlist` - Creates Spotify playlist

## Environment Variables

| Variable                         | Description                | Example                                   |
| -------------------------------- | -------------------------- | ----------------------------------------- |
| `SPOTIFY_CLIENT_ID`              | Spotify app client ID      | `abc123...`                               |
| `SPOTIFY_CLIENT_SECRET`          | Spotify app secret         | `def456...`                               |
| `SPOTIFY_REDIRECT_URI`           | OAuth callback URL         | `http://localhost:3000/api/auth/callback` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google credentials | `./google-credentials.json`               |
| `NEXTAUTH_URL`                   | App base URL               | `http://localhost:3000`                   |
| `NEXTAUTH_SECRET`                | Session secret             | Random string                             |

## Error Handling Strategy

### Frontend

- Display user-friendly error messages
- Retry logic for transient failures
- Fallback UI for error states

### Backend

- Catch all errors at API route level
- Log detailed errors to console
- Return generic error messages to client
- Specific error codes for different failure modes:
  - 401: Authentication required/expired
  - 400: Bad request (missing data)
  - 500: Internal server error

## Scalability Considerations

### Current Limitations

- Spotify API: 180 req/min (can handle ~90 artists/min)
- Google Vision: Serverless function timeout (10s on Vercel)
- Large images: Memory limits in serverless

### Future Improvements

- Add job queue for async processing (Redis + Bull)
- Implement pagination for large artist lists
- Add worker pool for parallel API calls
- Cache Spotify search results (Redis)
- Implement rate limiting on frontend

## Testing Strategy (Future)

### Unit Tests

- OCR parsing logic
- Artist filtering heuristics
- Spotify API client methods

### Integration Tests

- OAuth flow end-to-end
- Image upload → analysis → playlist creation
- Error scenarios

### Manual Testing

- Various festival poster types
- Edge cases (100+ artists, no artists, etc.)
- Different image formats and qualities

## Monitoring (Future)

- **Error tracking**: Sentry
- **Performance**: Vercel Analytics
- **API usage**: Custom logging
- **User analytics**: Plausible or Simple Analytics
