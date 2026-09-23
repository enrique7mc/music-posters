import { useRouter } from 'next/router';
import Button from '@/components/ui/Button';
import { clearPlaylistDraft } from '@/lib/playlist-draft';

/**
 * Confirmation copy shared by every destructive flow reset: the Start over
 * action plus Upload's "genuinely new source" paths (new poster, replacing an
 * analyzed poster, switching away from a populated input method). The wording
 * makes the consequence explicit, per the draft-persistence plan.
 */
export const START_OVER_CONFIRMATION =
  'Start over? Your uploaded poster, artist edits, and track selections will be cleared.';

/**
 * Ask the user to confirm a destructive reset. Returns true when it is safe to
 * proceed (the draft is cleared at that point); false on cancel (no-op).
 */
export function confirmStartOver(): boolean {
  if (!window.confirm(START_OVER_CONFIRMATION)) return false;
  clearPlaylistDraft();
  return true;
}

interface StartOverButtonProps {
  /** Runs after the draft is cleared but before the route changes (e.g. reset in-memory state). */
  onDiscard?: () => void;
  className?: string;
}

/**
 * Visible "Start over" action for the flow pages. Confirming clears only the
 * playlist draft (auth cookies, returnAfterAuth, theme, and trackViewMode are
 * preserved) and replaces the route to /upload so browser Back cannot
 * immediately reintroduce the discarded page. Cancelling changes nothing.
 */
export default function StartOverButton({ onDiscard, className }: StartOverButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!confirmStartOver()) return;
    onDiscard?.();
    router.replace('/upload');
  };

  return (
    <Button variant="ghost" size="md" onClick={handleClick} className={className}>
      <svg
        className="w-4 h-4 mr-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v5h5" />
      </svg>
      Start over
    </Button>
  );
}
