import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';

describe('StaffManagementQuickLinks — Persistent Navigation Bar', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders all staff management shortcut anchors with Material Symbols icons', () => {
    render(<StaffManagementQuickLinks activeModule="ledger" />);

    expect(screen.getByText('WEEKLY MATRIX')).toBeInTheDocument();
    expect(screen.getByText('DAILY TIMELINE')).toBeInTheDocument();
    expect(screen.getByText('MONTHLY ROSTER')).toBeInTheDocument();
    expect(screen.getByText('SHIFT SWAPS')).toBeInTheDocument();
    expect(screen.getByText('ATTENDANCE LEDGER')).toBeInTheDocument();
    expect(screen.getByText('TIME CLOCK KIOSK')).toBeInTheDocument();
  });

  it('highlights "ATTENDANCE LEDGER" as active when activeModule is ledger or /staff-management/attendance/ledger', () => {
    render(<StaffManagementQuickLinks activeModule="/staff-management/attendance/ledger" />);

    const activeAnchor = screen.getByText('ATTENDANCE LEDGER').closest('[aria-current="page"]');
    expect(activeAnchor).toBeInTheDocument();
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
  });

  it('triggers onNavigate with target route when clicking a bottom shortcut anchor', () => {
    const onNavigate = vi.fn();
    render(<StaffManagementQuickLinks activeModule="ledger" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /MONTHLY ROSTER/i }));
    expect(onNavigate).toHaveBeenCalledWith('/staff-management/schedule/roster');

    fireEvent.click(screen.getByRole('button', { name: /WEEKLY MATRIX/i }));
    expect(onNavigate).toHaveBeenCalledWith('/staff-management/schedule/shifts');

    fireEvent.click(screen.getByRole('button', { name: /SHIFT SWAPS/i }));
    expect(onNavigate).toHaveBeenCalledWith('/staff-management/schedule/swaps');

    fireEvent.click(screen.getByRole('button', { name: /TIME CLOCK KIOSK/i }));
    expect(onNavigate).toHaveBeenCalledWith('/staff-management/attendance/kiosk');
  });
});
