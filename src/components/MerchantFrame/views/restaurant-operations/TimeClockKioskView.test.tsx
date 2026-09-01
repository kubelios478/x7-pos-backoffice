import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TimeClockKioskView } from './TimeClockKioskView';
import { validatePin, resetLockoutState, submitPunch, getCollaboratorPunchState } from '../../../../api/attendance';

describe('TimeClockKioskView & Attendance Pipeline', () => {
  beforeEach(() => {
    resetLockoutState();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Time Clock Kiosk UI with digit keypad and clock', () => {
    render(<TimeClockKioskView />);

    expect(screen.getByText(/Time Clock Terminal/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter Security PIN/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '1' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '9' })[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeInTheDocument();
  });

  it('authenticates collaborator upon entering valid 4-digit PIN', async () => {
    render(<TimeClockKioskView />);

    // Enter PIN 1234 for Carlos Mendoza (Supervisor)
    fireEvent.click(screen.getAllByRole('button', { name: '1' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '2' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '3' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '4' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
      expect(screen.getByText(/Supervisor • Floor Management/i)).toBeInTheDocument();
    });
  });

  it('enforces rate-limiting lockout after 3 invalid PIN attempts', () => {
    const res1 = validatePin('0000');
    expect(res1.success).toBe(false);

    const res2 = validatePin('0000');
    expect(res2.success).toBe(false);

    const res3 = validatePin('0000');
    expect(res3.success).toBe(false);
    expect(res3.isLockedOut).toBe(true);
    expect(res3.lockoutSecondsRemaining).toBeGreaterThan(0);

    // Any subsequent attempt while locked should fail
    const res4 = validatePin('1234');
    expect(res4.success).toBe(false);
    expect(res4.isLockedOut).toBe(true);
  });

  it('maintains state machine integrity across punches', async () => {
    // Initial state off duty
    const empId = 'emp-101';

    const dummyOverride = {
      supervisorId: 'emp-101',
      supervisorName: 'Carlos Mendoza',
      overrideType: 'EARLY_CLOCK_IN' as const,
      reason: 'Test approval',
      timestamp: new Date().toISOString(),
    };

    // Reset to off duty by clocking out if already working
    await submitPunch({ collaboratorId: empId, punchType: 'CLOCK_OUT' });
    expect(getCollaboratorPunchState(empId)).toBe('CLOCKED_OUT');

    // 1. Clock In -> WORKING
    const res1 = await submitPunch({ collaboratorId: empId, punchType: 'CLOCK_IN', supervisorOverride: dummyOverride });
    expect(res1.success).toBe(true);
    expect(res1.entry?.punchState).toBe('WORKING');
    expect(getCollaboratorPunchState(empId)).toBe('WORKING');

    // 2. Start Break -> ON_BREAK
    const res2 = await submitPunch({ collaboratorId: empId, punchType: 'START_BREAK' });
    expect(res2.success).toBe(true);
    expect(res2.entry?.punchState).toBe('ON_BREAK');
    expect(getCollaboratorPunchState(empId)).toBe('ON_BREAK');

    // 3. End Break -> WORKING
    const res3 = await submitPunch({ collaboratorId: empId, punchType: 'END_BREAK' });
    expect(res3.success).toBe(true);
    expect(res3.entry?.punchState).toBe('WORKING');
    expect(getCollaboratorPunchState(empId)).toBe('WORKING');

    // 4. Clock Out -> CLOCKED_OUT
    const res4 = await submitPunch({ collaboratorId: empId, punchType: 'CLOCK_OUT' });
    expect(res4.success).toBe(true);
    expect(res4.entry?.punchState).toBe('CLOCKED_OUT');
    expect(getCollaboratorPunchState(empId)).toBe('CLOCKED_OUT');
  });

  it('triggers Supervisor Override modal when attempting an unscheduled clock-in', async () => {
    render(<TimeClockKioskView />);

    // Authenticate Mateo Hernandez (PIN 4567, no shift scheduled for Monday)
    fireEvent.click(screen.getAllByRole('button', { name: '4' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '5' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '6' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '7' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Valeria Gomez')).toBeInTheDocument();
    });

    // Click Clock In
    const clockInBtn = screen.getByRole('button', { name: /CLOCK IN/i });
    fireEvent.click(clockInBtn);

    await waitFor(() => {
      expect(screen.getByText(/Supervisor Override Required/i)).toBeInTheDocument();
      expect(screen.getByText(/Unscheduled Shift Clock-In/i)).toBeInTheDocument();
    });
  });
});
