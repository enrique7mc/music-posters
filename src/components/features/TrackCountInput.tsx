import { useId, useState } from 'react';
import { MIN_TRACKS_PER_ARTIST, MAX_TRACKS_PER_ARTIST } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface TrackCountInputProps {
  /** Currently committed count (1–25). Displayed whenever the field is valid. */
  value: number;
  /**
   * Fires only with a valid whole number within MIN/MAX_TRACKS_PER_ARTIST.
   * Temporary editing states (empty, partial, out-of-range) never reach it.
   */
  onCommit: (count: number) => void;
  /** Accessible name for the input (e.g. "Track count for Alvvays"). */
  label: string;
  /** Optional id, for pairing with a visible <label htmlFor>. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Shared numeric track-count field (whole numbers, 1–25).
 *
 * The input keeps a local draft while the user types: invalid values (empty,
 * fractional, or outside 1–25) show a range message instead of entering
 * application state, and revert to the last committed value on blur.
 */
export default function TrackCountInput({
  value,
  onCommit,
  label,
  id,
  disabled = false,
  className,
}: TrackCountInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-range-error`;

  // null → not editing; the field mirrors the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  // Last value this input committed (or mounted with). When the parent changes
  // the committed value — Reset to Recommended, bulk tier apply — any local
  // draft is stale and must give way to the new value.
  const [committed, setCommitted] = useState(value);

  if (value !== committed) {
    setCommitted(value);
    setDraft(null);
  }

  const isValid = (input: string): boolean =>
    /^\d+$/.test(input) &&
    Number(input) >= MIN_TRACKS_PER_ARTIST &&
    Number(input) <= MAX_TRACKS_PER_ARTIST;

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (isValid(raw)) {
      const count = Number(raw);
      setCommitted(count);
      onCommit(count);
    }
  };

  const handleBlur = () => {
    // Drop the draft: valid values are already committed, invalid ones revert.
    setDraft(null);
  };

  const showRangeError = draft !== null && !isValid(draft);

  return (
    <span className="inline-flex flex-col">
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={MIN_TRACKS_PER_ARTIST}
        max={MAX_TRACKS_PER_ARTIST}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={label}
        aria-invalid={showRangeError}
        aria-describedby={showRangeError ? errorId : undefined}
        className={cn(
          'px-3 py-2 bg-dark-800 border rounded text-sm text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50',
          showRangeError ? 'border-red-500/60' : 'border-dark-700 focus:border-accent-500',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      />
      {showRangeError && (
        <span
          id={errorId}
          className="text-xs text-red-400 mt-1"
        >{`Enter a whole number from ${MIN_TRACKS_PER_ARTIST} to ${MAX_TRACKS_PER_ARTIST}.`}</span>
      )}
    </span>
  );
}
