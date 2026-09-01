import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ShiftSwapManagementView } from './ShiftSwapManagementView';
import * as shiftsApi from '../../../../api/shifts';
import type { ShiftSwapRequest, ShiftAssignment } from '../../../../types/shifts';

const MOCK_SWAPS: ShiftSwapRequest[] = [
  {
    id: 'SWP-101',
    merchantId: 'merch-main-01',
    shiftId: 'shift-3',
    requestingCollaboratorId: 'emp-101',
    requestingCollaboratorName: 'Carlos Mendoza',
    requestingCollaboratorRole: 'Supervisor',
    targetCollaboratorId: 'emp-102',
    targetCollaboratorName: 'Sofia Rodriguez',
    targetCollaboratorRole: 'Waitstaff',
    shiftDate: '2026-08-28',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Supervisor',
    hours: 7,
    reason: 'Medical appointment',
    status: 'PENDING_SUPERVISOR_APPROVAL',
    createdAt: '2026-08-25T09:00:00Z',
  },
  {
    id: 'SWP-102',
    merchantId: 'merch-main-01',
    shiftId: 'shift-6',
    requestingCollaboratorId: 'emp-102',
    requestingCollaboratorName: 'Sofia Rodriguez',
    requestingCollaboratorRole: 'Waitstaff',
    targetCollaboratorId: 'emp-103',
    targetCollaboratorName: 'Mateo Hernandez',
    targetCollaboratorRole: 'Waitstaff',
    shiftDate: '2026-08-27',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Waitstaff',
    hours: 7,
    reason: 'Personal schedule conflict',
    status: 'PENDING_PEER_ACCEPTANCE',
    createdAt: '2026-08-26T10:15:00Z',
  },
  {
    id: 'SWP-103',
    merchantId: 'merch-main-01',
    shiftId: 'shift-10',
    requestingCollaboratorId: 'emp-104',
    requestingCollaboratorName: 'Valeria Gomez',
    requestingCollaboratorRole: 'Bartender',
    targetCollaboratorId: 'emp-101',
    targetCollaboratorName: 'Carlos Mendoza',
    targetCollaboratorRole: 'Supervisor',
    shiftDate: '2026-08-29',
    startTime: '06:00 PM',
    endTime: '02:00 AM',
    requiredRole: 'Bartender',
    hours: 8,
    reason: 'Agreed shift exchange',
    status: 'APPROVED',
    createdAt: '2026-08-24T15:00:00Z',
    approvedBy: 'Carlos Mendoza (Floor Manager)',
    approvedAt: '2026-08-24T16:30:00Z',
  },
];

const MOCK_SHIFTS: ShiftAssignment[] = [
  {
    id: 'shift-3',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    date: '2026-08-28',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'draft',
    hours: 7,
  },
  {
    id: 'shift-6',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    date: '2026-08-27',
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'draft',
    hours: 7,
  },
];

describe('ShiftSwapManagementView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(shiftsApi, 'fetchShiftSwapRequests').mockResolvedValue([...MOCK_SWAPS]);
    vi.spyOn(shiftsApi, 'fetchShiftAssignments').mockResolvedValue([...MOCK_SHIFTS]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders workspace title and hydrates metrics cards', async () => {
    render(<ShiftSwapManagementView activeMerchantId="merch-main-01" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /SHIFT SWAP & TRADE REQUEST WORKSPACE/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Total Trades')).toBeInTheDocument();
    expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    expect(screen.getByText('#SWP-102')).toBeInTheDocument();
    expect(screen.getByText('#SWP-103')).toBeInTheDocument();
  });

  it('filters trade requests using the alphanumeric search input', async () => {
    render(<ShiftSwapManagementView />);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Search trade requests/i);
    fireEvent.change(searchInput, { target: { value: 'SWP-101' } });

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
      expect(screen.queryByText('#SWP-102')).not.toBeInTheDocument();
      expect(screen.queryByText('#SWP-103')).not.toBeInTheDocument();
    });
  });

  it('filters trade requests by lifecycle status selector', async () => {
    render(<ShiftSwapManagementView />);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/Filter by Trade Request Lifecycle Status/i);
    fireEvent.change(statusSelect, { target: { value: 'APPROVED' } });

    await waitFor(() => {
      expect(screen.getByText('#SWP-103')).toBeInTheDocument();
      expect(screen.queryByText('#SWP-101')).not.toBeInTheDocument();
      expect(screen.queryByText('#SWP-102')).not.toBeInTheDocument();
    });
  });

  it('displays role qualification pre-validation warning when target collaborator lacks certification', async () => {
    render(<ShiftSwapManagementView />);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    // In SWP-101, target is Sofia Rodriguez (Waitstaff), but requiredRole is Supervisor.
    expect(screen.getAllByText(/⚠️ Unqualified Role/i)[0]).toBeInTheDocument();
  });

  it('approves a trade request and triggers automated roster assignment update', async () => {
    const approveSpy = vi.spyOn(shiftsApi, 'approveShiftSwapRequest').mockResolvedValue({
      swap: { ...MOCK_SWAPS[0], status: 'APPROVED' },
      shift: { ...MOCK_SHIFTS[0], collaboratorId: 'emp-102', collaboratorName: 'Sofia Rodriguez' },
    });

    render(<ShiftSwapManagementView />);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    // Find APPROVE button for SWP-101 card
    const approveButtons = screen.getAllByRole('button', { name: /^APPROVE$/i });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('SWP-101', expect.stringContaining('Carlos Mendoza'));
    });
  });

  it('rejects a trade request with mandatory rejection rationale', async () => {
    const rejectSpy = vi.spyOn(shiftsApi, 'rejectShiftSwapRequest').mockResolvedValue({
      ...MOCK_SWAPS[0],
      status: 'REJECTED',
      rejectionReason: 'Policy violation',
    });

    render(<ShiftSwapManagementView />);

    await waitFor(() => {
      expect(screen.getByText('#SWP-101')).toBeInTheDocument();
    });

    // Find REJECT button for SWP-101
    const rejectButtons = screen.getAllByRole('button', { name: /^REJECT$/i });
    fireEvent.click(rejectButtons[0]);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText(/Mandatory Rejection Rationale/i)).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Rejection Reason/i);
    fireEvent.change(textarea, { target: { value: 'Policy violation - lack of certification' } });

    const confirmButton = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith(
        'SWP-101',
        'Policy violation - lack of certification',
        expect.stringContaining('Carlos Mendoza')
      );
    });
  });
});
