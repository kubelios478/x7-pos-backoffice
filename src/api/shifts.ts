import type {
  ShiftAssignment,
  CreateShiftAssignmentDto,
  UpdateShiftAssignmentDto,
  Collaborator,
  ShiftTemplatePreset,
  ShiftSwapRequest,
  ShiftSwapStatus,
} from '../types/shifts';
import { getAccessToken } from '../lib/auth-storage';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const SHIFT_PRESETS: ShiftTemplatePreset[] = [
  { id: 'p1', name: 'Morning Opening', startTime: '07:00 AM', endTime: '03:00 PM', defaultHours: 8, breakDuration: 30 },
  { id: 'p2', name: 'Mid-Day Support', startTime: '11:00 AM', endTime: '07:00 PM', defaultHours: 8, breakDuration: 30 },
  { id: 'p3', name: 'Peak Dinner', startTime: '04:00 PM', endTime: '11:00 PM', defaultHours: 7, breakDuration: 30 },
  { id: 'p4', name: 'Closing Shift', startTime: '05:00 PM', endTime: '01:00 AM', defaultHours: 8, breakDuration: 45 },
  { id: 'p5', name: 'Bar Night', startTime: '06:00 PM', endTime: '02:00 AM', defaultHours: 8, breakDuration: 45 },
];

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes('PM');
  const isAM = cleaned.includes('AM');
  const rawTime = cleaned.replace(/AM|PM/g, '').trim();
  const parts = rawTime.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function parseShiftInterval(
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string
): { startMs: number; endMs: number } {
  const startMin = parseTimeToMinutes(startTimeStr);
  let endMin = parseTimeToMinutes(endTimeStr);

  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  const baseDate = new Date(`${dateStr}T00:00:00`).getTime();
  return {
    startMs: baseDate + startMin * 60 * 1000,
    endMs: baseDate + endMin * 60 * 1000,
  };
}

export function findOverlappingShift(
  shifts: ShiftAssignment[],
  collaboratorId: string,
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  excludeShiftId?: string
): ShiftAssignment | undefined {
  const candidate = parseShiftInterval(dateStr, startTimeStr, endTimeStr);

  return shifts.find((s) => {
    if (s.collaboratorId !== collaboratorId) return false;
    if (excludeShiftId && s.id === excludeShiftId) return false;

    const existing = parseShiftInterval(s.date, s.startTime, s.endTime);
    return candidate.startMs < existing.endMs && existing.startMs < candidate.endMs;
  });
}

export function calculateProjectedWeeklyHours(
  shifts: ShiftAssignment[],
  collaboratorId: string,
  candidateHours: number,
  excludeShiftId?: string
): number {
  const existingSum = shifts
    .filter((s) => s.collaboratorId === collaboratorId && s.id !== excludeShiftId)
    .reduce((acc, s) => acc + (s.hours || 0), 0);

  return existingSum + candidateHours;
}


export const INITIAL_COLLABORATORS: Collaborator[] = [
  {
    id: 'emp-101',
    name: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    email: 'carlos.mendoza@x7pos.com',
  },
  {
    id: 'emp-102',
    name: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces',
    email: 'sofia.rodriguez@x7pos.com',
  },
  {
    id: 'emp-103',
    name: 'Mateo Hernandez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces',
    email: 'mateo.hernandez@x7pos.com',
  },
  {
    id: 'emp-104',
    name: 'Valeria Gomez',
    role: 'Bartender',
    department: 'Bar & Lounge',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=faces',
    email: 'valeria.gomez@x7pos.com',
  },
  {
    id: 'emp-105',
    name: 'Alejandro Ramos',
    role: 'Line Cook',
    department: 'Kitchen (BOH)',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
    email: 'alejandro.ramos@x7pos.com',
  },
  {
    id: 'emp-106',
    name: 'Camila Fernandez',
    role: 'Cashier',
    department: 'Front Desk',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces',
    email: 'camila.fernandez@x7pos.com',
  },
];

// Generate standard date strings for current week (Mon-Sun)
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const baseMon = getMonday(new Date());

const addDays = (d: Date, days: number): string => {
  const clone = new Date(d);
  clone.setDate(clone.getDate() + days);
  return formatDateStr(clone);
};

export const INITIAL_SHIFTS: ShiftAssignment[] = [
  {
    id: 'shift-1',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    avatarUrl: INITIAL_COLLABORATORS[0].avatarUrl,
    date: addDays(baseMon, 0), // Mon
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Supervisor',
    notes: 'Floor supervisor setup',
  },
  {
    id: 'shift-2',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    avatarUrl: INITIAL_COLLABORATORS[0].avatarUrl,
    date: addDays(baseMon, 2), // Wed
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'published',
    hours: 7,
    breakDuration: 30,
    assignedRole: 'Supervisor',
  },
  {
    id: 'shift-3',
    collaboratorId: 'emp-101',
    collaboratorName: 'Carlos Mendoza',
    role: 'Supervisor',
    department: 'Floor Management',
    avatarUrl: INITIAL_COLLABORATORS[0].avatarUrl,
    date: addDays(baseMon, 4), // Fri
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'draft',
    hours: 7,
    breakDuration: 30,
    assignedRole: 'Supervisor',
  },
  {
    id: 'shift-4',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: INITIAL_COLLABORATORS[1].avatarUrl,
    date: addDays(baseMon, 0), // Mon
    startTime: '11:00 AM',
    endTime: '07:00 PM',
    presetName: 'Mid-Day Support',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
  },
  {
    id: 'shift-5',
    collaboratorId: 'emp-102',
    collaboratorName: 'Sofia Rodriguez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: INITIAL_COLLABORATORS[1].avatarUrl,
    date: addDays(baseMon, 1), // Tue
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
    avatarUrl: INITIAL_COLLABORATORS[1].avatarUrl,
    date: addDays(baseMon, 3), // Thu
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'draft',
    hours: 7,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
  },
  {
    id: 'shift-7',
    collaboratorId: 'emp-103',
    collaboratorName: 'Mateo Hernandez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: INITIAL_COLLABORATORS[2].avatarUrl,
    date: addDays(baseMon, 1), // Tue
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    presetName: 'Peak Dinner',
    status: 'published',
    hours: 7,
    breakDuration: 30,
    assignedRole: 'Waitstaff',
  },
  {
    id: 'shift-8',
    collaboratorId: 'emp-103',
    collaboratorName: 'Mateo Hernandez',
    role: 'Waitstaff',
    department: 'Dining Room',
    avatarUrl: INITIAL_COLLABORATORS[2].avatarUrl,
    date: addDays(baseMon, 4), // Fri
    startTime: '05:00 PM',
    endTime: '01:00 AM',
    presetName: 'Closing Shift',
    status: 'draft',
    hours: 8,
    breakDuration: 45,
    assignedRole: 'Waitstaff',
  },
  {
    id: 'shift-9',
    collaboratorId: 'emp-104',
    collaboratorName: 'Valeria Gomez',
    role: 'Bartender',
    department: 'Bar & Lounge',
    avatarUrl: INITIAL_COLLABORATORS[3].avatarUrl,
    date: addDays(baseMon, 3), // Thu
    startTime: '06:00 PM',
    endTime: '02:00 AM',
    presetName: 'Bar Night',
    status: 'published',
    hours: 8,
    breakDuration: 45,
    assignedRole: 'Bartender',
  },
  {
    id: 'shift-10',
    collaboratorId: 'emp-104',
    collaboratorName: 'Valeria Gomez',
    role: 'Bartender',
    department: 'Bar & Lounge',
    avatarUrl: INITIAL_COLLABORATORS[3].avatarUrl,
    date: addDays(baseMon, 5), // Sat
    startTime: '06:00 PM',
    endTime: '02:00 AM',
    presetName: 'Bar Night',
    status: 'draft',
    hours: 8,
    breakDuration: 45,
    assignedRole: 'Bartender',
  },
  {
    id: 'shift-11',
    collaboratorId: 'emp-105',
    collaboratorName: 'Alejandro Ramos',
    role: 'Line Cook',
    department: 'Kitchen (BOH)',
    avatarUrl: INITIAL_COLLABORATORS[4].avatarUrl,
    date: addDays(baseMon, 0), // Mon
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Line Cook',
  },
  {
    id: 'shift-12',
    collaboratorId: 'emp-105',
    collaboratorName: 'Alejandro Ramos',
    role: 'Line Cook',
    department: 'Kitchen (BOH)',
    avatarUrl: INITIAL_COLLABORATORS[4].avatarUrl,
    date: addDays(baseMon, 2), // Wed
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Line Cook',
  },
  {
    id: 'shift-13',
    collaboratorId: 'emp-106',
    collaboratorName: 'Camila Fernandez',
    role: 'Cashier',
    department: 'Front Desk',
    avatarUrl: INITIAL_COLLABORATORS[5].avatarUrl,
    date: addDays(baseMon, 0), // Mon
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    presetName: 'Morning Opening',
    status: 'published',
    hours: 8,
    breakDuration: 30,
    assignedRole: 'Cashier',
  },
];

export const INITIAL_SWAP_REQUESTS: ShiftSwapRequest[] = [
  {
    id: 'SWP-101',
    merchantId: 'merch-main-01',
    shiftId: 'shift-3',
    requestingCollaboratorId: 'emp-101',
    requestingCollaboratorName: 'Carlos Mendoza',
    requestingCollaboratorRole: 'Supervisor',
    requestingAvatarUrl: INITIAL_COLLABORATORS[0].avatarUrl,
    targetCollaboratorId: 'emp-102',
    targetCollaboratorName: 'Sofia Rodriguez',
    targetCollaboratorRole: 'Waitstaff',
    targetAvatarUrl: INITIAL_COLLABORATORS[1].avatarUrl,
    shiftDate: addDays(baseMon, 4),
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
    requestingAvatarUrl: INITIAL_COLLABORATORS[1].avatarUrl,
    targetCollaboratorId: 'emp-103',
    targetCollaboratorName: 'Mateo Hernandez',
    targetCollaboratorRole: 'Waitstaff',
    targetAvatarUrl: INITIAL_COLLABORATORS[2].avatarUrl,
    targetShiftId: 'shift-7',
    targetShiftDate: addDays(baseMon, 1),
    targetStartTime: '04:00 PM',
    targetEndTime: '11:00 PM',
    shiftDate: addDays(baseMon, 3),
    startTime: '04:00 PM',
    endTime: '11:00 PM',
    requiredRole: 'Waitstaff',
    hours: 7,
    reason: 'Personal schedule conflict - direct 2-way trade',
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
    requestingAvatarUrl: INITIAL_COLLABORATORS[3].avatarUrl,
    targetCollaboratorId: 'emp-101',
    targetCollaboratorName: 'Carlos Mendoza',
    targetCollaboratorRole: 'Supervisor',
    targetAvatarUrl: INITIAL_COLLABORATORS[0].avatarUrl,
    shiftDate: addDays(baseMon, 5),
    startTime: '06:00 PM',
    endTime: '02:00 AM',
    requiredRole: 'Bartender',
    hours: 8,
    reason: 'Agreed shift exchange for family event',
    status: 'APPROVED',
    createdAt: '2026-08-24T15:00:00Z',
    approvedBy: 'Carlos Mendoza (Floor Manager)',
    approvedAt: '2026-08-24T16:30:00Z',
  },
  {
    id: 'SWP-104',
    merchantId: 'merch-main-01',
    shiftId: 'shift-8',
    requestingCollaboratorId: 'emp-103',
    requestingCollaboratorName: 'Mateo Hernandez',
    requestingCollaboratorRole: 'Waitstaff',
    requestingAvatarUrl: INITIAL_COLLABORATORS[2].avatarUrl,
    targetCollaboratorId: 'emp-106',
    targetCollaboratorName: 'Camila Fernandez',
    targetCollaboratorRole: 'Cashier',
    targetAvatarUrl: INITIAL_COLLABORATORS[5].avatarUrl,
    shiftDate: addDays(baseMon, 4),
    startTime: '05:00 PM',
    endTime: '01:00 AM',
    requiredRole: 'Waitstaff',
    hours: 8,
    reason: 'Offered shift to open pool',
    status: 'REJECTED',
    createdAt: '2026-08-23T11:00:00Z',
    rejectedBy: 'Carlos Mendoza (Supervisor)',
    rejectedAt: '2026-08-23T14:20:00Z',
    rejectionReason: 'Target collaborator lacks Waitstaff qualification certificate and exceeds 40h limit.',
  },
  {
    id: 'SWP-105',
    merchantId: 'merch-main-01',
    shiftId: 'shift-11',
    requestingCollaboratorId: 'emp-105',
    requestingCollaboratorName: 'Alejandro Ramos',
    requestingCollaboratorRole: 'Line Cook',
    requestingAvatarUrl: INITIAL_COLLABORATORS[4].avatarUrl,
    targetCollaboratorId: '',
    targetCollaboratorName: 'Open Marketplace Pool',
    targetCollaboratorRole: 'Line Cook',
    shiftDate: addDays(baseMon, 0),
    startTime: '07:00 AM',
    endTime: '03:00 PM',
    requiredRole: 'Line Cook',
    hours: 8,
    reason: 'Vehicle breakdown - posted to Open Marketplace Pool',
    status: 'CANCELLED',
    createdAt: '2026-08-22T08:00:00Z',
  },
];


let localShiftsStore: ShiftAssignment[] = [...INITIAL_SHIFTS];
let localSwapStore: ShiftSwapRequest[] = [...INITIAL_SWAP_REQUESTS];

export async function fetchShiftAssignments(
  startDate?: string,
  endDate?: string
): Promise<ShiftAssignment[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const query = new URLSearchParams();
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);
      const res = await fetch(`${API_BASE}/shifts?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch {
      // Fallback to local store on network error or offline mode
    }
  }

  // Filter local store if dates are provided
  return localShiftsStore.filter((s) => {
    if (startDate && s.date < startDate) return false;
    if (endDate && s.date > endDate) return false;
    return true;
  });
}

export async function createShiftAssignment(
  dto: CreateShiftAssignmentDto
): Promise<ShiftAssignment> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/shifts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dto),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to local store
    }
  }

  const collision = findOverlappingShift(
    localShiftsStore,
    dto.collaboratorId,
    dto.date,
    dto.startTime,
    dto.endTime
  );
  if (collision) {
    throw new Error(
      `Collaborator is already assigned to a shift during this time period (#SFT-${collision.id}).`
    );
  }

  const newShift: ShiftAssignment = {
    id: `shift-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    collaboratorId: dto.collaboratorId,
    collaboratorName: dto.collaboratorName,
    role: dto.role,
    department: dto.department,
    avatarUrl: dto.avatarUrl,
    date: dto.date,
    startTime: dto.startTime,
    endTime: dto.endTime,
    presetName: dto.presetName,
    status: dto.status ?? 'draft',
    hours: dto.hours,
    breakDuration: dto.breakDuration ?? 30,
    assignedRole: dto.assignedRole ?? dto.role,
    notes: dto.notes,
  };

  localShiftsStore.push(newShift);
  return newShift;
}

export async function updateShiftAssignment(
  id: string,
  dto: UpdateShiftAssignmentDto
): Promise<ShiftAssignment> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/shifts/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dto),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback to local store
    }
  }

  const idx = localShiftsStore.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Shift ${id} not found`);

  const current = localShiftsStore[idx];
  const updatedCollabId = dto.collaboratorId ?? current.collaboratorId;
  const updatedDate = dto.date ?? current.date;
  const updatedStart = dto.startTime ?? current.startTime;
  const updatedEnd = dto.endTime ?? current.endTime;

  const collision = findOverlappingShift(
    localShiftsStore,
    updatedCollabId,
    updatedDate,
    updatedStart,
    updatedEnd,
    id
  );
  if (collision) {
    throw new Error(
      `Collaborator is already assigned to a shift during this time period (#SFT-${collision.id}).`
    );
  }

  localShiftsStore[idx] = {
    ...current,
    ...dto,
  };
  return localShiftsStore[idx];
}

export async function deleteShiftAssignment(id: string): Promise<boolean> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/shifts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return true;
    } catch {
      // Fallback
    }
  }

  localShiftsStore = localShiftsStore.filter((s) => s.id !== id);
  return true;
}

export async function publishWeeklyRoster(
  startDate: string,
  endDate: string
): Promise<{ updatedCount: number; shifts: ShiftAssignment[] }> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/shifts/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  let count = 0;
  localShiftsStore = localShiftsStore.map((s) => {
    if (s.date >= startDate && s.date <= endDate && s.status === 'draft') {
      count++;
      return { ...s, status: 'published' };
    }
    return s;
  });

  return {
    updatedCount: count,
    shifts: [...localShiftsStore],
  };
}

export interface ShiftSwapFilterParams {
  merchant_id?: string;
  status?: ShiftSwapStatus | 'ALL';
  startDate?: string;
  endDate?: string;
  requester_id?: string;
  recipient_id?: string;
  search?: string;
}

export async function fetchShiftSwapRequests(
  params?: ShiftSwapFilterParams
): Promise<ShiftSwapRequest[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const query = new URLSearchParams();
      if (params?.merchant_id) query.set('merchant_id', params.merchant_id);
      if (params?.status && params.status !== 'ALL') query.set('status', params.status);
      if (params?.startDate) query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
      if (params?.requester_id) query.set('requester_id', params.requester_id);
      if (params?.recipient_id) query.set('recipient_id', params.recipient_id);

      // Attempt primary REST v1 endpoint, fallback to standard endpoint
      let res = await fetch(`/api/v1/shift-swaps?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/shifts/swaps?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch {
      // Fallback to local store
    }
  }

  // Filter local store according to provided query params
  return localSwapStore.filter((swap) => {
    if (params?.merchant_id && swap.merchantId && swap.merchantId !== params.merchant_id) return false;
    if (params?.status && params.status !== 'ALL') {
      if (swap.status !== params.status) {
        if (params.status === 'PENDING_SUPERVISOR_APPROVAL' && swap.status === 'PENDING_APPROVAL') {
          // match legacy fallback
        } else {
          return false;
        }
      }
    }
    if (params?.startDate && swap.shiftDate < params.startDate) return false;
    if (params?.endDate && swap.shiftDate > params.endDate) return false;
    if (params?.requester_id && swap.requestingCollaboratorId !== params.requester_id) return false;
    if (params?.recipient_id && swap.targetCollaboratorId !== params.recipient_id) return false;
    if (params?.search) {
      const q = params.search.toLowerCase().replace('#', '').trim();
      const matchId = swap.id.toLowerCase().includes(q);
      const matchRequester = swap.requestingCollaboratorName.toLowerCase().includes(q);
      const matchTarget = swap.targetCollaboratorName.toLowerCase().includes(q);
      const matchShiftId = swap.shiftId.toLowerCase().includes(q);
      if (!matchId && !matchRequester && !matchTarget && !matchShiftId) return false;
    }
    return true;
  });
}

export async function approveShiftSwapRequest(
  swapId: string,
  approvedBy = 'Carlos Mendoza (Floor Manager)'
): Promise<{ swap: ShiftSwapRequest; shift: ShiftAssignment }> {
  const token = getAccessToken();
  if (token) {
    try {
      let res = await fetch(`/api/v1/shift-swaps/${swapId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approved_by: approvedBy }),
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/shifts/swaps/${swapId}/approve`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approved_by: approvedBy }),
        });
      }
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  const swapIdx = localSwapStore.findIndex((s) => s.id === swapId);
  if (swapIdx === -1) throw new Error(`Swap request ${swapId} not found`);

  const swap = localSwapStore[swapIdx];
  const targetCollab = INITIAL_COLLABORATORS.find((c) => c.id === swap.targetCollaboratorId);
  const requesterCollab = INITIAL_COLLABORATORS.find((c) => c.id === swap.requestingCollaboratorId);
  const timestamp = new Date().toISOString();

  // Update swap request audit metadata & status
  localSwapStore[swapIdx] = {
    ...swap,
    status: 'APPROVED',
    approvedBy,
    approvedAt: timestamp,
  };

  // Transfer original shift ownership in localShiftsStore to target collaborator
  const shiftIdx = localShiftsStore.findIndex((s) => s.id === swap.shiftId);
  if (shiftIdx !== -1) {
    localShiftsStore[shiftIdx] = {
      ...localShiftsStore[shiftIdx],
      collaboratorId: swap.targetCollaboratorId,
      collaboratorName: swap.targetCollaboratorName,
      role: targetCollab?.role ?? swap.targetCollaboratorRole,
      department: targetCollab?.department ?? localShiftsStore[shiftIdx].department,
      avatarUrl: targetCollab?.avatarUrl ?? swap.targetAvatarUrl ?? localShiftsStore[shiftIdx].avatarUrl,
    };
  }

  // If this was a direct 2-way swap, also transfer target shift to requester collaborator
  if (swap.targetShiftId) {
    const targetShiftIdx = localShiftsStore.findIndex((s) => s.id === swap.targetShiftId);
    if (targetShiftIdx !== -1) {
      localShiftsStore[targetShiftIdx] = {
        ...localShiftsStore[targetShiftIdx],
        collaboratorId: swap.requestingCollaboratorId,
        collaboratorName: swap.requestingCollaboratorName,
        role: requesterCollab?.role ?? swap.requestingCollaboratorRole,
        department: requesterCollab?.department ?? localShiftsStore[targetShiftIdx].department,
        avatarUrl: requesterCollab?.avatarUrl ?? swap.requestingAvatarUrl ?? localShiftsStore[targetShiftIdx].avatarUrl,
      };
    }
  }

  return {
    swap: localSwapStore[swapIdx],
    shift: localShiftsStore[shiftIdx] ?? localShiftsStore[0],
  };
}

export async function rejectShiftSwapRequest(
  swapId: string,
  reason: string,
  rejectedBy = 'Carlos Mendoza (Supervisor)'
): Promise<ShiftSwapRequest> {
  const token = getAccessToken();
  if (token) {
    try {
      let res = await fetch(`/api/v1/shift-swaps/${swapId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason, rejected_by: rejectedBy }),
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/shifts/swaps/${swapId}/reject`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason, rejected_by: rejectedBy }),
        });
      }
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  const swapIdx = localSwapStore.findIndex((s) => s.id === swapId);
  if (swapIdx === -1) throw new Error(`Swap request ${swapId} not found`);

  const timestamp = new Date().toISOString();
  localSwapStore[swapIdx] = {
    ...localSwapStore[swapIdx],
    status: 'REJECTED',
    rejectionReason: reason,
    rejectedBy,
    rejectedAt: timestamp,
  };

  return localSwapStore[swapIdx];
}

export async function createShiftSwapRequest(
  dto: Omit<ShiftSwapRequest, 'id' | 'createdAt' | 'status'>
): Promise<ShiftSwapRequest> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`/api/v1/shift-swaps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dto),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  const newSwap: ShiftSwapRequest = {
    ...dto,
    id: `SWP-${Math.floor(100 + Math.random() * 900)}`,
    status: 'PENDING_SUPERVISOR_APPROVAL',
    createdAt: new Date().toISOString(),
  };

  localSwapStore.unshift(newSwap);
  return newSwap;
}

export async function fetchMyShiftAssignments(
  startDate?: string,
  endDate?: string,
  collaboratorId = 'emp-102'
): Promise<ShiftAssignment[]> {
  const token = getAccessToken();
  if (token) {
    try {
      const query = new URLSearchParams();
      if (startDate) query.set('start_date', startDate);
      if (endDate) query.set('end_date', endDate);
      const res = await fetch(`/api/v1/shift-assignments/me?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch {
      // Fallback to local store
    }
  }

  // Identity-scoped query fallback for authenticated collaborator
  return localShiftsStore.filter((s) => {
    if (s.collaboratorId !== collaboratorId) return false;
    if (startDate && s.date < startDate) return false;
    if (endDate && s.date > endDate) return false;
    return true;
  });
}

export async function submitShiftAbsenceNotice(
  shiftId: string,
  reason: string,
  notes?: string
): Promise<ShiftAssignment> {
  const token = getAccessToken();
  if (token) {
    try {
      const res = await fetch(`/api/v1/shift-assignments/${shiftId}/absence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason, notes }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Fallback
    }
  }

  const idx = localShiftsStore.findIndex((s) => s.id === shiftId);
  if (idx !== -1) {
    const existingNotes = localShiftsStore[idx].notes;
    const absenceDetail = `Absence notice: ${reason}${notes ? ` - ${notes}` : ''}`;
    localShiftsStore[idx] = {
      ...localShiftsStore[idx],
      status: 'absent',
      notes: existingNotes ? `${existingNotes} | ${absenceDetail}` : absenceDetail,
    };
    return localShiftsStore[idx];
  }
  throw new Error(`Shift assignment #${shiftId} not found.`);
}

export function generateShiftICS(shifts: ShiftAssignment[], collaboratorName = 'Collaborator'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//X7 POS Restaurant Operations//Personal Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${collaboratorName} Work Schedule`,
  ];

  const formatICSDate = (dateStr: string, timeStr: string): string => {
    const cleanTime = timeStr.trim().toUpperCase();
    const isPM = cleanTime.includes('PM');
    const isAM = cleanTime.includes('AM');
    const raw = cleanTime.replace(/AM|PM/g, '').trim();
    const parts = raw.split(':');
    let h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    const [yyyy, mm, dd] = dateStr.split('-');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${pad(h)}${pad(m)}00Z`;
  };

  shifts.forEach((shift) => {
    const startIso = formatICSDate(shift.date, shift.startTime);
    let endIso = formatICSDate(shift.date, shift.endTime);
    // If end time is earlier or equal to start time, bump day by 1 for overnight shifts
    if (endIso <= startIso) {
      const [y, m, d] = shift.date.split('-').map(Number);
      const nextDay = new Date(y, m - 1, d + 1);
      const yyyy = nextDay.getFullYear();
      const mm = String(nextDay.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDay.getDate()).padStart(2, '0');
      endIso = formatICSDate(`${yyyy}-${mm}-${dd}`, shift.endTime);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${shift.id}@x7pos.com`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART:${startIso}`);
    lines.push(`DTEND:${endIso}`);
    lines.push(`SUMMARY:Shift: ${shift.assignedRole || shift.role} (${shift.department || 'Floor'})`);
    lines.push(
      `DESCRIPTION:Assigned Role: ${shift.assignedRole || shift.role}\\nDepartment: ${
        shift.department || 'Main Floor'
      }\\nHours: ${shift.hours}h\\nNotes: ${shift.notes || 'None'}`
    );
    lines.push(`LOCATION:${shift.department || 'X7 POS Restaurant'}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICSFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


