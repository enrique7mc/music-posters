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
 * Shared track-count stepper (whole numbers, 1–25).
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

  const handleStep = (change: number) => {
    const next = Math.min(MAX_TRACKS_PER_ARTIST, Math.max(MIN_TRACKS_PER_ARTIST, value + change));
    if (next === value) return;
    setDraft(null);
    setCommitted(next);
    onCommit(next);
  };

  const showRangeError = draft !== null && !isValid(draft);

  return (
    <span className={cn('inline-flex w-32 flex-col items-center', className)}>
      <span
        className={cn(
          'inline-flex h-10 items-center rounded-full border bg-dark-800 focus-within:ring-2 focus-within:ring-accent-500/50',
          showRangeError ? 'border-red-500/60' : 'border-dark-700',
          disabled && 'opacity-50'
        )}
      >
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={disabled || value <= MIN_TRACKS_PER_ARTIST}
          aria-label={`Decrease ${label}`}
          className="flex h-full w-9 items-center justify-center rounded-l-full text-lg text-dark-200 hover:bg-dark-700 hover:text-accent-300 focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          −
        </button>
        <input
          id={inputId}
          type="text"
          role="spinbutton"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft ?? String(value)}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              handleStep(e.key === 'ArrowUp' ? 1 : -1);
            }
          }}
          disabled={disabled}
          aria-label={label}
          aria-valuemin={MIN_TRACKS_PER_ARTIST}
          aria-valuemax={MAX_TRACKS_PER_ARTIST}
          aria-valuenow={showRangeError ? undefined : value}
          aria-invalid={showRangeError}
          aria-describedby={showRangeError ? errorId : undefined}
          className="h-8 w-10 rounded-full bg-accent-500/10 text-center text-sm font-semibold tabular-nums text-accent-300 outline-none focus:bg-accent-500/20 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={disabled || value >= MAX_TRACKS_PER_ARTIST}
          aria-label={`Increase ${label}`}
          className="flex h-full w-9 items-center justify-center rounded-r-full text-lg text-dark-200 hover:bg-dark-700 hover:text-accent-300 focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          +
        </button>
      </span>
      {showRangeError && (
        <span
          id={errorId}
          className="mt-1 w-full whitespace-nowrap text-center text-xs leading-4 text-red-400"
        >{`Whole numbers ${MIN_TRACKS_PER_ARTIST}–${MAX_TRACKS_PER_ARTIST}`}</span>
      )}
    </span>
  );
}
