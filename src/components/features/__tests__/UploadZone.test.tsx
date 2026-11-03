import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UploadZone from '../UploadZone';

function imageBlob(type = 'image/png', size = 4) {
  return new Blob([new Uint8Array(size)], { type });
}

function stubClipboardRead(read: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { read: vi.fn(read) },
    configurable: true,
  });
}

function clipboardItem(type: string, blob: Blob) {
  return { types: [type], getType: vi.fn(async () => blob) };
}

describe('UploadZone paste support', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('hides the Paste Image button when the async clipboard API is missing', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<UploadZone onFileSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /paste image/i })).not.toBeInTheDocument();
  });

  it('passes a clipboard image to onFileSelect when Paste Image is tapped', async () => {
    stubClipboardRead(async () => [clipboardItem('image/png', imageBlob())]);
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} />);

    fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));

    await waitFor(() => expect(onFileSelect).toHaveBeenCalledTimes(1));
    const file = onFileSelect.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('pasted-poster.png');
  });

  it('shows a message when the clipboard holds no image', async () => {
    stubClipboardRead(async () => [clipboardItem('text/plain', new Blob(['hi']))]);
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} />);

    fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no image found/i);
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('shows a message when clipboard access is denied', async () => {
    stubClipboardRead(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    render(<UploadZone onFileSelect={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read the clipboard/i);
  });

  it('rejects a pasted image larger than 10MB', async () => {
    const big = imageBlob('image/png', 10 * 1024 * 1024 + 1);
    stubClipboardRead(async () => [clipboardItem('image/png', big)]);
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} />);

    fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 10mb/i);
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('accepts an image pasted with Cmd/Ctrl+V on the page', () => {
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} />);
    const file = new File([imageBlob('image/jpeg')], 'poster.jpg', { type: 'image/jpeg' });

    fireEvent.paste(document, { clipboardData: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('ignores a page paste that has no image', () => {
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} />);

    fireEvent.paste(document, { clipboardData: { files: [] } });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not take over a paste inside a text field', () => {
    const onFileSelect = vi.fn();
    render(
      <>
        <textarea aria-label="notes" />
        <UploadZone onFileSelect={onFileSelect} />
      </>
    );
    const file = new File([imageBlob()], 'poster.png', { type: 'image/png' });

    fireEvent.paste(screen.getByLabelText('notes'), { clipboardData: { files: [file] } });

    expect(onFileSelect).not.toHaveBeenCalled();
  });

  describe('pending clipboard reads', () => {
    function deferredClipboard() {
      let resolve: (items: unknown[]) => void = () => {};
      stubClipboardRead(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      return {
        resolveWithImage: () => resolve([clipboardItem('image/png', imageBlob())]),
        resolveWithText: () => resolve([clipboardItem('text/plain', new Blob(['hi']))]),
      };
    }

    async function flush() {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    it('drops a clipboard read that resolves after the zone unmounts', async () => {
      const clipboard = deferredClipboard();
      const onFileSelect = vi.fn();
      const { unmount } = render(<UploadZone onFileSelect={onFileSelect} />);

      fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));
      unmount();
      clipboard.resolveWithImage();
      await flush();

      expect(onFileSelect).not.toHaveBeenCalled();
    });

    it('drops a clipboard read superseded by a newer chosen file', async () => {
      const clipboard = deferredClipboard();
      const onFileSelect = vi.fn();
      render(<UploadZone onFileSelect={onFileSelect} />);
      const chosen = new File([imageBlob('image/jpeg')], 'chosen.jpg', { type: 'image/jpeg' });

      fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));
      fireEvent.change(screen.getByLabelText(/choose a festival poster image/i), {
        target: { files: [chosen] },
      });
      clipboard.resolveWithImage();
      await flush();

      expect(onFileSelect).toHaveBeenCalledTimes(1);
      expect(onFileSelect).toHaveBeenCalledWith(chosen);
    });

    it('does not show a stale no-image message after a newer input', async () => {
      const clipboard = deferredClipboard();
      render(<UploadZone onFileSelect={vi.fn()} />);
      const chosen = new File([imageBlob()], 'chosen.png', { type: 'image/png' });

      fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));
      fireEvent.paste(document, { clipboardData: { files: [chosen] } });
      clipboard.resolveWithText();
      await flush();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('uses the latest props when the read resolves', async () => {
      const clipboard = deferredClipboard();
      const first = vi.fn();
      const latest = vi.fn();
      const { rerender } = render(<UploadZone onFileSelect={first} />);

      fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));
      rerender(<UploadZone onFileSelect={latest} />);
      clipboard.resolveWithImage();
      await flush();

      expect(first).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledTimes(1);
    });

    it('drops the read when the zone became disabled meanwhile', async () => {
      const clipboard = deferredClipboard();
      const onFileSelect = vi.fn();
      const { rerender } = render(<UploadZone onFileSelect={onFileSelect} />);

      fireEvent.click(await screen.findByRole('button', { name: /paste image/i }));
      rerender(<UploadZone onFileSelect={onFileSelect} disabled />);
      clipboard.resolveWithImage();
      await flush();

      expect(onFileSelect).not.toHaveBeenCalled();
    });
  });

  it('ignores pastes while disabled', () => {
    const onFileSelect = vi.fn();
    render(<UploadZone onFileSelect={onFileSelect} disabled />);
    const file = new File([imageBlob()], 'poster.png', { type: 'image/png' });

    fireEvent.paste(document, { clipboardData: { files: [file] } });

    expect(onFileSelect).not.toHaveBeenCalled();
  });
});
