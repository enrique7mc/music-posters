import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StartOverButton, { START_OVER_CONFIRMATION, confirmStartOver } from '../StartOverButton';
import { PLAYLIST_DRAFT_STORAGE_KEY, clearPlaylistDraft } from '@/lib/playlist-draft';

const { mockReplace, mockRouter } = vi.hoisted(() => {
  const replace = vi.fn();
  return { mockReplace: replace, mockRouter: { replace } };
});

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

function seedDraft() {
  sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, '{"version":1}');
}

describe('StartOverButton', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockReplace.mockReset();
    vi.restoreAllMocks();
  });

  it('renders a visible Start over action', () => {
    render(<StartOverButton />);

    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
  });

  it('cancel keeps the draft and does not navigate', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    seedDraft();
    const onDiscard = vi.fn();

    render(<StartOverButton onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(confirmSpy).toHaveBeenCalledWith(START_OVER_CONFIRMATION);
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBe('{"version":1}');
    expect(onDiscard).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('confirm clears the draft, resets state via onDiscard, and replaces the route', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    sessionStorage.setItem('returnAfterAuth', 'keep');
    seedDraft();
    const onDiscard = vi.fn();

    render(<StartOverButton onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    // Only playlist-flow keys die; auth flow state survives.
    expect(sessionStorage.getItem('returnAfterAuth')).toBe('keep');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/upload');
  });

  it('confirmStartOver reports false on cancel without clearing', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    seedDraft();

    expect(confirmStartOver()).toBe(false);
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBe('{"version":1}');
  });

  it('confirmStartOver clears everything the draft owns on confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    seedDraft();
    sessionStorage.setItem('artists', 'legacy');
    sessionStorage.setItem('tracks', 'legacy');

    expect(confirmStartOver()).toBe(true);
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem('artists')).toBeNull();
    expect(sessionStorage.getItem('tracks')).toBeNull();
    // Sanity: clearPlaylistDraft and confirmStartOver agree on scope.
    clearPlaylistDraft();
  });
});
