import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyGanttTimelineView } from './DailyGanttTimelineView';
import type { ShiftAssignment, Collaborator } from '../../../../types/shifts';
import * as attendanceApi from '../../../../api/attendance';

vi.mock('../../../../api/attendance', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/attendance')>('../../../../api/attendance');
  return {
    ...actual,
    loadTimeEntries: vi.fn(),
  };
});

const MOCK_COLLABORATORS: Collaborator[] = [
  {
    id: 'emp-101',
    name: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
  },
  {
    id: 'emp-102',
    name: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
  },
];

const MOCK_SHIFTS: ShiftAssignment[] = [
  {
    id: 's-101',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    date: '2026-08-27',
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
  },
  {
    id: 's-102',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    date: '2026-08-27',
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'confirmed',
    hours: 8,
  },
];

const MOCK_TIME_ENTRIES = [
  {
    id: 'TE-101',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    punchType: 'CLOCK_IN',
    punchState: 'WORKING',
    timestamp: '2026-08-27T07:02:00Z',
    timeFormatted: '07:02 AM',
    date: '2026-08-27',
    isLate: false,
  },
  {
    id: 'TE-102',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    punchType: 'START_BREAK',
    punchState: 'ON_BREAK',
    timestamp: '2026-08-27T13:30:00Z',
    timeFormatted: '01:30 PM',
    date: '2026-08-27',
    isLate: false,
  },
];

describe('DailyGanttTimelineView', () => {
  beforeEach(() => {
    vi.mocked(attendanceApi.loadTimeEntries).mockImplementation(() => Promise.resolve(MOCK_TIME_ENTRIES as any));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders 24-hour timeline workspace header, summary cards, and time axis', async () => {
    render(
      <DailyGanttTimelineView
        date="2026-08-27"
        shifts={MOCK_SHIFTS}
        collaborators={MOCK_COLLABORATORS}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Shift Coverage & Clock-In Monitor')).toBeInTheDocument();
    });

    expect(screen.getByText('Gantt / Timeline Workspace')).toBeInTheDocument();
    expect(screen.getByText('2 Shifts')).toBeInTheDocument();
    expect(screen.getByText('Collaborator / Functional Role')).toBeInTheDocument();
  });

  it('displays hourly staffing density heatmap and highlights peak revenue understaffing alerts', async () => {
    render(
      <DailyGanttTimelineView
        date="2026-08-27"
        shifts={MOCK_SHIFTS}
        collaborators={MOCK_COLLABORATORS}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hourly Staffing Density & Peak Coverage Heatmap')).toBeInTheDocument();
    });

    // Verify understaffing warning banner presence (Waitstaff requires min 3 during lunch, mock has 1)
    expect(screen.getByText(/peak hour coverage alert/i)).toBeInTheDocument();
  });

  it('highlights collaborator punch states (DUTY, ON_BREAK) against scheduled shift bars', async () => {
    render(
      <DailyGanttTimelineView
        date="2026-08-27"
        shifts={MOCK_SHIFTS}
        collaborators={MOCK_COLLABORATORS}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Carlos Mendoza').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Sofia Rodriguez').length).toBeGreaterThan(0);
    expect(screen.getByText('DUTY')).toBeInTheDocument();
    expect(screen.getByText('ON_BREAK')).toBeInTheDocument();
  });

  it('opens inspector drawer upon clicking a Gantt shift bar and handles reassignment', async () => {
    const handleReassign = vi.fn().mockResolvedValue(undefined);

    render(
      <DailyGanttTimelineView
        date="2026-08-27"
        shifts={MOCK_SHIFTS}
        collaborators={MOCK_COLLABORATORS}
        onReassignShift={handleReassign}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Carlos Mendoza').length).toBeGreaterThan(0);
    });

    const shiftBar = screen.getByTitle(/shift #s-101: 07:00 am - 03:00 pm/i);
    fireEvent.click(shiftBar);

    await waitFor(() => {
      expect(screen.getByText('Shift Inspector & Reassignment')).toBeInTheDocument();
    });

    expect(screen.getByText('Shift Assignment #s-101')).toBeInTheDocument();

    const select = screen.getByLabelText('Target Collaborator');
    fireEvent.change(select, { target: { value: 'emp-102' } });

    const confirmBtn = screen.getByRole('button', { name: /confirm reassignment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleReassign).toHaveBeenCalledWith('s-101', 'emp-102');
    });
  });

  it('renders live current time indicator line when viewing current date', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    render(
      <DailyGanttTimelineView
        date={todayStr}
        shifts={MOCK_SHIFTS}
        collaborators={MOCK_COLLABORATORS}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });
});
