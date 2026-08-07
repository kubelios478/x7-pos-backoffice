//src/components/shared/StatusToggle.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusToggleButton, ConfirmStatusToggleDialog, normalizeStatus } from './StatusToggle';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('normalizeStatus', () => {
  it('returns active for active', () => {
    expect(normalizeStatus('active')).toBe('active');
  });

  it('returns inactive for inactive', () => {
    expect(normalizeStatus('inactive')).toBe('inactive');
  });

  it('treats legacy deleted status as inactive', () => {
    expect(normalizeStatus('deleted')).toBe('inactive');
  });
});

describe('StatusToggleButton', () => {
  it('renders the block icon and a Deactivate aria-label when status is active', () => {
    render(<StatusToggleButton status="active" entityLabel="Gold Plan" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Deactivate Gold Plan' })).toBeInTheDocument();
    expect(screen.getByText('block')).toBeInTheDocument();
  });

  it('renders the check_circle icon and an Activate aria-label when status is inactive', () => {
    render(<StatusToggleButton status="inactive" entityLabel="Gold Plan" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Activate Gold Plan' })).toBeInTheDocument();
    expect(screen.getByText('check_circle')).toBeInTheDocument();
  });

  it('treats legacy deleted status the same as inactive (shows Activate)', () => {
    render(<StatusToggleButton status="deleted" entityLabel="Gold Plan" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Activate Gold Plan' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StatusToggleButton status="active" entityLabel="Gold Plan" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Deactivate Gold Plan' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmStatusToggleDialog', () => {
  it('shows deactivate copy and calls onConfirm when direction is deactivate', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmStatusToggleDialog
        entityName="Gold Plan"
        direction="deactivate"
        submitting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/^DEACTIVATE$/)).toBeInTheDocument();
    expect(screen.getByText(/Gold Plan/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /deactivate/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows activate copy and calls onConfirm when direction is activate', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmStatusToggleDialog
        entityName="Gold Plan"
        direction="activate"
        submitting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/^ACTIVATE$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ConfirmStatusToggleDialog
        entityName="Gold Plan"
        direction="deactivate"
        submitting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and disables the confirm button while submitting', () => {
    render(
      <ConfirmStatusToggleDialog
        entityName="Gold Plan"
        direction="deactivate"
        submitting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('progress_activity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deactivating/i })).toBeDisabled();
  });
});
