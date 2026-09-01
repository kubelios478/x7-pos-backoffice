import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AttendanceLedgerRecord } from '../../../../types/attendance';
import {
  updateAttendanceLedgerRecord,
  calculateNetPayableHours,
  determineAttendanceStatus,
} from '../../../../api/attendance';

interface TimesheetCorrectionModalProps {
  record: AttendanceLedgerRecord;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const TimesheetCorrectionModal: React.FC<TimesheetCorrectionModalProps> = ({
  record,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [mounted, setMounted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'EDIT' | 'AUDIT_LOG'>('EDIT');

  // Form State
  const [clockIn, setClockIn] = useState<string>(record?.actualPunches?.clockIn || '');
  const [clockOut, setClockOut] = useState<string>(record?.actualPunches?.clockOut || '');
  const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState<number>(
    record?.unpaidBreakMinutes || 0
  );
  const [reason, setReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (record) {
      setClockIn(record.actualPunches?.clockIn || '');
      setClockOut(record.actualPunches?.clockOut || '');
      setUnpaidBreakMinutes(record.unpaidBreakMinutes || 0);
      setReason('');
      setErrorMessage(null);
    }
  }, [record]);

  // Live recalculation preview
  const previewCalculation = useMemo(() => {
    if (!record) {
      return {
        rawWorkedHours: '0.00',
        netPayableHours: '0.00',
        status: 'ON_TIME',
        varianceLabel: 'On Time',
      };
    }
    const clockInVal = clockIn.trim() || null;
    const clockOutVal = clockOut.trim() || null;
    const breakMins = Math.max(0, unpaidBreakMinutes || 0);

    const { rawWorkedHours, netPayableHours } = calculateNetPayableHours(
      clockInVal,
      clockOutVal,
      breakMins
    );

    const statusEval = determineAttendanceStatus(
      record.scheduledWindow,
      clockInVal,
      clockOutVal
    );

    return {
      rawWorkedHours,
      netPayableHours,
      status: statusEval.status,
      varianceLabel: statusEval.varianceLabel,
    };
  }, [clockIn, clockOut, unpaidBreakMinutes, record?.scheduledWindow]);

  if (!isOpen || !record || !mounted) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('A mandatory justification note is required to perform timesheet edits.');
      return;
    }

    setIsSubmitting(true);

    const result = updateAttendanceLedgerRecord({
      recordId: record.id,
      clockIn: clockIn.trim() || null,
      clockOut: clockOut.trim() || null,
      unpaidBreakMinutes,
      reason: reason.trim(),
      modifiedByUserId: 'usr-admin-901',
      modifiedByUserName: 'Store Manager (Admin)',
    });

    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to update record.');
      return;
    }

    onSaved();
    onClose();
  };

  const renderStatusBadge = (status: string, label: string) => {
    switch (status) {
      case 'ON_TIME':
        return (
          <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {label}
          </span>
        );
      case 'TARDY':
        return (
          <span className="px-2.5 py-1 bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-black uppercase rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            {label}
          </span>
        );
      case 'EARLY_DEPARTURE':
        return (
          <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black uppercase rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            {label}
          </span>
        );
      case 'MISSED_PUNCH':
        return (
          <span className="px-2.5 py-1 bg-rose-50 border border-rose-400 text-rose-900 text-[10px] font-black uppercase rounded animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            {label}
          </span>
        );
      case 'UNSCHEDULED':
      default:
        return (
          <span className="px-2.5 py-1 bg-purple-100 border border-purple-300 text-purple-900 text-[10px] font-black uppercase rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
            {label}
          </span>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 font-sans">
      {/* Dark Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-fade-in cursor-pointer"
        onClick={onClose}
      />

      {/* Centered Modal Dialog Card */}
      <div
        role="dialog"
        aria-label="Timesheet Correction & Audit Log"
        className="relative z-[100000] w-[95vw] sm:w-[640px] max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-left text-[#222222] animate-fade-in border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#222222] text-white p-6 border-b border-white/10 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <img
              src={
                record.avatarUrl ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop'
              }
              alt={record.collaboratorName}
              className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">
                  {record.storeLocationName} • {record.date}
                </span>
              </div>
              <h3 className="font-sans text-xl font-bold text-white tracking-tight">
                {record.collaboratorName}
              </h3>
              <p className="text-xs text-white/70">
                {record.role} <span className="text-[#d51f2c]">•</span> {record.department}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-gray-100 border-b border-gray-200 flex px-6">
          <button
            type="button"
            onClick={() => setActiveTab('EDIT')}
            className={`py-3 px-4 font-bold text-xs uppercase border-b-2 tracking-wider flex items-center gap-2 transition-all ${
              activeTab === 'EDIT'
                ? 'border-[#d51f2c] text-[#d51f2c] bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <span className="material-symbols-outlined text-base">edit_calendar</span>
            Manual Timesheet Correction
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('AUDIT_LOG')}
            className={`py-3 px-4 font-bold text-xs uppercase border-b-2 tracking-wider flex items-center gap-2 transition-all ${
              activeTab === 'AUDIT_LOG'
                ? 'border-[#d51f2c] text-[#d51f2c] bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <span className="material-symbols-outlined text-base">history</span>
            Audit Trail ({record.auditLogs?.length || 0})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {activeTab === 'EDIT' ? (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Scheduled Window Reference */}
              <div className="bg-[#f1ece4] border border-[#e8e2d8] p-4 rounded text-xs flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    Assigned Scheduled Window
                  </p>
                  <p className="font-mono font-bold text-[#222222]">
                    {record.scheduledWindow
                      ? `${record.scheduledWindow.startTime} - ${record.scheduledWindow.endTime} (${record.scheduledWindow.scheduledHours} hrs)`
                      : 'Unscheduled Shift'}
                  </p>
                </div>
                <div>
                  {renderStatusBadge(previewCalculation.status, previewCalculation.varianceLabel)}
                </div>
              </div>

              {errorMessage && (
                <div className="bg-rose-50 border-l-4 border-rose-600 p-3 rounded text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-rose-600">error</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Time Punch Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Clock-In Time
                  </label>
                  <input
                    type="text"
                    value={clockIn}
                    onChange={(e) => setClockIn(e.target.value)}
                    placeholder="e.g. 09:00 AM"
                    className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-[#d51f2c]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Format: hh:mm AM/PM</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Clock-Out Time
                  </label>
                  <input
                    type="text"
                    value={clockOut}
                    onChange={(e) => setClockOut(e.target.value)}
                    placeholder="e.g. 05:00 PM"
                    className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-[#d51f2c]"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty if missed punch</p>
                </div>
              </div>

              {/* Unpaid Break Duration */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Unpaid Break Duration (Minutes)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="480"
                    value={unpaidBreakMinutes}
                    onChange={(e) => setUnpaidBreakMinutes(parseInt(e.target.value) || 0)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-[#d51f2c]"
                  />
                  <div className="flex gap-2">
                    {[0, 15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setUnpaidBreakMinutes(mins)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors ${
                          unpaidBreakMinutes === mins
                            ? 'bg-[#222222] text-white border-[#222222]'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic Live Net Hours Calculation Preview Card */}
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded space-y-2">
                <div className="flex justify-between items-center text-xs text-emerald-900 font-bold uppercase">
                  <span>Net Payable Hours Calculation Formula</span>
                  <span className="material-symbols-outlined text-base">functions</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center border-t border-emerald-200/60 pt-2 font-mono">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Raw Elapsed</span>
                    <span className="text-sm font-bold text-gray-800">
                      {previewCalculation.rawWorkedHours} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block">Unpaid Break</span>
                    <span className="text-sm font-bold text-amber-700">
                      -{unpaidBreakMinutes} mins
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block">Net Payable</span>
                    <span className="text-base font-black text-emerald-700">
                      {previewCalculation.netPayableHours} hrs
                    </span>
                  </div>
                </div>
              </div>

              {/* Mandatory Edit Reason */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Mandatory Audit Justification Note <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Employee forgot to clock out at shift end, manager verified shift hours via supervisor log."
                  className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#d51f2c]"
                ></textarea>
                <p className="text-[10px] text-gray-500 mt-1">
                  This note will be permanently bound to the immutable audit log along with your manager user ID and timestamp.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 font-bold text-xs uppercase text-gray-700 rounded hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#d51f2c] text-white font-bold text-xs uppercase rounded hover:bg-[#b01a24] transition-all shadow flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  Save Correction & Record Audit Log
                </button>
              </div>
            </form>
          ) : (
            /* Audit Log View */
            <div className="space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-700">
                Immutable Timesheet Revision Logs
              </h4>

              {(!record.auditLogs || record.auditLogs.length === 0) ? (
                <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded text-gray-500 text-xs italic">
                  No manual corrections recorded for this timesheet entry.
                </div>
              ) : (
                record.auditLogs.map((log) => (
                  <div key={log.id} className="bg-gray-50 border border-gray-200 p-4 rounded space-y-2 text-xs">
                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                      <span className="font-bold text-[#222222]">{log.modifiedByUserName}</span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 font-mono text-[11px] pt-1">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase block">Previous State</span>
                        <p className="text-gray-700">In: {log.originalClockIn || 'N/A'}</p>
                        <p className="text-gray-700">Out: {log.originalClockOut || 'N/A'}</p>
                        <p className="text-gray-700">Break: {log.originalUnpaidBreakMinutes}m</p>
                      </div>

                      <div>
                        <span className="text-[10px] text-emerald-600 uppercase font-bold block">Corrected State</span>
                        <p className="font-bold text-emerald-800">In: {log.updatedClockIn || 'N/A'}</p>
                        <p className="font-bold text-emerald-800">Out: {log.updatedClockOut || 'N/A'}</p>
                        <p className="font-bold text-emerald-800">Break: {log.updatedUnpaidBreakMinutes}m</p>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-2 rounded mt-2">
                      <span className="text-[9px] font-bold uppercase text-amber-900 block">Justification Note</span>
                      <p className="text-[11px] text-amber-800 italic">"{log.reason}"</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
