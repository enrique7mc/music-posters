import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressStepper from '../ProgressStepper';

describe('ProgressStepper', () => {
  const steps = [
    { label: 'Upload', href: '/upload' },
    { label: 'Review Artists', href: '/review-artists' },
    { label: 'Review Tracks' },
    { label: 'Done' },
  ];

  it('renders completed steps with an href as accessible links', () => {
    render(<ProgressStepper steps={steps} currentStep={2} />);

    const uploadLink = screen.getByRole('link', { name: /back to upload/i });
    expect(uploadLink).toHaveAttribute('href', '/upload');

    const artistsLink = screen.getByRole('link', { name: /back to review artists/i });
    expect(artistsLink).toHaveAttribute('href', '/review-artists');
  });

  it('keeps current and future steps non-interactive', () => {
    render(<ProgressStepper steps={steps} currentStep={2} />);

    expect(screen.queryByRole('link', { name: /review tracks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /done/i })).not.toBeInTheDocument();
  });

  it('does not link a completed step that has no href', () => {
    render(<ProgressStepper steps={[{ label: 'Upload' }, { label: 'Done' }]} currentStep={1} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('renders without links when no step is completed', () => {
    render(<ProgressStepper steps={steps} currentStep={0} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
