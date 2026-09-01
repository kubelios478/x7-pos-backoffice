import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftAssignmentView } from './ShiftAssignmentView';
import * as shiftsApi from '../../../../api/shifts';
import type { ShiftAssignment } from '../../../../types/shifts';

vi.mock('../../../../api/shifts', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/shifts')>('../../../../api/shifts');
  return {
    ...actual,
    fetchShiftAssignments: vi.fn(),
    publishWeeklyRoster: vi.fn(),
    createShiftAssignment: vi.fn(),
    updateShiftAssignment: vi.fn(),
    deleteShiftAssignment: vi.fn(),
    fetchShiftSwapRequests: vi.fn(),
    approveShiftSwapRequest: vi.fn(),
    rejectShiftSwapRequest: vi.fn(),
  };
});

const MOCK_SHIFTS: ShiftAssignment[] = [
  {
    id: 's-101',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    date: '2026-08-17',
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'draft',
    hours: 8,
  },
  {
    id: 's-102',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    date: '2026-08-17',
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'published',
    hours: 8,
  },
];

const MOCK_SWAP_REQUESTS = [
  {
    id: 'SWP-101',
    shiftId: 's-101',
    requestingCollaboratorId: 'emp-101',
    requestingCollaboratorName: 'Carlos Mendoza',
    requestingCollaboratorRole: 'Supervisor',
    targetCollaboratorId: 'emp-102',
    targetCollaboratorName: 'Sofia Rodriguez',
    targetCollaboratorRole: 'Waitstaff',
    shiftDate: '2026-08-21',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Supervisor',
    hours: 7,
    reason: 'Medical appointment',
    status: 'PENDING_APPROVAL',
    createdAt: '2026-08-18T09:00:00Z',
  },
  {
    id: 'SWP-102',
    shiftId: 's-102',
    requestingCollaboratorId: 'emp-102',
    requestingCollaboratorName: 'Sofia Rodriguez',
    requestingCollaboratorRole: 'Waitstaff',
    targetCollaboratorId: 'emp-103',
    targetCollaboratorName: 'Mateo Hernandez',
    targetCollaboratorRole: 'Waitstaff',
    shiftDate: '2026-08-20',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Waitstaff',
    hours: 7,
    reason: 'Personal conflict',
    status: 'PENDING_APPROVAL',
    createdAt: '2026-08-18T10:00:00Z',
  },
];

describe('ShiftAssignmentView', () => {
  beforeEach(() => {
    vi.mocked(shiftsApi.fetchShiftAssignments).mockResolvedValue(MOCK_SHIFTS);
    vi.mocked(shiftsApi.fetchShiftSwapRequests).mockResolvedValue(MOCK_SWAP_REQUESTS as any);
    vi.mocked(shiftsApi.approveShiftSwapRequest).mockResolvedValue({
      swap: { ...(MOCK_SWAP_REQUESTS[0] as any), status: 'APPROVED' },
      shift: { ...MOCK_SHIFTS[0], collaboratorId: 'emp-102', collaboratorName: 'Sofia Rodriguez', role: 'Waitstaff' },
    });
    vi.mocked(shiftsApi.rejectShiftSwapRequest).mockResolvedValue({
      ...(MOCK_SWAP_REQUESTS[0] as any),
      status: 'REJECTED',
      rejectionReason: 'Role qualification mismatch',
    });
    vi.mocked(shiftsApi.publishWeeklyRoster).mockResolvedValue({
      updatedCount: 1,
      shifts: [
        { ...MOCK_SHIFTS[0], status: 'published' },
        MOCK_SHIFTS[1],
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Shift Assignment Matrix header and staff management controls', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    expect(screen.getByText('Staff Management Module')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish weekly roster/i })).toBeInTheDocument();
    expect(screen.getAllByText(/weekly matrix/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/daily timeline/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/monthly/i).length).toBeGreaterThan(0);
  });

  it('displays collaborator Y-axis rows grouped by role with weekly hours summary', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    });

    expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
    expect(screen.getAllByText('Floor Management').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dining Room').length).toBeGreaterThan(0);

    // Verify weekly hours badges
    expect(screen.getAllByText('8.0 hrs').length).toBeGreaterThan(0);
  });

  it('applies DRAFT dashed border lifecycle guard and handles publication trigger', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getAllByText(/draft/i)[0]).toBeInTheDocument();
    });

    expect(screen.getAllByText(/published/i)[0]).toBeInTheDocument();

    const publishBtn = screen.getByRole('button', { name: /publish weekly roster/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(shiftsApi.publishWeeklyRoster).toHaveBeenCalled();
    });
  });

  it('switches view modes to Daily Timeline and Monthly Overview', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    // Toggle to Daily Timeline
    const dailyBtn = screen.getAllByRole('button', { name: /daily timeline/i })[0];
    fireEvent.click(dailyBtn);

    await waitFor(() => {
      expect(screen.getByText('Shift Coverage & Clock-In Monitor')).toBeInTheDocument();
    });

    // Toggle to Monthly Overview
    const monthlyBtn = screen.getAllByRole('button', { name: /monthly/i })[0];
    fireEvent.click(monthlyBtn);

    await waitFor(() => {
      expect(screen.getByText('Monthly Roster Overview')).toBeInTheDocument();
    });
  });

  it('opens ShiftModal and populates template preset defaults (start time, end time, break duration)', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const newShiftBtn = screen.getByRole('button', { name: /new shift/i });
    fireEvent.click(newShiftBtn);

    await waitFor(() => {
      expect(screen.getByText('Assign New Shift')).toBeInTheDocument();
    });

    // Select preset "Closing Shift"
    const presetSelect = screen.getByLabelText(/shift template preset/i);
    fireEvent.change(presetSelect, { target: { value: 'Closing Shift' } });

    expect(screen.getByDisplayValue('05:00 PM')).toBeInTheDocument();
    expect(screen.getByDisplayValue('01:00 AM')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
  });

  it('detects schedule overlap collision and blocks creation with #SFT- error message', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const newShiftBtn = screen.getByRole('button', { name: /new shift/i });
    fireEvent.click(newShiftBtn);

    await waitFor(() => {
      expect(screen.getByText('Assign New Shift')).toBeInTheDocument();
    });

    // Set collaborator to Carlos Mendoza (emp-101) who has shift s-101 on 2026-08-17 (07:00 AM - 03:00 PM)
    const collabSelect = screen.getByLabelText(/collaborator/i);
    fireEvent.change(collabSelect, { target: { value: 'emp-101' } });

    const dateInput = screen.getByLabelText(/shift date/i);
    fireEvent.change(dateInput, { target: { value: '2026-08-17' } });

    const startTimeInput = screen.getByDisplayValue('07:00 AM');
    fireEvent.change(startTimeInput, { target: { value: '07:00 AM' } });

    const endTimeInput = screen.getByDisplayValue('03:00 PM');
    fireEvent.change(endTimeInput, { target: { value: '03:00 PM' } });

    await waitFor(() => {
      expect(
        screen.getByText(/collaborator is already assigned to a shift during this time period \(#sft-s-101\)/i)
      ).toBeInTheDocument();
    });

    // Verify submit button is disabled
    const submitBtn = screen.getByRole('button', { name: /create assignment/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enforces rest period warning banner when rest gap is less than 11 hours', async () => {
    const shiftsWithNightShift: ShiftAssignment[] = [
      {
        id: 's-closing',
        collaboratorId: 'emp-103',
        collaboratorName: 'Mateo Hernandez',
        role: 'Waitstaff',
        department: 'Dining Room',
        date: '2026-08-17',
        startTime: '05:00 PM',
        endTime: '01:00 AM',
        presetName: 'Closing Shift',
        status: 'published',
        hours: 8,
      },
    ];
    vi.mocked(shiftsApi.fetchShiftAssignments).mockResolvedValue(shiftsWithNightShift);

    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const newShiftBtn = screen.getByRole('button', { name: /new shift/i });
    fireEvent.click(newShiftBtn);

    await waitFor(() => {
      expect(screen.getByText('Assign New Shift')).toBeInTheDocument();
    });

    const collabSelect = screen.getByLabelText(/collaborator/i);
    fireEvent.change(collabSelect, { target: { value: 'emp-103' } });

    const dateInput = screen.getByLabelText(/shift date/i);
    fireEvent.change(dateInput, { target: { value: '2026-08-17' } });

    // Candidate shift starting at 07:00 AM (only 6h rest after 01:00 AM)
    const presetSelect = screen.getByLabelText(/shift template preset/i);
    fireEvent.change(presetSelect, { target: { value: 'Morning Opening' } });

    await waitFor(() => {
      expect(
        screen.getByText(/caution: less than 11 hours rest period from previous shift/i)
      ).toBeInTheDocument();
    });
  });

  it('calculates projected weekly overtime hours and highlights overtime alert', async () => {
    const overtimeShifts: ShiftAssignment[] = [
      {
        id: 's-1',
        collaboratorId: 'emp-101',
        collaboratorName: 'Carlos Mendoza',
        role: 'Supervisor',
        department: 'Floor Management',
        date: '2026-08-17',
        startTime: '07:00 AM',
        endTime: '03:00 PM',
        presetName: 'Morning Opening',
        status: 'published',
        hours: 36,
      },
    ];
    vi.mocked(shiftsApi.fetchShiftAssignments).mockResolvedValue(overtimeShifts);

    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const newShiftBtn = screen.getByRole('button', { name: /new shift/i });
    fireEvent.click(newShiftBtn);

    await waitFor(() => {
      expect(screen.getByText('Assign New Shift')).toBeInTheDocument();
    });

    const collabSelect = screen.getByLabelText(/collaborator/i);
    fireEvent.change(collabSelect, { target: { value: 'emp-101' } });

    // Set shift on different date (2026-08-18) so no collision
    const dateInput = screen.getByLabelText(/shift date/i);
    fireEvent.change(dateInput, { target: { value: '2026-08-18' } });

    // Net hours = 8. Total weekly = 36 + 8 = 44 hrs (+4.0 hrs Overtime)
    await waitFor(() => {
      expect(screen.getByText(/\+4\.0 hrs overtime/i)).toBeInTheDocument();
    });
  });

  it('renders Shift Swap Queue table with #SWP- IDs, pending badges, and opens review modal', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const swapsBtn = screen.getByRole('button', { name: /swap requests/i });
    fireEvent.click(swapsBtn);

    await waitFor(() => {
      expect(screen.getByText(/Shift Swap & Trade Request Workspace/i)).toBeInTheDocument();
    });

    expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    expect(screen.getAllByText(/PENDING/i).length).toBeGreaterThan(0);

    // Open review modal
    const detailsButtons = screen.getAllByRole('button', { name: /details & audit/i });
    fireEvent.click(detailsButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Trade Request Audit Panel/i)).toBeInTheDocument();
    });

    // Check Role Qualification
    expect(screen.getAllByText(/Qualified Role/i).length).toBeGreaterThan(0);
  });

  it('approves a shift swap request and triggers ownership transfer', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const swapsBtn = screen.getByRole('button', { name: /swap requests/i });
    fireEvent.click(swapsBtn);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByRole('button', { name: /^APPROVE$/i });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(shiftsApi.approveShiftSwapRequest).toHaveBeenCalledWith('SWP-101', expect.anything());
    });
  });

  it('rejects a shift swap request with mandatory rejection rationale modal', async () => {
    render(<ShiftAssignmentView />);

    await waitFor(() => {
      expect(screen.getByText('Shift Assignment Matrix')).toBeInTheDocument();
    });

    const swapsBtn = screen.getByRole('button', { name: /swap requests/i });
    fireEvent.click(swapsBtn);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    const rejectButtons = screen.getAllByRole('button', { name: /^REJECT$/i });
    fireEvent.click(rejectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/mandatory rejection rationale/i)).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/rejection reason/i);
    fireEvent.change(textarea, { target: { value: 'Role qualification mismatch - Target is Waitstaff' } });

    const confirmBtn = screen.getByRole('button', { name: /confirm rejection/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(shiftsApi.rejectShiftSwapRequest).toHaveBeenCalledWith(
        'SWP-101',
        'Role qualification mismatch - Target is Waitstaff',
        expect.anything()
      );
    });
  });
});
