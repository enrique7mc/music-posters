import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Upload from '../../pages/upload';

const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return { mockPush: push, mockRouter: { push } };
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

// Keep the mock interactive so poster/text mode switching exercises Upload's
// real handlers without needing a native file picker.
vi.mock('@/components/features/UploadZone', () => ({
  default: ({ onFileSelect }: { onFileSelect: (file: File) => void }) => (
    <button onClick={() => onFileSelect(new File(['poster'], 'poster.png'))}>
      Select test poster
    </button>
  ),
}));

describe('upload manual artist entry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockAxiosPost.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a text lineup and navigates without analyzing an image', async () => {
    const user = userEvent.setup();
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays{enter}The Beths');
    await user.click(screen.getByRole('button', { name: /review artists/i }));

    expect(JSON.parse(sessionStorage.getItem('artists') || '[]')).toEqual([
      { name: 'Alvvays' },
      { name: 'The Beths' },
    ]);
    expect(sessionStorage.getItem('inputSource')).toBe('text');
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/review-artists');
  });

  it('shows a recoverable error and does not navigate when storage fails', async () => {
    const user = userEvent.setup();
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'inputSource') throw new DOMException('Storage blocked', 'SecurityError');
      return originalSetItem.call(this, key, value);
    });
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');
    await user.click(screen.getByRole('button', { name: /review artists/i }));

    expect(screen.getByText('Could not save your lineup')).toBeInTheDocument();
    expect(screen.getByText(/browser blocked local storage/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/review-artists');
    expect(sessionStorage.getItem('artists')).toBeNull();
  });

  it('preserves the text draft when switching input modes', async () => {
    const user = userEvent.setup();
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');
    await user.click(screen.getByRole('button', { name: /upload a poster instead/i }));
    await user.click(screen.getByRole('button', { name: /enter artists manually instead/i }));

    expect(screen.getByLabelText(/artists, one per line/i)).toHaveValue('Alvvays');
  });

  it('marks poster input without failing analysis when storage is restricted', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    mockAxiosPost.mockResolvedValue({
      data: { artists: [], rawText: '', provider: 'vision', eventName: 'Test Fest' },
    });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/api/analyze',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/no artists found in the image/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/error analyzing image/i)).not.toBeInTheDocument();
  });

  it('clears stale flow data when starting a new poster analysis', async () => {
    sessionStorage.setItem('artists', JSON.stringify([{ name: 'Stale Artist' }]));
    sessionStorage.setItem('posterThumbnail', 'stale-thumbnail');
    sessionStorage.setItem('eventName', 'Stale Fest');
    sessionStorage.setItem('tracks', '[]');
    sessionStorage.setItem('trackWarnings', '["stale"]');
    sessionStorage.setItem('inputSource', 'text');
    sessionStorage.setItem('returnAfterAuth', 'keep-auth-state');
    mockAxiosPost.mockResolvedValue({
      data: { artists: [], rawText: '', provider: 'vision' },
    });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await waitFor(() => expect(mockAxiosPost).toHaveBeenCalled());
    expect(sessionStorage.getItem('artists')).toBeNull();
    expect(sessionStorage.getItem('posterThumbnail')).toBeNull();
    expect(sessionStorage.getItem('eventName')).toBeNull();
    expect(sessionStorage.getItem('tracks')).toBeNull();
    expect(sessionStorage.getItem('trackWarnings')).toBeNull();
    expect(sessionStorage.getItem('inputSource')).toBe('poster');
    expect(sessionStorage.getItem('returnAfterAuth')).toBe('keep-auth-state');
  });
});
