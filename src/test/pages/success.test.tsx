import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('success "Open in Apple Music" target (#67)', () => {
  const playlistUrl = 'https://music.apple.com/library/playlist/p.1';
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

  beforeEach(() => {
    mockRouter.query = { playlistUrl };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockRouter.query = { playlistUrl: 'https://music.apple.com/playlist/test' };
  });

  async function clickOpen() {
    const button = screen.getByRole('button', { name: /Open in Apple Music/ });
    await waitFor(() => expect(button).not.toBeDisabled(), { timeout: 2000 });
    fireEvent.click(button);
  }

  it('opens the Library root on iPhone, where the Music app cannot open library playlists', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<Success />);

    expect(await screen.findByText(/Find your new playlist under Playlists/)).toBeTruthy();
    await clickOpen();
    expect(open).toHaveBeenCalledWith(
      'https://music.apple.com/library',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('opens the playlist itself on desktop', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<Success />);

    await clickOpen();
    expect(open).toHaveBeenCalledWith(playlistUrl, '_blank', 'noopener,noreferrer');
  });
});
