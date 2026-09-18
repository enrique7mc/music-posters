import { useMemo } from 'react';
import Button from '../ui/Button';
import Card from '../ui/Card';
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
    <Card variant="elevated" className="p-6 lg:p-8">
      <h3 className="text-2xl font-bold text-dark-100 mb-2">Enter Artists</h3>
      <p className="text-dark-400 mb-6">
        Type the artists you want, <span className="text-dark-200">one per line</span>. We&apos;ll
        find tracks for each on your music platform.
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
        className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-dark-50 placeholder-dark-500 focus:ring-2 focus:ring-accent-500 focus:border-transparent focus-ring transition-all duration-200 resize-y font-medium"
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

      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!canSubmit}>
          Review artists
        </Button>
        <p className="text-xs text-dark-500">
          Up to {MAX_ARTISTS_PER_SEARCH} artists • {MAX_ARTIST_NAME_LENGTH} characters per name •
          duplicates are removed automatically
        </p>
      </div>
    </Card>
  );
}
