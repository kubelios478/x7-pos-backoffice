import type {
  TimeEntry,
  PunchType,
  CollaboratorPunchState,
  CollaboratorPinAccount,
  TimeClockConfig,
  PinAuthResult,
  SupervisorOverrideLog,
  AttendanceStatus,
  AttendanceAuditLog,
  AttendanceLedgerRecord,
  ScheduledWindow,
  UpdateAttendanceLedgerDto,
} from '../types/attendance';
import type { ShiftAssignment } from '../types/shifts';
import { fetchShiftAssignments, INITIAL_COLLABORATORS, parseTimeToMinutes } from './shifts';

export const DEFAULT_CONFIG: TimeClockConfig = {
  gracePeriodMinutes: 15,
  enablePhotoVerification: true,
  maxPinAttempts: 3,
  lockoutDurationSeconds: 30,
};

export const DEFAULT_PIN_ACCOUNTS: CollaboratorPinAccount[] = [
  {
    collaboratorId: 'emp-101',
    name: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    pin: '1234',
    badgeCode: 'BADGE-101',
    isSupervisor: true,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
  },
  {
    collaboratorId: 'emp-102',
    name: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    pin: '2345',
    badgeCode: 'BADGE-102',
    isSupervisor: false,
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces',
  },
  {
    collaboratorId: 'emp-103',
    name: 'Mateo Hernandez',
    role: 'Waitstaff',
    department: 'Dining Room',
    pin: '3456',
    badgeCode: 'BADGE-103',
    isSupervisor: false,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces',
  },
  {
    collaboratorId: 'emp-104',
    name: 'Valeria Gomez',
    role: 'Bartender',
    department: 'Bar & Lounge',
    pin: '4567',
    badgeCode: 'BADGE-104',
    isSupervisor: false,
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=faces',
  },
  {
    collaboratorId: 'emp-105',
    name: 'Alejandro Ramos',
    role: 'Line Cook',
    department: 'Kitchen (BOH)',
    pin: '5678',
    badgeCode: 'BADGE-105',
    isSupervisor: false,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
  },
  {
    collaboratorId: 'emp-106',
    name: 'Camila Fernandez',
    role: 'Cashier',
    department: 'Front Desk',
    pin: '6789',
    badgeCode: 'BADGE-106',
    isSupervisor: true,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces',
  },
];

// In-memory state for rate-limiting
let failedPinAttempts = 0;
let lockoutUntilMs = 0;

// Local storage key for persistent attendance logs
const TIME_ENTRIES_STORAGE_KEY = 'x7_time_entries_db_v1';

export function loadStoredTimeEntries(): TimeEntry[] {
  try {
    const raw = localStorage.getItem(TIME_ENTRIES_STORAGE_KEY);
    if (!raw) {
      const initialSeed: TimeEntry[] = [
        {
          id: 'TE-1001',
          collaboratorId: 'emp-101',
          collaboratorName: 'Carlos Mendoza',
          role: 'Supervisor',
          department: 'Floor Management',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
          shiftAssignmentId: 'shift-seed-1',
          scheduledStartTime: '07:00 AM',
          scheduledEndTime: '03:00 PM',
          punchType: 'CLOCK_IN',
          punchState: 'WORKING',
          timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
          timeFormatted: '07:02 AM',
          date: new Date().toISOString().split('T')[0],
          photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop',
          isEarly: false,
          isLate: false,
          isUnscheduled: false,
        },
        {
          id: 'TE-1002',
          collaboratorId: 'emp-102',
          collaboratorName: 'Sofia Rodriguez',
          role: 'Waitstaff',
          department: 'Dining Room',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces',
          shiftAssignmentId: 'shift-seed-2',
          scheduledStartTime: '11:00 AM',
          scheduledEndTime: '07:00 PM',
          punchType: 'CLOCK_IN',
          punchState: 'WORKING',
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          timeFormatted: '10:42 AM',
          date: new Date().toISOString().split('T')[0],
          photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop',
          isEarly: true,
          isLate: false,
          isUnscheduled: false,
          supervisorOverride: {
            supervisorId: 'emp-101',
            supervisorName: 'Carlos Mendoza',
            overrideType: 'EARLY_CLOCK_IN',
            reason: 'Authorized early arrival for morning prep',
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
        },
      ];
      localStorage.setItem(TIME_ENTRIES_STORAGE_KEY, JSON.stringify(initialSeed));
      return initialSeed;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStoredTimeEntries(entries: TimeEntry[]): void {
  try {
    localStorage.setItem(TIME_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Error saving time entries', err);
  }
}

export function resetLockoutState(): void {
  failedPinAttempts = 0;
  lockoutUntilMs = 0;
}

export function getLockoutSecondsRemaining(): number {
  if (Date.now() < lockoutUntilMs) {
    return Math.ceil((lockoutUntilMs - Date.now()) / 1000);
  }
  return 0;
}

export function validatePin(
  pinOrBadge: string,
  config: TimeClockConfig = DEFAULT_CONFIG
): PinAuthResult {
  const secondsRemaining = getLockoutSecondsRemaining();
  if (secondsRemaining > 0) {
    return {
      success: false,
      isLockedOut: true,
      lockoutSecondsRemaining: secondsRemaining,
      error: `Terminal locked due to multiple failed PIN attempts. Try again in ${secondsRemaining}s.`,
    };
  }

  const cleanedInput = pinOrBadge.trim().toUpperCase();
  const account = DEFAULT_PIN_ACCOUNTS.find(
    (acc) => acc.pin === cleanedInput || acc.badgeCode === cleanedInput
  );

  if (!account) {
    failedPinAttempts += 1;
    if (failedPinAttempts >= config.maxPinAttempts) {
      lockoutUntilMs = Date.now() + config.lockoutDurationSeconds * 1000;
      return {
        success: false,
        isLockedOut: true,
        lockoutSecondsRemaining: config.lockoutDurationSeconds,
        error: `Too many invalid PIN attempts! Kiosk locked for ${config.lockoutDurationSeconds} seconds.`,
      };
    }
    return {
      success: false,
      error: `Invalid PIN or Badge Code. Attempt ${failedPinAttempts} of ${config.maxPinAttempts}.`,
    };
  }

  // Valid authentication
  failedPinAttempts = 0;
  lockoutUntilMs = 0;
  return {
    success: true,
    account,
  };
}

export function validateSupervisorPin(
  supervisorId: string,
  pin: string
): { success: boolean; supervisorName?: string; error?: string } {
  const supervisor = DEFAULT_PIN_ACCOUNTS.find(
    (acc) => acc.collaboratorId === supervisorId && acc.isSupervisor
  );

  if (!supervisor) {
    return { success: false, error: 'Selected supervisor account not found or lacks supervisor privileges.' };
  }

  if (supervisor.pin !== pin.trim()) {
    return { success: false, error: 'Incorrect Supervisor Security PIN.' };
  }

  return { success: true, supervisorName: supervisor.name };
}

export function getCollaboratorPunchState(collaboratorId: string): CollaboratorPunchState {
  const entries = loadStoredTimeEntries();
  const collaboratorEntries = entries
    .filter((e) => e.collaboratorId === collaboratorId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (collaboratorEntries.length === 0) {
    return 'OFF_DUTY';
  }

  return collaboratorEntries[0].punchState;
}

export interface ShiftEvaluationResult {
  hasScheduledShift: boolean;
  shiftAssignment?: ShiftAssignment;
  isEarlyClockIn: boolean;
  isLateClockIn: boolean;
  earlyMinutes: number;
  lateMinutes: number;
  requiresSupervisorOverride: boolean;
  overrideReason?: 'EARLY_CLOCK_IN' | 'UNSCHEDULED_SHIFT';
}

export async function evaluateScheduledShift(
  collaboratorId: string,
  now: Date = new Date(),
  config: TimeClockConfig = DEFAULT_CONFIG
): Promise<ShiftEvaluationResult> {
  const allShifts = await fetchShiftAssignments();
  const dateISO = now.toISOString().split('T')[0];

  // Find shift for today
  const todayShift = allShifts.find(
    (s) => s.collaboratorId === collaboratorId && s.date === dateISO
  );

  if (!todayShift) {
    return {
      hasScheduledShift: false,
      isEarlyClockIn: false,
      isLateClockIn: false,
      earlyMinutes: 0,
      lateMinutes: 0,
      requiresSupervisorOverride: true,
      overrideReason: 'UNSCHEDULED_SHIFT',
    };
  }

  const startMin = parseTimeToMinutes(todayShift.startTime);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diffMinutes = startMin - nowMin; // positive if early, negative if late

  const isEarly = diffMinutes > config.gracePeriodMinutes;
  const isLate = -diffMinutes > config.gracePeriodMinutes;

  return {
    hasScheduledShift: true,
    shiftAssignment: todayShift,
    isEarlyClockIn: isEarly,
    isLateClockIn: isLate,
    earlyMinutes: isEarly ? diffMinutes : 0,
    lateMinutes: isLate ? -diffMinutes : 0,
    requiresSupervisorOverride: isEarly,
    overrideReason: isEarly ? 'EARLY_CLOCK_IN' : undefined,
  };
}

export interface SubmitPunchDto {
  collaboratorId: string;
  punchType: PunchType;
  photoUrl?: string;
  supervisorOverride?: SupervisorOverrideLog;
  deviceInfo?: string;
}

export async function submitPunch(dto: SubmitPunchDto): Promise<{ success: boolean; entry?: TimeEntry; error?: string }> {
  const pinAcc = DEFAULT_PIN_ACCOUNTS.find((a) => a.collaboratorId === dto.collaboratorId);
  const collaborator = INITIAL_COLLABORATORS.find((c) => c.id === dto.collaboratorId);

  if (!pinAcc && !collaborator) {
    return { success: false, error: 'Collaborator profile not found.' };
  }

  const name = pinAcc?.name || collaborator?.name || 'Unknown Collaborator';
  const role = pinAcc?.role || collaborator?.role || 'Staff';
  const department = pinAcc?.department || collaborator?.department || 'Operations';
  const avatarUrl = pinAcc?.avatarUrl || collaborator?.avatarUrl;

  const currentState = getCollaboratorPunchState(dto.collaboratorId);

  // Validate state transitions
  let nextState: CollaboratorPunchState = currentState;
  if (dto.punchType === 'CLOCK_IN') {
    if (currentState === 'WORKING' || currentState === 'ON_BREAK') {
      return { success: false, error: 'Collaborator is already clocked in.' };
    }
    nextState = 'WORKING';
  } else if (dto.punchType === 'START_BREAK') {
    if (currentState !== 'WORKING') {
      return { success: false, error: 'Must be clocked in and working to start break.' };
    }
    nextState = 'ON_BREAK';
  } else if (dto.punchType === 'END_BREAK') {
    if (currentState !== 'ON_BREAK') {
      return { success: false, error: 'Must be on break to end break.' };
    }
    nextState = 'WORKING';
  } else if (dto.punchType === 'CLOCK_OUT') {
    if (currentState !== 'WORKING' && currentState !== 'ON_BREAK') {
      return { success: false, error: 'Must be clocked in to clock out.' };
    }
    nextState = 'CLOCKED_OUT';
  }

  const now = new Date();
  const evaluation = await evaluateScheduledShift(dto.collaboratorId, now);

  // Check supervisor override requirement for CLOCK_IN
  if (dto.punchType === 'CLOCK_IN' && evaluation.requiresSupervisorOverride && !dto.supervisorOverride) {
    if (evaluation.overrideReason === 'EARLY_CLOCK_IN') {
      return {
        success: false,
        error: `Early Clock-In requires Shift Supervisor approval (${evaluation.earlyMinutes} min early).`,
      };
    }
    if (evaluation.overrideReason === 'UNSCHEDULED_SHIFT') {
      return {
        success: false,
        error: 'No active scheduled shift found. Unscheduled Clock-In requires Supervisor approval.',
      };
    }
  }

  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const newEntry: TimeEntry = {
    id: `TE-${Date.now()}`,
    collaboratorId: dto.collaboratorId,
    collaboratorName: name,
    role,
    department,
    avatarUrl,
    shiftAssignmentId: evaluation.shiftAssignment?.id,
    scheduledStartTime: evaluation.shiftAssignment?.startTime,
    scheduledEndTime: evaluation.shiftAssignment?.endTime,
    punchType: dto.punchType,
    punchState: nextState,
    timestamp: now.toISOString(),
    timeFormatted: formattedTime,
    date: now.toISOString().split('T')[0],
    photoUrl: dto.photoUrl,
    isEarly: evaluation.isEarlyClockIn,
    isLate: evaluation.isLateClockIn,
    isUnscheduled: !evaluation.hasScheduledShift,
    supervisorOverride: dto.supervisorOverride,
    deviceInfo: dto.deviceInfo || 'POS Tablet Kiosk 01',
  };

  const entries = loadStoredTimeEntries();
  entries.unshift(newEntry);
  saveStoredTimeEntries(entries);

  return {
    success: true,
    entry: newEntry,
  };
}

export function fetchTimeEntries(): TimeEntry[] {
  return loadStoredTimeEntries();
}

export async function loadTimeEntries(): Promise<TimeEntry[]> {
  return loadStoredTimeEntries();
}

export function getSupervisors(): CollaboratorPinAccount[] {
  return DEFAULT_PIN_ACCOUNTS.filter((acc) => acc.isSupervisor);
}

/**
 * Calculates raw worked hours and net payable hours.
 * Formula: Net Payable Worked Hours = (ClockOut - ClockIn) - UnpaidBreaks
 */
export function calculateNetPayableHours(
  clockIn: string | null,
  clockOut: string | null,
  unpaidBreakMinutes: number
): { rawWorkedHours: number; netPayableHours: number } {
  if (!clockIn || !clockOut) {
    return { rawWorkedHours: 0, netPayableHours: 0 };
  }

  const startMin = parseTimeToMinutes(clockIn);
  const endMin = parseTimeToMinutes(clockOut);

  let totalWorkedMins = endMin - startMin;
  if (totalWorkedMins < 0) {
    // Overnight shift crossing midnight
    totalWorkedMins += 1440;
  }

  const rawHours = Math.max(0, parseFloat((totalWorkedMins / 60).toFixed(2)));
  const netMins = Math.max(0, totalWorkedMins - unpaidBreakMinutes);
  const netHours = Math.max(0, parseFloat((netMins / 60).toFixed(2)));

  return {
    rawWorkedHours: rawHours,
    netPayableHours: netHours,
  };
}

/**
 * Determines attendance status and variance indicator badge text.
 */
export function determineAttendanceStatus(
  scheduledWindow?: ScheduledWindow,
  clockIn?: string | null,
  clockOut?: string | null,
  gracePeriodMinutes = 5
): { status: AttendanceStatus; varianceMinutes: number; varianceLabel: string } {
  if (!scheduledWindow) {
    return {
      status: 'UNSCHEDULED',
      varianceMinutes: 0,
      varianceLabel: 'Unscheduled Shift',
    };
  }

  if (!clockIn || !clockOut) {
    return {
      status: 'MISSED_PUNCH',
      varianceMinutes: 0,
      varianceLabel: !clockIn ? 'Missing Clock-In' : 'Missing Clock-Out',
    };
  }

  const startMin = parseTimeToMinutes(scheduledWindow.startTime);
  const clockInMin = parseTimeToMinutes(clockIn);
  const tardyDiff = clockInMin - startMin;

  if (tardyDiff > gracePeriodMinutes) {
    return {
      status: 'TARDY',
      varianceMinutes: tardyDiff,
      varianceLabel: `+${tardyDiff} min Late`,
    };
  }

  const endMin = parseTimeToMinutes(scheduledWindow.endTime);
  const clockOutMin = parseTimeToMinutes(clockOut);
  const earlyDiff = endMin - clockOutMin;

  if (earlyDiff > gracePeriodMinutes) {
    return {
      status: 'EARLY_DEPARTURE',
      varianceMinutes: earlyDiff,
      varianceLabel: `${earlyDiff} min Early`,
    };
  }

  return {
    status: 'ON_TIME',
    varianceMinutes: 0,
    varianceLabel: 'On Time',
  };
}

const ATTENDANCE_LEDGER_STORAGE_KEY = 'x7_attendance_ledger_db_v2';

export const STORE_LOCATIONS = [
  { id: 'loc-all', name: 'All Store Locations' },
  { id: 'loc-101', name: 'Downtown Flagship' },
  { id: 'loc-102', name: 'Uptown Bistro' },
  { id: 'loc-103', name: 'Airport Terminal 2' },
];

function loadStoredAttendanceLedgerRecords(): AttendanceLedgerRecord[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_LEDGER_STORAGE_KEY);
    if (!raw) {
      const todayStr = new Date().toISOString().split('T')[0];
      const initialLedgerSeed: AttendanceLedgerRecord[] = [
        {
          id: 'ATT-1001',
          storeLocationId: 'loc-101',
          storeLocationName: 'Downtown Flagship',
          collaboratorId: 'emp-101',
          collaboratorName: 'Carlos Mendoza',
          role: 'Supervisor',
          department: 'Floor Management',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
          date: todayStr,
          scheduledWindow: { startTime: '08:00 AM', endTime: '04:00 PM', scheduledHours: 8.0 },
          actualPunches: { clockIn: '08:00 AM', clockOut: '04:00 PM' },
          rawWorkedHours: 8.0,
          unpaidBreakMinutes: 30,
          netPayableHours: 7.5,
          status: 'ON_TIME',
          varianceMinutes: 0,
          varianceLabel: 'On Time',
          auditLogs: [],
        },
        {
          id: 'ATT-1002',
          storeLocationId: 'loc-101',
          storeLocationName: 'Downtown Flagship',
          collaboratorId: 'emp-102',
          collaboratorName: 'Sofia Rodriguez',
          role: 'Waitstaff',
          department: 'Dining Room',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces',
          date: todayStr,
          scheduledWindow: { startTime: '09:00 AM', endTime: '05:00 PM', scheduledHours: 8.0 },
          actualPunches: { clockIn: '09:12 AM', clockOut: '05:03 PM' },
          rawWorkedHours: 7.85,
          unpaidBreakMinutes: 30,
          netPayableHours: 7.35,
          status: 'TARDY',
          varianceMinutes: 12,
          varianceLabel: '+12 min Late',
          auditLogs: [],
        },
        {
          id: 'ATT-1003',
          storeLocationId: 'loc-102',
          storeLocationName: 'Uptown Bistro',
          collaboratorId: 'emp-103',
          collaboratorName: 'Mateo Hernandez',
          role: 'Waitstaff',
          department: 'Dining Room',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces',
          date: todayStr,
          scheduledWindow: { startTime: '10:00 AM', endTime: '06:00 PM', scheduledHours: 8.0 },
          actualPunches: { clockIn: '10:01 AM', clockOut: '05:30 PM' },
          rawWorkedHours: 7.48,
          unpaidBreakMinutes: 30,
          netPayableHours: 6.98,
          status: 'EARLY_DEPARTURE',
          varianceMinutes: 30,
          varianceLabel: '30 min Early',
          auditLogs: [],
        },
        {
          id: 'ATT-1004',
          storeLocationId: 'loc-101',
          storeLocationName: 'Downtown Flagship',
          collaboratorId: 'emp-104',
          collaboratorName: 'Valeria Gomez',
          role: 'Bartender',
          department: 'Bar & Lounge',
          avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=faces',
          date: todayStr,
          scheduledWindow: { startTime: '04:00 PM', endTime: '12:00 AM', scheduledHours: 8.0 },
          actualPunches: { clockIn: '04:02 PM', clockOut: null },
          rawWorkedHours: 0,
          unpaidBreakMinutes: 30,
          netPayableHours: 0,
          status: 'MISSED_PUNCH',
          varianceMinutes: 0,
          varianceLabel: 'Missing Clock-Out',
          auditLogs: [],
        },
        {
          id: 'ATT-1005',
          storeLocationId: 'loc-103',
          storeLocationName: 'Airport Terminal 2',
          collaboratorId: 'emp-105',
          collaboratorName: 'Alejandro Ramos',
          role: 'Line Cook',
          department: 'Kitchen (BOH)',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
          date: todayStr,
          actualPunches: { clockIn: '07:30 AM', clockOut: '03:30 PM' },
          rawWorkedHours: 8.0,
          unpaidBreakMinutes: 30,
          netPayableHours: 7.5,
          status: 'UNSCHEDULED',
          varianceMinutes: 0,
          varianceLabel: 'Unscheduled Shift',
          auditLogs: [],
        },
      ];
      localStorage.setItem(ATTENDANCE_LEDGER_STORAGE_KEY, JSON.stringify(initialLedgerSeed));
      return initialLedgerSeed;
    }
    const parsed: AttendanceLedgerRecord[] = JSON.parse(raw);
    return parsed.map((rec) => ({
      ...rec,
      varianceLabel: rec.varianceLabel ? rec.varianceLabel.replace(/Tardy/gi, 'Late') : rec.varianceLabel,
    }));
  } catch {
    return [];
  }
}

function saveStoredAttendanceLedgerRecords(records: AttendanceLedgerRecord[]): void {
  try {
    localStorage.setItem(ATTENDANCE_LEDGER_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Error saving attendance ledger records:', err);
  }
}

export function fetchAttendanceLedgerRecords(): AttendanceLedgerRecord[] {
  return loadStoredAttendanceLedgerRecords();
}

export function updateAttendanceLedgerRecord(
  dto: UpdateAttendanceLedgerDto
): { success: boolean; record?: AttendanceLedgerRecord; error?: string } {
  if (!dto.reason || !dto.reason.trim()) {
    return {
      success: false,
      error: 'Mandatory justification note is required to perform timesheet corrections.',
    };
  }

  const records = loadStoredAttendanceLedgerRecords();
  const index = records.findIndex((r) => r.id === dto.recordId);
  if (index === -1) {
    return { success: false, error: 'Attendance ledger record not found.' };
  }

  const target = records[index];

  const origClockIn = target.actualPunches.clockIn;
  const origClockOut = target.actualPunches.clockOut;
  const origBreak = target.unpaidBreakMinutes;

  const newClockIn = dto.clockIn ? dto.clockIn.trim() : null;
  const newClockOut = dto.clockOut ? dto.clockOut.trim() : null;
  const newBreak = Math.max(0, dto.unpaidBreakMinutes || 0);

  const { rawWorkedHours, netPayableHours } = calculateNetPayableHours(
    newClockIn,
    newClockOut,
    newBreak
  );

  const { status, varianceMinutes, varianceLabel } = determineAttendanceStatus(
    target.scheduledWindow,
    newClockIn,
    newClockOut
  );

  const auditEntry: AttendanceAuditLog = {
    id: `AUD-${Date.now()}`,
    attendanceRecordId: target.id,
    modifiedByUserId: dto.modifiedByUserId,
    modifiedByUserName: dto.modifiedByUserName,
    timestamp: new Date().toISOString(),
    originalClockIn: origClockIn,
    updatedClockIn: newClockIn,
    originalClockOut: origClockOut,
    updatedClockOut: newClockOut,
    originalUnpaidBreakMinutes: origBreak,
    updatedUnpaidBreakMinutes: newBreak,
    reason: dto.reason.trim(),
  };

  const updatedRecord: AttendanceLedgerRecord = {
    ...target,
    actualPunches: {
      clockIn: newClockIn,
      clockOut: newClockOut,
    },
    rawWorkedHours,
    unpaidBreakMinutes: newBreak,
    netPayableHours,
    status,
    varianceMinutes,
    varianceLabel,
    isManualOverride: true,
    auditLogs: [auditEntry, ...(target.auditLogs || [])],
  };

  records[index] = updatedRecord;
  saveStoredAttendanceLedgerRecords(records);

  return {
    success: true,
    record: updatedRecord,
  };
}

