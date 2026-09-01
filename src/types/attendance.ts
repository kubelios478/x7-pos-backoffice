export type PunchType = 'CLOCK_IN' | 'START_BREAK' | 'END_BREAK' | 'CLOCK_OUT';

export type CollaboratorPunchState = 'OFF_DUTY' | 'WORKING' | 'ON_BREAK' | 'CLOCKED_OUT';

export type OverrideReasonType = 'EARLY_CLOCK_IN' | 'UNSCHEDULED_SHIFT' | 'MANUAL_CORRECTION';

export interface SupervisorOverrideLog {
  supervisorId: string;
  supervisorName: string;
  overrideType: OverrideReasonType;
  reason: string;
  timestamp: string;
}

export interface TimeEntry {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  role: string;
  department: string;
  avatarUrl?: string;
  shiftAssignmentId?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  punchType: PunchType;
  punchState: CollaboratorPunchState;
  timestamp: string; // ISO String
  timeFormatted: string; // e.g. "10:04 AM"
  date: string; // YYYY-MM-DD
  photoUrl?: string;
  isEarly?: boolean;
  isLate?: boolean;
  isUnscheduled?: boolean;
  supervisorOverride?: SupervisorOverrideLog;
  deviceInfo?: string;
}

export interface CollaboratorPinAccount {
  collaboratorId: string;
  name: string;
  role: string;
  department: string;
  pin: string; // 4 to 6 digits
  badgeCode?: string;
  isSupervisor: boolean;
  avatarUrl?: string;
}

export interface TimeClockConfig {
  gracePeriodMinutes: number; // e.g. 15
  enablePhotoVerification: boolean;
  maxPinAttempts: number; // e.g. 3
  lockoutDurationSeconds: number; // e.g. 30
}

export interface PinAuthResult {
  success: boolean;
  account?: CollaboratorPinAccount;
  error?: string;
  isLockedOut?: boolean;
  lockoutSecondsRemaining?: number;
}

export type AttendanceStatus =
  | 'ON_TIME'
  | 'TARDY'
  | 'EARLY_DEPARTURE'
  | 'MISSED_PUNCH'
  | 'UNSCHEDULED';

export interface AttendanceAuditLog {
  id: string;
  attendanceRecordId: string;
  modifiedByUserId: string;
  modifiedByUserName: string;
  timestamp: string; // ISO format
  originalClockIn: string | null;
  updatedClockIn: string | null;
  originalClockOut: string | null;
  updatedClockOut: string | null;
  originalUnpaidBreakMinutes: number;
  updatedUnpaidBreakMinutes: number;
  reason: string; // Mandatory justification note
}

export interface ScheduledWindow {
  startTime: string; // e.g. "09:00 AM"
  endTime: string;   // e.g. "05:00 PM"
  scheduledHours: number; // e.g. 8.0
}

export interface ActualPunches {
  clockIn: string | null;  // e.g. "09:12 AM"
  clockOut: string | null; // e.g. "05:03 PM"
}

export interface AttendanceLedgerRecord {
  id: string;
  storeLocationId: string;
  storeLocationName: string;
  collaboratorId: string;
  collaboratorName: string;
  role: string;
  department: string;
  avatarUrl?: string;
  date: string; // YYYY-MM-DD
  scheduledWindow?: ScheduledWindow;
  actualPunches: ActualPunches;
  rawWorkedHours: number; // Raw shift time in hours
  unpaidBreakMinutes: number; // Unpaid break time in minutes
  netPayableHours: number; // (ClockOut - ClockIn) - UnpaidBreaks
  status: AttendanceStatus;
  varianceMinutes: number; // Time discrepancy in minutes
  varianceLabel: string; // Human readable variance badge text
  isManualOverride?: boolean;
  auditLogs: AttendanceAuditLog[];
}

export interface UpdateAttendanceLedgerDto {
  recordId: string;
  clockIn: string | null;
  clockOut: string | null;
  unpaidBreakMinutes: number;
  reason: string; // Mandatory justification note
  modifiedByUserId: string;
  modifiedByUserName: string;
}

