import { useMemo } from 'react';
import Button from '../ui/Button';
import {
  parseArtistText,
  MAX_ARTIST_NAME_LENGTH,
  MAX_ARTIST_TEXT_LENGTH,
  type ArtistTextParseResult,
} from '@/lib/artist-text';
import { MAX_ARTISTS_PER_SEARCH } from '@/lib/constants';

interface ArtistTextInputProps {
  /** Raw textarea content. Lifted to the page so the draft survives mode switches. */
  value: string;
  onChange: (value: string) => void;
  /** Called with the parsed lineup when the user chooses "Review artists". */
  onSubmit: (result: ArtistTextParseResult) => void;
  disabled?: boolean;
}

function listPreview(names: string[], max = 3): string {
  const shown = names
    .slice(0, max)
    .map((n) => `"${n}"`)
    .join(', ');
  return names.length > max ? `${shown} +${names.length - max} more` : shown;
}

/**
 * Textarea for manually entering a lineup, one artist per line, with live
 * validation feedback (duplicates removed, overlong names, size limits).
 * Purely client-side: this component never calls /api/analyze or any other
 * endpoint — the parsed names feed the existing artist review flow.
 */
export default function ArtistTextInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: ArtistTextInputProps) {
  const result = useMemo(() => parseArtistText(value), [value]);
  // Invalid names block submission: we never silently drop or truncate an
  // artist the user typed — they must fix or remove the line themselves.
  const canSubmit =
    !disabled &&
    result.errorCode === null &&
    result.invalidNames.length === 0 &&
    result.artists.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(result);
  };

  return (
    <div className="rounded-[1.75rem] border border-dark-700 bg-dark-900 p-6 sm:p-8">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-accent-400">
        Your own lineup
      </p>
      <h3 className="font-display text-3xl font-black tracking-tight text-dark-50 sm:text-4xl">
        Enter Artists
      </h3>
      <p className="mb-7 mt-3 max-w-xl leading-relaxed text-dark-300">
        Add the names you want to hear,{' '}
        <span className="font-semibold text-dark-200">one per line</span>. We&apos;ll help you pick
        the tracks next.
      </p>

      <label htmlFor="artist-text-input" className="sr-only">
        Artists, one per line
      </label>
      <textarea
        id="artist-text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        spellCheck={false}
        autoComplete="off"
        placeholder={'Alvvays\nThe Beths\nMen I Trust'}
        className="min-h-[220px] w-full resize-y rounded-2xl border border-dark-600 bg-dark-950 px-5 py-4 font-medium leading-8 text-dark-50 placeholder-dark-500 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
      />

      {/* Live feedback */}
      <div className="mt-4 space-y-3" aria-live="polite">
        {/* Ready count */}
        {result.artists.length > 0 && result.errorCode !== 'too-many-artists' && (
          <p className="text-sm text-accent-400">
            {result.artists.length} {result.artists.length === 1 ? 'artist' : 'artists'} ready
          </p>
        )}

        {/* Duplicates removed notice (informational) */}
        {result.duplicates.length > 0 && (
          <p className="text-sm text-amber-300/90">
            Removed {result.duplicates.length === 1 ? 'duplicate' : 'duplicates'}:{' '}
            {listPreview(result.duplicates)} (kept the first spelling)
          </p>
        )}

        {/* Overlong names — reported, never truncated */}
        {result.invalidNames.length > 0 && (
          <p className="text-sm text-red-400">
            {result.invalidNames.length === 1
              ? `One name is longer than ${MAX_ARTIST_NAME_LENGTH} characters`
              : `${result.invalidNames.length} names are longer than ${MAX_ARTIST_NAME_LENGTH} characters`}
            . Shorten or remove {listPreview(result.invalidNames)} to continue.
          </p>
        )}

        {/* Blocking errors */}
        {result.errorCode === 'empty' && value.trim().length > 0 && (
          <p className="text-sm text-red-400">
            No valid artists yet — enter at least one name (one per line).
          </p>
        )}
        {result.errorCode === 'too-many-artists' && (
          <p className="text-sm text-red-400">
            Too many artists ({result.artists.length}/{MAX_ARTISTS_PER_SEARCH}). Remove{' '}
            {result.artists.length - MAX_ARTISTS_PER_SEARCH} to continue.
          </p>
        )}
        {result.errorCode === 'input-too-long' && (
          <p className="text-sm text-red-400">
            That&apos;s too much text (over {MAX_ARTIST_TEXT_LENGTH.toLocaleString()} characters).
            Split it into smaller lineups.
          </p>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-4 border-t border-dark-700 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-xs leading-relaxed text-dark-300">
          Up to {MAX_ARTISTS_PER_SEARCH} artists · {MAX_ARTIST_NAME_LENGTH} characters per name ·
          duplicates are removed automatically
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="shrink-0 rounded-xl text-base font-bold"
        >
          Review artists{' '}
          <span aria-hidden="true" className="ml-3">
            →
          </span>
        </Button>
      </div>
    </div>
  );
}
