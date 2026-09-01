import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CollaboratorPersonalScheduleView } from './CollaboratorPersonalScheduleView';
import * as shiftsApi from '../../../../api/shifts';
import type { ShiftAssignment, ShiftSwapRequest } from '../../../../types/shifts';

const getMondayISO = (offsetDays = 0): string => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetDays;
  const target = new Date(d.setDate(diff));
  return target.toISOString().split('T')[0];
};

const currentMonday = getMondayISO(0);
const currentTuesday = getMondayISO(1);
const currentThursday = getMondayISO(3);

const MOCK_MY_SHIFTS: ShiftAssignment[] = [
  {
    id: 'shift-4',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    date: currentMonday, // Mon
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
    notes: 'Section A tables 1-6',
  },
  {
    id: 'shift-5',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    date: currentTuesday, // Tue
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
  },
  {
    id: 'shift-6',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    date: currentThursday, // Thu
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'draft',
    hours: 7,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
  },
];

const MOCK_SWAPS: ShiftSwapRequest[] = [
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
    shiftDate: currentThursday,
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Waitstaff',
    hours: 7,
    reason: 'Personal schedule conflict',
    status: 'PENDING_PEER_ACCEPTANCE',
    createdAt: new Date().toISOString(),
  },
];

describe('CollaboratorPersonalScheduleView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(shiftsApi, 'fetchMyShiftAssignments').mockResolvedValue(MOCK_MY_SHIFTS);
    vi.spyOn(shiftsApi, 'fetchShiftSwapRequests').mockResolvedValue(MOCK_SWAPS);
  });

  afterEach(() => {
    cleanup();
  });

  it('enforces personal collaborator scope and renders personal workspace details', async () => {
    render(<CollaboratorPersonalScheduleView defaultCollaboratorId="emp-102" />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
      expect(screen.getByText('Personal Schedule Portal')).toBeInTheDocument();
    });

    // Check weekly summary hours vs labor cap banner
    expect(screen.getByText('/ 40.0 hrs cap')).toBeInTheDocument();
  });

  it('toggles between Weekly Cards View and Monthly Grid View', async () => {
    render(<CollaboratorPersonalScheduleView defaultCollaboratorId="emp-102" />);

    await waitFor(() => {
      expect(screen.getByText('7-Day Schedule Overview')).toBeInTheDocument();
    });

    // Switch to Monthly Grid View
    const monthlyBtn = screen.getByText('Monthly Grid');
    fireEvent.click(monthlyBtn);

    await waitFor(() => {
      expect(screen.getByText('Monthly Shifts Overview')).toBeInTheDocument();
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });
  });

  it('opens Shift Trade Modal and submits shift trade request', async () => {
    const createSwapSpy = vi
      .spyOn(shiftsApi, 'createShiftSwapRequest')
      .mockResolvedValue({
        id: 'SWP-999',
        merchantId: 'merch-main-01',
        shiftId: 'shift-4',
        requestingCollaboratorId: 'emp-102',
        requestingCollaboratorName: 'Sofia Rodriguez',
        requestingCollaboratorRole: 'Waitstaff',
        targetCollaboratorId: 'emp-103',
        targetCollaboratorName: 'Mateo Hernandez',
        targetCollaboratorRole: 'Waitstaff',
        shiftDate: '2026-08-24',
        startTime: '11:00 AM',
        endTime: '07:00 PM',
        requiredRole: 'Waitstaff',
        hours: 8,
        reason: 'Medical appointment',
        status: 'PENDING_SUPERVISOR_APPROVAL',
        createdAt: new Date().toISOString(),
      });

    render(<CollaboratorPersonalScheduleView defaultCollaboratorId="emp-102" />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
    });

    // Click Trade Shift on the first shift card
    const tradeButtons = screen.getAllByText('Trade Shift');
    fireEvent.click(tradeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Trade Shift Request')).toBeInTheDocument();
    });

    // Type reason
    const reasonInput = screen.getByPlaceholderText(
      'Provide context or explanation for requesting this shift swap...'
    );
    fireEvent.change(reasonInput, { target: { value: 'Medical appointment' } });

    // Submit trade request
    const submitBtn = screen.getByText('Submit Trade Request');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSwapSpy).toHaveBeenCalled();
    });
  });

  it('opens Time-Off Notice Modal and submits advance absence notice', async () => {
    const absenceSpy = vi
      .spyOn(shiftsApi, 'submitShiftAbsenceNotice')
      .mockResolvedValue({
        ...MOCK_MY_SHIFTS[0],
        status: 'absent',
      });

    render(<CollaboratorPersonalScheduleView defaultCollaboratorId="emp-102" />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
    });

    // Click Time-Off on the shift card
    const timeOffButtons = screen.getAllByText('Time-Off');
    fireEvent.click(timeOffButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Submit Time-Off / Absence Notice')).toBeInTheDocument();
    });

    // Submit absence notice
    const confirmBtn = screen.getByText('Confirm Absence Notice');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(absenceSpy).toHaveBeenCalledWith('shift-4', 'Medical / Illness', '');
    });
  });

  it('triggers calendar download export when Export Calendar (.ics) button is clicked', async () => {
    const downloadSpy = vi.spyOn(shiftsApi, 'downloadICSFile').mockImplementation(() => {});

    render(<CollaboratorPersonalScheduleView defaultCollaboratorId="emp-102" />);

    await waitFor(() => {
      expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
    });

    const exportBtn = screen.getByText('Export Calendar (.ics)');
    fireEvent.click(exportBtn);

    expect(downloadSpy).toHaveBeenCalled();
  });
});
