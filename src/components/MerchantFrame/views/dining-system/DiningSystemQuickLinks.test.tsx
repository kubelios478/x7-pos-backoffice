import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';

const ALL_LABELS = ['FLOOR PLANS', 'FLOOR ZONES', 'DINING TABLES', 'TABLE ASSIGNMENTS'];

describe('DiningSystemQuickLinks', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all four dining system anchors', () => {
    render(<DiningSystemQuickLinks active="floor-plans" />);

    ALL_LABELS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('marks the active anchor with aria-current and keeps it non-interactive', () => {
    render(<DiningSystemQuickLinks active="floor-plans" />);

    const activeAnchor = screen.getByText('FLOOR PLANS');
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'FLOOR PLANS' })).not.toBeInTheDocument();
  });

  it('marks DINING TABLES active when that is the current workspace', () => {
    render(<DiningSystemQuickLinks active="tables" />);

    expect(screen.getByText('DINING TABLES')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'FLOOR PLANS' })).toBeInTheDocument();
  });

  it.each([
    ['FLOOR ZONES', 'table-zones'],
    ['DINING TABLES', 'tables'],
    ['TABLE ASSIGNMENTS', 'table-assignments'],
  ])('routes %s to the %s feature', async (label, featureId) => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DiningSystemQuickLinks active="floor-plans" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: label }));

    expect(onNavigate).toHaveBeenCalledWith(featureId);
  });

  it('routes FLOOR PLANS when it is not the active workspace', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DiningSystemQuickLinks active="table-assignments" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'FLOOR PLANS' }));

    expect(onNavigate).toHaveBeenCalledWith('floor-plans');
  });

  it('exposes the shortcuts as a labelled navigation landmark', () => {
    render(<DiningSystemQuickLinks active="floor-zones" />);

    expect(
      screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
    ).toBeInTheDocument();
  });
});
