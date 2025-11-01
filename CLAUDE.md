# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Posters is a Next.js application that converts festival poster images into Spotify playlists using AI. It's a stateless MVP built for speed, using Google Cloud Vision API for OCR and Spotify Web API for playlist creation.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev
# Access at http://127.0.0.1:3000 (NOT localhost - Spotify OAuth requires 127.0.0.1)

# Build for production
npm run build

# Run production build
npm run start

# Lint
npm run lint
```

## Environment Setup

Required environment variables (see `.env.example`):
```bash
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback  # MUST use 127.0.0.1
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
NEXTAUTH_URL=http://127.0.0.1:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
```

**Critical**: Spotify OAuth requires `127.0.0.1` (not `localhost`) due to recent Spotify policy changes.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14 + React 18 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Auth**: OAuth 2.0 with httpOnly cookies (no database)
- **External Services**: Google Cloud Vision API (OCR), Spotify Web API

### Key Directories
- `src/pages/` - Frontend pages + API routes
- `src/lib/` - Shared business logic (auth, spotify, ocr)
- `src/types/` - TypeScript interfaces
- `src/styles/` - Global styles

### Data Flow: Image → Playlist

```
1. User uploads image → POST /api/analyze
   ├─ Formidable parses multipart form
   ├─ Google Vision API extracts text
   ├─ parseArtistsFromText() filters OCR noise
   └─ Returns artist array

2. User clicks create → POST /api/create-playlist
   ├─ searchAndGetTopTracks() with rate limiting
   │  ├─ Batch size: 3, delay: 1000ms (respects 180 req/min)
   │  ├─ Search each artist on Spotify
   │  └─ Get top track for each found artist
   ├─ createPlaylist() on Spotify
   ├─ addTracksToPlaylist() in chunks of 100
   └─ Returns playlist URL
```

## Authentication Flow

**Auth-First Design**: Users must authenticate with Spotify BEFORE uploading images.

```
User → /api/auth/login → Spotify OAuth → /api/auth/callback
  ↓
Exchange code for tokens → Store in httpOnly cookies → Redirect to /upload
```

**Security**:
- Tokens stored in httpOnly cookies (not localStorage)
- `secure` flag enabled in production
- `sameSite: 'lax'` for CSRF protection
- No user data persistence (stateless)

**Cookie Access**:
```typescript
import { getAccessToken, setAuthCookies, clearAuthCookies } from '@/lib/auth';
const token = getAccessToken(req);
```

## Rate Limiting Strategy

**Critical**: Spotify API has a 180 requests/minute limit. The app uses batch processing to avoid rate limit errors.

**Implementation** (`src/lib/spotify.ts`):
```typescript
processBatch(items, processor, batchSize: 3, delayMs: 1000)
```

- Processes 3 requests in parallel
- Waits 1 second between batches
- ~3 requests/second = 180 requests/minute (safe)

**For 100 artists**:
- Artist searches: ~34 batches × 1s = 35 seconds
- Top track fetches: ~34 batches × 1s = 35 seconds
- Total: ~70 seconds

**DO NOT** increase batch size or reduce delay without testing - this will cause HTTP 429 errors.

## OCR Text Filtering

The `parseArtistsFromText()` function in `src/lib/ocr.ts` applies 10 heuristic filters to remove festival poster noise:

1. Empty/short lines (< 2 chars)
2. URLs and domain names
3. Dates (various formats)
4. Times (HH:MM patterns)
5. 50+ festival keywords (festival, tickets, VIP, stage, etc.)
6. Low alphabetic ratio (< 50% letters)
7. Excessive punctuation (> 30%)
8. Case-insensitive duplicates
9. Sorts by length (longer = higher quality)
10. Substring duplicates (keeps "Drake Bell", removes "Drake")

**Accuracy**: ~60-80% depending on poster quality. Improves with clearer text.

## API Endpoint Patterns

All API routes follow this structure:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Check HTTP method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Check authentication (if required)
  const accessToken = getAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // 3. Validate input
  if (!data) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // 4. Execute business logic
  try {
    const result = await businessLogic();
    return res.status(200).json(result);
  } catch (error) {
    // 5. Handle errors with specific status codes
    console.error('Error:', error);

    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    return res.status(500).json({ error: error.message || 'Failed' });
  }
}
```

## Key API Routes

### `/api/analyze` (POST)
- **Purpose**: Extract artists from poster image
- **Input**: multipart/form-data with `image` field
- **Config**: `bodyParser: false` (required for formidable)
- **Returns**: `{ artists: string[], rawText: string }`
- **Max File Size**: 10MB
- **Process**: Upload → Vision API → Filter noise → Return artist list

### `/api/create-playlist` (POST)
- **Purpose**: Create Spotify playlist
- **Input**: `{ artists: string[], playlistName?: string }`
- **Max Artists**: 100 (enforced to prevent excessive API calls)
- **Process**: Search artists → Get top tracks → Create playlist → Add tracks
- **Duration**: 20-70 seconds depending on artist count
- **Returns**: `{ playlistUrl, playlistId, tracksAdded, artistsFound, limitApplied }`

### `/api/auth/*`
- `/api/auth/login` - Initiates Spotify OAuth
- `/api/auth/callback` - Handles OAuth redirect
- `/api/auth/me` - Returns current user (or 401)
- `/api/auth/logout` - Clears cookies

## Spotify API Integration

Located in `src/lib/spotify.ts`.

**Key Functions**:
- `searchArtist(name, token)` - Returns `{ id, name }` or null
- `getArtistTopTrack(id, token)` - Returns track URI or null
- `searchAndGetTopTracks(names, token)` - Orchestrates search with rate limiting
- `createPlaylist(userId, name, token)` - Returns `{ id, url }`
- `addTracksToPlaylist(id, uris, token)` - Batches in groups of 100

**Rate Limit Handling**:
```typescript
// Uses processBatch() internally
const { trackUris, foundArtists } = await searchAndGetTopTracks(artistNames, accessToken);
```

**Error Handling**:
- Returns null for individual failures (artist not found)
- Logs errors to console
- Throws on critical failures (auth expired)

## File Upload Handling

**Library**: Formidable (for multipart parsing)

**Pattern** (`src/pages/api/analyze.ts`):
```typescript
export const config = {
  api: {
    bodyParser: false,  // Required!
  },
};

const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
const [fields, files] = await new Promise((resolve, reject) => {
  form.parse(req, (err, fields, files) => {
    if (err) reject(err);
    else resolve([fields, files]);
  });
});

const imageFile = files.image?.[0];
const imageBuffer = fs.readFileSync(imageFile.filepath);

// IMPORTANT: Clean up temp file
fs.unlinkSync(imageFile.filepath);
```

## Google Cloud Vision Setup

**Authentication**: Service account JSON file (not committed to Git)

```typescript
const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
```

**Response Structure**:
```typescript
const [result] = await client.textDetection(imageBuffer);
const detections = result.textAnnotations;

// detections[0] = Full text (all concatenated)
// detections[1-n] = Individual words with bounding boxes
```

**Logging**: Full Vision API response is logged to console for debugging (see `src/lib/ocr.ts`).

## Frontend State Management

**Pattern**: React hooks with multiple loading states

```typescript
const [loading, setLoading] = useState(true);       // Page load
const [analyzing, setAnalyzing] = useState(false);  // Image analysis
const [creating, setCreating] = useState(false);    // Playlist creation
const [error, setError] = useState<string | null>(null);
```

**Auth Check on Page Load**:
```typescript
useEffect(() => {
  checkAuth();  // GET /api/auth/me
}, []);

const checkAuth = async () => {
  try {
    const response = await axios.get('/api/auth/me');
    setUser(response.data);
  } catch (err) {
    router.push('/');  // Redirect if not authenticated
  }
};
```

## Loading Animations

The app uses fun, rotating messages during long operations:

**Implementation** (`src/pages/upload.tsx`):
```typescript
const loadingMessages = [
  "🎸 Tuning the guitars...",
  "🎤 Setting up the microphones...",
  // ... 15 total messages
];

useEffect(() => {
  if (creating) {
    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
    }, 2000);
    return () => clearInterval(interval);
  }
}, [creating]);
```

Messages change every 2 seconds to keep users engaged during 30-60 second playlist creation.

## Error Handling Strategy

**User-Facing Errors**: Generic messages
```typescript
setError('Failed to analyze image');
setError('Could not find any tracks for the provided artists');
```

**Server Logs**: Detailed stack traces
```typescript
console.error('Error analyzing image:', error);
console.error(`Error searching for artist "${artistName}":`, error);
```

**Retry Strategy**: Frontend clears error on user retry (no automatic retry)

## Common Debugging Scenarios

### "INVALID_CLIENT: Invalid redirect URI"
- **Cause**: Spotify redirect URI mismatch
- **Fix**: Use `127.0.0.1:3000` (not `localhost:3000`) in both `.env` and Spotify Dashboard

### "HTTP 429: Too Many Requests"
- **Cause**: Spotify rate limit exceeded
- **Fix**: Already handled with batch processing (3 req/sec). If still occurring, increase `delayMs` in `processBatch()`
- **Check**: Console logs show batch progress

### "Failed to analyze image"
- **Cause**: Google Cloud Vision API error
- **Debug**: Check console for Vision API response logs
- **Common Issues**:
  - `google-credentials.json` missing or invalid path
  - Billing not enabled on Google Cloud project
  - Vision API not enabled

### "Could not find any tracks"
- **Cause**: All artist searches failed on Spotify
- **Debug**: Check console logs for individual search failures
- **Likely Issue**: OCR extracted non-artist text (dates, sponsors, etc.)

## Deployment (Vercel)

**Steps**:
1. Push to GitHub (ensure `.env` and `google-credentials.json` in `.gitignore`)
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Update `SPOTIFY_REDIRECT_URI` to production URL
5. Add production redirect URI to Spotify Dashboard

**Environment Variables in Vercel**:
- All variables from `.env`
- `GOOGLE_APPLICATION_CREDENTIALS`: Upload JSON file or paste contents
- Update `SPOTIFY_REDIRECT_URI` to `https://your-domain.vercel.app/api/auth/callback`

## Testing Checklist

1. **Auth Flow**: Login → Callback → Redirect to /upload
2. **Image Analysis**: Upload poster → Verify artist list accuracy
3. **Playlist Creation**: Create playlist → Verify tracks in Spotify
4. **Rate Limiting**: Test with 50+ artist poster (should complete without 429 errors)
5. **Error States**: Test with non-image file, expired auth, etc.

## MVP Constraints & V2 Backlog

**Intentionally NOT Included** (by design):
- Artist ranking by font size (all artists treated equally)
- Manual artist review/editing before playlist creation
- Apple Music integration
- Database or caching
- Job queue/async processing (all synchronous)
- User history or saved playlists

**Future Improvements** (see ARCHITECTURE.md):
- Font size analysis using Vision API bounding boxes
- Manual artist editing screen
- Redis caching for Spotify search results
- Async job queue for large posters
- User accounts and playlist history
