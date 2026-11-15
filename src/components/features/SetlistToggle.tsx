import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';
import type { ArtistInputSource } from '@/types';

interface SetlistToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  inputSource: ArtistInputSource;
  /** Artists in the Setlist Scope (headliners for a poster, everyone for a manual lineup). */
  scopeCount: number;
  disabled?: boolean;
}

/** Hint text that names the Setlist Scope. */
export function setlistScopeHint(inputSource: ArtistInputSource, scopeCount: number): string {
  if (inputSource === 'text') {
    return "Every artist gets their live set when they've played recently.";
  }
  if (scopeCount === 0) return 'No headliners on this poster.';
  return `Headliners (${scopeCount}) get their live set when they've played recently.`;
}

/**
 * "Prefer tour setlists" switch. Layered on any track selection mode: artists
 * in the Setlist Scope who are On Tour get their Typical Set (via setlist.fm);
 * everyone else keeps the regular mode.
 */
export default function SetlistToggle({
  enabled,
  onChange,
  inputSource,
  scopeCount,
  disabled = false,
}: SetlistToggleProps) {
  const noScope = inputSource === 'poster' && scopeCount === 0;
  const isDisabled = disabled || noScope;
  const hintId = 'setlist-toggle-hint';

  return (
    <Card variant="default" className="rounded-2xl border-white/10 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white" id="setlist-toggle-label">
            Prefer tour setlists
          </h4>
          <p id={hintId} className="mt-1 text-xs text-dark-300">
            {setlistScopeHint(inputSource, scopeCount)}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && !noScope}
          aria-labelledby="setlist-toggle-label"
          aria-describedby={hintId}
          disabled={isDisabled}
          onClick={() => onChange(!enabled)}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-ring',
            enabled && !noScope
              ? 'border-[#f29520] bg-[#f29520]'
              : 'border-white/20 bg-white/[0.08]',
            isDisabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled && !noScope ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>
      <p className="mt-3 text-xs text-dark-300">
        Setlist data from{' '}
        <a
          href="https://www.setlist.fm"
          target="_blank"
          rel="noopener"
          className="underline hover:text-white"
        >
          setlist.fm
        </a>
        . Artists without a recent show keep the mode above.
      </p>
    </Card>
  );
}
