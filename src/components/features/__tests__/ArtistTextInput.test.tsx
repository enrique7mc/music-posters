import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import ArtistTextInput from '../ArtistTextInput';
import { MAX_ARTIST_NAME_LENGTH } from '@/lib/artist-text';
import { MAX_ARTISTS_PER_SEARCH } from '@/lib/constants';

describe('ArtistTextInput', () => {
  const setup = (props = {}) => {
    const onSubmit = vi.fn();
    // The real component is controlled — wire up actual state so typing works.
    function TestHarness() {
      const [value, setValue] = useState('');
      return <ArtistTextInput value={value} onChange={setValue} onSubmit={onSubmit} {...props} />;
    }
    render(<TestHarness />);
    return { onSubmit };
  };

  it('renders the textarea and a disabled Review artists button for blank input', () => {
    setup();
    const textarea = screen.getByLabelText(/artists, one per line/i);
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review artists/i })).toBeDisabled();
  });

  it('enables Review artists for valid input and submits the parsed lineup', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const textarea = screen.getByLabelText(/artists, one per line/i);
    await user.type(textarea, 'Alvvays{enter}The Beths');

    const button = screen.getByRole('button', { name: /review artists/i });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const result = onSubmit.mock.calls[0][0];
    expect(result.artists).toEqual([{ name: 'Alvvays' }, { name: 'The Beths' }]);
    expect(result.errorCode).toBeNull();
  });

  it('keeps text editable: typing more lines updates the parsed payload', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const textarea = screen.getByLabelText(/artists, one per line/i);
    await user.type(textarea, 'Alvvays{enter}The Beths{enter}Men I Trust');
    await user.click(screen.getByRole('button', { name: /review artists/i }));
    expect(onSubmit.mock.calls[0][0].artists).toHaveLength(3);
  });

  it('shows a duplicate-removal notice and excludes duplicates from the payload', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const textarea = screen.getByLabelText(/artists, one per line/i);
    await user.type(textarea, 'Alvvays{enter}alvvays');

    expect(screen.getByText(/removed duplicate/i)).toBeInTheDocument();
    expect(screen.getByText(/kept the first spelling/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /review artists/i }));
    expect(onSubmit.mock.calls[0][0].artists).toEqual([{ name: 'Alvvays' }]);
    expect(onSubmit.mock.calls[0][0].duplicates).toEqual(['alvvays']);
  });

  it('reports overlong names and blocks submission', () => {
    setup();
    const tooLong = 'A'.repeat(MAX_ARTIST_NAME_LENGTH + 1);
    fireEvent.change(screen.getByLabelText(/artists, one per line/i), {
      target: { value: `Alvvays\n${tooLong}` },
    });
    expect(screen.getByText(/longer than 100 characters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review artists/i })).toBeDisabled();
  });

  it('rejects more than 150 unique artists and blocks submission', () => {
    setup();
    const raw = Array.from(
      { length: MAX_ARTISTS_PER_SEARCH + 1 },
      (_, i) => `Artist ${i + 1}`
    ).join('\n');
    fireEvent.change(screen.getByLabelText(/artists, one per line/i), { target: { value: raw } });
    expect(screen.getByText(/too many artists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review artists/i })).toBeDisabled();
  });

  it('does not call onSubmit when disabled', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup({ disabled: true });
    const textarea = screen.getByLabelText(/artists, one per line/i);
    await user.type(textarea, 'Alvvays');
    expect(screen.getByRole('button', { name: /review artists/i })).toBeDisabled();
    // Clicks on a disabled button are no-ops, but verify no submit leaked through
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never triggers an /api/analyze request while entering artists', async () => {
    let analyzeCalled = false;
    server.use(
      http.post('*/api/analyze', () => {
        analyzeCalled = true;
        return HttpResponse.json({});
      })
    );

    const user = userEvent.setup();
    const { onSubmit } = setup();
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays{enter}The Beths');
    await user.click(screen.getByRole('button', { name: /review artists/i }));

    expect(onSubmit).toHaveBeenCalled();
    // Text entry is purely client-side: image analysis must never fire.
    expect(analyzeCalled).toBe(false);
  });
});
