import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Success from '../../pages/success';
import { PLAYLIST_DRAFT_STORAGE_KEY } from '@/lib/playlist-draft';

const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockPush: push,
    mockRouter: {
      push,
      query: { playlistUrl: 'https://music.apple.com/playlist/test' } as Record<string, string>,
    },
  };
});

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'us',
      draftOwnerId: 'u1',
      displayName: 'Test User',
      platform: 'apple-music',
    },
    platform: 'apple-music',
    loading: false,
  }),
}));

vi.mock('@/components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('success playlist draft lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
  });

  it('clears the complete flow draft on mount while preserving unrelated preferences', async () => {
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, '{"version":1}');
    sessionStorage.setItem('artists', 'legacy');
    sessionStorage.setItem('tracks', 'legacy');
    sessionStorage.setItem('returnAfterAuth', 'keep');
    sessionStorage.setItem('trackViewMode', 'list');

    render(<Success />);

    await waitFor(() => {
      expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    });
    expect(sessionStorage.getItem('artists')).toBeNull();
    expect(sessionStorage.getItem('tracks')).toBeNull();
    expect(sessionStorage.getItem('returnAfterAuth')).toBe('keep');
    expect(sessionStorage.getItem('trackViewMode')).toBe('list');
  });
});

describe('success track count notice', () => {
  const baseQuery = { playlistUrl: 'https://music.apple.com/playlist/test' };

  it('warns when fewer tracks landed than were requested', async () => {
    mockRouter.query = { ...baseQuery, added: '100', requested: '340' };

    render(<Success />);

    expect(await screen.findByRole('alert')).toHaveTextContent('100 of 340 tracks were added');
    mockRouter.query = baseQuery;
  });

  it('shows no warning when every track landed', async () => {
    mockRouter.query = { ...baseQuery, added: '340', requested: '340' };

    render(<Success />);

    expect(await screen.findByText(/340 tracks added to your Apple Music library/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    mockRouter.query = baseQuery;
  });
});
