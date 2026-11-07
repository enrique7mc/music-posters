/**
 * Apple Music link helpers.
 *
 * A playlist created through `/me/library/playlists` is a private library
 * playlist with a library id (`p.…`). It has no public catalog page, so the
 * only working web link is the web player's library path.
 *
 * The iOS/iPadOS Music app claims every `music.apple.com` link as a universal
 * link, but it cannot deep-link into a library item: it treats the id as a
 * catalog lookup and shows "Item Not Available … in your country or region"
 * (issue #67). It does open `/library` itself, so on those devices we link to
 * the Library root instead.
 */

export const APPLE_MUSIC_LIBRARY_URL = 'https://music.apple.com/library';

export function libraryPlaylistUrl(libraryId: string): string {
  return `${APPLE_MUSIC_LIBRARY_URL}/playlist/${encodeURIComponent(libraryId)}`;
}

type NavigatorLike = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string };

/** iPhone, iPod, or iPad — including iPadOS, which reports a desktop Mac user agent. */
export function isAppleMobileDevice(nav: NavigatorLike | undefined): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * The URL the "Open in Apple Music" button should navigate to. On iOS/iPadOS
 * the Music app intercepts the link, so send it to the Library root, which it
 * can open. Everywhere else keep the direct playlist link.
 */
export function appleMusicOpenUrl(playlistUrl: string, nav: NavigatorLike | undefined): string {
  return isAppleMobileDevice(nav) ? APPLE_MUSIC_LIBRARY_URL : playlistUrl;
}
