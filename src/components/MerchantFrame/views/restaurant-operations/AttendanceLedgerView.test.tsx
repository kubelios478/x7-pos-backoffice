import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TimeEntriesView } from './TimeEntriesView';
import {
  calculateNetPayableHours,
  determineAttendanceStatus,
  fetchAttendanceLedgerRecords,
  updateAttendanceLedgerRecord,
} from '../../../../api/attendance';

describe('Attendance Ledger Workspace Directory & Calculation Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Net Payable Worked Hours Formula', () => {
    it('accurately subtracts unpaid break duration from total shift time: (ClockOut - ClockIn) - UnpaidBreaks', () => {
      // 09:00 AM to 05:00 PM (8.0 hours raw) - 30 mins (0.50 hrs break) = 7.50 net payable hours
      const result1 = calculateNetPayableHours('09:00 AM', '05:00 PM', 30);
      expect(result1.rawWorkedHours).toBe(8.0);
      expect(result1.netPayableHours).toBe(7.5);

      // 09:12 AM to 05:03 PM (7.85 hours raw) - 30 mins (0.50 hrs break) = 7.35 net payable hours
      const result2 = calculateNetPayableHours('09:12 AM', '05:03 PM', 30);
      expect(result2.rawWorkedHours).toBe(7.85);
      expect(result2.netPayableHours).toBe(7.35);

      // 08:00 AM to 04:00 PM with 0 break = 8.0 net payable hours
      const result3 = calculateNetPayableHours('08:00 AM', '04:00 PM', 0);
      expect(result3.rawWorkedHours).toBe(8.0);
      expect(result3.netPayableHours).toBe(8.0);
    });

    it('returns 0 net payable hours when clock-out is missing', () => {
      const result = calculateNetPayableHours('09:00 AM', null, 30);
      expect(result.rawWorkedHours).toBe(0);
      expect(result.netPayableHours).toBe(0);
    });
  });

  describe('2. Attendance Status & Variance Determination', () => {
    const scheduledWindow = {
      startTime: '09:00 AM',
      endTime: '05:00 PM',
      scheduledHours: 8.0,
    };

    it('evaluates ON_TIME when clock-in is within the 5-minute grace period', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:04 AM', '05:00 PM', 5);
      expect(result.status).toBe('ON_TIME');
      expect(result.varianceLabel).toBe('On Time');
    });

    it('evaluates TARDY when clock-in is past the 5-minute grace period', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:12 AM', '05:03 PM', 5);
      expect(result.status).toBe('TARDY');
      expect(result.varianceMinutes).toBe(12);
      expect(result.varianceLabel).toBe('+12 min Late');
    });

    it('evaluates EARLY_DEPARTURE when clock-out is prior to scheduled end time', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:00 AM', '04:30 PM', 5);
      expect(result.status).toBe('EARLY_DEPARTURE');
      expect(result.varianceMinutes).toBe(30);
      expect(result.varianceLabel).toBe('30 min Early');
    });

    it('evaluates MISSED_PUNCH when clock-out is missing', () => {
      const result = determineAttendanceStatus(scheduledWindow, '09:00 AM', null, 5);
      expect(result.status).toBe('MISSED_PUNCH');
      expect(result.varianceLabel).toBe('Missing Clock-Out');
    });

    it('evaluates UNSCHEDULED when shift assignment is missing', () => {
      const result = determineAttendanceStatus(undefined, '08:00 AM', '04:00 PM', 5);
      expect(result.status).toBe('UNSCHEDULED');
      expect(result.varianceLabel).toBe('Unscheduled Shift');
    });
  });

  describe('3. Immutable Audit Trail & Manual Timesheet Correction', () => {
    it('enforces mandatory justification reason upon record adjustment', () => {
      const records = fetchAttendanceLedgerRecords();
      const targetId = records[0].id;

      const attemptEmptyReason = updateAttendanceLedgerRecord({
        recordId: targetId,
        clockIn: '08:00 AM',
        clockOut: '04:00 PM',
        unpaidBreakMinutes: 30,
        reason: '   ',
        modifiedByUserId: 'usr-admin-1',
        modifiedByUserName: 'Manager Test',
      });

      expect(attemptEmptyReason.success).toBe(false);
      expect(attemptEmptyReason.error).toContain('Mandatory justification note is required');
    });

    it('creates an immutable audit log entry containing editor ID, timestamps, prior values, and justification reason', () => {
      const records = fetchAttendanceLedgerRecords();
      const target = records.find((r) => r.status === 'MISSED_PUNCH') || records[0];

      const updateRes = updateAttendanceLedgerRecord({
        recordId: target.id,
        clockIn: '04:02 PM',
        clockOut: '12:00 AM',
        unpaidBreakMinutes: 30,
        reason: 'Employee forgot to clock out at shift end, verified with CCTV.',
        modifiedByUserId: 'usr-admin-901',
        modifiedByUserName: 'Jane Admin',
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.record).toBeDefined();

      const updated = updateRes.record!;
      expect(updated.actualPunches.clockOut).toBe('12:00 AM');
      expect(updated.netPayableHours).toBe(7.47);
      expect(updated.isManualOverride).toBe(true);
      expect(updated.auditLogs.length).toBeGreaterThan(0);

      const latestAudit = updated.auditLogs[0];
      expect(latestAudit.modifiedByUserId).toBe('usr-admin-901');
      expect(latestAudit.modifiedByUserName).toBe('Jane Admin');
      expect(latestAudit.reason).toBe('Employee forgot to clock out at shift end, verified with CCTV.');
      expect(latestAudit.originalClockOut).toBeNull();
      expect(latestAudit.updatedClockOut).toBe('12:00 AM');
    });
  });

  describe('4. Attendance Ledger Workspace UI Integration', () => {
    it('renders the Attendance Ledger grid layout with high scannability and metrics', () => {
      render(<TimeEntriesView />);

      expect(screen.getByText(/Attendance Ledger & Timesheet Audit/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Net Payable Hours/i)).toBeInTheDocument();
      expect(screen.getByText(/On-Time Attendance Rate/i)).toBeInTheDocument();
      expect(screen.getByText(/Carlos Mendoza/i)).toBeInTheDocument();
      expect(screen.getByText(/Sofia Rodriguez/i)).toBeInTheDocument();
      expect(screen.getByText(/\+12 min Late/i)).toBeInTheDocument();
    });

    it('filters ledger rows when selecting an attendance status filter tab', async () => {
      render(<TimeEntriesView />);

      // Click on Tardy filter tab button using data-testid
      const tardyButton = screen.getByTestId('filter-tardy');
      fireEvent.click(tardyButton);

      await waitFor(() => {
        expect(screen.getByText('Sofia Rodriguez')).toBeInTheDocument();
        expect(screen.queryByText('Carlos Mendoza')).not.toBeInTheDocument();
      });
    });

    it('opens Timesheet Correction drawer upon clicking Adjust button', async () => {
      render(<TimeEntriesView />);

      const adjustButtons = screen.getAllByRole('button', { name: /Adjust/i });
      fireEvent.click(adjustButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Manual Timesheet Correction/i)).toBeInTheDocument();
        expect(screen.getByText(/Mandatory Audit Justification Note/i)).toBeInTheDocument();
      });
    });
  });
});
