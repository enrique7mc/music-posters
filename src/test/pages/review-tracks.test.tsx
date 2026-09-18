import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReviewTracks from '../../pages/review-tracks';
import type { Track } from '@/types';

const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return {
    mockPush: push,
    mockRouter: { push, isReady: true, query: {} as Record<string, string> },
  };
});
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => ({
  user: { id: 'u1', displayName: 'Test User', platform: 'apple-music' },
  loading: false,
  platform: 'apple-music',
  logout: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('axios', () => ({
  default: { post: mockAxiosPost },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: mockApiPost },
}));

vi.mock('@/components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingScreen: ({ message }: { message?: string }) => <div>{message}</div>,
}));

const TRACK: Track = {
  id: 'track-1',
  name: 'Archie, Marry Me',
  artist: 'Alvvays',
  artistId: 'artist-1',
  album: 'Alvvays',
  albumArtwork: null,
  duration: 252_000,
  previewUrl: null,
  platformUrl: 'https://music.apple.com/track-1',
  platform: 'apple-music',
};

function seedTracks() {
  sessionStorage.setItem('tracks', JSON.stringify([TRACK]));
}

describe('review-tracks playlist naming', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockPush.mockReset();
    mockAxiosPost.mockReset();
    mockApiPost.mockReset();
    mockAxiosPost.mockResolvedValue({ data: { coverPreview: '' } });
    seedTracks();
  });

  it('uses Artist Mix for a manually entered lineup without an event name', async () => {
    sessionStorage.setItem('inputSource', 'text');

    render(<ReviewTracks />);

    expect(await screen.findByLabelText('Playlist Name')).toHaveValue('Artist Mix');
  });

  it('prefers a stored event name over the manual-lineup default', async () => {
    sessionStorage.setItem('inputSource', 'text');
    sessionStorage.setItem('eventName', 'Test Fest 2026');

    render(<ReviewTracks />);

    expect(await screen.findByLabelText('Playlist Name')).toHaveValue('Test Fest 2026');
  });
});
