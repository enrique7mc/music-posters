import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { PLAYLIST_DRAFT_STORAGE_KEY } from '@/lib/playlist-draft';

const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return { mockPush: push, mockRouter: { push } };
});
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('axios', () => ({
  default: { get: mockGet, post: mockPost },
}));

function LogoutHarness() {
  const { logout } = useAuth();
  return (
    <button onClick={() => void logout().catch(() => undefined)} type="button">
      Log out
    </button>
  );
}

describe('AuthContext playlist draft lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockResolvedValue({
      data: {
        id: 'us',
        draftOwnerId: 'u1',
        displayName: 'Test User',
        platform: 'apple-music',
      },
    });
  });

  it('clears playlist-flow state only after logout succeeds', async () => {
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, '{"version":1}');
    sessionStorage.setItem('artists', 'legacy');
    sessionStorage.setItem('trackViewMode', 'list');
    sessionStorage.setItem('theme', 'dark');
    mockPost.mockResolvedValue({ data: { success: true } });

    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem('artists')).toBeNull();
    expect(sessionStorage.getItem('trackViewMode')).toBe('list');
    expect(sessionStorage.getItem('theme')).toBe('dark');
  });

  it('preserves the draft when logout fails', async () => {
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, '{"version":1}');
    mockPost.mockRejectedValue(new Error('network failure'));

    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/auth/logout'));
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBe('{"version":1}');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
