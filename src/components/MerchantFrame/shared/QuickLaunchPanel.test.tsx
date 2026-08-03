import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickLaunchPanel } from './QuickLaunchPanel';

describe('QuickLaunchPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, description, and action buttons in a shared layout', () => {
    const onPrimary = vi.fn();
    const onDanger = vi.fn();

    render(
      <QuickLaunchPanel
        description="Corporate administrative shortcuts."
        actions={[
          { id: 'primary', label: 'PRIMARY ACTION', onClick: onPrimary },
          { id: 'danger', label: 'EMERGENCY SUPPORT', variant: 'danger', onClick: onDanger },
        ]}
      />,
    );

    expect(screen.getByText('Quick Launch')).toBeInTheDocument();
    expect(
      screen.getByText('Corporate administrative shortcuts.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /primary action/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /emergency support/i })).toBeInTheDocument();
  });

  it('fires action callbacks when buttons are clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <QuickLaunchPanel
        description="Test shortcuts."
        actions={[{ label: 'OPEN MODULE', onClick }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open module/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders an active action as non-interactive text with aria-current, not a button', () => {
    const onActive = vi.fn();
    const onOther = vi.fn();

    render(
      <QuickLaunchPanel
        description="Test shortcuts."
        actions={[
          { id: 'current', label: 'CURRENT VIEW', onClick: onActive, active: true },
          { id: 'other', label: 'OTHER VIEW', onClick: onOther },
        ]}
      />,
    );

    const activeAnchor = screen.getByText('CURRENT VIEW');
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /current view/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /other view/i })).toBeInTheDocument();
  });

  it('does not fire onClick for an active action even when clicked', async () => {
    const user = userEvent.setup();
    const onActive = vi.fn();

    render(
      <QuickLaunchPanel
        description="Test shortcuts."
        actions={[{ label: 'CURRENT VIEW', onClick: onActive, active: true }]}
      />,
    );

    await user.click(screen.getByText('CURRENT VIEW'));
    expect(onActive).not.toHaveBeenCalled();
  });
});
