import type { SetlistArtistInfo, Track } from '@/types';

interface SetlistChipsProps {
  setlistArtists: SetlistArtistInfo[];
  tracks: Track[];
}

/** "Nov 13, 2026" from an ISO yyyy-MM-dd day, in UTC so the day never shifts. */
export function formatSetlistDate(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Only an https setlist.fm page becomes a link. */
function isSetlistFmUrl(value: string): boolean {
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

/**
 * One chip per artist whose tracks came from their Typical Set. Each chip links
 * to the setlist.fm page of the newest show: the Setlist.fm API terms require
 * this attribution link, so it MUST NOT carry `nofollow`.
 */
export default function SetlistChips({ setlistArtists, tracks }: SetlistChipsProps) {
  const visible = setlistArtists.filter((info) => isSetlistFmUrl(info.url));
  const hasSetlistTracks = tracks.some((t) => t.source === 'setlist');
  if (visible.length === 0 || !hasSetlistTracks) return null;

  return (
    <section aria-label="Tour setlists" className="mb-6 flex flex-wrap gap-2">
      {visible.map((info) => {
        const place = info.city || info.venue;
        return (
          <a
            key={info.artist}
            href={info.url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#f29520]/30 bg-[#f29520]/[0.07] px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-[#f29520]/60 hover:text-white focus-ring"
          >
            <span className="font-semibold text-white">{info.artist}</span>
            <span aria-hidden="true">·</span>
            <span>
              Live set{place ? ` · ${place}` : ''}, {formatSetlistDate(info.latestDate)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="underline">setlist.fm</span>
          </a>
        );
      })}
    </section>
  );
}
