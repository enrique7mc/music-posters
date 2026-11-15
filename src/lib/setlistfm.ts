/**
 * Setlist.fm client for the "Prefer tour setlists" toggle (server only).
 * API docs: https://api.setlist.fm/docs/1.0/index.html
 *
 * - One search call per artist (`/search/setlists?artistName=`), plus a second
 *   page when page 1 has fewer than MIN_PAGE1_QUALIFYING Qualifying Setlists.
 * - Module-level limiter: at most 4 request starts per second, 2 in flight.
 *   The key's quota (16 req/s, 50,000/day) is shared with concert-history.
 * - In-memory TTL cache per instance: Typical Sets for 6 h, "no setlist"
 *   fallbacks for 1 h. API errors are not cached.
 * - Never throws: every failure becomes a Setlist Fallback with a reason, so a
 *   Setlist.fm problem can never fail a track search.
 *
 * Terms: the free API is non-commercial only, and every use of the data MUST
 * show the setlist `url` as an attribution link (no `nofollow`).
 */

import { normalize } from '@/lib/artist-match';
import {
  SetlistFmSearchResponse,
  SetlistFmSetlist,
  TypicalSet,
  isQualifying,
  selectTypicalSet,
} from '@/lib/setlist-select';

const SETLISTFM_API_BASE = 'https://api.setlist.fm/rest/1.0';
const UPSTREAM_TIMEOUT_MS = 10_000;
const MIN_PAGE1_QUALIFYING = 3;

const MAX_IN_FLIGHT = 2;
const MIN_START_INTERVAL_MS = 250; // 4 request starts per second

const TYPICAL_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

export type SetlistFallbackReason =
  | 'not-on-tour'
  | 'no-match'
  | 'low-resolution'
  | 'no-key'
  | 'unsupported-platform'
  | `api-error:${string}`;

export type TypicalSetlistResult =
  | { kind: 'typical'; typicalSet: TypicalSet }
  | { kind: 'fallback'; reason: SetlistFallbackReason };

export interface TypicalSetlistLookup {
  result: TypicalSetlistResult;
  /** Setlist.fm requests this lookup sent (0 on a cache hit). */
  calls: number;
  cacheHit: boolean;
  /** Derived counts for logs and the dev probe (absent on a cache hit). */
  diagnostics?: { entries: number; mbids: number; qualifying: number };
}

// ---------------------------------------------------------------------------
// Limiter
// ---------------------------------------------------------------------------

class RequestLimiter {
  private active = 0;
  private nextStart = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly maxInFlight: number,
    private readonly minIntervalMs: number
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
    try {
      return await task();
    } finally {
      this.active--;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.maxInFlight && this.queue.length > 0) {
      const start = this.queue.shift()!;
      this.active++;
      const now = Date.now();
      const wait = Math.max(0, this.nextStart - now);
      this.nextStart = Math.max(now, this.nextStart) + this.minIntervalMs;
      if (wait > 0) setTimeout(start, wait);
      else start();
    }
  }
}

const limiter = new RequestLimiter(MAX_IN_FLIGHT, MIN_START_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Cache (per instance)
// ---------------------------------------------------------------------------

const cache = new Map<string, { expires: number; result: TypicalSetlistResult }>();
const inflight = new Map<string, Promise<TypicalSetlistLookup>>();

function cacheGet(key: string): TypicalSetlistResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: TypicalSetlistResult): void {
  let ttl: number;
  if (result.kind === 'typical') ttl = TYPICAL_TTL_MS;
  else if (result.reason === 'no-match' || result.reason === 'not-on-tour') ttl = FALLBACK_TTL_MS;
  else return; // API errors and config problems are not cached
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + ttl, result });
}

/** Test hook: empty the cache. */
export function clearSetlistCache(): void {
  cache.clear();
  inflight.clear();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class SetlistFmHttpError extends Error {
  constructor(readonly reason: string) {
    super(`Setlist.fm request failed (${reason})`);
  }
}

function isAbortLike(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** One search page. Returns null for 404 (Setlist.fm's "no results"). */
async function fetchSearchPage(
  artistName: string,
  page: number,
  apiKey: string
): Promise<SetlistFmSearchResponse | null> {
  return limiter.run(async () => {
    const url =
      `${SETLISTFM_API_BASE}/search/setlists?artistName=` +
      `${encodeURIComponent(artistName)}&p=${page}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-api-key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (error) {
      throw new SetlistFmHttpError(isAbortLike(error) ? 'timeout' : 'network');
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new SetlistFmHttpError(String(response.status));
    try {
      return (await response.json()) as SetlistFmSearchResponse;
    } catch (error) {
      throw new SetlistFmHttpError(isAbortLike(error) ? 'timeout' : 'bad-json');
    }
  });
}

/** Only an https setlist.fm page may become a link in the UI. */
function isSetlistFmUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'www.setlist.fm' || url.hostname === 'setlist.fm')
    );
  } catch {
    return false;
  }
}

function matchingEntries(response: SetlistFmSearchResponse | null, wanted: string) {
  return (response?.setlist ?? []).filter(
    (entry): entry is SetlistFmSetlist =>
      typeof entry?.artist?.name === 'string' &&
      normalize(entry.artist.name) === wanted &&
      isSetlistFmUrl(entry.url)
  );
}

async function lookup(
  artistName: string,
  apiKey: string,
  now: Date
): Promise<TypicalSetlistLookup> {
  const wanted = normalize(artistName);
  let calls = 0;
  try {
    calls++;
    const first = await fetchSearchPage(artistName, 1, apiKey);
    let entries = matchingEntries(first, wanted);

    const qualifying = entries.filter((entry) => isQualifying(entry, now)).length;
    const perPage = first?.itemsPerPage && first.itemsPerPage > 0 ? first.itemsPerPage : 20;
    if (first && qualifying < MIN_PAGE1_QUALIFYING && (first.total ?? 0) > perPage) {
      calls++;
      try {
        entries = entries.concat(
          matchingEntries(await fetchSearchPage(artistName, 2, apiKey), wanted)
        );
      } catch (error) {
        // Page 2 is a bonus: keep page 1's entries.
        console.warn(`[setlist] ${artistName}: page 2 failed (${(error as Error).message})`);
      }
    }

    const selection = selectTypicalSet(entries, now);
    const result: TypicalSetlistResult =
      selection.kind === 'typical'
        ? { kind: 'typical', typicalSet: selection.typicalSet }
        : { kind: 'fallback', reason: selection.reason };
    const diagnostics = {
      entries: entries.length,
      mbids: new Set(entries.map((entry) => entry.artist.mbid ?? '')).size,
      qualifying: entries.filter((entry) => isQualifying(entry, now)).length,
    };
    return { result, calls, cacheHit: false, diagnostics };
  } catch (error) {
    const reason = error instanceof SetlistFmHttpError ? error.reason : 'unknown';
    return { result: { kind: 'fallback', reason: `api-error:${reason}` }, calls, cacheHit: false };
  }
}

/**
 * The Typical Set for an artist, or a Setlist Fallback with a reason.
 * Never throws. `now` is injectable for tests.
 */
export async function getTypicalSetlist(
  artistName: string,
  now: Date = new Date()
): Promise<TypicalSetlistLookup> {
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey) {
    return { result: { kind: 'fallback', reason: 'no-key' }, calls: 0, cacheHit: false };
  }

  const key = normalize(artistName);
  if (!key) {
    return { result: { kind: 'fallback', reason: 'no-match' }, calls: 0, cacheHit: false };
  }

  const cached = cacheGet(key);
  if (cached) return { result: cached, calls: 0, cacheHit: true };

  const pending = inflight.get(key);
  if (pending) {
    const shared = await pending;
    return { result: shared.result, calls: 0, cacheHit: true };
  }

  const request = lookup(artistName, apiKey, now)
    .then((outcome) => {
      cacheSet(key, outcome.result);
      return outcome;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
