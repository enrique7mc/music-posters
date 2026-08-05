/**
 * Safe error logging for anything that talks to an authenticated HTTP API.
 *
 * NEVER pass a raw axios error to console.error. Axios attaches the full request
 * config to the error object, and `util.inspect` (which is what console.error uses
 * for objects) prints it verbatim — including:
 *
 *   - `config.headers.Authorization`      → the user's bearer / access token
 *   - `config.headers['Music-User-Token']`→ the Apple Music user token
 *   - `config.data`                       → form bodies, which for the Spotify
 *                                            token exchange contain the CLIENT SECRET
 *
 * In production those logs go to Vercel, where they persist and are readable by
 * anyone with dashboard access. Extracting only `error.message` keeps the useful
 * signal (status code, network error text) and drops every credential.
 */

/**
 * Extract a log-safe message from an unknown thrown value.
 *
 * @param error - anything caught in a `catch` block
 * @returns the error's message, or its string form for non-Error throws
 */
export function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Like {@link errMessage}, but also surfaces the HTTP status and the API's own
 * error text when present — useful for API routes that need to explain *why* a
 * call failed. Reads only known-safe fields; never touches `config`.
 *
 * @param error - anything caught in a `catch` block
 * @returns e.g. `"Request failed with status code 403 (403: Forbidden)"`
 */
export function errDetail(error: unknown): string {
  const base = errMessage(error);
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (!response?.status) return base;

  const apiMessage =
    typeof response.data === 'object' && response.data !== null
      ? (
          (response.data as { error?: { message?: string } | string }).error as
            | { message?: string }
            | undefined
        )?.message
      : undefined;

  return apiMessage
    ? `${base} (${response.status}: ${apiMessage})`
    : `${base} (${response.status})`;
}
