# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Posters is a Next.js application that converts festival poster images into Spotify playlists using AI. It's a stateless MVP built for speed, supporting two image analysis providers:
- **Google Cloud Vision API** (OCR-based): Traditional text extraction with heuristic filtering
- **Gemini 2.0 Flash** (Vision-first AI): Direct image analysis with intelligent artist ranking by visual prominence

Both providers integrate with Spotify Web API for playlist creation. Switch providers via environment variable.

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
# Spotify API
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback  # MUST use 127.0.0.1

# Image Analysis Provider (choose one: 'vision' or 'gemini')
IMAGE_ANALYSIS_PROVIDER=vision

# Google Cloud Vision API (used when IMAGE_ANALYSIS_PROVIDER=vision)
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# Google Gemini API (used when IMAGE_ANALYSIS_PROVIDER=gemini)
GEMINI_API_KEY=<from https://ai.google.dev>

# Next.js
NEXTAUTH_URL=http://127.0.0.1:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
```

**Critical**:
- Spotify OAuth requires `127.0.0.1` (not `localhost`) due to recent Spotify policy changes.
- Set `IMAGE_ANALYSIS_PROVIDER=gemini` to enable artist ranking by visual prominence

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14 + React 18 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Auth**: OAuth 2.0 with httpOnly cookies (no database)
- **Image Analysis**:
  - Google Cloud Vision API (OCR + filtering)
  - Gemini 2.0 Flash (vision-first AI with ranking)
- **External Services**: Spotify Web API

### Key Directories
- `src/pages/` - Frontend pages + API routes
- `src/lib/` - Shared business logic (auth, spotify, ocr)
- `src/types/` - TypeScript interfaces
- `src/styles/` - Global styles

### Data Flow: Image → Playlist

```
1. User uploads image → POST /api/analyze
   ├─ Formidable parses multipart form
   ├─ Check IMAGE_ANALYSIS_PROVIDER environment variable
   │
   ├─ IF provider='vision':
   │  ├─ Google Vision API extracts text via OCR
   │  ├─ parseArtistsFromText() applies 10 heuristic filters
   │  └─ Returns Artist[] (weight: undefined)
   │
   └─ IF provider='gemini':
      ├─ Gemini 2.0 Flash analyzes image with vision
      ├─ Few-shot prompt guides artist extraction
      ├─ Returns Artist[] with weight scores (1-10)
      └─ Artists ranked by font size/position

2. User sees artist list (sorted by weight if available)
   ├─ Vision API: Flat list, no ranking
   └─ Gemini: Weighted list with tier badges (headliner/sub-headliner/mid-tier/undercard)

3. User clicks create → POST /api/create-playlist
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

## Image Analysis Methods

### Vision API Approach (`src/lib/ocr.ts`)

Traditional OCR with heuristic filtering. The `parseArtistsFromText()` function applies 10 filters:

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

**Accuracy**: ~60-80% depending on poster quality. **No artist ranking** (all artists treated equally).

### Gemini Approach (`src/lib/gemini.ts`)

Vision-first AI analysis with intelligent ranking. Uses few-shot prompting with 3 examples:
- Example 1: Clean poster (demonstrates basic weighting)
- Example 2: Merged text (demonstrates text separation)
- Example 3: Poster noise (demonstrates filtering non-artists)

**Analysis Process**:
1. Image sent directly to Gemini 2.0 Flash (no OCR step)
2. AI analyzes visual hierarchy: font size, position, styling
3. Returns Artist[] with:
   - `weight`: 1-10 prominence score (10=headliner, 1=undercard)
   - `tier`: "headliner" | "sub-headliner" | "mid-tier" | "undercard"
   - `reasoning`: Why this weight was assigned

**Accuracy**: ~80-95% depending on poster quality. **Includes artist ranking** by visual prominence.

**Retry Logic**: 3 attempts with exponential backoff on API failures.

**Cost**: ~$0.0001 per poster analysis (very cheap!).

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
- **Returns**: `{ artists: Artist[], rawText: string, provider: 'vision' | 'gemini' }`
  - **Artist type**: `{ name: string, weight?: number, tier?: string, reasoning?: string }`
  - Vision API: weight/tier/reasoning are `undefined`
  - Gemini: All fields populated with ranking data
- **Max File Size**: 10MB
- **Process**:
  - Vision: Upload → OCR → Filter noise → Return artist list
  - Gemini: Upload → Vision analysis → AI ranking → Return weighted artist list

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

## Image Analysis Provider Setup

### Google Cloud Vision Setup

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

### Gemini Setup

**Authentication**: API key from Google AI Studio (environment variable)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
```

**Getting API Key**:
1. Visit https://ai.google.dev
2. Create or select a project
3. Generate API key
4. Add to `.env`: `GEMINI_API_KEY=your_key_here`

**Request Pattern**:
```typescript
// Convert image buffer to base64
const imageBase64 = imageBuffer.toString('base64');
const imagePart = {
  inlineData: {
    data: imageBase64,
    mimeType: 'image/jpeg',
  },
};

// Send prompt + image
const result = await model.generateContent([FEW_SHOT_PROMPT, imagePart]);
const response = await result.response;
const responseText = response.text();
```

**Response Parsing**: Extracts JSON from markdown code blocks or raw response (see `src/lib/gemini.ts:parseGeminiResponse()`).

**Logging**: Full Gemini response and extracted artists logged to console for debugging.

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

### "Failed to analyze image" (Vision API)
- **Cause**: Google Cloud Vision API error
- **Debug**: Check console for Vision API response logs
- **Common Issues**:
  - `google-credentials.json` missing or invalid path
  - Billing not enabled on Google Cloud project
  - Vision API not enabled

### "Gemini analysis failed" / "GEMINI_API_KEY environment variable is not set"
- **Cause**: Gemini API configuration issue
- **Debug**: Check console for Gemini response logs
- **Common Issues**:
  - `GEMINI_API_KEY` not set in `.env`
  - API key invalid or expired
  - Gemini API quota exceeded (unlikely at ~$0.0001/request)
  - Network connectivity issues
- **Fix**: Verify API key at https://ai.google.dev
- **Retry**: Built-in retry logic with exponential backoff (3 attempts)

### "Could not parse Gemini response as JSON"
- **Cause**: Gemini returned malformed JSON or unexpected format
- **Debug**: Check console for raw Gemini response
- **Fallback**: Code attempts to extract artist names from partial JSON
- **Fix**: Usually resolves on retry (automatic)

### "Could not find any tracks"
- **Cause**: All artist searches failed on Spotify
- **Debug**: Check console logs for individual search failures
- **Likely Issue**:
  - Vision API: OCR extracted non-artist text (dates, sponsors, etc.)
  - Gemini: Poster had no recognizable artists or very low quality image

## Deployment (Vercel)

**Steps**:
1. Push to GitHub (ensure `.env` and `google-credentials.json` in `.gitignore`)
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Update `SPOTIFY_REDIRECT_URI` to production URL
5. Add production redirect URI to Spotify Dashboard

**Environment Variables in Vercel**:
- All variables from `.env`
- `IMAGE_ANALYSIS_PROVIDER`: Set to `vision` or `gemini`
- `GOOGLE_APPLICATION_CREDENTIALS`: Upload JSON file or paste contents (if using Vision API)
- `GEMINI_API_KEY`: Add API key from https://ai.google.dev (if using Gemini)
- Update `SPOTIFY_REDIRECT_URI` to `https://your-domain.vercel.app/api/auth/callback`

**Recommendation**: Start with `IMAGE_ANALYSIS_PROVIDER=gemini` for better accuracy and artist ranking.

## Testing Checklist

1. **Auth Flow**: Login → Callback → Redirect to /upload
2. **Image Analysis (Vision API)**: Set `IMAGE_ANALYSIS_PROVIDER=vision` → Upload poster → Verify artist list (no weights)
3. **Image Analysis (Gemini)**: Set `IMAGE_ANALYSIS_PROVIDER=gemini` → Upload poster → Verify weighted artist list with tier badges
4. **Playlist Creation**: Create playlist → Verify tracks in Spotify
5. **Rate Limiting**: Test with 50+ artist poster (should complete without 429 errors)
6. **Error States**: Test with non-image file, expired auth, etc.
7. **Provider Comparison**: Same poster on both providers → Compare results

## MVP Constraints & V2 Backlog

**Intentionally NOT Included** (by design):
- Manual artist review/editing before playlist creation
- Apple Music integration
- Database or caching
- Job queue/async processing (all synchronous)
- User history or saved playlists

**Currently Available with Provider Choice**:
- ✅ **Artist ranking by visual prominence** (Gemini only)
  - Vision API: All artists treated equally
  - Gemini: Weighted ranking with tier badges

**Future Improvements** (see ARCHITECTURE.md):
- Manual artist editing screen
- Redis caching for Spotify search results
- Async job queue for large posters
- User accounts and playlist history
- Hybrid mode: Use both providers and merge results
