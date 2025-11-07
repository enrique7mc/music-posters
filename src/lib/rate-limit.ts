import { NextApiRequest, NextApiResponse } from 'next';
import { LRUCache } from 'lru-cache';

/**
 * Rate limiter configuration options
 */
interface RateLimitOptions {
  /**
   * Time window in milliseconds (e.g., 60000 for 1 minute)
   */
  interval: number;

  /**
   * Maximum number of requests allowed per interval
   */
  maxRequests: number;

  /**
   * Optional custom error message
   */
  errorMessage?: string;
}

/**
 * Rate limit entry tracking request count and window expiry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory cache for rate limiting
 * Each endpoint gets its own cache instance to maintain separate limits
 */
const rateLimitCaches = new Map<string, LRUCache<string, RateLimitEntry>>();

/**
 * Get or create a cache for a specific endpoint
 */
function getCache(endpoint: string): LRUCache<string, RateLimitEntry> {
  if (!rateLimitCaches.has(endpoint)) {
    // Create a new LRU cache with a max of 500 unique IPs per endpoint
    // Entries automatically expire after 10 minutes of inactivity
    rateLimitCaches.set(
      endpoint,
      new LRUCache<string, RateLimitEntry>({
        max: 500,
        ttl: 10 * 60 * 1000, // 10 minutes
      })
    );
  }
  return rateLimitCaches.get(endpoint)!;
}

/**
 * Get a unique identifier for the request
 * Uses IP address, with fallback to headers
 */
function getIdentifier(req: NextApiRequest): string {
  // Try multiple headers to get the real IP (works with proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }

  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0];
  }

  // Fallback to socket address (works locally)
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Apply rate limiting to an API endpoint
 *
 * @param req - Next.js API request
 * @param res - Next.js API response
 * @param options - Rate limit configuration
 * @returns true if rate limit is exceeded, false otherwise
 *
 * @example
 * ```typescript
 * // In your API route:
 * export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *   // Apply rate limit: 5 requests per minute
 *   if (applyRateLimit(req, res, { interval: 60000, maxRequests: 5 })) {
 *     return; // Rate limit exceeded, response already sent
 *   }
 *
 *   // Continue with your API logic...
 * }
 * ```
 */
export function applyRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
): boolean {
  const { interval, maxRequests, errorMessage } = options;

  // Validate options
  if (interval <= 0 || maxRequests <= 0) {
    throw new Error('interval and maxRequests must be positive numbers');
  }

  // Get endpoint identifier without query parameters (e.g., "/api/analyze")
  const endpoint = req.url?.split('?')[0] || 'unknown';

  // Get request identifier (IP address)
  const identifier = getIdentifier(req);

  // Get the cache for this endpoint
  const cache = getCache(endpoint);

  // Get or initialize rate limit entry
  const now = Date.now();
  const entry = cache.get(identifier);

  if (!entry || now > entry.resetTime) {
    // First request or window expired, start new window
    cache.set(identifier, {
      count: 1,
      resetTime: now + interval,
    });
    return false;
  }

  // Increment request count
  entry.count += 1;
  cache.set(identifier, entry);

  // Check if limit exceeded
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000); // seconds

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());
    res.setHeader('Retry-After', retryAfter.toString());

    // Send error response
    res.status(429).json({
      error: errorMessage || `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter,
    });

    console.warn(
      `[Rate Limit] IP ${identifier} exceeded limit on ${endpoint} (${entry.count}/${maxRequests})`
    );

    return true; // Rate limit exceeded
  }

  // Set rate limit headers for successful requests
  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());

  return false; // Rate limit not exceeded
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict limit for expensive operations (5 requests/minute)
   * Use for: Image analysis, AI operations
   */
  strict: (errorMessage?: string): RateLimitOptions => ({
    interval: 60 * 1000, // 1 minute
    maxRequests: 5,
    errorMessage:
      errorMessage ||
      'Rate limit exceeded. You can only perform this action 5 times per minute. Please try again later.',
  }),

  /**
   * Moderate limit for standard API operations (10 requests/minute)
   * Use for: Playlist creation, track searches
   */
  moderate: (errorMessage?: string): RateLimitOptions => ({
    interval: 60 * 1000, // 1 minute
    maxRequests: 10,
    errorMessage:
      errorMessage ||
      'Rate limit exceeded. You can only perform this action 10 times per minute. Please try again later.',
  }),

  /**
   * Relaxed limit for authentication endpoints (20 requests/minute)
   * Use for: Login, logout, user info
   */
  relaxed: (errorMessage?: string): RateLimitOptions => ({
    interval: 60 * 1000, // 1 minute
    maxRequests: 20,
    errorMessage:
      errorMessage ||
      'Rate limit exceeded. You can only perform this action 20 times per minute. Please try again later.',
  }),
};
