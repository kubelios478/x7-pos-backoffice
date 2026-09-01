import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TimeClockKioskView } from './TimeClockKioskView';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';
import { DailyGanttTimelineView } from './DailyGanttTimelineView';
import { ShiftSwapManagementView } from './ShiftSwapManagementView';
import type {
  ShiftAssignment,
  Collaborator,
  CollaboratorRole,
  ShiftStatus,
  CreateShiftAssignmentDto,
  ShiftSwapRequest,
} from '../../../../types/shifts';
import {
  fetchShiftAssignments,
  createShiftAssignment,
  updateShiftAssignment,
  deleteShiftAssignment,
  publishWeeklyRoster,
  INITIAL_COLLABORATORS,
  SHIFT_PRESETS,
  findOverlappingShift,
  parseShiftInterval,
  fetchShiftSwapRequests,
  approveShiftSwapRequest,
  rejectShiftSwapRequest,
} from '../../../../api/shifts';

export type CalendarViewMode = 'weekly' | 'daily' | 'monthly' | 'swaps';

// Helper date utilities
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDateISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDayHeader(dateISO: string): { dayName: string; formattedDate: string } {
  const d = new Date(`${dateISO}T00:00:00`);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedDate = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  return { dayName, formattedDate };
}

const ROLES_LIST: CollaboratorRole[] = [
  'Supervisor',
  'Waitstaff',
  'Line Cook',
  'Bartender',
  'Cashier',
];

export const STATUS_STYLES: Record<
  ShiftStatus,
  { containerClass: string; badgeClass: string; label: string }
> = {
  draft: {
    containerClass:
      'border-2 border-dashed border-amber-400 bg-amber-50/90 text-amber-900 shadow-sm hover:border-amber-500',
    badgeClass: 'bg-amber-200 text-amber-900 border border-amber-300 font-bold',
    label: 'DRAFT',
  },
  published: {
    containerClass:
      'border border-emerald-500 bg-emerald-50/90 text-emerald-950 shadow-sm hover:bg-emerald-100/80',
    badgeClass: 'bg-emerald-600 text-white font-bold',
    label: 'PUBLISHED',
  },
  confirmed: {
    containerClass:
      'border border-blue-500 bg-blue-50/90 text-blue-950 shadow-sm hover:bg-blue-100/80',
    badgeClass: 'bg-blue-600 text-white font-bold',
    label: 'CONFIRMED',
  },
  absent: {
    containerClass:
      'border border-rose-400 bg-rose-50/90 text-rose-950 opacity-80 hover:opacity-100',
    badgeClass: 'bg-rose-600 text-white font-bold',
    label: 'ABSENT',
  },
};

export function checkRestPeriodViolation(
  shifts: ShiftAssignment[],
  collaboratorId: string,
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  excludeShiftId?: string
): boolean {
  if (!dateStr || !startTimeStr || !endTimeStr) return false;
  try {
    const candidate = parseShiftInterval(dateStr, startTimeStr, endTimeStr);
    const ELEVEN_HOURS_MS = 11 * 60 * 60 * 1000;

    for (const s of shifts) {
      if (s.collaboratorId !== collaboratorId) continue;
      if (excludeShiftId && s.id === excludeShiftId) continue;

      const existing = parseShiftInterval(s.date, s.startTime, s.endTime);

      if (existing.endMs <= candidate.startMs) {
        const restMs = candidate.startMs - existing.endMs;
        if (restMs < ELEVEN_HOURS_MS) return true;
      }

      if (candidate.endMs <= existing.startMs) {
        const restMs = existing.startMs - candidate.endMs;
        if (restMs < ELEVEN_HOURS_MS) return true;
      }
    }
  } catch {
    // Ignore parsing during typing
  }
  return false;
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

interface ShiftModalProps {
  initialShift?: Partial<ShiftAssignment>;
  collaborators: Collaborator[];
  allShifts: ShiftAssignment[];
  selectedDate?: string;
  selectedCollaboratorId?: string;
  onClose: () => void;
  onSave: (dto: CreateShiftAssignmentDto, shiftId?: string) => Promise<void>;
  onDelete?: (shiftId: string) => Promise<void>;
}

const ShiftModal: React.FC<ShiftModalProps> = ({
  initialShift,
  collaborators,
  allShifts,
  selectedDate,
  selectedCollaboratorId,
  onClose,
  onSave,
  onDelete,
}) => {
  const [collaboratorId, setCollaboratorId] = useState(
    initialShift?.collaboratorId ?? selectedCollaboratorId ?? collaborators[0]?.id ?? ''
  );
  const [date, setDate] = useState(initialShift?.date ?? selectedDate ?? formatDateISO(new Date()));
  const [presetName, setPresetName] = useState(initialShift?.presetName ?? SHIFT_PRESETS[0].name);
  const [startTime, setStartTime] = useState(initialShift?.startTime ?? SHIFT_PRESETS[0].startTime);
  const [endTime, setEndTime] = useState(initialShift?.endTime ?? SHIFT_PRESETS[0].endTime);
  const [breakDuration, setBreakDuration] = useState<number>(
    initialShift?.breakDuration ?? SHIFT_PRESETS[0].breakDuration ?? 30
  );
  const [assignedRole, setAssignedRole] = useState<CollaboratorRole>(
    initialShift?.assignedRole ??
      (collaborators.find((c) => c.id === (initialShift?.collaboratorId ?? selectedCollaboratorId))?.role ??
        collaborators[0]?.role ??
        'Waitstaff')
  );
  const [hours, setHours] = useState(initialShift?.hours ?? SHIFT_PRESETS[0].defaultHours);
  const [status, setStatus] = useState<ShiftStatus>(initialShift?.status ?? 'draft');
  const [notes, setNotes] = useState(initialShift?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Search filter inside collaborator select modal dropdown
  const [collabSearch, setCollabSearch] = useState('');
  const [isCollabDropdownOpen, setIsCollabDropdownOpen] = useState(false);

  const selectedCollab = collaborators.find((c) => c.id === collaboratorId) ?? collaborators[0];

  const filteredCollaborators = useMemo(() => {
    if (!collabSearch.trim()) return collaborators;
    const q = collabSearch.toLowerCase();
    return collaborators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q)
    );
  }, [collaborators, collabSearch]);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setPresetName(val);
    const found = SHIFT_PRESETS.find((p) => p.name === val);
    if (found) {
      setStartTime(found.startTime);
      setEndTime(found.endTime);
      setBreakDuration(found.breakDuration);
      setHours(found.defaultHours);
    }
  };

  // Real-time validations
  const collisionShift = useMemo(() => {
    return findOverlappingShift(
      allShifts,
      collaboratorId,
      date,
      startTime,
      endTime,
      initialShift?.id
    );
  }, [allShifts, collaboratorId, date, startTime, endTime, initialShift?.id]);

  const hasRestPeriodViolation = useMemo(() => {
    return checkRestPeriodViolation(
      allShifts,
      collaboratorId,
      date,
      startTime,
      endTime,
      initialShift?.id
    );
  }, [allShifts, collaboratorId, date, startTime, endTime, initialShift?.id]);

  const projectedWeeklyHours = useMemo(() => {
    return calculateProjectedWeeklyHours(
      allShifts,
      collaboratorId,
      Number(hours) || 0,
      initialShift?.id
    );
  }, [allShifts, collaboratorId, hours, initialShift?.id]);

  const overtimeHours = projectedWeeklyHours > 40 ? projectedWeeklyHours - 40 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollab) return;
    if (collisionShift) {
      setSubmitError(
        `Collaborator is already assigned to a shift during this time period (#SFT-${collisionShift.id}).`
      );
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const dto: CreateShiftAssignmentDto = {
        collaboratorId: selectedCollab.id,
        collaboratorName: selectedCollab.name,
        role: selectedCollab.role,
        department: selectedCollab.department,
        avatarUrl: selectedCollab.avatarUrl,
        date,
        startTime,
        endTime,
        presetName,
        status,
        hours: Number(hours),
        breakDuration: Number(breakDuration),
        assignedRole,
        notes,
      };
      await onSave(dto, initialShift?.id);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Error saving shift assignment');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[99999] flex justify-center items-center p-2 sm:p-4 backdrop-blur-md">
      <div
        className="bg-white border border-[#e8e2d8] rounded-xl shadow-2xl w-[95vw] sm:w-[640px] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in text-left my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c]">calendar_clock</span>
            <h3 className="font-black text-sm uppercase tracking-wider">
              {initialShift?.id ? 'Edit Shift Assignment' : 'Assign New Shift'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm text-[#1d1c17] overflow-y-auto flex-1 custom-scrollbar">
          {/* Overlap Collision Error Banner */}
          {(collisionShift || submitError) && (
            <div
              className="p-3.5 bg-rose-50 border-l-4 border-rose-600 text-rose-950 rounded text-xs font-bold flex items-start gap-2 shadow-sm animate-fade-in"
              role="alert"
            >
              <span className="material-symbols-outlined text-rose-600 text-lg shrink-0 mt-0.5">
                error
              </span>
              <div>
                <p className="uppercase tracking-wider text-[10px] text-rose-700 font-black">
                  Schedule Collision Alert
                </p>
                <p className="mt-0.5">
                  {submitError ||
                    `Collaborator is already assigned to a shift during this time period (#SFT-${collisionShift?.id}).`}
                </p>
              </div>
            </div>
          )}

          {/* Rest Period Violation Warning Banner */}
          {hasRestPeriodViolation && (
            <div
              className="p-3.5 bg-amber-50 border-l-4 border-amber-500 text-amber-950 rounded text-xs font-bold flex items-start gap-2 shadow-sm animate-fade-in"
              role="alert"
            >
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">
                warning
              </span>
              <div>
                <p className="uppercase tracking-wider text-[10px] text-amber-700 font-black">
                  Compliance Rest Violation
                </p>
                <p className="mt-0.5">Caution: Less than 11 hours rest period from previous shift.</p>
              </div>
            </div>
          )}

          {/* Overtime Alert Banner */}
          {overtimeHours > 0 && (
            <div
              className="p-3.5 bg-purple-50 border-l-4 border-purple-600 text-purple-950 rounded text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-600 text-lg shrink-0">
                  schedule
                </span>
                <div>
                  <p className="uppercase tracking-wider text-[10px] text-purple-700 font-black">
                    Overtime Threshold Exceeded
                  </p>
                  <p className="text-xs font-bold">
                    Projected Weekly: <span>{projectedWeeklyHours.toFixed(1)} hrs</span>
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-purple-600 text-white font-black text-[11px] rounded uppercase tracking-wider shadow-sm">
                +{overtimeHours.toFixed(1)} hrs Overtime
              </span>
            </div>
          )}

          {/* Collaborator Searchable Select with Role Chips */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Collaborator
            </label>
            <div className="flex gap-2">
              <select
                aria-label="Collaborator"
                value={collaboratorId}
                onChange={(e) => {
                  setCollaboratorId(e.target.value);
                  const found = collaborators.find((c) => c.id === e.target.value);
                  if (found) setAssignedRole(found.role);
                }}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
              >
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — [{c.role}] ({c.department})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsCollabDropdownOpen(!isCollabDropdownOpen)}
                className="px-3 py-2 bg-gray-100 border border-[#e8e2d8] rounded text-xs font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors flex items-center gap-1 shrink-0"
                title="Search staff dropdown"
              >
                <span className="material-symbols-outlined text-base">search</span>
              </button>
            </div>

            {/* Quick Search Popover for Collaborators */}
            {isCollabDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e2d8] rounded shadow-2xl z-[10000] p-3 space-y-2 max-h-64 overflow-y-auto animate-fade-in">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-gray-400 text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search staff by name, role or department..."
                    value={collabSearch}
                    onChange={(e) => setCollabSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8e2d8] rounded bg-[#f8f6f2] font-semibold focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  {filteredCollaborators.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setCollaboratorId(c.id);
                        setAssignedRole(c.role);
                        setIsCollabDropdownOpen(false);
                        setCollabSearch('');
                      }}
                      className={`p-2 rounded cursor-pointer flex items-center justify-between text-xs hover:bg-[#f8f6f2] transition-colors ${
                        c.id === collaboratorId ? 'bg-amber-50 border border-amber-300 font-bold' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {c.avatarUrl ? (
                          <img
                            src={c.avatarUrl}
                            alt={c.name}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#222222] text-white flex items-center justify-center text-[10px] font-bold">
                            {c.name[0]}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-[#1d1c17]">{c.name}</p>
                          <p className="text-[10px] text-gray-500">{c.department}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-[#222222]/10 text-[#222222] font-black text-[10px] uppercase rounded">
                        {c.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Shift Date
              </label>
              <input
                type="date"
                aria-label="Shift Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Shift Template Preset
              </label>
              <select
                aria-label="Shift Template Preset"
                value={presetName}
                onChange={handlePresetChange}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
              >
                {SHIFT_PRESETS.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} ({p.startTime} - {p.endTime}, {p.breakDuration}m break)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Start Time
              </label>
              <input
                type="text"
                aria-label="Start Time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
                placeholder="08:00 AM"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                End Time
              </label>
              <input
                type="text"
                aria-label="End Time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
                placeholder="04:00 PM"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Break (Min)
              </label>
              <input
                type="number"
                aria-label="Break (Min)"
                step="5"
                min="0"
                max="120"
                value={breakDuration}
                onChange={(e) => setBreakDuration(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Net Hours
              </label>
              <input
                type="number"
                aria-label="Net Hours"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-semibold text-sm focus:outline-none focus:border-[#222222]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Assigned Role Qualification
              </label>
              <select
                aria-label="Assigned Role Qualification"
                value={assignedRole}
                onChange={(e) => setAssignedRole(e.target.value as CollaboratorRole)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-bold text-sm focus:outline-none focus:border-[#222222]"
              >
                {ROLES_LIST.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Publication Status
              </label>
              <select
                aria-label="Publication Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ShiftStatus)}
                className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] font-bold text-sm focus:outline-none focus:border-[#222222]"
              >
                <option value="draft">DRAFT (Manager Only)</option>
                <option value="published">PUBLISHED (Staff Visible)</option>
                <option value="confirmed">CONFIRMED (Accepted)</option>
                <option value="absent">ABSENT (Call out)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Notes / Assigned Work Station
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-[#e8e2d8] rounded px-3 py-2 bg-[#f8f6f2] text-sm focus:outline-none focus:border-[#222222]"
              placeholder="e.g., Section 1 Waiter / Kitchen Station 2"
            />
          </div>

          <div className="pt-4 border-t border-[#e8e2d8] flex justify-between items-center">
            {initialShift?.id && onDelete ? (
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this shift assignment?')) {
                    await onDelete(initialShift.id!);
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-colors"
              >
                Delete Shift
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold text-xs uppercase tracking-wider hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !!collisionShift}
                className={`px-6 py-2 text-white font-bold text-xs uppercase tracking-wider rounded transition-colors shadow-md flex items-center gap-1.5 ${
                  collisionShift
                    ? 'bg-gray-400 cursor-not-allowed opacity-75'
                    : 'bg-[#222222] hover:bg-[#d51f2c]'
                }`}
              >
                {saving && (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                )}
                {initialShift?.id ? 'Save Changes' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

interface SwapReviewModalProps {
  swap: ShiftSwapRequest;
  allShifts: ShiftAssignment[];
  collaborators: Collaborator[];
  onClose: () => void;
  onApprove: (swapId: string) => Promise<void>;
  onReject: (swapId: string, reason: string) => Promise<void>;
}

const SwapReviewModal: React.FC<SwapReviewModalProps> = ({
  swap,
  allShifts,
  onClose,
  onApprove,
  onReject,
}) => {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  // 1. Role Qualification Check
  const isQualified = swap.targetCollaboratorRole === swap.requiredRole;

  // 2. Projected Overtime Check for Target Collaborator
  const targetShifts = allShifts.filter((s) => s.collaboratorId === swap.targetCollaboratorId);
  const currentWeeklyHours = targetShifts.reduce((acc, s) => acc + (s.hours || 0), 0);
  const projectedWeeklyHours = currentWeeklyHours + swap.hours;
  const overtimeProjected = projectedWeeklyHours > 40 ? projectedWeeklyHours - 40 : 0;

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(swap.id);
      onClose();
    } catch (err) {
      console.error('Approve failed', err);
    } finally {
      setApproving(false);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError('Please provide a mandatory rejection rationale for audit traceability.');
      return;
    }
    setRejecting(true);
    try {
      await onReject(swap.id, rejectReason.trim());
      setShowRejectReasonModal(false);
      onClose();
    } catch (err) {
      console.error('Reject failed', err);
    } finally {
      setRejecting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[99999] flex justify-center items-center p-2 sm:p-4 backdrop-blur-md">
      <div
        className="bg-white border border-[#e8e2d8] rounded-xl shadow-2xl w-[95vw] sm:w-[640px] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in text-left font-sans my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d51f2c]">swap_horiz</span>
            <h3 className="font-black text-sm uppercase tracking-wider">
              Shift Swap Review Panel — #{swap.id}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm text-[#1d1c17] overflow-y-auto flex-1 custom-scrollbar">
          {/* Status Badge & Header Details */}
          <div className="flex items-center justify-between pb-3 border-b border-[#e8e2d8]">
            <div>
              <span className="text-xs text-[#5f5e5e] font-bold uppercase">Requested Date</span>
              <p className="text-base font-black text-[#1d1c17]">{swap.shiftDate}</p>
            </div>
            <div>
              <span className="text-xs text-[#5f5e5e] font-bold uppercase">Shift Hours</span>
              <p className="text-base font-black text-[#1d1c17]">{swap.startTime} - {swap.endTime} ({swap.hours} hrs)</p>
            </div>
            <span className={`px-2.5 py-1 text-xs font-black rounded uppercase tracking-wider ${
              swap.status === 'PENDING_APPROVAL'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : swap.status === 'APPROVED'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : 'bg-rose-100 text-rose-900 border border-rose-300'
            }`}>
              {swap.status.replace('_', ' ')}
            </span>
          </div>

          {/* Qualification Check Alert Banner */}
          {!isQualified ? (
            <div className="p-4 bg-rose-50 border-l-4 border-rose-600 rounded text-xs font-bold text-rose-950 space-y-1 shadow-sm" role="alert">
              <div className="flex items-center gap-2 text-rose-700 font-black uppercase tracking-wider text-[11px]">
                <span className="material-symbols-outlined text-rose-600 text-lg">warning</span>
                Role Qualification Warning
              </div>
              <p className="text-xs font-semibold">
                Target collaborator <strong className="font-black">{swap.targetCollaboratorName} ({swap.targetCollaboratorRole})</strong> does not hold the qualified role certification (<strong className="font-black">{swap.requiredRole}</strong>) required for this shift.
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 border-l-4 border-emerald-500 rounded text-xs font-bold text-emerald-950 flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-emerald-600 text-lg">verified</span>
              <span>Qualified: Replacement collaborator holds required role ({swap.requiredRole}).</span>
            </div>
          )}

          {/* Overtime Constraints Banner */}
          {overtimeProjected > 0 && (
            <div className="p-3.5 bg-purple-50 border-l-4 border-purple-600 text-purple-950 rounded text-xs font-bold flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-600 text-lg">schedule</span>
                <div>
                  <p className="uppercase text-[10px] text-purple-700 font-black">Target Staff Overtime Impact</p>
                  <p className="text-xs">Projected Weekly: <strong>{projectedWeeklyHours.toFixed(1)} hrs</strong></p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-purple-600 text-white font-black text-[10px] rounded uppercase">
                +{overtimeProjected.toFixed(1)} hrs Overtime
              </span>
            </div>
          )}

          {/* Collaborator Transfer Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded space-y-1">
              <p className="text-[10px] font-bold text-[#5f5e5e] uppercase">Requesting Employee</p>
              <h4 className="font-black text-sm text-[#1d1c17]">{swap.requestingCollaboratorName}</h4>
              <p className="text-xs text-[#5f5e5e] font-semibold">{swap.requestingCollaboratorRole}</p>
            </div>
            <div className="p-3.5 bg-[#f8f6f2] border border-[#e8e2d8] rounded space-y-1">
              <p className="text-[10px] font-bold text-[#5f5e5e] uppercase">Target / Replacement</p>
              <h4 className="font-black text-sm text-[#1d1c17]">{swap.targetCollaboratorName}</h4>
              <p className="text-xs text-[#5f5e5e] font-semibold">{swap.targetCollaboratorRole}</p>
            </div>
          </div>

          {/* Swap Reason */}
          <div>
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider block mb-1">
              Transfer Rationale / Reason
            </span>
            <div className="p-3 bg-gray-50 border border-[#e8e2d8] rounded text-xs italic text-gray-700">
              "{swap.reason}"
            </div>
          </div>

          {/* Rejection Reason display if rejected */}
          {swap.rejectionReason && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900">
              <strong className="block font-black uppercase text-[10px]">Audit Rejection Reason:</strong>
              {swap.rejectionReason}
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-[#e8e2d8] flex justify-between items-center">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold text-xs uppercase tracking-wider hover:bg-gray-100 rounded transition-colors"
            >
              Close
            </button>
            {swap.status === 'PENDING_APPROVAL' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectReasonModal(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-colors shadow-sm"
                >
                  REJECT SWAP
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all duration-200 hover:border-[#ae001a] shadow-md flex items-center gap-1.5"
                >
                  {approving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                  APPROVE SWAP
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory Rejection Reason Modal */}
      {showRejectReasonModal && (
        <div className="fixed inset-0 bg-black/70 z-[10000] flex justify-center items-center p-4">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md min-w-[300px] sm:min-w-[420px] p-6 space-y-4 text-left font-sans animate-fade-in">
            <h4 className="font-black text-sm uppercase tracking-wider text-[#222222] flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-base">block</span>
              Mandatory Rejection Rationale
            </h4>
            <p className="text-xs text-[#5f5e5e]">
              Please specify the audit rationale for rejecting swap request #{swap.id}. This will be logged in audit traceability and sent to both collaborators.
            </p>

            {rejectError && (
              <p className="text-xs text-rose-600 font-bold bg-rose-50 p-2 rounded border border-rose-200">
                {rejectError}
              </p>
            )}

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <textarea
                aria-label="Rejection Rationale"
                rows={3}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  setRejectError('');
                }}
                placeholder="e.g., Target collaborator exceeds overtime limits / qualification conflict"
                className="w-full border border-[#e8e2d8] rounded p-2.5 bg-[#f8f6f2] text-xs font-semibold focus:outline-none focus:border-[#222222]"
                required
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectReasonModal(false)}
                  className="px-3 py-1.5 border border-[#e8e2d8] text-[#5f5e5e] font-bold text-xs uppercase tracking-wider hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejecting}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-colors shadow-md flex items-center gap-1"
                >
                  {rejecting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

interface ShiftAssignmentViewProps {
  onNavigate?: (view: string) => void;
  initialViewMode?: CalendarViewMode;
}

export const ShiftAssignmentView: React.FC<ShiftAssignmentViewProps> = ({
  onNavigate,
  initialViewMode = 'weekly',
}) => {
  // Navigation & State
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMonday(new Date()));
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialViewMode);

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [publishToast, setPublishToast] = useState<string | null>(null);

  // Shift Swap State
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [selectedSwap, setSelectedSwap] = useState<ShiftSwapRequest | null>(null);

  const loadSwaps = async () => {
    try {
      const data = await fetchShiftSwapRequests();
      setSwapRequests(data);
    } catch (err) {
      console.error('Failed to load shift swap requests', err);
    }
  };

  useEffect(() => {
    loadSwaps();
  }, []);

  const pendingSwapsCount = useMemo(
    () => swapRequests.filter((s) => s.status === 'PENDING_APPROVAL').length,
    [swapRequests]
  );

  const handleApproveSwap = async (swapId: string) => {
    const res = await approveShiftSwapRequest(swapId);
    await loadShifts();
    await loadSwaps();
    setPublishToast(
      `Successfully approved shift swap #${swapId}! Shift reassigned to ${res.swap.targetCollaboratorName}.`
    );
    setTimeout(() => setPublishToast(null), 5000);
  };

  const handleRejectSwap = async (swapId: string, reason: string) => {
    await rejectShiftSwapRequest(swapId, reason);
    await loadSwaps();
    setPublishToast(`Shift swap #${swapId} rejected.`);
    setTimeout(() => setPublishToast(null), 5000);
  };

  // Modal control
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showKioskModal, setShowKioskModal] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<Partial<ShiftAssignment> | undefined>(undefined);
  const [selectedCell, setSelectedCell] = useState<{ collabId: string; date: string } | undefined>(
    undefined
  );

  // Derive Week Days (Monday through Sunday)
  const weekDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(d.getDate() + i);
      days.push(formatDateISO(d));
    }
    return days;
  }, [currentWeekMonday]);

  const startDateISO = weekDays[0];
  const endDateISO = weekDays[6];

  // Load shifts for week
  const loadShifts = async () => {
    setLoading(true);
    try {
      const data = await fetchShiftAssignments(startDateISO, endDateISO);
      setShifts(data);
    } catch (err) {
      console.error('Failed to load shifts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, [startDateISO, endDateISO]);

  // Date Navigation handlers
  const handlePrevWeek = () => {
    const prev = new Date(currentWeekMonday);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekMonday(getMonday(prev));
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekMonday);
    next.setDate(next.getDate() + 7);
    setCurrentWeekMonday(getMonday(next));
  };

  const handleToday = () => {
    setCurrentWeekMonday(getMonday(new Date()));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const picked = new Date(`${e.target.value}T00:00:00`);
      setCurrentWeekMonday(getMonday(picked));
    }
  };

  // Filter Collaborators
  const filteredCollaborators = useMemo(() => {
    return INITIAL_COLLABORATORS.filter((c) => {
      if (roleFilter !== 'all' && c.role !== roleFilter) return false;
      if (departmentFilter !== 'all' && c.department !== departmentFilter) return false;
      if (
        searchQuery &&
        !c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !c.role.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [roleFilter, departmentFilter, searchQuery]);

  // Unique departments for filter dropdown
  const departments = useMemo(() => {
    const set = new Set(INITIAL_COLLABORATORS.map((c) => c.department));
    return Array.from(set);
  }, []);

  // Filter shifts based on statusFilter
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [shifts, statusFilter]);

  // Summary Metrics calculations
  const totalDraftCount = useMemo(
    () => shifts.filter((s) => s.status === 'draft').length,
    [shifts]
  );

  const totalPublishedCount = useMemo(
    () => shifts.filter((s) => s.status === 'published' || s.status === 'confirmed').length,
    [shifts]
  );

  const totalWeeklyHours = useMemo(
    () => shifts.reduce((acc, s) => acc + (s.hours || 0), 0),
    [shifts]
  );

  // Group Shifts by Collaborator & Date for the grid
  const shiftsMap = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>();
    filteredShifts.forEach((s) => {
      const key = `${s.collaboratorId}_${s.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return map;
  }, [filteredShifts]);

  // Calculate Collaborator Weekly Hours total (dynamically updated!)
  const collabWeeklyHoursMap = useMemo(() => {
    const map = new Map<string, number>();
    shifts.forEach((s) => {
      const current = map.get(s.collaboratorId) || 0;
      map.set(s.collaboratorId, current + (s.hours || 0));
    });
    return map;
  }, [shifts]);

  // Daily Store Operating/Coverage Hours Calculation
  const dailyCoverageMap = useMemo(() => {
    const map = new Map<string, { totalHours: number; count: number }>();
    weekDays.forEach((d) => map.set(d, { totalHours: 0, count: 0 }));
    shifts.forEach((s) => {
      if (map.has(s.date)) {
        const cur = map.get(s.date)!;
        cur.totalHours += s.hours || 0;
        cur.count += 1;
      }
    });
    return map;
  }, [weekDays, shifts]);

  // Handle Publish Action
  const handlePublishRoster = async () => {
    if (totalDraftCount === 0) {
      setPublishToast('No DRAFT assignments found to publish for this week.');
      setTimeout(() => setPublishToast(null), 4000);
      return;
    }

    try {
      const res = await publishWeeklyRoster(startDateISO, endDateISO);
      await loadShifts();
      setPublishToast(
        `Successfully published ${res.updatedCount} draft shifts! Collaborators have been notified.`
      );
      setTimeout(() => setPublishToast(null), 5000);
    } catch (err) {
      console.error('Error publishing roster:', err);
    }
  };

  // Shift Modal Actions
  const handleSaveShift = async (dto: CreateShiftAssignmentDto, shiftId?: string) => {
    if (shiftId) {
      await updateShiftAssignment(shiftId, dto);
    } else {
      await createShiftAssignment(dto);
    }
    await loadShifts();
  };

  const handleDeleteShift = async (shiftId: string) => {
    await deleteShiftAssignment(shiftId);
    await loadShifts();
  };

  const handleOpenAddModal = (collabId?: string, dateStr?: string) => {
    setEditingShift(undefined);
    if (collabId && dateStr) {
      setSelectedCell({ collabId, date: dateStr });
    } else {
      setSelectedCell(undefined);
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (shift: ShiftAssignment) => {
    setSelectedCell(undefined);
    setEditingShift(shift);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 text-left animate-fade-in pb-12">
      {/* Toast Notification */}
      {publishToast && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-[#222222] text-white border-l-4 border-emerald-500 p-4 rounded shadow-2xl flex items-center gap-3 animate-slide-up">
          <span className="material-symbols-outlined text-emerald-400 text-2xl">
            check_circle
          </span>
          <div>
            <p className="font-black text-xs uppercase tracking-wider">Roster Published</p>
            <p className="text-sm font-medium text-gray-200">{publishToast}</p>
          </div>
          <button
            onClick={() => setPublishToast(null)}
            className="ml-4 text-white/50 hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#d51f2c]/10 text-[#d51f2c] font-black text-[10px] uppercase tracking-widest rounded">
              Staff Management Module
            </span>
            <span className="text-[#5f5e5e] text-xs font-bold">• Location: Main Restaurant</span>
          </div>
          <h1 className="font-sans text-h2 font-black text-[#222222] uppercase tracking-tight mt-1 flex items-center gap-2">
            {viewMode === 'daily'
              ? 'Shifts Scheduler'
              : viewMode === 'monthly'
              ? 'Monthly Roster Matrix'
              : viewMode === 'swaps'
              ? 'Shift Swap Requests'
              : 'Shift Assignment Matrix'}
            {totalDraftCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2.5 py-0.5 rounded-full normal-case">
                {totalDraftCount} Draft{totalDraftCount > 1 ? 's' : ''} Pending
              </span>
            )}
          </h1>
          <p className="text-body-sm text-[#5f5e5e] mt-0.5">
            {viewMode === 'daily'
              ? 'Interactive daily shift timeline, floor coverage planning, and real-time reassignment.'
              : viewMode === 'monthly'
              ? 'High-level monthly schedule overview and staffing capacity view.'
              : viewMode === 'swaps'
              ? 'Review, audit, and approve peer-to-peer shift exchange requests.'
              : 'Interactive weekly schedule matrix, floor coverage planning, and publication control.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Calendar View Mode Toggle */}
          <div className="flex bg-[#f1ece4] border border-[#e8e2d8] rounded p-1">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1 ${
                viewMode === 'weekly'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">grid_on</span>
              Weekly Matrix
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1 ${
                viewMode === 'daily'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">view_day</span>
              Daily Timeline
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1 ${
                viewMode === 'monthly'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">calendar_month</span>
              Monthly
            </button>
            <button
              onClick={() => setViewMode('swaps')}
              className={`px-3 py-1.5 font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1 ${
                viewMode === 'swaps'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">swap_horiz</span>
              Swap Requests
              {pendingSwapsCount > 0 && (
                <span className="bg-[#d51f2c] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                  {pendingSwapsCount}
                </span>
              )}
            </button>
          </div>

          {/* Publish Action Trigger Button */}
          <button
            onClick={handlePublishRoster}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-md transition-all flex items-center gap-2"
            title="Publish all draft shift assignments for the current week"
          >
            <span className="material-symbols-outlined text-base">send</span>
            PUBLISH WEEKLY ROSTER
            {totalDraftCount > 0 && (
              <span className="bg-emerald-950 text-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full ml-1">
                {totalDraftCount}
              </span>
            )}
          </button>

          {/* Launch Kiosk Terminal Button */}
          <button
            onClick={() => setShowKioskModal(true)}
            className="px-4 py-2.5 bg-[#d51f2c] hover:bg-[#b01a24] text-white font-bold text-xs uppercase tracking-wider rounded shadow transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">punch_clock</span>
            Time Clock Terminal
          </button>

          {/* Add Shift Button */}
          <button
            onClick={() => handleOpenAddModal()}
            className="px-4 py-2.5 bg-[#222222] hover:bg-[#d51f2c] text-white font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Shift
          </button>
        </div>
      </div>

      {/* Metrics Banner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 border border-amber-300 rounded flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-amber-700 text-2xl">edit_document</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Unpublished Drafts</p>
            <h4 className="text-2xl font-black text-[#1d1c17]">{totalDraftCount} Shifts</h4>
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5">Dashed styling guard active</p>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 border border-emerald-300 rounded flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-emerald-700 text-2xl">verified</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Published Roster</p>
            <h4 className="text-2xl font-black text-[#1d1c17]">{totalPublishedCount} Shifts</h4>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">Visible to staff in POS/Mobile</p>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 border border-blue-300 rounded flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-blue-700 text-2xl">schedule</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Total Weekly Planned Hours</p>
            <h4 className="text-2xl font-black text-[#1d1c17]">{totalWeeklyHours.toFixed(1)} hrs</h4>
            <p className="text-[11px] text-blue-700 font-semibold mt-0.5">Summed across all collaborators</p>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 border border-purple-300 rounded flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-purple-700 text-2xl">groups</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider">Active Staff Scheduled</p>
            <h4 className="text-2xl font-black text-[#1d1c17]">
              {filteredCollaborators.length} Collaborators
            </h4>
            <p className="text-[11px] text-purple-700 font-semibold mt-0.5">Grouped across 5 roles</p>
          </div>
        </div>
      </div>

      {/* Date Navigation & Filter Toolbar */}
      <div className="bg-white border border-[#e8e2d8] rounded p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Week Pagination */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevWeek}
              className="p-2 border border-[#e8e2d8] bg-[#f8f6f2] hover:bg-gray-200 rounded text-[#222222] transition-colors"
              title="Previous Week"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>

            <button
              onClick={handleToday}
              className="px-3 py-1.5 border border-[#e8e2d8] bg-[#f8f6f2] hover:bg-gray-200 text-[#222222] font-bold text-xs uppercase tracking-wider rounded transition-colors"
            >
              Current Week
            </button>

            <button
              onClick={handleNextWeek}
              className="p-2 border border-[#e8e2d8] bg-[#f8f6f2] hover:bg-gray-200 rounded text-[#222222] transition-colors"
              title="Next Week"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>

            <div className="ml-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#5f5e5e] text-lg">calendar_today</span>
              <span className="font-black text-sm text-[#1d1c17] tracking-tight">
                {formatDayHeader(startDateISO).formattedDate} – {formatDayHeader(endDateISO).formattedDate}, {new Date(startDateISO).getFullYear()}
              </span>
            </div>

            <input
              type="date"
              value={startDateISO}
              onChange={handleDateChange}
              className="ml-2 text-xs border border-[#e8e2d8] rounded px-2 py-1 bg-[#f8f6f2] font-semibold text-[#5f5e5e] focus:outline-none"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-[#5f5e5e] text-sm">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff or role..."
                className="pl-8 pr-3 py-1.5 text-xs border border-[#e8e2d8] rounded bg-[#f8f6f2] font-semibold focus:outline-none focus:border-[#222222] w-48"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs border border-[#e8e2d8] rounded px-3 py-1.5 bg-[#f8f6f2] font-bold text-[#1d1c17] focus:outline-none"
            >
              <option value="all">All Roles</option>
              {ROLES_LIST.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="text-xs border border-[#e8e2d8] rounded px-3 py-1.5 bg-[#f8f6f2] font-bold text-[#1d1c17] focus:outline-none"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-[#e8e2d8] rounded px-3 py-1.5 bg-[#f8f6f2] font-bold text-[#1d1c17] focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="draft">DRAFT Only</option>
              <option value="published">PUBLISHED Only</option>
              <option value="confirmed">CONFIRMED Only</option>
              <option value="absent">ABSENT Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Calendar View Rendering */}
      {viewMode === 'weekly' && (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-md overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[1100px]">
            {/* Table Header: X-Axis Days of the Week */}
            <thead>
              <tr className="bg-[#222222] text-white border-b border-[#e8e2d8]">
                <th className="p-4 w-72 min-w-[280px] font-black text-xs uppercase tracking-wider border-r border-white/10 sticky left-0 bg-[#222222] z-20">
                  <div className="flex justify-between items-center">
                    <span>Collaborator / Role</span>
                    <span className="text-[10px] font-normal text-gray-400">Weekly Total</span>
                  </div>
                </th>
                {weekDays.map((dateStr) => {
                  const { dayName, formattedDate } = formatDayHeader(dateStr);
                  const coverage = dailyCoverageMap.get(dateStr);
                  const isToday = dateStr === formatDateISO(new Date());
                  return (
                    <th
                      key={dateStr}
                      className={`p-3 text-center border-r border-white/10 ${
                        isToday ? 'bg-[#d51f2c]/90' : ''
                      }`}
                    >
                      <div className="font-black text-xs uppercase tracking-wider">{dayName}</div>
                      <div className="text-[11px] font-bold text-gray-300">{formattedDate}</div>
                      <div className="mt-1 inline-block px-2 py-0.5 bg-black/40 rounded text-[10px] font-semibold text-gray-200">
                        {coverage ? `${coverage.totalHours.toFixed(1)} hrs (${coverage.count})` : '0 hrs'}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Table Body: Y-Axis Active Collaborators grouped by Role */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#5f5e5e]">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#222222] border-t-transparent rounded-full animate-spin"></span>
                      <span className="font-bold text-sm uppercase tracking-wider">Hydrating Shift Matrix...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCollaborators.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#5f5e5e]">
                    <p className="font-bold text-base">No collaborators match the current filters.</p>
                  </td>
                </tr>
              ) : (
                ROLES_LIST.map((role) => {
                  const roleStaff = filteredCollaborators.filter((c) => c.role === role);
                  if (roleStaff.length === 0) return null;

                  return (
                    <React.Fragment key={role}>
                      {/* Role Section Divider */}
                      <tr className="bg-[#f1ece4] border-t border-b border-[#e8e2d8]">
                        <td
                          colSpan={8}
                          className="px-4 py-2 font-black text-xs text-[#222222] uppercase tracking-wider flex items-center gap-2"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-[#d51f2c]"></span>
                          {role} ({roleStaff.length} Team Members)
                        </td>
                      </tr>

                      {/* Staff Row */}
                      {roleStaff.map((collab) => {
                        const totalHours = collabWeeklyHoursMap.get(collab.id) || 0;
                        const isOvertime = totalHours > 40;

                        return (
                          <tr
                            key={collab.id}
                            className="border-b border-[#e8e2d8] hover:bg-gray-50/50 transition-colors"
                          >
                            {/* Y-Axis Collaborator Metadata Cell */}
                            <td className="p-4 border-r border-[#e8e2d8] sticky left-0 bg-white z-10">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  {collab.avatarUrl ? (
                                    <img
                                      src={collab.avatarUrl}
                                      alt={collab.name}
                                      className="w-10 h-10 rounded-full object-cover border border-[#e8e2d8]"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-[#222222] text-white flex items-center justify-center font-bold text-sm">
                                      {collab.name
                                        .split(' ')
                                        .map((n) => n[0])
                                        .join('')}
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="font-black text-sm text-[#1d1c17] leading-tight">
                                      {collab.name}
                                    </h4>
                                    <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-[#5f5e5e] font-semibold text-[10px] rounded uppercase mt-0.5">
                                      {collab.department}
                                    </span>
                                  </div>
                                </div>

                                {/* Dynamic Weekly Hours Summarization Badge */}
                                <div className="text-right shrink-0">
                                  <span
                                    className={`inline-block px-2 py-1 rounded text-xs font-black uppercase ${
                                      isOvertime
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    }`}
                                  >
                                    {totalHours.toFixed(1)} hrs
                                  </span>
                                  {isOvertime && (
                                    <span className="block text-[9px] font-bold text-rose-600 mt-0.5">
                                      Overtime
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* X-Axis Day Grid Cells */}
                            {weekDays.map((dateStr) => {
                              const cellKey = `${collab.id}_${dateStr}`;
                              const cellShifts = shiftsMap.get(cellKey) || [];

                              return (
                                <td
                                  key={dateStr}
                                  className="p-2 border-r border-[#e8e2d8] vertical-top align-top min-w-[130px] h-28 hover:bg-[#f8f6f2]/60 transition-colors relative group"
                                >
                                  {/* Render Shift Cards inside Cell */}
                                  {cellShifts.length > 0 ? (
                                    <div className="space-y-2">
                                      {cellShifts.map((shift) => {
                                        const style = STATUS_STYLES[shift.status];
                                        return (
                                          <div
                                            key={shift.id}
                                            onClick={() => handleOpenEditModal(shift)}
                                            className={`p-2.5 rounded text-xs cursor-pointer transition-all duration-200 hover:scale-[1.02] ${style.containerClass}`}
                                            title="Click to edit or remove shift"
                                          >
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                              <span className="font-black tracking-tight text-[11px]">
                                                {shift.startTime} - {shift.endTime}
                                              </span>
                                              <span
                                                className={`px-1.5 py-0.2 text-[9px] rounded uppercase ${style.badgeClass}`}
                                              >
                                                {style.label}
                                              </span>
                                            </div>

                                            <div className="font-bold text-[11px] truncate">
                                              {shift.presetName}
                                            </div>

                                            <div className="flex justify-between items-center mt-1 text-[10px] opacity-90">
                                              <span className="font-bold">{shift.hours} hrs</span>
                                              {shift.notes && (
                                                <span className="italic truncate max-w-[60px]" title={shift.notes}>
                                                  {shift.notes}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}

                                  {/* Quick Add Button on Hover */}
                                  <button
                                    onClick={() => handleOpenAddModal(collab.id, dateStr)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-2 border-2 border-dashed border-gray-300 hover:border-[#222222] bg-white/80 hover:bg-white rounded flex items-center justify-center text-[#222222] font-bold text-xs uppercase gap-1 shadow-sm"
                                  >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Assign
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Daily Timeline Workspace */}
      {viewMode === 'daily' && (
        <DailyGanttTimelineView
          date={startDateISO}
          shifts={shifts}
          collaborators={filteredCollaborators.length > 0 ? filteredCollaborators : INITIAL_COLLABORATORS}
          onDateChange={(newDate) => {
            const picked = new Date(`${newDate}T00:00:00`);
            setCurrentWeekMonday(getMonday(picked));
          }}
          onUpdateShift={async (shiftId, updated) => {
            await updateShiftAssignment(shiftId, updated);
            await loadShifts();
          }}
          onReassignShift={async (shiftId, newCollabId) => {
            const targetCollab = INITIAL_COLLABORATORS.find((c) => c.id === newCollabId);
            if (targetCollab) {
              await updateShiftAssignment(shiftId, {
                collaboratorId: targetCollab.id,
                collaboratorName: targetCollab.name,
                role: targetCollab.role,
                department: targetCollab.department,
                avatarUrl: targetCollab.avatarUrl,
              });
              await loadShifts();
            }
          }}
          onOpenAddModal={handleOpenAddModal}
          onOpenEditModal={handleOpenEditModal}
        />
      )}

      {/* Monthly Overview View */}
      {viewMode === 'monthly' && (
        <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-sm text-center">
          <span className="material-symbols-outlined text-4xl text-[#d51f2c] mb-2">calendar_month</span>
          <h3 className="font-black text-xl text-[#1d1c17] uppercase">Monthly Roster Overview</h3>
          <p className="text-body-md text-[#5f5e5e] max-w-md mx-auto mt-1">
            Displaying high-level monthly roster allocations and total hours summary for the active period.
          </p>
          <div className="mt-6 inline-flex gap-4">
            <div className="p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-left min-w-[200px]">
              <p className="text-xs font-bold text-[#5f5e5e] uppercase">Total Month Hours</p>
              <p className="text-2xl font-black text-[#1d1c17]">{(totalWeeklyHours * 4).toFixed(1)} hrs</p>
            </div>
            <div className="p-4 bg-[#f8f6f2] border border-[#e8e2d8] rounded text-left min-w-[200px]">
              <p className="text-xs font-bold text-[#5f5e5e] uppercase">Published Coverage</p>
              <p className="text-2xl font-black text-emerald-700">92%</p>
            </div>
          </div>
        </div>
      )}

      {/* Shift Swap Queue Workspace */}
      {viewMode === 'swaps' && (
        <ShiftSwapManagementView onNavigate={onNavigate} />
      )}

      {/* Shift Add/Edit Modal */}
      {isModalOpen && (
        <ShiftModal
          initialShift={
            editingShift ??
            (selectedCell
              ? { collaboratorId: selectedCell.collabId, date: selectedCell.date }
              : undefined)
          }
          collaborators={INITIAL_COLLABORATORS}
          allShifts={shifts}
          selectedDate={selectedCell?.date}
          selectedCollaboratorId={selectedCell?.collabId}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveShift}
          onDelete={handleDeleteShift}
        />
      )}

      {/* Shift Swap Review Panel Modal */}
      {selectedSwap && (
        <SwapReviewModal
          swap={selectedSwap}
          allShifts={shifts}
          collaborators={INITIAL_COLLABORATORS}
          onClose={() => setSelectedSwap(null)}
          onApprove={handleApproveSwap}
          onReject={handleRejectSwap}
        />
      )}

      {/* Time Clock Kiosk Overlay Modal */}
      {showKioskModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md overflow-y-auto p-2 sm:p-4 flex flex-col justify-start sm:justify-center items-center">
            <div className="w-full max-w-3xl my-auto py-2">
              <TimeClockKioskView
                isEmbedded={true}
                onClose={() => {
                  setShowKioskModal(false);
                  loadShifts();
                }}
              />
            </div>
          </div>,
          document.body
        )}

      {/* Persistent Staff Management Navigation Bar */}
      <StaffManagementQuickLinks
        activeModule={
          viewMode === 'monthly'
            ? 'roster'
            : viewMode === 'swaps'
            ? 'swaps'
            : viewMode === 'daily'
            ? 'daily-timeline'
            : 'shifts'
        }
        onNavigate={onNavigate}
      />
    </div>
  );
};
