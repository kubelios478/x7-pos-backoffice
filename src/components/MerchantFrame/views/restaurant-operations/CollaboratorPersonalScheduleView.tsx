import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';
import type {
  ShiftAssignment,
  Collaborator,
  ShiftSwapRequest,
} from '../../../../types/shifts';
import {
  INITIAL_COLLABORATORS,
  fetchMyShiftAssignments,
  fetchShiftSwapRequests,
  createShiftSwapRequest,
  submitShiftAbsenceNotice,
  generateShiftICS,
  downloadICSFile,
} from '../../../../api/shifts';

export type ScheduleViewMode = 'weekly' | 'monthly';

interface CollaboratorPersonalScheduleViewProps {
  onNavigate?: (viewOrRoute: string) => void;
  defaultCollaboratorId?: string;
}

// Date calculation helpers
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDateISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(baseDateISO: string, days: number): string {
  const parts = baseDateISO.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + days);
  return formatDateISO(date);
}

function formatReadableDate(dateISO: string): { weekday: string; monthDay: string; fullDateStr: string } {
  const d = new Date(`${dateISO}T00:00:00`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fullDateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  return { weekday, monthDay, fullDateStr };
}

// ----------------------------------------------------------------------
// Shift Swap Modal Component
// ----------------------------------------------------------------------
interface ShiftTradeModalProps {
  shift: ShiftAssignment;
  collaborator: Collaborator;
  peerCollaborators: Collaborator[];
  onClose: () => void;
  onSuccess: () => void;
}

const ShiftTradeModal: React.FC<ShiftTradeModalProps> = ({
  shift,
  collaborator,
  peerCollaborators,
  onClose,
  onSuccess,
}) => {
  const [tradeType, setTradeType] = useState<'DIRECT_PEER' | 'OPEN_MARKETPLACE'>('DIRECT_PEER');
  const [targetCollaboratorId, setTargetCollaboratorId] = useState<string>(
    peerCollaborators.length > 0 ? peerCollaborators[0].id : ''
  );
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const targetCollaborator = useMemo(() => {
    return peerCollaborators.find((c) => c.id === targetCollaboratorId);
  }, [peerCollaborators, targetCollaboratorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Please provide a reason for the shift swap request.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const targetCollabId = tradeType === 'DIRECT_PEER' ? targetCollaboratorId : '';
      const targetCollabName =
        tradeType === 'DIRECT_PEER'
          ? targetCollaborator?.name ?? 'Peer Collaborator'
          : 'Open Marketplace Pool';
      const targetCollabRole =
        tradeType === 'DIRECT_PEER'
          ? targetCollaborator?.role ?? shift.role
          : shift.role;

      await createShiftSwapRequest({
        merchantId: 'merch-main-01',
        shiftId: shift.id,
        requestingCollaboratorId: collaborator.id,
        requestingCollaboratorName: collaborator.name,
        requestingCollaboratorRole: collaborator.role,
        requestingAvatarUrl: collaborator.avatarUrl,
        targetCollaboratorId: targetCollabId,
        targetCollaboratorName: targetCollabName,
        targetCollaboratorRole: targetCollabRole,
        targetAvatarUrl: targetCollaborator?.avatarUrl,
        shiftDate: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        requiredRole: shift.role,
        hours: shift.hours,
        reason: tradeType === 'OPEN_MARKETPLACE' ? `Open Pool Release: ${reason}` : reason,
      });

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit shift trade request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div
        className="w-full max-w-lg bg-white border border-[#e8e2d8] rounded-xl shadow-2xl overflow-hidden flex flex-col text-left font-['Poppins',sans-serif]"
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        {/* Modal Header */}
        <div className="bg-[#222222] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#d51f2c] text-2xl">
              swap_horiz
            </span>
            <div>
              <h3 className="font-bold text-base uppercase tracking-wide">
                Trade Shift Request
              </h3>
              <p className="text-xs text-white/70">
                Offer swap to a coworker or release to Open Marketplace
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Shift Details Summary */}
          <div className="bg-[#f1ece4] border border-[#e8e2d8] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5f5e5e] uppercase">
              <span>Shift #{shift.id}</span>
              <span className="bg-[#222222] text-white px-2.5 py-0.5 rounded-full text-[10px]">
                {shift.hours} hrs
              </span>
            </div>
            <div className="text-sm font-bold text-[#222222]">
              {formatReadableDate(shift.date).fullDateStr}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#222222]">
              <span className="font-bold bg-white px-2 py-0.5 rounded border border-[#e8e2d8]">
                {shift.startTime} - {shift.endTime}
              </span>
              <span className="bg-[#d51f2c]/10 text-[#d51f2c] font-bold px-2 py-0.5 rounded uppercase text-[11px]">
                {shift.assignedRole || shift.role}
              </span>
              <span className="text-[#5f5e5e] italic">
                📍 {shift.department || 'Main Floor'}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Trade Option Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#222222]">
              Select Marketplace Destination:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTradeType('DIRECT_PEER')}
                className={`p-3.5 rounded-lg border text-left flex items-start gap-3 transition-all min-h-[44px] ${
                  tradeType === 'DIRECT_PEER'
                    ? 'border-[#d51f2c] bg-red-50/40 text-[#222222] ring-1 ring-[#d51f2c]'
                    : 'border-[#e8e2d8] bg-white text-[#5f5e5e] hover:border-gray-400'
                }`}
              >
                <span className="material-symbols-outlined text-xl text-[#d51f2c] mt-0.5">
                  person_search
                </span>
                <div>
                  <div className="font-bold text-xs">Direct Coworker Swap</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Propose trade to a specific peer
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTradeType('OPEN_MARKETPLACE')}
                className={`p-3.5 rounded-lg border text-left flex items-start gap-3 transition-all min-h-[44px] ${
                  tradeType === 'OPEN_MARKETPLACE'
                    ? 'border-[#d51f2c] bg-red-50/40 text-[#222222] ring-1 ring-[#d51f2c]'
                    : 'border-[#e8e2d8] bg-white text-[#5f5e5e] hover:border-gray-400'
                }`}
              >
                <span className="material-symbols-outlined text-xl text-[#d51f2c] mt-0.5">
                  storefront
                </span>
                <div>
                  <div className="font-bold text-xs">Open Pool Release</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Release to UNASSIGNED_SHIFTS pool
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Coworker Dropdown Selection if Direct Peer */}
          {tradeType === 'DIRECT_PEER' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#222222]">
                Select Target Coworker:
              </label>
              <select
                aria-label="Select Target Coworker"
                value={targetCollaboratorId}
                onChange={(e) => setTargetCollaboratorId(e.target.value)}
                className="w-full bg-white border border-[#e8e2d8] rounded-lg p-2.5 text-xs text-[#222222] font-medium focus:outline-none focus:border-[#d51f2c] min-h-[44px]"
              >
                {peerCollaborators.map((peer) => (
                  <option key={peer.id} value={peer.id}>
                    {peer.name} ({peer.role} • {peer.department})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#222222]">
              Reason for Trade Request: <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide context or explanation for requesting this shift swap..."
              rows={3}
              required
              className="w-full bg-white border border-[#e8e2d8] rounded-lg p-3 text-xs text-[#222222] focus:outline-none focus:border-[#d51f2c] resize-none"
            />
          </div>

          {/* Actions Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#e8e2d8]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-gray-100 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-[#d51f2c] text-white text-xs font-bold hover:bg-[#ae001a] transition-all disabled:opacity-50 flex items-center gap-2 min-h-[44px] shadow-sm"
            >
              {isSubmitting ? (
                <span>Submitting...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    published_with_changes
                  </span>
                  <span>Submit Trade Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ----------------------------------------------------------------------
// Time-Off Notice Modal Component
// ----------------------------------------------------------------------
interface TimeOffNoticeModalProps {
  shift: ShiftAssignment;
  onClose: () => void;
  onSuccess: () => void;
}

const TimeOffNoticeModal: React.FC<TimeOffNoticeModalProps> = ({
  shift,
  onClose,
  onSuccess,
}) => {
  const [reasonCategory, setReasonCategory] = useState<string>('Medical / Illness');
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await submitShiftAbsenceNotice(shift.id, reasonCategory, details);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit time-off notice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div
        className="w-full max-w-lg bg-white border border-[#e8e2d8] rounded-xl shadow-2xl overflow-hidden flex flex-col text-left font-['Poppins',sans-serif]"
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        {/* Modal Header */}
        <div className="bg-[#222222] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#d51f2c] text-2xl">
              event_busy
            </span>
            <div>
              <h3 className="font-bold text-base uppercase tracking-wide">
                Submit Time-Off / Absence Notice
              </h3>
              <p className="text-xs text-white/70">
                Notify management of advance absence for scheduled shift
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Shift Details Summary */}
          <div className="bg-[#f1ece4] border border-[#e8e2d8] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5f5e5e] uppercase">
              <span>Target Shift</span>
              <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[10px]">
                {shift.hours} hrs
              </span>
            </div>
            <div className="text-sm font-bold text-[#222222]">
              {formatReadableDate(shift.date).fullDateStr}
            </div>
            <div className="text-xs text-[#5f5e5e]">
              <span className="font-bold text-[#222222]">{shift.startTime} - {shift.endTime}</span> • {shift.assignedRole || shift.role} ({shift.department || 'Floor'})
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#222222]">
              Absence Reason Category:
            </label>
            <select
              aria-label="Absence Reason Category"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full bg-white border border-[#e8e2d8] rounded-lg p-2.5 text-xs text-[#222222] font-medium focus:outline-none focus:border-[#d51f2c] min-h-[44px]"
            >
              <option value="Medical / Illness">Medical / Illness</option>
              <option value="Personal Emergency">Personal Emergency</option>
              <option value="Transportation Issue">Transportation Issue</option>
              <option value="Family Responsibility">Family Responsibility</option>
              <option value="Academic / Study">Academic / Study</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#222222]">
              Additional Notes / Details:
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide extra details for your supervisor..."
              rows={3}
              className="w-full bg-white border border-[#e8e2d8] rounded-lg p-3 text-xs text-[#222222] focus:outline-none focus:border-[#d51f2c] resize-none"
            />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
            <span className="material-symbols-outlined text-base text-amber-700 mt-0.5">
              info
            </span>
            <div>
              Submitting this notice flags the shift as <strong>ABSENT</strong> and logs the notification directly for manager review.
            </div>
          </div>

          {/* Actions Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#e8e2d8]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-[#e8e2d8] text-xs font-bold text-[#5f5e5e] hover:bg-gray-100 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all disabled:opacity-50 flex items-center gap-2 min-h-[44px] shadow-sm"
            >
              {isSubmitting ? (
                <span>Submitting...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">person_off</span>
                  <span>Confirm Absence Notice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ----------------------------------------------------------------------
// Main Collaborator Personal Schedule View Component
// ----------------------------------------------------------------------
export const CollaboratorPersonalScheduleView: React.FC<CollaboratorPersonalScheduleViewProps> = ({
  onNavigate,
  defaultCollaboratorId = 'emp-102', // Sofia Rodriguez (Waitstaff)
}) => {
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string>(defaultCollaboratorId);
  const [currentMondayISO, setCurrentMondayISO] = useState<string>(
    formatDateISO(getMonday(new Date()))
  );
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('weekly');

  // Datasets
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selected shift for modals
  const [selectedShiftForTrade, setSelectedShiftForTrade] = useState<ShiftAssignment | null>(null);
  const [selectedShiftForAbsence, setSelectedShiftForAbsence] = useState<ShiftAssignment | null>(null);

  // Selected shift for details drawer in Monthly view
  const [focusedShift, setFocusedShift] = useState<ShiftAssignment | null>(null);

  const activeCollaborator = useMemo(() => {
    return (
      INITIAL_COLLABORATORS.find((c) => c.id === selectedCollaboratorId) ??
      INITIAL_COLLABORATORS[1]
    );
  }, [selectedCollaboratorId]);

  const peerCollaborators = useMemo(() => {
    return INITIAL_COLLABORATORS.filter((c) => c.id !== selectedCollaboratorId);
  }, [selectedCollaboratorId]);

  // Calculated Sunday of current week
  const currentSundayISO = useMemo(() => {
    return addDaysISO(currentMondayISO, 6);
  }, [currentMondayISO]);

  // Load identity-scoped shift assignments and trade requests
  const loadWorkspaceData = async () => {
    try {
      setLoading(true);
      // Identity-scoped query for logged in collaborator context
      const [userShifts, swapsData] = await Promise.all([
        fetchMyShiftAssignments(undefined, undefined, selectedCollaboratorId),
        fetchShiftSwapRequests({ merchant_id: 'merch-main-01' }),
      ]);
      setShifts(userShifts);
      setSwapRequests(swapsData);
    } catch (err) {
      console.error('Error loading personal schedule dataset:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [selectedCollaboratorId, currentMondayISO]);

  // Current week shifts filtering
  const currentWeekShifts = useMemo(() => {
    return shifts.filter(
      (s) => s.date >= currentMondayISO && s.date <= currentSundayISO
    );
  }, [shifts, currentMondayISO, currentSundayISO]);

  // Total scheduled hours for current week vs 40.0h labor cap
  const totalWeeklyHours = useMemo(() => {
    return currentWeekShifts.reduce((acc, s) => acc + (s.hours || 0), 0);
  }, [currentWeekShifts]);

  const laborCapHours = 40.0;
  const laborCapPercentage = Math.min(100, (totalWeeklyHours / laborCapHours) * 100);

  // Week days array (7 days Mon to Sun)
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dateISO = addDaysISO(currentMondayISO, i);
      const shift = currentWeekShifts.find((s) => s.date === dateISO);
      const isToday = dateISO === formatDateISO(new Date());

      // Check if there is an active swap request for this shift
      const activeSwap = shift
        ? swapRequests.find(
            (swp) =>
              swp.shiftId === shift.id &&
              (swp.status === 'PENDING_SUPERVISOR_APPROVAL' ||
                swp.status === 'PENDING_PEER_ACCEPTANCE' ||
                swp.status === 'APPROVED')
          )
        : undefined;

      days.push({
        dateISO,
        isToday,
        shift,
        activeSwap,
      });
    }
    return days;
  }, [currentMondayISO, currentWeekShifts, swapRequests]);

  // Month grid calculations for Monthly View
  const monthlyGrid = useMemo(() => {
    const parts = currentMondayISO.split('-').map(Number);
    const dateInMonth = new Date(parts[0], parts[1] - 1, 1);
    const month = dateInMonth.getMonth();
    const year = dateInMonth.getFullYear();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startMonday = getMonday(firstDayOfMonth);
    const days = [];
    let current = new Date(startMonday);

    while (current <= lastDayOfMonth || days.length % 7 !== 0) {
      const dateISO = formatDateISO(current);
      const dayShifts = shifts.filter((s) => s.date === dateISO);
      const isCurrentMonth = current.getMonth() === month;
      const isToday = dateISO === formatDateISO(new Date());

      days.push({
        dateISO,
        dayNum: current.getDate(),
        isCurrentMonth,
        isToday,
        shifts: dayShifts,
      });
      current.setDate(current.getDate() + 1);
    }
    return { monthName: dateInMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), days };
  }, [currentMondayISO, shifts]);

  // Week navigation
  const handlePrevWeek = () => {
    setCurrentMondayISO((prev) => addDaysISO(prev, -7));
  };
  const handleNextWeek = () => {
    setCurrentMondayISO((prev) => addDaysISO(prev, 7));
  };
  const handleCurrentWeek = () => {
    setCurrentMondayISO(formatDateISO(getMonday(new Date())));
  };

  // Export Calendar handlers
  const handleExportICS = () => {
    const icsContent = generateShiftICS(
      currentWeekShifts.length > 0 ? currentWeekShifts : shifts,
      activeCollaborator.name
    );
    downloadICSFile(`x7-schedule-${activeCollaborator.name.toLowerCase().replace(/\s+/g, '-')}.ics`, icsContent);
  };

  const handleGoogleCalendarExport = (shift: ShiftAssignment) => {
    const title = encodeURIComponent(`Shift: ${shift.assignedRole || shift.role} (${shift.department})`);
    const details = encodeURIComponent(
      `Collaborator: ${shift.collaboratorName}\nRole: ${shift.assignedRole || shift.role}\nDepartment: ${shift.department}\nHours: ${shift.hours}h\nNotes: ${shift.notes || 'None'}`
    );
    const location = encodeURIComponent(shift.department || 'X7 POS Restaurant');

    const cleanTime = (t: string) => {
      const isPM = t.includes('PM');
      const isAM = t.includes('AM');
      const raw = t.replace(/AM|PM/g, '').trim();
      const [hh, mm] = raw.split(':').map(Number);
      let h = hh || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}${String(mm || 0).padStart(2, '0')}00`;
    };

    const dIso = shift.date.replace(/-/g, '');
    const startStr = `${dIso}T${cleanTime(shift.startTime)}Z`;
    const endStr = `${dIso}T${cleanTime(shift.endTime)}Z`;

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
    window.open(googleUrl, '_blank');
  };

  return (
    <div
      className="min-h-screen bg-[#f1ece4] p-4 sm:p-6 lg:p-8 space-y-6 text-left font-['Poppins',sans-serif]"
      style={{ fontFamily: 'Poppins, sans-serif' }}
    >
      {/* 1. Header Workspace Title & Identity Context */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white border border-[#e8e2d8] p-5 lg:p-6 rounded-xl shadow-xs">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={activeCollaborator.avatarUrl}
              alt={activeCollaborator.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-[#d51f2c] shadow-sm"
            />
            <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#222222] tracking-tight uppercase">
                {activeCollaborator.name}
              </h1>
              <span className="px-2.5 py-0.5 bg-[#d51f2c]/10 text-[#d51f2c] text-[11px] font-bold rounded-full uppercase tracking-wider">
                {activeCollaborator.role}
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 flex items-center gap-2">
              <span>📍 {activeCollaborator.department}</span>
              <span>•</span>
              <span className="font-semibold text-[#222222]">
                Personal Schedule Portal
              </span>
            </p>
          </div>
        </div>

        {/* Persona Switcher (For Demo & Multi-Collaborator Testing) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#f1ece4] px-3 py-2 rounded-lg border border-[#e8e2d8]">
            <span className="material-symbols-outlined text-base text-[#5f5e5e]">
              badge
            </span>
            <label htmlFor="persona-select" className="text-xs font-bold text-[#5f5e5e] uppercase">
              Persona:
            </label>
            <select
              id="persona-select"
              aria-label="Switch Collaborator Persona"
              value={selectedCollaboratorId}
              onChange={(e) => setSelectedCollaboratorId(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#222222] focus:outline-none cursor-pointer"
            >
              {INITIAL_COLLABORATORS.map((collab) => (
                <option key={collab.id} value={collab.id}>
                  {collab.name} ({collab.role})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportICS}
            className="px-4 py-2.5 bg-[#222222] hover:bg-[#d51f2c] text-white text-xs font-bold uppercase rounded-lg transition-all flex items-center gap-2 min-h-[44px] shadow-sm"
          >
            <span className="material-symbols-outlined text-base">calendar_add_on</span>
            <span>Export Calendar (.ics)</span>
          </button>
        </div>
      </div>

      {/* 2. Weekly Summary Banner */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-4 lg:p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Week Date Range & Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handlePrevWeek}
              className="w-10 h-10 rounded-lg border border-[#e8e2d8] hover:bg-gray-100 flex items-center justify-center text-[#222222] transition-colors min-h-[44px]"
              title="Previous Week"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <button
              onClick={handleCurrentWeek}
              className="px-3.5 py-2 rounded-lg bg-[#f1ece4] hover:bg-gray-200 text-xs font-bold text-[#222222] transition-colors min-h-[44px]"
            >
              This Week
            </button>

            <button
              onClick={handleNextWeek}
              className="w-10 h-10 rounded-lg border border-[#e8e2d8] hover:bg-gray-100 flex items-center justify-center text-[#222222] transition-colors min-h-[44px]"
              title="Next Week"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>

            <div className="ml-1 sm:ml-2">
              <div className="text-xs font-bold text-[#5f5e5e] uppercase tracking-wider">
                Target Week
              </div>
              <div className="text-sm font-black text-[#222222]">
                {formatReadableDate(currentMondayISO).monthDay} - {formatReadableDate(currentSundayISO).monthDay}
              </div>
            </div>
          </div>

          {/* Scheduled Weekly Hours vs Labor Cap Metric */}
          <div className="flex items-center gap-4 bg-[#f1ece4] p-3 rounded-lg border border-[#e8e2d8]">
            <div>
              <div className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
                Total Weekly Hours
              </div>
              <div className="text-lg font-black text-[#222222] flex items-baseline gap-1">
                <span className={totalWeeklyHours > laborCapHours ? 'text-red-600' : 'text-[#d51f2c]'}>
                  {totalWeeklyHours.toFixed(1)}
                </span>
                <span className="text-xs text-[#5f5e5e] font-bold">
                  / {laborCapHours.toFixed(1)} hrs cap
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-24 sm:w-32 flex flex-col gap-1">
              <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    totalWeeklyHours > laborCapHours
                      ? 'bg-red-600'
                      : totalWeeklyHours >= 30
                      ? 'bg-emerald-600'
                      : 'bg-[#d51f2c]'
                  }`}
                  style={{ width: `${laborCapPercentage}%` }}
                />
              </div>
              <div className="text-[10px] font-bold text-right text-[#5f5e5e]">
                {laborCapPercentage.toFixed(0)}% of Labor Cap
              </div>
            </div>
          </div>

          {/* View Switcher Toggle */}
          <div className="flex items-center gap-1 bg-[#f1ece4] p-1 rounded-lg border border-[#e8e2d8]">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 min-h-[44px] ${
                viewMode === 'weekly'
                  ? 'bg-white text-[#222222] shadow-xs font-black'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-base">event</span>
              <span>Weekly Cards</span>
            </button>

            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 min-h-[44px] ${
                viewMode === 'monthly'
                  ? 'bg-white text-[#222222] shadow-xs font-black'
                  : 'text-[#5f5e5e] hover:text-[#222222]'
              }`}
            >
              <span className="material-symbols-outlined text-base">calendar_month</span>
              <span>Monthly Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Schedule Views */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 rounded-xl text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-[#d51f2c] animate-spin">
            sync
          </span>
          <p className="text-xs font-bold text-[#5f5e5e] uppercase">
            Hydrating Identity-Scoped Shift Assignments...
          </p>
        </div>
      ) : viewMode === 'weekly' ? (
        /* ------------------ WEEKLY CARDS VIEW (Default) ------------------ */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#222222] uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[#d51f2c]">view_week</span>
              <span>7-Day Schedule Overview</span>
            </h2>
            <span className="text-xs text-[#5f5e5e] font-semibold">
              Showing shifts for {activeCollaborator.name}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {weekDays.map((day) => {
              const { weekday, monthDay } = formatReadableDate(day.dateISO);
              const shift = day.shift;
              const activeSwap = day.activeSwap;

              return (
                <div
                  key={day.dateISO}
                  className={`bg-white border rounded-xl p-4 sm:p-5 shadow-xs transition-all ${
                    day.isToday
                      ? 'border-[#d51f2c] ring-2 ring-[#d51f2c]/20 bg-red-50/10'
                      : 'border-[#e8e2d8] hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Date Anatomy Header */}
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div
                        className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold ${
                          day.isToday
                            ? 'bg-[#d51f2c] text-white shadow-xs'
                            : 'bg-[#f1ece4] text-[#222222]'
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold tracking-tight">
                          {weekday.substring(0, 3)}
                        </span>
                        <span className="text-base font-black leading-none">
                          {monthDay.split(' ')[1] || monthDay}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-[#222222]">
                            {weekday}, {monthDay}
                          </span>
                          {day.isToday && (
                            <span className="bg-[#d51f2c] text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                              TODAY
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#5f5e5e] font-medium">
                          {shift ? 'Scheduled Shift Assigned' : 'No Scheduled Shift'}
                        </p>
                      </div>
                    </div>

                    {/* Shift Content Anatomy */}
                    {shift ? (
                      <div className="flex-1 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#f1ece4] border border-[#e8e2d8] p-4 rounded-xl">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Operational Window Time Badge */}
                            <span className="px-3 py-1 bg-[#222222] text-white font-bold text-xs rounded-lg flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm">schedule</span>
                              <span>
                                {shift.startTime} - {shift.endTime}
                              </span>
                            </span>

                            {/* Role & Section Badge */}
                            <span className="px-2.5 py-1 bg-white border border-[#e8e2d8] text-[#222222] font-bold text-xs rounded-lg uppercase tracking-wide">
                              {shift.assignedRole || shift.role} •{' '}
                              <span className="text-[#d51f2c]">
                                {shift.department || 'Main Floor'}
                              </span>
                            </span>

                            {/* Total Duration Pill */}
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-lg">
                              ⏳ {shift.hours} hrs net
                            </span>

                            {/* Status Badge */}
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase ${
                                shift.status === 'published' || shift.status === 'confirmed'
                                  ? 'bg-emerald-600 text-white'
                                  : shift.status === 'absent'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-200 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {shift.status}
                            </span>
                          </div>

                          {/* Trade Status Indicator if active */}
                          {activeSwap && (
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                              <span className="material-symbols-outlined text-sm text-amber-600">
                                published_with_changes
                              </span>
                              <span>
                                Active Swap Request: {activeSwap.status} ({activeSwap.targetCollaboratorName})
                              </span>
                            </div>
                          )}

                          {/* Notes */}
                          {shift.notes && (
                            <p className="text-xs text-[#5f5e5e] italic bg-white/60 p-2 rounded border border-[#e8e2d8]">
                              📝 {shift.notes}
                            </p>
                          )}
                        </div>

                        {/* Self-Service Actions (Min height 44px for touch targets) */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedShiftForTrade(shift)}
                            className="px-3.5 py-2.5 bg-white border border-[#e8e2d8] hover:border-[#d51f2c] text-[#222222] hover:text-[#d51f2c] font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 min-h-[44px] shadow-2xs"
                            title="Initiate Shift Swap Request"
                          >
                            <span className="material-symbols-outlined text-base">
                              swap_horiz
                            </span>
                            <span>Trade Shift</span>
                          </button>

                          <button
                            onClick={() => setSelectedShiftForAbsence(shift)}
                            className="px-3.5 py-2.5 bg-white border border-[#e8e2d8] hover:border-amber-600 text-[#222222] hover:text-amber-700 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 min-h-[44px] shadow-2xs"
                            title="Submit Advance Absence Notification"
                          >
                            <span className="material-symbols-outlined text-base">
                              event_busy
                            </span>
                            <span>Time-Off</span>
                          </button>

                          <button
                            onClick={() => handleGoogleCalendarExport(shift)}
                            className="w-11 h-11 bg-white border border-[#e8e2d8] hover:bg-gray-100 text-[#222222] rounded-lg flex items-center justify-center transition-colors min-h-[44px]"
                            title="Export Event to Google Calendar"
                          >
                            <span className="material-symbols-outlined text-base">
                              calendar_add_on
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Day Off anatomy */
                      <div className="flex-1 bg-[#f1ece4]/60 border border-dashed border-[#e8e2d8] p-4 rounded-xl flex items-center justify-between text-xs font-bold text-[#5f5e5e]">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-[#5f5e5e]">
                            event_available
                          </span>
                          <span>DAY OFF — No Shift Scheduled</span>
                        </div>
                        <span className="text-[10px] bg-white px-2 py-1 rounded text-[#5f5e5e] border border-[#e8e2d8]">
                          Rest Period
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ------------------ MONTHLY CALENDAR VIEW ------------------ */
        <div className="bg-white border border-[#e8e2d8] rounded-xl p-5 lg:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8e2d8] pb-4">
            <h2 className="text-base font-black text-[#222222] uppercase tracking-wide flex items-center gap-2">
              <span className="material-symbols-outlined text-[#d51f2c]">calendar_month</span>
              <span>{monthlyGrid.monthName}</span>
            </h2>
            <div className="text-xs text-[#5f5e5e] font-semibold">
              Monthly Shifts Overview
            </div>
          </div>

          {/* Calendar Grid Headers */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs uppercase tracking-wider text-[#5f5e5e] pb-2 border-b border-[#e8e2d8]">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {monthlyGrid.days.map((dayItem) => {
              const hasShifts = dayItem.shifts.length > 0;

              return (
                <div
                  key={dayItem.dateISO}
                  onClick={() => {
                    if (hasShifts) setFocusedShift(dayItem.shifts[0]);
                  }}
                  className={`min-h-[90px] sm:min-h-[110px] p-2 rounded-xl border flex flex-col justify-between transition-all ${
                    hasShifts ? 'cursor-pointer hover:border-[#d51f2c] hover:shadow-xs' : ''
                  } ${
                    !dayItem.isCurrentMonth
                      ? 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'
                      : dayItem.isToday
                      ? 'bg-red-50/20 border-[#d51f2c] text-[#222222]'
                      : 'bg-white border-[#e8e2d8]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        dayItem.isToday
                          ? 'bg-[#d51f2c] text-white'
                          : 'text-[#222222]'
                      }`}
                    >
                      {dayItem.dayNum}
                    </span>
                    {hasShifts && (
                      <span className="w-2 h-2 rounded-full bg-[#d51f2c]" />
                    )}
                  </div>

                  {/* Shift Badge indicators inside cell */}
                  {hasShifts ? (
                    <div className="space-y-1">
                      {dayItem.shifts.map((s) => (
                        <div
                          key={s.id}
                          className="bg-[#222222] text-white text-[10px] font-bold p-1 rounded-md tracking-tight leading-tight uppercase truncate"
                        >
                          {s.startTime} • {s.assignedRole || s.role}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-400 font-semibold italic text-center">
                      Off
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Focused Shift Drawer / Modal (When clicking shift dot in Monthly View) */}
      {focusedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-[#e8e2d8] rounded-xl shadow-2xl overflow-hidden p-6 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#e8e2d8] pb-3">
              <h3 className="font-bold text-sm text-[#222222] uppercase tracking-wide">
                Shift Details (#{focusedShift.id})
              </h3>
              <button
                onClick={() => setFocusedShift(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-[#222222]"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#222222]">
              <div className="font-black text-sm">
                {formatReadableDate(focusedShift.date).fullDateStr}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="bg-[#222222] text-white font-bold px-2.5 py-1 rounded">
                  {focusedShift.startTime} - {focusedShift.endTime}
                </span>
                <span className="bg-[#d51f2c]/10 text-[#d51f2c] font-bold px-2.5 py-1 rounded uppercase">
                  {focusedShift.assignedRole || focusedShift.role}
                </span>
                <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded">
                  {focusedShift.hours} hrs
                </span>
              </div>
              <p className="text-[#5f5e5e]">📍 Location: {focusedShift.department}</p>
              {focusedShift.notes && (
                <p className="italic bg-[#f1ece4] p-2 rounded border border-[#e8e2d8]">
                  📝 {focusedShift.notes}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-[#e8e2d8] flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setSelectedShiftForTrade(focusedShift);
                  setFocusedShift(null);
                }}
                className="px-4 py-2.5 bg-[#d51f2c] text-white text-xs font-bold rounded-lg hover:bg-[#ae001a] min-h-[44px]"
              >
                Trade Shift
              </button>
              <button
                onClick={() => {
                  setSelectedShiftForAbsence(focusedShift);
                  setFocusedShift(null);
                }}
                className="px-4 py-2.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 min-h-[44px]"
              >
                Time-Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Shift Trade Request Modal */}
      {selectedShiftForTrade && (
        <ShiftTradeModal
          shift={selectedShiftForTrade}
          collaborator={activeCollaborator}
          peerCollaborators={peerCollaborators}
          onClose={() => setSelectedShiftForTrade(null)}
          onSuccess={() => {
            setSelectedShiftForTrade(null);
            loadWorkspaceData();
          }}
        />
      )}

      {/* 6. Time-Off / Absence Notice Modal */}
      {selectedShiftForAbsence && (
        <TimeOffNoticeModal
          shift={selectedShiftForAbsence}
          onClose={() => setSelectedShiftForAbsence(null)}
          onSuccess={() => {
            setSelectedShiftForAbsence(null);
            loadWorkspaceData();
          }}
        />
      )}

      {/* Quick Links Footer */}
      <StaffManagementQuickLinks
        activeModule="my-schedule"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default CollaboratorPersonalScheduleView;
