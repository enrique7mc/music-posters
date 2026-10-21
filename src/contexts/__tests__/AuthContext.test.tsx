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

function installMusicKit(unauthorize: () => Promise<void>, { configured = true } = {}) {
  const instance = { authorize: vi.fn(), unauthorize: vi.fn(unauthorize), isAuthorized: true };
  // Mirror MusicKit v3: no instance until the configure() promise resolves.
  window.MusicKit = {
    configure: vi.fn(async () => {
      await Promise.resolve();
      configured = true;
    }),
    getInstance: () => (configured ? instance : undefined) as any,
  };
  return instance;
}

function InitMusicKitHarness() {
  const { initMusicKit } = useAuth();
  return (
    <button onClick={() => void initMusicKit()} type="button">
      Init MusicKit
    </button>
  );
}

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
    delete window.MusicKit;
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

  it('clears the cached MusicKit token before clearing the server session', async () => {
    const calls: string[] = [];
    installMusicKit(async () => {
      calls.push('unauthorize');
    });
    mockPost.mockImplementation(async (url: string) => {
      calls.push(url);
      return { data: { success: true } };
    });

    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(calls).toEqual(['unauthorize', '/api/auth/logout']);
  });

  it('still logs out when MusicKit unauthorize fails', async () => {
    installMusicKit(() => Promise.reject(new Error('MusicKit broke')));
    mockPost.mockResolvedValue({ data: { success: true } });

    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(mockPost).toHaveBeenCalledWith('/api/auth/logout');
  });

  it('clears an orphaned MusicKit token when MusicKit initializes', async () => {
    const instance = installMusicKit(async () => undefined, { configured: false });
    mockGet.mockImplementation(async (url: string) =>
      url === '/api/auth/apple-music/developer-token'
        ? { data: { token: 'dev-token' } }
        : Promise.reject({ response: { status: 401 } })
    );

    render(
      <AuthProvider>
        <InitMusicKitHarness />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /init musickit/i }));

    await waitFor(() => expect(instance.unauthorize).toHaveBeenCalledTimes(1));
  });
});
