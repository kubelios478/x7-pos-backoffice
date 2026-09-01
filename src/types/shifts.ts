export type ShiftStatus = 'draft' | 'published' | 'confirmed' | 'absent';

export type CollaboratorRole =
  | 'Waitstaff'
  | 'Line Cook'
  | 'Bartender'
  | 'Cashier'
  | 'Supervisor';

export interface ShiftTemplatePreset {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  defaultHours: number;
  breakDuration: number;
}

export interface ShiftAssignment {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // e.g. "08:00 AM"
  endTime: string; // e.g. "04:00 PM"
  presetName: string;
  status: ShiftStatus;
  hours: number;
  breakDuration?: number; // Break duration in minutes
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  email?: string;
}

export interface CreateShiftAssignmentDto {
  collaboratorId: string;
  collaboratorName: string;
  role: CollaboratorRole;
  department: string;
  avatarUrl?: string;
  date: string;
  startTime: string;
  endTime: string;
  presetName: string;
  status?: ShiftStatus;
  hours: number;
  breakDuration?: number;
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface UpdateShiftAssignmentDto {
  collaboratorId?: string;
  collaboratorName?: string;
  role?: CollaboratorRole;
  department?: string;
  avatarUrl?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  presetName?: string;
  status?: ShiftStatus;
  hours?: number;
  breakDuration?: number;
  assignedRole?: CollaboratorRole;
  notes?: string;
}

export interface ShiftRosterSummary {
  totalShifts: number;
  draftShifts: number;
  publishedShifts: number;
  confirmedShifts: number;
  totalPlannedHours: number;
  collaboratorsCount: number;
}

export type ShiftSwapStatus =
  | 'PENDING_PEER_ACCEPTANCE'
  | 'PENDING_SUPERVISOR_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PENDING_APPROVAL';

export interface ShiftSwapRequest {
  id: string; // e.g. "SWP-101"
  merchantId?: string;
  shiftId: string;
  requestingCollaboratorId: string;
  requestingCollaboratorName: string;
  requestingCollaboratorRole: CollaboratorRole;
  requestingAvatarUrl?: string;
  targetCollaboratorId: string;
  targetCollaboratorName: string;
  targetCollaboratorRole: CollaboratorRole;
  targetAvatarUrl?: string;
  targetShiftId?: string; // Optional for 2-way direct shift swap
  targetShiftDate?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  requiredRole: CollaboratorRole;
  hours: number;
  reason: string;
  status: ShiftSwapStatus;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export type ShiftTradeRequest = ShiftSwapRequest;

