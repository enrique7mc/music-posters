# Code Quality Improvements Roadmap

This document outlines code quality improvements for the Music Posters project, organized by priority.

---

## Priority 1: Critical (Production Blockers)

### 1. Input Validation & Security

**Estimated Time**: 2-3 days
**Impact**: High - Prevents injection attacks, rate limit abuse, malformed requests

#### Current Problem

- No schema validation on API routes
- Trusts all user input without sanitization
- Vulnerable to malicious file uploads
- No validation on playlist names or artist data

#### Current Code Example

```typescript
// analyze.ts - No file content validation
const imageFile = files.image?.[0];

// create-playlist.ts - No validation
const { artists, playlistName } = req.body;
```

#### Recommended Solution

```typescript
// Install Zod for schema validation
npm install zod

// Create validation schemas
import { z } from 'zod';

const createPlaylistSchema = z.object({
  artists: z.array(z.object({
    name: z.string().min(1).max(100),
    weight: z.number().min(1).max(10).optional(),
    tier: z.enum(['headliner', 'sub-headliner', 'mid-tier', 'undercard']).optional()
  })).max(100),
  playlistName: z.string().min(1).max(100).optional()
});

// Use in API routes
try {
  const validated = createPlaylistSchema.parse(req.body);
} catch (error) {
  return res.status(400).json({ error: 'Invalid input' });
}
```

#### Files to Update

- `src/pages/api/analyze.ts` - File upload validation
- `src/pages/api/create-playlist.ts` - Playlist data validation
- `src/pages/api/search-tracks.ts` - Artist array validation
- Create `src/lib/validation.ts` - Shared validation schemas

#### Implementation Checklist

- [ ] Install Zod: `npm install zod`
- [ ] Create `src/lib/validation.ts` with all schemas
- [ ] Add file type validation using magic bytes (install `file-type`)
- [ ] Validate file size before processing
- [ ] Add validation to all POST endpoints
- [ ] Add validation error messages to frontend
- [ ] Test with malicious inputs

---

### 2. Testing Infrastructure

**Estimated Time**: 1 week
**Impact**: High - Enables safe refactoring, catches regressions, improves reliability

#### Current Problem

- **0% test coverage** - No test files exist
- Cannot safely refactor code
- No automated regression detection
- Manual testing only

#### Recommended Solution

```bash
# Install testing dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
npm install -D msw # Mock Service Worker for API mocking
```

#### Testing Strategy

**Unit Tests (Priority):**

```typescript
// src/lib/__tests__/spotify.test.ts
describe('searchAndGetTopTracks', () => {
  it('should handle rate limiting correctly', async () => {});
  it('should return empty array when no artists match', async () => {});
  it('should apply per-artist track counts', async () => {});
  it('should handle Spotify API errors gracefully', async () => {});
});

// src/lib/__tests__/ocr.test.ts
describe('parseArtistsFromText', () => {
  it('should filter out dates', () => {});
  it('should remove duplicate artists', () => {});
  it('should handle merged text', () => {});
  it('should filter festival keywords', () => {});
});

// src/lib/__tests__/gemini.test.ts
describe('analyzeImageWithGemini', () => {
  it('should parse weighted artists correctly', () => {});
  it('should retry on API failures', () => {});
  it('should handle malformed responses', () => {});
});
```

**Integration Tests:**

```typescript
// src/__tests__/api/analyze.test.ts
describe('POST /api/analyze', () => {
  it('should return 401 when not authenticated', async () => {});
  it('should return 405 for non-POST requests', async () => {});
  it('should extract artists from poster image', async () => {});
  it('should reject files larger than 10MB', async () => {});
});
```

**Component Tests:**

```typescript
// src/__tests__/components/upload.test.tsx
describe('Upload Page', () => {
  it('should redirect when not authenticated', () => {});
  it('should display artist list after analysis', () => {});
  it('should show loading state during analysis', () => {});
});
```

#### Implementation Checklist

- [ ] Install testing dependencies (vitest, testing-library)
- [ ] Create `vitest.config.ts`
- [ ] Add test scripts to `package.json`
- [ ] Write tests for `src/lib/spotify.ts` (80% coverage goal)
- [ ] Write tests for `src/lib/ocr.ts` (80% coverage goal)
- [ ] Write tests for `src/lib/gemini.ts` (80% coverage goal)
- [ ] Write integration tests for API routes
- [ ] Write component tests for upload and review-tracks pages
- [ ] Set up MSW for mocking external APIs
- [ ] Add GitHub Actions workflow for CI testing
- [ ] Add coverage reporting

#### Test Coverage Goal

- **Target**: 80% coverage on `src/lib/` (business logic)
- **Minimum**: 60% overall coverage

---

### 3. Type Safety Cleanup

**Estimated Time**: 1 day
**Impact**: Medium-High - Catches bugs at compile time, improves developer experience

#### Current Problem

- **15+ instances of `any` type** - Loses TypeScript benefits
- Missing API response types from external services
- Implicit types in callbacks
- No runtime validation of API responses

#### Locations to Fix

**useState with any:**

```typescript
// src/pages/upload.tsx:69
const [user, setUser] = useState<any>(null);
// Fix: const [user, setUser] = useState<SpotifyUser | null>(null);
```

**Error handling with any:**

```typescript
// src/pages/review-tracks.tsx:139
catch (err: any) {
  setError(err.response?.data?.error || 'Failed');
}
// Fix: catch (err: unknown) with proper type narrowing
```

**Spotify API responses:**

```typescript
// src/lib/spotify.ts:309
response.data.items.map((item: any) => ({...}))
// Fix: Create SpotifySearchResponse interface
```

**Gemini responses:**

```typescript
// src/lib/gemini.ts:228
limitedTracks.map((track: any) => ({...}))
// Fix: Create SpotifyTrackObject interface
```

#### Recommended Solution

**Create Spotify API type definitions:**

```typescript
// src/types/spotify.ts
export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images?: Array<{
    url: string;
    height: number;
    width: number;
  }>;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  type: 'artist';
  uri: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: SpotifyArtist[];
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  preview_url: string | null;
  duration_ms: number;
}

export interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
    total: number;
  };
}
```

**Create error types:**

```typescript
// src/types/errors.ts
export interface ApiError {
  response?: {
    status: number;
    data: {
      error: string;
    };
  };
  message: string;
}

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'response' in error;
}
```

**Use typed Axios calls:**

```typescript
// Instead of:
const response = await axios.post('/api/analyze', formData);

// Use:
const response = await axios.post<AnalyzeResponse>('/api/analyze', formData);
```

#### Implementation Checklist

- [ ] Create `src/types/spotify.ts` with all Spotify API types
- [ ] Create `src/types/errors.ts` with error handling types
- [ ] Fix all `any` types in useState hooks
- [ ] Fix all `any` types in catch blocks with proper type guards
- [ ] Add generic types to all Axios calls
- [ ] Add types to all `.map()` callbacks
- [ ] Update `src/types/index.ts` with exports
- [ ] Run TypeScript compiler in strict mode: `npx tsc --noEmit`
- [ ] Fix any new errors revealed by strict mode

---

### 4. Rate Limiting

**Estimated Time**: 1 day
**Impact**: High - Prevents API abuse, protects against quota exhaustion

#### Current Problem

- No rate limiting on API routes
- Can spam `/api/analyze` to exhaust Gemini quota ($)
- Can spam `/api/create-playlist` to abuse Spotify API
- No protection against DDoS or malicious users

#### Recommended Solution

```bash
# Install rate limiting library
npm install next-rate-limit

# Or use upstash/ratelimit for serverless
npm install @upstash/ratelimit @upstash/redis
```

**Implementation:**

```typescript
// src/lib/rate-limit.ts
import rateLimit from 'next-rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 users per minute
});

export async function applyRateLimit(req: NextApiRequest, res: NextApiResponse) {
  try {
    await limiter.check(res, 10, 'RATE_LIMIT_TOKEN'); // 10 requests per minute
  } catch {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }
}
```

**Apply to sensitive endpoints:**

```typescript
// src/pages/api/analyze.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await applyRateLimit(req, res);

  // Rest of handler...
}
```

#### Rate Limits by Endpoint

- `/api/analyze` - 5 requests per minute (expensive Gemini API calls)
- `/api/create-playlist` - 10 requests per minute
- `/api/search-tracks` - 10 requests per minute
- `/api/auth/*` - 20 requests per minute

#### Implementation Checklist

- [ ] Install rate limiting library
- [ ] Create `src/lib/rate-limit.ts` with configuration
- [ ] Apply rate limiting to `/api/analyze` (5 req/min)
- [ ] Apply rate limiting to `/api/create-playlist` (10 req/min)
- [ ] Apply rate limiting to `/api/search-tracks` (10 req/min)
- [ ] Add user-friendly error messages for rate limit errors
- [ ] Test rate limiting with automated requests
- [ ] Document rate limits in API documentation
- [ ] Consider IP-based limiting for unauthenticated routes

---

## Priority 2: Important (Quality of Life)

### 5. Component Extraction

**Estimated Time**: 2-3 days
**Impact**: Medium-High - Improves maintainability, enables testing, reduces complexity

#### Current Problem

- `upload.tsx` is **738 lines** - too large to maintain
- `review-tracks.tsx` is **474 lines** - difficult to test
- Multiple responsibilities in single files
- Difficult to reuse UI logic
- Hard to test individual features

#### Large Files to Refactor

**upload.tsx (738 lines):**

- File upload section (~80 lines)
- Artist list display (~150 lines)
- Track count configurator (~120 lines)
- Advanced settings panel (~80 lines)
- Loading animations (~50 lines)
- Helper functions (~50 lines)

**review-tracks.tsx (474 lines):**

- Track cards (~100 lines)
- Tier filtering (~80 lines)
- Playlist creation (~100 lines)
- Track statistics (~60 lines)

#### Recommended Structure

```
src/components/
├── upload/
│   ├── FileUploadSection.tsx       # File upload UI
│   ├── ArtistListPanel.tsx         # Artist display & editing
│   ├── TrackCountConfigurator.tsx  # Track count settings
│   ├── AdvancedSettings.tsx        # Collapsible settings
│   └── LoadingAnimation.tsx        # Rotating messages
├── playlist/
│   ├── TrackCard.tsx               # Individual track display
│   ├── TierFilter.tsx              # Filter by tier
│   ├── PlaylistStats.tsx           # Track statistics
│   └── CreatePlaylistButton.tsx    # Create button logic
└── shared/
    ├── TierBadge.tsx               # Tier badge component
    ├── ErrorMessage.tsx            # Error display
    └── LoadingSpinner.tsx          # Loading UI
```

#### Example Component Extraction

**Before (upload.tsx):**

```typescript
// 100+ lines of file upload logic mixed with other concerns
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  // ... 50 lines of logic
};

return (
  <div>
    <input type="file" onChange={handleFileUpload} />
    {/* ... 50 more lines */}
  </div>
);
```

**After (components/upload/FileUploadSection.tsx):**

```typescript
interface FileUploadSectionProps {
  onAnalyze: (artists: Artist[], provider: string) => void;
  analyzing: boolean;
}

export function FileUploadSection({ onAnalyze, analyzing }: FileUploadSectionProps) {
  // Isolated file upload logic
  // Easier to test
  // Reusable across pages
}
```

#### Implementation Checklist

- [ ] Create `src/components/` directory structure
- [ ] Extract `FileUploadSection` from upload.tsx
- [ ] Extract `ArtistListPanel` from upload.tsx
- [ ] Extract `TrackCountConfigurator` from upload.tsx
- [ ] Extract `AdvancedSettings` from upload.tsx
- [ ] Extract `LoadingAnimation` from upload.tsx
- [ ] Extract `TrackCard` from review-tracks.tsx
- [ ] Extract `TierFilter` from review-tracks.tsx
- [ ] Extract `PlaylistStats` from review-tracks.tsx
- [ ] Create shared `TierBadge` component
- [ ] Create shared `ErrorMessage` component
- [ ] Update imports in page files
- [ ] Write unit tests for extracted components
- [ ] Verify UI behavior unchanged

#### Benefits

- **Testability**: Can test components in isolation
- **Reusability**: Use components across multiple pages
- **Readability**: Smaller files easier to understand
- **Maintainability**: Changes isolated to specific components
- **Performance**: Can optimize individual components

---

### 6. Error Handling System

**Estimated Time**: 2 days
**Impact**: Medium - Improves user experience, easier debugging

#### Current Problem

- Inconsistent error messages (string vs object)
- No retry mechanism on frontend
- No global error boundary (one bad component crashes app)
- Errors don't persist across navigation
- No error recovery guidance for users

#### Current Approach

```typescript
// Inconsistent error handling
catch (err: any) {
  setError('Failed to analyze image'); // Generic message
}

// Lost on navigation
const [error, setError] = useState<string | null>(null);
```

#### Recommended Solution

**1. Create typed error system:**

```typescript
// src/types/errors.ts
export type AppErrorCode =
  | 'SPOTIFY_RATE_LIMIT'
  | 'AUTH_EXPIRED'
  | 'ANALYSIS_FAILED'
  | 'NETWORK_ERROR'
  | 'INVALID_FILE'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string; // User-friendly message
  retryable: boolean;
  technicalDetails?: string; // For logging
  action?: () => void; // Recovery action
}

export function createAppError(
  code: AppErrorCode,
  message: string,
  retryable: boolean,
  technicalDetails?: string
): AppError {
  return { code, message, retryable, technicalDetails };
}
```

**2. Create error boundary:**

```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
    // Send to error tracking service (Sentry)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h1>Something went wrong</h1>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**3. Add retry logic:**

```typescript
// src/hooks/useRetry.ts
export function useRetry<T>(fn: () => Promise<T>, maxRetries: number = 3, delayMs: number = 1000) {
  const [retries, setRetries] = useState(0);

  const execute = async (): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        setRetries((prev) => prev + 1);
        return execute();
      }
      throw error;
    }
  };

  return { execute, retries };
}
```

**4. Error display component:**

```typescript
// src/components/shared/ErrorMessage.tsx
interface ErrorMessageProps {
  error: AppError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  return (
    <div className={`error-message ${error.retryable ? 'retryable' : ''}`}>
      <p>{error.message}</p>
      {error.retryable && onRetry && (
        <button onClick={onRetry}>Try Again</button>
      )}
      {onDismiss && (
        <button onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  );
}
```

#### Implementation Checklist

- [ ] Create `src/types/errors.ts` with error types
- [ ] Create `src/components/ErrorBoundary.tsx`
- [ ] Wrap `_app.tsx` with ErrorBoundary
- [ ] Create `src/hooks/useRetry.ts`
- [ ] Create `src/components/shared/ErrorMessage.tsx`
- [ ] Update all catch blocks to use typed errors
- [ ] Add retry logic to image analysis
- [ ] Add retry logic to playlist creation
- [ ] Add error recovery guidance ("Try logging in again")
- [ ] Test error scenarios (network failure, auth expired, etc.)

---

### 7. Constants File

**Estimated Time**: 1 hour
**Impact**: Low-Medium - Improves maintainability, reduces errors

#### Current Problem

- Magic numbers scattered throughout codebase
- Hard to change configuration values
- No single source of truth
- Difficult to understand what numbers mean

#### Examples of Magic Numbers

```typescript
// spotify.ts - What are 3 and 1000?
processBatch(artists, searchArtist, 3, 1000);

// upload.tsx - Why 3?
setCustomTrackCount(3);

// analyze.ts - What's this size limit?
maxFileSize: 10 * 1024 * 1024;

// Multiple places - Track count logic duplicated
if (tier === 'headliner') return 10;
if (tier === 'sub-headliner') return 5;
```

#### Recommended Solution

```typescript
// src/lib/constants.ts

/**
 * Spotify API rate limiting configuration
 * Limit: 180 requests per minute
 */
export const SPOTIFY_RATE_LIMIT = {
  BATCH_SIZE: 3, // Parallel requests per batch
  DELAY_MS: 1000, // Delay between batches
  MAX_REQUESTS_PER_MINUTE: 180,
} as const;

/**
 * Track count per artist tier
 */
export const TIER_TRACK_COUNTS = {
  headliner: 10,
  'sub-headliner': 5,
  'mid-tier': 3,
  undercard: 1,
  default: 3,
} as const;

/**
 * File upload configuration
 */
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'] as const,
} as const;

/**
 * Tier weight ranges for artist classification
 */
export const TIER_WEIGHTS = {
  HEADLINER_MIN: 8,
  SUB_HEADLINER_MIN: 6,
  MID_TIER_MIN: 4,
  UNDERCARD_MIN: 1,
} as const;

/**
 * UI configuration
 */
export const UI_CONFIG = {
  LOADING_MESSAGE_INTERVAL: 2000, // 2 seconds
  MAX_ARTIST_DISPLAY: 100,
  DEFAULT_PLAYLIST_NAME: 'Festival Playlist',
} as const;

/**
 * API timeouts
 */
export const TIMEOUTS = {
  IMAGE_ANALYSIS: 60000, // 60 seconds
  PLAYLIST_CREATION: 120000, // 2 minutes
  SPOTIFY_SEARCH: 5000, // 5 seconds per search
} as const;

/**
 * Gemini API configuration
 */
export const GEMINI_CONFIG = {
  MODEL: 'gemini-2.0-flash-exp',
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  RETRY_BACKOFF: 2, // Exponential backoff multiplier
} as const;

/**
 * Playlist limits
 */
export const PLAYLIST_LIMITS = {
  MAX_ARTISTS: 100,
  MAX_TRACKS_PER_REQUEST: 100, // Spotify API limit
  MAX_PLAYLIST_NAME_LENGTH: 100,
} as const;
```

#### Usage Example

```typescript
// Before
processBatch(artists, searchArtist, 3, 1000);

// After
import { SPOTIFY_RATE_LIMIT } from '@/lib/constants';
processBatch(artists, searchArtist, SPOTIFY_RATE_LIMIT.BATCH_SIZE, SPOTIFY_RATE_LIMIT.DELAY_MS);
```

#### Implementation Checklist

- [ ] Create `src/lib/constants.ts`
- [ ] Add all configuration constants with JSDoc comments
- [ ] Replace magic numbers in `src/lib/spotify.ts`
- [ ] Replace magic numbers in `src/pages/upload.tsx`
- [ ] Replace magic numbers in `src/pages/api/analyze.ts`
- [ ] Replace magic numbers in `src/lib/gemini.ts`
- [ ] Add type exports for constant values
- [ ] Update imports across codebase
- [ ] Verify no hardcoded values remain

---

## Priority 3: Nice to Have (Polish)

### 8. Performance Optimizations

**Estimated Time**: 3-4 days
**Impact**: Medium - Faster load times, better user experience

#### Current Issues

**1. Large Image Uploads (No Compression)**

```typescript
// Current: Sends full-resolution images
// 10MB poster = 10MB upload

// Solution: Client-side compression
npm install browser-image-compression

import imageCompression from 'browser-image-compression';

const compressed = await imageCompression(file, {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true
});
```

**2. No Response Caching**

```typescript
// Current: Every artist search hits Spotify API
// Same artist searched multiple times = wasted API calls

// Solution: Add caching layer
// Option 1: Memory cache (simple, stateless)
// Option 2: Redis (persistent, shared)

// src/lib/cache.ts
const cache = new Map<string, { data: any; expires: number }>();

export function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item || item.expires < Date.now()) return null;
  return item.data;
}
```

**3. No Code Splitting**

```typescript
// Current: All pages load entire codebase
// Gemini library loads even on pages that don't use it

// Solution: Dynamic imports
const Gemini = dynamic(() => import('@/lib/gemini'), { ssr: false });

// Only load when needed
if (provider === 'gemini') {
  const gemini = await import('@/lib/gemini');
  result = await gemini.analyzeImage(buffer);
}
```

**4. Unoptimized Images**

```typescript
// Current: Using <img> tags
<img src={track.albumArt} alt={track.name} />

// Solution: Use Next.js Image component
import Image from 'next/image';

<Image
  src={track.albumArt}
  alt={track.name}
  width={200}
  height={200}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/..." // Base64 tiny image
/>
```

**5. Large sessionStorage Payloads**

```typescript
// Current: Stores full track objects
// 50 tracks × 10 fields × 100 bytes = 50KB

// Solution: Compress or use IndexedDB
import { compress, decompress } from 'lz-string';

sessionStorage.setItem('tracks', compress(JSON.stringify(tracks)));
```

#### Implementation Checklist

- [ ] Install `browser-image-compression`
- [ ] Add image compression on file upload
- [ ] Create `src/lib/cache.ts` for response caching
- [ ] Add caching to Spotify artist searches
- [ ] Implement dynamic imports for heavy libraries
- [ ] Replace all `<img>` tags with Next.js `<Image>`
- [ ] Add lazy loading to track cards
- [ ] Compress sessionStorage data with lz-string
- [ ] Add performance monitoring (Web Vitals)
- [ ] Measure before/after performance improvements

#### Expected Performance Gains

- **Image upload**: 70-90% reduction in upload time
- **Spotify searches**: 50% faster for repeat artists
- **Page load**: 30% faster with code splitting
- **Image rendering**: Faster with Next.js Image optimization

---

### 9. Error Tracking

**Estimated Time**: 1 day
**Impact**: Medium - Better visibility into production errors

#### Current Problem

- Production errors invisible to developers
- No way to know what's breaking for users
- Manual bug reports only source of error information
- No stack traces or user context

#### Recommended Solution

```bash
# Install Sentry for Next.js
npm install @sentry/nextjs

# Run setup wizard
npx @sentry/wizard@latest -i nextjs
```

**Configuration:**

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions
  debug: false,
  environment: process.env.NODE_ENV,

  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    return event;
  },
});

// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  environment: process.env.NODE_ENV,
});
```

**Usage in Components:**

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  await analyzeImage(file);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'ImageUpload',
      provider: imageProvider,
    },
    extra: {
      fileSize: file.size,
      fileType: file.type,
    },
  });
  throw error;
}
```

**Custom Error Tracking:**

```typescript
// Track custom events
Sentry.captureMessage('User created large playlist', {
  level: 'info',
  extra: {
    artistCount: artists.length,
    trackCount: tracks.length,
  },
});
```

#### Implementation Checklist

- [ ] Create Sentry account (free tier)
- [ ] Install `@sentry/nextjs`
- [ ] Run Sentry setup wizard
- [ ] Configure `sentry.client.config.ts`
- [ ] Configure `sentry.server.config.ts`
- [ ] Add Sentry DSN to environment variables
- [ ] Add error capture to critical paths (image analysis, playlist creation)
- [ ] Add custom event tracking for user actions
- [ ] Test error reporting in staging environment
- [ ] Set up Sentry alerts for critical errors
- [ ] Document error tracking in CLAUDE.md

#### What You'll Get

- Real-time error notifications
- Stack traces with source maps
- User session replay (optional)
- Performance monitoring
- Release tracking
- Error frequency and trends

---

### 10. File Validation

**Estimated Time**: 1 day
**Impact**: Low-Medium - Better security, prevents processing invalid files

#### Current Problem

- Only validates MIME type from upload (can be spoofed)
- No verification of actual file content
- Could process malicious files disguised as images
- No protection against corrupted files

#### Current Code

```typescript
// analyze.ts - Only checks MIME type
const imageFile = files.image?.[0];
if (!imageFile.mimetype?.startsWith('image/')) {
  return res.status(400).json({ error: 'File must be an image' });
}
// But MIME type can be forged!
```

#### Recommended Solution

```bash
# Install file type detection library
npm install file-type
```

**Implementation:**

```typescript
// src/lib/file-validation.ts
import { fileTypeFromBuffer } from 'file-type';
import { FILE_UPLOAD } from './constants';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
}

export async function validateImageFile(
  buffer: Buffer,
  claimedMimeType?: string
): Promise<FileValidationResult> {
  // Check file size
  if (buffer.length > FILE_UPLOAD.MAX_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${FILE_UPLOAD.MAX_SIZE / 1024 / 1024}MB`,
    };
  }

  // Detect actual file type using magic bytes
  const detectedType = await fileTypeFromBuffer(buffer);

  if (!detectedType) {
    return {
      valid: false,
      error: 'Could not determine file type',
    };
  }

  // Verify it's an allowed image type
  if (!FILE_UPLOAD.ALLOWED_TYPES.includes(detectedType.mime)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${FILE_UPLOAD.ALLOWED_TYPES.join(', ')}`,
      detectedType: detectedType.mime,
    };
  }

  // Verify claimed type matches actual type (detect spoofing)
  if (claimedMimeType && claimedMimeType !== detectedType.mime) {
    console.warn(`MIME type mismatch: claimed=${claimedMimeType}, actual=${detectedType.mime}`);
  }

  return {
    valid: true,
    detectedType: detectedType.mime,
  };
}

export function validateFileName(fileName: string): FileValidationResult {
  // Check file extension
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (!ext || !FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed: ${FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid file name',
    };
  }

  return { valid: true };
}
```

**Usage in API:**

```typescript
// src/pages/api/analyze.ts
import { validateImageFile, validateFileName } from '@/lib/file-validation';

const imageFile = files.image?.[0];

// Validate file name
const nameValidation = validateFileName(imageFile.originalFilename || '');
if (!nameValidation.valid) {
  fs.unlinkSync(imageFile.filepath);
  return res.status(400).json({ error: nameValidation.error });
}

// Read file and validate content
const imageBuffer = fs.readFileSync(imageFile.filepath);
const validation = await validateImageFile(imageBuffer, imageFile.mimetype);

if (!validation.valid) {
  fs.unlinkSync(imageFile.filepath);
  return res.status(400).json({ error: validation.error });
}

console.log(`Validated file type: ${validation.detectedType}`);
```

#### Implementation Checklist

- [ ] Install `file-type` package
- [ ] Create `src/lib/file-validation.ts`
- [ ] Implement `validateImageFile()` function
- [ ] Implement `validateFileName()` function
- [ ] Add validation to `/api/analyze` endpoint
- [ ] Add validation before processing in Gemini/Vision
- [ ] Add file type constants to `constants.ts`
- [ ] Test with valid images (JPEG, PNG, WebP)
- [ ] Test with invalid files (PDF, TXT, renamed files)
- [ ] Test with corrupted files
- [ ] Add user-friendly error messages
- [ ] Document supported file types in UI

#### Security Benefits

- Prevents processing of malicious files
- Detects file type spoofing attempts
- Validates file integrity before expensive API calls
- Protects against path traversal attacks

---

## Implementation Priority Summary

### Week 1: Critical Security & Quality

1. **Day 1-3**: Input Validation & Security (#1)
2. **Day 4-5**: Rate Limiting (#4) + Constants File (#7)

### Week 2: Testing & Type Safety

1. **Day 1-5**: Testing Infrastructure (#2)
2. **Day 5**: Type Safety Cleanup (#3)

### Week 3: Architecture & Polish

1. **Day 1-3**: Component Extraction (#5)
2. **Day 4**: Error Handling System (#6)
3. **Day 5**: File Validation (#10)

### Week 4: Performance & Monitoring

1. **Day 1-3**: Performance Optimizations (#8)
2. **Day 4**: Error Tracking (#9)
3. **Day 5**: Final testing & documentation

---

## Testing Each Improvement

### Validation Checklist

- [ ] All TypeScript errors resolved
- [ ] No new console errors
- [ ] Existing features still work
- [ ] Tests pass (after #2)
- [ ] Performance hasn't degraded
- [ ] Documentation updated
- [ ] Code reviewed

### Integration Testing

After implementing multiple improvements, test:

1. Full authentication flow
2. Image upload → analysis → playlist creation
3. Error scenarios (invalid input, network failure, etc.)
4. Rate limiting behavior
5. Performance under load

---

## Metrics to Track

### Code Quality Metrics

- TypeScript strict mode compliance: 100%
- Test coverage: 80%+ on business logic
- Bundle size: Monitor for increases
- Build time: Should remain <30s

### Performance Metrics

- Image upload time: Target <2s for compressed images
- Analysis time: Gemini ~5-10s, Vision ~10-20s
- Playlist creation: ~1s per 3 artists (rate limited)
- Page load time: <1s (LCP <2.5s)

### Error Tracking Metrics

- Error rate: <1% of sessions
- Time to resolution: <24 hours for critical errors
- User-reported bugs: Should decrease over time

---

## Documentation Updates

After each improvement, update:

- [ ] `CLAUDE.md` - Add new patterns and conventions
- [ ] `README.md` - Update setup instructions if needed
- [ ] Code comments - Add JSDoc to new functions
- [ ] Type definitions - Document complex types
- [ ] Environment variables - Document new vars in `.env.example`

---

## Long-term Maintenance

### Monthly Tasks

- Review error tracking dashboard
- Update dependencies
- Review test coverage reports
- Monitor performance metrics

### Quarterly Tasks

- Audit security dependencies
- Review and update constants
- Refactor code smells
- Performance optimization pass

---

## Questions or Issues?

If you encounter issues while implementing these improvements:

1. Check existing tests for usage examples
2. Review similar implementations in the codebase
3. Consult documentation in `CLAUDE.md`
4. Test in isolation before integrating
5. Ask for code review before merging

---

**Total Estimated Time**: 4 weeks for all improvements
**Recommended Approach**: Implement in priority order, test thoroughly after each change
