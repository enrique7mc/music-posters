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

  return apiMessage(response.data)
    ? `${base} (${response.status}: ${apiMessage(response.data)})`
    : `${base} (${response.status})`;
}

/**
 * Pull the API's own error text out of a response body. Handles both shapes the
 * Spotify APIs use, because they differ and only one was handled before:
 *
 *   Web API:   { error: { status: 403, message: "Forbidden" } }
 *   Accounts:  { error: "invalid_grant", error_description: "Invalid redirect URI" }
 *
 * The second is the one that actually names an OAuth failure, and treating `error`
 * as always-an-object silently reduced those logs to a bare status code.
 *
 * Reads only these known-safe fields — never `config`, which carries credentials.
 */
function apiMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const body = data as { error?: unknown; error_description?: unknown };

  // Accounts/OAuth shape: `error` is a string code, detail lives alongside it.
  if (typeof body.error === 'string') {
    return typeof body.error_description === 'string'
      ? `${body.error}: ${body.error_description}`
      : body.error;
  }

  // Web API shape: `error` is an object with a message.
  if (typeof body.error === 'object' && body.error !== null) {
    const message = (body.error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return undefined;
}
